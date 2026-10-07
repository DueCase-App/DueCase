# DueCase — verifica prima della pubblicazione

Stato aggiornato al 7 ottobre 2026.

## Già predisposto

- Sito ufficiale: https://www.duecaseununicasquadra.com
- Privacy: https://www.duecaseununicasquadra.com/privacy.html
- Termini: https://www.duecaseununicasquadra.com/termini.html
- Cookie: https://www.duecaseununicasquadra.com/cookie.html
- Cancellazione account: https://www.duecaseununicasquadra.com/cancellazione-account.html
- Note legali e assistenza pubbliche.
- Registrazione con presa visione Privacy e accettazione Termini separate e obbligatorie.
- Versione dei documenti legali e timestamp di accettazione salvati lato backend.
- Eliminazione account raggiungibile da `Impostazioni > Privacy e dati`, con doppia conferma.
- Link web esterno di cancellazione disponibile per Google Play.
- Accesso professionisti separato dagli account dei genitori, in sola lettura, con scope revocabili.
- Dominio ufficiale configurato nel backend per URL privacy/termini/sito.

## Blocchi da chiudere prima della submission pubblica

### 1. Email reali
Render Free non consente l'uscita SMTP sulle porte standard usate da Aruba. Finché non viene scelto un provider/API compatibile non attivare `EMAIL_VERIFICATION_REQUIRED=true`.

Da collaudare realmente:
- verifica email;
- recupero password;
- cambio email;
- invito altro genitore;
- invito professionista;
- codici OTP inviati via email dove previsti.

### 2. Push
Android richiede configurazione Firebase/FCM e iOS credenziali APNs. Verificare su almeno due telefoni reali:
- app aperta, background, terminata;
- telefono bloccato;
- permesso notifiche negato e poi concesso;
- badge;
- apertura dalla notifica;
- assenza di duplicati.

### 3. Billing store
Il Premium famiglia previsto è 4,99 €/mese, un solo diritto per entrambi i genitori, senza prova gratuita.

Prima di attivare `PREMIUM_ENFORCEMENT_ENABLED` servono:
- prodotti App Store e Play;
- acquisto;
- ripristino;
- rinnovo;
- scadenza/revoca;
- sincronizzazione entitlement famiglia;
- verifica server della transazione.

### 4. Cancellazione dati condivisi
L'account deletion attuale elimina credenziali e dati anagrafici dell'utente e revoca l'accesso, ma mantiene alcuni record condivisi della famiglia attribuiti a `Account eliminato`.

Messaggi e relativi allegati sono attualmente progettati come append-only/immutabili. Prima della pubblicazione occorre scegliere e validare la regola definitiva di conservazione: quali dati condivisi restano per un motivo legittimo e quali contenuti personali/allegati vengono rimossi su richiesta.

Questa scelta deve essere coerente tra:
- comportamento backend;
- Privacy Policy;
- pagina cancellazione account;
- dichiarazioni Apple App Privacy;
- Google Play Data safety.

Non dichiarare “tutti i dati vengono cancellati” finché il comportamento non lo garantisce.

### 5. Titolare e testi legali finali
Le pagine legali sono complete come struttura ma restano da validare con il legale e da completare con dati reali del titolare/contitolari. La parte fiscale resta separata e non blocca lo sviluppo tecnico, ma va definita prima della monetizzazione abituale.

## Apple App Store

Requisiti già coperti tecnicamente:
- percorso di eliminazione account dentro l'app;
- Privacy Policy pubblica HTTPS;
- support URL disponibile;
- permessi fotocamera/libreria descritti;
- nessun microfono richiesto.

Da completare:
- App Privacy in App Store Connect coerente con il build finale;
- classificazione età;
- screenshot reali;
- descrizione e parole chiave;
- account demo per review;
- TestFlight su dispositivi reali;
- verifica privacy manifest delle dipendenze native;
- billing se Premium attivo.

## Google Play

Requisiti già coperti tecnicamente:
- percorso in-app di cancellazione;
- pagina web esterna di cancellazione;
- Privacy Policy pubblica;
- permessi Android minimizzati a fotocamera e notifiche; microfono bloccato.

Da completare:
- modulo Data safety;
- URL cancellazione account nella sezione dedicata Play Console;
- classificazione contenuti;
- screenshot/feature graphic;
- AAB firmato;
- test interno/chiuso su dispositivi reali;
- FCM;
- billing se Premium attivo.

Vedi anche `docs/STORE_PRIVACY_DECLARATIONS.md`.

## Backup e continuità

`scripts/backup-database.sh` prepara un dump cifrato, ma il backup non è ancora una garanzia finché non viene:
- schedulato;
- salvato in destinazione separata;
- monitorato;
- provato con un ripristino reale in ambiente isolato.

Prima del lancio eseguire almeno un restore test completo e verificare conteggi, utenti fittizi, allegati, migrazioni e avvio backend.

## Collaudo finale app

Provare su Android e iPhone reali:
- registrazione completa;
- login/logout/sessioni;
- invito altro genitore;
- famiglia e figli;
- calendario e permanenze;
- scambi;
- spese, approvazioni, OTP e rimborsi;
- upload documenti/ricevute;
- chat e allegati;
- dossier/esportazione;
- invito professionista e revoca scope;
- cancellazione account;
- tastiera, piccoli schermi, tablet, font grandi, TalkBack/VoiceOver;
- rete lenta/offline/riconnessione.

## Stato pubblicazione

DueCase è in fase avanzata di collaudo, ma non va dichiarata pronta agli store finché non sono chiusi i blocchi: email, push, billing (se attivo), cancellazione dati condivisi, revisione legale e test reali su dispositivi.
