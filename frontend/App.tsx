import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AgreementsScreen } from './src/screens/AgreementsScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { ChildrenScreen } from './src/screens/ChildrenScreen';
import { DossierScreen } from './src/screens/DossierScreen';
import { DocumentsScreen } from './src/screens/DocumentsScreen';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { FamilyOnboardingScreen } from './src/screens/FamilyOnboardingScreen';
import { HomeScreen, type HomeDestination } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { PermanenceScreen } from './src/screens/PermanenceScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SignUpScreen } from './src/screens/SignUpScreen';
import { initializePushNotificationsAsync } from './src/services/notifications';
import { ui } from './src/theme/ui';

type MainRoute = 'home' | 'calendar' | 'permanence' | 'children' | 'expenses' | 'agreements' | 'messages' | 'documents' | 'dossier' | 'notifications' | 'settings' | 'family';
type MobileTab = 'home' | 'calendar' | 'children' | 'expenses' | 'more';
type AuthStackParamList = { Login: undefined; SignUp: undefined; };

type ForegroundNotification = { title: string; body: string; target: MainRoute | null; };
type NavigationItem = { key: MainRoute; label: string; icon: keyof typeof Ionicons.glyphMap; };

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const navigationItems: NavigationItem[] = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'calendar', label: 'Calendario', icon: 'calendar-outline' },
  { key: 'permanence', label: 'Permanenze', icon: 'repeat-outline' },
  { key: 'children', label: 'Figli', icon: 'people-outline' },
  { key: 'expenses', label: 'Spese', icon: 'wallet-outline' },
  { key: 'agreements', label: 'Accordi', icon: 'document-text-outline' },
  { key: 'messages', label: 'Messaggi', icon: 'chatbubbles-outline' },
  { key: 'documents', label: 'Documenti', icon: 'folder-open-outline' },
  { key: 'dossier', label: 'Dossier', icon: 'bar-chart-outline' },
  { key: 'notifications', label: 'Notifiche', icon: 'notifications-outline' },
  { key: 'settings', label: 'Impostazioni', icon: 'settings-outline' },
];

const mobileTabs: Array<{ key: MobileTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'calendar', label: 'Calendario', icon: 'calendar-outline' },
  { key: 'children', label: 'Figli', icon: 'people-outline' },
  { key: 'expenses', label: 'Spese', icon: 'wallet-outline' },
  { key: 'more', label: 'Altro', icon: 'grid-outline' },
];

function routeFromNotificationData(data: Record<string, unknown> | undefined): MainRoute | null {
  const screen = data?.screen;
  if (screen === 'calendar') return 'calendar';
  if (screen === 'expenses') return 'expenses';
  if (screen === 'documents') return 'documents';
  if (screen === 'messages') return 'messages';
  if (screen === 'agreements') return 'agreements';
  if (screen === 'notifications') return 'notifications';
  if (screen === 'children') return 'children';
  return null;
}

export default function App(): React.JSX.Element {
  return <AuthProvider><NavigationContainer><Root /></NavigationContainer></AuthProvider>;
}

