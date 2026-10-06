import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { Expense, ExpenseCategory, FamilyBalance } from '../types/models';

const categories: ExpenseCategory[] = ['Scuola', 'Salute', 'Sport', 'Svago'];
type Receipt = { uri: string; name: string; type: string; file?: Blob };
const euro = (value: string) => `${Number(value).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const statusLabel = (status: Expense['status']) => status === 'approved' ? 'Approvata' : status === 'declined' ? 'Contestata' : 'Da approvare';

export function ExpensesScreen(): React.JSX.Element {
  const [items, setItems] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<FamilyBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Expense | null>(null);
  const [otpExpense, setOtpExpense] = useState<Expense | null>(null);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [expenses, nextBalance] = await Promise.all([api.expenses.list(), api.expenses.balance()]);
      setItems(expenses);
      setBalance(nextBalance);
    } catch (error) {
      Alert.alert('Spese', error instanceof Error ? error.message : 'Errore di caricamento');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decline(expense: Expense): Promise<void> {
    try {
      setBusy(expense.id);
      await api.expenses.decline(expense.id);
      await load();
    } catch (error) {
      Alert.alert('Spesa', error instanceof Error ? error.message : 'Operazione non riuscita');
    } finally {
      setBusy(null);
    }
  }

  async function approveOrdinary(expense: Expense): Promise<void> {
    try {
      setBusy(expense.id);
      await api.expenses.approve(expense.id);
      await load();
      Alert.alert('Spesa approvata', 'La spesa è stata approvata.');
    } catch (error) {
      Alert.alert('Spesa', error instanceof Error ? error.message : 'Operazione non riuscita');
    } finally {
      setBusy(null);
    }
  }

  async function requestOtp(expense: Expense): Promise<void> {
    try {
      setBusy(expense.id);
      const result = await api.expenses.requestOtp(expense.id);
      setOtpEmail(result.maskedEmail);
      setOtpExpense(expense);
    } catch (error) {
      Alert.alert('Firma OTP', error instanceof Error ? error.message : 'Impossibile inviare il codice OTP.');
    } finally {
      setBusy(null);
    }
  }

  async function approveWithOtp(code: string): Promise<void> {
    if (!otpExpense) return;
    try {
      setBusy(otpExpense.id);
      await api.expenses.verifyOtp(otpExpense.id, code);
      setOtpExpense(null);
      setOtpEmail(null);
      await load();
      Alert.alert('Spesa approvata', 'La firma OTP è stata verificata e registrata correttamente.');
    } catch (error) {
      Alert.alert('Firma OTP', error instanceof Error ? error.message : 'Codice OTP non valido.');
      throw error;
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.muted}>Caricamento spese…</Text></View>;

  const balanceMessage = !balance || balance.direction === 'settled'
    ? 'Siete in pari'
    : balance.direction === 'receive'
      ? `Devi ricevere ${euro(balance.settlementAmount)}`
      : `Devi dare ${euro(balance.settlementAmount)}`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={ui.colors.primary} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}><Text style={styles.title}>Spese</Text><Text style={styles.muted}>Condivisione chiara e approvazioni tracciate.</Text></View>
          <Pressable style={styles.addButton} onPress={() => setFormVisible(true)}><Ionicons name="add" size={20} color="#FFF" /><Text style={styles.addText}>Aggiungi</Text></Pressable>
        </View>

        <View style={[styles.balanceCard, cardShadow]}>
          <Text style={styles.balanceLabel}>BILANCIO ATTUALE</Text>
          <Text style={styles.balanceValue}>{balanceMessage}</Text>
          {balance ? <Text style={styles.balanceMeta}>Padre {euro(balance.fatherPaid)} · Madre {euro(balance.motherPaid)} · quota {euro(balance.perParentShare)}</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>Movimenti</Text>
        {items.length === 0 ? (
          <View style={[styles.card, cardShadow]}><Text style={styles.cardTitle}>Nessuna spesa</Text><Text style={styles.muted}>Aggiungi la prima spesa condivisa.</Text></View>
        ) : items.map((expense) => (
          <View key={expense.id} style={[styles.card, cardShadow]}>
            <View style={styles.expenseTop}>
              <View style={styles.expenseIcon}><Ionicons name="receipt-outline" size={22} color={ui.colors.primary} /></View>
              <View style={styles.expenseCopy}><Text style={styles.cardTitle}>{expense.title}</Text><Text style={styles.meta}>{expense.category} · {new Date(`${expense.expenseDate}T12:00:00`).toLocaleDateString('it-IT')} · {expense.paidByName ?? (expense.paidByRole === 'father' ? 'Padre' : 'Madre')}</Text></View>
              <Text style={styles.amount}>{euro(expense.amount)}</Text>
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.statusPill, expense.status === 'approved' ? styles.statusApproved : expense.status === 'declined' ? styles.statusDeclined : styles.statusPending]}>
                <Text style={[styles.statusText, expense.status === 'approved' ? styles.statusApprovedText : expense.status === 'declined' ? styles.statusDeclinedText : styles.statusPendingText]}>{statusLabel(expense.status)}</Text>
              </View>
              {expense.isExtraordinary ? <View style={styles.extraordinaryPill}><Ionicons name="shield-checkmark-outline" size={14} color={ui.colors.primary} /><Text style={styles.extraordinaryText}>Straordinaria</Text></View> : null}
            </View>

            {expense.notes ? <Text style={styles.muted}>{expense.notes}</Text> : null}
            {expense.otpSignatureMetadata ? <Text style={styles.signedText}>Firma OTP verificata il {new Date(expense.otpSignatureMetadata.verifiedAt).toLocaleString('it-IT')}</Text> : null}
            <View style={styles.actions}>
              {expense.receiptUrl ? <Pressable style={styles.secondaryButton} onPress={() => setReceipt(expense)}><Ionicons name="image-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Ricevuta</Text></Pressable> : null}
              {expense.canReview ? <>
                <Pressable disabled={busy === expense.id} style={styles.declineButton} onPress={() => void decline(expense)}><Text style={styles.declineText}>Contesta</Text></Pressable>
                <Pressable disabled={busy === expense.id} style={styles.approveButton} onPress={() => void (expense.isExtraordinary ? requestOtp(expense) : approveOrdinary(expense))}>{busy === expense.id ? <ActivityIndicator color="#FFF" /> : <><Ionicons name={expense.isExtraordinary ? 'shield-checkmark-outline' : 'checkmark-circle-outline'} size={18} color="#FFF" /><Text style={styles.approveText}>Approva</Text></>}</Pressable>
              </> : null}
            </View>
          </View>
        ))}
      </ScrollView>

      <ExpenseModal visible={formVisible} onClose={() => setFormVisible(false)} onDone={(expense) => { setItems((current) => [expense, ...current]); setFormVisible(false); void load(); }} />
      <OtpApprovalModal
        expense={otpExpense}
        maskedEmail={otpEmail}
        busy={otpExpense ? busy === otpExpense.id : false}
        onClose={() => { setOtpExpense(null); setOtpEmail(null); }}
        onConfirm={approveWithOtp}
        onResend={async () => {
          if (!otpExpense) return;
          const result = await api.expenses.requestOtp(otpExpense.id);
          setOtpEmail(result.maskedEmail);
        }}
      />

      <Modal visible={receipt !== null} transparent animationType="fade" onRequestClose={() => setReceipt(null)}>
        <View style={styles.backdrop}><View style={styles.preview}><View style={styles.modalHead}><Text style={styles.modalTitle}>Ricevuta</Text><Pressable onPress={() => setReceipt(null)}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>{receipt?.receiptUrl ? <Image source={api.expenses.receiptSource(receipt.receiptUrl)} resizeMode="contain" style={styles.image} /> : null}</View></View>
      </Modal>
    </View>
  );
}

function OtpApprovalModal({ expense, maskedEmail, busy, onClose, onConfirm, onResend }: { expense: Expense | null; maskedEmail: string | null; busy: boolean; onClose: () => void; onConfirm: (otp: string) => Promise<void>; onResend: () => Promise<void> }): React.JSX.Element {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [resending, setResending] = useState(false);
  const refs = useRef<Array<TextInput | null>>([]);

  useEffect(() => { if (expense) { setDigits(['', '', '', '', '', '']); setTimeout(() => refs.current[0]?.focus(), 250); } }, [expense]);

  function changeDigit(index: number, value: string): void {
    const cleaned = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((digit, i) => i === index ? cleaned : digit));
    if (cleaned && index < 5) refs.current[index + 1]?.focus();
  }

  const code = digits.join('');
  return (
    <Modal visible={expense !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.otpModal}>
          <View style={styles.otpIcon}><Ionicons name="shield-checkmark-outline" size={30} color={ui.colors.primary} /></View>
          <Text style={styles.modalTitle}>Firma OTP</Text>
          <Text style={styles.otpSubtitle}>Inserisci il codice di sicurezza a 6 cifre inviato per firmare l'approvazione di questa spesa straordinaria.</Text>
          <Text style={styles.otpDelivery}>Codice inviato via email{maskedEmail ? ` a ${maskedEmail}` : ''}. Scade dopo 5 minuti.</Text>
          <View style={styles.otpRow}>
            {digits.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => { refs.current[index] = ref; }}
                value={digit}
                onChangeText={(value) => changeDigit(index, value)}
                onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus(); }}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={1}
                textAlign="center"
                style={[styles.otpInput, digit && styles.otpInputFilled]}
                accessibilityLabel={`Cifra OTP ${index + 1}`}
              />
            ))}
          </View>
          <View style={styles.otpActions}>
            <Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Annulla</Text></Pressable>
            <Pressable disabled={busy || code.length !== 6} style={[styles.approveButton, (busy || code.length !== 6) && styles.disabledButton]} onPress={() => void onConfirm(code)}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>Conferma e Firma</Text>}</Pressable>
          </View>
          <Pressable disabled={resending} onPress={() => void (async () => { try { setResending(true); await onResend(); Alert.alert('Firma OTP', 'Nuovo codice inviato via email.'); } catch (error) { Alert.alert('Firma OTP', error instanceof Error ? error.message : 'Invio non riuscito'); } finally { setResending(false); } })()}>
            <Text style={styles.resendText}>{resending ? 'Invio…' : 'Invia un nuovo codice'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ExpenseModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: (expense: Expense) => void }): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Scuola');
  const [notes, setNotes] = useState('');
  const [isExtraordinary, setIsExtraordinary] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  async function fromLibrary(): Promise<void> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permesso richiesto', 'Consenti l’accesso alle foto.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) setReceipt({ uri: asset.uri, name: asset.fileName ?? `ricevuta-${Date.now()}.jpg`, type: asset.mimeType ?? 'image/jpeg', file: asset.file });
  }

  async function fromCamera(): Promise<void> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permesso richiesto', 'Consenti l’uso della fotocamera.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) setReceipt({ uri: asset.uri, name: asset.fileName ?? `ricevuta-${Date.now()}.jpg`, type: asset.mimeType ?? 'image/jpeg', file: asset.file });
  }

  async function save(): Promise<void> {
    const normalized = amount.trim().replace(',', '.');
    if (!title.trim() || !/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) { Alert.alert('Spesa', 'Inserisci titolo e importo valido.'); return; }
    try {
      setBusy(true);
      const expense = await api.expenses.create({ title: title.trim(), amount: normalized, category, notes: notes.trim() || undefined, isExtraordinary, receipt: receipt ?? undefined });
      onDone(expense);
      setTitle(''); setAmount(''); setNotes(''); setIsExtraordinary(false); setReceipt(null);
    } catch (error) {
      Alert.alert('Spesa', error instanceof Error ? error.message : 'Salvataggio non riuscito');
    } finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.formModal} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHead}><Text style={styles.modalTitle}>Aggiungi spesa</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
          <Text style={styles.label}>Titolo</Text><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Es. Libri scolastici" placeholderTextColor={ui.colors.muted} />
          <Text style={styles.label}>Importo (€)</Text><TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={ui.colors.muted} />
          <Text style={styles.label}>Categoria</Text><View style={styles.chips}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipSelected]}><Text style={[styles.chipText, category === item && styles.chipTextSelected]}>{item}</Text></Pressable>)}</View>
          <View style={styles.extraordinaryToggle}>
            <View style={styles.extraordinaryCopy}><Text style={styles.cardTitle}>Spesa straordinaria</Text><Text style={styles.meta}>Richiede la firma OTP dell’altro genitore per l’approvazione.</Text></View>
            <Switch value={isExtraordinary} onValueChange={setIsExtraordinary} trackColor={{ false: '#D5DFEA', true: ui.colors.primary }} thumbColor="#FFF" />
          </View>
          <Text style={styles.label}>Nota</Text><TextInput style={[styles.input, styles.notesInput]} multiline value={notes} onChangeText={setNotes} placeholder="Aggiungi una nota" placeholderTextColor={ui.colors.muted} />
          <Text style={styles.label}>Ricevuta (facoltativa)</Text>
          <View style={styles.actions}><Pressable style={styles.secondaryButton} onPress={() => void fromCamera()}><Ionicons name="camera-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Scatta foto</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => void fromLibrary()}><Ionicons name="images-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Galleria</Text></Pressable></View>
          {receipt ? <Text style={styles.muted}>Allegato: {receipt.name}</Text> : null}
          <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={busy} style={styles.approveButton} onPress={() => void save()}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>Salva spesa</Text>}</Pressable></View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ui.colors.background },
  content: { padding: 18, gap: 14, paddingBottom: 34 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontSize: 28, fontWeight: '900', color: ui.colors.primaryDark },
  muted: { color: ui.colors.muted, lineHeight: 20 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ui.colors.primary, paddingHorizontal: 13, minHeight: 44, borderRadius: ui.radius.md },
  addText: { color: '#FFF', fontWeight: '900' },
  balanceCard: { backgroundColor: ui.colors.primaryDark, borderRadius: ui.radius.lg, padding: 20, gap: 6 },
  balanceLabel: { color: '#BFD8F1', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  balanceValue: { color: '#FFF', fontSize: 27, fontWeight: '900' },
  balanceMeta: { color: '#DDEBFA', lineHeight: 19 },
  sectionTitle: { fontSize: 21, fontWeight: '900', color: ui.colors.primaryDark, marginTop: 4 },
  card: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, padding: 15, gap: 11 },
  expenseTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  expenseIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  expenseCopy: { flex: 1, gap: 3 },
  cardTitle: { color: ui.colors.text, fontWeight: '900', fontSize: 16 },
  meta: { color: ui.colors.muted, fontSize: 12, lineHeight: 17 },
  amount: { color: ui.colors.text, fontWeight: '900', fontSize: 17 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontWeight: '900', fontSize: 12 },
  statusApproved: { backgroundColor: ui.colors.successSoft }, statusApprovedText: { color: ui.colors.success },
  statusDeclined: { backgroundColor: ui.colors.dangerSoft }, statusDeclinedText: { color: ui.colors.danger },
  statusPending: { backgroundColor: ui.colors.warningSoft }, statusPendingText: { color: ui.colors.warning },
  extraordinaryPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ui.colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  extraordinaryText: { color: ui.colors.primary, fontWeight: '900', fontSize: 12 },
  signedText: { color: ui.colors.success, fontWeight: '800', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  secondaryButton: { flex: 1, minWidth: 100, minHeight: 44, borderRadius: ui.radius.md, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 10 },
  secondaryText: { color: ui.colors.primaryDark, fontWeight: '800' },
  declineButton: { flex: 1, minWidth: 100, minHeight: 44, borderRadius: ui.radius.md, backgroundColor: ui.colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  declineText: { color: ui.colors.danger, fontWeight: '900' },
  approveButton: { flex: 1, minWidth: 130, minHeight: 46, borderRadius: ui.radius.md, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  approveText: { color: '#FFF', fontWeight: '900' },
  disabledButton: { opacity: 0.45 },
  cancelButton: { flex: 1, minHeight: 46, borderRadius: ui.radius.md, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: ui.colors.text, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,50,103,.35)' },
  formModal: { backgroundColor: ui.colors.card, padding: 20, paddingBottom: 30, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 10 },
  otpModal: { backgroundColor: ui.colors.card, padding: 22, paddingBottom: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 14, alignItems: 'center' },
  otpIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { color: ui.colors.primaryDark, fontSize: 23, fontWeight: '900' },
  label: { color: ui.colors.text, fontWeight: '800', fontSize: 13 },
  input: { minHeight: 50, borderRadius: ui.radius.md, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.input, paddingHorizontal: 13, color: ui.colors.text },
  notesInput: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border },
  chipSelected: { backgroundColor: ui.colors.primarySoft, borderColor: ui.colors.primary },
  chipText: { color: ui.colors.muted, fontWeight: '700' },
  chipTextSelected: { color: ui.colors.primary, fontWeight: '900' },
  extraordinaryToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border, borderRadius: ui.radius.md, padding: 13 },
  extraordinaryCopy: { flex: 1, gap: 3 },
  otpSubtitle: { color: ui.colors.text, textAlign: 'center', lineHeight: 21, fontWeight: '700' },
  otpDelivery: { color: ui.colors.muted, textAlign: 'center', lineHeight: 19, fontSize: 13 },
  otpRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 7, marginVertical: 4 },
  otpInput: { flex: 1, maxWidth: 54, minHeight: 58, borderRadius: 13, backgroundColor: '#E9F0F8', borderWidth: 1, borderColor: ui.colors.border, color: ui.colors.text, fontSize: 24, fontWeight: '900' },
  otpInputFilled: { borderColor: ui.colors.primary, backgroundColor: ui.colors.primarySoft },
  otpActions: { width: '100%', flexDirection: 'row', gap: 9 },
  resendText: { color: ui.colors.primary, fontWeight: '900' },
  preview: { backgroundColor: ui.colors.card, margin: 18, borderRadius: 20, padding: 14, gap: 12, maxHeight: '86%' },
  image: { width: '100%', height: 500, backgroundColor: ui.colors.input, borderRadius: 12 },
});
