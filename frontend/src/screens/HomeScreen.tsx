import { useLiveRefresh } from '../services/live';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import type { CustodyCurrent, Expense, FamilyAgreement, FamilyChild, FamilyEvent, InAppNotification, SwapRequest } from '../types/models';

export type HomeDestination = 'calendar' | 'permanence' | 'children' | 'expenses' | 'agreements' | 'messages' | 'documents' | 'dossier' | 'notifications' | 'family';

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parentLabel(role: 'father' | 'mother' | null | undefined): string { return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Da definire'; }
function formatLongDate(): string { const value = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); return value.charAt(0).toUpperCase() + value.slice(1); }
function formatEvent(value: string): string { return new Date(value).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }

export function HomeScreen({ onNavigate }: { onNavigate: (target: HomeDestination) => void }): React.JSX.Element {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [custody, setCustody] = useState<CustodyCurrent | null>(null);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [agreements, setAgreements] = useState<FamilyAgreement[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [kids, currentCustody, upcoming, expenseItems, swapItems, agreementItems, notificationItems] = await Promise.all([
        api.family.children(), api.permanence.current(localDateKey()), api.events.listUpcoming(3), api.expenses.list(), api.swapRequests.list('pending'), api.agreements.list('pending'), api.notifications.list(true),
      ]);
      setChildren(kids); setCustody(currentCustody); setEvents(upcoming); setExpenses(expenseItems); setSwaps(swapItems); setAgreements(agreementItems); setNotifications(notificationItems);
    } catch (error) {
      Alert.alert('Home', error instanceof Error ? error.message : 'Impossibile aggiornare la Home.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);

  const pendingExpenses = useMemo(() => expenses.filter((item) => item.canReview), [expenses]);
  const pendingSwaps = useMemo(() => swaps.filter((item) => item.canRespond), [swaps]);
  const pendingAgreements = useMemo(() => agreements.filter((item) => item.canRespond), [agreements]);
  const outstandingPayments = useMemo(() => expenses.filter((item) => item.status === 'to_pay' || item.status === 'partially_paid'), [expenses]);
  const pendingTotal = pendingExpenses.length + pendingSwaps.length + pendingAgreements.length;
  const firstEvent = events[0] ?? null;
  const quickWidth = width >= 1060 ? '31.8%' : width >= 620 ? '48.5%' : '100%';

  const custodyTitle = useMemo(() => {
    const rows = custody?.children ?? [];
    if (rows.length === 0) return 'Permanenze da configurare';
    const first = rows[0]?.custodianRole ?? null;
    if (first && rows.every((item) => item.custodianRole === first)) return `I figli sono con ${parentLabel(first)}`;
    return 'Situazione distinta per figlio';
  }, [custody]);

  if (loading) return <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}><View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.muted}>Caricamento Home…</Text></View></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(58, insets.bottom + 42) }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} tintColor={ui.colors.primary} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <View style={styles.content}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}><Image source={require('../../assets/duecase-logo.png')} resizeMode="contain" style={styles.logo} /><View><Text style={styles.brandName}>DueCase</Text><Text style={styles.brandPayoff}>Due case, un’unica squadra.</Text></View></View>
          <Pressable accessibilityRole="button" onPress={() => onNavigate('notifications')} style={styles.bellButton}><Ionicons name="notifications-outline" size={25} color={ui.colors.primaryDark} />{notifications.length ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(99, notifications.length)}</Text></View> : null}</Pressable>
        </View>

        <View style={styles.greeting}><Text style={styles.greetingTitle}>Buongiorno, {user?.firstName ?? user?.displayName.split(' ')[0] ?? ''}</Text><Text style={styles.greetingText}>Organizziamo insieme la quotidianità dei tuoi figli.</Text></View>

        <LinearGradient colors={ui.gradients.header} style={[styles.custodyCard, cardShadow]}>
          <Pressable onPress={() => onNavigate('permanence')} style={styles.custodyPress}>
            <View style={styles.custodyTop}><View style={styles.custodyIcon}><Ionicons name="home-outline" size={25} color={ui.colors.primary} /></View><View style={styles.flex}><Text style={styles.date}>{formatLongDate()}</Text><Text style={styles.custodyTitle}>{custodyTitle}</Text></View><Ionicons name="chevron-forward" size={21} color={ui.colors.primary} /></View>
            <View style={styles.childBadges}>{(custody?.children ?? []).length ? custody?.children.map((child) => <View key={child.childId} style={[styles.childBadge, child.custodianRole === 'mother' ? styles.motherBadge : child.custodianRole === 'father' ? styles.fatherBadge : styles.undefinedBadge]}><Ionicons name="person-outline" size={14} color={ui.colors.primaryDark} /><Text style={styles.childBadgeText}>{child.childName} · {parentLabel(child.custodianRole)}</Text>{child.overnight ? <Ionicons name="moon-outline" size={13} color={ui.colors.muted} /> : null}</View>) : children.map((child) => <View key={child.id} style={[styles.childBadge, styles.undefinedBadge]}><Text style={styles.childBadgeText}>{child.displayName} · Da definire</Text></View>)}</View>
          </Pressable>
        </LinearGradient>

        {firstEvent ? <LinearGradient colors={ui.gradients.warm} style={[styles.eventCard, cardShadow]}><Pressable style={styles.eventPress} onPress={() => onNavigate('calendar')}><View style={styles.eventIcon}><Ionicons name="calendar-outline" size={27} color={ui.colors.orangeDark} /></View><View style={styles.flex}><Text style={styles.eyebrow}>PROSSIMO EVENTO</Text><Text style={styles.eventTitle}>{firstEvent.title}</Text><Text style={styles.eventMeta}>{formatEvent(firstEvent.startsAt)}</Text></View><View style={styles.eventAction}><Text style={styles.eventActionText}>Calendario</Text><Ionicons name="chevron-forward" size={17} color="#FFF" /></View></Pressable></LinearGradient> : null}

        <View style={styles.summaryGrid}>
          <Summary icon="hourglass-outline" value={pendingTotal} label="Richieste in sospeso" onPress={() => onNavigate('agreements')} />
          <Summary icon="wallet-outline" value={outstandingPayments.length} label="Pagamenti aperti" onPress={() => onNavigate('expenses')} />
          <Summary icon="notifications-outline" value={notifications.length} label="Notifiche" onPress={() => onNavigate('notifications')} />
        </View>

        <Text style={styles.sectionTitle}>Accesso rapido</Text>
        <View style={styles.quickGrid}>
          <Quick width={quickWidth} icon="calendar-outline" title="Calendario" subtitle="Eventi e richieste" onPress={() => onNavigate('calendar')} />
          <Quick width={quickWidth} icon="chatbubble-ellipses-outline" title="Messaggi" subtitle="Scrivi all’altro genitore" onPress={() => onNavigate('messages')} />
          <Quick width={quickWidth} icon="add-circle-outline" title="Spese" subtitle="Registra e gestisci spese" onPress={() => onNavigate('expenses')} />
          <Quick width={quickWidth} icon="document-text-outline" title="Accordi" subtitle="Proposte e storico" onPress={() => onNavigate('agreements')} />
          <Quick width={quickWidth} icon="folder-open-outline" title="Documenti" subtitle="Archivio condiviso" onPress={() => onNavigate('documents')} />
          <Quick width={quickWidth} icon="bar-chart-outline" title="Dossier" subtitle="Report e tracciabilità" onPress={() => onNavigate('dossier')} />
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Summary({ icon, value, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string; onPress: () => void }): React.JSX.Element {
  return <Pressable onPress={onPress} style={[styles.summaryCard, cardShadow]}><View style={styles.summaryIcon}><Ionicons name={icon} size={21} color={ui.colors.orangeDark} /></View><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></Pressable>;
}
function Quick({ width, icon, title, subtitle, onPress }: { width: number | `${number}%`; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }): React.JSX.Element {
  return <Pressable onPress={onPress} style={[styles.quickCard, { width }, cardShadow]}><View style={styles.quickIcon}><Ionicons name={icon} size={25} color={ui.colors.primary} /></View><View style={styles.flex}><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickSubtitle}>{subtitle}</Text></View><Ionicons name="chevron-forward" size={18} color={ui.colors.muted} /></Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' }, screen: { flex: 1, backgroundColor: 'transparent' }, scrollContent: { flexGrow: 1 }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, gap: 15 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: ui.colors.muted }, flex: { flex: 1, minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, logo: { width: 62, height: 50 }, brandName: { color: ui.colors.primaryDark, fontSize: 22, fontWeight: '900', letterSpacing: -0.6 }, brandPayoff: { color: ui.colors.muted, fontSize: 9, fontWeight: '700' }, bellButton: { width: 47, height: 47, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center', ...cardShadow }, badge: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: ui.colors.orange, borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  greeting: { gap: 3, paddingHorizontal: 2 }, greetingTitle: { color: ui.colors.primaryDark, fontSize: 27, fontWeight: '900' }, greetingText: { color: ui.colors.muted, fontSize: 14, lineHeight: 20 },
  custodyCard: { borderRadius: ui.radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: '#D7E8F6' }, custodyPress: { padding: 18, gap: 13 }, custodyTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, custodyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, date: { color: ui.colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, custodyTitle: { color: ui.colors.primaryDark, fontSize: 20, fontWeight: '900', marginTop: 2 }, childBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, childBadge: { minHeight: 34, borderRadius: 999, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 }, fatherBadge: { backgroundColor: '#E1F1FF' }, motherBadge: { backgroundColor: '#FFF0DF' }, undefinedBadge: { backgroundColor: '#F2F4F7' }, childBadgeText: { color: ui.colors.primaryDark, fontSize: 11, fontWeight: '800' },
  eventCard: { borderRadius: ui.radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: '#FFE0B7' }, eventPress: { minHeight: 98, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, eventIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.78)', alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: ui.colors.orangeDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, eventTitle: { color: ui.colors.primaryDark, fontSize: 18, fontWeight: '900', marginTop: 2 }, eventMeta: { color: ui.colors.muted, fontSize: 12, marginTop: 2 }, eventAction: { minHeight: 40, borderRadius: 999, paddingHorizontal: 13, backgroundColor: ui.colors.orange, flexDirection: 'row', alignItems: 'center', gap: 3 }, eventActionText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  summaryGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, summaryCard: { flex: 1, minWidth: 105, minHeight: 110, borderRadius: ui.radius.lg, backgroundColor: '#FFFEFB', borderWidth: 1, borderColor: ui.colors.border, padding: 13 }, summaryIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: ui.colors.orangeSoft, alignItems: 'center', justifyContent: 'center' }, summaryValue: { color: ui.colors.primaryDark, fontSize: 24, fontWeight: '900', marginTop: 7 }, summaryLabel: { color: ui.colors.muted, fontSize: 10, fontWeight: '800', marginTop: 1 },
  sectionTitle: { color: ui.colors.primaryDark, fontSize: 19, fontWeight: '900', marginTop: 2 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, quickCard: { minHeight: 78, borderRadius: ui.radius.lg, backgroundColor: '#FFFEFB', borderWidth: 1, borderColor: ui.colors.border, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, quickIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, quickTitle: { color: ui.colors.primaryDark, fontSize: 14, fontWeight: '900' }, quickSubtitle: { color: ui.colors.muted, fontSize: 10, marginTop: 2 },
});
