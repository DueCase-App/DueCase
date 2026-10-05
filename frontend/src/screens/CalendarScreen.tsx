import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { DailyCustody, ParentRole, SwapRequest } from '../types/models';

LocaleConfig.locales.it = {
  monthNames: ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
  monthNamesShort: ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
  dayNames: ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'],
  dayNamesShort: ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'], today: 'Oggi',
};
LocaleConfig.defaultLocale = 'it';

const ROLE_COLORS: Record<ParentRole, string> = { father: '#2D7FD6', mother: '#D96C9B' };
const label = (role: ParentRole) => role === 'father' ? 'Padre' : 'Madre';
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const range = (month: string) => { const [y,m] = month.split('-').map(Number); const last = new Date(Date.UTC(y!,m!,0)).getUTCDate(); return { from:`${month}-01`, to:`${month}-${String(last).padStart(2,'0')}` }; };
const pretty = (value:string) => { const [y,m,d] = value.split('-').map(Number); return y&&m&&d ? new Date(y,m-1,d,12).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}) : value; };

export function CalendarScreen(): React.JSX.Element {
  const { user } = useAuth();
  const [month,setMonth] = useState(todayKey().slice(0,7));
  const [days,setDays] = useState<DailyCustody[]>([]);
  const [requests,setRequests] = useState<SwapRequest[]>([]);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [modal,setModal] = useState(false);
  const [target,setTarget] = useState('');
  const [proposed,setProposed] = useState('');
  const [notes,setNotes] = useState('');
  const [busy,setBusy] = useState(false);

  const load = useCallback(async()=>{
    try { const selectedRange=range(month); const [d,s]=await Promise.all([api.turns.list(selectedRange.from,selectedRange.to),api.swapRequests.list('pending')]); setDays(d); setRequests(s); }
    catch(error){ Alert.alert('Calendario',error instanceof Error?error.message:'Errore di caricamento'); }
    finally { setLoading(false); setRefreshing(false); }
  },[month]);
  useEffect(()=>{ void load(); },[load]);

  const byDate = useMemo(()=>new Map(days.map(d=>[d.custodyDate,d])),[days]);
  const ownDays = useMemo(()=>days.filter(d=>d.custodianRole===user?.role).map(d=>d.custodyDate).sort(),[days,user?.role]);
  const pendingDates = useMemo(()=>new Set(requests.flatMap(r=>[r.targetDate,r.proposedDate])),[requests]);
  const markedDates = useMemo(()=>Object.fromEntries(days.map(d=>[d.custodyDate,{customStyles:{container:{backgroundColor:ROLE_COLORS[d.custodianRole],borderRadius:9,...(pendingDates.has(d.custodyDate)?{borderWidth:3,borderColor:ui.colors.orange}:{})},text:{color:'#FFF',fontWeight:'800' as const}}}])),[days,pendingDates]);

  function selectDay(date:string){
    if(!user) return;
    const day=byDate.get(date);
    if(!day){ Alert.alert('Giorno non assegnato','Questo giorno non ha ancora una custodia ufficiale.'); return; }
    if(day.custodianRole===user.role){ Alert.alert('È già un tuo giorno','Seleziona un giorno assegnato all’altro genitore.'); return; }
    setTarget(date); setProposed(ownDays.find(x=>x>date)??ownDays[0]??''); setNotes(''); setModal(true);
  }

  async function send(){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(proposed)){ Alert.alert('Data non valida','Usa AAAA-MM-GG.'); return; }
    try { setBusy(true); await api.swapRequests.create({targetDate:target,proposedDate:proposed,notes:notes.trim()||undefined}); setModal(false); await load(); Alert.alert('Richiesta inviata'); }
    catch(error){ Alert.alert('Errore',error instanceof Error?error.message:'Richiesta non inviata'); } finally { setBusy(false); }
  }

  async function review(request:SwapRequest,action:'approve'|'reject'){
    try { setBusy(true); action==='approve'?await api.swapRequests.approve(request.id):await api.swapRequests.reject(request.id); await load(); Alert.alert(action==='approve'?'Cambio approvato':'Cambio rifiutato'); }
    catch(error){ Alert.alert('Errore',error instanceof Error?error.message:'Operazione non riuscita'); } finally { setBusy(false); }
  }

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary}/><Text style={styles.muted}>Caricamento calendario…</Text></View>;
  const incoming=requests.filter(r=>r.canRespond).length;

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} tintColor={ui.colors.primary} onRefresh={()=>{setRefreshing(true);void load();}}/>}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>Calendario</Text><Text style={styles.muted}>Custodia, turni e richieste di cambio.</Text></View><View style={styles.badge}><Text style={styles.badgeN}>{incoming}</Text><Text style={styles.badgeT}>in sospeso</Text></View></View>
      <View style={styles.legend}>
        <LegendDot color={ROLE_COLORS.father} label="Padre"/><LegendDot color={ROLE_COLORS.mother} label="Madre"/><LegendDot color={ui.colors.orange} label="Cambio richiesto"/>
      </View>
      <View style={[styles.calendarCard,cardShadow]}>
        <Calendar
          current={`${month}-01`}
          markingType="custom"
          markedDates={markedDates}
          firstDay={1}
          enableSwipeMonths
          onDayPress={(d:DateData)=>selectDay(d.dateString)}
          onMonthChange={(d:DateData)=>setMonth(d.dateString.slice(0,7))}
          theme={{backgroundColor:ui.colors.card,calendarBackground:ui.colors.card,textSectionTitleColor:ui.colors.muted,dayTextColor:ui.colors.text,monthTextColor:ui.colors.primaryDark,todayTextColor:ui.colors.primary,arrowColor:ui.colors.primary,textMonthFontWeight:'900',textDayHeaderFontWeight:'700'}}
        />
      </View>
      <Text style={styles.section}>Richieste in sospeso</Text>
      {requests.length===0?<View style={[styles.card,cardShadow]}><View style={styles.emptyIcon}><Ionicons name="swap-horizontal-outline" size={24} color={ui.colors.primary}/></View><View style={styles.flex}><Text style={styles.bold}>Nessuna richiesta aperta</Text><Text style={styles.muted}>Le nuove proposte compariranno qui.</Text></View></View>:requests.map(request=><View key={request.id} style={[styles.requestCard,cardShadow]}>
        <View style={styles.rowBetween}><View><Text style={styles.bold}>{request.requestedBy===user?.id?'Richiesta inviata':`Richiesta da ${request.requestedByName}`}</Text><Text style={styles.muted}>{label(request.requestedByRole)}</Text></View><View style={styles.pendingPill}><Text style={styles.pendingText}>In sospeso</Text></View></View>
        <View style={styles.swapBox}><Ionicons name="calendar-outline" size={19} color={ui.colors.primary}/><Text style={styles.swap}>{pretty(request.targetDate)}</Text><Ionicons name="swap-horizontal" size={18} color={ui.colors.orange}/><Text style={styles.swap}>{pretty(request.proposedDate)}</Text></View>
        {request.notes?<Text style={styles.note}>“{request.notes}”</Text>:null}
        {request.canRespond?<View style={styles.actions}><Pressable disabled={busy} style={styles.reject} onPress={()=>void review(request,'reject')}><Text style={styles.rejectT}>Rifiuta</Text></Pressable><Pressable disabled={busy} style={styles.accept} onPress={()=>void review(request,'approve')}><Text style={styles.acceptT}>Accetta</Text></Pressable></View>:<Text style={styles.muted}>In attesa dell’altro genitore.</Text>}
      </View>)}
    </ScrollView>
    <Modal visible={modal} transparent animationType="slide" onRequestClose={()=>setModal(false)}><View style={styles.backdrop}><View style={styles.modal}>
      <View style={styles.modalHead}><Text style={styles.modalTitle}>Richiedi cambio turno</Text><Pressable onPress={()=>setModal(false)}><Ionicons name="close" size={26} color={ui.colors.text}/></Pressable></View>
      <Text style={styles.muted}>Giorno richiesto: {pretty(target)}</Text>
      <Text style={styles.label}>Giorno che offri</Text><TextInput value={proposed} onChangeText={setProposed} placeholder="AAAA-MM-GG" placeholderTextColor={ui.colors.muted} style={styles.input}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{ownDays.map(d=><Pressable key={d} style={styles.chip} onPress={()=>setProposed(d)}><Text style={styles.chipText}>{pretty(d)}</Text></Pressable>)}</ScrollView>
      <Text style={styles.label}>Nota</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input,styles.notes]} placeholder="Scrivi una nota per l’altro genitore" placeholderTextColor={ui.colors.muted}/>
      <View style={styles.actions}><Pressable style={styles.reject} onPress={()=>setModal(false)}><Text style={styles.rejectT}>Annulla</Text></Pressable><Pressable disabled={busy} style={styles.accept} onPress={()=>void send()}><Text style={styles.acceptT}>{busy?'Invio…':'Invia richiesta'}</Text></Pressable></View>
    </View></View></Modal>
  </View>;
}

