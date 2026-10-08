import { useLiveRefresh } from '../services/live';
import { SafeModal as Modal } from '../components/SafeModal';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { AgreementCategory, AgreementHistoryItem, FamilyAgreement, ParentRole } from '../types/models';

const categories: Array<{ key: AgreementCategory; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'calendar', label: 'Calendario', icon: 'calendar-outline' },
  { key: 'vacation', label: 'Vacanze', icon: 'sunny-outline' },
  { key: 'expense', label: 'Spese', icon: 'wallet-outline' },
  { key: 'school', label: 'Scuola', icon: 'school-outline' },
  { key: 'sport', label: 'Sport', icon: 'football-outline' },
  { key: 'medical', label: 'Visite mediche', icon: 'medkit-outline' },
  { key: 'organization', label: 'Organizzazione', icon: 'people-outline' },
  { key: 'other', label: 'Altro', icon: 'document-text-outline' },
];

function statusInfo(status: FamilyAgreement['status']): { label: string; bg: string; fg: string } {
  if (status === 'approved') return { label: 'Accettato', bg: ui.colors.successSoft, fg: ui.colors.success };
  if (status === 'rejected') return { label: 'Rifiutato', bg: ui.colors.dangerSoft, fg: ui.colors.danger };
  if (status === 'changes_requested') return { label: 'Modifiche richieste', bg: ui.colors.warningSoft, fg: ui.colors.warning };
  return { label: 'In attesa', bg: ui.colors.primarySoft, fg: ui.colors.primary };
}

function roleLabel(role: ParentRole | null | undefined): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Account non disponibile';
}

function historyActionLabel(action: string): string {
  if (action === 'created') return 'Proposta creata';
  if (action === 'approved') return 'Accordo accettato';
  if (action === 'rejected') return 'Accordo rifiutato';
  if (action === 'changes_requested') return 'Modifiche richieste';
  if (action === 'updated') return 'Accordo modificato';
  return action.replace(/_/g, ' ');
}

function snapshotSummary(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const value = snapshot as Record<string, unknown>;
  if (typeof value.responseNote === 'string' && value.responseNote.trim()) return value.responseNote;
  if (typeof value.note === 'string' && value.note.trim()) return value.note;
  if (typeof value.body === 'string' && value.body.trim()) return value.body;
  if (typeof value.title === 'string' && value.title.trim()) return value.title;
  return null;
}

