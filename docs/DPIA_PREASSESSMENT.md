# DueCase — Pre-valutazione DPIA

Stato: documento preparatorio, non costituisce una DPIA definitiva né un parere legale. Da riesaminare con il referente privacy/legale prima del lancio.

## Perché effettuare la valutazione

DueCase è destinata a genitori separati e tratta dati familiari che possono riguardare minori. Gli utenti possono inoltre caricare liberamente documenti, messaggi e note che potrebbero contenere informazioni sanitarie, giudiziarie o comunque molto delicate. Per prudenza è opportuno valutare formalmente se ricorrano i presupposti dell’art. 35 GDPR e documentare la decisione.

## Trattamenti principali

- account e autenticazione dei genitori;
- dati anagrafici dei figli inseriti dai genitori;
- calendario, permanenze e richieste di scambio;
- spese, rimborsi, ricevute e contabili;
- accordi e relativo storico;
- documenti e allegati;
- messaggistica tra genitori;
- Dossier ed esportazioni;
- notifiche;
- accesso professionisti in sola lettura con permessi selettivi;
- log di sicurezza, sessioni e audit.

## Interessati

- genitori/adulti titolari di account;
- figli minorenni i cui dati vengono inseriti dai genitori;
- professionisti invitati;
- eventuali terzi presenti nei documenti caricati dagli utenti.

## Fattori di rischio da approfondire

1. **Minori:** soggetti vulnerabili e dati relativi alla vita familiare.
2. **Contenuti delicati:** possibile presenza di dati sanitari, giudiziari, economici e comunicazioni private.
3. **Conflittualità tra utenti:** i due genitori possono avere interessi contrapposti; un controllo di accesso errato potrebbe causare danni concreti.
4. **Storico immutabile:** messaggi/allegati append-only possono entrare in tensione con richieste di cancellazione o minimizzazione.
5. **Esportazioni/Dossier:** concentrazione di molte informazioni in un unico file esportabile.
6. **Professionisti:** rischio di autorizzazioni troppo ampie o non revocate.
7. **Account takeover:** accesso a dati familiari altamente personali in caso di compromissione credenziali/sessione.
8. **Notifiche:** rischio di esposizione del contenuto sulla schermata di blocco.
9. **Backup:** persistenza temporanea di dati già eliminati.
10. **Fornitori terzi:** trasferimenti, accessi amministrativi e sub-responsabili.

## Misure già previste

- famiglie logicamente separate;
- autenticazione e sessioni revocabili;
- hash password bcrypt;
- HTTPS;
- token nel secure storage del dispositivo;
- accesso professionisti separato e in sola lettura;
- scope professionali espliciti e revocabili;
- messaggi esclusi di default dai permessi professionali;
- doppia conferma eliminazione account;
- revoca sessioni e permessi professionali alla cancellazione dell’account;
- minimizzazione dei permessi nativi: niente microfono, fotocamera/libreria solo per allegati;
- nessuna foto/avatar dei figli nel profilo;
- rate limiting sui flussi sensibili;
- procedure di backup cifrato, restore test, incident response e data breach;
- versionamento dell’accettazione Privacy/Termini;
- nessun advertising/tracking previsto nella configurazione attuale.

## Misure ancora da chiudere

- retention policy definitiva per messaggi, allegati e storico condiviso;
- elenco contrattuale completo di responsabili/sub-responsabili;
- email transazionali produttive;
- configurazione e collaudo push Android/iOS;
- processo di billing e relativi provider;
- test di backup/restore reale;
- test di sicurezza e autorizzazioni tra famiglie/professionisti;
- policy per preview contenuti nelle notifiche;
- verifica di eventuali log contenenti dati personali;
- procedura periodica di revisione accessi amministrativi.

## Valutazione preliminare

Alla luce della presenza di dati di minori e della possibile concentrazione di informazioni familiari molto delicate, la scelta prudente è **non escludere a priori la necessità di una DPIA**. Prima del lancio pubblico occorre completare la valutazione rispetto ai criteri applicabili, documentare il livello di rischio residuo e far validare la conclusione da un professionista competente.

## Decisione da registrare prima del lancio

- DPIA necessaria: sì/no;
- motivazione;
- data della valutazione;
- soggetti coinvolti;
- misure aggiuntive richieste;
- data di riesame.
