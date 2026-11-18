import {test} from 'node:test';import assert from 'node:assert/strict';import {sendGraphMail} from '../server/graph-mail.mjs';
test('Graph accetta una singola email diretta senza confondere accettazione e consegna',async()=>{
 let request;const result=await sendGraphMail({accessToken:'token-fittizio',to:'town@example.com',subject:'Evento di prova',text:'Test fittizio',fetcher:async(url,options)=>{request={url,options};return new Response(null,{status:202})}});
 assert.deepEqual(result,{accepted:true});assert.equal(request.url,'https://graph.microsoft.com/v1.0/me/sendMail');
 const payload=JSON.parse(request.options.body);assert.equal(payload.message.toRecipients.length,1);assert.equal(payload.message.toRecipients[0].emailAddress.address,'town@example.com');assert.equal(payload.message.body.content,'Test fittizio');
});
test('un rifiuto o un errore non è segnalato come invio accettato',async()=>{
 await assert.rejects(sendGraphMail({accessToken:'test',to:'town@example.com',subject:'test',text:'test',fetcher:async()=>new Response('',{status:401})}),e=>e.status===401);
 await assert.rejects(sendGraphMail({accessToken:'test',to:'town@example.com',subject:'test',text:'test',fetcher:async()=>{throw new Error('timeout')}}),/timeout/);
});
