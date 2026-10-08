import { openPrivateFile } from '../services/openFile';
import { italianDate } from '../services/italian';
import { useLiveRefresh } from '../services/live';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { FamilyActivity, ParentingTimeReport, ParentRole } from '../types/models';

function roleLabel(role: ParentRole | null): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Account non disponibile';
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    created: 'Creato',
    approved: 'Approvato',
    rejected: 'Rifiutato',
    declined: 'Rifiutato',
    changes_requested: 'Modifiche richieste',
    updated: 'Modificato',
    submitted: 'Inviato',
    paid: 'Pagamento registrato',
    confirmed: 'Confermato',
    otp_verified: 'Conferma email verificata',
    payment_declared: 'Pagamento dichiarato',
    payment_confirmed: 'Pagamento ricevuto',
    uploaded: 'Caricato',
  };
  return labels[action] ?? action.replace(/_/g, ' ');
}

function entityInfo(type: string): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  const map: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    expense: { label: 'Spesa', icon: 'wallet-outline' },
    payment: { label: 'Pagamento', icon: 'card-outline' },
    event: { label: 'Calendario', icon: 'calendar-outline' },
    agreement: { label: 'Accordo', icon: 'document-text-outline' },
    document: { label: 'Documento', icon: 'folder-open-outline' },
    message: { label: 'Messaggio', icon: 'chatbubble-outline' },
    permanence: { label: 'Permanenza', icon: 'repeat-outline' },
    custody_exception: { label: 'Cambio permanenza', icon: 'swap-horizontal-outline' },
    child: { label: 'Scheda figlio', icon: 'happy-outline' },
  };
  return map[type] ?? { label: 'Attività', icon: 'time-outline' };
}

function activitySummary(activity: FamilyActivity): string | null {
  const details = activity.details ?? {};
  const title = typeof details.title === 'string' ? details.title : null;
  const amount = typeof details.amount === 'string' || typeof details.amount === 'number' ? details.amount : null;
  const status = typeof details.status === 'string' ? details.status : null;
  const note = typeof details.note === 'string' ? details.note : null;
  if (title && amount !== null) return `${title} · ${Number(amount).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`;
  if (title) return title;
  if (note) return note;
  if (status) return `Stato: ${actionLabel(status)}`;
  return null;
}

