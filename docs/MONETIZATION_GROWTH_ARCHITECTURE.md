# DueCase — Monetization & Growth Architecture

## Obiettivo

Portare DueCase da prodotto funzionante a servizio in abbonamento misurabile, con un obiettivo iniziale di riferimento pari a **1.000 € di MRR lordo**.

Prezzo di listino previsto: **4,99 €/mese per famiglia**, senza periodo di prova gratuito. A prezzo pieno servono circa **201 famiglie paganti** per superare 1.000 € di MRR lordo, prima di commissioni degli store, imposte, rimborsi e altri costi.

## Principi

1. Il pagamento mobile passa dai sistemi degli store.
2. RevenueCat unifica Apple/Google e mantiene l'entitlement `premium_family`.
3. Il backend DueCase rimane la fonte applicativa dell'accesso famiglia.
4. n8n non decide chi ha pagato: legge KPI e automatizza Growth/CRM.
5. I dati familiari sensibili non entrano nel sistema Growth.
6. Campagne a pagamento e comunicazioni esterne possono richiedere approvazione umana e limiti di budget.

## Identità abbonamento

- Product ID: `duecase_premium_monthly`
- Entitlement: `premium_family`
- Prezzo target: 4,99 €/mese
- Trial: nessuno
- Customer/App User ID RevenueCat dopo la creazione della famiglia: `family:<family_uuid>`

Usare lo stesso App User ID per entrambi i genitori della famiglia consente al backend di associare l'entitlement alla famiglia. Il client non deve mai decidere autonomamente lo stato Premium definitivo.

## Backend

### `POST /api/billing/revenuecat/webhook`

Endpoint server-to-server. Verifica il valore dell'header `Authorization` contro `REVENUECAT_WEBHOOK_AUTH`.

Eventi principali gestiti:

- `INITIAL_PURCHASE` → active
- `RENEWAL` → active
- `UNCANCELLATION` → active
- `SUBSCRIPTION_EXTENDED` → active
- `CANCELLATION` → canceled fino alla scadenza
- `BILLING_ISSUE` → past_due, accesso mantenuto finché il periodo è ancora valido
- `EXPIRATION` → inactive

Gli eventi vengono resi idempotenti tramite l'ID evento RevenueCat in `growth_events.event_key`.

### `POST /api/growth/event`

Endpoint autenticato usato dal client solo per eventi prodotto minimizzati, ad esempio:

- `paywall_viewed`
- `premium_cta_clicked`
- `purchase_started`
- `restore_started`
- `restore_completed`
- eventi onboarding

Non deve ricevere testo di messaggi, documenti, ricevute, dati sanitari, scolastici o informazioni dei figli.

### `GET /api/growth/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`

Endpoint destinato all'agente Growth/n8n. Richiede header:

`x-growth-agent-key: <GROWTH_AGENT_KEY>`

Restituisce solo dati aggregati:

- registrazioni
- verifiche email
- famiglie create
- famiglie complete
- famiglie Premium della coorte
- tassi di conversione
- famiglie Premium correnti
- MRR lordo stimato al prezzo di listino
- conteggi eventi Growth

## Privacy boundary

Il sistema Growth non deve usare per marketing o ottimizzazione:

- contenuto della chat tra genitori
- dossier o PDF
- documenti caricati
- ricevute di spesa
- informazioni testuali relative ai figli
- dati professionali/legali non necessari

Le FK `user_id` e `family_id` della tabella Growth usano `ON DELETE SET NULL`, così la cancellazione dell'account/famiglia può rimuovere il collegamento personale preservando conteggi anonimi storici.

## n8n — agenti

### 1. Daily Growth Brief

Input:
- `/api/growth/summary` ultimi 7 giorni
- `/api/growth/summary` ultimi 30 giorni

Output:
- situazione funnel
- variazioni principali
- collo di bottiglia più importante
- massimo 3 azioni prioritarie

### 2. Family Completion

Target: famiglie con un solo genitore dopo una finestra definita.

Azione: promemoria non aggressivo per completare l'invito. Interrompere il workflow appena la famiglia è completa.

### 3. Paywall Recovery

Target: famiglie che visualizzano il paywall senza acquisto.

Azione: messaggio/email consentita e misurabile, con frequency cap. Non inviare informazioni derivanti da contenuti familiari privati.

### 4. Premium Lifecycle

Eventi:
- nuova sottoscrizione
- rinnovo
- cancellazione
- problema di pagamento
- scadenza

Azione:
- aggiornamento KPI
- comunicazioni transazionali quando appropriate
- segnalazione anomalie

### 5. Weekly Growth Review

Report settimanale:
- MRR
- nuove famiglie Premium
- conversione
- churn/scadenze
- paywall → acquisto
- test/esperimenti in corso
- raccomandazione per la settimana successiva

## Regole dell'agente Growth

L'agente ottimizza per abbonamenti sostenibili, non per click o messaggi inviati.

Priorità:
1. prodotto funzionante
2. onboarding e completamento famiglia
3. conversione Premium
4. retention
5. solo dopo, aumento della spesa pubblicitaria

L'agente non deve:
- modificare il prezzo automaticamente
- lanciare campagne a pagamento senza un limite di budget approvato
- inviare comunicazioni legali
- usare dati dei figli o contenuti privati per segmentazione
- promettere risultati economici

## Fasi di attivazione

### Fase A — Foundation
- growth_events
- endpoint KPI
- webhook RevenueCat
- segreti server-to-server

### Fase B — Store billing
- creare progetto/app RevenueCat
- configurare App Store Connect
- configurare Google Play Console
- aggiungere SDK RevenueCat al frontend Expo
- paywall e ripristino acquisti
- sandbox test

### Fase C — n8n
- istanza n8n persistente
- secret `GROWTH_AGENT_KEY`
- workflow Daily/Weekly
- email/CRM recovery
- logging azioni

### Fase D — Growth
- baseline funnel
- primi esperimenti controllati
- acquisizione organica
- advertising solo con KPI sufficienti e budget massimo esplicito
