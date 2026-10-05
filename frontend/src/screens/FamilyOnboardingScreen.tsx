import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthInput } from '../components/AuthInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { FamilyInfo } from '../types/models';

type Mode = 'create' | 'join' | null;

export function FamilyOnboardingScreen(): React.JSX.Element {
  const { user, refreshUser, logout } = useAuth();
  const [mode, setMode] = useState<Mode>(null);
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createdFamily, setCreatedFamily] = useState<FamilyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createFamily(): Promise<void> {
    try {
      setLoading(true);
      setError(null);
      const result = await api.family.create(familyName);
      setCreatedFamily(result.family);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creazione famiglia non riuscita.');
    } finally {
      setLoading(false);
    }
  }

  async function joinFamily(): Promise<void> {
    if (inviteCode.trim().length < 6) {
      setError('Inserisci un Codice Famiglia valido.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await api.family.join(inviteCode.trim().toUpperCase());
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile unirsi alla famiglia.');
    } finally {
      setLoading(false);
    }
  }

  if (createdFamily) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.badge}>FAMIGLIA CREATA</Text>
          <Text style={styles.title}>{createdFamily.name ?? 'La tua famiglia'}</Text>
          <Text style={styles.subtitle}>Condividi questo Codice Famiglia con l'altro genitore. Potrà usarlo dopo essersi registrato.</Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>CODICE FAMIGLIA</Text>
            <Text selectable style={styles.code}>{createdFamily.inviteCode}</Text>
          </View>

          <Text style={styles.note}>Il codice identifica la famiglia. Solo un padre e una madre possono essere associati alla stessa famiglia.</Text>
          <PrimaryButton label="Continua nell'app" onPress={() => void refreshUser()} />
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>CONFIGURAZIONE FAMIGLIA</Text>
            <Text style={styles.title}>Ciao {user?.displayName}</Text>
            <Text style={styles.subtitle}>Se sei il primo genitore crea la famiglia. Se l'altro genitore l'ha già creata, inserisci il suo codice invito.</Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Esci</Text>
          </Pressable>
        </View>

        {mode === null ? (
          <View style={styles.choiceGrid}>
            <Pressable style={styles.choiceCard} onPress={() => { setMode('create'); setError(null); }}>
              <Text style={styles.choiceIcon}>＋</Text>
              <Text style={styles.choiceTitle}>Crea Famiglia</Text>
              <Text style={styles.choiceText}>Sono il primo genitore. Genera un nuovo Codice Famiglia da condividere.</Text>
            </Pressable>
            <Pressable style={styles.choiceCard} onPress={() => { setMode('join'); setError(null); }}>
              <Text style={styles.choiceIcon}>⌁</Text>
              <Text style={styles.choiceTitle}>Inserisci codice</Text>
              <Text style={styles.choiceText}>L'altro genitore ha già creato la famiglia e mi ha inviato il codice.</Text>
            </Pressable>
          </View>
        ) : null}

        {mode === 'create' ? (
          <View style={styles.card}>
            <Pressable onPress={() => setMode(null)}><Text style={styles.back}>← Indietro</Text></Pressable>
            <Text style={styles.sectionTitle}>Crea Famiglia</Text>
            <Text style={styles.sectionText}>Il codice invito verrà generato automaticamente dal server.</Text>
            <AuthInput
              label="Nome famiglia (facoltativo)"
              value={familyName}
              onChangeText={setFamilyName}
              autoCapitalize="words"
              placeholder="Es. Famiglia Rossi"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label="Crea e genera codice" onPress={() => void createFamily()} loading={loading} />
          </View>
        ) : null}

        {mode === 'join' ? (
          <View style={styles.card}>
            <Pressable onPress={() => setMode(null)}><Text style={styles.back}>← Indietro</Text></Pressable>
            <Text style={styles.sectionTitle}>Unisciti alla famiglia</Text>
            <Text style={styles.sectionText}>Inserisci esattamente il codice ricevuto dall'altro genitore.</Text>
            <AuthInput
              label="Codice Famiglia"
              value={inviteCode}
              onChangeText={(value) => setInviteCode(value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="ES. ABCDEF2345"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label="Unisciti alla famiglia" onPress={() => void joinFamily()} loading={loading} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flexGrow: 1, padding: 22, gap: 20, backgroundColor: '#F8FAFC' },
  headerRow: { width: '100%', maxWidth: 900, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  headerText: { flex: 1, gap: 7 },
  eyebrow: { color: '#4F46E5', fontWeight: '900', letterSpacing: 1.8, fontSize: 12 },
  title: { fontSize: 30, fontWeight: '900', color: '#0F172A' },
  subtitle: { fontSize: 16, lineHeight: 23, color: '#64748B' },
  logoutButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  logoutText: { color: '#475569', fontWeight: '800' },
  choiceGrid: { width: '100%', maxWidth: 900, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  choiceCard: { flexGrow: 1, flexBasis: 280, minHeight: 180, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, padding: 20, gap: 10 },
  choiceIcon: { fontSize: 30, color: '#4F46E5', fontWeight: '300' },
  choiceTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  choiceText: { color: '#64748B', lineHeight: 21 },
  card: { width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, padding: 20, gap: 16 },
  badge: { alignSelf: 'flex-start', color: '#047857', backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: '900' },
  codeBox: { alignItems: 'center', gap: 8, padding: 22, borderRadius: 18, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' },
  codeLabel: { color: '#6366F1', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  code: { color: '#312E81', fontSize: 30, fontWeight: '900', letterSpacing: 3 },
  note: { color: '#64748B', lineHeight: 20, textAlign: 'center' },
  back: { color: '#4F46E5', fontWeight: '800' },
  sectionTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  sectionText: { color: '#64748B', lineHeight: 21 },
  error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12 },
});
