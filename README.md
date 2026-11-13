# Calendario Auditorium Verolanuova

Questo ramo contiene l'anteprima del calendario condiviso tra Scuola Mazzolari e Comune di Verolanuova. Gli eventi sono conservati in Cloudflare D1; l'accesso usa Supabase Auth. Il ramo `main` viene distribuito sul sito principale, mentre `calendario-condiviso-test` viene distribuito nell'anteprima.

## Account e permessi

Gli account si gestiscono in Supabase Auth. Per accedere al calendario un utente deve avere l'email confermata e un ruolo assegnato dall'amministratore nei **metadati amministrativi** (`app_metadata`):

```json
{"calendar_role":"school"}
```

Usare `town` per il Comune e `school` per la scuola. Non usare `user_metadata` per assegnare i permessi: l'utente potrebbe modificarli autonomamente. Un account senza ruolo valido non ha accesso al calendario. Non c'è un pannello di amministrazione nel sito.

L'accesso si effettua con l'email e la password Supabase. Il server controlla a ogni richiesta che l'account esista ancora e abbia il ruolo assegnato. Se un account viene eliminato e ricreato con la stessa email e con il ruolo amministrativo appropriato, al primo accesso viene ricollegato all'identità locale e le vecchie sessioni vengono revocate. I due enti vedono gli eventi condivisi; ognuno può creare, modificare o eliminare solo gli eventi del proprio ente. Le fasce 00:00–14:00 per la scuola e 14:00–24:00 per il Comune sono indicative.

## Configurazione e verifiche

Cloudflare Pages richiede un binding D1 chiamato `DB`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e il segreto server `SUPABASE_SECRET_KEY`. Mantenere un database distinto per l'anteprima e per il sito principale; non inserire chiavi o password nel repository. I file in `migrations/` definiscono le tabelle D1.

Eseguire i test dalla radice del progetto con una versione di Node.js che includa `node:sqlite`:

```sh
node --test tests/*.test.mjs
```

Le pagine statiche si possono servire con `python3 -m http.server 8000`, ma per autenticazione e calendario condiviso occorrono anche le Pages Functions e i servizi configurati. Le notifiche automatiche via email **non sono ancora attive**: la logica di pianificazione in `lib/notification-rules.mjs` non invia messaggi.
