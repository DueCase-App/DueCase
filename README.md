# Due Case / Separated Parents App — TypeScript

Monorepo pronto per GitHub con backend Node.js/Express/PostgreSQL e frontend React Native + Expo, entrambi interamente in TypeScript.

## Struttura

- `backend/`: API Express + PostgreSQL, autenticazione JWT, bcrypt, famiglie e dati condivisi.
- `frontend/`: app Expo/React Native con Login, Registrazione, onboarding famiglia e sessione persistente.
- `.github/workflows/ci.yml`: typecheck/build automatici.
- `render.yaml`: blueprint Render per API + PostgreSQL.

## Autenticazione e Codice Famiglia

Il flusso è il seguente:

1. Il genitore si registra scegliendo `Padre` o `Madre`.
2. L'account viene creato senza una famiglia associata.
3. Se è il primo genitore, seleziona **Crea Famiglia**: il backend crea la famiglia e genera un `invite_code` casuale e univoco.
4. Il secondo genitore crea il proprio account e seleziona **Inserisci codice**.
5. `/api/family/join` associa il secondo account alla stessa `family_id`.
6. Una famiglia può avere al massimo un utente `father` e un utente `mother`.
7. Le API di turni, spese e documenti ricavano la famiglia dall'utente autenticato: il client non può scegliere arbitrariamente un `familyId`.

Le password vengono salvate come hash bcrypt; il backend non conserva password in chiaro. Il JWT contiene l'identità dell'utente ed è verificato ad ogni richiesta protetta.

## Requisiti

- Node.js 22+
- PostgreSQL 15+
- Account Expo per EAS Build
- Account Render per il backend

## Backend locale

```bash
cd backend
cp .env.example .env
npm install jsonwebtoken bcrypt dotenv cors pg multer
npm install -D @types/jsonwebtoken @types/bcrypt @types/multer
npm install
npm run migrate
npm run dev
```

Configura almeno:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/separated_parents
JWT_SECRET=una-chiave-casuale-lunga-almeno-32-caratteri
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
```

API: `http://localhost:4000/api`

Health check: `GET /api/health`

### Endpoint autenticazione

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` — Bearer token richiesto
- `POST /api/family/create` — Bearer token richiesto
- `POST /api/family/join` — Bearer token richiesto

### API familiari protette

- `GET /api/turns?from=YYYY-MM-DD&to=YYYY-MM-DD` — calendario custodia giornaliero
- `PUT /api/turns/:date` — assegna/aggiorna la custodia ufficiale di un giorno
- `GET /api/swap-requests?status=pending` — richieste di cambio turno
- `POST /api/swap-requests` — propone lo scambio tra un giorno dell'altro genitore e un proprio giorno
- `POST /api/swap-requests/:id/approve` — accetta e scambia automaticamente i due giorni nel calendario ufficiale
- `POST /api/swap-requests/:id/reject` — rifiuta la proposta
- `GET /api/expenses` — elenco spese della famiglia
- `GET /api/expenses/balance` — saldo 50/50 calcolato esclusivamente sulle spese approvate
- `POST /api/expenses` — crea una spesa `multipart/form-data`, con ricevuta immagine facoltativa
- `GET /api/expenses/:id/receipt` — visualizza la ricevuta con JWT, solo per la stessa famiglia
- `POST /api/expenses/:id/approve` — l’altro genitore approva la spesa
- `POST /api/expenses/:id/decline` — l’altro genitore contesta la spesa
- `GET /api/documents` — elenco archivio della famiglia
- `POST /api/documents` — upload protetto `multipart/form-data` di PDF/immagini (max 20 MB)
- `GET /api/documents/:id/file` — visualizzazione/download protetto; verifica JWT e `family_id`

Tutte richiedono `Authorization: Bearer <JWT>` e usano automaticamente la `family_id` dell'utente autenticato. Le approvazioni dei cambi turno sono transazionali: se il calendario è cambiato dopo la richiesta, lo scambio viene bloccato invece di sovrascrivere dati più recenti.

### Spese condivise 50/50

Gli importi sono salvati in PostgreSQL come `NUMERIC(12,2)` e inviati dall'API come stringhe decimali (ad esempio `"100.00"`), evitando calcoli JavaScript in floating point. Solo le spese in stato `approved` concorrono al bilancio. Se il Padre ha pagato 100 € e la Madre 40 €, il totale approvato è 140 €, la quota teorica è 70 € ciascuno e il saldo indica che la Madre deve 30 € al Padre.

Le ricevute acquisite con Expo Image Picker vengono caricate al backend come `multipart/form-data`. I dati dell'immagine sono conservati in PostgreSQL, mentre `receipt_url` contiene l'endpoint protetto della ricevuta: questo evita di dipendere dal filesystem effimero del servizio Render.

### Archivio documenti protetto

I documenti sono suddivisi in `Salute`, `Scuola`, `Legale` e `Altro`. PDF e immagini vengono caricati con `multer` in memoria e salvati come `BYTEA` in PostgreSQL; `file_url` contiene esclusivamente l'endpoint autenticato `/documents/:id/file`. Il backend restituisce il file solo se il JWT appartiene alla stessa `family_id` del documento e usa header `no-store` per evitare cache indesiderate.

## Frontend locale

```bash
cd frontend
cp .env.example .env
npm install expo-secure-store react-native-calendars expo-image-picker expo-document-picker expo-file-system expo-sharing
npm install
npx expo start
```

Configura:

```env
EXPO_PUBLIC_API_URL=http://localhost:4000/api
```

Su telefono fisico non usare `localhost`: inserisci l'IP LAN del computer, ad esempio `http://192.168.1.50:4000/api`. In produzione usa l'URL HTTPS Render.

Il JWT è salvato con `expo-secure-store` su iOS/Android. Sul target web viene usato `localStorage` come fallback perché SecureStore è nativo.

## Deploy Render

`render.yaml` configura automaticamente il servizio `duecase-api` e il database PostgreSQL `duecase-db`. `DATABASE_URL` viene collegata tramite `fromDatabase`, `JWT_SECRET` viene generata da Render e il servizio ascolta su `PORT=10000`/`0.0.0.0`. L'auto-deploy è esplicitamente abilitato sul ramo `main`.

Le migrazioni vengono eseguite nel comando di avvio prima del server (`npm start`), così la configurazione funziona anche sui piani Render che non supportano `preDeployCommand`.

Configurazione manuale equivalente:

- Root directory: `backend`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- `DATABASE_URL`: URL PostgreSQL
- `JWT_SECRET`: valore casuale di almeno 32 caratteri
- `JWT_EXPIRES_IN`: `7d`
- `CORS_ORIGIN`: dominio/i consentiti

## EAS Build

```bash
cd frontend
npm install -g eas-cli
eas login
eas init
eas build --profile preview --platform all
eas build --profile production --platform all
```

`eas init` collega il progetto a EAS e aggiunge automaticamente il `projectId`; non è presente alcun ID fittizio nel repository. Gli identificativi store sono già configurati in `frontend/app.json`:

- iOS `com.tecnicoelios.duecase`
- Android `com.tecnicoelios.duecase`

Per le build cloud configura `EXPO_PUBLIC_API_URL` negli environment EAS. Ad esempio, per produzione:

```bash
eas env:set --name EXPO_PUBLIC_API_URL --value https://TUO-SERVIZIO.onrender.com/api --environment production --visibility plaintext
```

Ripeti con gli URL appropriati per `preview` e `development`.

## Dati demo opzionali

Dopo la migrazione puoi eseguire:

```bash
cd backend
npm run seed
```

Lo seed crea una famiglia demo e due account locali. Non usarli in produzione.
