import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { DocumentsScreen } from './src/screens/DocumentsScreen';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { FamilyOnboardingScreen } from './src/screens/FamilyOnboardingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';

type Tab = 'calendar' | 'expenses' | 'documents';
type AuthPage = 'login' | 'register';

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'calendar', label: 'Calendario' },
  { key: 'expenses', label: 'Spese' },
  { key: 'documents', label: 'Documenti' },
];

export default function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

function Root(): React.JSX.Element {
  const { user, booting } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>('login');

  if (booting) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Apertura dell'app…</Text>
      </View>
    );
  }

  if (!user) {
    return authPage === 'login'
      ? <LoginScreen onShowRegister={() => setAuthPage('register')} />
      : <RegisterScreen onShowLogin={() => setAuthPage('login')} />;
  }

  if (!user.familyId) {
    return <FamilyOnboardingScreen />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp(): React.JSX.Element {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('calendar');
  const roleLabel = user?.role === 'father' ? 'Padre' : 'Madre';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.brandArea}>
          <Text style={styles.brand}>Due Case</Text>
          <Text style={styles.userLine}>{user?.displayName} · {roleLabel}</Text>
        </View>
        <View style={styles.headerActions}>
          {user?.family?.inviteCode ? <Text style={styles.familyCode}>Codice: {user.family.inviteCode}</Text> : null}
          <Pressable onPress={() => void logout()} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Esci</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {tab === 'calendar' ? <CalendarScreen /> : null}
        {tab === 'expenses' ? <ExpensesScreen /> : null}
        {tab === 'documents' ? <DocumentsScreen /> : null}
      </View>

      <View style={styles.nav}>
        {tabs.map((item) => {
          const selected = item.key === tab;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setTab(item.key)}
              style={[styles.navItem, selected && styles.navItemSelected]}
            >
              <Text style={[styles.navText, selected && styles.navTextSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F8FAFC' },
  loadingText: { color: '#64748B' },
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandArea: { gap: 2 },
  brand: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  userLine: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  familyCode: { color: '#6366F1', fontWeight: '800', fontSize: 12 },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  logoutText: { color: '#475569', fontWeight: '800' },
  body: { flex: 1 },
  nav: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  navItemSelected: { backgroundColor: '#E0E7FF' },
  navText: { color: '#64748B', fontWeight: '700' },
  navTextSelected: { color: '#3730A3' },
});
