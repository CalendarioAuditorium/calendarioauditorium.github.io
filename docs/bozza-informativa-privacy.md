# Bozza di informativa privacy – Calendario Auditorium

**Bozza per verifica del Comune: non pubblicare finché i punti tra parentesi e le informazioni sul trattamento non sono stati confermati.**

## Titolare e contatti

Il titolare indicato per il servizio è il Comune di Verolanuova, Piazza Libertà 39, 25028 Verolanuova (BS). Recapiti istituzionali pubblicati dal Comune: `segreteria@comune.verolanuova.bs.it` e PEC `protocollo@pec.comune.verolanuova.bs.it`.

**[Il Comune deve confermare il proprio ruolo per questo servizio, l'eventuale ruolo della scuola e i recapiti del responsabile della protezione dei dati.]**

## A cosa serve il calendario

Il servizio consente agli utenti autorizzati della scuola e del Comune di consultare e gestire il calendario condiviso dell'Auditorium e di ricevere avvisi email quando viene creato un evento. Gli avvisi riguardano, secondo il caso, una prenotazione nella fascia dell'altro ente, una sovrapposizione oppure una comunicazione alla controparte.

**[Il Comune deve confermare le finalità istituzionali specifiche e la base giuridica applicabile.]**

## Quali dati vengono trattati

Per l'accesso vengono trattati l'indirizzo email dell'account, il ruolo assegnato all'ente, identificativi tecnici e dati di sessione. Le password sono gestite dal servizio di autenticazione Supabase; il calendario non le conserva in chiaro nel proprio database.

Per gli eventi vengono trattati titolo, ente, data, orario, eventuali note, identificativo di chi ha creato l'evento e dati tecnici di creazione o modifica. Titolo e note possono contenere dati personali se inseriti dagli utenti. È opportuno inserire solo le informazioni necessarie alla gestione dell'Auditorium.

Per le notifiche vengono conservati nella coda il titolo dell'evento, l'ente, la data, l'orario, il destinatario logico, le ragioni dell'avviso e lo stato dell'invio. La coda conserva una copia di questi dati anche se l'evento viene poi modificato o cancellato. Le note non sono inserite nell'email generata.

## Gmail e destinatari degli avvisi

Un account Gmail autorizzato viene utilizzato come mittente per inviare gli avvisi agli indirizzi configurati per i due enti. L'applicazione richiede il permesso Google `gmail.send` per inviare email per conto del mittente; non richiede un permesso per leggere o gestire la posta della casella. I dati contenuti nelle email sono trasmessi tramite Gmail ai destinatari configurati.

Cloudflare Pages e D1 sono utilizzati per il sito e il database; Supabase per l'autenticazione; GitHub Actions e Google Gmail API per l'elaborazione e l'invio delle notifiche. **[Il Comune deve verificare i ruoli privacy effettivi di ciascun fornitore, i contratti e gli eventuali trasferimenti internazionali prima di pubblicare.]**

## Conservazione

**[Il Comune deve definire e confermare tempi o criteri di conservazione per eventi, account, sessioni, notifiche, revisioni, log e backup.]** Il codice attualmente preparato non cancella automaticamente dalla coda le copie degli eventi dopo la cancellazione dell'evento originale.

## Diritti e richieste

Gli interessati possono rivolgersi al titolare per richiedere informazioni ed esercitare i diritti applicabili previsti dalla normativa sulla protezione dei dati. È possibile proporre reclamo all'autorità di controllo competente.

**[Il Comune deve confermare i canali per le richieste e i contatti del responsabile della protezione dei dati.]**

## Informazioni da verificare prima dell'uso

Il Comune deve verificare che l'informativa descriva le impostazioni effettivamente messe in produzione, i destinatari, le responsabilità dei fornitori e le modalità di gestione dei dati. Eventuali variazioni delle funzioni o del trattamento richiedono un aggiornamento del testo.
