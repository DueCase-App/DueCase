import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ui } from '../theme/ui';

function roleLabel(role: 'father' | 'mother' | undefined): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : '—';
}

function permissionLabel(status: Notifications.PermissionStatus | null): string {
  if (status === Notifications.PermissionStatus.GRANTED) return 'Attive';
  if (status === Notifications.PermissionStatus.DENIED) return 'Disattivate';
  return 'Da configurare';
}

export function SettingsScreen(): React.JSX.Element {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<Notifications.PermissionStatus | null>(null);
  const appVersion = Constants.expoConfig?.version ?? '0.2.4';

  const refreshNotificationPermission = async (): Promise<void> => {
    try {
      const permission = await Notifications.getPermissionsAsync();
      setNotificationStatus(permission.status);
    } catch {
      setNotificationStatus(null);
    }
  };

  useEffect(() => { void refreshNotificationPermission(); }, []);

  const manageNotifications = async (): Promise<void> => {
    try {
      if (notificationStatus !== Notifications.PermissionStatus.GRANTED) {
        const result = await Notifications.requestPermissionsAsync();
        setNotificationStatus(result.status);
        if (result.status === Notifications.PermissionStatus.GRANTED) return;
      }
      if (Platform.OS !== 'web') await Linking.openSettings();
      else Alert.alert('Notifiche', 'Le autorizzazioni delle notifiche vanno gestite dalle impostazioni del browser.');
    } catch (error) {
      Alert.alert('Notifiche', error instanceof Error ? error.message : 'Impossibile aprire le impostazioni delle notifiche.');
    }
  };

  const shareFamilyCode = async (): Promise<void> => {
    const code = user?.family?.inviteCode;
    if (!code) {
      Alert.alert('Famiglia', 'Il codice famiglia non è ancora disponibile.');
      return;
    }
    try {
      await Share.share({
        title: 'DueCase · Codice famiglia',
        message: `Unisciti alla mia famiglia su DueCase. Codice famiglia: ${code}`,
      });
    } catch (error) {
      Alert.alert('Condivisione', error instanceof Error ? error.message : 'Impossibile condividere il codice famiglia.');
    }
  };

  const confirmDelete = (): void => {
    Alert.alert(
      'Elimina account',
      'Questa operazione elimina definitivamente il tuo account e i dati personali/mutabili collegati. I registri legali append-only possono essere conservati in forma scollegata per preservarne l’integrità.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Elimina definitivamente', style: 'destructive', onPress: () => void deleteAccount() },
      ],
    );
  };

  const deleteAccount = async (): Promise<void> => {
    setDeleting(true);
    try {
      await api.auth.deleteAccount();
      await logout();
    } catch (error) {
      Alert.alert('Elimina account', error instanceof Error ? error.message : 'Impossibile eliminare l’account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(92, insets.bottom + 72) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>ACCOUNT E APP</Text>
          <Text style={styles.title}>Impostazioni</Text>
          <Text style={styles.subtitle}>Profilo, famiglia, notifiche, privacy e stato dell’app.</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}><Ionicons name={user?.role === 'mother' ? 'woman-outline' : 'man-outline'} size={30} color={ui.colors.primary} /></View>
          <View style={styles.flex}>
            <Text style={styles.profileName}>{user?.displayName}</Text>
            <Text style={styles.profileMeta}>{roleLabel(user?.role)} · {user?.email}</Text>
            <Text style={styles.familyMeta}>{user?.family?.name ?? 'Famiglia'} · codice {user?.family?.inviteCode ?? '—'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Famiglia</Text>
          <SettingRow
            icon="share-social-outline"
            title="Condividi codice famiglia"
            subtitle={user?.family?.inviteCode ? `Codice ${user.family.inviteCode}` : 'Codice non disponibile'}
            onPress={() => void shareFamilyCode()}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifiche</Text>
          <SettingRow
            icon="notifications-outline"
            title="Notifiche push"
            subtitle={`${permissionLabel(notificationStatus)} · tocca per gestirle`}
            onPress={() => void manageNotifications()}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Abbonamento</Text>
          <View style={styles.testBox}>
            <View style={styles.testIcon}><Ionicons name="flask-outline" size={22} color={ui.colors.primary} /></View>
            <View style={styles.flex}>
              <Text style={styles.testTitle}>Modalità test attiva</Text>
              <Text style={styles.testText}>Durante il collaudo le funzioni operative sono sbloccate senza pagamento. Il piano Premium famiglia da 4,99 €/mese verrà riattivato prima della pubblicazione sugli Store.</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy e sicurezza</Text>
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={22} color={ui.colors.primary} />
            <Text style={styles.infoText}>DueCase separa i dati per famiglia. Le informazioni di una famiglia non sono accessibili da utenti appartenenti a famiglie diverse.</Text>
          </View>
          <View style={styles.infoBox}>
            <Ionicons name="lock-closed-outline" size={22} color={ui.colors.success} />
            <Text style={styles.infoText}>Messaggi, allegati, approvazioni e storico sono progettati per mantenere tracciabilità e integrità dei dati condivisi.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Applicazione</Text>
          <View style={styles.appInfoCard}>
            <View style={styles.appInfoRow}><Text style={styles.appInfoLabel}>Versione</Text><Text style={styles.appInfoValue}>{appVersion}</Text></View>
            <View style={styles.appInfoDivider} />
            <View style={styles.appInfoRow}><Text style={styles.appInfoLabel}>Piattaforma</Text><Text style={styles.appInfoValue}>{Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iPhone / iPad' : 'Web / Desktop'}</Text></View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accesso</Text>
          <SettingRow icon="log-out-outline" title="Esci dall’account" subtitle="Il tuo account resterà attivo." onPress={() => void logout()} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Pressable disabled={deleting} onPress={confirmDelete} style={styles.deleteRow}>
            <View style={styles.deleteIcon}><Ionicons name="trash-outline" size={21} color={ui.colors.danger} /></View>
            <View style={styles.flex}>
              <Text style={styles.deleteTitle}>Elimina account</Text>
              <Text style={styles.deleteSubtitle}>Cancella definitivamente il tuo profilo e i dati personali eliminabili.</Text>
            </View>
            {deleting ? <ActivityIndicator color={ui.colors.danger} /> : <Ionicons name="chevron-forward" size={19} color={ui.colors.danger} />}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ icon, title, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={styles.settingRow}>
      <View style={styles.settingIcon}><Ionicons name={icon} size={21} color={ui.colors.primary} /></View>
      <View style={styles.flex}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingSubtitle}>{subtitle}</Text></View>
      <Ionicons name="chevron-forward" size={19} color={ui.colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: ui.colors.background },
  screen: { flex: 1, backgroundColor: ui.colors.background },
  content: { paddingHorizontal: 20, paddingTop: 22, gap: 18, maxWidth: 850, width: '100%', alignSelf: 'center' },
  header: { gap: 3 },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, fontWeight: '900', color: ui.colors.orange, letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: ui.colors.primaryDark },
  subtitle: { color: ui.colors.muted, marginTop: 3 },
  profileCard: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: ui.colors.border, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 58, height: 58, borderRadius: 18, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: 19, fontWeight: '900', color: ui.colors.primaryDark },
  profileMeta: { color: ui.colors.text, marginTop: 3 },
  familyMeta: { color: ui.colors.muted, marginTop: 2, fontSize: 12 },
  section: { gap: 9 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: ui.colors.primaryDark, marginLeft: 2 },
  settingRow: { backgroundColor: '#FFF', minHeight: 70, borderRadius: 15, borderWidth: 1, borderColor: ui.colors.border, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontWeight: '900', color: ui.colors.primaryDark },
  settingSubtitle: { color: ui.colors.muted, fontSize: 11, marginTop: 3, lineHeight: 16 },
  infoBox: { borderRadius: 14, backgroundColor: ui.colors.primarySoft, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoText: { flex: 1, color: ui.colors.text, lineHeight: 19, fontSize: 12 },
  testBox: { borderRadius: 15, borderWidth: 1, borderColor: '#BDD5EE', backgroundColor: '#F4F8FD', padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  testIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  testTitle: { color: ui.colors.primaryDark, fontWeight: '900' },
  testText: { color: ui.colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  appInfoCard: { backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1, borderColor: ui.colors.border, paddingHorizontal: 14 },
  appInfoRow: { minHeight: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  appInfoLabel: { color: ui.colors.muted, fontWeight: '700' },
  appInfoValue: { color: ui.colors.primaryDark, fontWeight: '900' },
  appInfoDivider: { height: StyleSheet.hairlineWidth, backgroundColor: ui.colors.border },
  deleteRow: { backgroundColor: '#FFF', minHeight: 76, borderRadius: 15, borderWidth: 1, borderColor: '#F2C4CC', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: ui.colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { fontWeight: '900', color: ui.colors.danger },
  deleteSubtitle: { color: ui.colors.muted, fontSize: 11, marginTop: 3 },
});
