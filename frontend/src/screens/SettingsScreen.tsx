import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ui } from '../theme/ui';

function roleLabel(role: 'father' | 'mother' | undefined): string {
  return role === 'mother' ? 'Mamma' : role === 'father' ? 'Papà' : '—';
}

export function SettingsScreen(): React.JSX.Element {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);

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
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(72, insets.bottom + 52) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>ACCOUNT E PRIVACY</Text>
          <Text style={styles.title}>Impostazioni</Text>
          <Text style={styles.subtitle}>Profilo, famiglia e gestione dell’account.</Text>
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
          <Text style={styles.sectionTitle}>Accesso</Text>
          <SettingRow icon="log-out-outline" title="Esci dall’account" subtitle="Il tuo account resterà attivo." onPress={() => void logout()} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={22} color={ui.colors.primary} />
            <Text style={styles.infoText}>DueCase separa i dati per famiglia. Le informazioni di una famiglia non sono accessibili da utenti appartenenti a famiglie diverse.</Text>
          </View>
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
  content: { paddingHorizontal: 20, paddingTop: 22, gap: 16, maxWidth: 850, width: '100%', alignSelf: 'center' },
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
  settingSubtitle: { color: ui.colors.muted, fontSize: 11, marginTop: 3 },
  infoBox: { borderRadius: 14, backgroundColor: ui.colors.primarySoft, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoText: { flex: 1, color: ui.colors.text, lineHeight: 19, fontSize: 12 },
  deleteRow: { backgroundColor: '#FFF', minHeight: 76, borderRadius: 15, borderWidth: 1, borderColor: '#F2C4CC', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: ui.colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { fontWeight: '900', color: ui.colors.danger },
  deleteSubtitle: { color: ui.colors.muted, fontSize: 11, marginTop: 3 },
});
