import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { ParentingTimeReport } from '../types/models';

export function DossierScreen(): React.JSX.Element {
  const [report, setReport] = useState<ParentingTimeReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setReport(await api.reports.parentingTime()); }
    catch (error) { Alert.alert('Dossier', error instanceof Error ? error.message : 'Impossibile caricare le statistiche.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>RIEPILOGO FAMIGLIA</Text><Text style={styles.title}>Dossier</Text><Text style={styles.subtitle}>Permanenze e dati riepilogativi consultabili in modo chiaro.</Text></View>
        <Pressable onPress={() => void load()} style={styles.refresh}><Ionicons name="refresh" size={20} color={ui.colors.primary} /></Pressable>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={ui.colors.primary} /> : report ? (
        <>
          <View style={styles.periodCard}><Ionicons name="calendar-outline" size={22} color={ui.colors.primary} /><View><Text style={styles.periodLabel}>Periodo analizzato</Text><Text style={styles.periodValue}>{report.period.from ?? '—'} → {report.period.to ?? '—'}</Text></View></View>
          <View style={styles.grid}>
            <ParentCard label="Papà" hours={report.father.hours} percentage={report.father.percentage} icon="man-outline" />
            <ParentCard label="Mamma" hours={report.mother.hours} percentage={report.mother.percentage} icon="woman-outline" />
          </View>
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Parenting Time</Text>
            <Text style={styles.sectionSubtitle}>Percentuale calcolata sui turni di permanenza registrati.</Text>
            <Bar label="Papà" percentage={report.father.percentage} />
            <Bar label="Mamma" percentage={report.mother.percentage} />
            <View style={styles.total}><Text style={styles.totalLabel}>Totale registrato</Text><Text style={styles.totalValue}>{report.totalHours.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ore</Text></View>
          </View>
          <View style={styles.notice}><Ionicons name="information-circle-outline" size={22} color={ui.colors.primary} /><Text style={styles.noticeText}>Le statistiche riflettono i dati presenti nel calendario DueCase. Eccezioni e cambi approvati devono essere registrati per mantenere il riepilogo accurato.</Text></View>
        </>
      ) : null}
    </ScrollView>
  );
}

function ParentCard({ label, hours, percentage, icon }: { label: string; hours: number; percentage: number; icon: keyof typeof Ionicons.glyphMap }): React.JSX.Element {
  return <View style={styles.parentCard}><View style={styles.parentIcon}><Ionicons name={icon} size={25} color={ui.colors.primary} /></View><Text style={styles.parentLabel}>{label}</Text><Text style={styles.parentPercentage}>{percentage.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</Text><Text style={styles.parentHours}>{hours.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ore</Text></View>;
}

function Bar({ label, percentage }: { label: string; percentage: number }): React.JSX.Element {
  return <View style={styles.barBlock}><View style={styles.barHeader}><Text style={styles.barLabel}>{label}</Text><Text style={styles.barValue}>{percentage.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, percentage))}%` }]} /></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  content: { padding: 18, paddingBottom: 40, gap: 14, maxWidth: 980, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { color: ui.colors.muted, marginTop: 3 },
  refresh: { width: 44, height: 44, borderRadius: 14, backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center' },
  periodCard: { ...cardShadow, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  periodLabel: { color: ui.colors.muted, fontSize: 11, fontWeight: '800' },
  periodValue: { color: ui.colors.primaryDark, fontWeight: '900', marginTop: 2 },
  grid: { flexDirection: 'row', gap: 12 },
  parentCard: { ...cardShadow, flex: 1, minWidth: 0, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 18 },
  parentIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  parentLabel: { marginTop: 10, fontWeight: '900', color: ui.colors.primaryDark },
  parentPercentage: { fontSize: 28, fontWeight: '900', color: ui.colors.primary, marginTop: 2 },
  parentHours: { color: ui.colors.muted, fontSize: 12 },
  chartCard: { ...cardShadow, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 18, gap: 14 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: ui.colors.primaryDark },
  sectionSubtitle: { marginTop: -9, color: ui.colors.muted },
  barBlock: { gap: 6 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { color: ui.colors.text, fontWeight: '800' },
  barValue: { color: ui.colors.primary, fontWeight: '900' },
  track: { height: 14, borderRadius: 7, backgroundColor: ui.colors.input, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 7, backgroundColor: ui.colors.primary },
  total: { paddingTop: 8, borderTopWidth: 1, borderTopColor: ui.colors.border, flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: ui.colors.muted },
  totalValue: { color: ui.colors.primaryDark, fontWeight: '900' },
  notice: { backgroundColor: ui.colors.primarySoft, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noticeText: { flex: 1, color: ui.colors.text, lineHeight: 19, fontSize: 12 },
});