export function AgreementsScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const [items, setItems] = useState<FamilyAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AgreementCategory>('organization');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [responding, setResponding] = useState<FamilyAgreement | null>(null);
  const [responseNote, setResponseNote] = useState('');
  const [historyFor, setHistoryFor] = useState<FamilyAgreement | null>(null);
  const [historyItems, setHistoryItems] = useState<AgreementHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.agreements.list()); }
    catch (error) { Alert.alert('Accordi', error instanceof Error ? error.message : 'Impossibile caricare gli accordi.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);

  const pending = useMemo(() => items.filter((item) => item.status === 'pending').length, [items]);

  const createAgreement = async (): Promise<void> => {
    if (!title.trim() || !body.trim()) { Alert.alert('Dati mancanti', 'Inserisci titolo e contenuto dell’accordo.'); return; }
    setSaving(true);
    try {
      await api.agreements.create({ category: selectedCategory, title: title.trim(), body: body.trim() });
      setTitle(''); setBody(''); setCreateOpen(false); await load();
    } catch (error) { Alert.alert('Accordi', error instanceof Error ? error.message : 'Creazione non riuscita.'); }
    finally { setSaving(false); }
  };

  const respond = async (status: 'approved' | 'rejected' | 'changes_requested'): Promise<void> => {
    if (!responding) return;
    setSaving(true);
    try {
      await api.agreements.respond(responding.id, status, responseNote.trim() || null);
      setResponding(null); setResponseNote(''); await load();
    } catch (error) { Alert.alert('Accordi', error instanceof Error ? error.message : 'Risposta non riuscita.'); }
    finally { setSaving(false); }
  };

  const openHistory = async (item: FamilyAgreement): Promise<void> => {
    setHistoryFor(item);
    setHistoryItems([]);
    setHistoryLoading(true);
    try { setHistoryItems(await api.agreements.history(item.id)); }
    catch (error) { Alert.alert('Storico accordo', error instanceof Error ? error.message : 'Impossibile caricare lo storico.'); setHistoryFor(null); }
    finally { setHistoryLoading(false); }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DECISIONI CONDIVISE</Text>
          <Text style={styles.title}>Accordi</Text>
          <Text style={styles.subtitle}>Proposte, risposte e storico tra Mamma e Papà. Le accettazioni registrano azioni nell’app e non sostituiscono provvedimenti giudiziari o accordi formalizzati nelle forme richieste dalla legge.</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => setCreateOpen(true)}><Ionicons name="add" size={20} color="#FFF" /><Text style={styles.primaryButtonText}>Nuovo</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{pending}</Text><Text style={styles.summaryLabel}>In attesa di risposta</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{items.filter((item) => item.status === 'approved').length}</Text><Text style={styles.summaryLabel}>Accettati</Text></View>
        </View>

        {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={ui.colors.primary} /> : (
          <View style={[styles.list, wide && styles.listWide]}>
            {items.map((item) => {
              const state = statusInfo(item.status);
              const category = categories.find((entry) => entry.key === item.category) ?? categories[categories.length - 1]!;
              return (
                <View key={item.id} style={[styles.card, wide && styles.cardWide]}>
                  <View style={styles.cardTop}>
                    <View style={styles.categoryIcon}><Ionicons name={category.icon} size={20} color={ui.colors.primary} /></View>
                    <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardMeta}>Proposto da {roleLabel(item.createdByRole)} · {new Date(item.createdAt).toLocaleDateString('it-IT')}</Text></View>
                    <View style={[styles.statusPill, { backgroundColor: state.bg }]}><Text style={[styles.statusText, { color: state.fg }]}>{state.label}</Text></View>
                  </View>
                  <Text style={styles.cardBody}>{item.body}</Text>
                  {item.responseNote ? <View style={styles.responseBox}><Text style={styles.responseLabel}>RISPOSTA</Text><Text style={styles.responseText}>{item.responseNote}</Text></View> : null}
                  <View style={styles.cardActions}>
                    <Pressable style={styles.historyButton} onPress={() => void openHistory(item)}><Ionicons name="time-outline" size={18} color={ui.colors.primary} /><Text style={styles.historyButtonText}>Storico</Text></Pressable>
                    {item.canRespond ? <Pressable style={styles.respondButton} onPress={() => setResponding(item)}><Text style={styles.respondButtonText}>Rispondi</Text><Ionicons name="chevron-forward" size={18} color={ui.colors.primary} /></Pressable> : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!loading && items.length === 0 ? <View style={styles.empty}><Ionicons name="document-text-outline" size={38} color={ui.colors.primary} /><Text style={styles.emptyTitle}>Nessun accordo</Text><Text style={styles.emptyText}>Le decisioni condivise compariranno qui con il loro storico.</Text></View> : null}
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, wide && styles.modalWide]}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Nuovo accordo</Text><Pressable onPress={() => setCreateOpen(false)}><Ionicons name="close" size={24} color={ui.colors.text} /></Pressable></View>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Categoria</Text>
              <View style={styles.categoryGrid}>{categories.map((category) => <Pressable key={category.key} onPress={() => setSelectedCategory(category.key)} style={[styles.categoryChoice, selectedCategory === category.key && styles.categoryChoiceActive]}><Ionicons name={category.icon} size={18} color={selectedCategory === category.key ? ui.colors.primary : ui.colors.muted} /><Text style={[styles.categoryChoiceText, selectedCategory === category.key && { color: ui.colors.primary }]}>{category.label}</Text></Pressable>)}</View>
              <Text style={styles.label}>Titolo</Text><TextInput value={title} onChangeText={setTitle} placeholder="Es. Vacanze di Natale" placeholderTextColor={ui.colors.muted} style={styles.input} />
              <Text style={styles.label}>Proposta</Text><TextInput value={body} onChangeText={setBody} placeholder="Descrivi in modo chiaro cosa proponi…" placeholderTextColor={ui.colors.muted} multiline style={[styles.input, styles.textarea]} />

            </ScrollView>
            <View style={{padding:16}}>              <Pressable disabled={saving} onPress={() => void createAgreement()} style={styles.saveButton}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Invia proposta</Text>}</Pressable></View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(responding)} transparent animationType="fade" onRequestClose={() => setResponding(null)}>
        <View style={styles.centerBackdrop}><View style={styles.responseModal}>
          <Text style={styles.modalTitle}>Rispondi all’accordo</Text>
          <Text style={styles.responseHeading}>{responding?.title}</Text>
          <TextInput value={responseNote} onChangeText={setResponseNote} placeholder="Nota facoltativa o modifica richiesta…" placeholderTextColor={ui.colors.muted} multiline style={[styles.input, styles.textareaSmall]} />
          <Pressable disabled={saving} onPress={() => void respond('approved')} style={[styles.decisionButton, { backgroundColor: ui.colors.success }]}><Text style={styles.decisionText}>Accetta</Text></Pressable>
          <Pressable disabled={saving} onPress={() => void respond('changes_requested')} style={[styles.decisionButton, { backgroundColor: ui.colors.warning }]}><Text style={styles.decisionText}>Richiedi modifiche</Text></Pressable>
          <Pressable disabled={saving} onPress={() => void respond('rejected')} style={[styles.decisionButton, { backgroundColor: ui.colors.danger }]}><Text style={styles.decisionText}>Rifiuta</Text></Pressable>
          <Pressable onPress={() => setResponding(null)} style={styles.cancel}><Text style={styles.cancelText}>Annulla</Text></Pressable>
        </View></View>
      </Modal>

      <Modal visible={Boolean(historyFor)} transparent animationType="fade" onRequestClose={() => setHistoryFor(null)}>
        <View style={styles.centerBackdrop}><View style={styles.historyModal}>
          <View style={styles.historyHeader}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Storico accordo</Text><Text numberOfLines={1} style={styles.responseHeading}>{historyFor?.title}</Text></View><Pressable style={styles.closeButton} onPress={() => setHistoryFor(null)}><Ionicons name="close" size={22} color={ui.colors.text} /></Pressable></View>
          {historyLoading ? <ActivityIndicator style={{ marginVertical: 40 }} color={ui.colors.primary} /> : (
            <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyList}>
              {historyItems.length === 0 ? <View style={styles.historyEmpty}><Ionicons name="time-outline" size={30} color={ui.colors.primary} /><Text style={styles.emptyTitle}>Nessuna voce disponibile</Text></View> : historyItems.map((entry, index) => {
                const summary = snapshotSummary(entry.snapshot);
                return <View key={entry.id} style={[styles.historyRow, index < historyItems.length - 1 && styles.historyDivider]}>
                  <View style={styles.historyDot}><Ionicons name="checkmark" size={14} color="#FFF" /></View>
                  <View style={{ flex: 1 }}><View style={styles.historyTitleRow}><Text style={styles.historyTitle}>{historyActionLabel(entry.action)}</Text><Text style={styles.historyDate}>{new Date(entry.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text></View><Text style={styles.historyActor}>{entry.actorName ?? 'Account non disponibile'} · {roleLabel(entry.actorRole)}</Text>{summary ? <Text style={styles.historySummary}>{summary}</Text> : null}</View>
                </View>;
              })}
            </ScrollView>
          )}
          <View style={styles.integrityNotice}><Ionicons name="shield-checkmark-outline" size={19} color={ui.colors.primary} /><Text style={styles.integrityText}>Lo storico dell’accordo è registrato in modalità append-only.</Text></View>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 16 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: ui.colors.orange },
  title: { fontSize: 30, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { marginTop: 3, color: ui.colors.muted },
  primaryButton: { minHeight: 46, borderRadius: 14, backgroundColor: ui.colors.primary, paddingHorizontal: 16, flexDirection: 'row', gap: 6, alignItems: 'center' },
  primaryButtonText: { color: '#FFF', fontWeight: '900' },
  content: { padding: 18, paddingBottom: 36, gap: 14, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: ui.colors.card, borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 16 },
  summaryNumber: { fontSize: 26, fontWeight: '900', color: ui.colors.primary },
  summaryLabel: { color: ui.colors.muted, fontSize: 12, marginTop: 3 },
  list: { gap: 12 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { ...cardShadow, backgroundColor: '#FFF', borderWidth: 1, borderColor: ui.colors.border, borderRadius: 16, padding: 16, gap: 12 },
  cardWide: { width: '48.9%', minWidth: 330 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '900', color: ui.colors.primaryDark },
  cardMeta: { fontSize: 11, color: ui.colors.muted, marginTop: 2 },
  statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { fontSize: 10, fontWeight: '900' },
  cardBody: { color: '#202124', lineHeight: 21 },
  responseBox: { backgroundColor: ui.colors.input, borderRadius: 12, padding: 11, gap: 3 },
  responseLabel: { fontSize: 9, fontWeight: '900', color: ui.colors.muted, letterSpacing: 1 },
  responseText: { color: '#202124' },
  cardActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  historyButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 13, backgroundColor: '#FFF', borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyButtonText: { color: ui.colors.primary, fontWeight: '900' },
  respondButton: { minHeight: 42, borderRadius: 12, backgroundColor: ui.colors.primarySoft, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 6 },
  respondButtonText: { color: ui.colors.primary, fontWeight: '900' },
  empty: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 26, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: ui.colors.primaryDark },
  emptyText: { color: ui.colors.muted, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,50,103,0.26)', justifyContent: 'flex-end', alignItems: 'center' },
  centerBackdrop: { flex: 1, backgroundColor: 'rgba(10,50,103,0.26)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalCard: { width: '100%', maxHeight: '92%', backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalWide: { maxWidth: 700, borderRadius: 24, marginBottom: 22 },
  modalHeader: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 21, fontWeight: '900', color: ui.colors.primaryDark },
  form: { paddingHorizontal: 20, paddingBottom: 30, gap: 10 },
  label: { fontSize: 12, fontWeight: '900', color: ui.colors.text },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryChoice: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: ui.colors.input, flexDirection: 'row', gap: 5, alignItems: 'center' },
  categoryChoiceActive: { backgroundColor: ui.colors.primarySoft, borderWidth: 1, borderColor: ui.colors.primary },
  categoryChoiceText: { color: ui.colors.muted, fontWeight: '800', fontSize: 12 },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: ui.colors.input, color: '#202124', paddingHorizontal: 14 },
  textarea: { minHeight: 150, paddingTop: 13, textAlignVertical: 'top' },
  textareaSmall: { minHeight: 95, paddingTop: 13, textAlignVertical: 'top' },
  saveButton: { minHeight: 52, borderRadius: 14, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { color: '#FFF', fontWeight: '900' },
  responseModal: { width: '100%', maxWidth: 520, backgroundColor: '#FFF', borderRadius: 22, padding: 20, gap: 10 },
  responseHeading: { color: ui.colors.muted, fontWeight: '800' },
  decisionButton: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  decisionText: { color: '#FFF', fontWeight: '900' },
  cancel: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: ui.colors.muted, fontWeight: '800' },
  historyModal: { width: '100%', maxWidth: 620, maxHeight: '82%', backgroundColor: '#FFF', borderRadius: 22, padding: 18, gap: 10 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  closeButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center' },
  historyScroll: { flexGrow: 0 },
  historyList: { paddingVertical: 4 },
  historyRow: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  historyDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.colors.border },
  historyDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' },
  historyTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  historyTitle: { color: ui.colors.primaryDark, fontWeight: '900' },
  historyDate: { color: ui.colors.muted, fontSize: 10 },
  historyActor: { color: ui.colors.muted, fontSize: 11, marginTop: 2 },
  historySummary: { color: ui.colors.text, fontSize: 12, lineHeight: 18, marginTop: 4 },
  historyEmpty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  integrityNotice: { backgroundColor: ui.colors.primarySoft, borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  integrityText: { flex: 1, color: ui.colors.text, fontSize: 11, lineHeight: 17 },
});
