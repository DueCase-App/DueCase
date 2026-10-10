# DueCase n8n

Questa cartella contiene la base per l'orchestrazione Growth di DueCase.

## Separazione obbligatoria

n8n deve usare un database proprio. Non usare le stesse credenziali PostgreSQL dell'app DueCase: i workflow Growth non devono poter leggere direttamente messaggi, documenti, ricevute o dati dei figli.

n8n accede ai dati DueCase solo tramite endpoint API minimizzati, principalmente:

`GET https://duecase-api.onrender.com/api/growth/summary`

Header richiesto:

`x-growth-agent-key: <GROWTH_AGENT_KEY>`

## Variabili n8n

Configurare come secret/environment:

- `DUECASE_API_URL=https://duecase-api.onrender.com/api`
- `GROWTH_AGENT_KEY=<stesso secret configurato sul backend DueCase>`
- credenziale del modello AI scelto
- eventuale credenziale email/CRM usata dai singoli workflow

Non salvare secret nei workflow esportati o nel repository.

## Workflow 1 — Daily Growth Brief

Trigger: ogni giorno, ad esempio ore 08:00 Europe/Rome.

Nodi:

1. **Schedule Trigger**
2. **HTTP Request — KPI 7 giorni**
   - GET `{{$env.DUECASE_API_URL}}/growth/summary`
   - query `from` = oggi - 6 giorni
   - query `to` = oggi
   - header `x-growth-agent-key={{$env.GROWTH_AGENT_KEY}}`
3. **HTTP Request — KPI 30 giorni**
   - stessa configurazione, `from` = oggi - 29 giorni
4. **AI Agent**
   - system prompt: `GROWTH_AGENT_PROMPT.md`
   - input: JSON dei due endpoint
5. **Approval/Delivery**
   - inviare il brief al canale scelto oppure salvarlo nel sistema operativo interno

Il nodo AI non deve avere accesso al database DueCase.

## Workflow 2 — Weekly Growth Review

Trigger: lunedì mattina.

Input:
- KPI ultimi 7 giorni
- KPI 30 giorni
- KPI periodo precedente equivalente

Output:
- MRR lordo stimato
- nuove famiglie Premium
- conversione registrazione → famiglia
- conversione famiglia → Premium
- paywall → acquisto quando disponibile
- cancellazioni/scadenze
- massimo 3 esperimenti per la settimana

## Workflow 3 — Family Completion

Questo workflow deve usare un endpoint dedicato/segmento server-side e non query dirette al DB.

Regole:
- interviene solo sulle famiglie con un solo genitore dopo una finestra temporale definita
- massimo un numero limitato di reminder
- si arresta non appena il secondo genitore entra
- nessuna informazione sui figli nel contenuto Growth

## Workflow 4 — Paywall Recovery

Trigger logico: paywall visualizzato ma nessun entitlement Premium dopo la finestra stabilita.

Regole:
- frequency cap
- opt-out rispettato
- nessun contenuto manipolativo
- nessun utilizzo di messaggi/documenti/dati familiari per personalizzare la comunicazione

## Workflow 5 — Premium Lifecycle

Fonte: eventi RevenueCat già sincronizzati dal backend.

Gestire:
- nuova sottoscrizione
- rinnovo
- cancellazione
- billing issue
- scadenza

Le comunicazioni devono distinguere notifiche transazionali da marketing.

## Prima attivazione

1. completare configurazione RevenueCat e store
2. creare un database separato per n8n
3. distribuire n8n
4. generare `GROWTH_AGENT_KEY`
5. inserire lo stesso secret nel backend DueCase e in n8n
6. importare/configurare i workflow
7. eseguire test con dati sandbox
8. solo dopo attivare le schedulazioni reali

## Render

`render-blueprint.example.yaml` mostra la struttura iniziale. Il piano gratuito è adatto solo alle prove perché il web service può andare in sleep e il database free non è una base permanente per automazioni 24/7.
