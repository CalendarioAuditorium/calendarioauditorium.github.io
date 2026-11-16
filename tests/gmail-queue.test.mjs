import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {processQueue,sendGmail,makeMessage,TEST_TITLE} from '../server/gmail-queue.mjs';
import {planNotifications} from '../lib/notification-rules.mjs';

function database(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('migrations/0001_events.sql','utf8'));db.exec(readFileSync('migrations/0005_notification_queue.sql','utf8'));
 const query=async(sql,args=[])=>db.prepare(sql).all(...args);
 const event=(id,owner='school',start=540,end=600,date='2098-01-01',title=TEST_TITLE)=>db.prepare('INSERT INTO events(id,title,owner,event_date,start_minute,end_minute,created_by) VALUES (?,?,?,?,?,?,?)').run(id,title,owner,date,start,end,'test');
 return {db,query,event};
}
const recipients={school:'test-school@example.com',town:'test-town@example.com'};
const options=(query,send,now=()=>2000000000)=>({query,send,getAccessToken:async()=> 'token',recipients,now});
test('trigger accoda una sola comunicazione per ente e combina i motivi',()=>{
 const {db,event}=database();
 event('a','town',840,900);event('b','school',830,890);
 const rows=db.prepare('SELECT recipient,overlap,other_slot FROM notification_queue WHERE event_id=? ORDER BY recipient').all('b');
 assert.deepEqual(rows.map(x=>({...x})),[{recipient:'school',overlap:1,other_slot:1},{recipient:'town',overlap:1,other_slot:1}]);
});
test('fasce, giorni diversi e intervalli contigui producono i destinatari corretti',()=>{
 const {db,event}=database();
 event('a','school',540,600);event('b','town',600,700);event('c','school',700,800);event('d','school',540,600,'2098-01-02');
 const get=id=>db.prepare('SELECT recipient,overlap,other_slot FROM notification_queue WHERE event_id=? ORDER BY recipient').all(id).map(x=>({...x}));
 assert.deepEqual(get('a'),[{recipient:'town',overlap:0,other_slot:0}]);
 assert.deepEqual(get('b'),[{recipient:'school',overlap:0,other_slot:1},{recipient:'town',overlap:0,other_slot:1}]);
 assert.deepEqual(get('c'),[{recipient:'town',overlap:0,other_slot:0}]);
 assert.deepEqual(get('d'),[{recipient:'town',overlap:0,other_slot:0}]);
});
test('il trigger rispecchia le regole per entrambi gli enti e i confini orari',()=>{
 for(const owner of ['school','town']) for(const [start,end] of [[0,1],[500,600],[600,700],[830,840],[830,850],[840,900],[1439,1440]]){
  const {db,event}=database();event('existing','town',600,700);event('new',owner,start,end);
  const rows=db.prepare("SELECT recipient,overlap,other_slot FROM notification_queue WHERE event_id='new' ORDER BY recipient").all();
  const plan=planNotifications({event:{id:'new',owner,date:'2098-01-01',startMinute:start,endMinute:end},actor:owner,existingEvents:[{id:'existing',date:'2098-01-01',startMinute:600,endMinute:700}]});
  assert.deepEqual(rows.map(x=>x.recipient),[...plan.recipients].sort());
  for(const row of rows){assert.equal(Boolean(row.overlap),plan.reasons.includes('overlap'));assert.equal(Boolean(row.other_slot),plan.reasons.includes('other_slot'));}
 }
});
test('evento e coda vengono annullati insieme',()=>{
 const {db,event}=database();db.exec('BEGIN');event('a');db.exec('ROLLBACK');
 assert.equal(db.prepare('SELECT count(*) n FROM notification_queue').get().n,0);
});
test('elaboratori concorrenti non inviano due volte e ignorano titoli reali',async()=>{
 const {db,event,query}=database();event('real','school',400,500,'2098-01-01','Evento reale');event('date','school',400,500,'2026-11-16');event('test');
 let calls=0;const send=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {kind:'accepted',id:'gmail-id'}};
 await Promise.all([processQueue(options(query,send)),processQueue(options(query,send))]);
 assert.equal(calls,1);assert.equal(db.prepare("SELECT status FROM notification_queue WHERE event_id='test'").get().status,'accepted');
 assert.equal(db.prepare("SELECT status FROM notification_queue WHERE event_id='real'").get().status,'pending');
 assert.equal(db.prepare("SELECT status FROM notification_queue WHERE event_id='date'").get().status,'pending');
});
test('429 viene ritentato con ritardo; invio incerto non viene ritentato',async()=>{
 const {db,event,query}=database();event('a');let now=2000000000,calls=0;
 const send=async()=>{calls++;return calls===1?{kind:'retry'}:{kind:'unknown'}};
 assert.equal((await processQueue(options(query,send,()=>now))).retry,1);
 await processQueue(options(query,send,()=>now));assert.equal(calls,1);
 now+=60;assert.equal((await processQueue(options(query,send,()=>now))).unknown,1);
 now+=10000;await processQueue(options(query,send,()=>now));assert.equal(calls,2);
 assert.equal(db.prepare('SELECT status FROM notification_queue').get().status,'unknown');
});
test('recupera prenotazioni scadute ma segna incerto un invio interrotto',async()=>{
 const {db,event,query}=database();event('a');event('b','school',600,700);
 db.prepare("UPDATE notification_queue SET status='claimed',lease_until=1 WHERE event_id='a'").run();
 db.prepare("UPDATE notification_queue SET status='sending',lease_until=1 WHERE event_id='b'").run();
 let calls=0;await processQueue(options(query,async()=>{calls++;return {kind:'accepted',id:'ok'}}));
 assert.equal(calls,1);assert.equal(db.prepare("SELECT status FROM notification_queue WHERE event_id='b'").get().status,'unknown');
});
test('rifiuta destinatari uguali prima di inviare',async()=>{
 const {query}=database();const o=options(query,async()=>{});o.recipients={school:'a@example.com',town:'A@example.com'};
 await assert.rejects(processQueue(o));
});
test('rinnovo OAuth fallito lascia la coda in attesa senza inviare',async()=>{
 const {db,event,query}=database();event('a');let calls=0;const o=options(query,async()=>{calls++});
 o.getAccessToken=async()=>{throw new Error('invalid_grant')};
 await assert.rejects(processQueue(o));assert.equal(calls,0);assert.equal(db.prepare('SELECT status FROM notification_queue').get().status,'pending');
});
test('un rifiuto ripetuto termina dopo cinque tentativi',async()=>{
 const {db,event,query}=database();event('a');let time=2000000000;
 const send=async()=>({kind:'retry'});
 for(let i=0;i<5;i++){await processQueue(options(query,send,()=>time));time+=3600;}
 assert.equal(db.prepare('SELECT status FROM notification_queue').get().status,'failed');
});
test('Gmail: solo risposta valida è accettata; errori di rete e 5xx rimangono incerti',async()=>{
 const item={owner:'school',event_date:'2098-01-01',start_minute:840,end_minute:900,overlap:1,other_slot:1};
 const request={accessToken:'x',to:'test@example.com',item};
 assert.equal((await sendGmail(request,async()=>new Response(JSON.stringify({id:'ok'}),{status:200}))).kind,'accepted');
 assert.equal((await sendGmail(request,async()=>new Response('',{status:429}))).kind,'retry');
 assert.equal((await sendGmail(request,async()=>new Response('',{status:503}))).kind,'unknown');
 assert.equal((await sendGmail(request,async()=>{throw Error('timeout')})).kind,'unknown');
 const mime=Buffer.from(makeMessage('test@example.com',item),'base64url').toString();
 const body=Buffer.from(mime.split('\r\n\r\n')[1],'base64').toString();assert.match(body,/sovrappone/);assert.match(body,/fascia indicativa/);
});
