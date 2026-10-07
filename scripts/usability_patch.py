from pathlib import Path
import re

# Expenses: reuse the common photo/file/camera sheet without disturbing business logic.
p = Path('frontend/src/screens/ExpensesScreen.tsx')
s = p.read_text()
s = s.replace("import { SafeModal as Modal } from '../components/SafeModal';", "import { SafeModal as Modal } from '../components/SafeModal';\nimport { AttachmentSourceSheet, type PickedAttachment } from '../components/AttachmentSourceSheet';")
s = s.replace("import * as DocumentPicker from 'expo-document-picker';\n", "")
s = s.replace("import * as ImagePicker from 'expo-image-picker';\n", "")
s = s.replace("type Receipt = { uri: string; name: string; type: string; file?: Blob };", "type Receipt = PickedAttachment;")

s = s.replace("  const [receipt, setReceipt] = useState<Receipt | null>(null);\n  const [busy, setBusy] = useState(false);", "  const [receipt, setReceipt] = useState<Receipt | null>(null);\n  const [pickerOpen, setPickerOpen] = useState(false);\n  const [busy, setBusy] = useState(false);", 1)
s, n = re.subn(r"\n  async function fromLibrary\(\): Promise<void> \{.*?\n  async function save\(\): Promise<void> \{", "\n  async function save(): Promise<void> {", s, count=1, flags=re.S)
assert n == 1, 'expense camera/gallery functions not found'
old = '''        <Text style={styles.label}>Ricevuta</Text><View style={styles.actions}><Pressable style={styles.secondaryButton} onPress={() => void fromCamera()}><Ionicons name="camera-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Scatta foto</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => void fromLibrary()}><Ionicons name="images-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Galleria</Text></Pressable></View>
        {receipt ? <Text style={styles.muted}>Allegato: {receipt.name}</Text> : null}'''
new = '''        <Text style={styles.label}>Ricevuta</Text><Pressable style={styles.attachmentChoice} onPress={() => setPickerOpen(true)}><View style={styles.attachmentChoiceIcon}><Ionicons name={receipt?.type.startsWith('image/') ? 'image-outline' : 'attach-outline'} size={20} color={ui.colors.primary} /></View><View style={{flex:1}}><Text style={styles.secondaryText}>{receipt ? receipt.name : 'Aggiungi ricevuta'}</Text><Text style={styles.meta}>{receipt ? 'Tocca per sostituire' : 'Fotocamera, foto o file'}</Text></View><Ionicons name="chevron-forward" size={19} color={ui.colors.muted} /></Pressable>'''
assert old in s, 'expense receipt UI not found'
s = s.replace(old, new, 1)
old_close = '''      </View></View>
    </Modal>
  );
}

function PaymentModal'''
new_close = '''      </View></View>
    </Modal>
    <AttachmentSourceSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPicked={(value) => setReceipt(value)} title="Aggiungi ricevuta" />
    </>
  );
}

function PaymentModal'''
assert old_close in s, 'expense modal close not found'
s = s.replace("  return (\n    <Modal visible={visible}", "  return (\n    <>\n    <Modal visible={visible}", 1)
s = s.replace(old_close, new_close, 1)

marker = "  const [receipt, setReceipt] = useState<Receipt | null>(null);\n  const [busy, setBusy] = useState(false);"
assert marker in s, 'payment receipt state not found'
s = s.replace(marker, "  const [receipt, setReceipt] = useState<Receipt | null>(null);\n  const [pickerOpen, setPickerOpen] = useState(false);\n  const [busy, setBusy] = useState(false);", 1)
s, n = re.subn(r"\n  async function pickFile\(\): Promise<void> \{.*?\n  async function save\(\): Promise<void> \{", "\n  async function save(): Promise<void> {", s, count=1, flags=re.S)
assert n == 1, 'payment picker functions not found'
old = '''    <Text style={styles.label}>Prova di pagamento</Text><View style={styles.actions}><Pressable style={styles.secondaryButton} onPress={() => void camera()}><Ionicons name="camera-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>Foto</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => void pickFile()}><Ionicons name="document-attach-outline" size={18} color={ui.colors.primary} /><Text style={styles.secondaryText}>PDF / file</Text></Pressable></View>
    {receipt ? <Text style={styles.muted}>Allegato: {receipt.name}</Text> : null}'''
new = '''    <Text style={styles.label}>Prova di pagamento</Text><Pressable style={styles.attachmentChoice} onPress={() => setPickerOpen(true)}><View style={styles.attachmentChoiceIcon}><Ionicons name={receipt?.type.startsWith('image/') ? 'image-outline' : 'attach-outline'} size={20} color={ui.colors.primary} /></View><View style={{flex:1}}><Text style={styles.secondaryText}>{receipt ? receipt.name : 'Aggiungi prova di pagamento'}</Text><Text style={styles.meta}>{receipt ? 'Tocca per sostituire' : 'Fotocamera, foto o file'}</Text></View><Ionicons name="chevron-forward" size={19} color={ui.colors.muted} /></Pressable>'''
assert old in s, 'payment attachment UI not found'
s = s.replace(old, new, 1)
old = '''  return <Modal visible={expense !== null} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:"95%"}} contentContainerStyle={styles.paymentModal}>'''
new = '''  return <><Modal visible={expense !== null} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:"95%"}} contentContainerStyle={styles.paymentModal}>'''
assert old in s, 'payment modal return not found'
s = s.replace(old, new, 1)
old = '''  </ScrollView></View></Modal>;
}

const styles'''
new = '''  </ScrollView></View></Modal><AttachmentSourceSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPicked={(value) => setReceipt(value)} title="Aggiungi prova di pagamento" /></>;
}

const styles'''
assert old in s, 'payment modal end not found'
s = s.replace(old, new, 1)
s = s.replace("  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },", "  attachmentChoice: { minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },\n  attachmentChoiceIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },\n  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },")
p.write_text(s)

