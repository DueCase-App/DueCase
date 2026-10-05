# Frontend Expo — autenticazione e famiglia

App React Native + Expo in TypeScript.

## Pacchetti

```bash
npm install expo-secure-store react-native-calendars expo-image-picker expo-document-picker expo-file-system expo-sharing
```

- `expo-secure-store`: JWT persistente e sicuro su iOS/Android.
- `react-native-calendars`: calendario mensile dei turni e cambi custodia.
- `expo-image-picker`: foto/galleria per allegare ricevute alle spese.
- `expo-document-picker`: selezione di PDF e immagini per l'archivio documenti.
- `expo-file-system`: cache temporanea dei file scaricati in modo autenticato.
- `expo-sharing`: apertura/salvataggio dei documenti protetti tramite il foglio nativo di condivisione.

## Ambiente

Copia `.env.example` in `.env`:

```env
EXPO_PUBLIC_API_URL=https://tuo-backend.onrender.com/api
```

Il `familyId` non viene più configurato nel frontend: arriva dal profilo autenticato e il backend lo ricava dal JWT.

## Flusso UI

- Login
- Registrazione con ruolo Padre/Madre
- Crea Famiglia e visualizza Codice Famiglia
- oppure Unisciti con Codice Famiglia
- accesso alle sezioni Calendario / Spese / Documenti
- Spese: saldo 50/50, movimenti, approvazione/contestazione e caricamento ricevute da fotocamera o galleria
- Documenti: archivio per categorie, upload PDF/immagini e apertura/download autenticati
- logout

## EAS

1. `eas login`
2. `eas init`
3. `eas init` collega il progetto a EAS e aggiunge automaticamente il relativo `projectId` alla configurazione Expo.
4. Configura `EXPO_PUBLIC_API_URL` negli environment EAS `development`, `preview` e `production`.
5. `eas build --profile preview --platform all`
6. `eas build --profile production --platform all`

Gli identificativi store sono già definitivi:

- iOS: `com.tecnicoelios.duecase`
- Android: `com.tecnicoelios.duecase`
