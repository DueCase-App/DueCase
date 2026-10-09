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
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { AttachmentSourceSheet, type PickedAttachment } from '../components/AttachmentSourceSheet';
import { SafeModal as Modal } from '../components/SafeModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { italianCategory, italianDate } from '../services/italian';
import { useLiveRefresh } from '../services/live';
import { openPrivateFile } from '../services/openFile';
import { cardShadow, ui } from '../theme/ui';
import type { Expense, ExpensePayment, FamilyActivity, FamilyBalance, FamilyChild, ParentRole } from '../types/models';
import { NewExpensePage } from './NewExpensePage';

type Receipt = PickedAttachment;
type ExtendedPayment = ExpensePayment & {
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  settlementId?: string | null;
};
type Settlement = {
  id: string;
  amount: string;
  status: 'declared' | 'confirmed' | 'rejected';
  paidAt: string;
  notes?: string | null;
  receiptFilename?: string | null;
  receiptMimeType?: string | null;
  receiptUrl?: string | null;
  paidByUserId: string;
  paidByName?: string | null;
  paidByRole?: ParentRole | null;
  receivedByUserId: string;
  receivedByName?: string | null;
  receivedByRole?: ParentRole | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  allocationSummary?: Array<{ expenseId: string; amount: string }>;
  createdAt?: string;
  canConfirm: boolean;
};
type RejectTarget =
  | { kind: 'payment'; expense: Expense; payment: ExtendedPayment }
  | { kind: 'settlement'; settlement: Settlement };

