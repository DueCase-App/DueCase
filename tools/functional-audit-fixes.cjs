const fs = require('fs');

function replace(file, from, to) {
  const value = fs.readFileSync(file, 'utf8');
  if (!value.includes(from)) throw new Error(`Pattern not found in ${file}: ${from.slice(0, 80)}`);
  fs.writeFileSync(file, value.replace(from, to));
  console.log(`updated ${file}`);
}

// Keep the package metadata aligned with the native app version/build already in app.json.
for (const file of ['frontend/package.json', 'frontend/package-lock.json']) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.version = '0.4.3';
  if (json.packages && json.packages['']) json.packages[''].version = '0.4.3';
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`aligned version in ${file}`);
}

// A mixed pending count must open the section that actually contains the first actionable item.
replace(
  'frontend/src/screens/HomeScreen.tsx',
  "  const pendingTotal = pendingExpenses.length + pendingSwaps.length + pendingAgreements.length;\n  const firstEvent = events[0] ?? null;",
  "  const pendingTotal = pendingExpenses.length + pendingSwaps.length + pendingAgreements.length;\n  const pendingDestination: HomeDestination = pendingExpenses.length ? 'expenses' : pendingSwaps.length ? 'calendar' : 'agreements';\n  const firstEvent = events[0] ?? null;",
);
replace(
  'frontend/src/screens/HomeScreen.tsx',
  '<Summary icon="hourglass-outline" value={pendingTotal} label="Richieste in sospeso" onPress={() => onNavigate(\'agreements\')} />',
  '<Summary icon="hourglass-outline" value={pendingTotal} label="Richieste in sospeso" onPress={() => onNavigate(pendingDestination)} />',
);

// The support mailbox is active; network failure while loading service-info must not say support is unavailable.
replace(
  'frontend/src/screens/SettingsScreen.tsx',
  "const ACCOUNT_DELETION_URL='https://www.duecaseununicasquadra.com/cancellazione-account.html';",
  "const ACCOUNT_DELETION_URL='https://www.duecaseununicasquadra.com/cancellazione-account.html';\nconst DEFAULT_SUPPORT_EMAIL='assistenza@duecaseununicasquadra.com';",
);
replace(
  'frontend/src/screens/SettingsScreen.tsx',
  " const version=Constants.expoConfig?.version??'0.4.1';",
  " const version=Constants.expoConfig?.version??'0.4.3';",
);
replace(
  'frontend/src/screens/SettingsScreen.tsx',
  "{section==='help'&&<>{info?.supportEmail?<Row title={`Contatta assistenza: ${info.supportEmail}`} onPress={()=>void Linking.openURL(`mailto:${info.supportEmail}`)}/>:<Text style={s.muted}>Contatto assistenza non ancora attivato.</Text>}",
  "{section==='help'&&<><Row title={`Contatta assistenza: ${info?.supportEmail??DEFAULT_SUPPORT_EMAIL}`} onPress={()=>void Linking.openURL(`mailto:${info?.supportEmail??DEFAULT_SUPPORT_EMAIL}`)}/>",
);

console.log('functional audit fixes applied');
// Triggered after the workflow was added; remove this helper after the verified commit.
