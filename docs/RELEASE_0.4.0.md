# DueCase 0.4.0 — dossier e preparazione alla pubblicazione

## Modifiche
- Dossier PDF in italiano con font incorporato, indice e pagine; ZIP con originali, CSV spese/rimborsi, testo e dati strutturati, manifest SHA-256. Filtri per periodo, figlio e sezioni; limiti espliciti, anomalie segnalate, snapshot transazionale. Incluse spese rifiutate, versioni accordi e registro attività. Accesso limitato alla famiglia.
- Tastiera gestita misurando l'effettiva sovrapposizione, anche su Android edge-to-edge; pulsanti principali spese, figli e accordi fuori dall'area che scorre. Header Figli adattabile; date spese normalizzate; categorie italiane; profilo legacy inizializzato dal nome visualizzato.
- Permanenze con selezione figlio e proposta di cambio dal calendario.
- Sessioni consultabili e revocabili singolarmente; cambio email con password e codice monouso; inviti con scadenza, rigenerazione e revoca. Recupero/cambio password preesistenti mantenuti.
- Anteprime push riservate per impostazione predefinita; preferenze separate dal collegamento effettivo. Sospensione reversibile chat e segnalazioni riservate, CLI operatore. La presa in carico reale resta da attivare.
- Pagina esterna /account-deletion; collegamenti informativa/condizioni/assistenza configurabili. Descrizione trasparente della conservazione attuale dei dati condivisi. Registrazione professionisti rimossa finché il flusso non è pronto.
- Script backup cifrato predisposto, non pianificato; checklist PUBBLICAZIONE.md con blocchi residui.

## Verifica
15 test di integrazione passati su PostgreSQL PGlite temporaneo: dossier completo, ZIP/hash, filtri, isolamento, CSV sicuro, flussi spese/messaggi/accordi, sessioni, codici email e cancellazione. TypeScript frontend/backend; audit dipendenze backend produzione senza vulnerabilità segnalate. PDF di esempio con dati fittizi renderizzato e controllato.

## Limiti
Non è una release store pronta. SMTP, FCM/APNs, billing, dominio, informative/retention finali e assistenza reale restano da configurare/validare. Il ripristino backup remoto e il collaudo fisico Android/iOS non sono stati eseguiti. Selezione automatica di una specifica voce storica dalle notifiche e approvazione dello schema settimanale non sono incluse. Nessuna promessa di firma qualificata, certificazione o valore probatorio garantito.
