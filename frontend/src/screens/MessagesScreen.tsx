import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { ApiClientError, api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { LegalMessage, ToneAnalysis } from '../types/models';

function roleLabel(role: 'father' | 'mother' | null): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : 'Account eliminato';
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function MessagesScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<LegalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tone, setTone] = useState<ToneAnalysis | null>(null);
  const [toneOpen, setToneOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const items = await api.messages.list(150);
      setMessages(items);
      const unread = items.filter((item) => !item.isMine && !item.readAt);
      await Promise.allSettled(unread.map((item) => api.messages.markRead(item.id)));
    } catch (error) {
      Alert.alert('Messaggi', error instanceof Error ? error.message : 'Impossibile caricare i messaggi.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!loading) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50); }, [loading, messages.length]);

  const actuallySend = async (value: string): Promise<void> => {
    if (!value.trim() || sending) return;
    setSending(true);
    try {
      const saved = await api.messages.send(value.trim());
      setMessages((current) => [...current, saved]);
      setText('');
      setToneOpen(false);
      setTone(null);
    } catch (error) {
      Alert.alert(error instanceof ApiClientError && error.code === 'PREMIUM_REQUIRED' ? 'Premium richiesto' : 'Messaggi', error instanceof Error ? error.message : 'Invio non riuscito.');
    } finally { setSending(false); }
  };

  const requestSend = async (): Promise<void> => {
    const value = text.trim();
    if (!value) return;
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
      if (error instanceof ApiClientError && error.code === 'PREMIUM_REQUIRED') {
        Alert.alert('Premium richiesto', error.message);
      } else {
        // Il ToneMeter non deve rendere impossibile comunicare in caso di errore tecnico.
        Alert.alert('Controllo tono non disponibile', 'Il testo non è stato inviato. Riprova tra poco.');
      }
    } finally { setSending(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      <View style={[styles.shell, !compact && styles.shellWide]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>COMUNICAZIONI CONDIVISE</Text>
            <Text style={styles.title}>Messaggi</Text>
            <Text style={styles.subtitle}>Conversazione tra Mamma e Papà · messaggi protetti SHA-256.</Text>
          </View>
          <View style={styles.integrityPill}><Ionicons name="shield-checkmark-outline" size={17} color={ui.colors.success} /><Text style={styles.integrityText}>Integrità attiva</Text></View>
        </View>

        <View style={styles.chatCard}>
          {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={ui.colors.primary} /> : (
            <ScrollView ref={scrollRef} style={styles.messagesArea} contentContainerStyle={styles.messagesContent} keyboardShouldPersistTaps="handled">
              {messages.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="chatbubbles-outline" size={38} color={ui.colors.primary} />
                  <Text style={styles.emptyTitle}>Nessun messaggio</Text>
                  <Text style={styles.emptyText}>Le comunicazioni inviate qui resteranno ordinate e verificabili.</Text>
                </View>
              ) : null}
              {messages.map((message) => {
                const mine = message.senderId === user?.id || message.isMine;
                return (
                  <View key={message.id} style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                      <Text style={[styles.sender, mine && styles.senderMine]}>{mine ? 'Tu' : roleLabel(message.senderRole)}</Text>
                      <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text>
                      <View style={styles.messageMeta}>
                        <Text style={[styles.time, mine && styles.timeMine]}>{formatTimestamp(message.createdAt)}</Text>
                        {mine ? <Ionicons name={message.readAt ? 'checkmark-done' : 'checkmark'} size={15} color={message.readAt ? '#D7F1FF' : '#C6D9EE'} /> : null}
                        <Ionicons name="shield-checkmark" size={13} color={mine ? '#D7F1FF' : ui.colors.success} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Scrivi a Mamma o Papà…"
              placeholderTextColor={ui.colors.muted}
              multiline
              maxLength={10000}
              style={styles.input}
            />
            <Pressable disabled={!text.trim() || sending} onPress={() => void requestSend()} style={[styles.sendButton, (!text.trim() || sending) && { opacity: 0.45 }]}>
              {sending ? <ActivityIndicator color="#FFF" /> : <Ionicons name="send" size={20} color="#FFF" />}
            </Pressable>
          </View>
          <Text style={styles.helper}><Ionicons name="sparkles-outline" size={13} /> ToneMeter controlla il tono prima dell’invio e propone una formulazione più collaborativa se necessario.</Text>
        </View>
      </View>

      <Modal visible={toneOpen} transparent animationType="fade" onRequestClose={() => setToneOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.toneCard}>
            <View style={styles.toneIcon}><Ionicons name="heart-outline" size={26} color={ui.colors.orange} /></View>
            <Text style={styles.toneTitle}>Possiamo rendere il messaggio più neutro</Text>
            <Text style={styles.toneDescription}>Il ToneMeter ha rilevato un tono potenzialmente conflittuale{tone?.signals.length ? `: ${tone.signals.join(', ')}` : ''}.</Text>
            {tone?.reformulatedText ? <View style={styles.suggestion}><Text style={styles.suggestionLabel}>PROPOSTA</Text><Text style={styles.suggestionText}>{tone.reformulatedText}</Text></View> : null}
            <Pressable style={styles.useSuggestion} onPress={() => { if (tone?.reformulatedText) { setText(tone.reformulatedText); setToneOpen(false); } }}><Text style={styles.useSuggestionText}>Usa questa versione</Text></Pressable>
            <Pressable style={styles.sendAnyway} onPress={() => void actuallySend(text)}><Text style={styles.sendAnywayText}>Invia comunque il testo originale</Text></Pressable>
            <Pressable style={styles.cancel} onPress={() => setToneOpen(false)}><Text style={styles.cancelText}>Torna a modificare</Text></Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  shell: { flex: 1, padding: 14 },
  shellWide: { paddingHorizontal: 28, paddingTop: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  eyebrow: { fontSize: 10, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { color: ui.colors.muted, marginTop: 3, maxWidth: 620 },
  integrityPill: { backgroundColor: ui.colors.successSoft, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', gap: 5, alignItems: 'center' },
  integrityText: { color: ui.colors.success, fontWeight: '900', fontSize: 11 },
  chatCard: { ...cardShadow, flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', backgroundColor: ui.colors.card, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 18, overflow: 'hidden' },
  messagesArea: { flex: 1 },
  messagesContent: { padding: 16, gap: 9, flexGrow: 1 },
  row: { width: '100%', flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 17, paddingHorizontal: 13, paddingVertical: 10 },
  bubbleMine: { backgroundColor: ui.colors.primary, borderBottomRightRadius: 5 },
  bubbleOther: { backgroundColor: ui.colors.input, borderBottomLeftRadius: 5 },
  sender: { fontSize: 10, fontWeight: '900', color: ui.colors.primary, marginBottom: 3 },
  senderMine: { color: '#D7F1FF' },
  messageText: { color: '#202124', fontSize: 15, lineHeight: 21 },
  messageTextMine: { color: '#FFF' },
  messageMeta: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  time: { fontSize: 10, color: ui.colors.muted },
  timeMine: { color: '#D7E9FB' },
  composer: { borderTopWidth: 1, borderTopColor: ui.colors.border, padding: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 130, borderRadius: 14, backgroundColor: ui.colors.input, color: '#202124', paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top' },
  sendButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' },
  helper: { paddingHorizontal: 13, paddingBottom: 10, fontSize: 10, color: ui.colors.muted },
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
});
