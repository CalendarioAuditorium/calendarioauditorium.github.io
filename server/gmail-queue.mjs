import {randomUUID} from 'node:crypto';

export const TEST_TITLE = '[TEST] Evento fittizio';
const MAX_ATTEMPTS = 5;
const leaseSeconds = 120;

export async function processQueue({query, getAccessToken, send, recipients, minimumCreatedAt, now = () => Math.floor(Date.now()/1000), limit = 20}) {
  if (!recipients || !['school','town'].every(k => /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipients[k] || '')) ||
      recipients.school.toLowerCase() === recipients.town.toLowerCase()) throw new Error('Servono due indirizzi di prova distinti e controllati');
  if (!Number.isSafeInteger(minimumCreatedAt) || minimumCreatedAt <= 0) throw new Error('Data di attivazione non valida');
  // Solo le prenotazioni non ancora in fase di invio possono essere riprese.
  await query("UPDATE notification_queue SET status='pending',claim_token=NULL,lease_until=NULL WHERE status='claimed' AND lease_until<? AND created_at>?", [now(),minimumCreatedAt]);
  const interrupted=await query("UPDATE notification_queue SET status='unknown',last_error='invio interrotto o risposta non registrata',claim_token=NULL,lease_until=NULL WHERE status='sending' AND lease_until<? AND created_at>? RETURNING id", [now(),minimumCreatedAt]);
  const token = await getAccessToken(); // Nessuna email è stata inviata se il rinnovo fallisce.
  const summary = {accepted:0, retry:0, failed:0, unknown:interrupted.length};
  for (let i=0;i<limit;i++) {
    const claim = randomUUID(), time = now();
    const rows = await query(`UPDATE notification_queue SET status='claimed',claim_token=?,lease_until=?,attempts=attempts+1
      WHERE id=(SELECT id FROM notification_queue WHERE status='pending' AND available_at<=? AND created_at>? ORDER BY id LIMIT 1)
      AND status='pending' RETURNING *`, [claim,time+leaseSeconds,time,minimumCreatedAt]);
    const item=rows[0]; if (!item) break;
    const transition=await query("UPDATE notification_queue SET status='sending',lease_until=? WHERE id=? AND status='claimed' AND claim_token=? RETURNING id", [now()+leaseSeconds,item.id,claim]);
    if (!transition.length) continue;
    let result;
    try { result=await send({accessToken:token, to:recipients[item.recipient], item}); }
    catch { result={kind:'unknown'}; }
    let status, error=null, available=now();
    if (result.kind==='accepted' && typeof result.id==='string' && result.id) status='accepted';
    else if (result.kind==='retry' && item.attempts<MAX_ATTEMPTS) {status='pending';error='rifiuto temporaneo Gmail';available+=Math.min(3600,60*2**(item.attempts-1));}
    else if (result.kind==='retry' || result.kind==='rejected') {status='failed';error='rifiuto Gmail; controllare la configurazione';}
    else {status='unknown';error='esito invio incerto';}
    const recorded=await query("UPDATE notification_queue SET status=?,available_at=?,gmail_id=?,last_error=?,claim_token=NULL,lease_until=NULL WHERE id=? AND status='sending' AND claim_token=? RETURNING id", [status,available,status==='accepted'?result.id:null,error,item.id,claim]);
    if (!recorded.length) {summary.unknown++; continue;}
    summary[status==='pending'?'retry':status]++;
  }
  return summary;
}

const clock=n=>n===1440?'24:00':`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function makeMessage(to,item,{mode='test'}={}) {
  if (!['test','production'].includes(mode)) throw new Error('Modalità email non valida');
  const names={school:'Scuola Mazzolari',town:'Comune di Verolanuova'};
  const lines=[...(mode==='test'?['MESSAGGIO DI PROVA: calendario di test.']:[]),`${names[item.owner]} ha inserito un evento nel calendario Auditorium.`,
    `Evento: ${item.title || (mode==='test'?TEST_TITLE:'Evento')}`,`Data: ${item.event_date}`,`Orario: ${clock(item.start_minute)}–${clock(item.end_minute)}`];
  if(item.overlap) lines.push('Attenzione: questo evento si sovrappone a un altro evento.');
  if(item.other_slot) lines.push(`L’evento interessa la fascia indicativa di ${names[item.owner==='school'?'town':'school']}.`);
  if(!item.overlap && !item.other_slot) lines.push('Questa è una comunicazione informativa.');
  const body=Buffer.from(lines.join('\r\n'),'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
  const subject=mode==='test'?'[TEST] Calendario Auditorium: nuovo evento':'Calendario Auditorium: nuovo evento';
  const mime=`To: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}\r\n`;
  return Buffer.from(mime).toString('base64url');
}

export async function sendGmail({accessToken,to,item,mode='test'}, fetcher=fetch) {
  const message=makeMessage(to,item,{mode});
  let response;
  try { response=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
    method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({raw:message}),signal:AbortSignal.timeout(30000)}); }
  catch {return {kind:'unknown'};}
  if (response.ok) {try {const data=await response.json();return data.id?{kind:'accepted',id:data.id}:{kind:'unknown'};} catch {return {kind:'unknown'};}}
  if (response.status===429) return {kind:'retry'};
  if ([400,401,403].includes(response.status)) return {kind:'rejected'};
  return {kind:'unknown'};
}
