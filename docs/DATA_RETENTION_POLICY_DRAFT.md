# DueCase — Data Retention Policy (bozza operativa)

Stato: bozza tecnica da validare con il legale prima della pubblicazione.

## Principi

DueCase deve conservare i dati solo per il tempo necessario alle finalità del servizio, agli obblighi applicabili e alla tutela degli utenti. I tempi definitivi non devono essere inventati: vanno validati prima del lancio e poi riportati coerentemente nella Privacy Policy.

## Classi di dati

### Account genitore
Dati: nome, cognome, email, telefono facoltativo, data di nascita, codice fiscale, ruolo, credenziali, preferenze, sessioni.

Regola proposta:
- durante account attivo: conservazione necessaria all'erogazione del servizio;
- dopo eliminazione account: credenziali revocate e dati anagrafici eliminati/neutralizzati senza ritardo ingiustificato;
- eventuali dati strettamente necessari per sicurezza, contenzioso o obblighi di legge: conservazione solo per il periodo giustificato e documentato.

### Dati figli
Dati: nome, data di nascita e collegamenti a calendario, spese, accordi, documenti.

Regola proposta:
- conservazione finché necessaria alla famiglia attiva;
- cancellazione/anonimizzazione in caso di chiusura definitiva della famiglia secondo la policy validata;
- nessuna fotografia/avatar del figlio nel profilo.

### Messaggi e allegati
Dati: testo, mittente, timestamp, allegati e hash.

Stato attuale: messaggi e allegati sono progettati come immutabili/append-only.

Decisione necessaria prima del lancio:
1. definire una base legittima e un periodo di conservazione dello storico condiviso; oppure
2. introdurre una procedura di rimozione del contenuto personale su cancellazione account mantenendo soltanto metadati/audit minimi.

Finché la decisione non è validata, non dichiarare agli store che tutti i messaggi e allegati vengono cancellati con l'account.

### Spese, rimborsi, ricevute e contabili
Regola proposta:
- conservare durante la vita della famiglia per gestione delle richieste e dello storico;
- definire periodo post-chiusura e trattamento degli allegati;
- rimuovere dati eccedenti quando non più necessari.

### Accordi, calendario, permanenze e richieste di scambio
Regola proposta:
- conservazione per la vita della famiglia e per il periodo successivo strettamente necessario alla funzione di storico;
- definire limite temporale e criteri di cancellazione.

### Documenti caricati
Regola proposta:
- conservare finché l'utente/famiglia li mantiene nel servizio;
- consentire cancellazione dove compatibile con la funzione e con i diritti dell'altro genitore;
- definire regola specifica per documenti già inclusi in dossier/esportazioni generate.

### Accessi professionisti
Dati: email professionista, invito, scope, grant, audit.

Regola proposta:
- revoca immediata dell'accesso quando il genitore revoca il grant;
- conservazione minima dei log di sicurezza/audit per il periodo validato;
- nessuna copia autonoma dei dati della famiglia creata dal portale oltre quanto necessario al servizio.

### Notifiche e push token
Regola proposta:
- token push solo finché associato a un dispositivo/account attivo;
- rimozione al logout/eliminazione account e pulizia periodica dei token non più validi.

### Sessioni e challenge di sicurezza
Regola proposta:
- sessioni fino a scadenza o revoca;
- OTP/challenge scaduti eliminati periodicamente;
- log di sicurezza per un periodo definito e proporzionato.

### Backup
Regola proposta:
- backup cifrati;
- retention breve e documentata;
- cancellazione automatica delle copie scadute;
- dati cancellati in produzione possono permanere nei backup soltanto fino alla naturale rotazione prevista, senza essere ripristinati salvo disaster recovery.

## Richieste dell'interessato

Prevedere una procedura per:
- accesso;
- rettifica;
- esportazione;
- cancellazione;
- limitazione/opposizione ove applicabile;
- verifica dell'identità del richiedente.

Contatto: privacy@duecaseununicasquadra.com

## Revisione

La policy deve essere riesaminata quando cambiano:
- categorie di dati;
- provider;
- funzionalità;
- billing;
- sistemi di analytics/marketing;
- normativa o indicazioni del Garante/store.
