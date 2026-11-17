// Le richieste non contengono dati degli eventi: il workflow legge la propria coda D1.
const endpointBase='https://api.github.com/repos/CalendarioAuditorium/calendarioauditorium.github.io/actions/workflows/';
const previewSuffix='.calendarioauditorium-github-io.pages.dev';

export function shouldDispatchTestQueue(request,response,token) {
  const url=new URL(request.url),host=url.hostname.toLowerCase();
  return url.protocol==='https:' && request.method==='POST' && response.status===201 && host.endsWith(previewSuffix) && Boolean(token);
}

export function shouldDispatchProductionQueue(request,response,env) {
  const url=new URL(request.url),host=url.hostname.toLowerCase();
  if (env?.NOTIFICATION_ENVIRONMENT!=='production' || !env.GITHUB_PRODUCTION_DISPATCH_TOKEN ||
      url.protocol!=='https:' || request.method!=='POST' || response.status!==201 || host.endsWith(previewSuffix)) return false;
  if (typeof env.NOTIFICATION_PRODUCTION_HOSTS!=='string') return false;
  const hosts=env.NOTIFICATION_PRODUCTION_HOSTS.split(',').map(v=>v.trim().toLowerCase());
  const validHost=/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/;
  return hosts.length>0 && hosts.every(v=>v.length<=253 && validHost.test(v) && !v.endsWith(previewSuffix)) && hosts.includes(host);
}

async function dispatchQueue(token,workflow,ref,fetcher) {
  try {
    const response=await fetcher(`${endpointBase}${workflow}/dispatches`,{
      method:'POST',
      headers:{'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'calendario-auditorium'},
      body:JSON.stringify({ref}),signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) console.error(`Avvio notifiche non riuscito (HTTP ${response.status}); la coda rimane in attesa.`);
    return response.ok;
  } catch {
    console.error('Avvio notifiche non riuscito; la coda rimane in attesa.');
    return false;
  }
}

export async function dispatchTestQueue(token,fetcher=fetch) {
  return dispatchQueue(token,'gmail-queue-test.yml','calendario-condiviso-test',fetcher);
}

export async function dispatchProductionQueue(token,fetcher=fetch) {
  return dispatchQueue(token,'gmail-queue-production.yml','main',fetcher);
}
