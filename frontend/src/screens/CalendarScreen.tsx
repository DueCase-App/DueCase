import { useLiveRefresh } from '../services/live';
import { SafeModal as Modal } from '../components/SafeModal';
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
  TextInput,
  View,
} from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type {
  DailyCustody,
  FamilyChild,
  FamilyEvent,
  FamilyEventType,
  ParentRole,
  SwapRequest,
} from '../types/models';

LocaleConfig.locales.it = {
  monthNames: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
  monthNamesShort: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
  dayNames: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
  dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
  today: 'Oggi',
};
LocaleConfig.defaultLocale = 'it';

const ROLE_COLORS: Record<ParentRole, string> = { father: '#2D7FD6', mother: '#D96C9B' };
const roleLabel = (role: ParentRole | null | undefined) => role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Da definire';
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthRange = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
};
const monthDateTimes = (month: string) => {
  const r = monthRange(month);
  return { from: `${r.from}T00:00:00.000Z`, to: `${r.to}T23:59:59.999Z` };
};
const prettyDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return year && month && day
    ? new Date(year, month - 1, day, 12).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    : value;
};
const prettyTime = (value: string) => new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

const EVENT_TYPES: Array<{ key: FamilyEventType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'school', label: 'Scuola', icon: 'school-outline' },
  { key: 'sport', label: 'Sport', icon: 'football-outline' },
  { key: 'medical', label: 'Medico', icon: 'medkit-outline' },
  { key: 'birthday', label: 'Compleanno', icon: 'gift-outline' },
  { key: 'vacation', label: 'Vacanza', icon: 'sunny-outline' },
  { key: 'holiday', label: 'Festività', icon: 'calendar-number-outline' },
  { key: 'appointment', label: 'Appuntamento', icon: 'time-outline' },
  { key: 'personal', label: 'Personale', icon: 'person-outline' },
  { key: 'other', label: 'Altro', icon: 'ellipse-outline' },
];