function Root(): React.JSX.Element {
  const { user, booting } = useAuth();
  const [requestedRoute, setRequestedRoute] = useState<MainRoute | null>(null);
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
      setForegroundNotification({ title: content.title?.trim() || 'DueCase', body: content.body?.trim() || 'Hai un nuovo aggiornamento.', target });
      hideTimer = setTimeout(() => { if (active) setForegroundNotification(null); }, 6500);
    });
    const handleResponse = (response: Notifications.NotificationResponse): void => {
      const target = routeFromNotificationData(response.notification.request.content.data as Record<string, unknown> | undefined);
      if (target && active) setRequestedRoute(target);
    };
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || !active) return;
      handleResponse(response);
      return Notifications.clearLastNotificationResponseAsync();
    }).catch((error) => console.warn('Unable to restore notification response', error));
    return () => { active = false; if (hideTimer) clearTimeout(hideTimer); receivedSubscription.remove(); responseSubscription.remove(); };
  }, []);

  let content: React.JSX.Element;
  if (booting) content = <View style={styles.loading}><ActivityIndicator size="large" color={ui.colors.primary} /><Text style={styles.loadingText}>Apertura di DueCase…</Text></View>;
  else if (!user) content = <AuthenticationNavigator />;
  else if (!user.familyId) content = <FamilyOnboardingScreen />;
  else content = <AuthenticatedApp requestedRoute={requestedRoute} onRequestedRouteHandled={() => setRequestedRoute(null)} />;

  return <View style={styles.appRoot}>
    {content}
    {foregroundNotification ? <Pressable accessibilityRole="button" onPress={() => { if (foregroundNotification.target) setRequestedRoute(foregroundNotification.target); setForegroundNotification(null); }} style={styles.notificationBanner}>
      <View style={styles.notificationDot} /><View style={styles.notificationTextArea}><Text style={styles.notificationTitle} numberOfLines={1}>{foregroundNotification.title}</Text><Text style={styles.notificationBody} numberOfLines={2}>{foregroundNotification.body}</Text></View>{foregroundNotification.target ? <Text style={styles.notificationAction}>Apri</Text> : null}
    </Pressable> : null}
  </View>;
}

function AuthenticationNavigator(): React.JSX.Element {
  return <AuthStack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false, animation: 'fade', gestureEnabled: true, contentStyle: { backgroundColor: ui.colors.background } }}>
    <AuthStack.Screen name="Login" component={LoginRoute} /><AuthStack.Screen name="SignUp" component={SignUpRoute} />
  </AuthStack.Navigator>;
}

type LoginRouteProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
type SignUpRouteProps = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;
function LoginRoute({ navigation }: LoginRouteProps): React.JSX.Element { return <LoginScreen onShowRegister={() => navigation.navigate('SignUp')} />; }
function SignUpRoute({ navigation }: SignUpRouteProps): React.JSX.Element { return <SignUpScreen onShowLogin={() => navigation.navigate('Login')} />; }

function AuthenticatedApp({ requestedRoute, onRequestedRouteHandled }: { requestedRoute: MainRoute | null; onRequestedRouteHandled: () => void }): React.JSX.Element {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [route, setRoute] = useState<MainRoute>('home');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => { if (requestedRoute) { setRoute(requestedRoute); setMoreOpen(false); onRequestedRouteHandled(); } }, [requestedRoute, onRequestedRouteHandled]);

  const mobileActive = useMemo<MobileTab>(() => {
    if (route === 'home' || route === 'calendar' || route === 'children' || route === 'expenses') return route;
    return 'more';
  }, [route]);

  const navigate = (next: MainRoute): void => { setRoute(next); setMoreOpen(false); };
  const navigateFromHome = (target: HomeDestination): void => navigate(target as MainRoute);

  const page = <View style={styles.page}>
    {route === 'home' ? <HomeScreen onNavigate={navigateFromHome} /> : null}
    {route === 'calendar' ? <CalendarScreen /> : null}
    {route === 'permanence' ? <PermanenceScreen /> : null}
    {route === 'children' ? <ChildrenScreen /> : null}
    {route === 'expenses' ? <ExpensesScreen /> : null}
    {route === 'agreements' ? <AgreementsScreen /> : null}
    {route === 'messages' ? <MessagesScreen /> : null}
    {route === 'documents' ? <DocumentsScreen /> : null}
    {route === 'dossier' ? <DossierScreen /> : null}
    {route === 'notifications' ? <NotificationsScreen /> : null}
    {route === 'settings' ? <SettingsScreen /> : null}
    {route === 'family' ? <FamilyCard /> : null}
  </View>;

  return <SafeAreaView style={styles.safeArea}>
    <StatusBar barStyle="dark-content" backgroundColor={ui.colors.background} />
    {desktop ? <View style={styles.desktopShell}><DesktopSidebar route={route} navigate={navigate} />{page}</View> : <>{page}<MobileNavigation active={mobileActive} onNavigate={(key) => { if (key === 'more') setMoreOpen(true); else navigate(key); }} /></>}
    <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
      <Pressable style={styles.moreBackdrop} onPress={() => setMoreOpen(false)}><Pressable style={styles.moreSheet} onPress={(event) => event.stopPropagation()}>
        <View style={styles.sheetHandle} /><View style={styles.moreHeader}><View><Text style={styles.moreTitle}>Tutto DueCase</Text><Text style={styles.moreSubtitle}>Scegli una sezione</Text></View><Pressable style={styles.close} onPress={() => setMoreOpen(false)}><Ionicons name="close" size={22} color={ui.colors.text} /></Pressable></View>
        <View style={styles.moreGrid}>{navigationItems.filter((item) => !['home','calendar','children','expenses'].includes(item.key)).map((item) => <Pressable key={item.key} onPress={() => navigate(item.key)} style={[styles.moreItem, route === item.key && styles.moreItemActive]}><View style={styles.moreIcon}><Ionicons name={item.icon} size={23} color={ui.colors.primary} /></View><Text style={styles.moreItemText}>{item.label}</Text></Pressable>)}</View>
      </Pressable></Pressable>
    </Modal>
  </SafeAreaView>;
}

