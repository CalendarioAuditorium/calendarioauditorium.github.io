import {processQueue,sendGmail} from '../../server/gmail-queue.mjs';

// Identificativo fissato al solo database di anteprima, non modificabile via secrets.
const database='b2c275e3-70c6-4991-99e7-7032eb2c4577';
// Le righe anteriori all'attivazione non vengono inviate retroattivamente.
const minimumCreatedAt=1794901635;
const env=process.env;
for(const key of ['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','TEST_RECIPIENT_SCHOOL','TEST_RECIPIENT_TOWN']) {
  if(!env[key]) throw new Error(`Configurazione mancante: ${key}`);
}
if(env.NOTIFICATION_TEST_MODE!=='enabled') throw new Error('Modalità di prova non abilitata');
async function query(sql,params=[]) {
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/d1/database/${database}/query`,{
    method:'POST',headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
  const body=await response.json();
  if(!response.ok || !body.success || !body.result?.[0]?.success) throw new Error('Operazione D1 non riuscita');
  return body.result[0].results || [];
}
async function getAccessToken() {
  const body=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'});
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body,signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error('Rinnovo Gmail non riuscito: verifica autorizzazione e scadenza');
  const data=await response.json();if(!data.access_token) throw new Error('Risposta di autorizzazione incompleta');return data.access_token;
}
try {
  const oldPending=await query("SELECT count(*) AS count FROM notification_queue WHERE status='pending' AND created_at<=?",[minimumCreatedAt]);
  const result=await processQueue({query,getAccessToken,send:sendGmail,minimumCreatedAt,recipients:{school:env.TEST_RECIPIENT_SCHOOL,town:env.TEST_RECIPIENT_TOWN}});
  console.log(`Notifiche precedenti all'attivazione lasciate in attesa: ${oldPending[0]?.count ?? 0}.`);
  console.log(`Gmail: accettati ${result.accepted}, da ritentare ${result.retry}, rifiutati ${result.failed}, incerti ${result.unknown}. Verificare le caselle.`);
  if(result.failed || result.unknown) process.exitCode=1;
} catch {console.error('Elaborazione non riuscita. Controllare configurazione e stato della coda; nessuna credenziale è stata registrata.');process.exitCode=1;}
