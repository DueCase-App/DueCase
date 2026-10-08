import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AttachmentSourceSheet, type PickedAttachment } from '../components/AttachmentSourceSheet';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { ExpenseCategory, FamilyChild } from '../types/models';

const categories: ExpenseCategory[] = ['Scuola', 'Salute', 'Sport', 'Svago'];

type Props = {
  childrenList: FamilyChild[];
  onClose: () => void;
  onDone: () => void;
};

export function NewExpensePage({ childrenList, onClose, onDone }: Props): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Scuola');
  const [notes, setNotes] = useState('');
  const [isExtraordinary, setIsExtraordinary] = useState(false);
  const [fatherPercentage, setFatherPercentage] = useState('50');
  const [motherPercentage, setMotherPercentage] = useState('50');
  const [childIds, setChildIds] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<PickedAttachment | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasChanges = useMemo(() => Boolean(
    title.trim() || amount.trim() || notes.trim() || childIds.length || receipt || isExtraordinary ||
    category !== 'Scuola' || fatherPercentage !== '50' || motherPercentage !== '50'
  ), [title, amount, notes, childIds, receipt, isExtraordinary, category, fatherPercentage, motherPercentage]);

  const totalPercentage = (Number(fatherPercentage.replace(',', '.')) || 0) + (Number(motherPercentage.replace(',', '.')) || 0);

  const closePage = (): void => {
    if (!hasChanges) {
      onClose();
      return;
    }
    Alert.alert(
      'Uscire dalla nuova spesa?',
      'Hai già inserito dei dati. Se esci adesso verranno scartati.',
      [
        { text: 'Continua a compilare', style: 'cancel' },
        { text: 'Esci senza salvare', style: 'destructive', onPress: onClose },
      ],
    );
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pickerOpen) return false;
      closePage();
      return true;
    });
    return () => subscription.remove();
  });

  const toggleChild = (id: string): void => {
    setChildIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  async function save(): Promise<void> {
    const normalized = amount.trim().replace(',', '.');
    const father = Number(fatherPercentage.replace(',', '.'));
    const mother = Number(motherPercentage.replace(',', '.'));

    if (!title.trim()) {
      Alert.alert('Nuova spesa', 'Inserisci una descrizione.');
      return;
    }
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
      Alert.alert('Nuova spesa', 'Inserisci un importo valido.');
      return;
    }
    if (!Number.isFinite(father) || !Number.isFinite(mother) || father < 0 || mother < 0 || Math.abs(father + mother - 100) > 0.001) {
      Alert.alert('Ripartizione', 'Le quote di Papà e Mamma devono sommare esattamente 100%.');
      return;
    }

    try {
      setBusy(true);
      await api.expenses.create({
        title: title.trim(),
        amount: normalized,
        category,
        notes: notes.trim() || undefined,
        isExtraordinary,
        fatherPercentage: father,
        motherPercentage: mother,
        childIds,
        receipt: receipt ?? undefined,
      });
      onDone();
    } catch (error) {
      Alert.alert('Nuova spesa', error instanceof Error ? error.message : 'Salvataggio non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Torna alle spese" onPress={closePage} style={styles.backButton}>
          <Ionicons name="arrow-back" size={23} color={ui.colors.primaryDark} />
        </Pressable>
        <View style={styles.topbarCopy}>
          <Text style={styles.title}>Nuova spesa</Text>
          <Text style={styles.subtitle}>Compila i dati e inviala all’altro genitore.</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.section, cardShadow]}>
          <Text style={styles.sectionTitle}>Dettagli</Text>
          <Text style={styles.label}>Descrizione</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Es. Farmacia, libri scolastici…"
            placeholderTextColor={ui.colors.muted}
            returnKeyType="next"
          />

          <Text style={styles.label}>Importo (€)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0,00"
            placeholderTextColor={ui.colors.muted}
          />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.chips}>
            {categories.map((item) => (
              <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipSelected]}>
                <Text style={[styles.chipText, category === item && styles.chipTextSelected]}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.section, cardShadow]}>
          <Text style={styles.sectionTitle}>Figli e ripartizione</Text>
          <Text style={styles.label}>Figlio o figli interessati</Text>
          <View style={styles.chips}>
            {childrenList.length ? childrenList.map((child) => {
              const selected = childIds.includes(child.id);
              return (
                <Pressable key={child.id} onPress={() => toggleChild(child.id)} style={[styles.chip, selected && styles.chipSelected]}>
                  <Ionicons name={selected ? 'checkmark-circle' : 'person-outline'} size={16} color={selected ? ui.colors.primary : ui.colors.muted} />
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{child.displayName}</Text>
                </Pressable>
              );
            }) : <Text style={styles.muted}>Nessun figlio inserito.</Text>}
          </View>

          <Text style={styles.label}>Ripartizione</Text>
          <View style={styles.percentageRow}>
            <View style={styles.percentageField}>
              <Text style={styles.percentageLabel}>Papà %</Text>
              <TextInput style={styles.input} value={fatherPercentage} onChangeText={setFatherPercentage} keyboardType="decimal-pad" inputMode="decimal" />
            </View>
            <View style={styles.percentageField}>
              <Text style={styles.percentageLabel}>Mamma %</Text>
              <TextInput style={styles.input} value={motherPercentage} onChangeText={setMotherPercentage} keyboardType="decimal-pad" inputMode="decimal" />
            </View>
          </View>
          <Text style={[styles.percentageHint, Math.abs(totalPercentage - 100) > 0.001 && styles.percentageError]}>Totale: {totalPercentage}%</Text>
        </View>

        <View style={[styles.section, cardShadow]}>
          <View style={styles.extraordinaryToggle}>
            <View style={styles.extraordinaryCopy}>
              <Text style={styles.sectionTitle}>Spesa straordinaria</Text>
              <Text style={styles.muted}>Richiede conferma tramite codice email dell’altro genitore.</Text>
            </View>
            <Switch value={isExtraordinary} onValueChange={setIsExtraordinary} trackColor={{ false: '#D5DFEA', true: ui.colors.primary }} thumbColor="#FFF" />
          </View>

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder="Aggiungi una nota"
            placeholderTextColor={ui.colors.muted}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Ricevuta</Text>
          <Pressable style={styles.attachmentChoice} onPress={() => setPickerOpen(true)}>
            <View style={styles.attachmentChoiceIcon}>
              <Ionicons name={receipt?.type.startsWith('image/') ? 'image-outline' : 'attach-outline'} size={20} color={ui.colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.attachmentTitle}>{receipt ? receipt.name : 'Aggiungi ricevuta'}</Text>
              <Text style={styles.muted}>{receipt ? 'Tocca per sostituire' : 'Fotocamera, foto o file'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={ui.colors.muted} />
          </Pressable>
        </View>

        <Pressable disabled={busy} style={[styles.submitButton, busy && styles.disabled]} onPress={() => void save()}>
          {busy ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="paper-plane-outline" size={19} color="#FFF" /><Text style={styles.submitText}>Invia spesa</Text></>}
        </Pressable>
        <Text style={styles.footerHint}>Puoi tornare indietro in qualsiasi momento. Se hai già scritto qualcosa, DueCase ti chiederà conferma prima di scartarlo.</Text>
      </ScrollView>

      <AttachmentSourceSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPicked={(value) => setReceipt(value)}
        title="Aggiungi ricevuta"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.colors.border, backgroundColor: ui.colors.card },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  topbarCopy: { flex: 1, minWidth: 0 },
  title: { color: ui.colors.primaryDark, fontSize: 24, fontWeight: '900' },
  subtitle: { color: ui.colors.muted, fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 34, gap: 14 },
  section: { backgroundColor: ui.colors.card, borderRadius: ui.radius.lg, borderWidth: 1, borderColor: ui.colors.border, padding: 16, gap: 11 },
  sectionTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 17 },
  label: { color: ui.colors.text, fontWeight: '800', fontSize: 13 },
  input: { minHeight: 52, borderRadius: ui.radius.md, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.input, paddingHorizontal: 13, color: ui.colors.text, fontSize: 16 },
  notesInput: { minHeight: 96, paddingTop: 13 },
  muted: { color: ui.colors.muted, fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipSelected: { backgroundColor: ui.colors.primarySoft, borderColor: ui.colors.primary },
  chipText: { color: ui.colors.muted, fontWeight: '700' },
  chipTextSelected: { color: ui.colors.primary, fontWeight: '900' },
  percentageRow: { flexDirection: 'row', gap: 10 },
  percentageField: { flex: 1, gap: 5 },
  percentageLabel: { color: ui.colors.muted, fontSize: 12, fontWeight: '800' },
  percentageHint: { color: ui.colors.success, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  percentageError: { color: ui.colors.danger },
  extraordinaryToggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  extraordinaryCopy: { flex: 1, gap: 4 },
  attachmentChoice: { minHeight: 66, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  attachmentChoiceIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  attachmentTitle: { color: ui.colors.primaryDark, fontWeight: '800' },
  flex: { flex: 1, minWidth: 0 },
  submitButton: { minHeight: 54, borderRadius: ui.radius.md, backgroundColor: ui.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...cardShadow },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.55 },
  footerHint: { color: ui.colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8 },
});
