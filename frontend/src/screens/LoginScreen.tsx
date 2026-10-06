import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  blue: '#056FD2',
  text: '#0A3267',
  muted: '#5D7CA7',
  input: '#E9F0F8',
  border: '#C5D9EF',
  white: '#FFFFFF',
  danger: '#D92D20',
};

export function LoginScreen({ onShowRegister }: { onShowRegister: () => void }): React.JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Inserisci email e password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await login(normalizedEmail, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accesso non riuscito.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.logoBadge}>
            <Ionicons name="home" size={30} color={COLORS.white} />
          </View>

          <Text style={styles.title}>Accedi a DueCase</Text>
          <Text style={styles.subtitle}>Inserisci email e password per continuare.</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputShell}>
              <Ionicons name="mail-outline" size={22} color={COLORS.muted} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="nome@email.it"
                placeholderTextColor="#7892B5"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                selectionColor={COLORS.blue}
                style={styles.input}
                returnKeyType="next"
              />
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputShell}>
              <Ionicons name="lock-closed-outline" size={22} color={COLORS.muted} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="La tua password"
                placeholderTextColor="#7892B5"
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                selectionColor={COLORS.blue}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? 'Nascondi password' : 'Mostra password'}
                onPress={() => setPasswordVisible((value) => !value)}
                hitSlop={9}
              >
                <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={23} color={COLORS.muted} />
              </Pressable>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={20} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.loginButton,
              pressed && !loading && styles.pressed,
              loading && styles.disabled,
            ]}
          >
            <Text style={styles.loginButtonText}>{loading ? 'Accesso…' : 'Accedi'}</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onShowRegister} style={styles.registerLink}>
            <Text style={styles.registerText}>Non hai un account? <Text style={styles.registerStrong}>Registrati</Text></Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F8FC' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  card: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#DFE8F2',
    padding: 22,
    gap: 18,
    shadowColor: '#173C68',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  logoBadge: { width: 58, height: 58, borderRadius: 18, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { color: COLORS.text, fontSize: 29, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: COLORS.muted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  fieldBlock: { gap: 8 },
  label: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  inputShell: { minHeight: 58, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.input, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minWidth: 0, color: '#202124', fontSize: 16, fontWeight: '600', paddingVertical: Platform.OS === 'ios' ? 16 : 12 },
  errorBox: { borderRadius: 12, backgroundColor: '#FEF2F2', padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  loginButton: { minHeight: 56, borderRadius: 14, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  loginButtonText: { color: COLORS.white, fontSize: 17, fontWeight: '900' },
  registerLink: { alignSelf: 'center', padding: 6 },
  registerText: { color: COLORS.muted, fontSize: 13 },
  registerStrong: { color: COLORS.blue, fontWeight: '900' },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.6 },
});