# Calendario Auditorium Verolanuova

Prototipo statico del calendario condiviso tra Scuola Mazzolari e Comune di Verolanuova. Aprire `index.html` (pagina di accesso) in un browser oppure avviare `python3 -m http.server 8000` dalla cartella del progetto.

Le viste giorno, settimana e mese consentono di consultare gli eventi. Il login dimostrativo usa gli account `ced` / `ced123`, `mazzolari` / `scuola123` e `comune` / `comune123`. Il profilo in alto a destra permette di uscire e accedere con un altro account. Ogni profilo propone il proprio ente per i nuovi eventi, ma è possibile scegliere liberamente l'altro ente e qualsiasi orario. Le fasce scuola 00:00–14:00 e Comune 14:00–00:00 sono indicative; sono ammessi eventi sovrapposti. Cliccare sul calendario per creare un evento o su un evento per modificarlo o eliminarlo. I dati vengono salvati nel browser, sul singolo dispositivo.

**Questa è una dimostrazione locale:** i profili non sono account reali e non garantiscono sicurezza o permessi. Per l'utilizzo operativo servono autenticazione, autorizzazioni applicate sul server, database condiviso, gestione degli utenti e controllo delle prenotazioni concorrenti. I dati salvati nel browser non vengono condivisi con altri utenti e possono essere rimossi cancellando i dati del sito.
