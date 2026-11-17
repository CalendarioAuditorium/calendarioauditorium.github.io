import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchTestQueue,shouldDispatchTestQueue} from '../server/notification-dispatch.mjs';

test('avvia solo dopo una creazione riuscita nell’anteprima, con segreto configurato',()=>{
  const url='https://b24ea501.calendarioauditorium-github-io.pages.dev/api/events';
  const req=method=>new Request(url,{method});
  assert.equal(shouldDispatchTestQueue(req('POST'),new Response('',{status:201}),'secret'),true);
  assert.equal(shouldDispatchTestQueue(req('POST'),new Response('',{status:403}),'secret'),false);
  assert.equal(shouldDispatchTestQueue(req('POST'),new Response('',{status:201}),''),false);
  assert.equal(shouldDispatchTestQueue(req('PUT'),new Response('',{status:201}),'secret'),false);
  assert.equal(shouldDispatchTestQueue(new Request('https://calendarioauditorium-github-io.pages.dev/api/events',{method:'POST'}),new Response('',{status:201}),'secret'),false);
});

test('richiede a GitHub di eseguire il ramo di test senza dati dell’evento',async()=>{
  let call;const result=await dispatchTestQueue('dummy-token',async(url,options)=>{call={url,options};return new Response(null,{status:204})});
  assert.equal(result,true);assert.match(call.url,/\/gmail-queue-test.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(call.options.body),{ref:'calendario-condiviso-test'});
});

test('un errore di GitHub non viene scambiato per successo',async()=>{
  const original=console.error;console.error=()=>{};
  try {
    assert.equal(await dispatchTestQueue('dummy',async()=>new Response('',{status:403})),false);
    assert.equal(await dispatchTestQueue('dummy',async()=>{throw new Error('network')}),false);
  } finally {console.error=original;}
});
