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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  background: '#EEF4FA',
  card: '#FFFFFF',
  blue: '#056FD2',
  blueDark: '#0A3267',
  input: '#E9F0F8',
  text: '#202124',
  muted: '#5D7CA7',
  border: '#C5D9EF',
  danger: '#D92D20',
};

type LoginScreenProps = {
  onShowRegister: () => void;
};

export function LoginScreen({ onShowRegister }: LoginScreenProps): React.JSX.Element {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Inserisci un indirizzo email valido.');
      return;
    }
    if (!password) {
      setError('Inserisci la password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await login(normalizedEmail, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accesso non riuscito. Riprova.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Math.max(28, insets.top + 16), paddingBottom: Math.max(48, insets.bottom + 32) },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.logoBadge}>
              <Ionicons name="home-outline" size={30} color="#FFFFFF" />
            </View>

            <View style={styles.heading}>
              <Text style={styles.title}>Accedi a DueCase</Text>
              <Text style={styles.subtitle}>Inserisci email e password per continuare.</Text>
            </View>

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
                  editable={!loading}
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
                  editable={!loading}
                  onSubmitEditing={() => void submit()}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? 'Nascondi password' : 'Mostra password'}
                  onPress={() => setPasswordVisible((value) => !value)}
                  hitSlop={10}
                >
                  <Ionicons
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={23}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
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
                pressed && !loading && styles.loginButtonPressed,
                loading && styles.loginButtonDisabled,
              ]}
            >
              <Text style={styles.loginButtonText}>{loading ? 'Accesso in corso…' : 'Accedi'}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Vai alla registrazione"
              onPress={onShowRegister}
              style={({ pressed }) => [styles.registerLink, pressed && styles.registerLinkPressed]}
            >
              <Text style={styles.registerText}>
                Non hai un account? <Text style={styles.registerStrong}>Registrati</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: '#DCE6F0',
    padding: 22,
    gap: 18,
    shadowColor: '#173C68',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  logoBadge: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  heading: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: COLORS.blueDark,
    fontSize: 29,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  fieldBlock: {
    gap: 8,
  },
  label: {
    color: COLORS.blueDark,
    fontSize: 14,
    fontWeight: '800',
  },
  inputShell: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.input,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
  },
  errorBox: {
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  loginButton: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.blue,
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  loginButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  loginButtonDisabled: {
    opacity: 0.62,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  registerLink: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  registerLinkPressed: {
    opacity: 0.72,
  },
  registerText: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  registerStrong: {
    color: COLORS.blue,
    fontWeight: '900',
  },
});
