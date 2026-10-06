import { PasswordReset } from '../components/PasswordReset';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Image,
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
import { cardShadow, ui } from '../theme/ui';

type LoginScreenProps = { onShowRegister: () => void };

export function LoginScreen({ onShowRegister }: LoginScreenProps): React.JSX.Element {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [resetOpen,setResetOpen] = useState(false);
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
    <LinearGradient colors={ui.gradients.page} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(12, insets.top + 6), paddingBottom: Math.max(28, insets.bottom + 18) }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandArea}>
              <Image source={require('../../assets/duecase-logo-hd.png')} resizeMode="contain" style={styles.logo} accessibilityLabel="Logo DueCase" />
              <Text style={styles.brandName}>DueCase</Text>
              <Text style={styles.payoff}>Due case, un’unica squadra.</Text>
              <Text style={styles.brandDescription}>Organizza, concorda e documenta la gestione dei tuoi figli in modo semplice e sicuro.</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.heading}>
                <View style={styles.welcomeRow}><Text style={styles.title}>Bentornato</Text><Ionicons name="heart" size={25} color={ui.colors.orange} /></View>
                <Text style={styles.subtitle}>Accedi al tuo account DueCase per continuare.</Text>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="mail-outline" size={22} color={ui.colors.primary} />
                  <TextInput value={email} onChangeText={setEmail} placeholder="nome@email.it" placeholderTextColor={ui.colors.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" selectionColor={ui.colors.primary} style={styles.input} returnKeyType="next" editable={!loading} />
                </View>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="lock-closed-outline" size={22} color={ui.colors.primary} />
                  <TextInput value={password} onChangeText={setPassword} placeholder="La tua password" placeholderTextColor={ui.colors.muted} secureTextEntry={!passwordVisible} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" selectionColor={ui.colors.primary} style={styles.input} returnKeyType="done" editable={!loading} onSubmitEditing={() => void submit()} />
                  <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? 'Nascondi password' : 'Mostra password'} onPress={() => setPasswordVisible((value) => !value)} hitSlop={10}>
                    <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={23} color={ui.colors.muted} />
                  </Pressable>
                </View>
              </View>

              <Pressable onPress={()=>setResetOpen(true)}><Text style={{color:ui.colors.primary,fontWeight:'700'}}>Password dimenticata?</Text></Pressable>
              <PasswordReset visible={resetOpen} onClose={()=>setResetOpen(false)} />
              {error ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={20} color={ui.colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

              <Pressable disabled={loading} onPress={() => void submit()} style={styles.buttonShell}>
                <LinearGradient colors={ui.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.loginButton, loading && styles.disabled]}>
                  <Text style={styles.loginButtonText}>{loading ? 'Accesso in corso…' : 'Accedi'}</Text>
                  {!loading ? <Ionicons name="arrow-forward" size={22} color="#FFF" /> : null}
                </LinearGradient>
              </Pressable>

              <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>oppure</Text><View style={styles.divider} /></View>

              <Pressable accessibilityRole="button" onPress={onShowRegister} style={({ pressed }) => [styles.registerButton, pressed && { opacity: 0.78 }]}>
                <Ionicons name="person-add-outline" size={21} color={ui.colors.primary} />
                <Text style={styles.registerStrong}>Crea un account</Text>
              </Pressable>

              <View style={styles.security}><Ionicons name="shield-checkmark" size={18} color={ui.colors.primary} /><Text style={styles.securityText}>I tuoi dati sono sempre protetti</Text></View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, gap: 16 },
  brandArea: { width: '100%', maxWidth: 560, alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18 },
  logo: { width: 112, height: 92 },
  brandName: { marginTop: -4, color: ui.colors.primaryDark, fontSize: 37, fontWeight: '900', letterSpacing: -1.4 },
  payoff: { color: ui.colors.primaryDark, fontSize: 17, fontWeight: '900', marginTop: -2 },
  brandDescription: { color: ui.colors.text, textAlign: 'center', fontSize: 13, lineHeight: 18, maxWidth: 400, marginTop: 7 },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', borderRadius: ui.radius.xxl, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', padding: 22, gap: 17, ...cardShadow },
  heading: { gap: 5 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: ui.colors.primaryDark, fontSize: 29, fontWeight: '900' },
  subtitle: { color: ui.colors.muted, fontSize: 15, lineHeight: 21 },
  fieldBlock: { gap: 7 },
  label: { color: ui.colors.primaryDark, fontSize: 13, fontWeight: '900' },
  inputShell: { minHeight: 58, borderRadius: ui.radius.md, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: 'rgba(255,255,255,0.88)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minWidth: 0, color: ui.colors.text, fontSize: 16, fontWeight: '600', paddingVertical: Platform.OS === 'ios' ? 16 : 11 },
  errorBox: { borderRadius: ui.radius.md, backgroundColor: ui.colors.dangerSoft, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { flex: 1, color: ui.colors.danger, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  buttonShell: { borderRadius: ui.radius.lg, overflow: 'hidden' },
  loginButton: { minHeight: 58, borderRadius: ui.radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 18 },
  disabled: { opacity: 0.6 },
  loginButtonText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: ui.colors.border },
  dividerText: { color: ui.colors.muted, fontWeight: '700', fontSize: 12 },
  registerButton: { minHeight: 54, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  registerStrong: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 15 },
  security: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 1 },
  securityText: { color: ui.colors.muted, fontSize: 12, fontWeight: '700' },
});
