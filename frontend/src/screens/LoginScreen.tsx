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

export function LoginScreen({ onShowRegister }: { onShowRegister: () => void }): React.JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!email.trim() || !password) {
      setError('Inserisci email e password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accesso non riuscito.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>DUE CASE</Text>
          <Text style={styles.title}>Bentornato</Text>
          <Text style={styles.subtitle}>Accedi per gestire calendario, spese e documenti della tua famiglia.</Text>
        </View>

        <View style={styles.card}>
          <AuthInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="nome@email.it" />
          <AuthInput label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="La tua password" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Accedi" onPress={() => void submit()} loading={loading} />
          <View style={styles.switchRow}>
            <Text style={styles.muted}>Non hai ancora un account?</Text>
            <Pressable onPress={onShowRegister} accessibilityRole="button"><Text style={styles.link}>Registrati</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F8FAFC' }, content: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 22 }, hero: { gap: 8 },
  eyebrow: { color: '#4F46E5', fontWeight: '900', letterSpacing: 2.2, fontSize: 13 }, title: { fontSize: 34, fontWeight: '900', color: '#0F172A' },
  subtitle: { fontSize: 16, lineHeight: 23, color: '#64748B', maxWidth: 520 },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 16, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12 }, switchRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  muted: { color: '#64748B' }, link: { color: '#3730A3', fontWeight: '800' },
});
