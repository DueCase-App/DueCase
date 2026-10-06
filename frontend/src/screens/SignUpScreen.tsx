import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useMemo, useState, type ComponentProps } from 'react';
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import type { ParentRole, RegisterInput } from '../types/models';

const COLORS = {
  blue: '#056FD2',
  blueDark: '#0B376D',
  orange: '#FF7A1A',
  text: '#0A3267',
  muted: '#5D7CA7',
  input: '#E9F0F8',
  border: '#C5D9EF',
  white: '#FFFFFF',
  danger: '#D92D20',
  shadow: '#173C68',
  modalText: '#202124',
  modalPlaceholder: '#4B5563',
};

const MIN_DATE = new Date(1900, 0, 1);

type IconName = ComponentProps<typeof Ionicons>['name'];
type AccountType = 'parent' | 'professional';
type DateTarget = 'parent' | 'child';

type ChildDraft = {
  id: string;
  displayName: string;
  birthDate: Date | null;
};

function defaultDate(yearsAgo: number): Date {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setFullYear(value.getFullYear() - yearsAgo);
  return value;
}

function formatItalianDate(value: Date | null): string {
  if (!value) return '';
  return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`;
}

function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function normalizeTaxCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function normalizePhone(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function SignUpScreen({ onShowLogin }: { onShowLogin: () => void }): React.JSX.Element {
  const { register } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 360;
  const heroHeight = Math.max(185, Math.min(360, width * 0.44));

  const [accountType, setAccountType] = useState<AccountType>('parent');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [taxCode, setTaxCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [role, setRole] = useState<ParentRole>('father');
  const [familyName, setFamilyName] = useState('');
  const [children, setChildren] = useState<ChildDraft[]>([]);
  const [inviteOtherParent, setInviteOtherParent] = useState(true);

  const [childModalVisible, setChildModalVisible] = useState(false);
  const [childName, setChildName] = useState('');
  const [childBirthDate, setChildBirthDate] = useState<Date | null>(null);
  const [iosDateTarget, setIosDateTarget] = useState<DateTarget | null>(null);
  const [iosPickerValue, setIosPickerValue] = useState<Date>(defaultDate(30));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const childrenLabel = useMemo(() => {
    if (children.length === 0) return 'Aggiungi i tuoi figli';
    if (children.length === 1) return '1 figlio aggiunto';
    return `${children.length} figli aggiunti`;
  }, [children.length]);

  function chooseProfessional(): void {
    setAccountType('professional');
    Alert.alert(
      'Profilo professionista',
      'Il profilo professionista sarà disponibile in una fase dedicata. Per questa registrazione continua come genitore.',
      [{ text: 'OK', onPress: () => setAccountType('parent') }],
    );
  }

  function applySelectedDate(target: DateTarget, selectedDate: Date): void {
    if (target === 'parent') {
      setBirthDate(selectedDate);
      return;
    }
    setChildBirthDate(selectedDate);
  }

  function openDatePicker(target: DateTarget): void {
    const currentValue = target === 'parent'
      ? birthDate ?? defaultDate(30)
      : childBirthDate ?? defaultDate(10);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentValue,
        mode: 'date',
        display: 'default',
        minimumDate: MIN_DATE,
        maximumDate: new Date(),
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            applySelectedDate(target, selectedDate);
          }
        },
      });
      return;
    }

    setIosPickerValue(currentValue);
    setIosDateTarget(target);
  }

  function handleIosDateChange(_: DateTimePickerEvent, selectedDate?: Date): void {
    if (!selectedDate || !iosDateTarget) return;
    setIosPickerValue(selectedDate);
    applySelectedDate(iosDateTarget, selectedDate);
  }

  function openChildModal(): void {
    setChildName('');
    setChildBirthDate(null);
    setChildModalVisible(true);
  }

  function addChild(): void {
    const trimmedName = childName.trim();
    if (trimmedName.length < 2) {
      Alert.alert('Nome del figlio', 'Inserisci il nome del figlio.');
      return;
    }

    setChildren((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        displayName: trimmedName,
        birthDate: childBirthDate,
      },
    ]);
    setChildModalVisible(false);
  }

  function removeChild(id: string): void {
    setChildren((current) => current.filter((child) => child.id !== id));
  }

  async function submit(): Promise<void> {
    if (accountType !== 'parent') {
      setError('Al momento la registrazione è disponibile per i genitori.');
      return;
    }

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const normalizedTaxCode = normalizeTaxCode(taxCode);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone);
    const trimmedFamilyName = familyName.trim();

    if (trimmedFirstName.length < 2) return setError('Inserisci il tuo nome.');
    if (trimmedLastName.length < 2) return setError('Inserisci il tuo cognome.');
    if (!birthDate) return setError('Seleziona la tua data di nascita.');
    if (!/^[A-Z0-9]{16}$/.test(normalizedTaxCode)) return setError('Inserisci un codice fiscale valido di 16 caratteri.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setError('Inserisci un indirizzo email valido.');
    if (normalizedPhone.replace(/\D/g, '').length < 6) return setError('Inserisci un numero di telefono valido.');
    if (password.length < 8) return setError('La password deve contenere almeno 8 caratteri.');
    if (trimmedFamilyName.length < 2) return setError('Inserisci il nome della famiglia.');
    if (children.length === 0) return setError('Aggiungi almeno un figlio per completare la famiglia.');

    const registerInput: RegisterInput = {
      displayName: `${trimmedFirstName} ${trimmedLastName}`.trim(),
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      birthDate: toIsoDate(birthDate),
      taxCode: normalizedTaxCode,
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      role,
      familyName: trimmedFamilyName,
      children: children.map((child) => ({
        displayName: child.displayName,
        birthDate: child.birthDate ? toIsoDate(child.birthDate) : null,
      })),
      inviteOtherParent,
    };

    try {
      setLoading(true);
      setError(null);
      await register(registerInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrazione non riuscita. Riprova.');
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
        <StatusBar translucent={false} backgroundColor="#D9ECFA" barStyle="dark-content" />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(56, insets.bottom + 40) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <ImageBackground
            source={require('../../assets/signup-header.jpg')}
            resizeMode="cover"
            style={[styles.hero, { height: heroHeight }]}
            accessibilityIgnoresInvertColors
          />

          <View style={styles.card}>
            <Text style={styles.title}>Crea il tuo account</Text>

            <View style={styles.progressTrack} accessibilityLabel="Primo passaggio della registrazione">
              <View style={[styles.progressSegment, styles.progressBlue]} />
              <View style={[styles.progressSegment, styles.progressOrange]} />
            </View>

            <Text style={styles.subtitle}>Scegli come iniziare con DueCase.</Text>

            <View style={styles.accountSelector}>
              <SelectorButton icon="people" label="Sono un genitore" selected={accountType === 'parent'} onPress={() => setAccountType('parent')} />
              <SelectorButton icon="briefcase-outline" label="Sono un professionista" selected={accountType === 'professional'} onPress={chooseProfessional} />
            </View>

            <View style={[styles.fieldRow, compact && styles.fieldRowStack]}>
              <FormField label="Nome" required icon="person-outline" value={firstName} onChangeText={setFirstName} placeholder="Inserisci il tuo nome" autoCapitalize="words" autoComplete="given-name" textContentType="givenName" />
              <FormField label="Cognome" required icon="person-outline" value={lastName} onChangeText={setLastName} placeholder="Inserisci il tuo cognome" autoCapitalize="words" autoComplete="family-name" textContentType="familyName" />
            </View>

            <View style={[styles.fieldRow, compact && styles.fieldRowStack]}>
              <DateField
                label="Data di nascita"
                required
                value={birthDate}
                placeholder="Seleziona la data"
                onPress={() => openDatePicker('parent')}
              />
              <FormField label="Codice fiscale" required icon="document-text-outline" value={taxCode} onChangeText={(value) => setTaxCode(normalizeTaxCode(value))} placeholder="Inserisci il tuo codice fiscale" autoCapitalize="characters" autoCorrect={false} maxLength={16} />
            </View>

            <View style={[styles.fieldRow, compact && styles.fieldRowStack]}>
              <FormField label="Email" required icon="mail-outline" value={email} onChangeText={setEmail} placeholder="La tua email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
              <FormField label="Telefono" required icon="call-outline" value={phone} onChangeText={setPhone} placeholder="Inserisci il tuo numero" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
            </View>

            <FormField
              label="Password"
              required
              icon="lock-closed-outline"
              rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              onRightPress={() => setPasswordVisible((value) => !value)}
              value={password}
              onChangeText={setPassword}
              placeholder="Crea una password sicura"
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
            />

            <View style={styles.fieldBlock}>
              <RequiredLabel label="Ruolo" />
              <View style={styles.roleRow}>
                <RoleButton label="Papà" icon="person-outline" selected={role === 'father'} onPress={() => setRole('father')} />
                <RoleButton label="Mamma" icon="person-outline" selected={role === 'mother'} onPress={() => setRole('mother')} />
              </View>
            </View>

            <FormField
              label="Famiglia"
              required
              icon="people-outline"
              rightIcon="information-circle-outline"
              onRightPress={() => Alert.alert('Nome della famiglia', 'Usa un nome semplice che permetta a Mamma e Papà di riconoscere subito la famiglia condivisa.')}
              value={familyName}
              onChangeText={setFamilyName}
              placeholder="Inserisci il nome della tua famiglia"
              autoCapitalize="words"
            />

            <View style={styles.fieldBlock}>
              <RequiredLabel label="Figli" />
              <Pressable accessibilityRole="button" accessibilityLabel="Aggiungi un figlio" onPress={openChildModal} style={({ pressed }) => [styles.childrenRow, pressed && styles.pressed]}>
                <Ionicons name="people-outline" size={24} color={COLORS.muted} />
                <Text style={styles.childrenText}>{childrenLabel}</Text>
                <Ionicons name="chevron-forward" size={22} color={COLORS.muted} />
                <View style={styles.plusBadge}><Ionicons name="add" size={28} color={COLORS.white} /></View>
              </Pressable>

              {children.length > 0 ? (
                <View style={styles.childChips}>
                  {children.map((child) => (
                    <View key={child.id} style={styles.childChip}>
                      <Text style={styles.childChipText} numberOfLines={1}>{child.displayName}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Rimuovi ${child.displayName}`} onPress={() => removeChild(child.id)} hitSlop={8}>
                        <Ionicons name="close-circle" size={19} color={COLORS.muted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.inviteRow}>
              <View style={styles.inviteIcon}><Ionicons name="people-outline" size={28} color={COLORS.blue} /></View>
              <View style={styles.inviteTextArea}>
                <Text style={styles.inviteTitle}>Invito altro genitore</Text>
                <Text style={styles.inviteDescription}>Invia un invito all’altro genitore per unirsi alla famiglia su DueCase.</Text>
              </View>
              <Switch value={inviteOtherParent} onValueChange={setInviteOtherParent} trackColor={{ false: '#D5DFEA', true: COLORS.blue }} thumbColor={COLORS.white} ios_backgroundColor="#D5DFEA" />
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
              style={({ pressed }) => [styles.continueButton, pressed && !loading && styles.continueButtonPressed, loading && styles.continueButtonDisabled]}
            >
              <Text style={styles.continueText}>{loading ? 'Creazione account…' : 'Continua'}</Text>
              {!loading ? <Ionicons name="chevron-forward" size={22} color={COLORS.white} /> : null}
            </Pressable>

            <Pressable onPress={onShowLogin} accessibilityRole="button" style={styles.loginLink}>
              <Text style={styles.loginLinkText}>Hai già un account? <Text style={styles.loginLinkStrong}>Accedi</Text></Text>
            </Pressable>
          </View>
        </ScrollView>

        <Modal visible={childModalVisible} transparent animationType="fade" onRequestClose={() => setChildModalVisible(false)}>
          <SafeAreaView style={styles.modalSafeArea} edges={['top', 'right', 'bottom', 'left']}>
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView contentContainerStyle={[styles.modalScrollContent, { paddingBottom: Math.max(24, insets.bottom + 16) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Aggiungi un figlio</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Chiudi" onPress={() => setChildModalVisible(false)} hitSlop={10}>
                      <Ionicons name="close" size={28} color={COLORS.text} />
                    </Pressable>
                  </View>

                  <View style={styles.modalFieldBlock}>
                    <Text style={styles.modalLabel}>Nome <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      value={childName}
                      onChangeText={setChildName}
                      placeholder="Nome del figlio"
                      placeholderTextColor={COLORS.modalPlaceholder}
                      style={styles.modalTextInput}
                      autoCapitalize="words"
                      autoCorrect={false}
                      selectionColor={COLORS.blue}
                      returnKeyType="done"
                    />
                  </View>

                  <DateField
                    label="Data di nascita"
                    value={childBirthDate}
                    placeholder="Seleziona la data"
                    onPress={() => openDatePicker('child')}
                  />

                  <Pressable accessibilityRole="button" onPress={addChild} style={({ pressed }) => [styles.modalButton, pressed && styles.pressed]}>
                    <Text style={styles.modalButtonText}>Aggiungi</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {Platform.OS === 'ios' ? (
          <Modal visible={iosDateTarget !== null} transparent animationType="fade" onRequestClose={() => setIosDateTarget(null)}>
            <SafeAreaView style={styles.modalSafeArea} edges={['top', 'right', 'bottom', 'left']}>
              <View style={styles.dateModalOverlay}>
                <View style={styles.dateModalCard}>
                  <Text style={styles.dateModalTitle}>Seleziona la data</Text>
                  <DateTimePicker
                    value={iosPickerValue}
                    mode="date"
                    display="spinner"
                    minimumDate={MIN_DATE}
                    maximumDate={new Date()}
                    onChange={handleIosDateChange}
                    locale="it-IT"
                  />
                  <Pressable accessibilityRole="button" onPress={() => setIosDateTarget(null)} style={styles.dateModalButton}>
                    <Text style={styles.dateModalButtonText}>Fine</Text>
                  </Pressable>
                </View>
              </View>
            </SafeAreaView>
          </Modal>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RequiredLabel({ label, required = true }: { label: string; required?: boolean }): React.JSX.Element {
  return <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>;
}

function FormField({ label, required = false, icon, rightIcon, onRightPress, style, ...inputProps }: TextInputProps & {
  label: string;
  required?: boolean;
  icon: IconName;
  rightIcon?: IconName;
  onRightPress?: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.formField}>
      <RequiredLabel label={label} required={required} />
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={22} color={COLORS.muted} />
        <TextInput {...inputProps} style={[styles.input, style]} placeholderTextColor="#7892B5" selectionColor={COLORS.blue} />
        {rightIcon ? (
          <Pressable accessibilityRole={onRightPress ? 'button' : undefined} onPress={onRightPress} disabled={!onRightPress} hitSlop={9}>
            <Ionicons name={rightIcon} size={23} color={COLORS.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function DateField({ label, required = false, value, placeholder, onPress }: {
  label: string;
  required?: boolean;
  value: Date | null;
  placeholder: string;
  onPress: () => void;
}): React.JSX.Element {
  const formatted = formatItalianDate(value);
  return (
    <View style={styles.formField}>
      <RequiredLabel label={label} required={required} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${formatted || placeholder}`} onPress={onPress} style={({ pressed }) => [styles.inputShell, pressed && styles.pressed]}>
        <Ionicons name="calendar-outline" size={22} color={COLORS.muted} />
        <Text style={[styles.dateValue, !formatted && styles.datePlaceholder]}>{formatted || placeholder}</Text>
        <Ionicons name="chevron-down" size={20} color={COLORS.muted} />
      </Pressable>
    </View>
  );
}

function SelectorButton({ icon, label, selected, onPress }: { icon: IconName; label: string; selected: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.selectorButton, selected && styles.selectorButtonSelected, pressed && styles.pressed]}>
      <Ionicons name={icon} size={25} color={selected ? COLORS.blue : COLORS.muted} />
      <Text style={[styles.selectorText, selected && styles.selectorTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function RoleButton({ label, icon, selected, onPress }: { label: string; icon: IconName; selected: boolean; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.roleButton, selected && styles.roleButtonSelected, pressed && styles.pressed]}>
      <Ionicons name={icon} size={25} color={selected ? COLORS.blue : COLORS.muted} />
      <Text style={[styles.roleText, selected && styles.roleTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#D9ECFA' },
  screen: { flex: 1, backgroundColor: '#D9ECFA' },
  scrollContent: { flexGrow: 1, backgroundColor: '#D9ECFA', paddingTop: 6 },
  hero: { width: '100%', backgroundColor: '#D9ECFA' },
  card: {
    width: '100%', maxWidth: 900, alignSelf: 'center', marginTop: -22, paddingTop: 28,
    paddingHorizontal: 20, paddingBottom: 36, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    backgroundColor: COLORS.white, shadowColor: COLORS.shadow, shadowOpacity: 0.16, shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 }, elevation: 8, gap: 15,
  },
  title: { color: COLORS.text, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { marginTop: -7, color: COLORS.muted, fontSize: 17, lineHeight: 23, fontWeight: '500' },
  progressTrack: { width: 146, height: 7, borderRadius: 99, overflow: 'hidden', flexDirection: 'row', alignSelf: 'center', marginTop: -3 },
  progressSegment: { flex: 1 },
  progressBlue: { backgroundColor: COLORS.blue },
  progressOrange: { backgroundColor: COLORS.orange },
  accountSelector: { flexDirection: 'row', gap: 8 },
  selectorButton: { flex: 1, minHeight: 58, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#F9FBFE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  selectorButtonSelected: { borderColor: COLORS.blue, borderWidth: 2, backgroundColor: '#F1F7FD' },
  selectorText: { flexShrink: 1, color: COLORS.muted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  selectorTextSelected: { color: COLORS.blue, fontWeight: '900' },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldRowStack: { flexDirection: 'column' },
  formField: { flex: 1, gap: 7, minWidth: 0 },
  fieldBlock: { gap: 7 },
  label: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  required: { color: '#EF2B2D' },
  inputShell: { minHeight: 58, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.input, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 15, fontWeight: '500', paddingVertical: Platform.OS === 'ios' ? 16 : 12 },
  dateValue: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '600' },
  datePlaceholder: { color: '#7892B5', fontWeight: '500' },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleButton: { flex: 1, minHeight: 59, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#FAFCFE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  roleButtonSelected: { borderColor: COLORS.blue, borderWidth: 2, backgroundColor: '#F1F7FD' },
  roleText: { color: COLORS.muted, fontSize: 16, fontWeight: '700' },
  roleTextSelected: { color: COLORS.blue, fontWeight: '900' },
  childrenRow: { minHeight: 64, borderRadius: 15, backgroundColor: COLORS.input, paddingLeft: 14, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  childrenText: { flex: 1, color: COLORS.muted, fontSize: 15, fontWeight: '500' },
  plusBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  childChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  childChip: { maxWidth: '100%', borderRadius: 99, paddingLeft: 12, paddingRight: 8, paddingVertical: 7, backgroundColor: '#EAF3FC', flexDirection: 'row', alignItems: 'center', gap: 7 },
  childChipText: { color: COLORS.text, fontSize: 13, fontWeight: '700', maxWidth: 180 },
  inviteRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  inviteIcon: { width: 36, alignItems: 'center' },
  inviteTextArea: { flex: 1, gap: 2 },
  inviteTitle: { color: COLORS.text, fontSize: 15, fontWeight: '900' },
  inviteDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 17 },
  errorBox: { borderRadius: 13, padding: 12, backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  continueButton: { minHeight: 58, borderRadius: 15, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, shadowColor: COLORS.blue, shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  continueButtonPressed: { transform: [{ scale: 0.995 }], opacity: 0.92 },
  continueButtonDisabled: { opacity: 0.62 },
  continueText: { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  loginLink: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 8 },
  loginLinkText: { color: COLORS.muted, fontSize: 13 },
  loginLinkStrong: { color: COLORS.blue, fontWeight: '900' },
  pressed: { opacity: 0.78 },
  modalSafeArea: { flex: 1, backgroundColor: 'rgba(9, 35, 67, 0.42)' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(9, 35, 67, 0.42)' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 24, backgroundColor: COLORS.white, padding: 20, gap: 18, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: COLORS.text, fontSize: 24, fontWeight: '900' },
  modalFieldBlock: { gap: 8 },
  modalLabel: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  modalTextInput: { minHeight: 56, width: '100%', backgroundColor: '#E9F0F8', borderRadius: 12, borderWidth: 1, borderColor: '#C5D9EF', paddingHorizontal: 16, paddingVertical: 13, color: '#202124', fontSize: 16, fontWeight: '600' },
  modalButton: { minHeight: 56, borderRadius: 14, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  modalButtonText: { color: COLORS.white, fontSize: 17, fontWeight: '900' },
  dateModalOverlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(9, 35, 67, 0.42)' },
  dateModalCard: { width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 22, backgroundColor: COLORS.white, padding: 18, gap: 12 },
  dateModalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  dateModalButton: { minHeight: 50, borderRadius: 12, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  dateModalButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '900' },
});
