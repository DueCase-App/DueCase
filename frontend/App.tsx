import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { DocumentsScreen } from './src/screens/DocumentsScreen';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { FamilyOnboardingScreen } from './src/screens/FamilyOnboardingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { initializePushNotificationsAsync } from './src/services/notifications';

type Tab = 'calendar' | 'expenses' | 'documents';
type AuthPage = 'login' | 'register';

type ForegroundNotification = {
  title: string;
  body: string;
  target: Tab | null;
};

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'calendar', label: 'Calendario' },
  { key: 'expenses', label: 'Spese' },
  { key: 'documents', label: 'Documenti' },
];

function tabFromNotificationData(data: Record<string, unknown> | undefined): Tab | null {
  const screen = data?.screen;
  if (screen === 'calendar' || screen === 'expenses' || screen === 'documents') return screen;
  return null;
}

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
  const [requestedTab, setRequestedTab] = useState<Tab | null>(null);
  const [foregroundNotification, setForegroundNotification] = useState<ForegroundNotification | null>(null);

  useEffect(() => {
    let active = true;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    // Ask for the native permission as the application starts. AuthContext will
    // associate the Expo token with the user as soon as a valid session exists.
    void initializePushNotificationsAsync();

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (!active) return;

      const content = notification.request.content;
      const data = content.data as Record<string, unknown> | undefined;
      const target = tabFromNotificationData(data);

      if (hideTimer) clearTimeout(hideTimer);
      setForegroundNotification({
        title: content.title?.trim() || 'DueCase',
        body: content.body?.trim() || 'Hai un nuovo aggiornamento.',
        target,
      });

      hideTimer = setTimeout(() => {
        if (active) setForegroundNotification(null);
      }, 6500);
    });

    const handleResponse = (response: Notifications.NotificationResponse): void => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const target = tabFromNotificationData(data);
      if (target && active) setRequestedTab(target);
    };

    // Fired when the user taps a notification while the app is in foreground
    // or background.
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    // Covers the cold-start case: the app was fully terminated and was opened
    // by tapping a system notification.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response || !active) return;
        handleResponse(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch((error) => {
        console.warn('Unable to restore the last notification response', error);
      });

    return () => {
      active = false;
      if (hideTimer) clearTimeout(hideTimer);
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  let content: React.JSX.Element;

  if (booting) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Apertura dell'app…</Text>
      </View>
    );
  } else if (!user) {
    content = authPage === 'login'
      ? <LoginScreen onShowRegister={() => setAuthPage('register')} />
      : <RegisterScreen onShowLogin={() => setAuthPage('login')} />;
  } else if (!user.familyId) {
    content = <FamilyOnboardingScreen />;
  } else {
    content = (
      <AuthenticatedApp
        requestedTab={requestedTab}
        onRequestedTabHandled={() => setRequestedTab(null)}
      />
    );
  }

  return (
    <View style={styles.appRoot}>
      {content}

      {foregroundNotification ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${foregroundNotification.title}. ${foregroundNotification.body}`}
          onPress={() => {
            if (foregroundNotification.target) setRequestedTab(foregroundNotification.target);
            setForegroundNotification(null);
          }}
          style={styles.notificationBanner}
        >
          <View style={styles.notificationDot} />
          <View style={styles.notificationTextArea}>
            <Text style={styles.notificationTitle} numberOfLines={1}>{foregroundNotification.title}</Text>
            <Text style={styles.notificationBody} numberOfLines={2}>{foregroundNotification.body}</Text>
          </View>
          {foregroundNotification.target ? <Text style={styles.notificationAction}>Apri</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

function AuthenticatedApp({
  requestedTab,
  onRequestedTabHandled,
}: {
  requestedTab: Tab | null;
  onRequestedTabHandled: () => void;
}): React.JSX.Element {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('calendar');
  const roleLabel = user?.role === 'father' ? 'Padre' : 'Madre';

  useEffect(() => {
    if (!requestedTab) return;
    setTab(requestedTab);
    onRequestedTabHandled();
  }, [requestedTab, onRequestedTabHandled]);

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
  appRoot: { flex: 1, backgroundColor: '#F8FAFC' },
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
  notificationBanner: {
    position: 'absolute',
    top: 54,
    left: 14,
    right: 14,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 100,
  },
  notificationDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4F46E5' },
  notificationTextArea: { flex: 1, gap: 3 },
  notificationTitle: { color: '#0F172A', fontWeight: '900', fontSize: 14 },
  notificationBody: { color: '#475569', fontSize: 13, lineHeight: 18 },
  notificationAction: { color: '#4F46E5', fontWeight: '900', fontSize: 12 },
});
