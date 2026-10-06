import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type {
  CustodyCurrent,
  Expense,
  FamilyAgreement,
  FamilyChild,
  FamilyDocument,
  FamilyEvent,
  InAppNotification,
  SwapRequest,
} from '../types/models';

export type HomeDestination =
  | 'calendar'
  | 'permanence'
  | 'children'
  | 'expenses'
  | 'agreements'
  | 'messages'
  | 'documents'
  | 'dossier'
  | 'notifications'
  | 'family';

type ActivityItem = {
  id: string;
  kind: 'document' | 'expense';
  title: string;
  subtitle: string;
  createdAt: string;
};

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parentLabel(role: 'father' | 'mother' | null | undefined): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Da definire';
}

function formatLongDate(): string {
  const value = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEventDate(value: string): string {
  return new Date(value).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatEventTime(value: string): string {
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function relativeTime(value: string): string {
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Oggi, ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

function expenseStatusLabel(status: Expense['status']): string {
  const labels: Record<Expense['status'], string> = {
    draft: 'Bozza',
    submitted: 'Inviata',
    pending_approval: 'Da approvare',
    approved: 'Approvata',
    declined: 'Rifiutata',
    disputed: 'Contestata',
    to_pay: 'Da pagare',
    partially_paid: 'Parzialmente pagata',
    paid: 'Pagata',
    closed: 'Chiusa',
  };
  return labels[status];
}

export function HomeScreen({ onNavigate }: { onNavigate: (target: HomeDestination) => void }): React.JSX.Element {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [custody, setCustody] = useState<CustodyCurrent | null>(null);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [documents, setDocuments] = useState<FamilyDocument[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [agreements, setAgreements] = useState<FamilyAgreement[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const today = localDateKey();
    try {
      const [kids, currentCustody, upcoming, expenseItems, documentItems, swapItems, agreementItems, notificationItems] = await Promise.all([
        api.family.children(),
        api.permanence.current(today),
        api.events.listUpcoming(3),
        api.expenses.list(),
        api.documents.list(),
        api.swapRequests.list('pending'),
        api.agreements.list('pending'),
        api.notifications.list(true),
      ]);
      setChildren(kids);
      setCustody(currentCustody);
      setEvents(upcoming);
      setExpenses(expenseItems);
      setDocuments(documentItems);
      setSwaps(swapItems);
      setAgreements(agreementItems);
      setNotifications(notificationItems);
    } catch (error) {
      Alert.alert('Home', error instanceof Error ? error.message : 'Impossibile aggiornare la Home.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pendingExpenses = useMemo(() => expenses.filter((item) => item.canReview), [expenses]);
  const pendingSwaps = useMemo(() => swaps.filter((item) => item.canRespond), [swaps]);
  const pendingAgreements = useMemo(() => agreements.filter((item) => item.canRespond), [agreements]);
  const outstandingPayments = useMemo(() => expenses.filter((item) => item.status === 'to_pay' || item.status === 'partially_paid'), [expenses]);
  const notificationCount = notifications.length + pendingExpenses.length + pendingSwaps.length + pendingAgreements.length;

  const recentActivities = useMemo<ActivityItem[]>(() => {
    const docs: ActivityItem[] = documents.map((item) => ({
      id: `doc-${item.id}`,
      kind: 'document',
      title: 'Documento caricato',
      subtitle: item.filename ?? item.title,
      createdAt: item.createdAt,
    }));
    const exps: ActivityItem[] = expenses.map((item) => ({
      id: `exp-${item.id}`,
      kind: 'expense',
      title: `Spesa · ${expenseStatusLabel(item.status)}`,
      subtitle: `${item.title} · ${Number(item.amount).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`,
      createdAt: item.updatedAt ?? item.createdAt,
    }));
    return [...docs, ...exps]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [documents, expenses]);

  const custodySummary = useMemo(() => {
    const rows = custody?.children ?? [];
    const defined = rows.filter((item) => item.custodianRole !== null);
    if (rows.length === 0) return { title: 'Permanenze da configurare', role: null as 'father' | 'mother' | null, mixed: false };
    if (defined.length === rows.length && defined.every((item) => item.custodianRole === defined[0]?.custodianRole)) {
      const role = defined[0]?.custodianRole ?? null;
      return { title: `I figli sono con ${parentLabel(role)}`, role, mixed: false };
    }
    return { title: 'Situazione distinta per figlio', role: null, mixed: true };
  }, [custody]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.muted}>Caricamento Home…</Text></View>
      </SafeAreaView>
    );
  }

  const firstEvent = events[0] ?? null;
  const quickWidth = width >= 1050 ? '31.8%' : width >= 620 ? '48.7%' : '100%';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(64, insets.bottom + 48) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={ui.colors.primary} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={styles.content}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.logoMark}><Ionicons name="home" size={25} color="#FFFFFF" /><View style={styles.logoAccent}><Ionicons name="heart" size={10} color="#FFFFFF" /></View></View>
              <Text style={styles.brandBlue}>Due</Text><Text style={styles.brandOrange}>Case</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`${notificationCount} notifiche o richieste`} onPress={() => onNavigate('notifications')} style={styles.bellButton}>
              <Ionicons name="notifications-outline" size={26} color={ui.colors.primaryDark} />
              {notificationCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{Math.min(notificationCount, 99)}</Text></View> : null}
            </Pressable>
          </View>

          <Pressable style={[styles.custodyCard, cardShadow]} onPress={() => onNavigate('permanence')}>
            <Text style={styles.dateText}>{formatLongDate()}</Text>
            <Text style={styles.custodyPerson}>{custodySummary.title}</Text>
            <View style={styles.childBadges}>
              {(custody?.children ?? []).length > 0 ? custody?.children.map((child) => (
                <View key={child.childId} style={[styles.childBadge, child.custodianRole === 'mother' ? styles.motherBadge : styles.fatherBadge]}>
                  <Text style={styles.childBadgeText}>{child.childName} · {parentLabel(child.custodianRole)}</Text>
                  {child.overnight ? <Ionicons name="moon-outline" size={13} color={ui.colors.muted} /> : null}
                </View>
              )) : children.map((child) => <View key={child.id} style={[styles.childBadge, styles.undefinedBadge]}><Text style={styles.childBadgeText}>{child.displayName} · Da definire</Text></View>)}
            </View>
            <View style={styles.cardLink}><Text style={styles.cardLinkText}>Gestisci permanenze</Text><Ionicons name="chevron-forward" size={18} color={ui.colors.primary} /></View>
          </Pressable>

          <View style={styles.summaryGrid}>
            <SummaryCard icon="checkmark-done-outline" value={pendingExpenses.length + pendingSwaps.length + pendingAgreements.length} label="Richieste da gestire" onPress={() => onNavigate('agreements')} />
            <SummaryCard icon="wallet-outline" value={outstandingPayments.length} label="Pagamenti aperti" onPress={() => onNavigate('expenses')} />
            <SummaryCard icon="notifications-outline" value={notifications.length} label="Nuove notifiche" onPress={() => onNavigate('notifications')} />
          </View>

          <SectionHeader title="Prossimi eventi" action="Vedi tutti" onPress={() => onNavigate('calendar')} />
          {firstEvent ? (
            <Pressable style={[styles.eventCard, cardShadow]} onPress={() => onNavigate('calendar')}>
              <View style={styles.eventIcon}><Ionicons name="calendar-outline" size={27} color={ui.colors.primary} /></View>
              <View style={styles.eventContent}>
                <Text style={styles.eventDate}>{formatEventDate(firstEvent.startsAt)}</Text>
                <Text style={styles.eventTitle}>{firstEvent.title}</Text>
                <View style={styles.eventMetaRow}>
                  <Ionicons name="time-outline" size={18} color={ui.colors.muted} />
                  <Text style={styles.eventMeta}>{formatEventTime(firstEvent.startsAt)}{firstEvent.endsAt ? ` – ${formatEventTime(firstEvent.endsAt)}` : ''}</Text>
                  {firstEvent.location ? <><Ionicons name="location-outline" size={18} color={ui.colors.muted} /><Text style={[styles.eventMeta, styles.flexText]} numberOfLines={1}>{firstEvent.location}</Text></> : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={22} color={ui.colors.muted} />
            </Pressable>
          ) : (
            <Pressable style={[styles.eventCard, cardShadow]} onPress={() => onNavigate('calendar')}>
              <View style={styles.eventIcon}><Ionicons name="calendar-outline" size={27} color={ui.colors.primary} /></View>
              <View style={styles.eventContent}><Text style={styles.eventTitle}>Nessun evento programmato</Text><Text style={styles.muted}>Gli appuntamenti futuri compariranno qui.</Text></View>
              <Ionicons name="chevron-forward" size={22} color={ui.colors.muted} />
            </Pressable>
          )}

          <Text style={styles.sectionTitle}>Accesso rapido</Text>
          <View style={styles.quickGrid}>
            <QuickCard width={quickWidth} icon="chatbubble-outline" title="Messaggi" subtitle="Comunicazioni ordinate e verificabili" onPress={() => onNavigate('messages')} />
            <QuickCard width={quickWidth} icon="document-text-outline" title="Documenti" subtitle="File condivisi della famiglia" onPress={() => onNavigate('documents')} />
            <QuickCard width={quickWidth} icon="people-outline" title="Figli" subtitle="Scuola, sport e informazioni" onPress={() => onNavigate('children')} />
            <QuickCard width={quickWidth} icon="document-text-outline" title="Accordi" subtitle="Proposte, risposte e storico" onPress={() => onNavigate('agreements')} />
            <QuickCard width={quickWidth} icon="bar-chart-outline" title="Dossier" subtitle="Statistiche e tracciabilità" onPress={() => onNavigate('dossier')} />
            <QuickCard width={quickWidth} icon="repeat-outline" title="Permanenze" subtitle="Schema settimanale ed eccezioni" onPress={() => onNavigate('permanence')} />
          </View>

          <SectionHeader title="Ultime attività" action="Documenti" onPress={() => onNavigate('documents')} />
          <View style={[styles.activityCard, cardShadow]}>
            {recentActivities.length === 0 ? <Text style={styles.muted}>Nessuna attività recente.</Text> : recentActivities.map((activity, index) => (
              <View key={activity.id} style={[styles.activityRow, index < recentActivities.length - 1 && styles.activityDivider]}>
                <View style={[styles.activityIcon, activity.kind === 'document' ? styles.activityDocument : styles.activityExpense]}>
                  <Ionicons name={activity.kind === 'document' ? 'document-text-outline' : 'wallet-outline'} size={21} color={activity.kind === 'document' ? ui.colors.success : ui.colors.primary} />
                </View>
                <View style={styles.activityText}><Text style={styles.activityTitle}>{activity.title}</Text><Text style={styles.activitySubtitle} numberOfLines={1}>{activity.subtitle}</Text></View>
                <Text style={styles.activityTime}>{relativeTime(activity.createdAt)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.welcome}>Ciao {user?.firstName ?? user?.displayName.split(' ')[0] ?? ''}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }): React.JSX.Element {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Pressable onPress={onPress} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text><Ionicons name="chevron-forward" size={19} color={ui.colors.primary} /></Pressable></View>;
}

function SummaryCard({ icon, value, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string; onPress: () => void }): React.JSX.Element {
  return <Pressable style={[styles.summaryCard, cardShadow]} onPress={onPress}><View style={styles.summaryIcon}><Ionicons name={icon} size={21} color={ui.colors.primary} /></View><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></Pressable>;
}

function QuickCard({ width, icon, title, subtitle, onPress }: { width: `${number}%`; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable style={[styles.quickCard, cardShadow, { width }]} onPress={onPress}>
      <Ionicons name={icon} size={29} color={ui.colors.primary} />
      <View style={styles.quickCopy}><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickSubtitle}>{subtitle}</Text></View>
      <Ionicons name="chevron-forward" size={21} color={ui.colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ui.colors.background },
  screen: { flex: 1, backgroundColor: ui.colors.background },
  scrollContent: { minHeight: '100%' },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ui.colors.background },
  topBar: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  logoMark: { width: 48, height: 48, borderRadius: 14, marginRight: 8, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoAccent: { position: 'absolute', right: 4, bottom: 4, width: 17, height: 17, borderRadius: 9, backgroundColor: ui.colors.orange, alignItems: 'center', justifyContent: 'center' },
  brandBlue: { fontSize: 31, fontWeight: '900', color: ui.colors.primaryDark, letterSpacing: -1.2 },
  brandOrange: { fontSize: 31, fontWeight: '900', color: ui.colors.orange, letterSpacing: -1.2 },
  bellButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: ui.colors.card, alignItems: 'center', justifyContent: 'center', ...cardShadow },
  notificationBadge: { position: 'absolute', top: -1, right: -1, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderWidth: 2, borderColor: ui.colors.card },
  notificationBadgeText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  custodyCard: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, padding: 20, gap: 8, borderWidth: 1, borderColor: ui.colors.border },
  dateText: { color: ui.colors.muted, fontSize: 14, fontWeight: '700' },
  custodyPerson: { color: ui.colors.primaryDark, fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -0.8 },
  childBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  childBadge: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5 },
  motherBadge: { backgroundColor: '#FCEAF3' },
  fatherBadge: { backgroundColor: ui.colors.primarySoft },
  undefinedBadge: { backgroundColor: ui.colors.warningSoft },
  childBadgeText: { color: ui.colors.text, fontWeight: '800' },
  cardLink: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  cardLinkText: { color: ui.colors.primary, fontWeight: '900', fontSize: 13 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { flex: 1, minWidth: 145, minHeight: 112, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.card, padding: 14, gap: 5 },
  summaryIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { color: ui.colors.primaryDark, fontSize: 24, fontWeight: '900' },
  summaryLabel: { color: ui.colors.muted, fontSize: 12, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 12 },
  sectionTitle: { color: ui.colors.primaryDark, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { color: ui.colors.primary, fontWeight: '800', fontSize: 14 },
  eventCard: { minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: ui.radius.lg, backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border },
  eventIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  eventContent: { flex: 1, gap: 4, minWidth: 0 },
  eventDate: { color: ui.colors.primary, fontWeight: '900', fontSize: 12, textTransform: 'uppercase' },
  eventTitle: { color: ui.colors.primaryDark, fontSize: 17, fontWeight: '900' },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  eventMeta: { color: ui.colors.muted, fontSize: 13 },
  flexText: { flexShrink: 1 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: { minHeight: 96, padding: 15, borderRadius: ui.radius.lg, backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  quickCopy: { flex: 1, gap: 3, minWidth: 0 },
  quickTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 16 },
  quickSubtitle: { color: ui.colors.muted, fontSize: 12, lineHeight: 17 },
  activityCard: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, paddingHorizontal: 14 },
  activityRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  activityDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.colors.border },
  activityIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  activityDocument: { backgroundColor: ui.colors.successSoft },
  activityExpense: { backgroundColor: ui.colors.primarySoft },
  activityText: { flex: 1, minWidth: 0 },
  activityTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 14 },
  activitySubtitle: { color: ui.colors.muted, fontSize: 12, marginTop: 2 },
  activityTime: { color: ui.colors.muted, fontSize: 11, fontWeight: '700' },
  muted: { color: ui.colors.muted, fontSize: 13 },
  welcome: { textAlign: 'center', color: ui.colors.muted, fontSize: 12, marginTop: 4 },
});