export function CalendarScreen({onProposeChange}:{onProposeChange?:(date:string)=>void}): React.JSX.Element {
  const { user } = useAuth();
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [days, setDays] = useState<DailyCustody[]>([]);
  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);

  const [swapModal, setSwapModal] = useState(false);
  const [target, setTarget] = useState('');
  const [proposed, setProposed] = useState('');
  const [swapNotes, setSwapNotes] = useState('');
  const [responseSwap, setResponseSwap] = useState<SwapRequest | null>(null);
  const [swapResponseNote, setSwapResponseNote] = useState('');

  const [eventModal, setEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(todayKey());
  const [eventTime, setEventTime] = useState('09:00');
  const [eventLocation, setEventLocation] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventType, setEventType] = useState<FamilyEventType>('appointment');
  const [eventChildId, setEventChildId] = useState<string | null>(null);
  const [eventNeedsApproval, setEventNeedsApproval] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [responseEvent, setResponseEvent] = useState<FamilyEvent | null>(null);
  const [responseNote, setResponseNote] = useState('');

  const load = useCallback(async () => {
    try {
      const selectedRange = monthRange(month);
      const dateTimes = monthDateTimes(month);
      const [turnItems, swapItems, eventItems, kids] = await Promise.all([
        api.turns.list(selectedRange.from, selectedRange.to),
        api.swapRequests.list('pending'),
        api.events.list(dateTimes.from, dateTimes.to),
        api.family.children(),
      ]);
      setDays(turnItems);
      setRequests(swapItems);
      setEvents(eventItems);
      setChildren(kids);
    } catch (error) {
      Alert.alert('Calendario', error instanceof Error ? error.message : 'Errore di caricamento');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);

  const byDate = useMemo(() => new Map(days.map((day) => [day.custodyDate, day])), [days]);
  const ownDays = useMemo(
    () => [...new Set(days.filter((day) => day.custodianRole === user?.role && day.source === 'calendar').map((day) => day.custodyDate))].sort(),
    [days, user?.role],
  );
  const pendingDates = useMemo(() => new Set(requests.flatMap((request) => [request.targetDate, request.proposedDate])), [requests]);
  const eventDates = useMemo(() => {
    const map = new Map<string, { pending: boolean; count: number }>();
    for (const event of events) {
      const key = event.startsAt.slice(0, 10);
      const current = map.get(key) ?? { pending: false, count: 0 };
      map.set(key, { pending: current.pending || event.status === 'pending', count: current.count + 1 });
    }
    return map;
  }, [events]);

  const markedDates = useMemo(() => {
    const allDates = new Set([...days.map((d) => d.custodyDate), ...eventDates.keys()]);
    return Object.fromEntries([...allDates].map((date) => {
      const day = byDate.get(date);
      const eventInfo = eventDates.get(date);
      const pending = pendingDates.has(date) || eventInfo?.pending;
      const mixed = new Set(days.filter(d=>d.custodyDate===date).map(d=>d.custodianRole)).size>1;
      const background = mixed ? '#7958A6' : day ? ROLE_COLORS[day.custodianRole] : ui.colors.primarySoft;
      return [date, {
        customStyles: {
          container: {
            backgroundColor: background,
            borderRadius: 9,
            ...(eventInfo ? { borderWidth: pending ? 3 : 2, borderColor: pending ? ui.colors.orange : ui.colors.primaryDark } : pending ? { borderWidth: 3, borderColor: ui.colors.orange } : {}),
          },
          text: { color: day ? '#FFF' : ui.colors.primaryDark, fontWeight: '900' as const },
        },
      }];
    }));
  }, [days, byDate, eventDates, pendingDates]);

  const incoming = requests.filter((request) => request.canRespond).length + events.filter((event) => event.canRespond).length;

  function openSwap(date: string): void {
    setDayModalDate(date);
  }

  function openEventForDate(date: string): void {
    setDayModalDate(null);
    resetEventForm(date);
    setEventModal(true);
  }

  function proposeChangeForDate(date: string): void {
    setDayModalDate(null);
    if (onProposeChange) {
      onProposeChange(date);
      return;
    }
    const day = byDate.get(date);
    if (!day || !user) return;
    setTarget(date);
    setProposed(ownDays.find((value) => value > date) ?? ownDays[0] ?? '');
    setSwapNotes('');
    setSwapModal(true);
  }

  async function sendSwap(): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proposed)) {
      Alert.alert('Data non valida', 'Usa AAAA-MM-GG.');
      return;
    }
    try {
      setBusy(true);
      await api.swapRequests.create({ targetDate: target, proposedDate: proposed, notes: swapNotes.trim() || undefined });
      setSwapModal(false);
      await load();
      Alert.alert('Richiesta inviata', 'L’altro genitore potrà accettarla o rifiutarla.');
    } catch (error) {
      Alert.alert('Errore', error instanceof Error ? error.message : 'Richiesta non inviata');
    } finally { setBusy(false); }
  }

  async function reviewSwap(action: 'approve' | 'reject'): Promise<void> {
    if (!responseSwap) return;
    try {
      setBusy(true);
      const note = swapResponseNote.trim() || null;
      action === 'approve'
        ? await api.swapRequests.approve(responseSwap.id, note)
        : await api.swapRequests.reject(responseSwap.id, note);
      setResponseSwap(null);
      setSwapResponseNote('');
      await load();
      Alert.alert(action === 'approve' ? 'Cambio approvato' : 'Cambio rifiutato');
    } catch (error) {
      Alert.alert('Errore', error instanceof Error ? error.message : 'Operazione non riuscita');
    } finally { setBusy(false); }
  }

  function resetEventForm(date = todayKey()): void {
    setEventTitle('');
    setEventDate(date);
    setEventTime('09:00');
    setEventLocation('');
    setEventNotes('');
    setEventType('appointment');
    setEventChildId(null);
    setEventNeedsApproval(false);
  }

  async function createEvent(): Promise<void> {
    if (!eventTitle.trim()) {
      Alert.alert('Titolo richiesto', 'Scrivi un titolo per l’evento.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^\d{2}:\d{2}$/.test(eventTime)) {
      Alert.alert('Data o ora non valida', 'Usa data AAAA-MM-GG e ora HH:MM.');
      return;
    }
    const localStart = new Date(`${eventDate}T${eventTime}:00`);
    if (Number.isNaN(localStart.getTime())) {
      Alert.alert('Data non valida');
      return;
    }
    try {
      setBusy(true);
      await api.events.create({
        title: eventTitle.trim(),
        startsAt: localStart.toISOString(),
        location: eventLocation.trim() || null,
        notes: eventNotes.trim() || null,
        childId: eventChildId,
        eventType,
        requiresApproval: eventNeedsApproval,
      });
      setEventModal(false);
      resetEventForm();
      await load();
      Alert.alert(eventNeedsApproval ? 'Richiesta inviata' : 'Evento salvato', eventNeedsApproval ? 'L’evento diventerà definitivo dopo la risposta dell’altro genitore.' : 'L’evento è stato aggiunto al calendario condiviso.');
    } catch (error) {
      Alert.alert('Calendario', error instanceof Error ? error.message : 'Evento non salvato.');
    } finally { setBusy(false); }
  }

  async function respondToEvent(status: 'confirmed' | 'rejected'): Promise<void> {
    if (!responseEvent) return;
    try {
      setBusy(true);
      await api.events.respond(responseEvent.id, status, responseNote.trim() || null);
      setResponseEvent(null);
      setResponseNote('');
      await load();
      Alert.alert(status === 'confirmed' ? 'Evento accettato' : 'Evento rifiutato');
    } catch (error) {
      Alert.alert('Calendario', error instanceof Error ? error.message : 'Risposta non salvata.');
    } finally { setBusy(false); }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.muted}>Caricamento calendario…</Text></View>;

  return <View style={styles.screen}>
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={ui.colors.primary} onRefresh={() => { setRefreshing(true); void load(); }} />}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>CALENDARIO CONDIVISO</Text><Text style={styles.title}>Calendario</Text><Text style={styles.muted}>Permanenze, appuntamenti e decisioni condivise in un unico posto.</Text></View>
        <Pressable style={styles.addButton} onPress={() => { resetEventForm(); setEventModal(true); }}><Ionicons name="add" size={20} color="#FFF" /><Text style={styles.addButtonText}>Evento</Text></Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{events.length}</Text><Text style={styles.summaryLabel}>eventi del mese</Text></View>
        <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{incoming}</Text><Text style={styles.summaryLabel}>da rispondere</Text></View>
      </View>

      <View style={styles.legend}>
        <LegendDot color={ROLE_COLORS.father} label="Papà" />
        <LegendDot color={ROLE_COLORS.mother} label="Mamma" />
        <LegendDot color={ui.colors.primaryDark} label="Evento" />
        <LegendDot color={ui.colors.orange} label="In attesa" />
      </View>

      <View style={[styles.calendarCard, cardShadow]}>
        <Calendar
          current={`${month}-01`}
          markingType="custom"
          markedDates={markedDates}
          firstDay={1}
          enableSwipeMonths
          onDayPress={(day: DateData) => openSwap(day.dateString)}
          onMonthChange={(day: DateData) => setMonth(day.dateString.slice(0, 7))}
          theme={{
            backgroundColor: ui.colors.card,
            calendarBackground: ui.colors.card,
            textSectionTitleColor: ui.colors.muted,
            dayTextColor: ui.colors.text,
            monthTextColor: ui.colors.primaryDark,
            todayTextColor: ui.colors.primary,
            arrowColor: ui.colors.primary,
            textMonthFontWeight: '900',
            textDayHeaderFontWeight: '700',
          }}
        />
      </View>
      <Text style={styles.helper}>Tocca qualsiasi giorno per vedere con chi sono i figli, creare un evento o proporre un cambio.</Text>

      <Text style={styles.section}>Eventi del mese</Text>
      {events.length === 0 ? <EmptyCard icon="calendar-outline" text="Nessun evento in questo mese." actionLabel="Crea nuovo evento" onAction={() => { resetEventForm(); setEventModal(true); }} /> : events.map((event) => {
        const expanded = expandedEvent === event.id;
        const typeInfo = EVENT_TYPES.find((item) => item.key === event.eventType) ?? EVENT_TYPES[EVENT_TYPES.length - 1]!;
        return <Pressable key={event.id} style={[styles.eventCard, cardShadow]} onPress={() => setExpandedEvent(expanded ? null : event.id)}>
          <View style={styles.eventMain}>
            <View style={styles.eventIcon}><Ionicons name={typeInfo.icon} size={21} color={ui.colors.primary} /></View>
            <View style={styles.flex}>
              <View style={styles.rowWrap}><Text style={styles.bold}>{event.title}</Text><StatusPill status={event.status} /></View>
              <Text style={styles.eventMeta}>{prettyDate(event.startsAt)} · {prettyTime(event.startsAt)}{event.childName ? ` · ${event.childName}` : ''}</Text>
              {event.location ? <Text style={styles.eventMeta}>📍 {event.location}</Text> : null}
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={ui.colors.muted} />
          </View>
          {expanded ? <View style={styles.expanded}>
            <Text style={styles.detailLabel}>Tipo</Text><Text style={styles.detailText}>{typeInfo.label}</Text>
            {event.notes ? <><Text style={styles.detailLabel}>Note</Text><Text style={styles.detailText}>{event.notes}</Text></> : null}
            <Text style={styles.detailLabel}>Inserito da</Text><Text style={styles.detailText}>{event.createdByName ?? 'Utente'}{event.createdByRole ? ` · ${roleLabel(event.createdByRole)}` : ''}</Text>
            {event.responseNote ? <><Text style={styles.detailLabel}>Risposta</Text><Text style={styles.detailText}>{event.responseNote}</Text></> : null}
            {event.canRespond ? <Pressable style={styles.reviewEventButton} onPress={() => { setResponseEvent(event); setResponseNote(''); }}><Text style={styles.reviewEventText}>Rispondi alla richiesta</Text><Ionicons name="chevron-forward" size={18} color="#FFF" /></Pressable> : null}
          </View> : null}
        </Pressable>;
      })}

      <Text style={styles.section}>Cambi turno in sospeso</Text>
      {requests.length === 0 ? <EmptyCard icon="swap-horizontal-outline" text="Nessuna richiesta di cambio aperta." actionLabel="Proponi un cambio" onAction={() => Alert.alert('Proponi un cambio', 'Tocca sul calendario il giorno che vuoi cambiare.')} /> : requests.map((request) => <View key={request.id} style={[styles.requestCard, cardShadow]}>
        <View style={styles.rowBetween}>
          <View><Text style={styles.bold}>{request.requestedBy === user?.id ? 'Richiesta inviata' : `Richiesta da ${request.requestedByName}`}</Text><Text style={styles.muted}>{roleLabel(request.requestedByRole)}</Text></View>
          <View style={styles.pendingPill}><Text style={styles.pendingText}>In attesa</Text></View>
        </View>
        <View style={styles.swapBox}><Ionicons name="calendar-outline" size={19} color={ui.colors.primary} /><Text style={styles.swap}>{prettyDate(request.targetDate)}</Text><Ionicons name="swap-horizontal" size={18} color={ui.colors.orange} /><Text style={styles.swap}>{prettyDate(request.proposedDate)}</Text></View>
        {request.notes ? <Text style={styles.note}>“{request.notes}”</Text> : null}
        {request.responseNote ? <Text style={styles.note}>Risposta: “{request.responseNote}”</Text> : null}
        {request.canRespond ? <Pressable disabled={busy} style={styles.reviewEventButton} onPress={() => { setResponseSwap(request); setSwapResponseNote(''); }}><Text style={styles.reviewEventText}>Rispondi al cambio turno</Text><Ionicons name="chevron-forward" size={18} color="#FFF" /></Pressable> : <Text style={styles.muted}>In attesa dell’altro genitore.</Text>}
      </View>)}
    </ScrollView>

    <Modal visible={dayModalDate !== null} transparent animationType="fade" onRequestClose={() => setDayModalDate(null)}><View style={styles.centerBackdrop}><View style={styles.dayModal}>
      <ModalHeader title={dayModalDate ? prettyDate(dayModalDate) : 'Giorno'} onClose={() => setDayModalDate(null)} />
      <Text style={styles.dayModalSubtitle}>Situazione prevista per questa data</Text>
      <View style={styles.dayChildrenList}>{dayModalDate ? (() => {
        const resolved = days.filter((day) => day.custodyDate === dayModalDate);
        const rows = resolved.length ? resolved : children.map((child) => ({ childId: child.id, childName: child.displayName, custodianRole: null as ParentRole | null }));
        return rows.map((day, index) => <View key={`${day.childId ?? day.childName ?? index}-${index}`} style={styles.dayChildRow}><View style={[styles.dayRoleDot, { backgroundColor: day.custodianRole ? ROLE_COLORS[day.custodianRole] : ui.colors.border }]} /><Text style={styles.dayChildName}>{day.childName ?? 'Figlio/a'}</Text><Text style={[styles.dayChildRole, day.custodianRole === 'father' ? styles.fatherText : day.custodianRole === 'mother' ? styles.motherText : undefined]}>{day.custodianRole ? roleLabel(day.custodianRole) : 'Da definire'}</Text></View>);
      })() : null}</View>
      <Pressable style={styles.dayPrimaryAction} onPress={() => dayModalDate && openEventForDate(dayModalDate)}><Ionicons name="add-circle-outline" size={21} color="#FFF" /><Text style={styles.dayPrimaryText}>Crea evento</Text></Pressable>
      <Pressable style={styles.daySecondaryAction} onPress={() => dayModalDate && proposeChangeForDate(dayModalDate)}><Ionicons name="swap-horizontal-outline" size={21} color={ui.colors.primary} /><Text style={styles.daySecondaryText}>Proponi cambio</Text></Pressable>
    </View></View></Modal>

    <Modal visible={swapModal} transparent animationType="slide" onRequestClose={() => setSwapModal(false)}><View style={styles.backdrop}><View style={styles.modal}>
      <ModalHeader title="Richiedi cambio turno" onClose={() => setSwapModal(false)} />
      <Text style={styles.muted}>Giorno richiesto: {prettyDate(target)}</Text>
      <Text style={styles.label}>Giorno che offri</Text><TextInput value={proposed} onChangeText={setProposed} placeholder="AAAA-MM-GG" placeholderTextColor={ui.colors.muted} style={styles.input} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{ownDays.map((date) => <Pressable key={date} style={styles.chip} onPress={() => setProposed(date)}><Text style={styles.chipText}>{prettyDate(date)}</Text></Pressable>)}</ScrollView>
      <Text style={styles.label}>Nota</Text><TextInput value={swapNotes} onChangeText={setSwapNotes} multiline style={[styles.input, styles.notes]} placeholder="Spiega la richiesta all’altro genitore" placeholderTextColor={ui.colors.muted} />
      <View style={styles.actions}><Pressable style={styles.cancel} onPress={() => setSwapModal(false)}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable disabled={busy} style={styles.accept} onPress={() => void sendSwap()}><Text style={styles.acceptText}>{busy ? 'Invio…' : 'Invia richiesta'}</Text></Pressable></View>
    </View></View></Modal>

    <Modal visible={eventModal} transparent animationType="slide" onRequestClose={() => setEventModal(false)}><View style={styles.backdrop}><View style={styles.modal}>
      <ModalHeader title="Nuovo evento" onClose={() => setEventModal(false)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
        <Text style={styles.label}>Titolo</Text><TextInput value={eventTitle} onChangeText={setEventTitle} style={styles.input} placeholder="Es. Visita pediatrica" placeholderTextColor={ui.colors.muted} />
        <View style={styles.twoCols}><View style={styles.col}><Text style={styles.label}>Data</Text><TextInput value={eventDate} onChangeText={setEventDate} style={styles.input} placeholder="AAAA-MM-GG" placeholderTextColor={ui.colors.muted} /></View><View style={styles.col}><Text style={styles.label}>Ora</Text><TextInput value={eventTime} onChangeText={setEventTime} style={styles.input} placeholder="09:00" placeholderTextColor={ui.colors.muted} /></View></View>
        <Text style={styles.label}>Tipo</Text><View style={styles.wrapChips}>{EVENT_TYPES.map((item) => <Pressable key={item.key} onPress={() => setEventType(item.key)} style={[styles.typeChip, eventType === item.key && styles.typeChipActive]}><Ionicons name={item.icon} size={16} color={eventType === item.key ? '#FFF' : ui.colors.primary} /><Text style={[styles.typeChipText, eventType === item.key && styles.typeChipTextActive]}>{item.label}</Text></Pressable>)}</View>
        {children.length ? <><Text style={styles.label}>Figlio interessato</Text><View style={styles.wrapChips}><Pressable onPress={() => setEventChildId(null)} style={[styles.typeChip, eventChildId === null && styles.typeChipActive]}><Text style={[styles.typeChipText, eventChildId === null && styles.typeChipTextActive]}>Tutti</Text></Pressable>{children.map((child) => <Pressable key={child.id} onPress={() => setEventChildId(child.id)} style={[styles.typeChip, eventChildId === child.id && styles.typeChipActive]}><Text style={[styles.typeChipText, eventChildId === child.id && styles.typeChipTextActive]}>{child.displayName}</Text></Pressable>)}</View></> : null}
        <Text style={styles.label}>Luogo</Text><TextInput value={eventLocation} onChangeText={setEventLocation} style={styles.input} placeholder="Luogo facoltativo" placeholderTextColor={ui.colors.muted} />
        <Text style={styles.label}>Note</Text><TextInput value={eventNotes} onChangeText={setEventNotes} multiline style={[styles.input, styles.notes]} placeholder="Informazioni utili" placeholderTextColor={ui.colors.muted} />
        <Pressable style={styles.approvalRow} onPress={() => setEventNeedsApproval((value) => !value)}><View style={[styles.checkbox, eventNeedsApproval && styles.checkboxActive]}>{eventNeedsApproval ? <Ionicons name="checkmark" size={15} color="#FFF" /> : null}</View><View style={styles.flex}><Text style={styles.bold}>Richiedi approvazione</Text><Text style={styles.muted}>L’evento resta in attesa finché l’altro genitore non decide.</Text></View></Pressable>
        <Pressable disabled={busy} style={styles.primaryButton} onPress={() => void createEvent()}><Text style={styles.primaryButtonText}>{busy ? 'Salvataggio…' : eventNeedsApproval ? 'Invia richiesta' : 'Salva evento'}</Text></Pressable>
      </ScrollView>
    </View></View></Modal>

    <Modal visible={Boolean(responseSwap)} transparent animationType="fade" onRequestClose={() => setResponseSwap(null)}><View style={styles.centerBackdrop}><View style={styles.responseModal}>
      <ModalHeader title="Rispondi al cambio turno" onClose={() => setResponseSwap(null)} />
      <Text style={styles.bold}>{responseSwap ? `${prettyDate(responseSwap.targetDate)} ↔ ${prettyDate(responseSwap.proposedDate)}` : ''}</Text>
      {responseSwap?.notes ? <Text style={styles.note}>Richiesta: “{responseSwap.notes}”</Text> : null}
      <Text style={styles.label}>Commento facoltativo</Text><TextInput value={swapResponseNote} onChangeText={setSwapResponseNote} multiline style={[styles.input, styles.notes]} placeholder="Aggiungi una nota alla decisione" placeholderTextColor={ui.colors.muted} />
      <View style={styles.actions}><Pressable disabled={busy} style={styles.reject} onPress={() => void reviewSwap('reject')}><Text style={styles.rejectText}>Rifiuta</Text></Pressable><Pressable disabled={busy} style={styles.accept} onPress={() => void reviewSwap('approve')}><Text style={styles.acceptText}>Accetta</Text></Pressable></View>
    </View></View></Modal>

    <Modal visible={Boolean(responseEvent)} transparent animationType="fade" onRequestClose={() => setResponseEvent(null)}><View style={styles.centerBackdrop}><View style={styles.responseModal}>
      <ModalHeader title="Rispondi all’evento" onClose={() => setResponseEvent(null)} />
      <Text style={styles.bold}>{responseEvent?.title}</Text>
      <Text style={styles.label}>Commento facoltativo</Text><TextInput value={responseNote} onChangeText={setResponseNote} multiline style={[styles.input, styles.notes]} placeholder="Aggiungi una nota alla decisione" placeholderTextColor={ui.colors.muted} />
      <View style={styles.actions}><Pressable disabled={busy} style={styles.reject} onPress={() => void respondToEvent('rejected')}><Text style={styles.rejectText}>Rifiuta</Text></Pressable><Pressable disabled={busy} style={styles.accept} onPress={() => void respondToEvent('confirmed')}><Text style={styles.acceptText}>Accetta</Text></Pressable></View>
    </View></View></Modal>
  </View>;
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }): React.JSX.Element {
  return <View style={styles.modalHead}><Text style={styles.modalTitle}>{title}</Text><Pressable style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={22} color={ui.colors.text} /></Pressable></View>;
}