const euro = (value: string | number) => `${Number(value || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const roleLabel = (role: ParentRole | null | undefined) => role === 'father' ? 'Papà' : role === 'mother' ? 'Mamma' : 'Genitore';

const statusLabel: Record<Expense['status'], string> = {
  draft: 'Bozza',
  submitted: 'Inviata',
  pending_approval: 'Da approvare',
  approved: 'Da rimborsare',
  declined: 'Contestata',
  disputed: 'Contestata',
  to_pay: 'Da rimborsare',
  partially_paid: 'Parzialmente pagata',
  paid: 'Chiusa',
  closed: 'Chiusa',
};

function paymentStatusLabel(payment: ExtendedPayment): string {
  if (payment.status === 'confirmed') return 'Ricevuto';
  if (payment.status === 'rejected') return 'Non ricevuto';
  return 'In attesa di conferma';
}

function paymentConfirmedTotal(payments: ExtendedPayment[]): number {
  return payments.filter((item) => item.status === 'confirmed').reduce((sum, item) => sum + Number(item.amount), 0);
}

function paymentReservedTotal(payments: ExtendedPayment[]): number {
  return payments.filter((item) => item.status === 'confirmed' || item.status === 'declared').reduce((sum, item) => sum + Number(item.amount), 0);
}

function dueForCurrentUser(expense: Expense, currentRole: ParentRole | null | undefined): number {
  if (!currentRole) return 0;
  const percentage = currentRole === 'father' ? Number(expense.fatherPercentage) : Number(expense.motherPercentage);
  return Number(expense.amount) * percentage / 100;
}

function historyActionLabel(action: string): string {
  const labels: Record<string, string> = {
    created: 'Spesa inserita',
    approved: 'Spesa approvata',
    approved_otp: 'Spesa straordinaria confermata',
    declined: 'Spesa contestata',
    disputed: 'Spesa contestata',
    payment_declared: 'Pagamento registrato',
    payment_confirmed: 'Pagamento ricevuto',
    payment_rejected: 'Pagamento non ricevuto',
    settlement_allocated: 'Quota regolata tramite saldo netto',
    settlement_declared: 'Saldo netto registrato',
    settlement_confirmed: 'Saldo netto ricevuto',
    settlement_rejected: 'Saldo netto non ricevuto',
    updated: 'Spesa modificata',
  };
  return labels[action] ?? action.replace(/_/g, ' ');
}

function historyDetails(item: FamilyActivity): string | null {
  const details = item.details ?? {};
  if (typeof details.reason === 'string' && details.reason.trim()) return `Motivazione: ${details.reason}`;
  const amount = typeof details.amount === 'string' || typeof details.amount === 'number' ? Number(details.amount) : null;
  if (amount !== null && Number.isFinite(amount)) return `Importo: ${euro(amount)}`;
  if (typeof details.status === 'string' && details.status.trim()) return `Stato: ${details.status}`;
  return null;
}

export function ExpensesScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Expense[]>([]);
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [balance, setBalance] = useState<FamilyBalance | null>(null);
  const [payments, setPayments] = useState<Record<string, ExtendedPayment[]>>({});
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [otpExpense, setOtpExpense] = useState<Expense | null>(null);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [disputeExpense, setDisputeExpense] = useState<Expense | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);
  const [settlementVisible, setSettlementVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [receiptExpense, setReceiptExpense] = useState<Expense | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<ExtendedPayment | null>(null);
  const [settlementReceipt, setSettlementReceipt] = useState<Settlement | null>(null);
  const [historyExpense, setHistoryExpense] = useState<Expense | null>(null);
  const [historyItems, setHistoryItems] = useState<FamilyActivity[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [expenseItems, nextBalance, kids, settlementItems] = await Promise.all([
        api.expenses.list(),
        api.expenses.balance(),
        api.family.children(),
        api.expenses.settlements(),
      ]);
      setItems(expenseItems);
      setBalance(nextBalance);
      setChildren(kids);
      setSettlements(settlementItems as Settlement[]);
      const paymentEntries = await Promise.all(expenseItems.map(async (expense) => {
        try { return [expense.id, await api.expenses.payments(expense.id) as ExtendedPayment[]] as const; }
        catch { return [expense.id, [] as ExtendedPayment[]] as const; }
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

  async function approve(expense: Expense): Promise<void> {
    try {
      setBusy(expense.id);
      if (expense.isExtraordinary) {
        const result = await api.expenses.requestOtp(expense.id);
        setOtpEmail(result.maskedEmail);
        setOtpExpense(expense);
      } else {
        await api.expenses.approve(expense.id);
        await load();
        Alert.alert('Spesa approvata', 'La spesa è stata approvata. DueCase mostra ora il rimborso dovuto.');
      }
    } catch (error) {
      Alert.alert('Spesa', error instanceof Error ? error.message : 'Operazione non riuscita');
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
      Alert.alert('Spesa confermata', 'La conferma tramite codice email è stata registrata nello storico DueCase.');
    } catch (error) {
      Alert.alert('Conferma tramite email', error instanceof Error ? error.message : 'Codice OTP non valido.');
      throw error;
    } finally { setBusy(null); }
  }

  async function dispute(): Promise<void> {
    if (!disputeExpense) return;
    const reason = disputeReason.trim();
    if (reason.length < 3) { Alert.alert('Contestazione', 'Scrivi una breve motivazione.'); return; }
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

  async function confirmPayment(expense: Expense, payment: ExtendedPayment): Promise<void> {
    try {
      setBusy(payment.id);
      await api.expenses.confirmPayment(expense.id, payment.id);
      await load();
      Alert.alert('Pagamento ricevuto', 'La ricezione è stata registrata. Se il rimborso è completo, la spesa è ora chiusa.');
    } catch (error) {
      Alert.alert('Pagamento', error instanceof Error ? error.message : 'Conferma non riuscita.');
    } finally { setBusy(null); }
  }

  async function confirmSettlement(settlement: Settlement): Promise<void> {
    try {
      setBusy(settlement.id);
      await api.expenses.confirmSettlement(settlement.id);
      await load();
      Alert.alert('Saldo ricevuto', 'DueCase ha distribuito il pagamento sulle spese aperte e aggiornato il bilancio.');
    } catch (error) {
      Alert.alert('Regola saldo', error instanceof Error ? error.message : 'Conferma non riuscita.');
    } finally { setBusy(null); }
  }

  async function rejectCurrent(): Promise<void> {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) { Alert.alert('Motivazione', 'Scrivi una breve motivazione.'); return; }
    const key = rejectTarget.kind === 'payment' ? rejectTarget.payment.id : rejectTarget.settlement.id;
    try {
      setBusy(key);
      if (rejectTarget.kind === 'payment') {
        await api.expenses.rejectPayment(rejectTarget.expense.id, rejectTarget.payment.id, reason);
      } else {
        await api.expenses.rejectSettlement(rejectTarget.settlement.id, reason);
      }
      setRejectTarget(null);
      setRejectReason('');
      await load();
      Alert.alert('Pagamento non ricevuto', 'La segnalazione e la motivazione sono state registrate nello storico.');
    } catch (error) {
      Alert.alert('Pagamento', error instanceof Error ? error.message : 'Operazione non riuscita.');
    } finally { setBusy(null); }
  }

  async function openHistory(expense: Expense): Promise<void> {
    setHistoryExpense(expense);
    setHistoryItems([]);
    setHistoryLoading(true);
    try { setHistoryItems(await api.expenses.history(expense.id)); }
    catch (error) {
      setHistoryExpense(null);
      Alert.alert('Storico spesa', error instanceof Error ? error.message : 'Impossibile caricare lo storico.');
    } finally { setHistoryLoading(false); }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.muted}>Caricamento spese…</Text></View>;
  if (formVisible) return <NewExpensePage childrenList={children} onClose={() => setFormVisible(false)} onDone={() => { setFormVisible(false); void load(); }} />;

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
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Spese</Text>
              <Text style={styles.muted}>Inserisci, approva o contesta, rimborsa e chiudi ogni spesa con uno storico chiaro.</Text>
            </View>
            <Pressable style={styles.addButton} onPress={() => setFormVisible(true)}><Ionicons name="add" size={20} color="#FFF" /><Text style={styles.addText}>Aggiungi</Text></Pressable>
          </View>

          <View style={[styles.balanceCard, cardShadow]}>
            <View style={styles.balanceTop}>
              <View style={{ flex: 1 }}><Text style={styles.balanceLabel}>BILANCIO CONDIVISO</Text><Text style={styles.balanceValue}>{balanceMessage}</Text></View>
              <View style={[styles.balanceIcon, balance?.direction === 'settled' && styles.balanceIconOk]}><Ionicons name={balance?.direction === 'settled' ? 'checkmark' : 'swap-horizontal'} size={24} color={balance?.direction === 'settled' ? ui.colors.success : ui.colors.primary} /></View>
            </View>
            {balance ? <Text style={styles.balanceMeta}>Anticipato: Papà {euro(balance.fatherPaid)} · Mamma {euro(balance.motherPaid)}</Text> : null}
            {balance?.direction === 'pay' && Number(balance.settlementAmount) > 0 ? (
              <Pressable style={styles.settleButton} onPress={() => setSettlementVisible(true)}><Ionicons name="wallet-outline" size={19} color="#FFF" /><Text style={styles.settleButtonText}>Regola saldo {euro(balance.settlementAmount)}</Text></Pressable>
            ) : null}
            {balance?.direction === 'receive' ? <Text style={styles.balanceHint}>Quando l’altro genitore registra il saldo netto, potrai confermare qui la ricezione.</Text> : null}
          </View>

          {settlements.length > 0 ? (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Regolazioni saldo</Text><Text style={styles.countText}>{settlements.length}</Text></View>
              {settlements.slice(0, 4).map((settlement) => (
                <View key={settlement.id} style={[styles.settlementCard, cardShadow]}>
                  <View style={styles.settlementHead}>
                    <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{settlement.paidByName ?? roleLabel(settlement.paidByRole)} → {settlement.receivedByName ?? roleLabel(settlement.receivedByRole)}</Text><Text style={styles.meta}>{new Date(settlement.paidAt).toLocaleString('it-IT')}</Text></View>
                    <Text style={styles.amount}>{euro(settlement.amount)}</Text>
                  </View>
                  <StatusPill text={settlement.status === 'confirmed' ? 'Ricevuto' : settlement.status === 'rejected' ? 'Non ricevuto' : 'Da confermare'} tone={settlement.status === 'confirmed' ? 'success' : settlement.status === 'rejected' ? 'danger' : 'warning'} />
                  {settlement.rejectionReason ? <Text style={styles.reasonText}>Motivazione: {settlement.rejectionReason}</Text> : null}
                  <View style={styles.actions}>
                    {settlement.receiptUrl ? <Pressable style={styles.secondaryButton} onPress={() => setSettlementReceipt(settlement)}><Ionicons name="document-attach-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Contabile</Text></Pressable> : null}
                    {settlement.canConfirm ? <>
                      <Pressable style={styles.rejectPaymentButton} disabled={busy === settlement.id} onPress={() => { setRejectTarget({ kind: 'settlement', settlement }); setRejectReason(''); }}><Text style={styles.rejectPaymentText}>Non ricevuto</Text></Pressable>
                      <Pressable style={styles.confirmPaymentButton} disabled={busy === settlement.id} onPress={() => void confirmSettlement(settlement)}>{busy === settlement.id ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#FFF" /><Text style={styles.confirmPaymentText}>Ricevuto</Text></>}</Pressable>
                    </> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Movimenti</Text><Text style={styles.countText}>{items.length} spese</Text></View>
          {items.length === 0 ? (
            <View style={[styles.card, cardShadow]}><Text style={styles.cardTitle}>Nessuna spesa</Text><Text style={styles.muted}>Aggiungi la prima spesa condivisa.</Text></View>
          ) : (
            <View style={styles.grid}>
              {items.map((expense) => {
                const expensePayments = payments[expense.id] ?? [];
                const confirmed = paymentConfirmedTotal(expensePayments);
                const currentShare = dueForCurrentUser(expense, user?.role);
                const currentIsPayer = user?.id === expense.paidByUserId;
                const reimbursementDue = currentIsPayer
                  ? Number(expense.amount) * (expense.paidByRole === 'father' ? Number(expense.motherPercentage) : Number(expense.fatherPercentage)) / 100
                  : currentShare;
                const remaining = Math.max(0, reimbursementDue - confirmed);
                const actionableStatus = ['approved','to_pay','partially_paid'].includes(expense.status);
                const canPay = !currentIsPayer && actionableStatus && remaining > 0.004;
                const closed = expense.status === 'closed' || expense.status === 'paid';
                const tone = closed ? 'success' : expense.status === 'disputed' || expense.status === 'declined' ? 'danger' : expense.status === 'pending_approval' ? 'warning' : 'info';
                const actionText = actionableStatus
                  ? currentIsPayer ? `Devi ricevere ${euro(remaining)}` : `Devi rimborsare ${euro(remaining)}`
                  : statusLabel[expense.status];

                return (
                  <View key={expense.id} style={[styles.card, cardShadow, { width: cardWidth }]}>
                    <View style={styles.expenseTop}>
                      <View style={styles.expenseIcon}><Ionicons name="receipt-outline" size={22} color={ui.colors.primary} /></View>
                      <View style={styles.expenseCopy}><Text style={styles.cardTitle}>{expense.title}</Text><Text style={styles.meta}>{italianCategory(expense.category)} · {italianDate(expense.expenseDate)} · anticipata da {expense.paidByName ?? roleLabel(expense.paidByRole)}</Text></View>
                      <Text style={styles.amount}>{euro(expense.amount)}</Text>
                    </View>

                    <View style={styles.badgeRow}><StatusPill text={actionText} tone={tone} />{expense.isExtraordinary ? <View style={styles.extraordinaryPill}><Ionicons name="shield-checkmark-outline" size={14} color={ui.colors.primary} /><Text style={styles.extraordinaryText}>Straordinaria</Text></View> : null}</View>
                    {expense.isExtraordinary && !expense.otpSignatureMetadata ? (
                      <View style={styles.otpRequirementNotice}>
                        <Ionicons name="mail-outline" size={17} color={ui.colors.primary} />
                        <Text style={styles.otpRequirementText}>Per approvare questa spesa straordinaria è richiesto un codice OTP inviato via email all’altro genitore</Text>
                      </View>
                    ) : null}

                    <View style={styles.splitBox}>
                      <View style={styles.splitItem}><Text style={styles.splitRole}>Papà</Text><Text style={styles.splitValue}>{Number(expense.fatherPercentage).toLocaleString('it-IT')}%</Text></View>
                      <View style={styles.splitDivider} />
                      <View style={styles.splitItem}><Text style={styles.splitRole}>Mamma</Text><Text style={styles.splitValue}>{Number(expense.motherPercentage).toLocaleString('it-IT')}%</Text></View>
                    </View>

                    {expense.children?.length ? <View style={styles.childRow}><Ionicons name="people-outline" size={16} color={ui.colors.muted} /><Text style={styles.meta}>{expense.children.map((child) => child.displayName).join(', ')}</Text></View> : null}
                    {expense.notes ? <Text style={styles.muted}>{expense.notes}</Text> : null}
                    {expense.otpSignatureMetadata ? <Text style={styles.signedText}>Confermata tramite codice email il {new Date(expense.otpSignatureMetadata.verifiedAt).toLocaleString('it-IT')}</Text> : null}

                    {expensePayments.length > 0 ? (
                      <View style={styles.paymentList}>
                        <Text style={styles.paymentTitle}>Pagamenti collegati</Text>
                        {expensePayments.map((payment) => (
                          <View key={payment.id} style={styles.paymentRow}>
                            <View style={styles.paymentCopy}>
                              <Text style={styles.paymentAmount}>{euro(payment.amount)} · {paymentStatusLabel(payment)}</Text>
                              <Text style={styles.meta}>{payment.settlementId ? 'Regolato tramite saldo netto' : `${payment.paidByName ?? roleLabel(payment.paidByRole)} · ${new Date(payment.paidAt).toLocaleString('it-IT')}`}</Text>
                              {payment.rejectionReason ? <Text style={styles.reasonText}>Motivazione: {payment.rejectionReason}</Text> : null}
                            </View>
                            {payment.receiptUrl ? <Pressable style={styles.iconButton} onPress={() => setPaymentReceipt(payment)}><Ionicons name="document-attach-outline" size={20} color={ui.colors.primary} /></Pressable> : null}
                            {payment.canConfirm ? <View style={styles.paymentActions}><Pressable style={styles.rejectPaymentButton} disabled={busy === payment.id} onPress={() => { setRejectTarget({ kind: 'payment', expense, payment }); setRejectReason(''); }}><Text style={styles.rejectPaymentText}>Non ricevuto</Text></Pressable><Pressable style={styles.confirmPaymentButton} disabled={busy === payment.id} onPress={() => void confirmPayment(expense, payment)}>{busy === payment.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmPaymentText}>Ricevuto</Text>}</Pressable></View> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.actions}>
                      <Pressable style={styles.secondaryButton} onPress={() => void openHistory(expense)}><Ionicons name="time-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Storico</Text></Pressable>
                      {expense.receiptUrl ? <Pressable style={styles.secondaryButton} onPress={() => setReceiptExpense(expense)}><Ionicons name="image-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Ricevuta</Text></Pressable> : null}
                      {canPay ? <Pressable style={styles.payButton} onPress={() => setPaymentExpense(expense)}><Ionicons name="card-outline" size={18} color="#FFF" /><Text style={styles.payButtonText}>Registra pagamento</Text></Pressable> : null}
                      {expense.canReview ? <><Pressable disabled={busy === expense.id} style={styles.disputeButton} onPress={() => { setDisputeExpense(expense); setDisputeReason(''); }}><Text style={styles.disputeText}>Contesta</Text></Pressable><Pressable disabled={busy === expense.id} style={styles.approveButton} onPress={() => void approve(expense)}>{busy === expense.id ? <ActivityIndicator color="#FFF" /> : <><Ionicons name={expense.isExtraordinary ? 'shield-checkmark-outline' : 'checkmark-circle-outline'} size={18} color="#FFF" /><Text style={styles.approveText}>Approva</Text></>}</Pressable></> : null}
                    </View>
                    {closed ? <View style={styles.closedNotice}><Ionicons name="lock-closed-outline" size={16} color={ui.colors.success} /><Text style={styles.closedNoticeText}>Spesa chiusa: rimane consultabile con ricevute e storico, ma non richiede altre azioni.</Text></View> : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <PaymentModal expense={paymentExpense} reserved={paymentExpense ? paymentReservedTotal(payments[paymentExpense.id] ?? []) : 0} currentRole={user?.role ?? null} onClose={() => setPaymentExpense(null)} onDone={() => { setPaymentExpense(null); void load(); }} />
      <SettlementModal visible={settlementVisible} amount={balance?.settlementAmount ?? '0.00'} onClose={() => setSettlementVisible(false)} onDone={() => { setSettlementVisible(false); void load(); }} />
      <OtpApprovalModal expense={otpExpense} maskedEmail={otpEmail} busy={otpExpense ? busy === otpExpense.id : false} onClose={() => { setOtpExpense(null); setOtpEmail(null); }} onConfirm={approveWithOtp} onResend={async () => { if (!otpExpense) return; const result = await api.expenses.requestOtp(otpExpense.id); setOtpEmail(result.maskedEmail); }} />

      <Modal visible={disputeExpense !== null} transparent animationType="fade" onRequestClose={() => setDisputeExpense(null)}>
        <View style={styles.backdrop}><View style={styles.dialog}>
          <View style={styles.modalHead}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Contesta la spesa</Text><Text style={styles.meta}>{disputeExpense?.title}</Text></View><Pressable onPress={() => setDisputeExpense(null)}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
          <View style={styles.notice}><Ionicons name="information-circle-outline" size={21} color={ui.colors.warning} /><Text style={styles.noticeText}>La motivazione è obbligatoria, resta nello storico e viene notificata all’altro genitore.</Text></View>
          <Text style={styles.label}>Motivazione</Text>
          <TextInput value={disputeReason} onChangeText={setDisputeReason} maxLength={2000} multiline textAlignVertical="top" placeholder="Spiega in modo chiaro perché contesti questa spesa…" placeholderTextColor={ui.colors.muted} style={[styles.input, styles.longInput]} />
          <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={() => setDisputeExpense(null)}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={disputeReason.trim().length < 3 || busy === disputeExpense?.id} style={[styles.disputeConfirmButton, (disputeReason.trim().length < 3 || busy === disputeExpense?.id) && styles.disabled]} onPress={() => void dispute()}>{busy === disputeExpense?.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.disputeConfirmText}>Conferma contestazione</Text>}</Pressable></View>
        </View></View>
      </Modal>

      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.backdrop}><View style={styles.dialog}>
          <View style={styles.modalHead}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Pagamento non ricevuto</Text><Text style={styles.meta}>La motivazione sarà visibile nello storico condiviso.</Text></View><Pressable onPress={() => setRejectTarget(null)}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
          <Text style={styles.label}>Motivazione</Text>
          <TextInput value={rejectReason} onChangeText={setRejectReason} maxLength={2000} multiline textAlignVertical="top" placeholder="Es. Il bonifico non risulta accreditato…" placeholderTextColor={ui.colors.muted} style={[styles.input, styles.longInput]} />
          <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={() => setRejectTarget(null)}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={rejectReason.trim().length < 3 || busy !== null} style={[styles.disputeConfirmButton, (rejectReason.trim().length < 3 || busy !== null) && styles.disabled]} onPress={() => void rejectCurrent()}><Text style={styles.disputeConfirmText}>Conferma</Text></Pressable></View>
        </View></View>
      </Modal>

      <Modal visible={historyExpense !== null} transparent animationType="fade" onRequestClose={() => setHistoryExpense(null)}>
        <View style={styles.backdrop}><View style={styles.historyModal}>
          <View style={styles.modalHead}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Storico spesa</Text><Text style={styles.meta}>{historyExpense?.title}</Text></View><Pressable onPress={() => setHistoryExpense(null)}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
          {historyLoading ? <ActivityIndicator style={{ marginVertical: 36 }} color={ui.colors.primary} /> : <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyList}>{historyItems.length === 0 ? <Text style={styles.muted}>Nessuna voce disponibile.</Text> : historyItems.map((item) => <View key={item.id} style={styles.historyItem}><View style={styles.historyDot} /><View style={{ flex: 1 }}><Text style={styles.historyTitle}>{historyActionLabel(item.action)}</Text><Text style={styles.meta}>{item.actorName ?? roleLabel(item.actorRole)} · {new Date(item.createdAt).toLocaleString('it-IT')}</Text>{historyDetails(item) ? <Text style={styles.historyDetail}>{historyDetails(item)}</Text> : null}</View></View>)}</ScrollView>}
          <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={19} color={ui.colors.primary} /><Text style={styles.noticeText}>Lo storico DueCase conserva le operazioni rilevanti collegate alla spesa.</Text></View>
        </View></View>
      </Modal>

      <ReceiptModal title="Ricevuta spesa" visible={receiptExpense !== null} imageSource={receiptExpense?.receiptUrl ? api.expenses.receiptSource(receiptExpense.receiptUrl) : null} onClose={() => setReceiptExpense(null)} />
      <FileReceiptModal title="Prova di pagamento" payment={paymentReceipt} onClose={() => setPaymentReceipt(null)} />
      <SettlementReceiptModal settlement={settlementReceipt} onClose={() => setSettlementReceipt(null)} />
    </View>
  );
}

function StatusPill({ text, tone }: { text: string; tone: 'success'|'danger'|'warning'|'info' }): React.JSX.Element {
  return <View style={[styles.statusPill, tone === 'success' ? styles.statusSuccess : tone === 'danger' ? styles.statusDanger : tone === 'warning' ? styles.statusWarning : styles.statusInfo]}><Text style={[styles.statusText, tone === 'success' ? styles.statusSuccessText : tone === 'danger' ? styles.statusDangerText : tone === 'warning' ? styles.statusWarningText : styles.statusInfoText]}>{text}</Text></View>;
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
  return <Modal visible={expense !== null} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><ScrollView style={styles.otpDialogScroll} contentContainerStyle={styles.otpDialogContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}><View style={[styles.dialog, styles.otpDialog]}>
    <View style={styles.otpIcon}><Ionicons name="shield-checkmark-outline" size={30} color={ui.colors.primary} /></View>
    <Text style={styles.modalTitle}>Conferma spesa straordinaria</Text>
    <Text style={styles.otpSubtitle}>Inserisci il codice a 6 cifre inviato via email. DueCase registrerà chi ha confermato e quando, senza presentarlo come firma digitale qualificata.</Text>
    <Text style={styles.otpDelivery}>Codice inviato{maskedEmail ? ` a ${maskedEmail}` : ''}. Scade dopo 5 minuti.</Text>
    <View style={styles.otpRow}>{digits.map((digit, index) => <TextInput key={index} ref={(ref) => { refs.current[index] = ref; }} value={digit} onChangeText={(value) => changeDigit(index, value)} onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus(); }} keyboardType="number-pad" inputMode="numeric" maxLength={1} textAlign="center" style={[styles.otpInput, digit && styles.otpInputFilled]} />)}</View>
    <Pressable disabled={resending} onPress={() => void (async () => { try { setResending(true); await onResend(); Alert.alert('Codice inviato', 'Ti abbiamo inviato un nuovo codice via email.'); } catch (error) { Alert.alert('Conferma', error instanceof Error ? error.message : 'Invio non riuscito'); } finally { setResending(false); } })()}><Text style={styles.resendText}>{resending ? 'Invio…' : 'Invia un nuovo codice'}</Text></Pressable>
    <View style={styles.otpActions}><Pressable style={[styles.cancelButton, styles.otpActionButton]} onPress={onClose}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={busy || code.length !== 6} style={[styles.approveButton, styles.otpActionButton, (busy || code.length !== 6) && styles.disabled]} onPress={() => void onConfirm(code)}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>Conferma</Text>}</Pressable></View>
  </View></ScrollView></View></Modal>;
}

function PaymentModal({ expense, reserved, currentRole, onClose, onDone }: { expense: Expense | null; reserved: number; currentRole: ParentRole | null; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const suggested = useMemo(() => {
    if (!expense || !currentRole) return '';
    const percentage = currentRole === 'father' ? Number(expense.fatherPercentage) : Number(expense.motherPercentage);
    return Math.max(0, Number(expense.amount) * percentage / 100 - reserved).toFixed(2);
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
      Alert.alert('Pagamento registrato', 'L’altro genitore riceverà una notifica e potrà confermare oppure segnalare che non lo ha ricevuto.');
    } catch (error) { Alert.alert('Pagamento', error instanceof Error ? error.message : 'Registrazione non riuscita.'); }
    finally { setBusy(false); }
  }
  return <><Modal visible={expense !== null} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.dialog}>
    <View style={styles.modalHead}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Registra pagamento</Text><Text style={styles.meta}>{expense?.title}</Text></View><Pressable onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
    <Text style={styles.label}>Importo rimborsato (€)</Text><TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={ui.colors.muted} />
    <Text style={styles.label}>Prova di pagamento</Text><AttachmentChoice receipt={receipt} onPress={() => setPickerOpen(true)} />
    <Text style={styles.label}>Note</Text><TextInput style={[styles.input, styles.notesInput]} multiline value={notes} onChangeText={setNotes} placeholder="Facoltativo" placeholderTextColor={ui.colors.muted} />
    <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={busy} style={styles.payButton} onPress={() => void save()}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.payButtonText}>Registra pagamento</Text>}</Pressable></View>
  </View></View></Modal><AttachmentSourceSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPicked={setReceipt} title="Prova di pagamento" /></>;
}

function SettlementModal({ visible, amount, onClose, onDone }: { visible: boolean; amount: string; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const [value, setValue] = useState(amount);
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setValue(Number(amount).toFixed(2)); setNotes(''); setReceipt(null); } }, [visible, amount]);
  async function save(): Promise<void> {
    const normalized = value.trim().replace(',', '.');
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) { Alert.alert('Regola saldo', 'Inserisci un importo valido.'); return; }
    try {
      setBusy(true);
      await api.expenses.createSettlement({ amount: normalized, notes: notes.trim() || undefined, receipt: receipt ?? undefined });
      onDone();
      Alert.alert('Saldo registrato', 'L’altro genitore potrà confermare la ricezione. Dopo la conferma DueCase distribuirà automaticamente il saldo sulle spese aperte.');
    } catch (error) { Alert.alert('Regola saldo', error instanceof Error ? error.message : 'Operazione non riuscita.'); }
    finally { setBusy(false); }
  }
  return <><Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.dialog}>
    <View style={styles.modalHead}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Regola saldo</Text><Text style={styles.meta}>Un solo pagamento per compensare le spese già approvate.</Text></View><Pressable onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>
    <View style={styles.notice}><Ionicons name="swap-horizontal" size={21} color={ui.colors.primary} /><Text style={styles.noticeText}>DueCase calcola il saldo netto tra Papà e Mamma. Dopo la conferma del ricevente, il pagamento viene distribuito sulle spese aperte.</Text></View>
    <Text style={styles.label}>Importo (€)</Text><TextInput style={styles.input} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
    <Text style={styles.label}>Contabile</Text><AttachmentChoice receipt={receipt} onPress={() => setPickerOpen(true)} />
    <Text style={styles.label}>Note</Text><TextInput style={[styles.input, styles.notesInput]} multiline value={notes} onChangeText={setNotes} placeholder="Facoltativo" placeholderTextColor={ui.colors.muted} />
    <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={busy} style={styles.settleButton} onPress={() => void save()}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.settleButtonText}>Registra saldo</Text>}</Pressable></View>
  </View></View></Modal><AttachmentSourceSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPicked={setReceipt} title="Contabile saldo" /></>;
}

function AttachmentChoice({ receipt, onPress }: { receipt: Receipt | null; onPress: () => void }): React.JSX.Element {
  return <Pressable style={styles.attachmentChoice} onPress={onPress}><View style={styles.attachmentChoiceIcon}><Ionicons name={receipt?.type.startsWith('image/') ? 'image-outline' : 'attach-outline'} size={20} color={ui.colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.secondaryText}>{receipt ? receipt.name : 'Aggiungi file'}</Text><Text style={styles.meta}>{receipt ? 'Tocca per sostituire' : 'Foto, fotocamera o PDF'}</Text></View><Ionicons name="chevron-forward" size={19} color={ui.colors.muted} /></Pressable>;
}

function ReceiptModal({ title, visible, imageSource, onClose }: { title: string; visible: boolean; imageSource: { uri: string; headers?: Record<string,string> } | null; onClose: () => void }): React.JSX.Element {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.preview}><View style={styles.modalHead}><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>{imageSource ? <Image source={imageSource} resizeMode="contain" style={styles.image} /> : null}</View></View></Modal>;
}

function FileReceiptModal({ title, payment, onClose }: { title: string; payment: ExtendedPayment | null; onClose: () => void }): React.JSX.Element {
  return <Modal visible={payment !== null} transparent animationType="fade" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.preview}><View style={styles.modalHead}><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>{payment?.receiptUrl && payment.receiptMimeType?.startsWith('image/') ? <Image source={api.expenses.paymentReceiptSource(payment.receiptUrl)} resizeMode="contain" style={styles.image} /> : <View style={styles.filePreview}><Ionicons name="document-text-outline" size={46} color={ui.colors.primary} /><Text style={styles.cardTitle}>{payment?.receiptFilename ?? 'Documento allegato'}</Text></View>}{payment?.receiptUrl ? <Pressable style={styles.secondaryButton} onPress={() => void openPrivateFile(api.expenses.paymentReceiptSource(payment.receiptUrl!), payment.receiptFilename ?? 'pagamento.pdf', payment.receiptMimeType ?? 'application/pdf').catch((error) => Alert.alert('Allegato', error.message))}><Text style={styles.secondaryText}>Apri o salva</Text></Pressable> : null}</View></View></Modal>;
}

function SettlementReceiptModal({ settlement, onClose }: { settlement: Settlement | null; onClose: () => void }): React.JSX.Element {
  const source = settlement?.receiptUrl ? api.expenses.settlementReceiptSource(settlement.receiptUrl) : null;
  return <Modal visible={settlement !== null} transparent animationType="fade" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.preview}><View style={styles.modalHead}><Text style={styles.modalTitle}>Contabile saldo</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text} /></Pressable></View>{source && settlement?.receiptMimeType?.startsWith('image/') ? <Image source={source} resizeMode="contain" style={styles.image} /> : <View style={styles.filePreview}><Ionicons name="document-text-outline" size={46} color={ui.colors.primary} /><Text style={styles.cardTitle}>{settlement?.receiptFilename ?? 'Documento allegato'}</Text></View>}{source ? <Pressable style={styles.secondaryButton} onPress={() => void openPrivateFile(source, settlement?.receiptFilename ?? 'saldo.pdf', settlement?.receiptMimeType ?? 'application/pdf').catch((error) => Alert.alert('Allegato', error.message))}><Text style={styles.secondaryText}>Apri o salva</Text></Pressable> : null}</View></View></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 130 },
  content: { width: '100%', maxWidth: 1120, alignSelf: 'center', gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontSize: 29, fontWeight: '900', color: ui.colors.primaryDark },
  muted: { color: ui.colors.muted, fontSize: 14, lineHeight: 20 },
  meta: { color: ui.colors.muted, fontSize: 12.5, lineHeight: 18 },
  addButton: { minHeight: 45, paddingHorizontal: 17, borderRadius: 15, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  addText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  balanceCard: { borderRadius: ui.radius.xl, padding: 18, backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border, gap: 10 },
  balanceTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balanceLabel: { color: ui.colors.muted, fontWeight: '900', fontSize: 11, letterSpacing: 1.1 },
  balanceValue: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 24, marginTop: 4 },
  balanceMeta: { color: ui.colors.muted, fontSize: 13 },
  balanceHint: { color: ui.colors.primaryDark, fontSize: 13, lineHeight: 19 },
  balanceIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  balanceIconOk: { backgroundColor: ui.colors.successSoft },
  settleButton: { minHeight: 46, borderRadius: 15, backgroundColor: ui.colors.orange, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, alignSelf: 'flex-start' },
  settleButtonText: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  sectionBlock: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  sectionTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 18 },
  countText: { color: ui.colors.muted, fontWeight: '800', fontSize: 12 },
  settlementCard: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, padding: 15, gap: 10 },
  settlementHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' },
  card: { backgroundColor: ui.colors.card, borderRadius: ui.radius.xl, borderWidth: 1, borderColor: ui.colors.border, padding: 16, gap: 12 },
  expenseTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  expenseIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  expenseCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 16 },
  amount: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 18 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '900' },
  statusSuccess: { backgroundColor: ui.colors.successSoft }, statusSuccessText: { color: ui.colors.success },
  statusDanger: { backgroundColor: ui.colors.dangerSoft }, statusDangerText: { color: ui.colors.danger },
  statusWarning: { backgroundColor: ui.colors.warningSoft }, statusWarningText: { color: ui.colors.warning },
  statusInfo: { backgroundColor: ui.colors.primarySoft }, statusInfoText: { color: ui.colors.primary },
  extraordinaryPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: ui.colors.skySoft, paddingHorizontal: 9, paddingVertical: 6 },
  extraordinaryText: { color: ui.colors.primaryDark, fontSize: 12, fontWeight: '800' },
  otpRequirementNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, backgroundColor: ui.colors.primarySoft, paddingHorizontal: 11, paddingVertical: 10 },
  otpRequirementText: { flex: 1, color: ui.colors.primaryDark, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  splitBox: { flexDirection: 'row', borderRadius: 14, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border, overflow: 'hidden' },
  splitItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  splitDivider: { width: 1, backgroundColor: ui.colors.border },
  splitRole: { color: ui.colors.muted, fontSize: 11, fontWeight: '800' },
  splitValue: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 16 },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signedText: { color: ui.colors.success, fontSize: 12.5, fontWeight: '800' },
  reasonText: { color: ui.colors.danger, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  paymentList: { borderTopWidth: 1, borderTopColor: ui.colors.border, paddingTop: 12, gap: 9 },
  paymentTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 14 },
  paymentRow: { borderRadius: 13, backgroundColor: ui.colors.input, padding: 11, gap: 8 },
  paymentCopy: { flex: 1 },
  paymentAmount: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 13.5 },
  paymentActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  secondaryButton: { minHeight: 39, borderRadius: 12, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  secondaryText: { color: ui.colors.primary, fontWeight: '900', fontSize: 13 },
  iconButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  payButton: { minHeight: 41, borderRadius: 12, backgroundColor: ui.colors.primary, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  payButtonText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  disputeButton: { minHeight: 41, borderRadius: 12, borderWidth: 1.5, borderColor: ui.colors.danger, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  disputeText: { color: ui.colors.danger, fontWeight: '900', fontSize: 13 },
  approveButton: { minHeight: 41, borderRadius: 12, backgroundColor: ui.colors.success, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  approveText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  confirmPaymentButton: { minHeight: 38, borderRadius: 11, backgroundColor: ui.colors.success, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  confirmPaymentText: { color: '#FFF', fontWeight: '900', fontSize: 12.5 },
  rejectPaymentButton: { minHeight: 38, borderRadius: 11, borderWidth: 1.5, borderColor: ui.colors.danger, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  rejectPaymentText: { color: ui.colors.danger, fontWeight: '900', fontSize: 12.5 },
  closedNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 12, padding: 10, backgroundColor: ui.colors.successSoft },
  closedNoticeText: { flex: 1, color: ui.colors.success, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(12,43,99,0.28)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 560, borderRadius: ui.radius.xl, backgroundColor: ui.colors.card, padding: 18, gap: 13, ...cardShadow },
  historyModal: { width: '100%', maxWidth: 620, maxHeight: '88%', borderRadius: ui.radius.xl, backgroundColor: ui.colors.card, padding: 18, gap: 12, ...cardShadow },
  preview: { width: '100%', maxWidth: 650, maxHeight: '88%', borderRadius: ui.radius.xl, backgroundColor: ui.colors.card, padding: 16, gap: 12, ...cardShadow },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalTitle: { color: ui.colors.primaryDark, fontSize: 20, fontWeight: '900' },
  label: { color: ui.colors.primaryDark, fontSize: 13, fontWeight: '900' },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.input, color: ui.colors.text, paddingHorizontal: 13, fontSize: 15 },
  longInput: { minHeight: 120, paddingTop: 12 },
  notesInput: { minHeight: 82, paddingTop: 12, textAlignVertical: 'top' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 13, backgroundColor: ui.colors.warningSoft, padding: 11 },
  noticeText: { flex: 1, color: ui.colors.primaryDark, fontSize: 12.5, lineHeight: 18 },
  cancelButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: ui.colors.text, fontWeight: '900' },
  disputeConfirmButton: { minHeight: 42, borderRadius: 12, backgroundColor: ui.colors.danger, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  disputeConfirmText: { color: '#FFF', fontWeight: '900' },
  disabled: { opacity: 0.45 },
  historyScroll: { maxHeight: 480 },
  historyList: { gap: 12, paddingVertical: 4 },
  historyItem: { flexDirection: 'row', gap: 10 },
  historyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ui.colors.primary, marginTop: 5 },
  historyTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 13.5 },
  historyDetail: { color: ui.colors.text, fontSize: 12.5, marginTop: 3 },
  image: { width: '100%', height: 460, borderRadius: 14, backgroundColor: ui.colors.input },
  filePreview: { minHeight: 220, borderRadius: 14, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  attachmentChoice: { minHeight: 58, borderRadius: 13, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.input, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  attachmentChoiceIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  otpDialogScroll: { width: '100%', maxWidth: 560 },
  otpDialogContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  otpDialog: { maxHeight: '100%', padding: 16, gap: 10 },
  otpIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  otpSubtitle: { color: ui.colors.text, textAlign: 'center', lineHeight: 20 },
  otpDelivery: { color: ui.colors.muted, textAlign: 'center', fontSize: 12.5 },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  otpInput: { width: 43, height: 51, borderRadius: 12, borderWidth: 1.5, borderColor: ui.colors.border, backgroundColor: ui.colors.input, color: ui.colors.primaryDark, fontSize: 20, fontWeight: '900' },
  otpInputFilled: { borderColor: ui.colors.primary, backgroundColor: ui.colors.primarySoft },
  resendText: { color: ui.colors.primary, fontWeight: '900', textAlign: 'center', paddingVertical: 7 },
  otpActions: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  otpActionButton: { flex: 1 },
});
