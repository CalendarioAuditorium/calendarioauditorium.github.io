import {planNotifications} from '../lib/notification-rules.mjs';

const names={school:'Scuola Mazzolari',town:'Comune di Verolanuova'};
const clock=minute=>minute===1440?'24:00':`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;

/** Prepara un messaggio per destinatario; non invia email né salva dati. */
export function notificationMessages({event,actor,existingEvents}){
  const plan=planNotifications({event,actor,existingEvents});
  if(typeof event.title!=='string' || !event.title.trim() || event.title.length>100)throw new TypeError('Titolo non valido');
  const other=actor==='school'?'town':'school';
  const lines=[`${names[actor]} ha inserito un evento nel calendario Auditorium.`,
    `Evento: ${event.title.trim()}`,`Data: ${event.date}`,`Orario: ${clock(event.startMinute)}–${clock(event.endMinute)}`];
  if(plan.reasons.includes('overlap'))lines.push('Attenzione: questo evento si sovrappone a un altro evento. Contattatevi per concordare gli orari.');
  if(plan.reasons.includes('other_slot'))lines.push(`L’evento interessa la fascia indicativa di ${names[other]}.`);
  if(plan.reasons.includes('new_event'))lines.push('Questa è una comunicazione informativa.');
  return plan.recipients.map(recipient=>({recipient,subject:'Calendario Auditorium: nuovo evento',text:lines.join('\n')}));
}
