# Configurazione delle notifiche di produzione

Il sito ufficiale usa un database D1 separato dall'anteprima. Non copiare credenziali nei file del repository. Prima dell'attivazione verificare schema, backup, utenti Supabase, ruoli e destinatari, nonché che il database configurato nel workflow coincida con il binding Pages di produzione.

La pubblicazione su `main` deve conservare `.github/workflows/gmail-queue-test.yml`: su `main` è il pianificatore della prova, mentre sul ramo test il file omonimo è l'elaboratore della coda. I due file hanno scopi diversi. GitHub Pages e Cloudflare Pages possono entrambi pubblicare automaticamente quando cambia `main`.

## Pages e accesso

I binding `DB` sono gestiti nella dashboard Cloudflare: verificare che Production usi il database ufficiale e Preview quello di test. Il file Wrangler locale è escluso dal repository: non pubblicarlo senza aver verificato l'effetto sulle configurazioni esistenti. In Production impostare le variabili `CALENDAR_ENVIRONMENT=production`, `CALENDAR_SCHOOL_EMAIL` e `CALENDAR_TOWN_EMAIL`: sono le sole due identità autorizzate, ciascuna con il proprio ruolo Supabase amministrativo. L'accesso è bloccato se la configurazione di produzione è incompleta. L'anteprima conserva il comportamento di test. Non usare password condivise o presenti nella cronologia delle prove.

Per l'avvio immediato configurare inoltre `NOTIFICATION_ENVIRONMENT=production`, `NOTIFICATION_PRODUCTION_HOSTS` con l'elenco degli hostname ufficiali esatti separati da virgole, e il secret Pages `GITHUB_PRODUCTION_DISPATCH_TOKEN`, dedicato al repository con permesso Actions read/write. Nessun dato dell'evento viene inviato a GitHub. Il workflow di produzione è separato da quello di test. Dopo aver modificato i secret Pages serve una nuova distribuzione.

## Workflow e credenziali

Creare l'ambiente GitHub `gmail-production`, consentendo solo `main`, con la variabile `PROD_D1_DATABASE_ID` e i secret `PROD_NOTIFICATION_START_UNIX`, `PROD_CLOUDFLARE_ACCOUNT_ID`, `PROD_CLOUDFLARE_API_TOKEN`, `PROD_GMAIL_CLIENT_ID`, `PROD_GMAIL_CLIENT_SECRET`, `PROD_GMAIL_REFRESH_TOKEN`, `PROD_RECIPIENT_SCHOOL`, `PROD_RECIPIENT_TOWN`. L'identificativo D1 deve coincidere con il binding di produzione ed è rifiutato se indica il database di test. Scegliere il momento di inizio prima della creazione degli eventi da notificare; le righe precedenti non vengono inviate automaticamente. L'elaborazione rimane disabilitata finché la variabile **del repository** `PROD_NOTIFICATIONS_ENABLED` non vale `enabled`.

Per autorizzare il mittente con un client Google desktop di produzione esterno al repository, utilizzare `node .github/scripts/authorize-gmail.mjs "PERCORSO_JSON_ESTERNO" --production` sul proprio PC. I valori sono copiati uno alla volta negli appunti per l'inserimento nei secret dell'ambiente; non sono stampati. Completare prima la configurazione dell'app OAuth Google per produzione e la verifica eventualmente richiesta. Un refresh token creato mentre l'app è in modalità Testing scade dopo sette giorni. Pubblicare l'app non garantisce che un token non sia mai revocato.

## Controlli e limiti

`notification-health-production.yml` controlla periodicamente il rinnovo Gmail, l'accesso D1 e i conteggi aggregati di invii falliti, incerti o troppo a lungo in attesa. La variabile dell'ambiente `PROD_CLOUDFLARE_TOKEN_EXPIRES_ON` e il secret dell'ambiente `PROD_GITHUB_DISPATCH_TOKEN_EXPIRES_ON` indicano manualmente le scadenze in formato `AAAA-MM-GG`, oppure `none` se non è stata impostata una scadenza: vanno aggiornati quando si ruota un token. Non verificano direttamente il token GitHub conservato in Pages. Un token senza scadenza può comunque essere revocato. Le credenziali non sono stampate.

Un job fallito è visibile in Actions; configurare e verificare le notifiche GitHub per ricevere gli avvisi. Un monitor pianificato su GitHub non può garantire un avviso se GitHub stesso non lo avvia. Per garantire la rilevazione di tale guasto serve un controllo indipendente. Il recapito in casella non è attestato dall'accettazione Gmail. Per una riga `unknown`, controllare manualmente le caselle prima di un eventuale reinvio: non ritentare automaticamente un invio incerto.

La migrazione `0006_notification_reviews.sql` crea un registro append-only delle revisioni. Una decisione umana su una riga `failed` o `unknown` è legata a ID, stato e numero di tentativi osservati: `no_resend` o `delivery_confirmed` chiudono l'avviso corrispondente senza modificare lo stato originale; `reopen` lo riapre. Usare `delivery_confirmed` solo dopo aver verificato la ricezione. La registrazione confronta lo stato ancora corrente; una revisione precedente non nasconde un eventuale nuovo tentativo. Se il registro non esiste, il controllo segnala errore.

Dopo aver verificato una specifica riga, un esempio di registrazione senza reinvio è `INSERT INTO notification_reviews(notification_id,observed_status,observed_attempts,decision) SELECT id,status,attempts,'no_resend' FROM notification_queue WHERE id=123 AND status='unknown' AND attempts=1;`. Sostituire ID, stato e tentativi con quelli effettivamente verificati e controllare che sia stata inserita esattamente una riga. Zero righe indica che lo stato è cambiato o l'ID non corrisponde: verificare di nuovo. Questa operazione non reinvia né modifica lo stato della notifica.

Prima dell'uso ufficiale eseguire una prova con un evento fittizio e verificare la ricezione nelle caselle previste. Modifiche e cancellazioni di eventi non producono attualmente notifiche.
