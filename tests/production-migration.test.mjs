import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

test('le migrazioni aggiungono login e coda alla struttura eventi esistente senza sostituirla',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync('migrations/0001_events.sql','utf8'));
  const before=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'").get().sql;
  for(const file of ['0003_login_limits.sql','0004_managed_identity.sql','0005_notification_queue.sql']) db.exec(readFileSync(`migrations/${file}`,'utf8'));
  assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'").get().sql,before);
  db.prepare("INSERT INTO events(id,title,owner,event_date,start_minute,end_minute,created_by) VALUES(?,?,?,?,?,?,?)").run('sample','Evento fittizio','school','2098-01-01',840,900,'test');
  const rows=db.prepare("SELECT recipient,overlap,other_slot FROM notification_queue WHERE event_id='sample' ORDER BY recipient").all().map(row=>({...row}));
  assert.deepEqual(rows,[{recipient:'school',overlap:0,other_slot:1},{recipient:'town',overlap:0,other_slot:1}]);
  db.close();
});
