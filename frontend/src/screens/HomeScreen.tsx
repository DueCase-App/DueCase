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
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { DailyCustody, Expense, FamilyChild, FamilyDocument, FamilyEvent, SwapRequest } from '../types/models';

export type HomeDestination = 'calendar' | 'documents' | 'messages' | 'dossier' | 'family';

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
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'da definire';
}

function formatLongDate(): string {
  const value = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEventDate(value: string): string {
  return new Date(value).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatEventTime(value: string): string {
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function relativeTime(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Oggi, ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

export function HomeScreen({ onNavigate }: { onNavigate: (target: HomeDestination) => void }): React.JSX.Element {
  const { user } = useAuth();
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [todayCustody, setTodayCustody] = useState<DailyCustody | null>(null);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [documents, setDocuments] = useState<FamilyDocument[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const today = localDateKey();
    try {
      const [kids, custody, upcoming, expenseItems, documentItems, swapItems] = await Promise.all([
        api.family.children(),
        api.turns.list(today, today),
        api.events.listUpcoming(3),
        api.expenses.list(),
        api.documents.list(),
        api.swapRequests.list('pending'),
      ]);
      setChildren(kids);
      setTodayCustody(custody[0] ?? null);
      setEvents(upcoming);
      setExpenses(expenseItems);
      setDocuments(documentItems);
      setSwaps(swapItems);
    } catch (error) {
      Alert.alert('Home', error instanceof Error ? error.message : 'Impossibile aggiornare la Home.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const notificationCount = useMemo(
    () => expenses.filter((item) => item.canReview).length + swaps.filter((item) => item.canRespond).length,
    [expenses, swaps],
  );

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
      title: item.status === 'approved' ? 'Spesa approvata' : item.status === 'declined' ? 'Spesa contestata' : 'Nuova spesa',
      subtitle: `${item.title} · ${Number(item.amount).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`,
      createdAt: item.updatedAt ?? item.createdAt,
    }));
    return [...docs, ...exps]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [documents, expenses]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.muted}>Caricamento Home…</Text></View>;
  }

  const custodyLabel = parentLabel(todayCustody?.custodianRole);
  const firstEvent = events[0] ?? null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={ui.colors.primary} onRefresh={() => { setRefreshing(true); void load(); }} />}
    >
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark} accessibilityElementsHidden>
            <Ionicons name="home" size={25} color="#FFFFFF" />
            <View style={styles.logoAccent}>
              <Ionicons name="heart" size={10} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.brandBlue}>Due</Text><Text style={styles.brandOrange}>Case</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${notificationCount} notifiche da gestire`}
          onPress={() => Alert.alert('Notifiche', notificationCount > 0 ? `Hai ${notificationCount} attività da gestire.` : 'Non hai nuove attività da gestire.')}
          style={styles.bellButton}
        >
          <Ionicons name="notifications-outline" size={26} color={ui.colors.primaryDark} />
          {notificationCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{Math.min(notificationCount, 99)}</Text></View> : null}
        </Pressable>
      </View>

      <View style={[styles.custodyCard, cardShadow]}>
        <Text style={styles.dateText}>{formatLongDate()}</Text>
        <Text style={styles.custodyIntro}>Oggi i bambini sono con</Text>
        <Text style={styles.custodyPerson}>{custodyLabel}</Text>
        <View style={styles.childBadges}>
          {children.length > 0 ? children.map((child) => (
            <View key={child.id} style={[styles.childBadge, todayCustody?.custodianRole === 'mother' ? styles.motherBadge : styles.fatherBadge]}>
              <Text style={styles.childBadgeText}>{child.displayName} · {custodyLabel}</Text>
            </View>
          )) : <Text style={styles.muted}>Aggiungi i figli nella sezione Famiglia.</Text>}
        </View>
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
        <QuickCard icon="chatbubble-outline" title="Messaggi" subtitle="Comunica con l'altro genitore" onPress={() => onNavigate('messages')} />
        <QuickCard icon="document-text-outline" title="Documenti" subtitle="Condividi e consulta i documenti" onPress={() => onNavigate('documents')} />
        <QuickCard icon="bar-chart-outline" title="Dossier" subtitle="Tieni traccia delle attività" onPress={() => onNavigate('dossier')} />
        <QuickCard icon="people-outline" title="Famiglia" subtitle="Gestisci i profili dei bambini" onPress={() => onNavigate('family')} />
      </View>

      <SectionHeader title="Ultime attività" action="Vedi tutte" onPress={() => onNavigate('documents')} />
      <View style={[styles.activityCard, cardShadow]}>
        {recentActivities.length === 0 ? <Text style={styles.muted}>Nessuna attività recente.</Text> : recentActivities.map((activity, index) => (
          <View key={activity.id} style={[styles.activityRow, index < recentActivities.length - 1 && styles.activityDivider]}>
            <View style={[styles.activityIcon, activity.kind === 'document' ? styles.activityDocument : styles.activityExpense]}>
              <Ionicons name={activity.kind === 'document' ? 'document-text-outline' : 'wallet-outline'} size={21} color={activity.kind === 'document' ? ui.colors.success : ui.colors.primary} />
            </View>
            <View style={styles.activityText}><Text style={styles.activityTitle}>{activity.title}</Text><Text style={styles.activitySubtitle} numberOfLines={1}>{activity.subtitle}</Text></View>
            <Text style={styles.activityTime}>{relativeTime(activity.createdAt)}</Text>
            <Ionicons name="chevron-forward" size={20} color={ui.colors.muted} />
          </View>
        ))}
      </View>

      <Text style={styles.welcome}>Ciao {user?.firstName ?? user?.displayName.split(' ')[0] ?? ''}</Text>
    </ScrollView>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }): React.JSX.Element {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Pressable onPress={onPress} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text><Ionicons name="chevron-forward" size={19} color={ui.colors.primary} /></Pressable></View>;
}

function QuickCard({ icon, title, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable style={[styles.quickCard, cardShadow]} onPress={onPress}>
      <Ionicons name={icon} size={30} color={ui.colors.primary} />
      <View style={styles.quickCopy}><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickSubtitle}>{subtitle}</Text></View>
      <Ionicons name="chevron-forward" size={22} color={ui.colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ui.colors.background },
  topBar: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  logoMark: { width: 48, height: 48, borderRadius: 14, marginRight: 8, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoAccent: { position: 'absolute', right: 4, bottom: 4, width: 17, height: 17, borderRadius: 9, backgroundColor: ui.colors.orange, alignItems: 'center', justifyContent: 'center' },
  brandBlue: { fontSize: 31, fontWeight: '900', color: ui.colors.primaryDark, letterSpacing: -1.2 },
  brandOrange: { fontSize: 31, fontWeight: '900', color: ui.colors.orange, letterSpacing: -1.2 },
  bellButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: ui.colors.card, alignItems: 'center', justifyContent: 'center', ...cardShadow },
  notificationBadge: { position: 'absolute', top: -1, right: -1, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderWidth: 2, borderColor: ui.colors.card },
  notificationBadgeText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  custodyCard: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, padding: 20, gap: 5, borderWidth: 1, borderColor: ui.colors.border },
  dateText: { color: ui.colors.muted, fontSize: 14, fontWeight: '600' },
  custodyIntro: { color: ui.colors.text, fontSize: 20, fontWeight: '700', marginTop: 4 },
  custodyPerson: { color: ui.colors.primary, fontSize: 38, lineHeight: 44, fontWeight: '900', letterSpacing: -1.2 },
  childBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  childBadge: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999 },
  motherBadge: { backgroundColor: '#FCEAF3' },
  fatherBadge: { backgroundColor: ui.colors.primarySoft },
  childBadgeText: { color: ui.colors.text, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  sectionTitle: { color: ui.colors.primaryDark, fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { color: ui.colors.primary, fontWeight: '800', fontSize: 14 },
  eventCard: { minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: ui.radius.lg, backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border },
  eventIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#FFF4E7', alignItems: 'center', justifyContent: 'center' },
  eventContent: { flex: 1, gap: 3 },
  eventDate: { color: ui.colors.muted, fontSize: 13, textTransform: 'capitalize' },
  eventTitle: { color: ui.colors.text, fontWeight: '900', fontSize: 19 },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  eventMeta: { color: ui.colors.muted, fontSize: 13 },
  flexText: { flexShrink: 1 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickCard: { width: '48%', minHeight: 142, flexGrow: 1, flexBasis: 150, backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, padding: 16, borderWidth: 1, borderColor: ui.colors.border, gap: 10 },
  quickCopy: { flex: 1, gap: 3 },
  quickTitle: { color: ui.colors.text, fontSize: 18, fontWeight: '900' },
  quickSubtitle: { color: ui.colors.muted, fontSize: 13, lineHeight: 18 },
  activityCard: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, paddingHorizontal: 14, borderWidth: 1, borderColor: ui.colors.border },
  activityRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.colors.border },
  activityIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  activityDocument: { backgroundColor: ui.colors.successSoft },
  activityExpense: { backgroundColor: ui.colors.primarySoft },
  activityText: { flex: 1, gap: 2 },
  activityTitle: { color: ui.colors.text, fontWeight: '900', fontSize: 14 },
  activitySubtitle: { color: ui.colors.muted, fontSize: 13 },
  activityTime: { color: ui.colors.muted, fontSize: 11 },
  muted: { color: ui.colors.muted, lineHeight: 20 },
  welcome: { color: ui.colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 },
});