export function DossierScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [report, setReport] = useState<ParentingTimeReport | null>(null);
  const [activities, setActivities] = useState<FamilyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [from,setFrom]=useState('');const [to,setTo]=useState('');const [childId,setChildId]=useState('');
  const [children,setChildren]=useState<Array<{id:string;displayName:string}>>([]);
  const [exporting,setExporting]=useState(false);
  const topicLabels:Record<string,string>={messages:'Messaggi',agreements:'Accordi',expenses:'Spese',calendar:'Calendario',documents:'Documenti',history:'Storico'};
  const [topics,setTopics]=useState(Object.keys(topicLabels));
  useEffect(()=>{api.family.children().then(setChildren).catch(()=>{});},[]);
  async function exportDossier(format:'pdf'|'zip'|'csv'){
   if(exporting)return;
   const parse=(v:string)=>{if(!v.trim())return '';const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);if(!m)throw Error('Inserisci le date nel formato gg/mm/aaaa.');return `${m[3]}-${m[2]}-${m[1]}`;};
   try{setExporting(true);const query=new URLSearchParams({format,sections:format==='csv'?'expenses':topics.join(',')});if(!topics.length&&format!=='csv')throw Error('Seleziona almeno una sezione.');if(from)query.set('from',parse(from));if(to)query.set('to',parse(to));if(childId)query.set('childId',childId);await openPrivateFile(api.reports.exportSource(query.toString()),`DueCase-dossier.${format}`,format==='zip'?'application/zip':format==='csv'?'text/csv':'application/pdf');}
   catch(e){Alert.alert('Esportazione',e instanceof Error?e.message:'Esportazione non riuscita.');}finally{setExporting(false);}
  }
  const [filter, setFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [parenting, history] = await Promise.all([
        api.reports.parentingTime(),
        api.history.list(120),
      ]);
      setReport(parenting);
      setActivities(history);
    } catch (error) {
      Alert.alert('Dossier', error instanceof Error ? error.message : 'Impossibile caricare il dossier.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);

  const entityTypes = useMemo(() => [...new Set(activities.map((item) => item.entityType))], [activities]);
  const visibleActivities = useMemo(
    () => filter ? activities.filter((item) => item.entityType === filter) : activities,
    [activities, filter],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>RIEPILOGO E TRACCIABILITÀ</Text><Text style={styles.title}>Dossier</Text><Text style={styles.subtitle}>Permanenze, decisioni e operazioni importanti della famiglia in ordine cronologico.</Text></View>
        <Pressable onPress={() => void load()} style={styles.refresh}><Ionicons name="refresh" size={20} color={ui.colors.primary} /></Pressable>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Esporta il dossier</Text>
        <Text style={styles.sectionSubtitle}>PDF da leggere, ZIP con gli originali o CSV delle spese. Lascia vuote le date per includere tutto lo storico disponibile.</Text>
        {([['Dal',from,setFrom],['Al',to,setTo]] as const).map(([label,value,setter])=><View key={label}><Text>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={v=>{const d=v.replace(/\D/g,'').slice(0,8);setter(d.slice(0,2)+(d.length>2?'/'+d.slice(2,4):'')+(d.length>4?'/'+d.slice(4):''));}} keyboardType="number-pad" placeholder="gg/mm/aaaa" style={{padding:12,borderWidth:1,borderColor:ui.colors.border,borderRadius:12}}/></View>)}
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[{id:'',displayName:'Tutti i figli'},...children].map(c=><Pressable key={c.id} onPress={()=>setChildId(c.id)} style={[styles.filterChip,childId===c.id&&styles.filterChipActive]}><Text style={[styles.filterText,childId===c.id&&styles.filterTextActive]}>{c.displayName}</Text></Pressable>)}</View>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{Object.entries(topicLabels).map(([key,label])=><Pressable key={key} accessibilityRole="checkbox" accessibilityState={{checked:topics.includes(key)}} onPress={()=>setTopics(v=>v.includes(key)?v.filter(x=>x!==key):[...v,key])} style={[styles.filterChip,topics.includes(key)&&styles.filterChipActive]}><Text style={[styles.filterText,topics.includes(key)&&styles.filterTextActive]}>{label}</Text></Pressable>)}</View>
        <Text style={styles.noticeText}>Le conversazioni, gli accordi e lo storico generale restano condivisi anche filtrando per figlio. Il dossier indica i criteri applicati e distingue pianificazioni, dichiarazioni e conferme.</Text>
        {exporting?<ActivityIndicator/>:<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['pdf','zip','csv'] as const).map(format=><Pressable key={format} style={[styles.filterChip,styles.filterChipActive]} onPress={()=>void exportDossier(format)}><Text style={styles.filterTextActive}>{format==='zip'?'Dossier + originali ZIP':format==='csv'?'Spese CSV':'Dossier PDF'}</Text></Pressable>)}</View>}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={ui.colors.primary} /> : report ? (
        <>
          <View style={styles.periodCard}><Ionicons name="calendar-outline" size={22} color={ui.colors.primary} /><View><Text style={styles.periodLabel}>Periodo permanenze analizzato</Text><Text style={styles.periodValue}>{italianDate(report.period.from)} → {italianDate(report.period.to)}</Text></View></View>
          <View style={[styles.grid, !wide && styles.gridCompact]}>
            <ParentCard label="Papà" hours={report.father.hours} percentage={report.father.percentage} icon="man-outline" />
            <ParentCard label="Mamma" hours={report.mother.hours} percentage={report.mother.percentage} icon="woman-outline" />
          </View>
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Parenting Time</Text>
            <Text style={styles.sectionSubtitle}>Ripartizione delle giornate pianificate per ciascun figlio. Non misura le ore effettivamente trascorse insieme.</Text>
            <Bar label="Papà" percentage={report.father.percentage} />
            <Bar label="Mamma" percentage={report.mother.percentage} />
            <View style={styles.total}><Text style={styles.totalLabel}>Giornate pianificate per figlio</Text><Text style={styles.totalValue}>{(report.totalHours/24).toLocaleString('it-IT', { maximumFractionDigits: 1 })} giorni-figlio</Text></View>
          </View>

          <View style={styles.timelineHeader}>
            <View><Text style={styles.sectionTitle}>Storico attività</Text><Text style={styles.sectionSubtitle}>Registro append-only delle operazioni rilevanti.</Text></View>
            <View style={styles.historyBadge}><Text style={styles.historyBadgeNumber}>{activities.length}</Text><Text style={styles.historyBadgeText}>voci</Text></View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <Pressable style={[styles.filterChip, filter === null && styles.filterChipActive]} onPress={() => setFilter(null)}><Text style={[styles.filterText, filter === null && styles.filterTextActive]}>Tutto</Text></Pressable>
            {entityTypes.map((type) => {
              const info = entityInfo(type);
              return <Pressable key={type} style={[styles.filterChip, filter === type && styles.filterChipActive]} onPress={() => setFilter(type)}><Ionicons name={info.icon} size={14} color={filter === type ? '#FFF' : ui.colors.primary} /><Text style={[styles.filterText, filter === type && styles.filterTextActive]}>{info.label}</Text></Pressable>;
            })}
          </ScrollView>

          <View style={styles.timelineCard}>
            {visibleActivities.length === 0 ? <View style={styles.empty}><Ionicons name="time-outline" size={30} color={ui.colors.primary} /><Text style={styles.emptyTitle}>Nessuna attività registrata</Text><Text style={styles.emptyText}>Le operazioni tracciate compariranno qui automaticamente.</Text></View> : visibleActivities.map((activity, index) => {
              const info = entityInfo(activity.entityType);
              const summary = activitySummary(activity);
              return <View key={activity.id} style={[styles.activityRow, index < visibleActivities.length - 1 && styles.activityDivider]}>
                <View style={styles.activityIcon}><Ionicons name={info.icon} size={20} color={ui.colors.primary} /></View>
                <View style={styles.activityCopy}>
                  <View style={styles.activityTitleRow}><Text style={styles.activityTitle}>{info.label} · {actionLabel(activity.action)}</Text><Text style={styles.activityDate}>{new Date(activity.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text></View>
                  <Text style={styles.activityActor}>{activity.actorName ?? 'Account eliminato'} · {roleLabel(activity.actorRole)}</Text>
                  {summary ? <Text style={styles.activitySummary}>{summary}</Text> : null}
                </View>
              </View>;
            })}
          </View>

          <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={22} color={ui.colors.primary} /><Text style={styles.noticeText}>Questa anteprima mostra le ultime 120 attività. Usa l’esportazione per consultare tutto lo storico disponibile. Il dossier è un riepilogo documentale dei dati presenti in DueCase: non è un documento certificato e non attribuisce automaticamente valore legale o probatorio predeterminato. L’eventuale utilizzo esterno dipende dalla normativa applicabile e dalla valutazione dell’autorità o del professionista competente.</Text></View>
        </>
      ) : null}
    </ScrollView>
  );
}

