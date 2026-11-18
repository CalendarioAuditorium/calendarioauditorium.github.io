import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {checkNotificationHealth} from '../server/notification-health.mjs';

function database(withReviews=true){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE notification_queue (id INTEGER PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL, created_at INTEGER NOT NULL, available_at INTEGER NOT NULL, lease_until INTEGER)');
  if(withReviews)db.exec(readFileSync('migrations/0006_notification_reviews.sql','utf8'));
  const query=async(sql,params)=>db.prepare(sql).all(...params);
  const health=()=>checkNotificationHealth({query,refresh:async()=>true,startUnix:1,now:2000000000});
  return {db,health};
}

test('la revisione umana chiude e riapre gli avvisi senza modificare lo stato originale',async()=>{
  const {db,health}=database();
  db.prepare("INSERT INTO notification_queue VALUES(1,'unknown',1,100,100,NULL)").run();
  assert.equal((await health()).healthy,false);
  const review=db.prepare('INSERT INTO notification_reviews(notification_id,observed_status,observed_attempts,decision) VALUES(?,?,?,?)');
  review.run(1,'unknown',1,'no_resend');
  assert.equal((await health()).healthy,true);
  assert.equal(db.prepare('SELECT status FROM notification_queue WHERE id=1').get().status,'unknown');
  review.run(1,'unknown',1,'reopen');
  assert.equal((await health()).healthy,false);
  review.run(1,'unknown',1,'delivery_confirmed');
  assert.equal((await health()).healthy,true);
  assert.equal(db.prepare('SELECT status FROM notification_queue WHERE id=1').get().status,'unknown');
  assert.throws(()=>db.prepare('UPDATE notification_reviews SET decision=? WHERE id=1').run('reopen'));
  assert.throws(()=>db.prepare('DELETE FROM notification_reviews WHERE id=1').run());
});

test('una vecchia revisione non nasconde un tentativo successivo e non può essere registrata fuori tempo',async()=>{
  const {db,health}=database();
  db.prepare("INSERT INTO notification_queue VALUES(1,'failed',1,100,100,NULL)").run();
  const review=db.prepare('INSERT INTO notification_reviews(notification_id,observed_status,observed_attempts,decision) VALUES(?,?,?,?)');
  review.run(1,'failed',1,'no_resend');assert.equal((await health()).healthy,true);
  db.prepare('UPDATE notification_queue SET attempts=2 WHERE id=1').run();
  assert.equal((await health()).healthy,false);
  assert.throws(()=>review.run(1,'failed',1,'delivery_confirmed'));
  assert.throws(()=>review.run(2,'unknown',1,'no_resend'));
  review.run(1,'failed',2,'no_resend');assert.equal((await health()).healthy,true);
});

test('la tabella delle revisioni mancante segnala errore invece di dichiarare la coda sana',async()=>{
  const {health}=database(false);const result=await health();
  assert.equal(result.healthy,false);assert.equal(result.counts,null);assert.ok(result.errors.includes('d1_unavailable'));
});
