/** Bloques para autenticación individual; deben usarse desde rutas protegidas. */
const ITERATIONS=600000;
const SESSION_SECONDS=8*60*60;
const encoder=new TextEncoder();
const fakeSalt='00000000000000000000000000000000';
const fakeHash='0000000000000000000000000000000000000000000000000000000000000000';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function unhex(value){if(!/^(?:[0-9a-f]{2})+$/i.test(value))throw new TypeError('Formato non valido');return Uint8Array.from(value.match(/../g),b=>parseInt(b,16));}
function safeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function randomHex(bytes){return hex(crypto.getRandomValues(new Uint8Array(bytes)));}
async function sha256(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
async function derive(password,salt,iterations){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations},key,256)));}
function checkPassword(value){return typeof value==='string' && value.length>=12 && value.length<=128;}
function checkUsername(value){return typeof value==='string' && /^[a-z0-9._-]{3,64}$/i.test(value);}

/** Il primo amministratore deve essere predisposto separatamente, in modo sicuro. */
export async function createUser(db, principal, user){
  if(!principal || principal.role!=='ced' || principal.mustChangePassword)throw new Error('Accesso riservato al CED');
  if(!user || !checkUsername(user.username) || typeof user.displayName!=='string' || !user.displayName.trim() || user.displayName.length>100 || !['ced','school','town'].includes(user.role) || !checkPassword(user.password))throw new TypeError('Dati account non validi');
  const id=crypto.randomUUID(),salt=randomHex(16),hash=await derive(user.password,salt,ITERATIONS);
  await db.prepare('INSERT INTO users(id,username,display_name,role,password_hash,password_salt,password_iterations) VALUES (?,?,?,?,?,?,?)').bind(id,user.username.toLowerCase(),user.displayName.trim(),user.role,hash,salt,ITERATIONS).run();
  return {id,username:user.username.toLowerCase(),displayName:user.displayName.trim(),role:user.role,mustChangePassword:true};
}

/** La protezione contro i tentativi ripetuti deve essere applicata alla rotta di login. */
export async function authenticate(db, username, password){
  const valid=checkUsername(username) && typeof password==='string' && password.length<=128;
  const user=valid ? await db.prepare('SELECT * FROM users WHERE username=?').bind(username.toLowerCase()).first() : null;
  const actual=await derive(valid ? password : '',user?.password_salt || fakeSalt,user?.password_iterations || ITERATIONS);
  if(!safeEqual(actual,user?.password_hash || fakeHash) || !user || user.disabled)return null;
  return {id:user.id,username:user.username,displayName:user.display_name,role:user.role,mustChangePassword:!!user.must_change_password};
}

/** Il token restituito va inviato esclusivamente come cookie Secure e HttpOnly. */
export async function createSession(db, user, now=Math.floor(Date.now()/1000)){
  if(!user || !user.id)throw new TypeError('Utente non valido');
  const token=randomHex(32),hash=await sha256(token);
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(hash,user.id,now+SESSION_SECONDS,now).run();
  return {token,expiresAt:now+SESSION_SECONDS};
}
export async function getSession(db, token, now=Math.floor(Date.now()/1000)){
  if(typeof token!=='string' || !/^[0-9a-f]{64}$/.test(token))return null;
  const user=await db.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.must_change_password FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`).bind(await sha256(token),now).first();
  return user ? {id:user.id,username:user.username,displayName:user.display_name,role:user.role,mustChangePassword:!!user.must_change_password} : null;
}
export async function revokeSession(db, token){if(typeof token!=='string' || !/^[0-9a-f]{64}$/.test(token))return;await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();}

/** Cambia la password e invalida tutte le sessioni esistenti dell'utente. */
export async function changePassword(db, principal, currentPassword, newPassword){
  if(!principal || typeof principal.id!=='string' || !checkPassword(newPassword))throw new TypeError('Dati non validi');
  const row=await db.prepare('SELECT username FROM users WHERE id=? AND disabled=0').bind(principal.id).first();
  const verified=row ? await authenticate(db,row.username,currentPassword) : null;
  if(!verified || verified.id!==principal.id)return false;
  const salt=randomHex(16),hash=await derive(newPassword,salt,ITERATIONS);
  await db.batch([
    db.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0 WHERE id=?').bind(hash,salt,ITERATIONS,principal.id),
    db.prepare('DELETE FROM sessions WHERE user_id=?').bind(principal.id)
  ]);
  return true;
}

/** Imposta il primo amministratore soltanto quando non esiste alcun utente. */
export async function bootstrapAdmin(db, user){
  if(!user || !checkUsername(user.username) || typeof user.displayName!=='string' || !user.displayName.trim() || user.displayName.length>100 || !checkPassword(user.password))throw new TypeError('Dati account non validi');
  const id=crypto.randomUUID(),salt=randomHex(16);
  let hash;
  try{hash=await derive(user.password,salt,ITERATIONS);}catch(_){const error=new Error('Protezione password non disponibile');error.diagnostic='SETUP-PASSWORD';throw error;}
  let result;
  try{result=await db.prepare(`INSERT INTO users(id,username,display_name,role,password_hash,password_salt,password_iterations,must_change_password)
    SELECT ?,?,?, 'ced',?,?,?,0 WHERE NOT EXISTS (SELECT 1 FROM users)`).bind(id,user.username.toLowerCase(),user.displayName.trim(),hash,salt,ITERATIONS).run();}catch(_){const error=new Error('Archivio utenti non disponibile');error.diagnostic='SETUP-USERS';throw error;}
  return result.meta.changes===1;
}
