import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
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
import {
  clearPendingParentInvite,
  getPendingParentInvite,
  parseParentInviteUrl,
} from '../services/parentInvitations';
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

  useEffect(() => {
    let active = true;
    let accepting = false;

    async function acceptInviteUrl(url: string | null | undefined): Promise<void> {
      if (!active || accepting || !user || getPendingParentInvite()) return;
      const invite = parseParentInviteUrl(url);
      if (!invite) return;

      const accountEmail = user.email.trim().toLowerCase();
      if (invite.email !== accountEmail) {
        setError(`Questo invito è destinato a ${invite.email}. Accedi con quell’indirizzo email.`);
        return;
      }
      if (invite.role !== user.role) {
        setError(`L’invito è stato creato per il ruolo ${invite.role === 'mother' ? 'Mamma' : 'Papà'}.`);
        return;
      }

      accepting = true;
      try {
        setLoading(true);
        setError(null);
        await api.family.join(invite.inviteCode);
        clearPendingParentInvite();
        await refreshUser();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Impossibile accettare l’invito.');
      } finally {
        accepting = false;
        if (active) setLoading(false);
      }
    }

    void Linking.getInitialURL().then((url) => acceptInviteUrl(url)).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => { void acceptInviteUrl(url); });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [user, refreshUser]);

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
          <Text style={styles.subtitle}>La famiglia è pronta. Puoi invitare l’altro genitore tramite email da Impostazioni → Famiglia.</Text>

          <Text style={styles.note}>Il codice famiglia resta disponibile come metodo di compatibilità, ma l’invito email è il percorso consigliato.</Text>
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
            <Text style={styles.subtitle}>Se sei il primo genitore crea la famiglia. Se hai ricevuto un invito email, apri il link ricevuto: DueCase ti collegherà automaticamente.</Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Esci</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <Text style={styles.note}>Collegamento alla famiglia in corso…</Text> : null}

        {mode === null ? (
          <View style={styles.choiceGrid}>
            <Pressable style={styles.choiceCard} onPress={() => { setMode('create'); setError(null); }}>
              <Text style={styles.choiceIcon}>＋</Text>
              <Text style={styles.choiceTitle}>Crea Famiglia</Text>
              <Text style={styles.choiceText}>Sono il primo genitore e voglio creare una nuova famiglia DueCase.</Text>
            </Pressable>
            <Pressable style={styles.choiceCard} onPress={() => { setMode('join'); setError(null); }}>
              <Text style={styles.choiceIcon}>⌁</Text>
              <Text style={styles.choiceTitle}>Inserisci codice</Text>
              <Text style={styles.choiceText}>Metodo alternativo se hai ricevuto manualmente un Codice Famiglia.</Text>
            </Pressable>
          </View>
        ) : null}

        {mode === 'create' ? (
          <View style={styles.card}>
            <Pressable onPress={() => setMode(null)}><Text style={styles.back}>← Indietro</Text></Pressable>
            <Text style={styles.sectionTitle}>Crea Famiglia</Text>
            <Text style={styles.sectionText}>Dopo la creazione potrai invitare l’altro genitore tramite email.</Text>
            <AuthInput
              label="Nome famiglia (facoltativo)"
              value={familyName}
              onChangeText={setFamilyName}
              autoCapitalize="words"
              placeholder="Es. Famiglia Rossi"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label="Crea famiglia" onPress={() => void createFamily()} loading={loading} />
          </View>
        ) : null}

        {mode === 'join' ? (
          <View style={styles.card}>
            <Pressable onPress={() => setMode(null)}><Text style={styles.back}>← Indietro</Text></Pressable>
            <Text style={styles.sectionTitle}>Unisciti alla famiglia</Text>
            <Text style={styles.sectionText}>Inserisci il codice ricevuto dall’altro genitore. Se hai ricevuto l’email DueCase, usa invece il pulsante nel messaggio.</Text>
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
  note: { color: '#64748B', lineHeight: 20, textAlign: 'center' },
  back: { color: '#4F46E5', fontWeight: '800' },
  sectionTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  sectionText: { color: '#64748B', lineHeight: 21 },
  error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12 },
});