function ParentCard({ label, hours, percentage, icon }: { label: string; hours: number; percentage: number; icon: keyof typeof Ionicons.glyphMap }): React.JSX.Element {
  return <View style={styles.parentCard}><View style={styles.parentIcon}><Ionicons name={icon} size={25} color={ui.colors.primary} /></View><Text style={styles.parentLabel}>{label}</Text><Text style={styles.parentPercentage}>{percentage.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</Text><Text style={styles.parentHours}>{(hours/24).toLocaleString('it-IT', { maximumFractionDigits: 1 })} giorni-figlio</Text></View>;
}

function Bar({ label, percentage }: { label: string; percentage: number }): React.JSX.Element {
  return <View style={styles.barBlock}><View style={styles.barHeader}><Text style={styles.barLabel}>{label}</Text><Text style={styles.barValue}>{percentage.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, percentage))}%` }]} /></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  content: { padding: 18, paddingBottom: 40, gap: 14, maxWidth: 1050, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { color: ui.colors.muted, marginTop: 3 },
  refresh: { width: 44, height: 44, borderRadius: 14, backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center' },
  periodCard: { ...cardShadow, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  periodLabel: { color: ui.colors.muted, fontSize: 11, fontWeight: '800' },
  periodValue: { color: ui.colors.primaryDark, fontWeight: '900', marginTop: 2 },
  grid: { flexDirection: 'row', gap: 12 },
  gridCompact: { flexDirection: 'column' },
  parentCard: { ...cardShadow, flex: 1, minWidth: 0, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 18 },
  parentIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  parentLabel: { marginTop: 10, fontWeight: '900', color: ui.colors.primaryDark },
  parentPercentage: { fontSize: 28, fontWeight: '900', color: ui.colors.primary, marginTop: 2 },
  parentHours: { color: ui.colors.muted, fontSize: 12 },
  chartCard: { ...cardShadow, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 18, gap: 14 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: ui.colors.primaryDark },
  sectionSubtitle: { color: ui.colors.muted, marginTop: 2 },
  barBlock: { gap: 6 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { color: ui.colors.text, fontWeight: '800' },
  barValue: { color: ui.colors.primary, fontWeight: '900' },
  track: { height: 14, borderRadius: 7, backgroundColor: ui.colors.input, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 7, backgroundColor: ui.colors.primary },
  total: { paddingTop: 8, borderTopWidth: 1, borderTopColor: ui.colors.border, flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: ui.colors.muted },
  totalValue: { color: ui.colors.primaryDark, fontWeight: '900' },
  timelineHeader: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  historyBadge: { minWidth: 58, borderRadius: 14, backgroundColor: ui.colors.primarySoft, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7 },
  historyBadgeNumber: { fontSize: 18, fontWeight: '900', color: ui.colors.primary },
  historyBadgeText: { color: ui.colors.muted, fontSize: 9, fontWeight: '800' },
  filters: { gap: 7, paddingVertical: 2 },
  filterChip: { minHeight: 34, paddingHorizontal: 11, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterChipActive: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary },
  filterText: { color: ui.colors.primaryDark, fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: '#FFF' },
  timelineCard: { ...cardShadow, backgroundColor: '#FFF', borderRadius: 17, borderWidth: 1, borderColor: ui.colors.border, paddingHorizontal: 15 },
  activityRow: { flexDirection: 'row', gap: 11, paddingVertical: 14 },
  activityDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.colors.border },
  activityIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  activityCopy: { flex: 1, minWidth: 0 },
  activityTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  activityTitle: { color: ui.colors.primaryDark, fontWeight: '900', flexShrink: 1 },
  activityDate: { color: ui.colors.muted, fontSize: 10 },
  activityActor: { color: ui.colors.muted, fontSize: 11, marginTop: 2 },
  activitySummary: { color: ui.colors.text, fontSize: 12, marginTop: 4, lineHeight: 18 },
  empty: { paddingVertical: 30, alignItems: 'center', gap: 7 },
  emptyTitle: { color: ui.colors.primaryDark, fontWeight: '900' },
  emptyText: { color: ui.colors.muted, textAlign: 'center' },
  notice: { backgroundColor: ui.colors.primarySoft, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noticeText: { flex: 1, color: ui.colors.text, lineHeight: 19, fontSize: 12 },
});
