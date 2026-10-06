import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import type { AgreementCategory, FamilyAgreement } from '../types/models';

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

function roleLabel(role: 'father' | 'mother' | undefined): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Genitore';
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

  const load = useCallback(async () => {
    try { setItems(await api.agreements.list()); }
    catch (error) { Alert.alert('Accordi', error instanceof Error ? error.message : 'Impossibile caricare gli accordi.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DECISIONI CONDIVISE</Text>
          <Text style={styles.title}>Accordi</Text>
          <Text style={styles.subtitle}>Proposte, risposte e storico tra Mamma e Papà.</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => setCreateOpen(true)}><Ionicons name="add" size={20} color="#FFF" /><Text style={styles.primaryButtonText}>Nuovo</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{pending}</Text><Text style={styles.summaryLabel}>In attesa di risposta</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{items.filter((i) => i.status === 'approved').length}</Text><Text style={styles.summaryLabel}>Accettati</Text></View>
        </View>

        {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={ui.colors.primary} /> : (
          <View style={[styles.list, wide && styles.listWide]}>
            {items.map((item) => {
              const state = statusInfo(item.status);
              const category = categories.find((c) => c.key === item.category) ?? categories[categories.length - 1]!;
              return (
                <View key={item.id} style={[styles.card, wide && styles.cardWide]}>
                  <View style={styles.cardTop}>
                    <View style={styles.categoryIcon}><Ionicons name={category.icon} size={20} color={ui.colors.primary} /></View>
                    <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardMeta}>Proposto da {roleLabel(item.createdByRole)} · {new Date(item.createdAt).toLocaleDateString('it-IT')}</Text></View>
                    <View style={[styles.statusPill, { backgroundColor: state.bg }]}><Text style={[styles.statusText, { color: state.fg }]}>{state.label}</Text></View>
                  </View>
                  <Text style={styles.cardBody}>{item.body}</Text>
                  {item.responseNote ? <View style={styles.responseBox}><Text style={styles.responseLabel}>RISPOSTA</Text><Text style={styles.responseText}>{item.responseNote}</Text></View> : null}
                  {item.canRespond ? <Pressable style={styles.respondButton} onPress={() => setResponding(item)}><Text style={styles.respondButtonText}>Rispondi alla proposta</Text><Ionicons name="chevron-forward" size={18} color={ui.colors.primary} /></Pressable> : null}
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
              <View style={styles.categoryGrid}>{categories.map((c) => <Pressable key={c.key} onPress={() => setSelectedCategory(c.key)} style={[styles.categoryChoice, selectedCategory === c.key && styles.categoryChoiceActive]}><Ionicons name={c.icon} size={18} color={selectedCategory === c.key ? ui.colors.primary : ui.colors.muted} /><Text style={[styles.categoryChoiceText, selectedCategory === c.key && { color: ui.colors.primary }]}>{c.label}</Text></Pressable>)}</View>
              <Text style={styles.label}>Titolo</Text><TextInput value={title} onChangeText={setTitle} placeholder="Es. Vacanze di Natale" placeholderTextColor={ui.colors.muted} style={styles.input} />
              <Text style={styles.label}>Proposta</Text><TextInput value={body} onChangeText={setBody} placeholder="Descrivi in modo chiaro cosa proponi…" placeholderTextColor={ui.colors.muted} multiline style={[styles.input, styles.textarea]} />
              <Pressable disabled={saving} onPress={() => void createAgreement()} style={styles.saveButton}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Invia proposta</Text>}</Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(responding)} transparent animationType="fade" onRequestClose={() => setResponding(null)}>
        <View style={styles.centerBackdrop}><View style={styles.responseModal}>
          <Text style={styles.modalTitle}>Rispondi all’accordo</Text>
          <Text style={styles.responseHeading}>{responding?.title}</Text>
          <TextInput value={responseNote} onChangeText={setResponseNote} placeholder="Nota facoltativa o modifica richiesta…" placeholderTextColor={ui.colors.muted} multiline style={[styles.input, styles.textareaSmall]} />
          <Pressable onPress={() => void respond('approved')} style={[styles.decisionButton, { backgroundColor: ui.colors.success }]}><Text style={styles.decisionText}>Accetta</Text></Pressable>
          <Pressable onPress={() => void respond('changes_requested')} style={[styles.decisionButton, { backgroundColor: ui.colors.warning }]}><Text style={styles.decisionText}>Richiedi modifiche</Text></Pressable>
          <Pressable onPress={() => void respond('rejected')} style={[styles.decisionButton, { backgroundColor: ui.colors.danger }]}><Text style={styles.decisionText}>Rifiuta</Text></Pressable>
          <Pressable onPress={() => setResponding(null)} style={styles.cancel}><Text style={styles.cancelText}>Annulla</Text></Pressable>
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
  content: { padding: 18, paddingBottom: 36, gap: 14 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: ui.colors.card, borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 16 },
  summaryNumber: { fontSize: 26, fontWeight: '900', color: ui.colors.primary },
  summaryLabel: { color: ui.colors.muted, fontSize: 12, marginTop: 3 },
  list: { gap: 12 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { ...cardShadow, backgroundColor: '#FFF', borderWidth: 1, borderColor: ui.colors.border, borderRadius: 16, padding: 16, gap: 12 },
  cardWide: { width: '48.9%', minWidth: 360 },
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
  respondButton: { minHeight: 44, borderRadius: 12, backgroundColor: ui.colors.primarySoft, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
});
