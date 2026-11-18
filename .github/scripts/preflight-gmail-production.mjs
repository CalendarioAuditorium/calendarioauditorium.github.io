import {pathToFileURL} from 'node:url';

const testDatabase='b2c275e3-70c6-4991-99e7-7032eb2c4577';
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Verifica di sola lettura: non invia email e non modifica D1.
export async function preflight(env=process.env,fetcher=fetch) {
  const result={configuration:false,recipients:false,activation:false,database:false,queue:false,gmail:false};
  const required=['PROD_CLOUDFLARE_ACCOUNT_ID','PROD_CLOUDFLARE_API_TOKEN','PROD_D1_DATABASE_ID',
    'PROD_GMAIL_CLIENT_ID','PROD_GMAIL_CLIENT_SECRET','PROD_GMAIL_REFRESH_TOKEN',
    'PROD_RECIPIENT_SCHOOL','PROD_RECIPIENT_TOWN'];
  const present=required.every(key=>typeof env[key]==='string' && env[key].trim());
  const database=env.PROD_D1_DATABASE_ID?.toLowerCase();
  const validDatabase=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(database || '') && database!==testDatabase;
  result.configuration=!!present && /^[0-9a-f]{32}$/i.test(env.PROD_CLOUDFLARE_ACCOUNT_ID || '') && validDatabase;
  const school=env.PROD_RECIPIENT_SCHOOL?.trim(),town=env.PROD_RECIPIENT_TOWN?.trim();
  result.recipients=!!school && !!town && email.test(school) && email.test(town) && school.toLowerCase()!==town.toLowerCase();
  const start=env.PROD_NOTIFICATION_START_UNIX || '';
  result.activation=/^[1-9][0-9]*$/.test(start) && Number.isSafeInteger(Number(start)) &&
    Number(start)<=Math.floor(Date.now()/1000) && start===env.PREFLIGHT_EXPECTED_START_UNIX &&
    env.PROD_GITHUB_DISPATCH_TOKEN_EXPIRES_ON==='none';
  if(!result.configuration)return result;

  const requestDatabase=async()=>{
    const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.PROD_CLOUDFLARE_ACCOUNT_ID)}/d1/database/${database}/query`;
    const response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{Authorization:`Bearer ${env.PROD_CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify({sql:"SELECT type, name FROM sqlite_schema WHERE (type='table' AND name IN ('events','notification_queue','notification_reviews')) OR (type='trigger' AND name='enqueue_event_notifications')"})});
    if(!response.ok)return;
    const body=await response.json();
    if(!body.success || !body.result?.[0]?.success || !Array.isArray(body.result[0].results))return;
    result.database=true;
    const names=new Set(body.result[0].results.map(item=>`${item.type}:${item.name}`));
    result.queue=['table:events','table:notification_queue','table:notification_reviews','trigger:enqueue_event_notifications'].every(name=>names.has(name));
  };
  const requestGmail=async()=>{
    const body=new URLSearchParams({client_id:env.PROD_GMAIL_CLIENT_ID,client_secret:env.PROD_GMAIL_CLIENT_SECRET,refresh_token:env.PROD_GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'});
    const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),body});
    if(!response.ok)return;
    const token=await response.json();result.gmail=typeof token.access_token==='string' && token.access_token.length>0;
  };
  await Promise.allSettled([requestDatabase(),requestGmail()]);
  return result;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const checks=await preflight();
    for(const [name,ok] of Object.entries(checks)) console.log(`${name}: ${ok?'ok':'verifica necessaria'}`);
    if(Object.values(checks).some(ok=>!ok))process.exitCode=1;
  } catch {
    console.error('Controllo non riuscito: verificare configurazione e servizi.');process.exitCode=1;
  }
}
