import {checkNotificationHealth,describeQueueCounts,validateHealthConfig} from '../../server/notification-health.mjs';

const env=process.env;
const now=Math.floor(Date.now()/1000);
const accountId=env.PROD_CLOUDFLARE_ACCOUNT_ID;
const databaseId=env.PROD_D1_DATABASE_ID;
const startText=env.PROD_NOTIFICATION_START_UNIX || '';

async function query(sql,params) {
  const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${databaseId}/query`;
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${env.PROD_CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params})});
  if(!response.ok) throw new Error('D1 non disponibile');
  const body=await response.json();
  if(!body.success || !body.result?.[0]?.success || !Array.isArray(body.result[0].results)) throw new Error('Risposta D1 non valida');
  return body.result[0].results;
}

async function refresh() {
  const body=new URLSearchParams({client_id:env.PROD_GMAIL_CLIENT_ID,client_secret:env.PROD_GMAIL_CLIENT_SECRET,refresh_token:env.PROD_GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'});
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok) return false;
  const data=await response.json();
  return typeof data.access_token==='string' && data.access_token.length>0;
}

try {
  if(!/^[1-9]\d{0,11}$/.test(startText)) throw new Error('Data di attivazione mancante');
  const startUnix=Number(startText);
  validateHealthConfig({enabled:env.PROD_NOTIFICATIONS_ENABLED,databaseId,accountId,startUnix,now});
  for(const key of ['PROD_CLOUDFLARE_API_TOKEN','PROD_GMAIL_CLIENT_ID','PROD_GMAIL_CLIENT_SECRET','PROD_GMAIL_REFRESH_TOKEN']) if(!env[key]) throw new Error('Configurazione incompleta');
  const result=await checkNotificationHealth({query,refresh,startUnix,now,expirationDates:{cloudflare:env.PROD_CLOUDFLARE_TOKEN_EXPIRES_ON,githubDispatch:env.PROD_GITHUB_DISPATCH_TOKEN_EXPIRES_ON}});
  for(const line of describeQueueCounts(result.counts)) {
    if(result.counts===null) console.error(line); else console.log(line);
  }
  for(const [name,item] of Object.entries(result.expiry)) {
    if(item.state==='unconfigured') console.log(`Scadenza ${name}: non monitorata (data non configurata).`);
    else if(item.state==='no_expiration_declared') console.log(`Scadenza ${name}: nessuna scadenza dichiarata; verificare in caso di revoca.`);
    else if(item.state==='invalid') console.error(`Scadenza ${name}: data non valida.`);
    else console.log(`Scadenza ${name}: ${item.days} giorni (data dichiarata).`);
  }
  if(result.errors.length) console.error(`Controlli non riusciti: ${result.errors.join(', ')}.`);
  if(!result.healthy){console.error('Notifiche produzione: verifica necessaria.');process.exitCode=1;}
  else console.log('Notifiche produzione: controlli completati.');
} catch {
  console.error('Monitoraggio notifiche non riuscito: controllare configurazione e servizi.');
  process.exitCode=1;
}