function LegendDot({ color, label }: { color: string; label: string }): React.JSX.Element {
  return <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function StatusPill({ status }: { status: FamilyEvent['status'] }): React.JSX.Element {
  const label = status === 'confirmed' ? 'Confermato' : status === 'rejected' ? 'Rifiutato' : 'In attesa';
  return <View style={[styles.statusPill, status === 'confirmed' ? styles.statusConfirmed : status === 'rejected' ? styles.statusRejected : styles.statusPending]}><Text style={[styles.statusText, status === 'confirmed' ? styles.statusConfirmedText : status === 'rejected' ? styles.statusRejectedText : styles.statusPendingText]}>{label}</Text></View>;
}

function EmptyCard({ icon, text, actionLabel, onAction }: { icon: keyof typeof Ionicons.glyphMap; text: string; actionLabel?: string; onAction?: () => void }): React.JSX.Element {
  return <View style={[styles.emptyCard, cardShadow]}><View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={ui.colors.primary} /></View><View style={{flex:1}}><Text style={styles.muted}>{text}</Text>{actionLabel && onAction ? <Pressable style={styles.emptyAction} onPress={onAction}><Ionicons name="add" size={17} color={ui.colors.primary} /><Text style={styles.emptyActionText}>{actionLabel}</Text></Pressable> : null}</View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ui.colors.background },
  content: { padding: 18, gap: 14, paddingBottom: 42, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  headerCopy: { flex: 1, minWidth: 220, gap: 3 },
  eyebrow: { fontSize: 10, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: ui.colors.primaryDark },
  muted: { color: ui.colors.muted, lineHeight: 19 },
  addButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: ui.colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addButtonText: { color: '#FFF', fontWeight: '900' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, padding: 12 },
  summaryNumber: { color: ui.colors.primaryDark, fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: ui.colors.muted, fontSize: 11, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: ui.colors.muted, fontWeight: '700', fontSize: 12 },
  calendarCard: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: ui.colors.border },
  helper: { color: ui.colors.muted, fontSize: 11, lineHeight: 17 },
  section: { fontSize: 20, fontWeight: '900', color: ui.colors.primaryDark, marginTop: 4 },
  emptyCard: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyAction: { alignSelf: 'flex-start', marginTop: 8, minHeight: 38, borderRadius: 11, backgroundColor: ui.colors.primarySoft, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  emptyActionText: { color: ui.colors.primary, fontWeight: '900', fontSize: 12 },
  eventCard: { backgroundColor: '#FFF', borderRadius: 17, borderWidth: 1, borderColor: ui.colors.border, padding: 14, gap: 10 },
  eventMain: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  eventIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  bold: { fontWeight: '900', color: ui.colors.text, fontSize: 14 },
  eventMeta: { color: ui.colors.muted, fontSize: 12, marginTop: 3 },
  expanded: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.colors.border, paddingTop: 11, gap: 4 },
  detailLabel: { color: ui.colors.muted, fontWeight: '800', fontSize: 10, textTransform: 'uppercase', letterSpacing: .7, marginTop: 4 },
  detailText: { color: ui.colors.text, lineHeight: 20 },
  reviewEventButton: { marginTop: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: ui.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewEventText: { color: '#FFF', fontWeight: '900' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusPending: { backgroundColor: ui.colors.warningSoft }, statusPendingText: { color: ui.colors.warning },
  statusConfirmed: { backgroundColor: '#E7F7ED' }, statusConfirmedText: { color: '#23824A' },
  statusRejected: { backgroundColor: ui.colors.dangerSoft }, statusRejectedText: { color: ui.colors.danger },
  statusText: { fontSize: 9, fontWeight: '900' },
  requestCard: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, padding: 16, borderWidth: 1, borderColor: ui.colors.border, gap: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pendingPill: { backgroundColor: ui.colors.warningSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  pendingText: { color: ui.colors.warning, fontWeight: '900', fontSize: 11 },
  swapBox: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 11, borderRadius: 12, backgroundColor: ui.colors.input },
  swap: { fontWeight: '800', color: ui.colors.text },
  note: { fontStyle: 'italic', color: ui.colors.muted },
  actions: { flexDirection: 'row', gap: 10 },
  reject: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.md, backgroundColor: ui.colors.dangerSoft, borderWidth: 1, borderColor: '#F8CAD3' },
  rejectText: { color: ui.colors.danger, fontWeight: '900' },
  accept: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.md, backgroundColor: ui.colors.primary },
  acceptText: { color: '#FFF', fontWeight: '900' },
  cancel: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.md, backgroundColor: ui.colors.input },
  cancelText: { color: ui.colors.text, fontWeight: '900' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,50,103,.35)' },
  centerBackdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(10,50,103,.35)' },
  modal: { maxHeight: '92%', backgroundColor: ui.colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  responseModal: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 22, padding: 20, gap: 12 },
  dayModal: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 24, padding: 20, gap: 12 },
  dayModalSubtitle: { color: ui.colors.muted, fontSize: 13 },
  dayChildrenList: { gap: 8, marginVertical: 3 },
  dayChildRow: { minHeight: 48, borderRadius: 13, backgroundColor: ui.colors.input, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dayRoleDot: { width: 10, height: 10, borderRadius: 5 },
  dayChildName: { flex: 1, color: ui.colors.text, fontWeight: '900' },
  dayChildRole: { color: ui.colors.muted, fontWeight: '900' },
  fatherText: { color: ROLE_COLORS.father },
  motherText: { color: ROLE_COLORS.mother },
  dayPrimaryAction: { minHeight: 50, borderRadius: 14, backgroundColor: ui.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dayPrimaryText: { color: '#FFF', fontWeight: '900' },
  daySecondaryAction: { minHeight: 50, borderRadius: 14, backgroundColor: ui.colors.primarySoft, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  daySecondaryText: { color: ui.colors.primary, fontWeight: '900' },
  modalScroll: { gap: 11, paddingBottom: 8 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: ui.colors.primaryDark },
  closeButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '800', color: ui.colors.text, fontSize: 12 },
  input: { minHeight: 50, borderWidth: 1, borderColor: ui.colors.border, borderRadius: ui.radius.md, paddingHorizontal: 13, backgroundColor: ui.colors.input, color: ui.colors.text },
  notes: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: ui.colors.primarySoft },
  chipText: { color: ui.colors.primaryDark, fontWeight: '700' },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typeChip: { minHeight: 35, borderRadius: 999, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ui.colors.primarySoft, borderWidth: 1, borderColor: ui.colors.border },
  typeChipActive: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary },
  typeChipText: { color: ui.colors.primaryDark, fontSize: 11, fontWeight: '800' },
  typeChipTextActive: { color: '#FFF' },
  twoCols: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 5 },
  approvalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 13, backgroundColor: ui.colors.input },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  checkboxActive: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary },
  primaryButton: { minHeight: 50, borderRadius: 14, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { color: '#FFF', fontWeight: '900' },
});
