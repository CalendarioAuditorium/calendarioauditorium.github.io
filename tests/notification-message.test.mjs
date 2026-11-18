import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationMessages} from '../server/notification-message.mjs';
const event={id:'new',owner:'school',title:'Prova fittizia',date:'2098-01-04',startMinute:830,endMinute:900};
test('unisce sovrapposizione e fascia altrui in un messaggio per ente',()=>{
 const messages=notificationMessages({event,actor:'school',existingEvents:[{id:'other',date:event.date,startMinute:840,endMinute:900}]});
 assert.deepEqual(messages.map(x=>x.recipient),['school','town']);
 for(const item of messages){assert.match(item.text,/Scuola Mazzolari/);assert.match(item.text,/Comune di Verolanuova/);assert.match(item.text,/si sovrappone/);assert.match(item.text,/fascia indicativa/);assert.match(item.text,/13:50–15:00/)}
});
test('evento senza sovrapposizioni nella propria fascia informa solo la controparte',()=>{
 const messages=notificationMessages({event:{...event,startMinute:600,endMinute:660},actor:'school',existingEvents:[{id:'other',date:event.date,startMinute:660,endMinute:700}]});
 assert.equal(messages.length,1);assert.equal(messages[0].recipient,'town');assert.match(messages[0].text,/informativa/);assert.doesNotMatch(messages[0].text,/si sovrappone/);
});
