import {pathToFileURL} from 'node:url';
import {processQueue,sendGmail} from '../../server/gmail-queue.mjs';

const TEST_DATABASE='b2c275e3-70c6-4991-99e7-7032eb2c4577';
const email=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Controlli fail-closed: nessun valore di test è usato come valore predefinito.
export function validateProductionConfig(env, now=Math.floor(Date.now()/1000)) {
  if(env.PROD_NOTIFICATIONS_ENABLED!=='enabled') throw new Error('Notifiche di produzione non abilitate');
  const required=['PROD_D1_DATABASE_ID','PROD_NOTIFICATION_START_UNIX','PROD_CLOUDFLARE_ACCOUNT_ID',
    'PROD_CLOUDFLARE_API_TOKEN','PROD_GMAIL_CLIENT_ID','PROD_GMAIL_CLIENT_SECRET','PROD_GMAIL_REFRESH_TOKEN',
    'PROD_RECIPIENT_SCHOOL','PROD_RECIPIENT_TOWN'];
  for(const key of required) if(typeof env[key]!=='string' || !env[key].trim()) throw new Error(`Configurazione mancante: ${key}`);
  const database=env.PROD_D1_DATABASE_ID.toLowerCase();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(database) || database===TEST_DATABASE) throw new Error('Database di produzione non valido');
  if(!/^[0-9a-f]{32}$/i.test(env.PROD_CLOUDFLARE_ACCOUNT_ID)) throw new Error('Account Cloudflare non valido');
  if(!/^[1-9][0-9]*$/.test(env.PROD_NOTIFICATION_START_UNIX)) throw new Error('Data di attivazione non valida');
  const minimumCreatedAt=Number(env.PROD_NOTIFICATION_START_UNIX);
  if(!Number.isSafeInteger(minimumCreatedAt) || minimumCreatedAt>now) throw new Error('Data di attivazione non valida');
  const recipients={school:env.PROD_RECIPIENT_SCHOOL,town:env.PROD_RECIPIENT_TOWN};
  if(!email.test(recipients.school) || !email.test(recipients.town) || recipients.school.toLowerCase()===recipients.town.toLowerCase()) throw new Error('Destinatari di produzione non validi');
  return {database,minimumCreatedAt,recipients};
}

export async function runProduction(env=process.env,fetcher=fetch) {
  const config=validateProductionConfig(env);
  async function query(sql,params=[]) {
    const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.PROD_CLOUDFLARE_ACCOUNT_ID)}/d1/database/${config.database}/query`,{
      method:'POST',headers:{Authorization:`Bearer ${env.PROD_CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
    const body=await response.json();
    if(!response.ok || !body.success || !body.result?.[0]?.success) throw new Error('Operazione D1 non riuscita');
    return body.result[0].results || [];
  }
  async function getAccessToken() {
    const body=new URLSearchParams({client_id:env.PROD_GMAIL_CLIENT_ID,client_secret:env.PROD_GMAIL_CLIENT_SECRET,refresh_token:env.PROD_GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'});
    const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',body,signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error('Rinnovo Gmail non riuscito');
    const data=await response.json();if(!data.access_token) throw new Error('Risposta di autorizzazione incompleta');return data.access_token;
  }
  const result=await processQueue({query,getAccessToken,minimumCreatedAt:config.minimumCreatedAt,recipients:config.recipients,
    send:request=>sendGmail({...request,mode:'production'},fetcher)});
  console.log(`Gmail: accettati ${result.accepted}, da ritentare ${result.retry}, rifiutati ${result.failed}, incerti ${result.unknown}.`);
  if(result.failed || result.unknown || result.retry) process.exitCode=1;
  return result;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {await runProduction();}
  catch {console.error('Elaborazione produzione non riuscita: verificare autorizzazioni e coda. Nessuna credenziale è stata registrata.');process.exitCode=1;}
}
