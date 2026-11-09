import {verifyProviderPassword} from './supabase-auth.mjs';
import {resolveProviderIdentity} from './provider-identities.mjs';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash=async token=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))));
const sessionTime=8*60*60;

/** È necessario applicare limitazione dei tentativi prima di chiamare questa funzione. */
export async function authenticateManaged(db,{username,password,provider}){
  if(typeof username!=='string' || !/^[a-z0-9._-]{3,64}$/i.test(username) || typeof password!=='string' || password.length>128)return null;
  const record=await db.prepare('SELECT email FROM managed_accounts WHERE username=? AND disabled=0').bind(username.toLowerCase()).first();
  if(!record)return null;
  const verified=await verifyProviderPassword({...provider,email:record.email,password});
  return verified ? resolveProviderIdentity(db,username,verified.providerUserId) : null;
}
export async function createManagedSession(db,user,now=Math.floor(Date.now()/1000)){
  if(!user || typeof user.id!=='string' || !user.id)throw new TypeError('Utente non valido');
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare('INSERT INTO managed_sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(await hash(token),user.id,now+sessionTime,now).run();
  return {token,expiresAt:now+sessionTime};
}
export async function getManagedSession(db,token,now=Math.floor(Date.now()/1000)){
  if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token))return null;
  const user=await db.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.must_change_password FROM managed_sessions s
    JOIN managed_accounts u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`).bind(await hash(token),now).first();
  return user?{id:user.id,username:user.username,displayName:user.display_name,role:user.role,mustChangePassword:!!user.must_change_password}:null;
}
export async function revokeManagedSession(db,token){if(typeof token==='string' && /^[a-f0-9]{64}$/.test(token))await db.prepare('DELETE FROM managed_sessions WHERE token_hash=?').bind(await hash(token)).run();}
