import {handleAuth} from '../../server/auth-handler.mjs';
import {handleEvents} from '../../server/events-handler.mjs';
import {dispatchTestQueue,shouldDispatchTestQueue,dispatchProductionQueue,shouldDispatchProductionQueue} from '../../server/notification-dispatch.mjs';
import {calendarAccessPolicy} from '../../server/calendar-environment.mjs';

export async function onRequest(context) {
  if (!context.env.DB) return new Response('Servizio non configurato', {status:503,headers:{'Cache-Control':'no-store'}});
  const path=new URL(context.request.url).pathname;
  const accessPolicy=calendarAccessPolicy(context.request,context.env);
  if(accessPolicy.mode==='blocked')return new Response('Servizio non configurato',{status:503,headers:{'Cache-Control':'no-store'}});
  const provider={url:context.env.SUPABASE_URL,publicKey:context.env.SUPABASE_PUBLISHABLE_KEY,serviceKey:context.env.SUPABASE_SECRET_KEY,accessPolicy};
  if(!provider.serviceKey)return new Response('Servizio non configurato',{status:503,headers:{'Cache-Control':'no-store'}});
  if(path==='/api/events'){
    const response=await handleEvents(context.request,context.env.DB,provider);
    const testToken=context.env.GITHUB_TEST_DISPATCH_TOKEN;
    try {
      if(context.env.NOTIFICATION_ENVIRONMENT!=='production' && shouldDispatchTestQueue(context.request,response,testToken)) {
        context.waitUntil(dispatchTestQueue(testToken));
      } else if(shouldDispatchProductionQueue(context.request,response,context.env)) {
        context.waitUntil(dispatchProductionQueue(context.env.GITHUB_PRODUCTION_DISPATCH_TOKEN));
      }
    } catch {
      // L'evento è già stato registrato insieme alla coda. Non trasformare il
      // salvataggio riuscito in errore se l'avvio asincrono non è disponibile.
      console.error('Avvio notifiche non disponibile; la coda rimane in attesa.');
    }
    return response;
  }
  if(['/api/session','/api/login','/api/logout','/api/password'].includes(path)) {
    return handleAuth(context.request,context.env.DB,{provider});
  }
  return new Response('Non trovato',{status:404,headers:{'Cache-Control':'no-store'}});
}
