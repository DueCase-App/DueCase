import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { AlternatingWeekendPattern, CustodyCurrent, CustodyException, CustodyPattern, FamilyChild, ParentRole } from '../types/models';

const weekdays = [
  { n: 1, label: 'Lun' }, { n: 2, label: 'Mar' }, { n: 3, label: 'Mer' }, { n: 4, label: 'Gio' },
  { n: 5, label: 'Ven' }, { n: 6, label: 'Sab' }, { n: 7, label: 'Dom' },
];
const roleLabel = (role: ParentRole | null | undefined) => role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Da definire';

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentOrNextSaturday(): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const delta = day === 0 ? -1 : day === 6 ? 0 : 6 - day;
  date.setDate(date.getDate() + delta);
  return localDateKey(date);
}

function prettyDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day, 12).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PermanenceScreen(): React.JSX.Element {
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [patterns, setPatterns] = useState<CustodyPattern[]>([]);
  const [alternating, setAlternating] = useState<AlternatingWeekendPattern[]>([]);
  const [current, setCurrent] = useState<CustodyCurrent | null>(null);
  const [exceptions, setExceptions] = useState<CustodyException[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [kids, plan, alternatingItems, today, exceptionItems] = await Promise.all([
        api.family.children(),
        api.permanence.pattern(),
        api.permanence.alternatingWeekends(),
        api.permanence.current(),
        api.permanence.exceptions(),
      ]);
      setChildren(kids);
      setPatterns(plan);
      setAlternating(alternatingItems);
      setCurrent(today);
      setExceptions(exceptionItems);
    } catch (error) { Alert.alert('Permanenze', error instanceof Error ? error.message : 'Impossibile caricare le permanenze.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byChildDay = useMemo(() => new Map(patterns.map((item) => [`${item.childId}-${item.weekday}`, item])), [patterns]);
  const alternatingByChild = useMemo(() => new Map(alternating.map((item) => [item.childId, item])), [alternating]);

  const setDay = async (childId: string, weekday: number, custodianRole: ParentRole): Promise<void> => {
    const key = `${childId}-${weekday}`;
    setBusy(key);
    try { await api.permanence.setPatternDay(childId, weekday, { custodianRole, overnight: true }); await load(); }
    catch (error) { Alert.alert('Permanenze', error instanceof Error ? error.message : 'Modifica non salvata.'); }
    finally { setBusy(null); }
  };

  const setAlternatingWeekend = async (childId: string, firstWeekendRole: ParentRole): Promise<void> => {
    const key = `weekend-${childId}`;
    setBusy(key);
    try {
      await api.permanence.setAlternatingWeekend(childId, {
        anchorSaturday: currentOrNextSaturday(),
        firstWeekendRole,
        secondWeekendRole: firstWeekendRole === 'father' ? 'mother' : 'father',
        overnight: true,
        notes: 'Weekend alternati',
      });
      await load();
    } catch (error) { Alert.alert('Weekend alternati', error instanceof Error ? error.message : 'Regola non salvata.'); }
    finally { setBusy(null); }
  };

  const respond = async (item: CustodyException, status: 'approved' | 'rejected'): Promise<void> => {
    setBusy(item.id);
    try { await api.permanence.respondException(item.id, status); await load(); }
    catch (error) { Alert.alert('Permanenze', error instanceof Error ? error.message : 'Risposta non riuscita.'); }
    finally { setBusy(null); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View><Text style={styles.eyebrow}>ORGANIZZAZIONE SETTIMANALE</Text><Text style={styles.title}>Permanenze</Text><Text style={styles.subtitle}>Imposta lo schema normale, i weekend alternati e le eccezioni. Le modifiche approvate hanno sempre priorità.</Text></View>
      {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={ui.colors.primary} /> : (
        <>
          <View style={styles.todayCard}>
            <View style={styles.todayIcon}><Ionicons name="home-outline" size={26} color={ui.colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.todayLabel}>OGGI</Text><Text style={styles.todayTitle}>{current?.children.length ? current.children.map((child) => `${child.childName}: ${roleLabel(child.custodianRole)}`).join(' · ') : 'Permanenza da definire'}</Text><Text style={styles.todayMeta}>Calcolato da eccezioni, calendario, weekend alternati e schema settimanale.</Text></View>
          </View>

          {children.map((child) => {
            const alternatingRule = alternatingByChild.get(child.id);
            return <View key={child.id} style={styles.childCard}>
              <View style={styles.childHeader}><View style={styles.childAvatar}><Ionicons name="happy-outline" size={23} color={ui.colors.primary} /></View><View><Text style={styles.childName}>{child.displayName}</Text><Text style={styles.childMeta}>Schema ordinario</Text></View></View>
              <View style={styles.daysGrid}>
                {weekdays.map((day) => {
                  const item = byChildDay.get(`${child.id}-${day.n}`);
                  return <View key={day.n} style={styles.dayCard}>
                    <Text style={styles.dayName}>{day.label}</Text>
                    <Pressable disabled={Boolean(busy)} onPress={() => void setDay(child.id, day.n, 'father')} style={[styles.roleButton, item?.custodianRole === 'father' && styles.roleFather]}><Text style={[styles.roleText, item?.custodianRole === 'father' && styles.roleTextActive]}>Papà</Text></Pressable>
                    <Pressable disabled={Boolean(busy)} onPress={() => void setDay(child.id, day.n, 'mother')} style={[styles.roleButton, item?.custodianRole === 'mother' && styles.roleMother]}><Text style={[styles.roleText, item?.custodianRole === 'mother' && styles.roleTextActive]}>Mamma</Text></Pressable>
                  </View>;
                })}
              </View>

              <View style={styles.weekendBox}>
                <View style={styles.weekendHeader}><View style={styles.weekendIcon}><Ionicons name="repeat-outline" size={20} color={ui.colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.weekendTitle}>Weekend alternati</Text><Text style={styles.weekendMeta}>{alternatingRule ? `Dal sabato ${prettyDate(alternatingRule.anchorSaturday)}: ${roleLabel(alternatingRule.firstWeekendRole)}, weekend successivo ${roleLabel(alternatingRule.secondWeekendRole)}.` : 'Configura l’alternanza automatica di sabato e domenica.'}</Text></View></View>
                <View style={styles.weekendActions}>
                  <Pressable disabled={Boolean(busy)} onPress={() => void setAlternatingWeekend(child.id, 'father')} style={[styles.weekendChoice, alternatingRule?.firstWeekendRole === 'father' && styles.weekendChoiceActive]}><Ionicons name="man-outline" size={17} color={alternatingRule?.firstWeekendRole === 'father' ? '#FFF' : ui.colors.primary} /><Text style={[styles.weekendChoiceText, alternatingRule?.firstWeekendRole === 'father' && styles.weekendChoiceTextActive]}>Questo weekend Papà</Text></Pressable>
                  <Pressable disabled={Boolean(busy)} onPress={() => void setAlternatingWeekend(child.id, 'mother')} style={[styles.weekendChoice, alternatingRule?.firstWeekendRole === 'mother' && styles.weekendChoiceMother]}><Ionicons name="woman-outline" size={17} color={alternatingRule?.firstWeekendRole === 'mother' ? '#FFF' : ui.colors.primary} /><Text style={[styles.weekendChoiceText, alternatingRule?.firstWeekendRole === 'mother' && styles.weekendChoiceTextActive]}>Questo weekend Mamma</Text></Pressable>
                </View>
                {busy === `weekend-${child.id}` ? <ActivityIndicator size="small" color={ui.colors.primary} /> : null}
              </View>
            </View>;
          })}

          <Text style={styles.sectionTitle}>Eccezioni e cambi da approvare</Text>
          {exceptions.filter((item) => item.status === 'pending').map((item) => (
            <View key={item.id} style={styles.exceptionCard}>
              <View style={{ flex: 1 }}><Text style={styles.exceptionTitle}>{item.childName ?? 'Figlio'} · {new Date(`${item.custodyDate}T12:00:00`).toLocaleDateString('it-IT')}</Text><Text style={styles.exceptionText}>Richiesta permanenza con {roleLabel(item.custodianRole)}{item.notes ? ` · ${item.notes}` : ''}</Text></View>
              {item.canRespond ? <View style={styles.actions}><Pressable disabled={busy === item.id} onPress={() => void respond(item, 'rejected')} style={styles.reject}><Ionicons name="close" size={18} color={ui.colors.danger} /></Pressable><Pressable disabled={busy === item.id} onPress={() => void respond(item, 'approved')} style={styles.approve}><Ionicons name="checkmark" size={18} color="#FFF" /></Pressable></View> : <View style={styles.pending}><Text style={styles.pendingText}>In attesa</Text></View>}
            </View>
          ))}
          {exceptions.filter((item) => item.status === 'pending').length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>Nessuna eccezione in attesa.</Text></View> : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  content: { padding: 18, paddingBottom: 42, gap: 14, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { color: ui.colors.muted, marginTop: 3 },
  todayCard: { ...cardShadow, backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: ui.colors.border, padding: 17, flexDirection: 'row', gap: 13, alignItems: 'center' },
  todayIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  todayLabel: { fontSize: 9, color: ui.colors.orange, fontWeight: '900', letterSpacing: 1 },
  todayTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 17, marginTop: 2 },
  todayMeta: { color: ui.colors.muted, fontSize: 11, marginTop: 3 },
  childCard: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: ui.colors.border, padding: 15, gap: 12 },
  childHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  childAvatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  childName: { fontWeight: '900', color: ui.colors.primaryDark, fontSize: 17 },
  childMeta: { color: ui.colors.muted, fontSize: 11 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayCard: { flexGrow: 1, flexBasis: 90, maxWidth: 145, minWidth: 88, borderRadius: 14, backgroundColor: ui.colors.background, padding: 8, gap: 6, borderWidth: 1, borderColor: ui.colors.border },
  dayName: { textAlign: 'center', fontWeight: '900', color: ui.colors.primaryDark },
  roleButton: { minHeight: 34, borderRadius: 10, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ui.colors.border },
  roleFather: { backgroundColor: '#2D7FD6', borderColor: '#2D7FD6' },
  roleMother: { backgroundColor: '#D96C9B', borderColor: '#D96C9B' },
  roleText: { fontSize: 11, fontWeight: '800', color: ui.colors.muted },
  roleTextActive: { color: '#FFF' },
  weekendBox: { borderRadius: 15, backgroundColor: ui.colors.primarySoft, padding: 13, gap: 10 },
  weekendHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekendIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  weekendTitle: { color: ui.colors.primaryDark, fontWeight: '900' },
  weekendMeta: { color: ui.colors.muted, fontSize: 11, lineHeight: 17, marginTop: 2 },
  weekendActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekendChoice: { flexGrow: 1, flexBasis: 180, minHeight: 42, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: ui.colors.border, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  weekendChoiceActive: { backgroundColor: '#2D7FD6', borderColor: '#2D7FD6' },
  weekendChoiceMother: { backgroundColor: '#D96C9B', borderColor: '#D96C9B' },
  weekendChoiceText: { color: ui.colors.primaryDark, fontWeight: '800', fontSize: 11 },
  weekendChoiceTextActive: { color: '#FFF' },
  sectionTitle: { fontSize: 19, fontWeight: '900', color: ui.colors.primaryDark, marginTop: 4 },
  exceptionCard: { backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1, borderColor: ui.colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  exceptionTitle: { color: ui.colors.primaryDark, fontWeight: '900' },
  exceptionText: { color: ui.colors.muted, fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 7 },
  reject: { width: 38, height: 38, borderRadius: 12, backgroundColor: ui.colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  approve: { width: 38, height: 38, borderRadius: 12, backgroundColor: ui.colors.success, alignItems: 'center', justifyContent: 'center' },
  pending: { backgroundColor: ui.colors.warningSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  pendingText: { color: ui.colors.warning, fontWeight: '900', fontSize: 10 },
  empty: { backgroundColor: '#FFF', borderWidth: 1, borderColor: ui.colors.border, borderRadius: 14, padding: 18 },
  emptyText: { color: ui.colors.muted, textAlign: 'center' },
});
