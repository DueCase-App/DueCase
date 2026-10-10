# DueCase Agent Team — Architecture

## Obiettivo

Costruire una squadra di agenti che riduca al minimo il lavoro manuale del fondatore, mantenendo controllo umano su pagamenti, contratti, aspetti fiscali e altre azioni irreversibili.

## Principio architetturale

La squadra è ibrida:

- **n8n** orchestration: processi operativi DueCase, KPI, health check, issue tecniche, workflow interni e integrazioni con API minimizzate.
- **ChatGPT scheduled agents**: ricerca pubblica aggiornata e analisi che richiedono accesso al web, finché non viene approvata/configurata una API AI dedicata in n8n.
- **GitHub**: source of truth per prompt, regole operative e modifiche di prodotto/codice.
- **DueCase backend**: unica porta verso i dati applicativi per gli agenti. Nessun accesso diretto del database DueCase da n8n.

## Agenti

### 1. CEO Agent
Coordina gli output degli agenti, assegna massimo 3 priorità e distingue azioni automatiche da decisioni che richiedono approvazione.

### 2. Monetization Scout
Ricerca e confronta modelli di monetizzazione leciti, incluso il vincolo di evitare se possibile la vendita diretta abituale come persona fisica. Non attiva pagamenti e non fornisce certezze fiscali senza verifica professionale.

Stato: prompt versionato nel repository; esecuzione di ricerca programmata via ChatGPT.

### 3. Growth Agent
Legge KPI aggregati tramite endpoint dedicato e individua colli di bottiglia del funnel.

Stato: workflow n8n pubblicato.

### 4. Marketing Agent
Da implementare. Ricerca canali, partnership, contenuti e campagne. Pubblicazione/invio richiedono approvazione finché non viene definito un perimetro automatico.

### 5. Product Agent
Da implementare. Converte feedback e metriche in proposte prodotto e issue GitHub.

### 6. Technical/Ops Agent
Da implementare. Controlla deploy, errori, disponibilità servizi, database e scadenze infrastrutturali.

### 7. Support Agent
Da implementare. Classifica richieste e prepara risposte; nessun invio automatico di comunicazioni sensibili senza regole approvate.

### 8. Finance Agent
Da implementare. Tiene costi, ricavi, MRR, scenari e break-even. Non spende denaro né modifica prezzi.

## Livelli di autonomia

### Verde — automatico
- monitoraggio e lettura;
- ricerca pubblica;
- analisi KPI aggregati;
- report;
- health check;
- issue tecniche non distruttive;
- bozze non inviate;
- test sandbox.

### Giallo — prepara, poi approvazione
- contatti con partner;
- invio email commerciali;
- pubblicazione marketing;
- modifiche funzionali importanti;
- migrazioni con costo;
- modifiche a paywall, privacy, termini o policy.

### Rosso — mai senza approvazione esplicita
- pagamenti reali;
- spese;
- contratti;
- strutture fiscali/societarie;
- trasferimento IP/quote;
- modifiche prezzo in produzione;
- cancellazioni irreversibili di dati;
- comunicazioni legali.

## Stato pagamenti

I pagamenti DueCase restano non attivati. RevenueCat, enforcement Premium e prezzi in produzione non devono essere modificati dagli agenti senza approvazione esplicita del fondatore.

## Ordine di implementazione

1. Monetization Scout
2. CEO Agent
3. Technical/Ops Agent
4. Marketing Agent
5. Product Agent
6. Support Agent
7. Finance Agent
8. integrazione completa dei report nel CEO Brief

Il Growth Agent esiste già e viene integrato progressivamente nella squadra.
