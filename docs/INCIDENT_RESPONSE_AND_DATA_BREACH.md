# DueCase — Incident Response e Data Breach

Stato: procedura operativa interna da validare prima del lancio pubblico.

## Obiettivo

Gestire in modo rapido e documentato incidenti di sicurezza, accessi non autorizzati, perdita di disponibilità, esposizione di dati personali e possibili violazioni di dati personali.

## Contatti operativi

- Assistenza utenti: assistenza@duecaseununicasquadra.com
- Privacy: privacy@duecaseununicasquadra.com
- Legale: legal@duecaseununicasquadra.com

Prima del lancio assegnare nominativamente:
- responsabile tecnico incidente;
- referente privacy;
- referente legale;
- persona autorizzata alle comunicazioni verso utenti e Autorità.

## Classificazione iniziale

### P1 — Critico
Esempi:
- accesso non autorizzato a più famiglie;
- esfiltrazione di documenti/messaggi;
- credenziali o segreti di produzione compromessi;
- cancellazione/corruzione massiva di dati;
- vulnerabilità attivamente sfruttata.

Azione: contenimento immediato, blocco delle credenziali coinvolte, preservazione evidenze, valutazione data breach.

### P2 — Alto
Esempi:
- accesso improprio a una singola famiglia;
- token/sessione compromessa;
- esposizione limitata di documenti o allegati;
- errore applicativo con rischio di divulgazione.

Azione: contenere, revocare sessioni/token, analisi entro poche ore.

### P3 — Medio/Basso
Esempi:
- indisponibilità temporanea senza perdita dati;
- bug UI senza esposizione dati;
- singolo errore di notifica non contenente dati sensibili.

Azione: ticket, analisi e correzione secondo priorità.

## Flusso operativo

1. **Rilevazione**
   - registrare data/ora, fonte della segnalazione, ambiente e sintomi;
   - non copiare inutilmente contenuti personali in ticket o chat interne.

2. **Contenimento**
   - revocare token/sessioni compromessi;
   - ruotare segreti se necessario;
   - disabilitare temporaneamente endpoint/funzioni coinvolte;
   - limitare accessi operatori.

3. **Preservazione evidenze**
   - conservare log tecnici pertinenti;
   - annotare hash/versioni/deploy coinvolti;
   - evitare modifiche distruttive prima di avere una copia delle evidenze tecniche necessarie.

4. **Valutazione impatto privacy**
   Identificare:
   - categorie di dati coinvolte;
   - numero stimato di persone/famiglie;
   - presenza di dati di minori;
   - presenza di messaggi, documenti, dati sanitari o economici;
   - durata dell'esposizione;
   - probabilità che i dati siano stati effettivamente consultati/esfiltrati.

5. **Correzione**
   - correggere vulnerabilità/configurazione;
   - aggiungere test di regressione;
   - ridistribuire in modo controllato;
   - verificare che il problema non sia più riproducibile.

6. **Comunicazioni**
   - valutare con referente privacy/legale se sussistono obblighi di notifica all'Autorità e/o agli interessati;
   - non inviare comunicazioni speculative o tecnicamente non verificate;
   - conservare copia della decisione e delle motivazioni.

7. **Chiusura e post-mortem**
   - causa radice;
   - timeline;
   - impatto;
   - azioni correttive;
   - azioni preventive;
   - responsabile e scadenza di ogni azione.

## Regola 72 ore GDPR

In caso di violazione di dati personali, la valutazione della notifica al Garante deve essere avviata immediatamente. L'art. 33 GDPR prevede, quando applicabile, la notifica all'autorità di controllo senza ingiustificato ritardo e, ove possibile, entro 72 ore dal momento in cui il titolare ne viene a conoscenza.

La decisione di notificare o meno deve essere documentata; questa procedura non sostituisce il parere legale sul singolo incidente.

## Logging e segreti

Non registrare nei log:
- password;
- OTP completi;
- token JWT/sessione;
- segreti SMTP/API;
- contenuto completo di documenti/chat salvo stretta necessità tecnica e ambiente protetto.

Preferire identificativi tecnici, codici errore e riferimenti record.

## Test periodico

Prima del lancio e poi periodicamente simulare almeno:
- account compromesso;
- token push errato/duplicato;
- accesso professionista revocato;
- indisponibilità database;
- ripristino da backup;
- fuga di una variabile segreta con rotazione immediata.
