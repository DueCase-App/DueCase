import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { DocumentsScreen } from './src/screens/DocumentsScreen';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { FamilyOnboardingScreen } from './src/screens/FamilyOnboardingScreen';
import { HomeScreen, type HomeDestination } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { initializePushNotificationsAsync } from './src/services/notifications';
import { ui } from './src/theme/ui';

type PrimaryTab = 'home' | 'calendar' | 'agreements' | 'expenses' | 'settings';
type AppRoute = PrimaryTab | 'documents' | 'messages' | 'dossier' | 'family';
type AuthPage = 'login' | 'register';

type ForegroundNotification = {
  title: string;
  body: string;
  target: AppRoute | null;
};

const tabs: Array<{ key: PrimaryTab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'home', label: 'Oggi', icon: 'home-outline', activeIcon: 'home' },
  { key: 'calendar', label: 'Calendario', icon: 'calendar-outline', activeIcon: 'calendar' },
  { key: 'agreements', label: 'Accordi', icon: 'document-text-outline', activeIcon: 'document-text' },
  { key: 'expenses', label: 'Spese', icon: 'wallet-outline', activeIcon: 'wallet' },
  { key: 'settings', label: 'Impostazioni', icon: 'settings-outline', activeIcon: 'settings' },
];

function routeFromNotificationData(data: Record<string, unknown> | undefined): AppRoute | null {
  const screen = data?.screen;
  if (screen === 'calendar' || screen === 'expenses' || screen === 'documents') return screen;
  return null;
}

export default function App(): React.JSX.Element {
  return <AuthProvider><Root /></AuthProvider>;
}

