import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {processQueue,sendGmail,makeMessage,TEST_TITLE} from '../server/gmail-queue.mjs';
import {planNotifications} from '../lib/notification-rules.mjs';
import {validateProductionConfig,runProduction} from '../.github/scripts/process-gmail-queue-production.mjs';

function database(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('migrations/0001_events.sql','utf8'));db.exec(readFileSync('migrations/0005_notification_queue.sql','utf8'));
 const query=async(sql,args=[])=>db.prepare(sql).all(...args);
 const event=(id,owner='school',start=540,end=600,date='2098-01-01',title=TEST_TITLE)=>db.prepare('INSERT INTO events(id,title,owner,event_date,start_minute,end_minute,created_by) VALUES (?,?,?,?,?,?,?)').run(id,title,owner,date,start,end,'test');
 return {db,query,event};
}
const recipients={school:'test-school@example.com',town:'test-town@example.com'};
const options=(query,send,now=()=>2000000000)=>({query,send,getAccessToken:async()=> 'token',recipients,minimumCreatedAt:1,now});
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
test('elaboratori concorrenti non inviano due volte e trattano qualsiasi nuovo titolo e data',async()=>{
 const {db,event,query}=database();event('real','school',400,500,'2098-01-01','Evento senza marcatura');event('date','school',400,500,'2026-11-16');event('test');
 let calls=0;const send=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {kind:'accepted',id:'gmail-id'}};
 await Promise.all([processQueue(options(query,send)),processQueue(options(query,send))]);
 assert.equal(calls,3);
 for(const id of ['test','real','date']) assert.equal(db.prepare('SELECT status FROM notification_queue WHERE event_id=?').get(id).status,'accepted');
});
test('gli eventi anteriori all’attivazione restano in coda, i nuovi vengono inviati',async()=>{
 const {db,event,query}=database();event('old','school',540,600,'2026-11-16','Vecchia prova');event('new','town',840,900,'2026-11-16','Spettacolo di prova');
 db.prepare("UPDATE notification_queue SET created_at=100 WHERE event_id='old'").run();
 const seen=[];const o=options(query,async message=>{seen.push(message.item);return {kind:'accepted',id:'ok'}});o.minimumCreatedAt=100;
 await processQueue(o);assert.equal(seen.length,1);assert.equal(seen[0].title,'Spettacolo di prova');
 assert.equal(db.prepare("SELECT status FROM notification_queue WHERE event_id='old'").get().status,'pending');
 const raw=Buffer.from(makeMessage('test@example.com',seen[0]),'base64url').toString();
 assert.match(Buffer.from(raw.split('\r\n\r\n')[1],'base64').toString(),/Spettacolo di prova/);
});
test('rifiuta una data di attivazione mancante prima di accedere al database',async()=>{
 const {query}=database();const o=options(query,async()=>{});o.minimumCreatedAt=undefined;
 await assert.rejects(processQueue(o));
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

const productionConfig=()=>({PROD_NOTIFICATIONS_ENABLED:'enabled',PROD_D1_DATABASE_ID:'8f0f179d-d655-4f1a-8c63-f9db60d43b72',
 PROD_NOTIFICATION_START_UNIX:'1800000000',PROD_CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),PROD_CLOUDFLARE_API_TOKEN:'cf-token',
 PROD_GMAIL_CLIENT_ID:'id',PROD_GMAIL_CLIENT_SECRET:'secret',PROD_GMAIL_REFRESH_TOKEN:'refresh',
 PROD_RECIPIENT_SCHOOL:'scuola@example.com',PROD_RECIPIENT_TOWN:'comune@example.com'});
test('produzione non usa i valori di prova e non accetta configurazioni parziali o database di test',()=>{
 const env=productionConfig();
 assert.equal(validateProductionConfig(env,1800000001).database,env.PROD_D1_DATABASE_ID);
 assert.throws(()=>validateProductionConfig({...env,PROD_NOTIFICATIONS_ENABLED:''},1800000001));
 assert.throws(()=>validateProductionConfig({...env,PROD_D1_DATABASE_ID:'b2c275e3-70c6-4991-99e7-7032eb2c4577'},1800000001));
 assert.throws(()=>validateProductionConfig({...env,PROD_NOTIFICATION_START_UNIX:''},1800000001));
 assert.throws(()=>validateProductionConfig({...env,PROD_NOTIFICATION_START_UNIX:'1800000002'},1800000001));
 assert.throws(()=>validateProductionConfig({...env,PROD_RECIPIENT_TOWN:env.PROD_RECIPIENT_SCHOOL},1800000001));
});
test('produzione e prova hanno contenuti distinguibili senza cambiare le regole',async()=>{
 const item={owner:'school',title:'Evento',event_date:'2027-01-01',start_minute:830,end_minute:900,overlap:1,other_slot:1};
 const decode=mode=>{const mime=Buffer.from(makeMessage('test@example.com',item,{mode}),'base64url').toString();
  return {subject:Buffer.from(mime.match(/Subject: =\?UTF-8\?B\?([^?]+)/)[1],'base64').toString(),body:Buffer.from(mime.split('\r\n\r\n')[1],'base64').toString()}};
 const testMessage=decode('test'),prodMessage=decode('production');
 assert.match(testMessage.subject,/\[TEST\]/);assert.match(testMessage.body,/MESSAGGIO DI PROVA/);
 assert.doesNotMatch(prodMessage.subject,/\[TEST\]/);assert.doesNotMatch(prodMessage.body,/MESSAGGIO DI PROVA/);
 assert.match(prodMessage.body,/sovrappone/);assert.match(prodMessage.body,/fascia indicativa/);
 assert.throws(()=>decode('invalid'));
});
test('la coda di produzione usa solo il database configurato e si ferma prima della rete se non abilitata',async()=>{
 const env=productionConfig(),calls=[];env.PROD_NOTIFICATION_START_UNIX='1';
 const mock=async(url)=>{calls.push(url);if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'temporary'});
  if(String(url).includes('/d1/database/'))return Response.json({success:true,result:[{success:true,results:[]}]});
  throw Error('URL inatteso')};
 const result=await runProduction(env,mock);assert.equal(result.accepted,0);
 assert.ok(calls.some(url=>String(url).includes(env.PROD_D1_DATABASE_ID)));
 assert.ok(calls.every(url=>!String(url).includes('b2c275e3-70c6-4991-99e7-7032eb2c4577')));
 calls.length=0;await assert.rejects(runProduction({...env,PROD_NOTIFICATIONS_ENABLED:''},mock));assert.equal(calls.length,0);
});
test('un evento di produzione nella fascia altrui produce due email con contenuti di produzione',async()=>{
 const {db,event}=database();event('evento','school',830,900,'2027-01-01','Prova fittizia');
 const env=productionConfig();env.PROD_NOTIFICATION_START_UNIX='1';const messages=[];
 const mock=async(url,options)=>{
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'temporary'});
  if(String(url).includes('/d1/database/')){const {sql,params}=JSON.parse(options.body);return Response.json({success:true,result:[{success:true,results:db.prepare(sql).all(...params)}]});}
  if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'){
   const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();messages.push(mime);return Response.json({id:'accepted-'+messages.length});
  }
  throw Error('URL inatteso');
 };
 const result=await runProduction(env,mock);assert.equal(result.accepted,2);assert.equal(messages.length,2);
 assert.deepEqual(messages.map(m=>m.match(/^To: (.+)$/m)[1].trim()).sort(),[env.PROD_RECIPIENT_SCHOOL,env.PROD_RECIPIENT_TOWN].sort());
 for(const mime of messages){const subject=Buffer.from(mime.match(/Subject: =\?UTF-8\?B\?([^?]+)/)[1],'base64').toString();assert.doesNotMatch(subject,/\[TEST\]/);}
});
