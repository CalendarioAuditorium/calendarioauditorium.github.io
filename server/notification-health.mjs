// Read-only checks for the production outbox; no event details are returned.
export const TEST_D1_DATABASE_ID='b2c275e3-70c6-4991-99e7-7032eb2c4577';
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const accountPattern=/^[0-9a-f]{32}$/i;
const problematicStates=['failed','unknown','pending','claimed','sending'];

export function describeQueueCounts(counts) {
  if(counts===null) return ['Coda: stato non disponibile.'];
  return problematicStates.map(status=>`Coda ${status}: ${counts[status] || 0}`);
}

export function validateHealthConfig({enabled,databaseId,accountId,startUnix,now}) {
  if(enabled!=='enabled') throw new Error('Monitoraggio produzione non abilitato');
  if(typeof databaseId!=='string' || !uuidPattern.test(databaseId) || databaseId.toLowerCase()===TEST_D1_DATABASE_ID) throw new Error('Database di produzione non valido');
  if(typeof accountId!=='string' || !accountPattern.test(accountId)) throw new Error('Account Cloudflare non valido');
  if(!Number.isSafeInteger(now) || !Number.isSafeInteger(startUnix) || startUnix<=0 || startUnix>=now) throw new Error('Data di attivazione non valida');
}

export function assessExpiry(value, now, warningDays=14) {
  if(!value) return {state:'unconfigured'};
  if(value==='none') return {state:'no_expiration_declared'};
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return {state:'invalid'};
  const expiresAt=Date.parse(`${value}T00:00:00Z`);
  if(!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString().slice(0,10)!==value) return {state:'invalid'};
  const days=Math.ceil((expiresAt-now*1000)/86400000);
  return {state:days<=warningDays?'attention':'ok',days};
}

export async function checkNotificationHealth({query,refresh,startUnix,now=Math.floor(Date.now()/1000),pendingGrace=7200,leaseGrace=300,expirationDates={}}) {
  if(!Number.isSafeInteger(now) || !Number.isSafeInteger(startUnix) || startUnix<=0 || startUnix>=now || !Number.isSafeInteger(pendingGrace) || pendingGrace<1 || !Number.isSafeInteger(leaseGrace) || leaseGrace<1) throw new Error('Parametri di monitoraggio non validi');
  const sql=`SELECT q.status, COUNT(*) AS total FROM notification_queue q
    WHERE q.created_at>? AND (
      (q.status IN ('failed','unknown') AND COALESCE((
        SELECT r.decision FROM notification_reviews r
        WHERE r.notification_id=q.id AND r.observed_status=q.status AND r.observed_attempts=q.attempts
        ORDER BY r.id DESC LIMIT 1
      ),'reopen') NOT IN ('no_resend','delivery_confirmed'))
      OR (q.status='pending' AND q.available_at<=?)
      OR (q.status IN ('claimed','sending') AND (q.lease_until IS NULL OR q.lease_until<=?)))
    GROUP BY q.status`;
  const checks=await Promise.allSettled([query(sql,[startUnix,now-pendingGrace,now-leaseGrace]),refresh()]);
  const errors=[];
  // null distinguishes an unavailable/invalid result from an empty, healthy queue.
  let counts=null;
  if(checks[0].status==='rejected' || !Array.isArray(checks[0].value)) errors.push('d1_unavailable');
  else {
    const rows=checks[0].value;
    if(rows.some(r=>!problematicStates.includes(r.status) || !Number.isSafeInteger(r.total) || r.total<0) || new Set(rows.map(r=>r.status)).size!==rows.length) errors.push('d1_invalid_result');
    else counts=Object.fromEntries(rows.map(r=>[r.status,r.total]));
  }
  if(checks[1].status==='rejected' || checks[1].value!==true) errors.push('gmail_refresh_failed');
  const expiry={cloudflare:assessExpiry(expirationDates.cloudflare,now),githubDispatch:assessExpiry(expirationDates.githubDispatch,now)};
  for(const [name,item] of Object.entries(expiry)) if(item.state==='invalid' || item.state==='attention') errors.push(`${name}_expiry_${item.state}`);
  const issueCount=counts ? Object.values(counts).reduce((sum,n)=>sum+n,0) : 0;
  return {healthy:errors.length===0 && issueCount===0,counts,errors,expiry};
}
