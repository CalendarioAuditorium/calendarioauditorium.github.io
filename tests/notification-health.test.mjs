import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {assessExpiry,checkNotificationHealth,describeQueueCounts,validateHealthConfig,TEST_D1_DATABASE_ID} from '../server/notification-health.mjs';

const now=2000000000,startUnix=1000;
function database(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE notification_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, created_at INTEGER, available_at INTEGER, lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 1)');
  db.exec(readFileSync('migrations/0006_notification_reviews.sql','utf8'));
  const insert=(status,created,available,lease=null)=>db.prepare('INSERT INTO notification_queue(status,created_at,available_at,lease_until) VALUES(?,?,?,?)').run(status,created,available,lease);
  return {insert,query:async(sql,params)=>db.prepare(sql).all(...params)};
}
const options=query=>({query,refresh:async()=>true,startUnix,now});

test('il monitor esclude il database di test e configurazioni non attive o non valide',()=>{
  const good={enabled:'enabled',databaseId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',accountId:'a'.repeat(32),startUnix,now};
  assert.doesNotThrow(()=>validateHealthConfig(good));
  for(const data of [{...good,enabled:'disabled'},{...good,databaseId:TEST_D1_DATABASE_ID.toUpperCase()},{...good,databaseId:'bad'},{...good,accountId:'bad'},{...good,startUnix:now}]) assert.throws(()=>validateHealthConfig(data));
});

test('non segnala lavoro normale, ritentativi non ancora scaduti o righe precedenti',async()=>{
  const {insert,query}=database();
  insert('pending',now-200,now-100);insert('pending',now-9000,now+60);
  insert('claimed',now-200,now-100,now+120);insert('sending',now-200,now-100,now-100);
  insert('unknown',startUnix,1);insert('accepted',now-200,now-100);
  const result=await checkNotificationHealth(options(query));
  assert.equal(result.healthy,true);assert.deepEqual(result.counts,{});
  assert.ok(describeQueueCounts(result.counts).every(line=>line.endsWith(': 0')));
  assert.equal(result.expiry.cloudflare.state,'unconfigured');
});

test('segnala guasti persistenti, attese fuori soglia e prenotazioni abbandonate',async()=>{
  const {insert,query}=database();
  insert('failed',now-1,now-1);insert('unknown',now-1,now-1);
  insert('pending',now-9000,now-7201);insert('claimed',now-1000,now-1000,now-301);
  insert('sending',now-1000,now-1000,null);
  const result=await checkNotificationHealth(options(query));
  assert.equal(result.healthy,false);
  assert.deepEqual(result.counts,{claimed:1,failed:1,pending:1,sending:1,unknown:1});
});

test('se D1 o rinnovo Google falliscono il controllo non riporta salute',async()=>{
  let result=await checkNotificationHealth({...options(async()=>{throw Error('private')}),refresh:async()=>true});
  assert.equal(result.healthy,false);assert.equal(result.counts,null);assert.deepEqual(result.errors,['d1_unavailable']);
  assert.deepEqual(describeQueueCounts(result.counts),['Coda: stato non disponibile.']);
  result=await checkNotificationHealth({...options(async()=>[]),refresh:async()=>false});
  assert.equal(result.healthy,false);assert.deepEqual(result.errors,['gmail_refresh_failed']);
  result=await checkNotificationHealth({...options(async()=>[{status:'accepted',total:1}])});
  assert.equal(result.healthy,false);assert.equal(result.counts,null);assert.deepEqual(result.errors,['d1_invalid_result']);
  assert.deepEqual(describeQueueCounts(result.counts),['Coda: stato non disponibile.']);
});

test('controlla le date dichiarate senza attribuire loro una verifica automatica',async()=>{
  const at=Date.parse('2026-11-17T12:00:00Z')/1000;
  assert.deepEqual(assessExpiry(undefined,at),{state:'unconfigured'});
  assert.deepEqual(assessExpiry('none',at),{state:'no_expiration_declared'});
  assert.equal(assessExpiry('2026-02-30',at).state,'invalid');
  assert.equal(assessExpiry('2026-11-24',at).state,'attention');
  assert.equal(assessExpiry('2026-12-24',at).state,'ok');
  const result=await checkNotificationHealth({query:async()=>[],refresh:async()=>true,startUnix:1,now:at,expirationDates:{cloudflare:'2026-11-24',githubDispatch:'2026-12-24'}});
  assert.equal(result.healthy,false);assert.deepEqual(result.errors,['cloudflare_expiry_attention']);
});
