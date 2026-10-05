import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { DailyCustody, ParentRole, SwapRequest } from '../types/models';

LocaleConfig.locales.it = {
  monthNames: ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
  monthNamesShort: ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
  dayNames: ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'],
  dayNamesShort: ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'], today: 'Oggi',
};
LocaleConfig.defaultLocale = 'it';

const COLORS: Record<ParentRole, string> = { father: '#2563EB', mother: '#EC4899' };
const label = (r: ParentRole) => r === 'father' ? 'Padre' : 'Madre';
const todayKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const range = (month: string) => { const [y,m]=month.split('-').map(Number); const last=new Date(Date.UTC(y!,m!,0)).getUTCDate(); return {from:`${month}-01`,to:`${month}-${String(last).padStart(2,'0')}`}; };
const pretty = (v:string) => { const [y,m,d]=v.split('-').map(Number); return y&&m&&d ? new Date(y,m-1,d,12).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}) : v; };

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
    try { const r=range(month); const [d,s]=await Promise.all([api.turns.list(r.from,r.to),api.swapRequests.list('pending')]); setDays(d); setRequests(s); }
    catch(e){ Alert.alert('Calendario',e instanceof Error?e.message:'Errore di caricamento'); }
    finally { setLoading(false); setRefreshing(false); }
  },[month]);
  useEffect(()=>{ void load(); },[load]);

  const byDate = useMemo(()=>new Map(days.map(d=>[d.custodyDate,d])),[days]);
  const ownDays = useMemo(()=>days.filter(d=>d.custodianRole===user?.role).map(d=>d.custodyDate).sort(),[days,user?.role]);
  const pendingDates = useMemo(()=>new Set(requests.flatMap(r=>[r.targetDate,r.proposedDate])),[requests]);
  const markedDates = useMemo(()=>Object.fromEntries(days.map(d=>[d.custodyDate,{customStyles:{container:{backgroundColor:COLORS[d.custodianRole],borderRadius:9,...(pendingDates.has(d.custodyDate)?{borderWidth:3,borderColor:'#F59E0B'}:{})},text:{color:'#FFF',fontWeight:'800'}}}])),[days,pendingDates]);

  function selectDay(date:string){
    if(!user) return; const d=byDate.get(date);
    if(!d){ Alert.alert('Giorno non assegnato','Questo giorno non ha ancora una custodia ufficiale.'); return; }
    if(d.custodianRole===user.role){ Alert.alert('È già un tuo giorno','Seleziona un giorno assegnato all’altro genitore.'); return; }
    setTarget(date); setProposed(ownDays.find(x=>x>date)??ownDays[0]??''); setNotes(''); setModal(true);
  }

  async function send(){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(proposed)){ Alert.alert('Data non valida','Usa AAAA-MM-GG.'); return; }
    try { setBusy(true); await api.swapRequests.create({targetDate:target,proposedDate:proposed,notes:notes.trim()||undefined}); setModal(false); await load(); Alert.alert('Richiesta inviata'); }
    catch(e){ Alert.alert('Errore',e instanceof Error?e.message:'Richiesta non inviata'); } finally { setBusy(false); }
  }

  async function review(r:SwapRequest,action:'approve'|'reject'){
    try { setBusy(true); action==='approve'?await api.swapRequests.approve(r.id):await api.swapRequests.reject(r.id); await load(); Alert.alert(action==='approve'?'Cambio approvato':'Cambio rifiutato'); }
    catch(e){ Alert.alert('Errore',e instanceof Error?e.message:'Operazione non riuscita'); } finally { setBusy(false); }
  }

  if(loading) return <View style={s.center}><ActivityIndicator size="large"/><Text>Caricamento calendario…</Text></View>;
  const incoming=requests.filter(r=>r.canRespond).length;

  return <>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load();}}/>}>
      <View style={s.head}><View><Text style={s.title}>Calendario turni</Text><Text style={s.muted}>Custodia ufficiale giorno per giorno.</Text></View><View style={s.badge}><Text style={s.badgeN}>{incoming}</Text><Text style={s.badgeT}>in sospeso</Text></View></View>
      <View style={s.legend}><Text>🔵 Padre</Text><Text>🩷 Madre</Text><Text>🟠 Cambio richiesto</Text></View>
      <View style={s.card}><Calendar current={`${month}-01`} markingType="custom" markedDates={markedDates} firstDay={1} enableSwipeMonths onDayPress={(d:DateData)=>selectDay(d.dateString)} onMonthChange={(d:DateData)=>setMonth(d.dateString.slice(0,7))}/></View>
      <Text style={s.section}>Richieste in sospeso</Text>
      {requests.length===0?<View style={s.cardPad}><Text style={s.bold}>Nessuna richiesta aperta</Text><Text style={s.muted}>Le nuove proposte compariranno qui.</Text></View>:requests.map(r=><View key={r.id} style={s.cardPad}>
        <View style={s.head}><View><Text style={s.bold}>{r.requestedBy===user?.id?'Richiesta inviata':`Richiesta da ${r.requestedByName}`}</Text><Text style={s.muted}>{label(r.requestedByRole)}</Text></View><Text style={s.pending}>In sospeso</Text></View>
        <Text style={s.swap}>{pretty(r.targetDate)}  ⇄  {pretty(r.proposedDate)}</Text>{r.notes?<Text style={s.note}>“{r.notes}”</Text>:null}
        {r.canRespond?<View style={s.actions}><Pressable disabled={busy} style={s.reject} onPress={()=>void review(r,'reject')}><Text style={s.rejectT}>Rifiuta</Text></Pressable><Pressable disabled={busy} style={s.accept} onPress={()=>void review(r,'approve')}><Text style={s.acceptT}>Accetta</Text></Pressable></View>:<Text style={s.muted}>In attesa dell’altro genitore.</Text>}
      </View>)}
    </ScrollView>
    <Modal visible={modal} transparent animationType="slide" onRequestClose={()=>setModal(false)}><View style={s.backdrop}><View style={s.modal}>
      <Text style={s.modalTitle}>Richiedi cambio turno</Text><Text style={s.muted}>Giorno richiesto: {pretty(target)}</Text>
      <Text style={s.label}>Giorno che offri</Text><TextInput value={proposed} onChangeText={setProposed} placeholder="AAAA-MM-GG" style={s.input}/>
      <ScrollView horizontal contentContainerStyle={s.chips}>{ownDays.map(d=><Pressable key={d} style={s.chip} onPress={()=>setProposed(d)}><Text>{pretty(d)}</Text></Pressable>)}</ScrollView>
      <Text style={s.label}>Nota</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[s.input,s.notes]} placeholder="Scrivi una nota per l’altro genitore"/>
      <View style={s.actions}><Pressable style={s.reject} onPress={()=>setModal(false)}><Text>Annulla</Text></Pressable><Pressable disabled={busy} style={s.accept} onPress={()=>void send()}><Text style={s.acceptT}>{busy?'Invio…':'Invia richiesta'}</Text></Pressable></View>
    </View></View></Modal>
  </>;
}