function DesktopSidebar({ route, navigate }: { route: MainRoute; navigate: (route: MainRoute) => void }): React.JSX.Element {
  const { user } = useAuth();
  const role = user?.role === 'mother' ? 'Mamma' : 'Papà';
  return <View style={styles.sidebar}>
    <View style={styles.brand}><View style={styles.brandMark}><Ionicons name="home" size={20} color="#FFF" /></View><View><Text style={styles.brandName}>DueCase</Text><Text style={styles.brandPayoff}>Un’unica squadra</Text></View></View>
    <View style={styles.sidebarNav}>{navigationItems.map((item) => <Pressable key={item.key} onPress={() => navigate(item.key)} style={[styles.sideItem, route === item.key && styles.sideItemActive]}><Ionicons name={item.icon} size={20} color={route === item.key ? ui.colors.primary : ui.colors.muted} /><Text style={[styles.sideText, route === item.key && styles.sideTextActive]}>{item.label}</Text></Pressable>)}</View>
    <View style={styles.sidebarUser}><View style={styles.userAvatar}><Ionicons name={user?.role === 'mother' ? 'woman-outline' : 'man-outline'} size={20} color={ui.colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.userName} numberOfLines={1}>{user?.displayName}</Text><Text style={styles.userRole}>{role}</Text></View></View>
  </View>;
}

function MobileNavigation({ active, onNavigate }: { active: MobileTab; onNavigate: (route: MobileTab) => void }): React.JSX.Element {
  return <View style={styles.mobileNav}>{mobileTabs.map((item) => { const selected = item.key === active; return <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onNavigate(item.key)} style={styles.mobileNavItem}><View style={[styles.mobileIconWrap, selected && styles.mobileIconWrapActive]}><Ionicons name={item.icon} size={22} color={selected ? ui.colors.primary : ui.colors.muted} /></View><Text numberOfLines={1} style={[styles.mobileNavText, selected && styles.mobileNavTextActive]}>{item.label}</Text></Pressable>; })}</View>;
}

