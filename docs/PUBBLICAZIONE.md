# DueCase — verifica prima della pubblicazione

Questa release è una build di collaudo. Il codice non certifica la conformità giuridica né la consegna delle notifiche sui dispositivi.

## Servizi esterni da attivare

- Dominio e servizio email: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM; impostare SPF/DKIM/DMARC e verificare consegna/rimbalzi. Attivare EMAIL_VERIFICATION_REQUIRED solo dopo prove reali di registrazione, recupero, cambio email e conferma spese. L’accesso account previsto è tramite email verificata e password.
- Android: GOOGLE_SERVICES_JSON_BASE64 in GitHub e credenziali FCM del progetto Expo. iOS: credenziali APNs. Collaudare due account su due dispositivi, app aperta/chiusa, telefono bloccato, permesso negato, apertura dalla notifica, duplicati e badge. Il badge numerico dipende anche dal launcher Android.
- Pagamenti: account store, prodotti e verifica server delle transazioni; rinnovi, revoche, scadenze e ripristino. La famiglia ha un unico diritto Premium, 4,99 €/mese senza prova gratuita. Non attivare il blocco Premium prima di integrare e provare il billing. Nessuna integrazione di pagamento reale è stata simulata.
- Fornitore di pubblicazione e titolare del trattamento da identificare; verificare con commercialista la posizione fiscale per l'attività a pagamento.

## Privacy, termini e assistenza

- Finalizzare con consulente informativa, basi giuridiche (incluse categorie particolari), tempi di conservazione, dati minori, fornitori/responsabili e trasferimenti. Valutare necessità DPIA, misure e rischi; predisporre gestione violazioni.
- La cancellazione attuale anonimizza il profilo, revoca l'accesso e conserva lo storico condiviso. I contenuti possono continuare a identificare persone: non descriverla come anonimizzazione completa o cancellazione di tutti i dati. Occorre definire e implementare durata, eccezioni e cancellazione dei contenuti/backup in base alla policy validata. Questo è un blocco alla pubblicazione, non risolto dalla sola pagina web.
- Configurare PRIVACY_POLICY_URL, TERMS_URL e SUPPORT_EMAIL; le URL devono essere HTTPS pubbliche. Percorso esterno eliminazione: /account-deletion sul backend. Non pubblicare segnaposto legali come informative definitive.
- Le segnalazioni sono registrate in PostgreSQL. La CLI `node dist/scripts/moderation.js list|review ID|status ID reviewing|resolved` è utilizzabile soltanto nell'ambiente protetto dell'operatore. Definire addetti, tempi, escalation, filtraggio, trattamento dei contenuti illeciti e retention; poi impostare MODERATION_ACTIVE=true. Un controllo del tono e la sospensione chat non bastano da soli a completare una policy di moderazione.
- Valutare accettazione versionata dei termini e acquisizione dei consensi strettamente necessari dopo aver definito i testi; mai usare un consenso generico per tutti i trattamenti.

## Dossier

PDF con indice e pagine; ZIP con originali, PDF, testo Unicode, dati strutturati, Spese.csv, Rimborsi.csv e impronte SHA256SUMS. Filtri per periodo civile Europe/Rome, figlio e sezioni. Messaggi/accordi/storico generale e voci familiari non associate a figli restano inclusi: dichiarato in UI e report. Il riepilogo usa schede/regole attuali, non ricostruisce presenze passate non registrate. Versioni degli accordi e rimborsi collegati sono inclusi anche fuori periodo per non perdere esiti.

I PDF non sono firme digitali o documenti certificati. Non attribuire valore probatorio garantito o identità verificata tramite email. Segnalare eventuali anomalie di hash e originali mancanti, senza occultarle. Limite esplicito: 5.000 record per sezione e 100 MB di allegati per pacchetto; restringere i filtri se superato. L'accesso professionista è rimosso dalla registrazione finché non è pronto; il dossier si consegna manualmente al professionista.

## Continuità operativa

- Scegliere destinazione protetta, retention e pianificazione backup. `scripts/backup-database.sh` prepara un dump completo cifrato con age, ma non attiva alcun servizio esterno o pianificazione. Credenziali tramite PGSERVICE/PGPASSFILE. Conservare la chiave privata separatamente.
- Prima del lancio eseguire un ripristino in database isolato e verificare utenti fittizi, allegati, migrazioni, conteggi e ripartenza. Non ripristinare sopra produzione.
- Monitoraggio disponibilità/errori, spazio database (allegati inclusi), scadenza piano DB e procedure incidenti. Configurare alert operativi; evitare contenuti chat e segreti nei log.
- I token/sessioni scaduti vanno rimossi con manutenzione periodica secondo retention; verificare la durata del JWT. Rotazione segreti e accessi operatori.

## Store e collaudo finale

- Account sviluppatore, firmatari, classificazione età, dichiarazioni Data safety/App privacy coerenti con SDK e servizi, contatti, screenshot reali, descrizioni senza promesse di certificazione.
- Account demo separati con dati fittizi per revisione e backend disponibile. Disattivare la modalità test pubblica soltanto a servizi pronti.
- Build Android AAB per Play e archivio iOS/TestFlight. APK attuale: collaudo privato, non pubblicazione store.
- Provare chat con tastiera reale, font ingranditi, piccoli schermi, tablet, VoiceOver/TalkBack, orientamento supportato; pulsanti e chiusure sempre raggiungibili.
- L'apertura delle notifiche porta ancora alla sezione: selezione automatica di una specifica voce storica non completata. Notifiche in background e ricevute Expo richiedono collaudo/configurazione reali.
- Le modifiche allo schema settimanale sono condivise e tracciate ma non soggette a proposta/approvazione come i cambi giornalieri. Valutare questo flusso prima del lancio.

Il completamento di questa lista e l'esito della revisione degli store vanno verificati sul prodotto effettivo: nessuna garanzia automatica di approvazione.
