# DueCase — dichiarazioni privacy App Store / Google Play

Stato: bozza operativa aggiornata all’8 ottobre 2026. Va ricontrollata sul binario finale e sugli SDK effettivamente inclusi prima dell'invio agli store.

## URL pubblici da usare negli store

- Sito: https://www.duecaseununicasquadra.com
- Privacy: https://www.duecaseununicasquadra.com/privacy.html
- Termini: https://www.duecaseununicasquadra.com/termini.html
- Cookie: https://www.duecaseununicasquadra.com/cookie.html
- Cancellazione account: https://www.duecaseununicasquadra.com/cancellazione-account.html
- Assistenza: https://www.duecaseununicasquadra.com/assistenza.html
- Email assistenza: assistenza@duecaseununicasquadra.com
- Email privacy: privacy@duecaseununicasquadra.com

## Eliminazione account

DueCase offre il percorso in-app `Impostazioni > Privacy e dati > Elimina account`, con doppia conferma. È presente anche la risorsa web pubblica richiesta da Google Play.

**Blocco da chiudere prima della pubblicazione:** il backend attuale elimina le credenziali e i dati anagrafici del profilo, ma conserva record condivisi della famiglia attribuendoli ad “Account eliminato”. Prima dello store review bisogna definire, con la policy di conservazione validata, quali contenuti condivisi possano essere mantenuti per un motivo legittimo e quali contenuti personali/allegati debbano essere eliminati. Non dichiarare agli store “tutti i dati cancellati” finché questo comportamento non è finalizzato.

Riferimenti ufficiali da ricontrollare al momento della submission:
- Apple: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/
- Google Play: https://support.google.com/googleplay/android-developer/answer/13327111

## Dati raccolti dall'app — bozza di inventario

### Dati account e contatto
- Nome e cognome
- Email
- Telefono facoltativo
- Data di nascita
- Ruolo familiare (Papà/Mamma)
- Identificativo interno account/famiglia

Uso: creazione e gestione account, sicurezza, collegamento alla famiglia, assistenza e funzioni principali.

### Dati dei figli
- Nome
- Data di nascita, se inserita
- Informazioni collegate a calendario, permanenze, spese, accordi e documenti

Non sono previste fotografie o avatar dei figli nel profilo.

### Contenuti creati dagli utenti
- Messaggi
- Eventi e note calendario
- Turni/permanenze e richieste di scambio
- Accordi e relative versioni/stati
- Spese, quote, rimborsi e relative descrizioni
- Documenti, ricevute e contabili caricati volontariamente
- Dossier/esportazioni

Questi contenuti possono includere, se inseriti dall'utente, informazioni particolarmente personali o sanitarie. Le dichiarazioni store devono riflettere il contenuto realmente consentito dall'app, non soltanto i campi strutturati.

### Foto/fotocamera
L'app richiede accesso a fotocamera/libreria solo per permettere all'utente di scegliere o fotografare ricevute e documenti da allegare. Non è previsto accesso al microfono.

### Informazioni finanziarie
DueCase tratta importi di spese/rimborsi e stato dei pagamenti tra genitori. Non raccoglie direttamente numeri di carta o credenziali bancarie. Gli eventuali acquisti Premium saranno gestiti dagli store e dovranno essere dichiarati in base all'implementazione finale del billing.

### Identificatori tecnici
- Token push Expo/dispositivo associato all'account
- Token/sessioni di autenticazione
- Informazioni tecniche necessarie a sicurezza e funzionamento

Verificare sul binario finale se SDK o servizi raccolgano ulteriori identificatori/diagnostica.

## Finalità da dichiarare

- Funzionalità dell'app
- Gestione account
- Sicurezza e prevenzione abusi
- Comunicazioni/notifiche richieste dall'utente
- Assistenza
- Pagamenti/abbonamenti, solo quando il billing sarà attivato

Al momento non sono previste finalità pubblicitarie, marketing comportamentale o tracking cross-app/cross-site.

## Condivisione e accessi

- L'altro genitore vede i dati condivisi della stessa famiglia secondo la funzione utilizzata.
- Un professionista può accedere solo su invito e solo alle sezioni autorizzate; accesso in sola lettura e revocabile.
- I fornitori tecnici (hosting, database, email, push, store) devono essere censiti come responsabili/sub-responsabili o destinatari secondo il ruolo effettivo.
- Non classificare automaticamente l'uso di un fornitore tecnico come “data sharing” nello store: verificare la definizione specifica Apple/Google e il contratto/uso del fornitore.

## Apple App Privacy — bozza categorie

Probabili categorie da dichiarare come raccolte e collegate all'identità:
- Contact Info: Name, Email Address, Phone Number
- Identifiers: User ID / account identifiers
- User Content: Emails or Text Messages, Photos or Videos se usati come allegati, Other User Content
- Financial Info: Other Financial Info per spese/rimborsi (da verificare nella tassonomia corrente)
- Sensitive Info: valutare in base ai contenuti familiari e agli eventuali documenti/annotazioni con dati relativi alla salute o altre categorie sensibili effettivamente consentite dal build finale
- Purchases: quando sarà attivo l'abbonamento

Non dichiarare “Tracking” salvo introduzione futura di SDK o pratiche che rientrino nella definizione Apple.

## Google Play Data safety — bozza categorie

Probabili dati raccolti:
- Personal info: Name, Email address, Phone number, User IDs, Other info
- Financial info: Purchase history quando il Premium sarà attivo; altri dati finanziari per spese/rimborsi da classificare secondo il form corrente
- Messages: Other in-app messages
- Photos and videos: solo allegati scelti dall'utente, se la categoria corrente lo richiede
- Files and docs: documenti/ricevute caricati
- App activity / Other user-generated content: verificare tassonomia al momento della submission

Per ciascuna categoria indicare correttamente: required/optional, purpose, collection, sharing, ephemeral/non-ephemeral, deletion availability.

## Sicurezza — verifiche prima di dichiarare

- Trasmissione: API e sito devono usare HTTPS in produzione.
- Crittografia a riposo: verificare e documentare quanto garantito dal provider database/storage prima di selezionare la relativa risposta nello store.
- Password: hash bcrypt lato server; non memorizzare password in chiaro.
- Sessioni/token: revocabili; token salvati in secure storage sul dispositivo.
- Accesso professionista separato dall'account genitore e con scope espliciti.
- Rate limiting sui flussi sensibili.
- Backup: eseguire test reale di backup e ripristino prima del lancio.

## Checklist di submission

1. Ricontrollare dipendenze native/SDK del build finale e relativi privacy manifest/data safety.
2. Compilare Apple App Privacy in App Store Connect usando questo inventario come base.
3. Compilare Google Play Data safety e inserire il link web di cancellazione account.
4. Confermare che l'eliminazione account soddisfi il comportamento dichiarato.
5. Verificare privacy policy pubblica e priva di segnaposto.
6. Verificare assistenza e contatti realmente funzionanti.
7. Ripetere la revisione dopo l'attivazione di email, push e billing, perché possono modificare le dichiarazioni.