function Root(): React.JSX.Element {
  const { user, booting } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>('login');
  const [requestedRoute, setRequestedRoute] = useState<AppRoute | null>(null);
  const [foregroundNotification, setForegroundNotification] = useState<ForegroundNotification | null>(null);

  useEffect(() => {
    let active = true;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    void initializePushNotificationsAsync();

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (!active) return;
      const content = notification.request.content;
      const target = routeFromNotificationData(content.data as Record<string, unknown> | undefined);
      if (hideTimer) clearTimeout(hideTimer);
      setForegroundNotification({
        title: content.title?.trim() || 'DueCase',
        body: content.body?.trim() || 'Hai un nuovo aggiornamento.',
        target,
      });
      hideTimer = setTimeout(() => { if (active) setForegroundNotification(null); }, 6500);
    });

    const handleResponse = (response: Notifications.NotificationResponse): void => {
      const target = routeFromNotificationData(response.notification.request.content.data as Record<string, unknown> | undefined);
      if (target && active) setRequestedRoute(target);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response || !active) return;
        handleResponse(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch((error) => console.warn('Unable to restore the last notification response', error));

    return () => {
      active = false;
      if (hideTimer) clearTimeout(hideTimer);
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  let content: React.JSX.Element;
  if (booting) {
    content = <View style={styles.loading}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.loadingText}>Apertura di DueCase…</Text></View>;
  } else if (!user) {
    content = authPage === 'login'
      ? <LoginScreen onShowRegister={() => setAuthPage('register')} />
      : <RegisterScreen onShowLogin={() => setAuthPage('login')} />;
  } else if (!user.familyId) {
    content = <FamilyOnboardingScreen />;
  } else {
    content = <AuthenticatedApp requestedRoute={requestedRoute} onRequestedRouteHandled={() => setRequestedRoute(null)} />;
  }

  return (
    <View style={styles.appRoot}>
      {content}
      {foregroundNotification ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${foregroundNotification.title}. ${foregroundNotification.body}`}
          onPress={() => {
            if (foregroundNotification.target) setRequestedRoute(foregroundNotification.target);
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

function AuthenticatedApp({ requestedRoute, onRequestedRouteHandled }: { requestedRoute: AppRoute | null; onRequestedRouteHandled: () => void }): React.JSX.Element {
  const { user, logout } = useAuth();
  const [route, setRoute] = useState<AppRoute>('home');

  useEffect(() => {
    if (!requestedRoute) return;
    setRoute(requestedRoute);
    onRequestedRouteHandled();
  }, [requestedRoute, onRequestedRouteHandled]);

  const activeTab = useMemo<PrimaryTab>(() => (
    route === 'calendar' || route === 'agreements' || route === 'expenses' || route === 'settings' ? route : 'home'
  ), [route]);

  const navigateFromHome = (target: HomeDestination): void => setRoute(target);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={ui.colors.background} />
      <View style={styles.body}>
        {route === 'home' ? <HomeScreen onNavigate={navigateFromHome} /> : null}
        {route === 'calendar' ? <CalendarScreen /> : null}
        {route === 'expenses' ? <ExpensesScreen /> : null}
        {route === 'documents' ? <DocumentsScreen /> : null}
        {route === 'agreements' ? <SimpleScreen icon="document-text-outline" title="Accordi" subtitle="Conferme, accordi e richieste condivise saranno raccolti qui." /> : null}
        {route === 'messages' ? <SimpleScreen icon="chatbubble-outline" title="Messaggi" subtitle="La messaggistica tra i genitori sarà disponibile in questa sezione." /> : null}
        {route === 'dossier' ? <SimpleScreen icon="bar-chart-outline" title="Dossier" subtitle="Cronologia ordinata di documenti, spese, accordi e attività della famiglia." /> : null}
        {route === 'family' ? <SimpleScreen icon="people-outline" title="Famiglia" subtitle={`${user?.family?.name ?? 'La tua famiglia'} · Codice ${user?.family?.inviteCode ?? '—'}`} /> : null}
        {route === 'settings' ? (
          <SimpleScreen icon="settings-outline" title="Impostazioni" subtitle={`${user?.displayName ?? ''} · ${user?.email ?? ''}`} actionLabel="Esci dall'account" onAction={() => void logout()} />
        ) : null}
      </View>

      <View style={styles.nav}>
        {tabs.map((item) => {
          const selected = item.key === activeTab;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setRoute(item.key)}
              style={[styles.navItem, selected && styles.navItemSelected]}
            >
              <Ionicons name={selected ? item.activeIcon : item.icon} size={23} color={selected ? ui.colors.primary : ui.colors.muted} />
              <Text numberOfLines={1} style={[styles.navText, selected && styles.navTextSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function SimpleScreen({ icon, title, subtitle, actionLabel, onAction }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; actionLabel?: string; onAction?: () => void }): React.JSX.Element {
  return (
    <View style={styles.simpleScreen}>
      <View style={styles.simpleCard}>
        <View style={styles.simpleIcon}><Ionicons name={icon} size={32} color={ui.colors.primary} /></View>
        <Text style={styles.simpleTitle}>{title}</Text>
        <Text style={styles.simpleSubtitle}>{subtitle}</Text>
        {actionLabel && onAction ? <Pressable style={styles.simpleAction} onPress={onAction}><Text style={styles.simpleActionText}>{actionLabel}</Text></Pressable> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: ui.colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ui.colors.background },
  loadingText: { color: ui.colors.muted },
  safeArea: { flex: 1, backgroundColor: ui.colors.background },
  body: { flex: 1 },
  nav: { flexDirection: 'row', backgroundColor: ui.colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.colors.border, paddingHorizontal: 6, paddingTop: 7, paddingBottom: 4 },
  navItem: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 13 },
  navItemSelected: { backgroundColor: ui.colors.primarySoft },
  navText: { color: ui.colors.muted, fontWeight: '700', fontSize: 10 },
  navTextSelected: { color: ui.colors.primary, fontWeight: '900' },
  simpleScreen: { flex: 1, backgroundColor: ui.colors.background, padding: 18, justifyContent: 'center' },
  simpleCard: { backgroundColor: ui.colors.card, borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, padding: 24, alignItems: 'center', gap: 10 },
  simpleIcon: { width: 64, height: 64, borderRadius: 18, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  simpleTitle: { fontSize: 26, fontWeight: '900', color: ui.colors.primaryDark },
  simpleSubtitle: { color: ui.colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  simpleAction: { marginTop: 10, minHeight: 48, minWidth: 180, borderRadius: 13, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  simpleActionText: { color: '#FFF', fontWeight: '900' },
  notificationBanner: { position: 'absolute', top: 54, left: 14, right: 14, minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.card, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8, zIndex: 100 },
  notificationDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ui.colors.primary },
  notificationTextArea: { flex: 1, gap: 3 },
  notificationTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 14 },
  notificationBody: { color: ui.colors.muted, fontSize: 13, lineHeight: 18 },
  notificationAction: { color: ui.colors.primary, fontWeight: '900', fontSize: 12 },
});
