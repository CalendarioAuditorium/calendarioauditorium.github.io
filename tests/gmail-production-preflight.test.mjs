import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from '../.github/scripts/preflight-gmail-production.mjs';

const env={PROD_CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),PROD_CLOUDFLARE_API_TOKEN:'test',
  PROD_D1_DATABASE_ID:'330abfcd-929d-4d4b-811c-e0fbe51dbec3',PROD_GMAIL_CLIENT_ID:'test',
  PROD_GMAIL_CLIENT_SECRET:'test',PROD_GMAIL_REFRESH_TOKEN:'test',
  PROD_RECIPIENT_SCHOOL:'school@example.com',PROD_RECIPIENT_TOWN:'town@example.com'};
const objects=[['table','events'],['table','notification_queue'],['table','notification_reviews'],['trigger','enqueue_event_notifications']].map(([type,name])=>({type,name}));

test('verifica solo lo schema D1 e il rinnovo Gmail, senza inviare email',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push([url,options]);
    if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'temporary'});
    if(url.includes('/d1/database/'))return Response.json({success:true,result:[{success:true,results:objects}]});
    throw Error('destinazione inattesa');
  };
  assert.deepEqual(await preflight(env,fetcher),{configuration:true,recipients:true,database:true,queue:true,gmail:true});
  assert.equal(calls.length,2);
  const sql=JSON.parse(calls.find(([url])=>url.includes('/d1/database/'))[1].body).sql;
  assert.match(sql,/^SELECT /);assert.match(sql,/sqlite_schema/);
});

test('rifiuta il database di prova senza contattare alcun servizio',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('unexpected')};
  const result=await preflight({...env,PROD_D1_DATABASE_ID:'b2c275e3-70c6-4991-99e7-7032eb2c4577'},fetcher);
  assert.equal(result.configuration,false);assert.equal(calls,0);
});

test('segnala credenziali Gmail o struttura coda incomplete',async()=>{
  const fetcher=async(url)=>url==='https://oauth2.googleapis.com/token'
    ? new Response('',{status:401})
    : Response.json({success:true,result:[{success:true,results:objects.filter(x=>x.name!=='notification_reviews')}]});
  const result=await preflight({...env,PROD_RECIPIENT_TOWN:env.PROD_RECIPIENT_SCHOOL},fetcher);
  assert.deepEqual(result,{configuration:true,recipients:false,database:true,queue:false,gmail:false});
});
