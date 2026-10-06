import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
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
import type { FamilyChild, FamilyChildInput } from '../types/models';

const emptyForm: FamilyChildInput = {
  displayName: '', birthDate: null, school: null, className: null, sports: null,
  extracurricular: null, usefulInfo: null, authorizations: null, sharedNotes: null,
};

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Data di nascita non indicata';
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('it-IT');
}

export function ChildrenScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [items, setItems] = useState<FamilyChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<FamilyChild | null>(null);
  const [form, setForm] = useState<FamilyChildInput>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [showIosDate, setShowIosDate] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.family.children()); }
    catch (error) { Alert.alert('Figli', error instanceof Error ? error.message : 'Impossibile caricare i figli.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openEditor = (child?: FamilyChild): void => {
    setEditing(child ?? null);
    setForm(child ? {
      displayName: child.displayName,
      birthDate: child.birthDate,
      school: child.school ?? null,
      className: child.className ?? null,
      sports: child.sports ?? null,
      extracurricular: child.extracurricular ?? null,
      usefulInfo: child.usefulInfo ?? null,
      authorizations: child.authorizations ?? null,
      sharedNotes: child.sharedNotes ?? null,
    } : emptyForm);
    setModalOpen(true);
  };

  const openDatePicker = (): void => {
    const current = form.birthDate ? new Date(`${form.birthDate}T12:00:00`) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        maximumDate: new Date(),
        mode: 'date',
        onChange: (_event, selected) => { if (selected) setForm((value) => ({ ...value, birthDate: isoDate(selected) })); },
      });
    } else setShowIosDate(true);
  };

  const save = async (): Promise<void> => {
    if (!form.displayName.trim()) { Alert.alert('Nome richiesto', 'Inserisci il nome del figlio.'); return; }
    setSaving(true);
    try {
      if (editing) await api.family.updateChild(editing.id, form);
      else await api.family.createChild(form);
      setModalOpen(false);
      await load();
    } catch (error) {
      Alert.alert('Figli', error instanceof Error ? error.message : 'Impossibile salvare la scheda.');
    } finally { setSaving(false); }
  };

  const columns = useMemo(() => wide ? styles.gridWide : undefined, [wide]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FAMIGLIA</Text>
          <Text style={styles.title}>Figli</Text>
          <Text style={styles.subtitle}>Informazioni condivise, scuola, sport e note utili.</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => openEditor()}>
          <Ionicons name="add" size={20} color="#FFF" /><Text style={styles.primaryButtonText}>Aggiungi</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={ui.colors.primary} /> : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.grid, columns]}>
            {items.map((child) => (
              <Pressable key={child.id} onPress={() => openEditor(child)} style={[styles.card, wide && styles.cardWide]}>
                <View style={styles.avatar}><Ionicons name="happy-outline" size={28} color={ui.colors.primary} /></View>
                <View style={styles.cardContent}>
                  <Text style={styles.childName}>{child.displayName}</Text>
                  <Text style={styles.meta}>{formatDate(child.birthDate)}</Text>
                  {child.school ? <Text style={styles.detail}><Ionicons name="school-outline" size={14} /> {child.school}{child.className ? ` · ${child.className}` : ''}</Text> : null}
                  {child.sports ? <Text style={styles.detail}><Ionicons name="football-outline" size={14} /> {child.sports}</Text> : null}
                  {child.extracurricular ? <Text style={styles.detail} numberOfLines={2}>{child.extracurricular}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={ui.colors.muted} />
              </Pressable>
            ))}
          </View>
          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={38} color={ui.colors.primary} />
              <Text style={styles.emptyTitle}>Nessun figlio inserito</Text>
              <Text style={styles.emptyText}>Aggiungi la prima scheda per collegare calendario, documenti e spese.</Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, wide && styles.modalCardWide]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Modifica scheda' : 'Aggiungi un figlio'}</Text>
              <Pressable onPress={() => setModalOpen(false)} style={styles.closeButton}><Ionicons name="close" size={22} color={ui.colors.text} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Field label="Nome *" value={form.displayName} onChangeText={(displayName) => setForm((v) => ({ ...v, displayName }))} placeholder="Nome del figlio" />
              <Text style={styles.label}>Data di nascita</Text>
              <Pressable style={styles.dateField} onPress={openDatePicker}>
                <Ionicons name="calendar-outline" size={18} color={ui.colors.primary} />
                <Text style={styles.dateText}>{form.birthDate ? formatDate(form.birthDate) : 'Seleziona la data'}</Text>
              </Pressable>
              {Platform.OS === 'ios' && showIosDate ? (
                <View style={styles.iosPickerWrap}>
                  <DateTimePicker value={form.birthDate ? new Date(`${form.birthDate}T12:00:00`) : new Date()} mode="date" maximumDate={new Date()} display="spinner" onChange={(_e, d) => { if (d) setForm((v) => ({ ...v, birthDate: isoDate(d) })); }} />
                  <Pressable onPress={() => setShowIosDate(false)}><Text style={styles.doneText}>Fatto</Text></Pressable>
                </View>
              ) : null}
              <Field label="Scuola" value={form.school ?? ''} onChangeText={(school) => setForm((v) => ({ ...v, school }))} placeholder="Nome della scuola" />
              <Field label="Classe" value={form.className ?? ''} onChangeText={(className) => setForm((v) => ({ ...v, className }))} placeholder="Es. 4D" />
              <Field label="Sport" value={form.sports ?? ''} onChangeText={(sports) => setForm((v) => ({ ...v, sports }))} placeholder="Attività sportive" />
              <Field label="Attività extrascolastiche" value={form.extracurricular ?? ''} onChangeText={(extracurricular) => setForm((v) => ({ ...v, extracurricular }))} placeholder="Musica, corsi, attività…" multiline />
              <Field label="Informazioni utili" value={form.usefulInfo ?? ''} onChangeText={(usefulInfo) => setForm((v) => ({ ...v, usefulInfo }))} placeholder="Informazioni condivise" multiline />
              <Field label="Autorizzazioni" value={form.authorizations ?? ''} onChangeText={(authorizations) => setForm((v) => ({ ...v, authorizations }))} placeholder="Autorizzazioni e consensi" multiline />
              <Field label="Note condivise" value={form.sharedNotes ?? ''} onChangeText={(sharedNotes) => setForm((v) => ({ ...v, sharedNotes }))} placeholder="Note visibili a Mamma e Papà" multiline />
              <Pressable disabled={saving} onPress={() => void save()} style={[styles.saveButton, saving && { opacity: 0.6 }]}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Salva scheda</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }): React.JSX.Element {
  return <View style={styles.fieldWrap}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#6C84A2" multiline={multiline} style={[styles.input, multiline && styles.textarea]} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  eyebrow: { fontSize: 11, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1.1 },
  title: { fontSize: 30, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { marginTop: 3, color: ui.colors.muted, fontSize: 14 },
  primaryButton: { minHeight: 46, borderRadius: 14, paddingHorizontal: 16, backgroundColor: ui.colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6 },
  primaryButtonText: { color: '#FFF', fontWeight: '900' },
  content: { padding: 18, paddingBottom: 36 },
  grid: { gap: 12 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { ...cardShadow, backgroundColor: ui.colors.card, borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardWide: { width: '48.8%', minWidth: 310 },
  avatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, gap: 4 },
  childName: { fontSize: 19, fontWeight: '900', color: ui.colors.primaryDark },
  meta: { fontSize: 13, color: ui.colors.muted },
  detail: { fontSize: 13, color: ui.colors.text, lineHeight: 19 },
  emptyCard: { marginTop: 12, backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 16, padding: 26, alignItems: 'center', gap: 8 },
  emptyTitle: { fontWeight: '900', fontSize: 18, color: ui.colors.primaryDark },
  emptyText: { textAlign: 'center', color: ui.colors.muted, lineHeight: 20 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,50,103,0.22)', justifyContent: 'flex-end', alignItems: 'center' },
  modalCard: { width: '100%', maxHeight: '92%', backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  modalCardWide: { maxWidth: 680, borderRadius: 24, marginBottom: 24 },
  modalHeader: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 21, fontWeight: '900', color: ui.colors.primaryDark },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center' },
  form: { paddingHorizontal: 20, paddingBottom: 30, gap: 12 },
  fieldWrap: { gap: 6 },
  label: { fontSize: 12, fontWeight: '800', color: ui.colors.text },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: ui.colors.input, paddingHorizontal: 14, color: '#202124', fontSize: 15 },
  textarea: { minHeight: 88, paddingTop: 14, textAlignVertical: 'top' },
  dateField: { minHeight: 50, borderRadius: 12, backgroundColor: ui.colors.input, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: { color: '#202124', fontSize: 15 },
  iosPickerWrap: { backgroundColor: ui.colors.primarySoft, borderRadius: 14, overflow: 'hidden', paddingBottom: 10 },
  doneText: { textAlign: 'center', color: ui.colors.primary, fontWeight: '900', padding: 8 },
  saveButton: { minHeight: 52, marginTop: 6, borderRadius: 14, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
