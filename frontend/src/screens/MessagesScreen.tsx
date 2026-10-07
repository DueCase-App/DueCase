import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AttachmentSourceSheet, type PickedAttachment } from '../components/AttachmentSourceSheet';
import { KeyboardViewport } from '../components/KeyboardViewport';
import { SafeModal as Modal } from '../components/SafeModal';
import { useAuth } from '../context/AuthContext';
import { ApiClientError, api } from '../services/api';
import { useLiveRefresh } from '../services/live';
import { openPrivateFile } from '../services/openFile';
import { cardShadow, ui } from '../theme/ui';
import type { LegalMessage, MessageAttachment, ToneAnalysis } from '../types/models';

function roleLabel(role: 'father' | 'mother' | null): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Account eliminato';
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function MessagesScreen(): React.JSX.Element {
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const dragging = useRef(false);
  const sendInFlight = useRef(false);
  const pendingSend = useRef<{ key: string; id: string } | null>(null);

  const [messages, setMessages] = useState<LegalMessage[]>([]);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [tone, setTone] = useState<ToneAnalysis | null>(null);
  const [toneOpen, setToneOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [moderationActive, setModerationActive] = useState(false);

  const scrollToComposer = useCallback((animated = true) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 70);
  }, []);

  useEffect(() => {
    void api.serviceInfo().then((value) => setModerationActive(value.moderationActive)).catch(() => undefined);
    const sub = Keyboard.addListener('keyboardDidShow', () => { if (nearBottom.current) scrollToComposer(false); });
    return () => sub.remove();
  }, [scrollToComposer]);

  const load = useCallback(async () => {
    try {
      const items = await api.messages.list(150);
      setHasOlder(items.length >= 150);
      setMessages((previous) => {
        const merged = new Map(previous.map((item) => [item.id, item]));
        for (const item of items) merged.set(item.id, item);
        return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      });
      await Promise.allSettled(items.filter((item) => !item.isMine && !item.readAt).map((item) => api.messages.markRead(item.id)));
    } catch (error) {
      Alert.alert('Messaggi', error instanceof Error ? error.message : 'Impossibile caricare i messaggi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);
  useEffect(() => { if (!loading && nearBottom.current) scrollToComposer(false); }, [loading, messages.length, scrollToComposer]);

  async function loadOlder(): Promise<void> {
    const first = messages[0];
    if (!first || loadingOlder) return;
    nearBottom.current = false;
    setLoadingOlder(true);
    try {
      const older = await api.messages.list(150, first.createdAt, first.id);
      setHasOlder(older.length >= 150);
      setMessages((current) => [...older.filter((item) => !current.some((saved) => saved.id === item.id)), ...current]);
      await Promise.allSettled(older.filter((item) => !item.isMine && !item.readAt).map((item) => api.messages.markRead(item.id)));
    } catch (error) {
      Alert.alert('Messaggi', error instanceof Error ? error.message : 'Caricamento non riuscito.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function actuallySend(value: string): Promise<void> {
    if ((!value.trim() && !attachment) || sendInFlight.current) return;
    sendInFlight.current = true;
    setSending(true);
    try {
      const key = JSON.stringify([value.trim(), attachment?.uri]);
      if (pendingSend.current?.key !== key) pendingSend.current = { key, id: randomUUID() };
      const saved = await api.messages.send(value.trim(), attachment ?? undefined, pendingSend.current.id);
      pendingSend.current = null;
      setMessages((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
      setText('');
      setAttachment(null);
      setToneOpen(false);
      setTone(null);
      scrollToComposer();
    } catch (error) {
      Alert.alert(error instanceof ApiClientError && error.code === 'PREMIUM_REQUIRED' ? 'Premium richiesto' : 'Messaggi', error instanceof Error ? error.message : 'Invio non riuscito.');
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  }

  async function requestSend(): Promise<void> {
    const value = text.trim();
    if ((!value && !attachment) || sending) return;
    if (!value) { await actuallySend(''); return; }
    setSending(true);
    try {
      const analysis = await api.messages.analyzeTone(value);
      if (analysis.aggressive) {
        setTone(analysis);
        setToneOpen(true);
        return;
      }
      await actuallySend(value);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'PREMIUM_REQUIRED') Alert.alert('Premium richiesto', error.message);
      else Alert.alert('Controllo tono non disponibile', 'Il testo non è stato inviato. Riprova tra poco.');
    } finally {
      setSending(false);
    }
  }

  async function report(): Promise<void> {
    if (!reportMessage || reportReason.trim().length < 5) return;
    setReportBusy(true);
    try {
      const result = await api.safety.reportMessage(reportMessage, reportReason.trim());
      setReportMessage(null);
      setReportReason('');
      Alert.alert('Segnalazione registrata', `Riferimento: ${result.id}. ${moderationActive ? 'La segnalazione è disponibile per l’assistenza.' : 'Durante il collaudo la presa in carico dell’assistenza non è ancora attiva.'}`);
    } catch (error) {
      Alert.alert('Segnalazione', error instanceof Error ? error.message : 'Invio non riuscito.');
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <KeyboardViewport>
        <View style={styles.shell}>
          <View style={styles.header}>
            <View style={styles.headerCopy}><Text style={styles.title}>Messaggi</Text><Text style={styles.subtitle}>La vostra conversazione condivisa</Text></View>
            <Pressable accessibilityLabel="Informazioni sui messaggi" onPress={() => Alert.alert('Messaggi e allegati', 'Le comunicazioni conservano uno storico e controlli di integrità. Il controllo del tono può suggerire una formulazione più neutra prima dell’invio.')}>
              <Ionicons name="information-circle-outline" size={25} color={ui.colors.primary} />
            </Pressable>
          </View>

          <View style={[styles.chatCard, cardShadow]}>
            {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={ui.colors.primary} /> : (
              <ScrollView
                ref={scrollRef}
                style={styles.messagesArea}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                onLayout={() => { if (nearBottom.current) scrollToComposer(false); }}
                onContentSizeChange={() => { if (nearBottom.current) scrollToComposer(false); }}
                onScrollBeginDrag={() => { dragging.current = true; }}
                onScrollEndDrag={() => { dragging.current = false; }}
                onMomentumScrollBegin={() => { dragging.current = true; }}
                onMomentumScrollEnd={() => { dragging.current = false; }}
                onScroll={(event) => {
                  if (!dragging.current) return;
                  const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                  nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
                }}
                scrollEventThrottle={100}
              >
                {hasOlder ? <Pressable disabled={loadingOlder} onPress={() => void loadOlder()} style={styles.older}><Text style={styles.link}>{loadingOlder ? 'Caricamento…' : 'Carica messaggi precedenti'}</Text></Pressable> : null}
                {messages.length === 0 ? <View style={styles.empty}><Ionicons name="chatbubbles-outline" size={40} color={ui.colors.primary} /><Text style={styles.emptyTitle}>Nessun messaggio</Text><Text style={styles.subtitle}>Le comunicazioni inviate qui resteranno ordinate e verificabili.</Text></View> : null}

                {messages.map((message) => {
                  const mine = message.senderId === user?.id || message.isMine;
                  return (
                    <View key={message.id} style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                        <Text style={[styles.sender, mine && styles.mineText]}>{mine ? 'Tu' : roleLabel(message.senderRole)}</Text>
                        {message.text ? <Text style={[styles.messageText, mine && styles.mineText]}>{message.text}</Text> : null}
                        {message.attachments?.map((item) => (
                          <Pressable key={item.id} style={[styles.attachmentCard, mine && styles.attachmentMine]} onPress={() => setPreviewAttachment(item)}>
                            {item.mimeType.startsWith('image/') ? <Image source={api.messages.attachmentSource(item.fileUrl)} style={styles.attachmentThumb} /> : <View style={styles.fileIcon}><Ionicons name="document-text-outline" size={25} color={mine ? '#FFF' : ui.colors.primary} /></View>}
                            <View style={styles.attachmentCopy}><Text numberOfLines={1} style={[styles.attachmentName, mine && styles.mineText]}>{item.filename}</Text><Text style={[styles.attachmentMeta, mine && styles.mineMeta]}>{Math.max(1, Math.round(item.fileSizeBytes / 1024))} KB</Text></View>
                          </Pressable>
                        ))}
                        {!mine ? <Pressable onPress={() => { setReportMessage(message.id); setReportReason(''); }}><Text style={styles.reportLink}>Segnala</Text></Pressable> : null}
                        <View style={styles.metaRow}><Text style={[styles.time, mine && styles.mineMeta]}>{formatTimestamp(message.createdAt)}</Text>{mine ? <Ionicons name={message.readAt ? 'checkmark-done' : 'checkmark'} size={15} color="#D7F1FF" /> : null}<Ionicons name="shield-checkmark" size={13} color={mine ? '#D7F1FF' : ui.colors.success} /></View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {attachment ? <View style={styles.pendingAttachment}><Ionicons name={attachment.type.startsWith('image/') ? 'image-outline' : 'document-attach-outline'} size={20} color={ui.colors.primary} /><View style={styles.pendingCopy}><Text numberOfLines={1} style={styles.pendingName}>{attachment.name}</Text><Text style={styles.pendingMeta}>Pronto per l’invio</Text></View><Pressable accessibilityLabel="Rimuovi allegato" onPress={() => setAttachment(null)}><Ionicons name="close-circle" size={23} color={ui.colors.muted} /></Pressable></View> : null}

            <View style={styles.composer}>
              <Pressable style={styles.attachButton} onPress={() => setAttachmentPickerOpen(true)} accessibilityLabel="Aggiungi allegato"><Ionicons name="attach" size={24} color={ui.colors.primary} /></Pressable>
              <TextInput value={text} onChangeText={setText} onFocus={() => { nearBottom.current = true; scrollToComposer(false); }} placeholder="Scrivi a Mamma o Papà…" placeholderTextColor={ui.colors.muted} multiline maxLength={10000} style={styles.input} />
              <Pressable disabled={(!text.trim() && !attachment) || sending} onPress={() => void requestSend()} style={[styles.sendButton, ((!text.trim() && !attachment) || sending) && styles.disabled]}>{sending ? <ActivityIndicator color="#FFF" /> : <Ionicons name="send" size={20} color="#FFF" />}</Pressable>
            </View>
          </View>
        </View>

        <AttachmentSourceSheet visible={attachmentPickerOpen} onClose={() => setAttachmentPickerOpen(false)} onPicked={setAttachment} title="Allega al messaggio" />

        <Modal visible={previewAttachment !== null} transparent animationType="fade" onRequestClose={() => setPreviewAttachment(null)}>
          <View style={styles.modalBackdrop}><View style={styles.previewCard}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>{previewAttachment?.filename}</Text><Pressable onPress={() => setPreviewAttachment(null)}><Ionicons name="close" size={25} color={ui.colors.text} /></Pressable></View>
            {previewAttachment?.mimeType.startsWith('image/') ? <Image source={api.messages.attachmentSource(previewAttachment.fileUrl)} style={styles.previewImage} resizeMode="contain" /> : <View style={styles.filePreview}><Ionicons name="document-text-outline" size={52} color={ui.colors.primary} /><Text style={styles.emptyTitle}>{previewAttachment?.filename}</Text></View>}
            {previewAttachment ? <Pressable style={styles.openButton} onPress={() => void openPrivateFile(api.messages.attachmentSource(previewAttachment.fileUrl), previewAttachment.filename, previewAttachment.mimeType).catch((error) => Alert.alert('Allegato', error.message))}><Text style={styles.openButtonText}>Apri o salva</Text></Pressable> : null}
          </View></View>
        </Modal>

        <Modal visible={toneOpen} transparent animationType="fade" onRequestClose={() => setToneOpen(false)}>
          <View style={styles.modalBackdrop}><View style={styles.toneCard}>
            <View style={styles.toneIcon}><Ionicons name="heart-outline" size={28} color={ui.colors.orange} /></View>
            <Text style={styles.modalTitle}>Possiamo rendere il messaggio più neutro</Text>
            <Text style={styles.subtitle}>Il ToneMeter ha rilevato un tono potenzialmente conflittuale{tone?.signals.length ? `: ${tone.signals.join(', ')}` : ''}.</Text>
            {tone?.reformulatedText ? <View style={styles.suggestion}><Text style={styles.suggestionLabel}>PROPOSTA</Text><Text style={styles.suggestionText}>{tone.reformulatedText}</Text></View> : null}
            {tone?.reformulatedText ? <Pressable style={styles.openButton} onPress={() => { setText(tone.reformulatedText ?? ''); setToneOpen(false); }}><Text style={styles.openButtonText}>Usa questa versione</Text></Pressable> : null}
            <Pressable style={styles.secondaryButton} onPress={() => { setToneOpen(false); void actuallySend(text.trim()); }}><Text style={styles.secondaryText}>Invia comunque</Text></Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setToneOpen(false)}><Text style={styles.secondaryText}>Torna al messaggio</Text></Pressable>
          </View></View>
        </Modal>

        <Modal visible={reportMessage !== null} transparent animationType="fade" onRequestClose={() => setReportMessage(null)}>
          <View style={styles.modalBackdrop}><View style={styles.toneCard}>
            <Text style={styles.modalTitle}>Segnala un messaggio</Text>
            <Text style={styles.subtitle}>Descrivi il problema. La segnalazione non cancella lo storico e non è un servizio di emergenza.</Text>
            <TextInput value={reportReason} onChangeText={setReportReason} multiline maxLength={2000} placeholder="Motivo della segnalazione" placeholderTextColor={ui.colors.muted} style={[styles.reportInput]} />
            <Pressable disabled={reportBusy || reportReason.trim().length < 5} style={[styles.openButton, (reportBusy || reportReason.trim().length < 5) && styles.disabled]} onPress={() => void report()}><Text style={styles.openButtonText}>{reportBusy ? 'Invio…' : 'Registra segnalazione'}</Text></Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setReportMessage(null)}><Text style={styles.secondaryText}>Annulla</Text></Pressable>
          </View></View>
        </Modal>
      </KeyboardViewport>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  shell: { flex: 1, width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  headerCopy: { flex: 1 },
  title: { color: ui.colors.primaryDark, fontSize: 29, fontWeight: '900' },
  subtitle: { color: ui.colors.muted, fontSize: 13, lineHeight: 19 },
  chatCard: { flex: 1, minHeight: 0, backgroundColor: ui.colors.card, borderRadius: 22, borderWidth: 1, borderColor: ui.colors.border, overflow: 'hidden' },
  messagesArea: { flex: 1 },
  messagesContent: { padding: 14, gap: 10, flexGrow: 1 },
  older: { padding: 10, alignItems: 'center' },
  link: { color: ui.colors.primary, fontWeight: '800' },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  emptyTitle: { color: ui.colors.primaryDark, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  row: { width: '100%', flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '84%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, gap: 5 },
  bubbleMine: { backgroundColor: ui.colors.primary, borderBottomRightRadius: 5 },
  bubbleOther: { backgroundColor: '#FFF', borderWidth: 1, borderColor: ui.colors.border, borderBottomLeftRadius: 5 },
  sender: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 11 },
  messageText: { color: ui.colors.text, fontSize: 15, lineHeight: 21 },
  mineText: { color: '#FFF' },
  attachmentCard: { minWidth: 220, marginTop: 5, borderRadius: 13, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.primarySoft, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  attachmentMine: { backgroundColor: 'rgba(255,255,255,.13)', borderColor: 'rgba(255,255,255,.3)' },
  attachmentThumb: { width: 48, height: 48, borderRadius: 9 },
  fileIcon: { width: 48, height: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  attachmentCopy: { flex: 1, minWidth: 0 },
  attachmentName: { color: ui.colors.text, fontWeight: '800' },
  attachmentMeta: { color: ui.colors.muted, fontSize: 10, marginTop: 2 },
  mineMeta: { color: '#D7E8FF' },
  reportLink: { color: ui.colors.primary, fontSize: 11, fontWeight: '800', marginTop: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 1 },
  time: { color: ui.colors.muted, fontSize: 9 },
  pendingAttachment: { borderTopWidth: 1, borderTopColor: ui.colors.border, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: ui.colors.orangeSoft },
  pendingCopy: { flex: 1, minWidth: 0 },
  pendingName: { color: ui.colors.primaryDark, fontWeight: '800' },
  pendingMeta: { color: ui.colors.muted, fontSize: 10 },
  composer: { borderTopWidth: 1, borderTopColor: ui.colors.border, padding: 10, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 130, borderRadius: 15, backgroundColor: ui.colors.input, borderWidth: 1, borderColor: ui.colors.border, color: ui.colors.text, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15 },
  sendButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: .45 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(12,43,99,.38)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  previewCard: { width: '100%', maxWidth: 760, maxHeight: '90%', backgroundColor: ui.colors.card, borderRadius: 22, padding: 15, gap: 12 },
  toneCard: { width: '100%', maxWidth: 560, backgroundColor: ui.colors.card, borderRadius: 22, padding: 20, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modalTitle: { flex: 1, color: ui.colors.primaryDark, fontSize: 21, fontWeight: '900' },
  previewImage: { width: '100%', height: 520, maxHeight: '70%', borderRadius: 14, backgroundColor: ui.colors.input },
  filePreview: { minHeight: 260, borderRadius: 14, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  openButton: { minHeight: 50, borderRadius: 14, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  openButtonText: { color: '#FFF', fontWeight: '900' },
  secondaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: ui.colors.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { minHeight: 46, borderRadius: 14, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: ui.colors.primaryDark, fontWeight: '800' },
  toneIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: ui.colors.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  suggestion: { borderRadius: 14, backgroundColor: ui.colors.primarySoft, padding: 13, gap: 5 },
  suggestionLabel: { color: ui.colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: .8 },
  suggestionText: { color: ui.colors.text, lineHeight: 21 },
  reportInput: { minHeight: 110, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 14, backgroundColor: ui.colors.input, color: ui.colors.text, padding: 12, textAlignVertical: 'top' },
});
