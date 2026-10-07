import { openPrivateFile } from '../services/openFile';
import { randomUUID } from 'expo-crypto';
import { useLiveRefresh } from '../services/live';
import { SafeModal as Modal } from '../components/SafeModal';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ApiClientError, api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { LegalMessage, MessageAttachment, ToneAnalysis } from '../types/models';

type PendingAttachment = { uri: string; name: string; type: string; file?: Blob };

function roleLabel(role: 'father' | 'mother' | null): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Account eliminato';
}
function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function MessagesScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 720;
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<LegalMessage[]>([]);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const nearBottom=useRef(true);
  const [hasOlder,setHasOlder]=useState(false);
  const [loadingOlder,setLoadingOlder]=useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const sendInFlight=useRef(false);
  const pendingSend = useRef<{key:string;id:string} | null>(null);
  const [tone, setTone] = useState<ToneAnalysis | null>(null);
  const [toneOpen, setToneOpen] = useState(false);

  const scrollToComposer = useCallback((animated = true) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  const load = useCallback(async () => {
    try {
      const items = await api.messages.list(150);
      setHasOlder(items.length>=150);
      setMessages(previous=>{const merged=new Map(previous.map(m=>[m.id,m]));for(const m of items)merged.set(m.id,m);return [...merged.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));});
      const unread = items.filter((item) => !item.isMine && !item.readAt);
      await Promise.allSettled(unread.map((item) => api.messages.markRead(item.id)));
    } catch (error) {
      Alert.alert('Messaggi', error instanceof Error ? error.message : 'Impossibile caricare i messaggi.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);
  useEffect(() => { if (!loading && nearBottom.current) scrollToComposer(false); }, [loading, messages.length, scrollToComposer]);

  async function loadOlder(){
    const first=messages[0];if(!first||loadingOlder)return;nearBottom.current=false;setLoadingOlder(true);
    try{const older=await api.messages.list(150,first.createdAt,first.id);setHasOlder(older.length>=150);setMessages(current=>[...older.filter(m=>!current.some(c=>c.id===m.id)),...current]);await Promise.allSettled(older.filter(m=>!m.isMine&&!m.readAt).map(m=>api.messages.markRead(m.id)));}
    catch(e){Alert.alert('Messaggi',e instanceof Error?e.message:'Caricamento non riuscito');}finally{setLoadingOlder(false);}
  }

  const pickAttachment = async (): Promise<void> => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) setAttachment({ uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream', file: asset.file ?? undefined });
  };

  const actuallySend = async (value: string): Promise<void> => {
    if ((!value.trim() && !attachment) || sendInFlight.current) return;
    sendInFlight.current=true;
    setSending(true);
    try {
      const key = JSON.stringify([value.trim(),attachment?.uri]);
      if(pendingSend.current?.key !== key) pendingSend.current={key,id:randomUUID()};
      const saved = await api.messages.send(value.trim(), attachment ?? undefined, pendingSend.current.id);
      pendingSend.current=null;
      setMessages((current) => current.some(item=>item.id===saved.id) ? current : [...current, saved]);
      setText('');
      setAttachment(null);
      setToneOpen(false);
      setTone(null);
      scrollToComposer();
    } catch (error) {
      Alert.alert(error instanceof ApiClientError && error.code === 'PREMIUM_REQUIRED' ? 'Premium richiesto' : 'Messaggi', error instanceof Error ? error.message : 'Invio non riuscito.');
    } finally { sendInFlight.current=false; setSending(false); }
  };

  const requestSend = async (): Promise<void> => {
    const value = text.trim();
    if ((!value && !attachment) || busy.current) return;
    busy.current=true;
    if (!value) { try { await actuallySend(''); } finally { busy.current=false; } return; }
    setSending(true);
    try {
      const analysis = await api.messages.analyzeTone(value);
      if (analysis.aggressive) {
        setTone(analysis);
        setToneOpen(true);
        return;
      }
      setSending(false);
      await actuallySend(value);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'PREMIUM_REQUIRED') Alert.alert('Premium richiesto', error.message);
      else Alert.alert('Controllo tono non disponibile', 'Il testo non è stato inviato. Riprova tra poco.');
    } finally { busy.current=false; setSending(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.shell, !compact && styles.shellWide, { paddingBottom: Math.max(10, insets.bottom + 4) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>

              <Text style={styles.title}>Messaggi</Text>
              <Text style={styles.subtitle}>La vostra conversazione condivisa</Text>
            </View>
            <Pressable accessibilityLabel="Informazioni sui messaggi" onPress={() => Alert.alert("Messaggi e allegati", "Le comunicazioni conservano uno storico e controlli di integrità. Il controllo del tono può suggerire una formulazione più neutra prima dell’invio.")}><Ionicons name="information-circle-outline" size={25} color={ui.colors.primary} /></Pressable>
          </View>

          <View style={styles.chatCard}>
            {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={ui.colors.primary} /> : (
              <ScrollView
                ref={scrollRef}
                onScroll={e=>{const {contentOffset,contentSize,layoutMeasurement}=e.nativeEvent;nearBottom.current=contentSize.height-contentOffset.y-layoutMeasurement.height<80;}}
                scrollEventThrottle={100}
                style={styles.messagesArea}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              >
                {hasOlder?<Pressable disabled={loadingOlder} onPress={()=>void loadOlder()} style={{padding:12,alignItems:'center'}}><Text style={{color:ui.colors.primary}}>{loadingOlder?'Caricamento…':'Carica messaggi precedenti'}</Text></Pressable>:null}
                {messages.length === 0 ? <View style={styles.empty}><Ionicons name="chatbubbles-outline" size={38} color={ui.colors.primary} /><Text style={styles.emptyTitle}>Nessun messaggio</Text><Text style={styles.emptyText}>Le comunicazioni inviate qui resteranno ordinate e verificabili.</Text></View> : null}
                {messages.map((message) => {
                  const mine = message.senderId === user?.id || message.isMine;
                  return (
                    <View key={message.id} style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                        <Text style={[styles.sender, mine && styles.senderMine]}>{mine ? 'Tu' : roleLabel(message.senderRole)}</Text>
                        {message.text ? <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text> : null}
                        {message.attachments?.map((item) => (
                          <Pressable key={item.id} style={[styles.attachmentCard, mine && styles.attachmentCardMine]} onPress={() => setPreviewAttachment(item)}>
                            {item.mimeType.startsWith('image/') ? <Image source={api.messages.attachmentSource(item.fileUrl)} style={styles.attachmentImage} resizeMode="cover" /> : <View style={styles.fileIcon}><Ionicons name="document-text-outline" size={26} color={mine ? '#FFF' : ui.colors.primary} /></View>}
                            <View style={styles.attachmentCopy}><Text numberOfLines={1} style={[styles.attachmentName, mine && styles.messageTextMine]}>{item.filename}</Text><Text style={[styles.attachmentMeta, mine && styles.timeMine]}>Allegato · {(item.fileSizeBytes / 1024).toFixed(0)} KB</Text></View>
                          </Pressable>
                        ))}
                        <View style={styles.messageMeta}><Text style={[styles.time, mine && styles.timeMine]}>{formatTimestamp(message.createdAt)}</Text>{mine ? <Ionicons name={message.readAt ? 'checkmark-done' : 'checkmark'} size={15} color={message.readAt ? '#D7F1FF' : '#C6D9EE'} /> : null}<Ionicons name="shield-checkmark" size={13} color={mine ? '#D7F1FF' : ui.colors.success} /></View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {attachment ? <View style={styles.pendingAttachment}><Ionicons name="attach-outline" size={19} color={ui.colors.primary} /><View style={styles.pendingCopy}><Text numberOfLines={1} style={styles.pendingName}>{attachment.name}</Text><Text style={styles.pendingMeta}>Pronto per l’invio</Text></View><Pressable onPress={() => setAttachment(null)}><Ionicons name="close-circle" size={23} color={ui.colors.muted} /></Pressable></View> : null}
            <View style={styles.composer}>
              <Pressable style={styles.attachButton} onPress={() => void pickAttachment()} accessibilityLabel="Aggiungi allegato"><Ionicons name="attach" size={23} color={ui.colors.primary} /></Pressable>
              <TextInput
                value={text}
                onChangeText={setText}
                onFocus={() => scrollToComposer(false)}
                placeholder="Scrivi a Mamma o Papà…"
                placeholderTextColor={ui.colors.muted}
                multiline
                maxLength={10000}
                style={styles.input}
              />
              <Pressable disabled={(!text.trim() && !attachment) || sending} onPress={() => void requestSend()} style={[styles.sendButton, ((!text.trim() && !attachment) || sending) && { opacity: 0.45 }]}>{sending ? <ActivityIndicator color="#FFF" /> : <Ionicons name="send" size={20} color="#FFF" />}</Pressable>
            </View>

          </View>
        </View>

        <Modal visible={toneOpen} transparent animationType="fade" onRequestClose={() => setToneOpen(false)}>
          <SafeAreaView style={styles.modalSafeArea} edges={['top', 'right', 'bottom', 'left']}>
            <View style={styles.modalBackdrop}><View style={styles.toneCard}>
              <View style={styles.toneIcon}><Ionicons name="heart-outline" size={26} color={ui.colors.orange} /></View><Text style={styles.toneTitle}>Possiamo rendere il messaggio più neutro</Text><Text style={styles.toneDescription}>Il ToneMeter ha rilevato un tono potenzialmente conflittuale{tone?.signals.length ? `: ${tone.signals.join(', ')}` : ''}.</Text>
              {tone?.reformulatedText ? <View style={styles.suggestion}><Text style={styles.suggestionLabel}>PROPOSTA</Text><Text style={styles.suggestionText}>{tone.reformulatedText}</Text></View> : null}
              <Pressable style={styles.useSuggestion} onPress={() => { if (tone?.reformulatedText) { setText(tone.reformulatedText); setToneOpen(false); } }}><Text style={styles.useSuggestionText}>Usa questa versione</Text></Pressable>
              <Pressable style={styles.sendAnyway} onPress={() => void actuallySend(text)}><Text style={styles.sendAnywayText}>Invia comunque il testo originale</Text></Pressable>
              <Pressable style={styles.cancel} onPress={() => setToneOpen(false)}><Text style={styles.cancelText}>Torna a modificare</Text></Pressable>
            </View></View>
          </SafeAreaView>
        </Modal>

        <Modal visible={previewAttachment !== null} transparent animationType="fade" onRequestClose={() => setPreviewAttachment(null)}>
          <SafeAreaView style={styles.modalSafeArea} edges={['top', 'right', 'bottom', 'left']}>
            <View style={styles.modalBackdrop}><View style={styles.previewCard}>
              <View style={styles.previewHeader}><View style={{ flex: 1 }}><Text style={styles.toneTitle}>Allegato protetto</Text><Text numberOfLines={1} style={styles.toneDescription}>{previewAttachment?.filename}</Text></View><Pressable onPress={() => setPreviewAttachment(null)}><Ionicons name="close" size={25} color={ui.colors.text} /></Pressable></View>
              {previewAttachment?.mimeType.startsWith('image/') ? <Image source={api.messages.attachmentSource(previewAttachment.fileUrl)} style={styles.previewImage} resizeMode="contain" /> : <View style={styles.pdfPreview}><Ionicons name="document-text-outline" size={52} color={ui.colors.primary} /><Text style={styles.emptyTitle}>Documento PDF</Text><Text style={styles.emptyText}>Il file è archiviato nel messaggio e verificato dal backend prima dell’apertura.</Text></View>}
              <Pressable style={styles.useSuggestion} onPress={() => { if(previewAttachment) void openPrivateFile(api.messages.attachmentSource(previewAttachment.fileUrl),previewAttachment.filename,previewAttachment.mimeType).catch(e=>Alert.alert("Allegato",e.message)); }}><Text style={styles.useSuggestionText}>Apri o salva allegato</Text></Pressable>
              <Text selectable style={styles.hashText}>SHA-256: {previewAttachment?.dataHash}</Text>
            </View></View>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ui.colors.background },
  modalSafeArea: { flex: 1, backgroundColor: 'rgba(10,50,103,0.30)' },
  screen: { flex: 1, backgroundColor: ui.colors.background },
  shell: { flex: 1, paddingHorizontal: 14, paddingTop: 18 },
  shellWide: { paddingHorizontal: 28, paddingTop: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { color: ui.colors.muted, marginTop: 3, maxWidth: 620 },
  integrityPill: { backgroundColor: ui.colors.successSoft, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', gap: 5, alignItems: 'center' },
  integrityText: { color: ui.colors.success, fontWeight: '900', fontSize: 11 },
  chatCard: { ...cardShadow, flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 18, overflow: 'hidden' },
  messagesArea: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 28, gap: 9, flexGrow: 1 },
  row: { width: '100%', flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '84%', borderRadius: 17, paddingHorizontal: 13, paddingVertical: 10 },
  bubbleMine: { backgroundColor: ui.colors.primary, borderBottomRightRadius: 5 },
  bubbleOther: { backgroundColor: ui.colors.input, borderBottomLeftRadius: 5 },
  sender: { fontSize: 10, fontWeight: '900', color: ui.colors.primary, marginBottom: 3 },
  senderMine: { color: '#D7F1FF' },
  messageText: { color: '#202124', fontSize: 15, lineHeight: 21 },
  messageTextMine: { color: '#FFF' },
  messageMeta: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  time: { fontSize: 10, color: ui.colors.muted },
  timeMine: { color: '#D7E9FB' },
  attachmentCard: { marginTop: 8, minWidth: 210, maxWidth: 360, borderRadius: 12, borderWidth: 1, borderColor: ui.colors.border, padding: 8, flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: '#FFF' },
  attachmentCardMine: { backgroundColor: 'rgba(255,255,255,0.13)', borderColor: 'rgba(255,255,255,0.22)' },
  attachmentImage: { width: 58, height: 58, borderRadius: 9, backgroundColor: ui.colors.input },
  fileIcon: { width: 58, height: 58, borderRadius: 9, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  attachmentCopy: { flex: 1, minWidth: 0 },
  attachmentName: { color: ui.colors.text, fontWeight: '900', fontSize: 12 },
  attachmentMeta: { color: ui.colors.muted, fontSize: 9, marginTop: 3 },
  pendingAttachment: { marginHorizontal: 10, marginTop: 8, backgroundColor: ui.colors.primarySoft, borderRadius: 12, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingCopy: { flex: 1, minWidth: 0 },
  pendingName: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 12 },
  pendingMeta: { color: ui.colors.muted, fontSize: 9 },
  composer: { borderTopWidth: 1, borderTopColor: ui.colors.border, padding: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: '#FFF' },
  attachButton: { width: 44, height: 48, borderRadius: 14, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 48, maxHeight: 130, borderRadius: 14, backgroundColor: ui.colors.input, color: '#202124', paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top' },
  sendButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' },
  helper: { paddingHorizontal: 13, paddingBottom: 14, paddingTop: 3, fontSize: 10, color: ui.colors.muted, backgroundColor: '#FFF' },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: ui.colors.primaryDark },
  emptyText: { textAlign: 'center', color: ui.colors.muted, maxWidth: 360 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,50,103,0.30)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  toneCard: { width: '100%', maxWidth: 520, backgroundColor: '#FFF', borderRadius: 22, padding: 22, gap: 12 },
  toneIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: ui.colors.warningSoft, alignItems: 'center', justifyContent: 'center' },
  toneTitle: { fontSize: 21, fontWeight: '900', color: ui.colors.primaryDark },
  toneDescription: { color: ui.colors.muted, lineHeight: 20 },
  suggestion: { backgroundColor: ui.colors.primarySoft, borderRadius: 14, padding: 14, gap: 5 },
  suggestionLabel: { color: ui.colors.primary, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  suggestionText: { color: '#202124', lineHeight: 21 },
  useSuggestion: { minHeight: 50, backgroundColor: ui.colors.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  useSuggestionText: { color: '#FFF', fontWeight: '900' },
  sendAnyway: { minHeight: 46, backgroundColor: ui.colors.input, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sendAnywayText: { color: ui.colors.primaryDark, fontWeight: '800' },
  cancel: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: ui.colors.muted, fontWeight: '800' },
  previewCard: { width: '100%', maxWidth: 680, maxHeight: '88%', backgroundColor: '#FFF', borderRadius: 22, padding: 16, gap: 12 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewImage: { width: '100%', height: 480, borderRadius: 14, backgroundColor: ui.colors.input },
  pdfPreview: { minHeight: 280, borderRadius: 14, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  hashText: { color: ui.colors.muted, fontSize: 10, lineHeight: 15 },
});
