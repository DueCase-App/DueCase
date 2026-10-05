import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AuthInput } from '../components/AuthInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import type { ParentRole } from '../types/models';

export function RegisterScreen({ onShowLogin }: { onShowLogin: () => void }): React.JSX.Element {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<ParentRole>('father');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (displayName.trim().length < 2 || !email.trim()) { setError('Inserisci nome e indirizzo email.'); return; }
    if (password.length < 8) { setError('La password deve avere almeno 8 caratteri.'); return; }
    if (password !== confirmPassword) { setError('Le password non coincidono.'); return; }
    try {
      setLoading(true); setError(null);
      await register({ displayName: displayName.trim(), email: email.trim(), password, role });
    } catch (err) { setError(err instanceof Error ? err.message : 'Registrazione non riuscita.'); }
    finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}><Text style={styles.eyebrow}>DUE CASE</Text><Text style={styles.title}>Crea il tuo account</Text><Text style={styles.subtitle}>Scegli se sei il padre o la madre. Subito dopo potrai creare una famiglia o unirti con il codice invito.</Text></View>
        <View style={styles.card}>
          <AuthInput label="Nome" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" autoComplete="name" textContentType="name" placeholder="Il tuo nome" />
          <AuthInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="nome@email.it" />
          <View style={styles.field}><Text style={styles.label}>Ruolo</Text><View style={styles.roles}>
            <RoleButton label="Padre" value="father" selected={role === 'father'} onPress={() => setRole('father')} />
            <RoleButton label="Madre" value="mother" selected={role === 'mother'} onPress={() => setRole('mother')} />
          </View></View>
          <AuthInput label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Almeno 8 caratteri" />
          <AuthInput label="Conferma password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Ripeti la password" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Registrati" onPress={() => void submit()} loading={loading} />
          <View style={styles.switchRow}><Text style={styles.muted}>Hai già un account?</Text><Pressable onPress={onShowLogin} accessibilityRole="button"><Text style={styles.link}>Accedi</Text></Pressable></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RoleButton({ label, selected, onPress }: { label: string; value: ParentRole; selected: boolean; onPress: () => void }): React.JSX.Element {
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.roleButton, selected && styles.roleButtonSelected]}><Text style={[styles.roleText, selected && styles.roleTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F8FAFC' }, content: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 22 }, hero: { gap: 8, maxWidth: 560, width: '100%', alignSelf: 'center' },
  eyebrow: { color: '#4F46E5', fontWeight: '900', letterSpacing: 2.2, fontSize: 13 }, title: { fontSize: 32, fontWeight: '900', color: '#0F172A' }, subtitle: { fontSize: 16, lineHeight: 23, color: '#64748B' },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 16, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  field: { gap: 7 }, label: { fontSize: 14, fontWeight: '700', color: '#334155' }, roles: { flexDirection: 'row', gap: 10 },
  roleButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  roleButtonSelected: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' }, roleText: { color: '#475569', fontWeight: '800' }, roleTextSelected: { color: '#3730A3' },
  error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12 }, switchRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }, muted: { color: '#64748B' }, link: { color: '#3730A3', fontWeight: '800' },
});
