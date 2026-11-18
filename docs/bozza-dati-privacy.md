# Promemoria per l'informativa privacy del Calendario Auditorium

**Bozza di lavoro: non pubblicare come informativa definitiva.** I punti seguenti descrivono quanto risulta dal codice preparato e indicano le informazioni che il soggetto responsabile deve verificare e completare. Non indicano da soli una base giuridica, un termine di conservazione o un titolare del trattamento.

## Titolare e contatti da confermare

L'utente ha indicato il **Comune di Verolanuova** come titolare. Il sito istituzionale riporta sede in Piazza Libertà 39, 25028 Verolanuova (BS), email `segreteria@comune.verolanuova.bs.it` e PEC `protocollo@pec.comune.verolanuova.bs.it`. Il Comune deve confermare che questi recapiti e l'attribuzione del ruolo si applichino a questo specifico calendario, anche tenendo conto del ruolo della scuola.

Il sito del Comune pubblica anche i [recapiti del responsabile della protezione dei dati](https://www.comune.verolanuova.bs.it/EG0/EGSCHTST52.HBL?MESSA=PUBBLICA&SRL=111&en=eg791), da verificare con l'ente prima di riportarli nell'informativa. La [privacy del sito istituzionale](https://www.comune.verolanuova.bs.it/informativa.html) dichiara di riguardare quel sito: non è automaticamente l'informativa di questo calendario.

## Dati e funzioni da verificare

- Il calendario permette agli account autorizzati di scuola e Comune di visualizzare gli eventi e gestire quelli del proprio ente.
- Un evento contiene titolo, ente, data, ora iniziale e finale, eventuali note, identificativo di chi lo ha creato e date tecniche di creazione e aggiornamento. Titolo e note possono contenere dati personali se inseriti dall'utente.
- Supabase gestisce gli account e la verifica delle password; il database Cloudflare D1 conserva gli eventi, le identità locali associate e le sessioni applicative. Il codice conserva hash del token di sessione, non il token in chiaro.
- Alla creazione di un evento, il database può registrare in una coda titolo, ente, data, orari, destinatario logico e motivi dell'avviso. La coda conserva uno snapshot anche se l'evento viene successivamente modificato o cancellato. Le note non sono incluse nel messaggio generato.
- L'automazione utilizza GitHub Actions e Gmail API per inviare gli avvisi agli indirizzi configurati. Il permesso Google `gmail.send` autorizza l'invio per conto dell'account mittente: il programma non richiede l'accesso in lettura alla casella.
- Gli operatori che amministrano le piattaforme possono avere accesso alle rispettive impostazioni e ai dati necessari alla gestione; occorre verificare esattamente persone autorizzate, fornitori, contratti e luoghi di trattamento.

## Da completare prima della pubblicazione

1. Conferma di titolare, eventuale ruolo della scuola e recapiti del responsabile della protezione dei dati.
2. Finalità e base giuridica effettive del trattamento.
3. Tempi o criteri di conservazione per eventi, note, coda, registro delle revisioni, account e log, inclusi backup.
4. Categorie di destinatari, ruoli dei fornitori Cloudflare, Supabase, Google e GitHub e modalità applicabili agli eventuali trasferimenti fuori dallo Spazio economico europeo.
5. Modalità per esercitare i diritti degli interessati e recapiti da utilizzare.
6. Verifica di coerenza con le impostazioni realmente pubblicate e con i requisiti di Google per l'uso dei dati tramite API.

La pagina pubblica dovrà essere controllata e approvata da chi gestisce il servizio prima di essere collegata alla schermata Google o presentata agli utenti come informativa.
