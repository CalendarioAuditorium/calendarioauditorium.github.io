import {authenticate,createSession,getSession,revokeSession,changePassword,createUser} from './identity.mjs';

const cookieName='__Host-auditorium';
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const cookie=(value,maxAge)=>`${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
const getToken=request=>{const entries=(request.headers.get('Cookie')||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(`${cookieName}=`));return entries.length===1?entries[0].slice(cookieName.length+1):'';};
const hashed=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function increment(db,key,now){
  const hash=await hashed(key);
  return db.prepare(`INSERT INTO login_attempts(key_hash,window_start,attempts) VALUES (?,?,1)
    ON CONFLICT(key_hash) DO UPDATE SET
      attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END,
      window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END
    RETURNING attempts`).bind(hash,now,now-900,now-900,now).first();
}
async function body(request){
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))throw new TypeError('Formato non valido');
  const reader=request.body?.getReader();if(!reader)throw new TypeError('Richiesta vuota');let bytes=0,chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw new TypeError('Richiesta troppo grande')}chunks.push(value)}
  const data=new Uint8Array(bytes);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length}return JSON.parse(new TextDecoder().decode(data));
}

/** Logica in preparazione: non pubblicare senza configurazione, verifica Cloudflare e revisione. */
export async function handleAuth(request,db){
  try{
    const url=new URL(request.url),method=request.method,action=url.pathname.split('/').pop();
    if(method==='GET' && action==='session'){
      const user=await getSession(db,getToken(request));return user?json({user}):json({error:'Accesso richiesto'},401);
    }
    if(method==='GET' && action==='users'){
      const user=await getSession(db,getToken(request));if(!user)return json({error:'Accesso richiesto'},401);
      if(user.role!=='ced' || user.mustChangePassword)return json({error:'Accesso riservato al CED'},403);
      const result=await db.prepare('SELECT id,username,display_name AS displayName,role,disabled FROM users ORDER BY username').all();
      return json({users:result.results});
    }
    if(method!=='POST')return json({error:'Metodo non consentito'},405);
    if(request.headers.get('Origin')!==url.origin)return json({error:'Origine non consentita'},403);
    if(action==='login'){
      const ip=request.headers.get('CF-Connecting-IP');if(!ip || ip.length>64)return json({error:'Accesso temporaneamente non disponibile'},503);
      const data=await body(request),username=typeof data.username==='string'?data.username.slice(0,64).toLowerCase():'';
      const now=Math.floor(Date.now()/1000),[byIp,byUser]=await Promise.all([increment(db,`ip:${ip}`,now),increment(db,`username:${username}`,now)]);
      if(byIp.attempts>40 || byUser.attempts>10)return json({error:'Troppi tentativi. Riprova tra 15 minuti.'},429);
      const user=await authenticate(db,username,data.password);if(!user)return json({error:'Nome utente o password non corretti'},401);
      const session=await createSession(db,user,now);return json({user},200,{'Set-Cookie':cookie(session.token,session.expiresAt-now)});
    }
    const token=getToken(request),user=await getSession(db,token);if(!user)return json({error:'Accesso richiesto'},401);
    if(action==='logout'){await revokeSession(db,token);return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
    if(action==='password'){
      const data=await body(request);if(!await changePassword(db,user,data.currentPassword,data.newPassword))return json({error:'Password attuale non corretta'},401);
      return json({ok:true},200,{'Set-Cookie':cookie('',0)});
    }
    if(action==='users'){
      if(user.role!=='ced' || user.mustChangePassword)return json({error:'Accesso riservato al CED'},403);
      const data=await body(request);return json({user:await createUser(db,user,data)},201);
    }
    return json({error:'Operazione non trovata'},404);
  }catch(error){if(error instanceof SyntaxError || error instanceof TypeError)return json({error:'Dati non validi'},400);return json({error:'Servizio temporaneamente non disponibile'},500);}
}
