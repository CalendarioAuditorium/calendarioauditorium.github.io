/** Collega una verifica del provider a un account locale attivo e al suo ruolo. */
export async function resolveProviderIdentity(db, username, providerUserId){
  if(typeof username!=='string' || !/^[a-z0-9._-]{3,64}$/i.test(username) ||
     typeof providerUserId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerUserId))return null;
  const user=await db.prepare(`SELECT id,username,display_name,role,must_change_password FROM managed_accounts
    WHERE username=? AND provider_user_id=? AND disabled=0`).bind(username.toLowerCase(),providerUserId).first();
  return user?{id:user.id,username:user.username,displayName:user.display_name,role:user.role,mustChangePassword:!!user.must_change_password}:null;
}
