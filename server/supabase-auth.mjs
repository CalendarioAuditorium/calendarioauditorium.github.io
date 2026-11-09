/** Adapter in preparazione: non collegato al sito né alle rotte pubbliche. */
function projectUrl(value){
  let url;try{url=new URL(value);}catch{throw new TypeError('Configurazione provider non valida');}
  if(url.protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.pathname!=='/' || url.search || url.hash)throw new TypeError('Configurazione provider non valida');
  return url.origin;
}

/** Verifica la password presso il provider; i token non vengono salvati o registrati. */
export async function verifyProviderPassword({url,publicKey,email,password,fetcher=fetch}){
  const origin=projectUrl(url);
  if(typeof publicKey!=='string' || !publicKey || typeof email!=='string' || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password!=='string' || !password || password.length>128)throw new TypeError('Dati non validi');
  const response=await fetcher(`${origin}/auth/v1/token?grant_type=password`,{
    method:'POST',headers:{'apikey':publicKey,'Content-Type':'application/json'},
    body:JSON.stringify({email:email.trim().toLowerCase(),password}),
    signal:AbortSignal.timeout(10000)
  });
  if(response.status===400 || response.status===401)return null;
  if(!response.ok)throw new Error('Provider di accesso non disponibile');
  const body=await response.json();
  if(typeof body?.user?.id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user.id))throw new Error('Risposta del provider non valida');
  return {providerUserId:body.user.id};
}
