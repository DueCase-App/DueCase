import { useLiveRefresh } from '../services/live';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../services/api';
import { ui } from '../theme/ui';
import type { InAppNotification } from '../types/models';

function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  if (type.includes('expense') || type.includes('payment')) return 'wallet-outline';
  if (type.includes('calendar') || type.includes('custody')) return 'calendar-outline';
  if (type.includes('message')) return 'chatbubble-outline';
  if (type.includes('document')) return 'document-outline';
  if (type.includes('agreement')) return 'document-text-outline';
  return 'notifications-outline';
}

export function NotificationsScreen({onNavigate}:{onNavigate:(screen:string)=>void}): React.JSX.Element {
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setItems(await api.notifications.list()); }
    catch (error) { Alert.alert('Notifiche', error instanceof Error ? error.message : 'Impossibile caricare le notifiche.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load);

  const markRead = async (item: InAppNotification): Promise<void> => {
    const routes:Record<string,string>={message:'messages',agreement:'agreements',expense:'expenses',expense_payment:'expenses',event:'calendar',custody_exception:'permanence',document:'documents',child:'children'};
    const target=routes[item.entityType??''];
    if(target)onNavigate(target);
    if (item.readAt) return;
    try { await api.notifications.markRead(item.id); setItems((current) => current.map((n) => n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)); }
    catch { /* la notifica resta visibile e potrà essere ritentata */ }
  };

  const readAll = async (): Promise<void> => {
    try { await api.notifications.readAll(); const now = new Date().toISOString(); setItems((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? now }))); }
    catch (error) { Alert.alert('Notifiche', error instanceof Error ? error.message : 'Operazione non riuscita.'); }
  };

  const unread = items.filter((item) => !item.readAt).length;
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>AGGIORNAMENTI IMPORTANTI</Text><Text style={styles.title}>Notifiche</Text><Text style={styles.subtitle}>{unread ? `${unread} da leggere` : 'Sei aggiornato su tutto'}</Text></View>
        {unread ? <Pressable onPress={() => void readAll()} style={styles.readAll}><Text style={styles.readAllText}>Segna tutte come lette</Text></Pressable> : null}
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={ui.colors.primary} /> : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.map((item) => (
            <Pressable key={item.id} onPress={() => void markRead(item)} style={[styles.item, !item.readAt && styles.itemUnread]}>
              <View style={[styles.icon, !item.readAt && styles.iconUnread]}><Ionicons name={iconFor(item.type)} size={21} color={ui.colors.primary} /></View>
              <View style={styles.textArea}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemBody}>{item.body}</Text><Text style={styles.time}>{new Date(item.createdAt).toLocaleString('it-IT')}</Text></View>
              {!item.readAt ? <View style={styles.dot} /> : null}
            </Pressable>
          ))}
          {items.length === 0 ? <View style={styles.empty}><Ionicons name="notifications-off-outline" size={38} color={ui.colors.primary} /><Text style={styles.emptyTitle}>Nessuna notifica</Text><Text style={styles.emptyText}>Le richieste, i messaggi e gli aggiornamenti importanti compariranno qui.</Text></View> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { color: ui.colors.muted, marginTop: 3 },
  readAll: { borderRadius: 12, backgroundColor: ui.colors.primarySoft, paddingHorizontal: 12, paddingVertical: 10 },
  readAllText: { color: ui.colors.primary, fontWeight: '900', fontSize: 11 },
  content: { padding: 18, paddingBottom: 40, gap: 9, maxWidth: 900, width: '100%', alignSelf: 'center' },
  item: { backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1, borderColor: ui.colors.border, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  itemUnread: { borderColor: '#A8CDEF', backgroundColor: '#FBFDFF' },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center' },
  iconUnread: { backgroundColor: ui.colors.primarySoft },
  textArea: { flex: 1, gap: 3 },
  itemTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 15 },
  itemBody: { color: '#202124', lineHeight: 19, fontSize: 13 },
  time: { color: ui.colors.muted, fontSize: 10 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: ui.colors.primary },
  empty: { marginTop: 30, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 28, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: ui.colors.primaryDark },
  emptyText: { color: ui.colors.muted, textAlign: 'center' },
});
