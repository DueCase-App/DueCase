import { italianDate, italianCategory } from '../services/italian';
import { openPrivateFile } from '../services/openFile';
import { useLiveRefresh } from '../services/live';
import { SafeModal as Modal } from '../components/SafeModal';
import { AttachmentSourceSheet, type PickedAttachment } from '../components/AttachmentSourceSheet';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { Expense, ExpenseCategory, ExpensePayment, FamilyActivity, FamilyBalance, FamilyChild, ParentRole } from '../types/models';

const categories: ExpenseCategory[] = ['Scuola', 'Salute', 'Sport', 'Svago'];
type Receipt = PickedAttachment;
const euro = (value: string | number) => `${Number(value || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const roleLabel = (role: ParentRole | null | undefined) => role === 'father' ? 'Papà' : role === 'mother' ? 'Mamma' : 'Account non disponibile';

const expenseStatusLabel: Record<Expense['status'], string> = {
  draft: 'Bozza',
  submitted: 'Inviata',
  pending_approval: 'Da approvare',
  approved: 'Approvata · da regolare',
  declined: 'Rifiutata',
  disputed: 'Contestata',
  to_pay: 'Da pagare',
  partially_paid: 'Parzialmente pagata',
  paid: 'Pagata',
  closed: 'Chiusa',
};

function statusTone(status: Expense['status']): 'success' | 'danger' | 'warning' | 'info' {
  if (status === 'paid' || status === 'closed') return 'success';
  if (status === 'declined' || status === 'disputed') return 'danger';
  if (status === 'pending_approval' || status === 'submitted' || status === 'draft') return 'warning';
  return 'info';
}

function historyActionLabel(action: string): string {
  const labels: Record<string, string> = {
    created: 'Spesa inserita',
    submitted: 'Spesa inviata',
    approved: 'Spesa approvata',
    declined: 'Spesa rifiutata',
    disputed: 'Spesa contestata',
    otp_verified: 'Conferma email verificata',
    payment_declared: 'Pagamento dichiarato',
    payment_confirmed: 'Pagamento ricevuto',
    payment_rejected: 'Pagamento rifiutato',
    updated: 'Spesa modificata',
  };
  return labels[action] ?? action.replace(/_/g, ' ');
}

function historyDetails(item: FamilyActivity): string | null {
  const details = item.details ?? {};
  if (typeof details.reason === 'string' && details.reason.trim()) return `Motivazione: ${details.reason}`;
  const amount = typeof details.amount === 'string' || typeof details.amount === 'number' ? Number(details.amount) : null;
  if (amount !== null && Number.isFinite(amount)) return `Importo: ${euro(amount)}`;
  if (typeof details.note === 'string' && details.note.trim()) return details.note;
  if (typeof details.status === 'string' && details.status.trim()) return `Stato: ${details.status}`;
  return null;
}

export function ExpensesScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<FamilyBalance | null>(null);
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [payments, setPayments] = useState<Record<string, ExpensePayment[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Expense | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<ExpensePayment | null>(null);
  const [otpExpense, setOtpExpense] = useState<Expense | null>(null);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);
  const [disputeExpense, setDisputeExpense] = useState<Expense | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [historyExpense, setHistoryExpense] = useState<Expense | null>(null);
  const [historyItems, setHistoryItems] = useState<FamilyActivity[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [expenseItems, nextBalance, kids] = await Promise.all([
        api.expenses.list(),
        api.expenses.balance(),
        api.family.children(),
      ]);
      setItems(expenseItems);
      setBalance(nextBalance);
      setChildren(kids);
      const paymentEntries = await Promise.all(expenseItems.map(async (expense) => {
        try { return [expense.id, await api.expenses.payments(expense.id)] as const; }
        catch { return [expense.id, [] as ExpensePayment[]] as const; }
      }));
      setPayments(Object.fromEntries(paymentEntries));
    } catch (error) {
      Alert.alert('Spese', error instanceof Error ? error.message : 'Errore di caricamento');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);

  async function decline(expense: Expense): Promise<void> {
    try {
      setBusy(expense.id);
      await api.expenses.decline(expense.id);
      await load();
    } catch (error) {
      Alert.alert('Spesa', error instanceof Error ? error.message : 'Operazione non riuscita');
    } finally { setBusy(null); }
  }

  async function dispute(): Promise<void> {
    if (!disputeExpense) return;
    const reason = disputeReason.trim();
    if (reason.length < 3) {
      Alert.alert('Contestazione', 'Scrivi una breve motivazione della contestazione.');
      return;
    }
    try {
      setBusy(disputeExpense.id);
      await api.expenses.dispute(disputeExpense.id, reason);
      setDisputeExpense(null);
      setDisputeReason('');
      await load();
      Alert.alert('Spesa contestata', 'La motivazione è stata registrata nello storico e notificata all’altro genitore.');
    } catch (error) {
      Alert.alert('Contestazione', error instanceof Error ? error.message : 'Contestazione non riuscita.');
    } finally { setBusy(null); }
  }

  async function openHistory(expense: Expense): Promise<void> {
    setHistoryExpense(expense);
    setHistoryItems([]);
    setHistoryLoading(true);
    try {
      setHistoryItems(await api.expenses.history(expense.id));
    } catch (error) {
      setHistoryExpense(null);
      Alert.alert('Storico spesa', error instanceof Error ? error.message : 'Impossibile caricare lo storico.');
    } finally { setHistoryLoading(false); }
  }

  async function approveOrdinary(expense: Expense): Promise<void> {
    try {
      setBusy(expense.id);
      await api.expenses.approve(expense.id);
      await load();
      Alert.alert('Spesa approvata', 'La spesa è stata approvata ed è pronta per il rimborso previsto.');
    } catch (error) {
      Alert.alert('Spesa', error instanceof Error ? error.message : 'Operazione non riuscita');
    } finally { setBusy(null); }
  }

  async function requestOtp(expense: Expense): Promise<void> {
    try {
      setBusy(expense.id);
      const result = await api.expenses.requestOtp(expense.id);
      setOtpEmail(result.maskedEmail);
      setOtpExpense(expense);
    } catch (error) {
      Alert.alert('Conferma tramite email', error instanceof Error ? error.message : 'Impossibile inviare il codice OTP.');
    } finally { setBusy(null); }
  }

  async function approveWithOtp(code: string): Promise<void> {
    if (!otpExpense) return;
    try {
      setBusy(otpExpense.id);
      await api.expenses.verifyOtp(otpExpense.id, code);
      setOtpExpense(null);
      setOtpEmail(null);
      await load();
      Alert.alert('Spesa approvata', 'La conferma tramite codice email è stata verificata e registrata.');
    } catch (error) {
      Alert.alert('Conferma tramite email', error instanceof Error ? error.message : 'Codice OTP non valido.');
      throw error;
    } finally { setBusy(null); }
  }

  async function confirmPayment(expense: Expense, payment: ExpensePayment): Promise<void> {
    try {
      setBusy(payment.id);
      await api.expenses.confirmPayment(expense.id, payment.id);
      await load();
      Alert.alert('Pagamento confermato', 'La ricezione del pagamento è stata registrata nello storico.');
    } catch (error) {
      Alert.alert('Pagamento', error instanceof Error ? error.message : 'Conferma non riuscita.');
    } finally { setBusy(null); }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.muted}>Caricamento spese…</Text></View>;

  const balanceMessage = !balance || balance.direction === 'settled'
    ? 'Siete in pari'
    : balance.direction === 'receive'
      ? `Devi ricevere ${euro(balance.settlementAmount)}`
      : `Devi rimborsare ${euro(balance.settlementAmount)}`;

  const cardWidth = width >= 1050 ? '48.8%' : '100%';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={ui.colors.primary} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerCopy}><Text style={styles.title}>Spese</Text><Text style={styles.muted}>Quote personalizzabili, ricevute, approvazioni, contestazioni e rimborsi tracciati.</Text></View>
            <Pressable style={styles.addButton} onPress={() => setFormVisible(true)}><Ionicons name="add" size={20} color="#FFF" /><Text style={styles.addText}>Aggiungi</Text></Pressable>
          </View>

          <View style={[styles.balanceCard, cardShadow]}>
            <Text style={styles.balanceLabel}>BILANCIO CONDIVISO</Text>
            <Text style={styles.balanceValue}>{balanceMessage}</Text>
            {balance ? (
              <View style={styles.balanceRows}>
                <Text style={styles.balanceMeta}>Anticipato: Papà {euro(balance.fatherPaid)} · Mamma {euro(balance.motherPaid)}</Text>
                <Text style={styles.balanceMeta}>Quote dovute: Papà {euro(balance.fatherShare)} · Mamma {euro(balance.motherShare)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Movimenti</Text><Text style={styles.countText}>{items.length} spese</Text></View>
          {items.length === 0 ? (
            <View style={[styles.card, cardShadow]}><Text style={styles.cardTitle}>Nessuna spesa</Text><Text style={styles.muted}>Aggiungi la prima spesa condivisa.</Text></View>
          ) : (
            <View style={styles.grid}>
              {items.map((expense) => {
                const tone = statusTone(expense.status);
                const expensePayments = payments[expense.id] ?? [];
                const canPay = user?.id !== expense.paidByUserId && ['approved', 'to_pay', 'partially_paid'].includes(expense.status);
                return (
                  <View key={expense.id} style={[styles.card, cardShadow, { width: cardWidth }]}>
                    <View style={styles.expenseTop}>
                      <View style={styles.expenseIcon}><Ionicons name="receipt-outline" size={22} color={ui.colors.primary} /></View>
                      <View style={styles.expenseCopy}>
                        <Text style={styles.cardTitle}>{expense.title}</Text>
                        <Text style={styles.meta}>{italianCategory(expense.category)} · {italianDate(expense.expenseDate)} · anticipata da {expense.paidByName ?? roleLabel(expense.paidByRole)}</Text>
                      </View>
                      <Text style={styles.amount}>{euro(expense.amount)}</Text>
                    </View>

                    <View style={styles.badgeRow}>
                      <View style={[styles.statusPill, tone === 'success' ? styles.statusSuccess : tone === 'danger' ? styles.statusDanger : tone === 'warning' ? styles.statusWarning : styles.statusInfo]}>
                        <Text style={[styles.statusText, tone === 'success' ? styles.statusSuccessText : tone === 'danger' ? styles.statusDangerText : tone === 'warning' ? styles.statusWarningText : styles.statusInfoText]}>{expenseStatusLabel[expense.status]}</Text>
                      </View>
                      {expense.isExtraordinary ? <View style={styles.extraordinaryPill}><Ionicons name="shield-checkmark-outline" size={14} color={ui.colors.primary} /><Text style={styles.extraordinaryText}>Straordinaria</Text></View> : null}
                    </View>

                    <View style={styles.splitBox}>
                      <View style={styles.splitItem}><Text style={styles.splitRole}>Papà</Text><Text style={styles.splitValue}>{Number(expense.fatherPercentage).toLocaleString('it-IT')}%</Text></View>
                      <View style={styles.splitDivider} />
                      <View style={styles.splitItem}><Text style={styles.splitRole}>Mamma</Text><Text style={styles.splitValue}>{Number(expense.motherPercentage).toLocaleString('it-IT')}%</Text></View>
                    </View>

                    {expense.children?.length ? <View style={styles.childRow}><Ionicons name="people-outline" size={16} color={ui.colors.muted} /><Text style={styles.meta}>{expense.children.map((child) => child.displayName).join(', ')}</Text></View> : null}
                    {expense.notes ? <Text style={styles.muted}>{expense.notes}</Text> : null}
                    {expense.otpSignatureMetadata ? <Text style={styles.signedText}>Conferma email verificata il {new Date(expense.otpSignatureMetadata.verifiedAt).toLocaleString('it-IT')}</Text> : null}

                    {expensePayments.length > 0 ? (
                      <View style={styles.paymentList}>
                        <Text style={styles.paymentTitle}>Pagamenti</Text>
                        {expensePayments.map((payment) => (
                          <View key={payment.id} style={styles.paymentRow}>
                            <View style={styles.paymentCopy}>
                              <Text style={styles.paymentAmount}>{euro(payment.amount)} · {payment.status === 'confirmed' ? 'Ricevuto' : 'Da confermare'}</Text>
                              <Text style={styles.meta}>{payment.paidByName ?? roleLabel(payment.paidByRole)} · {new Date(payment.paidAt).toLocaleString('it-IT')}</Text>
                            </View>
                            {payment.receiptUrl ? <Pressable style={styles.iconButton} onPress={() => setPaymentReceipt(payment)}><Ionicons name="document-attach-outline" size={20} color={ui.colors.primary} /></Pressable> : null}
                            {payment.canConfirm ? <Pressable disabled={busy === payment.id} style={styles.confirmPaymentButton} onPress={() => void confirmPayment(expense, payment)}>{busy === payment.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmPaymentText}>Conferma</Text>}</Pressable> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.actions}>
                      <Pressable style={styles.secondaryButton} onPress={() => void openHistory(expense)}><Ionicons name="time-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Storico</Text></Pressable>
                      {expense.receiptUrl ? <Pressable style={styles.secondaryButton} onPress={() => setReceipt(expense)}><Ionicons name="image-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Ricevuta</Text></Pressable> : null}
                      {canPay ? <Pressable style={styles.secondaryButton} onPress={() => setPaymentExpense(expense)}><Ionicons name="card-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Registra pagamento</Text></Pressable> : null}
                      {expense.canReview ? <>
                        <Pressable disabled={busy === expense.id} style={styles.disputeButton} onPress={() => { setDisputeExpense(expense); setDisputeReason(''); }}><Text style={styles.disputeText}>Contesta</Text></Pressable>
                        <Pressable disabled={busy === expense.id} style={styles.declineButton} onPress={() => void decline(expense)}><Text style={styles.declineText}>Rifiuta</Text></Pressable>
                        <Pressable disabled={busy === expense.id} style={styles.approveButton} onPress={() => void (expense.isExtraordinary ? requestOtp(expense) : approveOrdinary(expense))}>{busy === expense.id ? <ActivityIndicator color="#FFF" /> : <><Ionicons name={expense.isExtraordinary ? 'shield-checkmark-outline' : 'checkmark-circle-outline'} size={18} color="#FFF" /><Text style={styles.approveText}>Approva</Text></>}</Pressable>
                      </> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <ExpenseModal visible={formVisible} childrenList={children} onClose={() => setFormVisible(false)} onDone={() => { setFormVisible(false); void load(); }} />
      <PaymentModal reserved={paymentExpense ? (payments[paymentExpense.id]??[]).filter(p=>p.status==='declared'||p.status==='confirmed').reduce((sum,p)=>sum+Number(p.amount),0) : 0} expense={paymentExpense} currentRole={user?.role ?? null} onClose={() => setPaymentExpense(null)} onDone={() => { setPaymentExpense(null); void load(); }} />
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

      <Modal visible={disputeExpense !== null} transparent animationType="fade" onRequestClose={() => setDisputeExpense(null)}>
        <View style={styles.backdrop}><View style={styles.disputeModal}>
          <View style={styles.modalHead}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Contesta la spesa</Text><Text style={styles.meta}>{disputeExpense?.title}</Text></View><Pressable onPress={() => setDisputeExpense(null)}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
          <View style={styles.disputeNotice}><Ionicons name="alert-circle-outline" size={22} color={ui.colors.warning} /><Text style={styles.disputeNoticeText}>La contestazione è diversa dal rifiuto: la motivazione resterà nello storico della spesa e sarà notificata all’altro genitore.</Text></View>
          <Text style={styles.label}>Motivazione</Text>
          <TextInput value={disputeReason} onChangeText={setDisputeReason} maxLength={2000} multiline textAlignVertical="top" placeholder="Spiega in modo chiaro perché contesti questa spesa…" placeholderTextColor={ui.colors.muted} style={[styles.input, styles.disputeInput]} />
          <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={() => setDisputeExpense(null)}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={!disputeReason.trim() || busy === disputeExpense?.id} onPress={() => void dispute()} style={[styles.disputeConfirmButton, (!disputeReason.trim() || busy === disputeExpense?.id) && styles.disabledButton]}>{busy === disputeExpense?.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.disputeConfirmText}>Conferma contestazione</Text>}</Pressable></View>
        </View></View>
      </Modal>

      <Modal visible={historyExpense !== null} transparent animationType="fade" onRequestClose={() => setHistoryExpense(null)}>
        <View style={styles.backdrop}><View style={styles.historyModal}>
          <View style={styles.modalHead}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Storico spesa</Text><Text style={styles.meta}>{historyExpense?.title}</Text></View><Pressable onPress={() => setHistoryExpense(null)}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
          {historyLoading ? <ActivityIndicator style={{ marginVertical: 36 }} color={ui.colors.primary} /> : (
            <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyList}>
              {historyItems.length === 0 ? <View style={styles.historyEmpty}><Ionicons name="time-outline" size={32} color={ui.colors.primary} /><Text style={styles.cardTitle}>Nessuna voce disponibile</Text><Text style={styles.muted}>Le prossime operazioni compariranno qui.</Text></View> : historyItems.map((item, index) => {
                const detail = historyDetails(item);
                return <View key={item.id} style={[styles.historyRow, index < historyItems.length - 1 && styles.historyDivider]}>
                  <View style={styles.historyIcon}><Ionicons name="checkmark" size={15} color="#FFF" /></View>
                  <View style={{ flex: 1, minWidth: 0 }}><View style={styles.historyTop}><Text style={styles.historyAction}>{historyActionLabel(item.action)}</Text><Text style={styles.historyDate}>{new Date(item.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text></View><Text style={styles.historyActor}>{item.actorName ?? 'Account non disponibile'} · {roleLabel(item.actorRole)}</Text>{detail ? <Text style={styles.historyDetail}>{detail}</Text> : null}</View>
                </View>;
              })}
            </ScrollView>
          )}
          <View style={styles.historyNotice}><Ionicons name="shield-checkmark-outline" size={19} color={ui.colors.primary} /><Text style={styles.historyNoticeText}>Questo storico proviene dal registro append-only DueCase e include anche i pagamenti collegati alla spesa.</Text></View>
        </View></View>
      </Modal>

      <Modal visible={receipt !== null} transparent animationType="fade" onRequestClose={() => setReceipt(null)}>
        <View style={styles.backdrop}><View style={styles.preview}><View style={styles.modalHead}><Text style={styles.modalTitle}>Ricevuta spesa</Text><Pressable onPress={() => setReceipt(null)}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>{receipt?.receiptUrl ? <Image source={api.expenses.receiptSource(receipt.receiptUrl)} resizeMode="contain" style={styles.image} /> : null}</View></View>
      </Modal>

      <Modal visible={paymentReceipt !== null} transparent animationType="fade" onRequestClose={() => setPaymentReceipt(null)}>
        <View style={styles.backdrop}><View style={styles.preview}><View style={styles.modalHead}><Text style={styles.modalTitle}>Prova di pagamento</Text><Pressable onPress={() => setPaymentReceipt(null)}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>{paymentReceipt?.receiptUrl && paymentReceipt.receiptMimeType?.startsWith('image/') ? <Image source={api.expenses.paymentReceiptSource(paymentReceipt.receiptUrl)} resizeMode="contain" style={styles.image} /> : <View style={styles.filePreview}><Ionicons name="document-text-outline" size={46} color={ui.colors.primary} /><Text style={styles.cardTitle}>{paymentReceipt?.receiptFilename ?? 'Documento allegato'}</Text><Text style={styles.muted}>La prova di pagamento è archiviata e collegata a questa spesa.</Text></View>}{paymentReceipt?.receiptUrl ? <Pressable style={styles.secondaryButton} onPress={()=>void openPrivateFile(api.expenses.paymentReceiptSource(paymentReceipt.receiptUrl!),paymentReceipt.receiptFilename??"pagamento.pdf",paymentReceipt.receiptMimeType??"application/pdf").catch(e=>Alert.alert("Allegato",e.message))}><Text style={styles.secondaryText}>Apri o salva</Text></Pressable>:null}</View></View>
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
      <View style={styles.backdrop}><View style={styles.otpModal}>
        <View style={styles.otpIcon}><Ionicons name="shield-checkmark-outline" size={30} color={ui.colors.primary} /></View>
        <Text style={styles.modalTitle}>Conferma tramite email</Text>
        <Text style={styles.otpSubtitle}>Inserisci il codice di sicurezza a 6 cifre inviato per confermare l'approvazione di questa spesa straordinaria. La verifica registra l'operazione nell'app, ma non costituisce una firma elettronica qualificata e non attribuisce automaticamente valore legale.</Text>
        <Text style={styles.otpDelivery}>Codice inviato via email{maskedEmail ? ` a ${maskedEmail}` : ''}. Scade dopo 5 minuti.</Text>
        <View style={styles.otpRow}>{digits.map((digit, index) => <TextInput key={index} ref={(ref) => { refs.current[index] = ref; }} value={digit} onChangeText={(value) => changeDigit(index, value)} onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus(); }} keyboardType="number-pad" inputMode="numeric" maxLength={1} textAlign="center" style={[styles.otpInput, digit && styles.otpInputFilled]} accessibilityLabel={`Cifra OTP ${index + 1}`} />)}</View>
        <View style={styles.otpActions}><Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={busy || code.length !== 6} style={[styles.approveButton, (busy || code.length !== 6) && styles.disabledButton]} onPress={() => void onConfirm(code)}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>Conferma approvazione</Text>}</Pressable></View>
        <Pressable disabled={resending} onPress={() => void (async () => { try { setResending(true); await onResend(); Alert.alert('Conferma tramite email', 'Nuovo codice inviato via email.'); } catch (error) { Alert.alert('Conferma tramite email', error instanceof Error ? error.message : 'Invio non riuscito'); } finally { setResending(false); } })()}><Text style={styles.resendText}>{resending ? 'Invio…' : 'Invia un nuovo codice'}</Text></Pressable>
      </View></View>
    </Modal>
  );
}

function ExpenseModal({ visible, childrenList, onClose, onDone }: { visible: boolean; childrenList: FamilyChild[]; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Scuola');
  const [notes, setNotes] = useState('');
  const [isExtraordinary, setIsExtraordinary] = useState(false);
  const [fatherPercentage, setFatherPercentage] = useState('50');
  const [motherPercentage, setMotherPercentage] = useState('50');
  const [childIds, setChildIds] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleChild = (id: string): void => setChildIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  async function save(): Promise<void> {
    const normalized = amount.trim().replace(',', '.');
    const father = Number(fatherPercentage.replace(',', '.'));
    const mother = Number(motherPercentage.replace(',', '.'));
    if (!title.trim() || !/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) { Alert.alert('Spesa', 'Inserisci titolo e importo valido.'); return; }
    if (!Number.isFinite(father) || !Number.isFinite(mother) || father < 0 || mother < 0 || Math.abs(father + mother - 100) > 0.001) { Alert.alert('Percentuali', 'Le quote di Papà e Mamma devono sommare esattamente 100%.'); return; }
    try {
      setBusy(true);
      await api.expenses.create({ title: title.trim(), amount: normalized, category, notes: notes.trim() || undefined, isExtraordinary, fatherPercentage: father, motherPercentage: mother, childIds, receipt: receipt ?? undefined });
      onDone();
      setTitle(''); setAmount(''); setNotes(''); setIsExtraordinary(false); setFatherPercentage('50'); setMotherPercentage('50'); setChildIds([]); setReceipt(null);
    } catch (error) {
      Alert.alert('Spesa', error instanceof Error ? error.message : 'Salvataggio non riuscito');
    } finally { setBusy(false); }
  }

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}><View style={[styles.formModal,{maxHeight:"100%",flexShrink:1,padding:0,overflow:"hidden"}]}><View style={{padding:16}}>
        <View style={styles.modalHead}><Text style={styles.modalTitle}>Aggiungi spesa</Text><Pressable accessibilityLabel="Chiudi nuova spesa" onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View></View><ScrollView style={{flexShrink:1}} contentContainerStyle={{padding:16,gap:12}} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Descrizione</Text><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Es. Libri scolastici" placeholderTextColor={ui.colors.muted} />
        <Text style={styles.label}>Importo (€)</Text><TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={ui.colors.muted} />
        <Text style={styles.label}>Categoria</Text><View style={styles.chips}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipSelected]}><Text style={[styles.chipText, category === item && styles.chipTextSelected]}>{item}</Text></Pressable>)}</View>

        <Text style={styles.label}>Figlio o figli interessati</Text>
        <View style={styles.chips}>{childrenList.length ? childrenList.map((child) => <Pressable key={child.id} onPress={() => toggleChild(child.id)} style={[styles.chip, childIds.includes(child.id) && styles.chipSelected]}><Ionicons name={childIds.includes(child.id) ? 'checkmark-circle' : 'person-outline'} size={15} color={childIds.includes(child.id) ? ui.colors.primary : ui.colors.muted} /><Text style={[styles.chipText, childIds.includes(child.id) && styles.chipTextSelected]}>{child.displayName}</Text></Pressable>) : <Text style={styles.muted}>Nessun figlio inserito.</Text>}</View>

        <Text style={styles.label}>Ripartizione</Text>
        <View style={styles.percentageRow}><View style={styles.percentageField}><Text style={styles.percentageLabel}>Papà %</Text><TextInput style={styles.input} value={fatherPercentage} onChangeText={setFatherPercentage} keyboardType="decimal-pad" /></View><View style={styles.percentageField}><Text style={styles.percentageLabel}>Mamma %</Text><TextInput style={styles.input} value={motherPercentage} onChangeText={setMotherPercentage} keyboardType="decimal-pad" /></View></View>
        <Text style={styles.percentageHint}>Totale: {(Number(fatherPercentage.replace(',', '.')) || 0) + (Number(motherPercentage.replace(',', '.')) || 0)}%</Text>

        <View style={styles.extraordinaryToggle}><View style={styles.extraordinaryCopy}><Text style={styles.cardTitle}>Spesa straordinaria</Text><Text style={styles.meta}>Richiede conferma tramite codice email dell’altro genitore.</Text></View><Switch value={isExtraordinary} onValueChange={setIsExtraordinary} trackColor={{ false: '#D5DFEA', true: ui.colors.primary }} thumbColor="#FFF" /></View>
        <Text style={styles.label}>Note</Text><TextInput style={[styles.input, styles.notesInput]} multiline value={notes} onChangeText={setNotes} placeholder="Aggiungi una nota" placeholderTextColor={ui.colors.muted} />
        <Text style={styles.label}>Ricevuta</Text><Pressable style={styles.attachmentChoice} onPress={() => setPickerOpen(true)}><View style={styles.attachmentChoiceIcon}><Ionicons name={receipt?.type.startsWith('image/') ? 'image-outline' : 'attach-outline'} size={20} color={ui.colors.primary} /></View><View style={{flex:1}}><Text style={styles.secondaryText}>{receipt ? receipt.name : 'Aggiungi ricevuta'}</Text><Text style={styles.meta}>{receipt ? 'Tocca per sostituire' : 'Fotocamera, foto o file'}</Text></View><Ionicons name="chevron-forward" size={19} color={ui.colors.muted} /></Pressable>
        </ScrollView><View style={[styles.actions,{padding:16}]}><Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={busy} style={styles.approveButton} onPress={() => void save()}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>Invia spesa</Text>}</Pressable></View>
      </View></View>
    </Modal>
    <AttachmentSourceSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPicked={(value) => setReceipt(value)} title="Aggiungi ricevuta" />
    </>
  );
}

function PaymentModal({ expense, reserved, currentRole, onClose, onDone }: { reserved: number; expense: Expense | null; currentRole: ParentRole | null; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const suggested = useMemo(() => {
    if (!expense || !currentRole) return '';
    const percentage = currentRole === 'father' ? Number(expense.fatherPercentage) : Number(expense.motherPercentage);
    return Math.max(0,Number(expense.amount) * percentage / 100-reserved).toFixed(2);
  }, [expense, currentRole, reserved]);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (expense) { setAmount(suggested); setNotes(''); setReceipt(null); } }, [expense, suggested]);

  async function save(): Promise<void> {
    if (!expense) return;
    const normalized = amount.trim().replace(',', '.');
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) { Alert.alert('Pagamento', 'Inserisci un importo valido.'); return; }
    try {
      setBusy(true);
      await api.expenses.createPayment(expense.id, { amount: normalized, notes: notes.trim() || undefined, receipt: receipt ?? undefined });
      onDone();
      Alert.alert('Pagamento registrato', 'L’altro genitore potrà confermare la ricezione.');
    } catch (error) {
      Alert.alert('Pagamento', error instanceof Error ? error.message : 'Registrazione non riuscita.');
    } finally { setBusy(false); }
  }

  return <><Modal visible={expense !== null} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:"95%"}} contentContainerStyle={styles.paymentModal}>
    <View style={styles.modalHead}><View><Text style={styles.modalTitle}>Registra pagamento</Text><Text style={styles.meta}>{expense?.title}</Text></View><Pressable onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
    <Text style={styles.label}>Importo rimborsato (€)</Text><TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={ui.colors.muted} />
    <Text style={styles.label}>Prova di pagamento</Text><Pressable style={styles.attachmentChoice} onPress={() => setPickerOpen(true)}><View style={styles.attachmentChoiceIcon}><Ionicons name={receipt?.type.startsWith('image/') ? 'image-outline' : 'attach-outline'} size={20} color={ui.colors.primary} /></View><View style={{flex:1}}><Text style={styles.secondaryText}>{receipt ? receipt.name : 'Aggiungi prova di pagamento'}</Text><Text style={styles.meta}>{receipt ? 'Tocca per sostituire' : 'Fotocamera, foto o file'}</Text></View><Ionicons name="chevron-forward" size={19} color={ui.colors.muted} /></Pressable>
    <Text style={styles.label}>Note</Text><TextInput style={[styles.input, styles.notesInput]} multiline value={notes} onChangeText={setNotes} placeholder="Es. Bonifico effettuato" placeholderTextColor={ui.colors.muted} />
    <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={busy} style={styles.approveButton} onPress={() => void save()}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>Conferma pagamento</Text>}</Pressable></View>
  </ScrollView></View></Modal><AttachmentSourceSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPicked={(value) => setReceipt(value)} title="Aggiungi prova di pagamento" /></>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ui.colors.background },
  scrollContent: { paddingBottom: 34 },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 18, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontSize: 28, fontWeight: '900', color: ui.colors.primaryDark },
  muted: { color: ui.colors.muted, lineHeight: 20 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ui.colors.primary, paddingHorizontal: 13, minHeight: 44, borderRadius: ui.radius.md },
  addText: { color: '#FFF', fontWeight: '900' },
  balanceCard: { backgroundColor: ui.colors.primaryDark, borderRadius: ui.radius.lg, padding: 20, gap: 6 },
  balanceLabel: { color: '#BFD8F1', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  balanceValue: { color: '#FFF', fontSize: 27, fontWeight: '900' },
  balanceRows: { gap: 2 },
  balanceMeta: { color: '#DDEBFA', lineHeight: 19 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 21, fontWeight: '900', color: ui.colors.primaryDark },
  countText: { color: ui.colors.muted, fontWeight: '700', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, padding: 15, gap: 11 },
  expenseTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  expenseIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  expenseCopy: { flex: 1, gap: 3, minWidth: 0 },
  cardTitle: { color: ui.colors.text, fontWeight: '900', fontSize: 16 },
  meta: { color: ui.colors.muted, fontSize: 12, lineHeight: 17 },
  amount: { color: ui.colors.text, fontWeight: '900', fontSize: 17 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontWeight: '900', fontSize: 12 },
  statusSuccess: { backgroundColor: ui.colors.successSoft }, statusSuccessText: { color: ui.colors.success },
  statusDanger: { backgroundColor: ui.colors.dangerSoft }, statusDangerText: { color: ui.colors.danger },
  statusWarning: { backgroundColor: ui.colors.warningSoft }, statusWarningText: { color: ui.colors.warning },
  statusInfo: { backgroundColor: ui.colors.primarySoft }, statusInfoText: { color: ui.colors.primary },
  extraordinaryPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ui.colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  extraordinaryText: { color: ui.colors.primary, fontWeight: '900', fontSize: 12 },
  splitBox: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderRadius: 13, backgroundColor: ui.colors.input, paddingHorizontal: 10 },
  splitItem: { flex: 1, alignItems: 'center', gap: 2 },
  splitDivider: { width: 1, height: 34, backgroundColor: ui.colors.border },
  splitRole: { color: ui.colors.muted, fontSize: 11, fontWeight: '800' },
  splitValue: { color: ui.colors.primaryDark, fontSize: 17, fontWeight: '900' },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signedText: { color: ui.colors.success, fontWeight: '800', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  secondaryButton: { flex: 1, minWidth: 110, minHeight: 44, borderRadius: ui.radius.md, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 10 },
  secondaryText: { color: ui.colors.primaryDark, fontWeight: '800' },
  disputeButton: { flex: 1, minWidth: 100, minHeight: 44, borderRadius: ui.radius.md, backgroundColor: ui.colors.warningSoft, alignItems: 'center', justifyContent: 'center' },
  disputeText: { color: ui.colors.warning, fontWeight: '900' },
  declineButton: { flex: 1, minWidth: 100, minHeight: 44, borderRadius: ui.radius.md, backgroundColor: ui.colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  declineText: { color: ui.colors.danger, fontWeight: '900' },
  approveButton: { flex: 1, minWidth: 130, minHeight: 46, borderRadius: ui.radius.md, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  approveText: { color: '#FFF', fontWeight: '900' },
  disabledButton: { opacity: 0.45 },
  cancelButton: { flex: 1, minHeight: 46, borderRadius: ui.radius.md, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: ui.colors.text, fontWeight: '800' },
  paymentList: { gap: 8, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.colors.border },
  paymentTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 13 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ui.colors.input, borderRadius: 12, padding: 10 },
  paymentCopy: { flex: 1 },
  paymentAmount: { color: ui.colors.text, fontWeight: '900', fontSize: 13 },
  iconButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  confirmPaymentButton: { minHeight: 38, borderRadius: 11, paddingHorizontal: 11, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' },
  confirmPaymentText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,50,103,.35)' },
  formModal: { backgroundColor: ui.colors.card, padding: 20, paddingBottom: 30, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  paymentModal: { backgroundColor: ui.colors.card, padding: 20, paddingBottom: 30, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 10, width: '100%', maxWidth: 650, alignSelf: 'center' },
  disputeModal: { backgroundColor: ui.colors.card, padding: 20, paddingBottom: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 12, width: '100%', maxWidth: 650, alignSelf: 'center' },
  disputeNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 13, backgroundColor: ui.colors.warningSoft },
  disputeNoticeText: { flex: 1, color: ui.colors.text, fontSize: 12, lineHeight: 18 },
  disputeInput: { minHeight: 110, paddingTop: 12 },
  disputeConfirmButton: { flex: 1, minHeight: 46, minWidth: 170, borderRadius: ui.radius.md, backgroundColor: ui.colors.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  disputeConfirmText: { color: '#FFF', fontWeight: '900' },
  historyModal: { backgroundColor: ui.colors.card, padding: 18, paddingBottom: 22, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 12, width: '100%', maxWidth: 760, maxHeight: '86%', alignSelf: 'center' },
  historyScroll: { maxHeight: 520 },
  historyList: { paddingVertical: 4 },
  historyEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 34, gap: 7 },
  historyRow: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  historyDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.colors.border },
  historyIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  historyAction: { color: ui.colors.primaryDark, fontWeight: '900', flexShrink: 1 },
  historyDate: { color: ui.colors.muted, fontSize: 10 },
  historyActor: { color: ui.colors.muted, fontSize: 11, marginTop: 2 },
  historyDetail: { color: ui.colors.text, fontSize: 12, lineHeight: 18, marginTop: 4 },
  historyNotice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 13, backgroundColor: ui.colors.primarySoft, padding: 12 },
  historyNoticeText: { flex: 1, color: ui.colors.text, fontSize: 11, lineHeight: 17 },
  otpModal: { backgroundColor: ui.colors.card, padding: 22, paddingBottom: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 14, alignItems: 'center', width: '100%', maxWidth: 620, alignSelf: 'center' },
  otpIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { color: ui.colors.primaryDark, fontSize: 23, fontWeight: '900' },
  label: { color: ui.colors.text, fontWeight: '800', fontSize: 13 },
  input: { minHeight: 50, borderRadius: ui.radius.md, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.input, paddingHorizontal: 13, color: ui.colors.text },
  notesInput: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' },
  attachmentChoice: { minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  attachmentChoiceIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipSelected: { backgroundColor: ui.colors.primarySoft, borderColor: ui.colors.primary },
  chipText: { color: ui.colors.muted, fontWeight: '700' },
  chipTextSelected: { color: ui.colors.primary, fontWeight: '900' },
  percentageRow: { flexDirection: 'row', gap: 10 },
  percentageField: { flex: 1, gap: 5 },
  percentageLabel: { color: ui.colors.muted, fontSize: 12, fontWeight: '800' },
  percentageHint: { color: ui.colors.muted, fontSize: 12, textAlign: 'right' },
  extraordinaryToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border, borderRadius: ui.radius.md, padding: 13 },
  extraordinaryCopy: { flex: 1, gap: 3 },
  otpSubtitle: { color: ui.colors.text, textAlign: 'center', lineHeight: 21, fontWeight: '700' },
  otpDelivery: { color: ui.colors.muted, textAlign: 'center', lineHeight: 19, fontSize: 13 },
  otpRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 7, marginVertical: 4 },
  otpInput: { flex: 1, maxWidth: 54, minHeight: 58, borderRadius: 13, backgroundColor: '#E9F0F8', borderWidth: 1, borderColor: ui.colors.border, color: ui.colors.text, fontSize: 24, fontWeight: '900' },
  otpInputFilled: { borderColor: ui.colors.primary, backgroundColor: ui.colors.primarySoft },
  otpActions: { width: '100%', flexDirection: 'row', gap: 9 },
  resendText: { color: ui.colors.primary, fontWeight: '900' },
  preview: { backgroundColor: ui.colors.card, margin: 18, borderRadius: 20, padding: 14, gap: 12, maxHeight: '86%', width: '92%', maxWidth: 760, alignSelf: 'center' },
  image: { width: '100%', height: 500, backgroundColor: ui.colors.input, borderRadius: 12 },
  filePreview: { minHeight: 250, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ui.colors.input, borderRadius: 14, padding: 24 },
});