function FamilyCard(): React.JSX.Element {
  const { user } = useAuth();
  return <View style={styles.familyScreen}><View style={styles.familyCard}><View style={styles.familyIcon}><Ionicons name="people-outline" size={34} color={ui.colors.primary} /></View><Text style={styles.familyTitle}>{user?.family?.name ?? 'La tua famiglia'}</Text><Text style={styles.familyCode}>Codice famiglia: {user?.family?.inviteCode ?? '—'}</Text><Text style={styles.familyText}>Condividi questo codice solo con l’altro genitore per entrare nella stessa famiglia DueCase.</Text></View></View>;
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: ui.colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ui.colors.background },
  loadingText: { color: ui.colors.muted },
  safeArea: { flex: 1, backgroundColor: ui.colors.background },
  desktopShell: { flex: 1, flexDirection: 'row' },
  page: { flex: 1, minWidth: 0, backgroundColor: ui.colors.background },
  sidebar: { width: 232, backgroundColor: '#FFF', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: ui.colors.border, paddingHorizontal: 12, paddingTop: Platform.OS === 'web' ? 18 : 8, paddingBottom: 14 },
  brand: { minHeight: 64, paddingHorizontal: 8, flexDirection: 'row', gap: 10, alignItems: 'center' },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 18, fontWeight: '900', color: ui.colors.primaryDark },
  brandPayoff: { fontSize: 10, color: ui.colors.muted },
  sidebarNav: { flex: 1, paddingTop: 8, gap: 3 },
  sideItem: { minHeight: 43, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', gap: 10, alignItems: 'center' },
  sideItemActive: { backgroundColor: ui.colors.primarySoft },
  sideText: { color: ui.colors.muted, fontWeight: '800', fontSize: 13 },
  sideTextActive: { color: ui.colors.primary, fontWeight: '900' },
  sidebarUser: { borderTopWidth: 1, borderTopColor: ui.colors.border, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  userAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 12, fontWeight: '900', color: ui.colors.primaryDark },
  userRole: { fontSize: 10, color: ui.colors.muted, marginTop: 1 },
  mobileNav: { flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.colors.border, paddingTop: 5, paddingBottom: Platform.OS === 'ios' ? 3 : 5, paddingHorizontal: 4 },
  mobileNavItem: { flex: 1, minHeight: 59, alignItems: 'center', justifyContent: 'center', gap: 2 },
  mobileIconWrap: { width: 40, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mobileIconWrapActive: { backgroundColor: ui.colors.primarySoft },
  mobileNavText: { color: ui.colors.muted, fontSize: 9, fontWeight: '800' },
  mobileNavTextActive: { color: ui.colors.primary, fontWeight: '900' },
  moreBackdrop: { flex: 1, backgroundColor: 'rgba(10,50,103,0.30)', justifyContent: 'flex-end' },
  moreSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingBottom: 28, paddingTop: 8 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: ui.colors.border, alignSelf: 'center', marginBottom: 12 },
  moreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  moreTitle: { fontSize: 22, fontWeight: '900', color: ui.colors.primaryDark },
  moreSubtitle: { color: ui.colors.muted, fontSize: 12 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: ui.colors.input, alignItems: 'center', justifyContent: 'center' },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  moreItem: { width: '31.5%', minHeight: 92, borderRadius: 15, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.background, padding: 10, justifyContent: 'center', alignItems: 'center', gap: 7 },
  moreItemActive: { backgroundColor: ui.colors.primarySoft, borderColor: '#A8CDEF' },
  moreIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  moreItemText: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 11, textAlign: 'center' },
  familyScreen: { flex: 1, backgroundColor: ui.colors.background, padding: 20, alignItems: 'center', justifyContent: 'center' },
  familyCard: { width: '100%', maxWidth: 600, backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: ui.colors.border, padding: 26, alignItems: 'center', gap: 8 },
  familyIcon: { width: 68, height: 68, borderRadius: 20, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  familyTitle: { fontSize: 24, fontWeight: '900', color: ui.colors.primaryDark },
  familyCode: { color: ui.colors.primary, fontWeight: '900' },
  familyText: { color: ui.colors.muted, textAlign: 'center', lineHeight: 20, maxWidth: 420 },
  notificationBanner: { position: 'absolute', top: 54, left: 14, right: 14, maxWidth: 720, alignSelf: 'center', minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.card, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8, zIndex: 100 },
  notificationDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ui.colors.primary },
  notificationTextArea: { flex: 1, gap: 3 },
  notificationTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 14 },
  notificationBody: { color: ui.colors.muted, fontSize: 13, lineHeight: 18 },
  notificationAction: { color: ui.colors.primary, fontWeight: '900', fontSize: 12 },
});
