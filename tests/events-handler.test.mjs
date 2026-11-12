import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createManagedSession} from '../server/managed-identity.mjs';
import {handleEvents} from '../server/events-handler.mjs';
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0001_events.sql','utf8'));sqlite.exec(readFileSync('migrations/0004_managed_identity.sql','utf8'));sqlite.prepare('INSERT INTO managed_accounts(id,username,display_name,role,email,provider_user_id,must_change_password) VALUES (?,?,?,?,?,?,?)').run('user','utente','Utente','school','user@example.com','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',0);return {prepare(sql){let values=[];return {bind(...args){values=args;return this},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}},async all(){return {results:sqlite.prepare(sql).all(...values)}},async first(){return sqlite.prepare(sql).get(...values) || null}}}};}
test('accesso verificato, protezione origine e lettura dei dati condivisi',async()=>{const db=database(),session=await createManagedSession(db,{id:'user'}),url='https://calendar.example/api/events',cookie=`__Host-auditorium=${session.token}`;
assert.equal((await handleEvents(new Request(url),db)).status,401);
const data={title:'Evento',owner:'school',date:'2026-11-06',startMinute:540,endMinute:600};
const post=(origin)=>new Request(url,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
assert.equal((await handleEvents(post('https://outside.example'),db)).status,403);
assert.equal((await handleEvents(post('https://calendar.example'),db)).status,201);
const response=await handleEvents(new Request(url,{headers:{Cookie:cookie}}),db);assert.equal((await response.json()).events.length,1);
});

test('API rifiuta operazioni sugli eventi dell’altro ente',async()=>{const db=database(),session=await createManagedSession(db,{id:'user'}),url='https://calendar.example/api/events',cookie=`__Host-auditorium=${session.token}`,headers={Cookie:cookie,Origin:'https://calendar.example','Content-Type':'application/json'};const event={title:'Evento',owner:'school',date:'2026-11-06',startMinute:540,endMinute:600};const send=(method,data,id='')=>handleEvents(new Request(url+id,{method,headers,body:JSON.stringify(data)}),db);const own=await (await send('POST',event)).json();assert.equal((await send('POST',{...event,owner:'town'})).status,403);assert.equal((await send('PUT',{...event,owner:'town'},'?id='+own.event.id)).status,403);assert.equal((await handleEvents(new Request(url+'?id='+own.event.id,{method:'DELETE',headers}),db)).status,200);});
