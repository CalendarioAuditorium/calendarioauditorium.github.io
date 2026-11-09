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

const validUserName=v=>typeof v==='string' && /^[a-z0-9._-]{3,64}$/i.test(v);
const validEmail=v=>typeof v==='string' && v.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function validateUser(user){if(!user || !validUserName(user.username) || typeof user.displayName!=='string' || !user.displayName.trim() || user.displayName.length>100 || !validEmail(user.email) || typeof user.password!=='string' || user.password.length<12 || user.password.length>128 || !['ced','school','town'].includes(user.role))throw new TypeError('Dati account non validi');}

/** Crea un account solo su richiesta di un CED già autenticato. */
export async function createManagedUser(db,principal,user,provider){
  if(!principal || principal.role!=='ced' || principal.mustChangePassword)throw new Error('Accesso riservato al CED');
  validateUser(user);
  const {createProviderUser,deleteProviderUser}=await import('./supabase-auth.mjs');
  const username=user.username.toLowerCase(),email=user.email.toLowerCase(),id=crypto.randomUUID();
  const existing=await db.prepare('SELECT id FROM managed_accounts WHERE username=? OR email=?').bind(username,email).first();if(existing)throw new Error('Account già presente');
  const external=await createProviderUser({...provider,email,password:user.password});
  try{await db.prepare('INSERT INTO managed_accounts(id,username,display_name,role,email,provider_user_id) VALUES (?,?,?,?,?,?)').bind(id,username,user.displayName.trim(),user.role,email,external.providerUserId).run();}
  catch(_){try{await deleteProviderUser(provider,external.providerUserId);}catch{console.error('Creazione account: necessaria verifica manuale nel provider');}throw new Error('Creazione account non completata');}
  return {id,username,displayName:user.displayName.trim(),role:user.role,mustChangePassword:true};
}

export async function changeManagedPassword(db,principal,currentPassword,newPassword,provider){
  if(!principal || typeof principal.id!=='string')throw new TypeError('Utente non valido');
  const row=await db.prepare('SELECT email,provider_user_id FROM managed_accounts WHERE id=? AND disabled=0').bind(principal.id).first();if(!row)return false;
  const {changeProviderPassword}=await import('./supabase-auth.mjs');
  if(!await changeProviderPassword({...provider,email:row.email,password:currentPassword},row.provider_user_id,newPassword))return false;
  await db.batch([db.prepare('UPDATE managed_accounts SET must_change_password=0 WHERE id=?').bind(principal.id),db.prepare('DELETE FROM managed_sessions WHERE user_id=?').bind(principal.id)]);
  return true;
}

/** Collega il primo CED a un account Supabase già creato e verificato. */
export async function bootstrapManagedAdmin(db,user,provider){
  validateUser({...user,role:'ced'});
  const verified=await verifyProviderPassword({...provider,email:user.email,password:user.password});
  if(!verified)return null;
  const id=crypto.randomUUID(),result=await db.prepare(`INSERT INTO managed_accounts(id,username,display_name,role,email,provider_user_id,must_change_password)
    SELECT ?,?,?, 'ced',?,?,0 WHERE NOT EXISTS (SELECT 1 FROM managed_accounts)`).bind(id,user.username.toLowerCase(),user.displayName.trim(),user.email.toLowerCase(),verified.providerUserId).run();
  return result.meta.changes===1;
}