const s=StyleSheet.create({
  center:{flex:1,alignItems:'center',justifyContent:'center',gap:10},content:{padding:18,gap:14,paddingBottom:36},head:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12},title:{fontSize:28,fontWeight:'900',color:'#0F172A'},muted:{color:'#64748B'},badge:{backgroundColor:'#FFF7ED',borderRadius:14,padding:9,alignItems:'center'},badgeN:{fontSize:20,fontWeight:'900',color:'#C2410C'},badgeT:{fontSize:10,fontWeight:'800',color:'#C2410C'},legend:{flexDirection:'row',flexWrap:'wrap',gap:14},card:{backgroundColor:'#FFF',borderRadius:20,overflow:'hidden',borderWidth:1,borderColor:'#E2E8F0'},cardPad:{backgroundColor:'#FFF',borderRadius:18,padding:16,borderWidth:1,borderColor:'#E2E8F0',gap:12},section:{fontSize:20,fontWeight:'900',color:'#0F172A'},bold:{fontWeight:'900',color:'#0F172A'},pending:{color:'#92400E',backgroundColor:'#FEF3C7',paddingHorizontal:9,paddingVertical:5,borderRadius:999,fontWeight:'800'},swap:{fontWeight:'800',color:'#334155'},note:{fontStyle:'italic',color:'#475569'},actions:{flexDirection:'row',gap:10},reject:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:'#FFF1F2',borderWidth:1,borderColor:'#FECDD3'},rejectT:{color:'#BE123C',fontWeight:'900'},accept:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:'#16A34A'},acceptT:{color:'#FFF',fontWeight:'900'},backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(15,23,42,.45)'},modal:{backgroundColor:'#FFF',borderTopLeftRadius:26,borderTopRightRadius:26,padding:20,gap:12},modalTitle:{fontSize:23,fontWeight:'900'},label:{fontWeight:'800',color:'#334155'},input:{minHeight:48,borderWidth:1,borderColor:'#CBD5E1',borderRadius:12,paddingHorizontal:12},notes:{minHeight:100,paddingTop:12,textAlignVertical:'top'},chips:{gap:8},chip:{paddingHorizontal:12,paddingVertical:8,borderRadius:999,backgroundColor:'#F1F5F9'}
});
