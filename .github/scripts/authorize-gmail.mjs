// Eseguire solo sul proprio PC: nessuna credenziale viene scritta su disco o sul terminale.
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';

async function main(){
  if(process.platform!=='win32' || !process.argv[2]) throw new Error('specificare su Windows il percorso del JSON desktop');
  const path=realpathSync(resolve(process.argv[2]));
  const root=realpathSync(process.cwd());
  if(path.toLowerCase().startsWith((root+sep).toLowerCase())) throw new Error('il JSON deve essere fuori dal repository');
  const client=JSON.parse(readFileSync(path,'utf8')).installed;
  if(!client?.client_id || !client?.client_secret) throw new Error('JSON desktop non valido');
  const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  let resolveCode;
  const codePromise=new Promise(resolve=>{resolveCode=resolve});
  const server=createServer((request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1');
    if(url.pathname!=='/callback' || url.searchParams.get('state')!==state){response.writeHead(400).end('Richiesta non valida.');return;}
    response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).end('Puoi chiudere questa pagina e tornare al terminale.');
    resolveCode(url.searchParams.get('code'));server.close();
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const redirect=`http://127.0.0.1:${server.address().port}/callback`;
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'});
  console.log('Si apre Google nel browser. Accedi con comverolanuovabs@gmail.com e autorizza l’invio Gmail.');
  const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url.toString()],{stdio:'ignore',windowsHide:true});
  browser.on('error',()=>{console.error('Impossibile aprire il browser.');server.close();resolveCode(null);});
  const timeout=setTimeout(()=>{server.close();resolveCode(null)},300000);
  const code=await codePromise;clearTimeout(timeout);
  if(!code) throw new Error('autorizzazione annullata o scaduta');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code,client_id:client.client_id,client_secret:client.client_secret,redirect_uri:redirect,grant_type:'authorization_code',code_verifier:verifier}),signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error('scambio OAuth non riuscito');
  const tokens=await response.json();
  if(!tokens.refresh_token || !tokens.scope?.split(' ').includes('https://www.googleapis.com/auth/gmail.send')) throw new Error('refresh token o permesso Gmail mancante');
  const rl=createInterface({input:stdin,output:stdout});
  try {
    console.log('Autorizzazione ottenuta. Apri GitHub > Settings > Environments > gmail-test > Environment secrets.');
    console.log('Crea i tre secret nell’ordine indicato: il valore viene copiato negli appunti soltanto quando premi Invio.');
    for(const [name,value] of [['GMAIL_CLIENT_ID',client.client_id],['GMAIL_CLIENT_SECRET',client.client_secret],['GMAIL_REFRESH_TOKEN',tokens.refresh_token]]) {
      await rl.question(`Premi Invio per copiare ${name}; incollalo nel corrispondente secret GitHub e salva prima di proseguire. `);
      const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','$input | Set-Clipboard'],{input:value,encoding:'utf8',windowsHide:true,stdio:['pipe','ignore','ignore']});
      if(result.status!==0) throw new Error('copia negli appunti non riuscita');
      console.log(`${name} copiato. Salva il secret in GitHub.`);
    }
    await rl.question('Dopo aver salvato anche l’ultimo secret, premi Invio per cancellare gli appunti. ');
  } finally {
    spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Set-Clipboard -Value ""'],{windowsHide:true,stdio:'ignore'});rl.close();
  }
  console.log('Operazione conclusa. Non condividere gli appunti o le credenziali in chat.');
}
main().catch(()=>{console.error('Autorizzazione non completata. Verifica il file desktop, la connessione e il consenso Google; nessuna credenziale è stata mostrata.');process.exitCode=1;});
