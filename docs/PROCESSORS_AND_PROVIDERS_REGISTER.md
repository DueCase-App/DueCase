# DueCase — Registro fornitori / responsabili da completare

Stato: inventario tecnico iniziale. Prima del lancio va verificato contrattualmente il ruolo privacy di ciascun soggetto, i sub-responsabili, le regioni di trattamento e gli eventuali trasferimenti internazionali.

| Fornitore / servizio | Uso previsto | Dati potenzialmente coinvolti | Stato da verificare |
|---|---|---|---|
| Render | Hosting API, sito e database PostgreSQL | account, famiglia, contenuti, log tecnici | DPA, regione, sub-processors, backup, trasferimenti |
| Expo / EAS | build app e infrastruttura Expo; token/notifiche secondo configurazione | identificatori progetto/dispositivo, token push, dati tecnici | DPA/privacy, flussi push, retention |
| Firebase / Google FCM | push Android quando attivato | token dispositivo e payload notifiche | configurazione, DPA/ruolo, minimizzazione payload |
| Apple APNs | push iOS quando attivato | token dispositivo e payload notifiche | configurazione e minimizzazione payload |
| Apple App Store | distribuzione e abbonamenti iOS | account store, acquisti, identificativi transazione | condizioni developer, privacy, billing |
| Google Play | distribuzione e abbonamenti Android | account store, acquisti, identificativi transazione | condizioni developer, Data safety, billing |
| Provider email da definire | email transazionali, inviti, OTP/recupero | email destinatario, contenuto transazionale, metadati | DA SCEGLIERE: DPA, regione, sub-processors, retention |
| Aruba | dominio e caselle email | metadati email/caselle, DNS | ruolo, termini/DPA applicabili |
| GitHub | repository e CI | codice, log CI; evitare dati utenti/segreti | accessi, secrets, retention log |

## Regole operative

1. Nessun nuovo SDK/provider va aggiunto in produzione senza aggiornare questo inventario e le dichiarazioni privacy/store.
2. I segreti dei provider devono essere conservati nei secret manager/variabili protette, mai nel repository.
3. I payload di email e notifiche devono contenere il minimo necessario.
4. Prima di affidare dati personali a un responsabile del trattamento verificare la documentazione contrattuale prevista dall’art. 28 GDPR quando applicabile.
5. Per trattamenti extra SEE verificare il meccanismo di trasferimento applicabile e documentarlo.
6. Riesaminare almeno in occasione di ogni rilascio che introduce nuovi SDK, analytics, billing, supporto o infrastruttura.

## Campi da completare per ciascun fornitore prima del lancio

- denominazione legale;
- ruolo privacy (titolare autonomo/responsabile/sub-responsabile/altro);
- finalità;
- categorie di dati;
- interessati;
- Paesi/regioni di trattamento;
- base del trasferimento internazionale, se presente;
- DPA/contratto e data di accettazione;
- elenco sub-responsabili e modalità di notifica modifiche;
- retention;
- misure di sicurezza rilevanti;
- referente/URL privacy;
- data ultima revisione.
