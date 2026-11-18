/** Invia a Graph un messaggio già preparato. La risposta 202 indica accettazione, non consegna. */
export async function sendGraphMail({accessToken,to,subject,text,fetcher=fetch}){
  if(typeof accessToken!=='string' || !accessToken || typeof to!=='string' || to.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ||
     typeof subject!=='string' || !subject.trim() || subject.length>200 || typeof text!=='string' || !text.trim())throw new TypeError('Dati notifica non validi');
  const response=await fetcher('https://graph.microsoft.com/v1.0/me/sendMail',{
    method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({message:{subject,body:{contentType:'Text',content:text},toRecipients:[{emailAddress:{address:to}}]},saveToSentItems:true}),signal:AbortSignal.timeout(15000)
  });
  if(response.status===202)return {accepted:true};
  // Una risposta diversa da 202 non garantisce che sia sicuro ripetere automaticamente l'invio.
  const error=new Error('Invio della notifica non confermato');error.status=response.status;throw error;
}