function LegendDot({color,label}:{color:string;label:string}):React.JSX.Element{return <View style={styles.legendItem}><View style={[styles.dot,{backgroundColor:color}]}/><Text style={styles.legendText}>{label}</Text></View>;}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:ui.colors.background},
  center:{flex:1,alignItems:'center',justifyContent:'center',gap:10,backgroundColor:ui.colors.background},
  content:{padding:18,gap:14,paddingBottom:34},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},headerCopy:{flex:1,gap:3},
  title:{fontSize:28,fontWeight:'900',color:ui.colors.primaryDark},muted:{color:ui.colors.muted,lineHeight:20},
  badge:{backgroundColor:ui.colors.warningSoft,borderRadius:14,paddingHorizontal:11,paddingVertical:8,alignItems:'center'},badgeN:{fontSize:20,fontWeight:'900',color:ui.colors.warning},badgeT:{fontSize:10,fontWeight:'800',color:ui.colors.warning},
  legend:{flexDirection:'row',flexWrap:'wrap',gap:14},legendItem:{flexDirection:'row',alignItems:'center',gap:6},dot:{width:9,height:9,borderRadius:5},legendText:{color:ui.colors.muted,fontWeight:'700',fontSize:12},
  calendarCard:{backgroundColor:ui.colors.card,borderRadius:ui.radius.lg,overflow:'hidden',borderWidth:1,borderColor:ui.colors.border},
  section:{fontSize:21,fontWeight:'900',color:ui.colors.primaryDark,marginTop:4},
  card:{backgroundColor:ui.colors.card,borderRadius:ui.radius.lg,padding:16,borderWidth:1,borderColor:ui.colors.border,flexDirection:'row',alignItems:'center',gap:12},
  requestCard:{backgroundColor:ui.colors.card,borderRadius:ui.radius.lg,padding:16,borderWidth:1,borderColor:ui.colors.border,gap:12},
  emptyIcon:{width:46,height:46,borderRadius:14,backgroundColor:ui.colors.primarySoft,alignItems:'center',justifyContent:'center'},flex:{flex:1},
  rowBetween:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12},bold:{fontWeight:'900',color:ui.colors.text,fontSize:15},
  pendingPill:{backgroundColor:ui.colors.warningSoft,paddingHorizontal:9,paddingVertical:5,borderRadius:999},pendingText:{color:ui.colors.warning,fontWeight:'900',fontSize:11},
  swapBox:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap',padding:11,borderRadius:12,backgroundColor:ui.colors.input},swap:{fontWeight:'800',color:ui.colors.text},note:{fontStyle:'italic',color:ui.colors.muted},
  actions:{flexDirection:'row',gap:10},reject:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:ui.radius.md,backgroundColor:ui.colors.dangerSoft,borderWidth:1,borderColor:'#F8CAD3'},rejectT:{color:ui.colors.danger,fontWeight:'900'},accept:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:ui.radius.md,backgroundColor:ui.colors.primary},acceptT:{color:'#FFF',fontWeight:'900'},
  backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(10,50,103,.35)'},modal:{backgroundColor:ui.colors.card,borderTopLeftRadius:28,borderTopRightRadius:28,padding:20,gap:12},modalHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},modalTitle:{fontSize:23,fontWeight:'900',color:ui.colors.primaryDark},label:{fontWeight:'800',color:ui.colors.text},input:{minHeight:50,borderWidth:1,borderColor:ui.colors.border,borderRadius:ui.radius.md,paddingHorizontal:13,backgroundColor:ui.colors.input,color:ui.colors.text},notes:{minHeight:100,paddingTop:12,textAlignVertical:'top'},chips:{gap:8},chip:{paddingHorizontal:12,paddingVertical:8,borderRadius:999,backgroundColor:ui.colors.primarySoft},chipText:{color:ui.colors.primaryDark,fontWeight:'700'}
});
