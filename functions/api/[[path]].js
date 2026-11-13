import {handleAuth} from '../../server/auth-handler.mjs';
import {handleEvents} from '../../server/events-handler.mjs';

export async function onRequest(context) {
  if (!context.env.DB) return new Response('Servizio non configurato', {status:503,headers:{'Cache-Control':'no-store'}});
  const path=new URL(context.request.url).pathname;
  const provider={url:context.env.SUPABASE_URL,publicKey:context.env.SUPABASE_PUBLISHABLE_KEY,serviceKey:context.env.SUPABASE_SECRET_KEY};
  if(!provider.serviceKey)return new Response('Servizio non configurato',{status:503,headers:{'Cache-Control':'no-store'}});
  if(path==='/api/events')return handleEvents(context.request,context.env.DB,provider);
  if(['/api/session','/api/login','/api/logout','/api/password'].includes(path)) {
    return handleAuth(context.request,context.env.DB,{provider});
  }
  return new Response('Non trovato',{status:404,headers:{'Cache-Control':'no-store'}});
}
