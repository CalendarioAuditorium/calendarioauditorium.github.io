import {createCalendarAccessPolicy} from './managed-identity.mjs';

// Anteprima e sviluppo locali mantengono il comportamento precedente. Un host
// ufficiale deve dichiarare esplicitamente la produzione e i due account.
export function calendarAccessPolicy(request,env) {
  const host=new URL(request.url).hostname.toLowerCase();
  const preview=host.endsWith('.calendarioauditorium-github-io.pages.dev');
  const local=host==='localhost' || host==='127.0.0.1' || host==='[::1]';
  const configured=env.CALENDAR_ENVIRONMENT;
  if(preview || local) {
    return createCalendarAccessPolicy({environment:(!configured || configured==='test')?'test':'blocked'});
  }
  return createCalendarAccessPolicy({environment:configured==='production'?'production':'blocked',
    schoolEmail:env.CALENDAR_SCHOOL_EMAIL,townEmail:env.CALENDAR_TOWN_EMAIL});
}