# Calendar: every day opens one coherent DueCase sheet.
p = Path('frontend/src/screens/CalendarScreen.tsx')
s = p.read_text()
state_marker = "  const [busy, setBusy] = useState(false);"
assert state_marker in s
s = s.replace(state_marker, state_marker + "\n  const [dayModalDate, setDayModalDate] = useState<string | null>(null);", 1)
start = s.index('  function openSwap(date: string): void {')
end = s.index('\n  async function sendSwap()', start)
replacement = '''  function openSwap(date: string): void {
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
'''
s = s[:start] + replacement + s[end:]
s = s.replace("      <Text style={styles.helper}>Tocca un giorno con l’altro genitore per proporre un cambio; tocca un tuo giorno o un giorno libero per aggiungere un evento.</Text>", "      <Text style={styles.helper}>Tocca qualsiasi giorno per vedere con chi sono i figli, creare un evento o proporre un cambio.</Text>")
s = s.replace("{events.length === 0 ? <EmptyCard icon=\"calendar-outline\" text=\"Nessun evento in questo mese.\" />", "{events.length === 0 ? <EmptyCard icon=\"calendar-outline\" text=\"Nessun evento in questo mese.\" actionLabel=\"Crea nuovo evento\" onAction={() => { resetEventForm(); setEventModal(true); }} />")
s = s.replace("{requests.length === 0 ? <EmptyCard icon=\"swap-horizontal-outline\" text=\"Nessuna richiesta di cambio aperta.\" />", "{requests.length === 0 ? <EmptyCard icon=\"swap-horizontal-outline\" text=\"Nessuna richiesta di cambio aperta.\" actionLabel=\"Proponi un cambio\" onAction={() => Alert.alert('Proponi un cambio', 'Tocca sul calendario il giorno che vuoi cambiare.')} />")
modal_anchor = "    <Modal visible={swapModal} transparent animationType=\"slide\" onRequestClose={() => setSwapModal(false)}>"
assert modal_anchor in s
day_modal = '''    <Modal visible={dayModalDate !== null} transparent animationType="fade" onRequestClose={() => setDayModalDate(null)}><View style={styles.centerBackdrop}><View style={styles.dayModal}>
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

'''
s = s.replace(modal_anchor, day_modal + modal_anchor, 1)
old_empty = '''function EmptyCard({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }): React.JSX.Element {
  return <View style={[styles.emptyCard, cardShadow]}><View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={ui.colors.primary} /></View><Text style={styles.muted}>{text}</Text></View>;
}'''
new_empty = '''function EmptyCard({ icon, text, actionLabel, onAction }: { icon: keyof typeof Ionicons.glyphMap; text: string; actionLabel?: string; onAction?: () => void }): React.JSX.Element {
  return <View style={[styles.emptyCard, cardShadow]}><View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={ui.colors.primary} /></View><View style={{flex:1}}><Text style={styles.muted}>{text}</Text>{actionLabel && onAction ? <Pressable style={styles.emptyAction} onPress={onAction}><Ionicons name="add" size={17} color={ui.colors.primary} /><Text style={styles.emptyActionText}>{actionLabel}</Text></Pressable> : null}</View></View>;
}'''
assert old_empty in s, 'empty card not found'
s = s.replace(old_empty, new_empty, 1)
s = s.replace("  emptyIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },", "  emptyIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },\n  emptyAction: { alignSelf: 'flex-start', marginTop: 8, minHeight: 38, borderRadius: 11, backgroundColor: ui.colors.primarySoft, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },\n  emptyActionText: { color: ui.colors.primary, fontWeight: '900', fontSize: 12 },")
s = s.replace("  responseModal: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 22, padding: 20, gap: 12 },", "  responseModal: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 22, padding: 20, gap: 12 },\n  dayModal: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 24, padding: 20, gap: 12 },\n  dayModalSubtitle: { color: ui.colors.muted, fontSize: 13 },\n  dayChildrenList: { gap: 8, marginVertical: 3 },\n  dayChildRow: { minHeight: 48, borderRadius: 13, backgroundColor: ui.colors.input, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },\n  dayRoleDot: { width: 10, height: 10, borderRadius: 5 },\n  dayChildName: { flex: 1, color: ui.colors.text, fontWeight: '900' },\n  dayChildRole: { color: ui.colors.muted, fontWeight: '900' },\n  fatherText: { color: ROLE_COLORS.father },\n  motherText: { color: ROLE_COLORS.mother },\n  dayPrimaryAction: { minHeight: 50, borderRadius: 14, backgroundColor: ui.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },\n  dayPrimaryText: { color: '#FFF', fontWeight: '900' },\n  daySecondaryAction: { minHeight: 50, borderRadius: 14, backgroundColor: ui.colors.primarySoft, borderWidth: 1, borderColor: ui.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },\n  daySecondaryText: { color: ui.colors.primary, fontWeight: '900' },")
p.write_text(s)
