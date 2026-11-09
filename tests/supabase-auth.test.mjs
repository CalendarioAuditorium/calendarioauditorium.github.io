import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyProviderPassword} from '../server/supabase-auth.mjs';
const base={url:'https://testproject.supabase.co',publicKey:'public-key-test',email:'TEST@example.com',password:'password-di-prova'};
test('invia la verifica solo al provider e conserva soltanto l’identificativo',async()=>{let request;const user=await verifyProviderPassword({...base,fetcher:async(url,options)=>{request={url,options};return new Response(JSON.stringify({user:{id:'12345678-1234-1234-1234-123456789abc'},access_token:'token-da-non-conservare'}),{status:200})}});assert.equal(request.url,'https://testproject.supabase.co/auth/v1/token?grant_type=password');assert.equal(JSON.parse(request.options.body).email,'test@example.com');assert.deepEqual(user,{providerUserId:'12345678-1234-1234-1234-123456789abc'});});
test('credenziali errate non producono una sessione',async()=>{assert.equal(await verifyProviderPassword({...base,fetcher:async()=>new Response('',{status:400})}),null)});
test('errore del provider è distinto da credenziali errate',async()=>{await assert.rejects(verifyProviderPassword({...base,fetcher:async()=>new Response('',{status:503})}),/non disponibile/)});
test('rifiuta destinazioni estranee prima di inviare la password',async()=>{let called=false;await assert.rejects(verifyProviderPassword({...base,url:'https://example.com',fetcher:async()=>{called=true}}));assert.equal(called,false)});
