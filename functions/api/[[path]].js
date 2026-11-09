import {handleAuth} from '../../server/auth-handler.mjs';
import {handleEvents} from '../../server/events-handler.mjs';

export async function onRequest(context) {
  if (!context.env.DB) return new Response('Servizio non configurato', {status:503,headers:{'Cache-Control':'no-store'}});
  const path=new URL(context.request.url).pathname;
  if(path==='/api/events')return handleEvents(context.request,context.env.DB);
  if(['/api/session','/api/login','/api/logout','/api/password','/api/users','/api/bootstrap'].includes(path)) {
    return handleAuth(context.request,context.env.DB,{bootstrapToken:context.env.BOOTSTRAP_TOKEN,provider:{url:context.env.SUPABASE_URL,publicKey:context.env.SUPABASE_PUBLISHABLE_KEY,serviceKey:context.env.SUPABASE_SECRET_KEY}});
  }
  return new Response('Non trovato',{status:404,headers:{'Cache-Control':'no-store'}});
}
