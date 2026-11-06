import {getSession} from './identity.mjs';
import {listEvents,createEvent,updateEvent,deleteEvent} from './events.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function sessionCookie(request){const cookie=request.headers.get('Cookie') || '';const matches=cookie.split(';').map(s=>s.trim()).filter(s=>s.startsWith('__Host-auditorium='));return matches.length===1?matches[0].slice('__Host-auditorium='.length):'';}

/** Non collegare a una rotta pubblica finché login, protezioni e migrazioni non sono pronti. */
export async function handleEvents(request, db){
  try {
    const principal=await getSession(db,sessionCookie(request));
    if(!principal)return json({error:'Accesso richiesto'},401);
    if(principal.mustChangePassword)return json({error:'Cambia prima la password temporanea'},403);
    const url=new URL(request.url),method=request.method;
    if(method==='GET')return json({events:await listEvents(db,principal)});
    if(!['POST','PUT','DELETE'].includes(method))return json({error:'Metodo non consentito'},405);
    // Le richieste di modifica devono provenire dalla stessa origine del sito.
    if(request.headers.get('Origin')!==url.origin)return json({error:'Origine non consentita'},403);
    if(method==='DELETE'){
      const id=url.searchParams.get('id');if(!id)return json({error:'Identificativo richiesto'},400);
      return await deleteEvent(db,principal,id)?json({ok:true}):json({error:'Evento non trovato'},404);
    }
    if(!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json'))return json({error:'Formato non supportato'},415);
    if(Number(request.headers.get('Content-Length') || 0)>8192)return json({error:'Richiesta troppo grande'},413);
    const raw=await request.text();if(raw.length>8192)return json({error:'Richiesta troppo grande'},413);
    let event;try{event=JSON.parse(raw)}catch{return json({error:'Dati non validi'},400)}
    if(method==='POST')return json({event:await createEvent(db,principal,event)},201);
    const id=url.searchParams.get('id');if(!id)return json({error:'Identificativo richiesto'},400);
    const updated=await updateEvent(db,principal,id,event);return updated?json({event:updated}):json({error:'Evento non trovato'},404);
  } catch(error){
    if(error instanceof TypeError)return json({error:'Dati non validi'},400);
    return json({error:'Servizio temporaneamente non disponibile'},500);
  }
}
