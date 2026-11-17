// La richiesta non contiene dati dell'evento: il workflow legge solo la coda D1 di test.
const endpoint='https://api.github.com/repos/CalendarioAuditorium/calendarioauditorium.github.io/actions/workflows/gmail-queue-test.yml/dispatches';
const previewSuffix='.calendarioauditorium-github-io.pages.dev';

export function shouldDispatchTestQueue(request,response,token) {
  const host=new URL(request.url).hostname.toLowerCase();
  return request.method==='POST' && response.status===201 && host.endsWith(previewSuffix) && Boolean(token);
}

export async function dispatchTestQueue(token,fetcher=fetch) {
  try {
    const response=await fetcher(endpoint,{
      method:'POST',
      headers:{'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'calendario-auditorium-test'},
      body:JSON.stringify({ref:'calendario-condiviso-test'}),signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) console.error(`Avvio notifiche di test non riuscito (HTTP ${response.status}); la coda rimane in attesa.`);
    return response.ok;
  } catch {
    console.error('Avvio notifiche di test non riuscito; la coda rimane in attesa.');
    return false;
  }
}
