import { EmailVerification } from './src/components/EmailVerification';
import { SafeModal as Modal } from './src/components/SafeModal';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { LiveProvider, useLiveCounts } from './src/context/LiveContext';
import { SignUpScreen } from './src/screens/SignUpScreen';
import { initializePushNotificationsAsync } from './src/services/notifications';
import { cardShadow, ui } from './src/theme/ui';

type MainRoute = 'home' | 'calendar' | 'permanence' | 'children' | 'expenses' | 'agreements' | 'messages' | 'documents' | 'dossier' | 'notifications' | 'settings' | 'family';
type MobileTab = 'home' | 'calendar' | 'agreements' | 'expenses' | 'more';
type AuthStackParamList = { Login: undefined; SignUp: undefined };
type ForegroundNotification = { title: string; body: string; target: MainRoute | null };
type NavigationItem = { key: MainRoute; label: string; icon: keyof typeof Ionicons.glyphMap };

const APP_STARTED_AT = Date.now();
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
  { key: 'agreements', label: 'Accordi', icon: 'document-text-outline' },
  { key: 'expenses', label: 'Spese', icon: 'wallet-outline' },
  { key: 'more', label: 'Menu', icon: 'grid-outline' },
];

function routeFromNotificationData(data: Record<string, unknown> | undefined): MainRoute | null {
  const screen = data?.screen;
  if (screen === 'calendar' || screen === 'expenses' || screen === 'documents' || screen === 'messages' || screen === 'agreements' || screen === 'notifications' || screen === 'children' || screen === 'permanence' || screen === 'dossier') return screen;
  return null;
}

export default function App(): React.JSX.Element {
  return <SafeAreaProvider><AuthProvider><LiveProvider><NavigationContainer><Root /></NavigationContainer></LiveProvider></AuthProvider></SafeAreaProvider>;
}

function Root(): React.JSX.Element {
  const { user, booting, bootError, retrySession } = useAuth();
  const insets = useSafeAreaInsets();
  const [minimumSplashElapsed, setMinimumSplashElapsed] = useState(Date.now() - APP_STARTED_AT >= 1000);
  const [requestedRoute, setRequestedRoute] = useState<MainRoute | null>(null);
  const [foregroundNotification, setForegroundNotification] = useState<ForegroundNotification | null>(null);

  useEffect(() => {
    if (minimumSplashElapsed) return undefined;
    const remaining = Math.max(0, 1000 - (Date.now() - APP_STARTED_AT));
    const timer = setTimeout(() => setMinimumSplashElapsed(true), remaining);
    return () => clearTimeout(timer);
  }, [minimumSplashElapsed]);

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
    return () => {
      active = false;
      if (hideTimer) clearTimeout(hideTimer);
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // The branded/photo splash is intentionally visible for one second only.
  if (!minimumSplashElapsed) return <BrandSplash />;
  if (booting) return <BootLoader />;
  if (bootError) return <SafeAreaView style={[styles.fill,{justifyContent:'center',padding:28,gap:20}]}><Text style={{color:ui.colors.text}}>{bootError}</Text><Pressable onPress={retrySession} style={{padding:16,backgroundColor:ui.colors.primary,borderRadius:14}}><Text style={{color:'white',textAlign:'center',fontWeight:'800'}}>Riprova connessione</Text></Pressable></SafeAreaView>;

  let content: React.JSX.Element;
  if (!user) content = <AuthenticationNavigator />;
  else if(user.verificationRequired && !user.emailVerifiedAt) content=<SafeAreaView style={[styles.fill,{padding:24,justifyContent:"center"}]}><EmailVerification/></SafeAreaView>;
  else if (!user.familyId) content = <LinearGradient colors={ui.gradients.page} style={styles.fill}><SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}><FamilyOnboardingScreen /></SafeAreaView></LinearGradient>;
  else content = <AuthenticatedApp requestedRoute={requestedRoute} onRequestedRouteHandled={() => setRequestedRoute(null)} />;

  return <View style={styles.appRoot}>
    {content}
    {foregroundNotification ? <Pressable accessibilityRole="button" onPress={() => { if (foregroundNotification.target) setRequestedRoute(foregroundNotification.target); setForegroundNotification(null); }} style={[styles.notificationBanner, { top: Math.max(insets.top + 10, 16) }]}>
      <View style={styles.notificationDot} /><View style={styles.notificationTextArea}><Text style={styles.notificationTitle} numberOfLines={1}>{foregroundNotification.title}</Text><Text style={styles.notificationBody} numberOfLines={2}>{foregroundNotification.body}</Text></View>{foregroundNotification.target ? <Text style={styles.notificationAction}>Apri</Text> : null}
    </Pressable> : null}
  </View>;
}

function BrandSplash(): React.JSX.Element {
  return <LinearGradient colors={ui.gradients.page} style={styles.splash}>
    <StatusBar hidden />
    <ImageBackground source={require('./assets/splash-background-hd.png')} resizeMode="cover" style={styles.splashImage}>
      <View style={{position:'absolute',top:'9%',width:'90%',alignItems:'center'}}>
        <Image source={require('./assets/duecase-logo-hd.png')} resizeMode="contain" style={{width:155,height:155,marginBottom:-25}} />
        <Text style={{fontSize:42,fontWeight:'900',color:'#0C2049'}}>DueCase</Text>
        <Text style={{fontSize:17,fontWeight:'800',color:'#0C2049',textAlign:'center'}}>Due case, un’unica squadra.</Text>
        <Text style={{fontSize:14,lineHeight:21,color:'#163653',textAlign:'center',marginTop:16,maxWidth:300}}>Organizza, concorda e documenta la gestione dei tuoi figli in modo semplice e sicuro.</Text>
      </View>
    </ImageBackground>
  </LinearGradient>;
}

function BootLoader(): React.JSX.Element {
  return <LinearGradient colors={ui.gradients.page} style={styles.splash}>
    <StatusBar barStyle="dark-content" backgroundColor={ui.colors.backgroundSolid} translucent={false} />
    <Image source={require('./assets/duecase-logo-hd.png')} resizeMode="contain" style={styles.bootLogo} />
    <Text style={styles.bootText}>Apertura di DueCase…</Text>
  </LinearGradient>;
}

function AuthenticationNavigator(): React.JSX.Element {
  return <AuthStack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false, animation: 'fade', gestureEnabled: true, contentStyle: { backgroundColor: ui.colors.backgroundSolid } }}>
    <AuthStack.Screen name="Login" component={LoginRoute} /><AuthStack.Screen name="SignUp" component={SignUpRoute} />
  </AuthStack.Navigator>;
}

type LoginRouteProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
type SignUpRouteProps = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;
function LoginRoute({ navigation }: LoginRouteProps): React.JSX.Element { return <LoginScreen onShowRegister={() => navigation.navigate('SignUp')} />; }
function SignUpRoute({ navigation }: SignUpRouteProps): React.JSX.Element { return <SignUpScreen onShowLogin={() => navigation.navigate('Login')} />; }

function AuthenticatedApp({ requestedRoute, onRequestedRouteHandled }: { requestedRoute: MainRoute | null; onRequestedRouteHandled: () => void }): React.JSX.Element {
 const counts=useLiveCounts();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= 900;
  const [routeHistory, setRouteHistory] = useState<MainRoute[]>(['home']);
  const [moreOpen, setMoreOpen] = useState(false);
  const [permanenceDate,setPermanenceDate]=useState<string|undefined>();
  const [keyboardOpen,setKeyboardOpen]=useState(false);
  useEffect(()=>{const a=Keyboard.addListener('keyboardDidShow',()=>setKeyboardOpen(true));const b=Keyboard.addListener('keyboardDidHide',()=>setKeyboardOpen(false));return()=>{a.remove();b.remove();};},[]);
  const route = routeHistory[routeHistory.length - 1] ?? 'home';

  useEffect(() => {
    if (!requestedRoute) return;
    setRouteHistory((current) => current[current.length - 1] === requestedRoute ? current : [...current, requestedRoute]);
    setMoreOpen(false); onRequestedRouteHandled();
  }, [requestedRoute, onRequestedRouteHandled]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (moreOpen) { setMoreOpen(false); return true; }
      if (routeHistory.length > 1) { setRouteHistory((current) => current.slice(0, -1)); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [moreOpen, routeHistory.length]);

  const mobileActive = useMemo<MobileTab>(() => route === 'home' || route === 'calendar' || route === 'agreements' || route === 'expenses' ? route : 'more', [route]);
  const navigate = (next: MainRoute): void => { setRouteHistory((current) => current[current.length - 1] === next ? current : [...current, next]); setMoreOpen(false); };
  const page = <LinearGradient colors={ui.gradients.page} style={styles.page}>
    {route === 'home' ? <HomeScreen onNavigate={(target: HomeDestination) => navigate(target as MainRoute)} /> : null}
    {route === 'calendar' ? <CalendarScreen onProposeChange={date=>{setPermanenceDate(date);navigate('permanence');}} /> : null}{route === 'permanence' ? <PermanenceScreen initialDate={permanenceDate} /> : null}{route === 'children' ? <ChildrenScreen /> : null}{route === 'expenses' ? <ExpensesScreen /> : null}{route === 'agreements' ? <AgreementsScreen /> : null}{route === 'messages' ? <MessagesScreen /> : null}{route === 'documents' ? <DocumentsScreen /> : null}{route === 'dossier' ? <DossierScreen /> : null}{route === 'notifications' ? <NotificationsScreen onNavigate={(target)=>navigate(target as MainRoute)} /> : null}{route === 'settings' ? <SettingsScreen onNavigate={(target)=>navigate(target as MainRoute)} /> : null}{route === 'family' ? <FamilyCard /> : null}
  </LinearGradient>;

  return <View style={styles.authenticatedRoot}>
    <StatusBar barStyle="dark-content" backgroundColor={ui.colors.backgroundSolid} translucent={false} />
    {desktop ? <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}><View style={styles.desktopShell}><DesktopSidebar route={route} navigate={navigate} />{page}</View></SafeAreaView> : <><SafeAreaView style={styles.mobilePageSafeArea} edges={['top', 'left', 'right']}>{page}</SafeAreaView>{!keyboardOpen&&<SafeAreaView style={styles.mobileNavSafeArea} edges={['bottom', 'left', 'right']}><MobileNavigation active={mobileActive} onNavigate={(key) => key === 'more' ? setMoreOpen(true) : navigate(key)} /></SafeAreaView>}</>}
    <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}><Pressable style={styles.moreBackdrop} onPress={() => setMoreOpen(false)}><Pressable style={[styles.moreSheet, { paddingBottom: Math.max(28, insets.bottom + 20) }]} onPress={(event) => event.stopPropagation()}>
      <View style={styles.sheetHandle} /><View style={styles.moreHeader}><View><Text style={styles.moreTitle}>Tutto DueCase</Text><Text style={styles.moreSubtitle}>Scegli una sezione</Text></View><Pressable style={styles.close} onPress={() => setMoreOpen(false)}><Ionicons name="close" size={22} color={ui.colors.text} /></Pressable></View>
      <View style={styles.moreGrid}>{navigationItems.filter((item) => !['home', 'calendar', 'agreements', 'expenses'].includes(item.key)).map((item) => <Pressable key={item.key} onPress={() => navigate(item.key)} style={[styles.moreItem, route === item.key && styles.moreItemActive]}><View style={styles.moreIcon}><Ionicons name={item.icon} size={23} color={ui.colors.primary} /></View><CountBadge count={item.key in counts ? counts[item.key as keyof typeof counts] : 0} /><Text style={styles.moreItemText}>{item.label}</Text></Pressable>)}</View>
    </Pressable></Pressable></Modal>
  </View>;
}

function DesktopSidebar({ route, navigate }: { route: MainRoute; navigate: (route: MainRoute) => void }): React.JSX.Element {
 const counts=useLiveCounts();
  const { user } = useAuth();
  return <LinearGradient colors={ui.gradients.nav} style={styles.sidebar}>
    <View style={styles.brand}><Image source={require('./assets/duecase-logo-hd.png')} resizeMode="contain" style={styles.brandLogo} /><View><Text style={styles.brandName}>DueCase</Text><Text style={styles.brandPayoff}>Due case, un’unica squadra.</Text></View></View>
    <View style={styles.sidebarNav}>{navigationItems.map((item) => <Pressable key={item.key} onPress={() => navigate(item.key)} style={[styles.sideItem, route === item.key && styles.sideItemActive]}><Ionicons name={item.icon} size={20} color={route === item.key ? ui.colors.primary : ui.colors.muted} /><CountBadge count={item.key in counts ? counts[item.key as keyof typeof counts] : 0} /><Text style={[styles.sideText, route === item.key && styles.sideTextActive]}>{item.label}</Text></Pressable>)}</View>
    <View style={styles.sidebarUser}><View style={styles.userAvatar}><Ionicons name={user?.role === 'mother' ? 'woman-outline' : 'man-outline'} size={20} color={ui.colors.primary} /></View><View style={styles.flex}><Text style={styles.userName} numberOfLines={1}>{user?.displayName}</Text><Text style={styles.userRole}>{user?.role === 'mother' ? 'Mamma' : 'Papà'}</Text></View></View>
  </LinearGradient>;
}

function MobileNavigation({ active, onNavigate }: { active: MobileTab; onNavigate: (route: MobileTab) => void }): React.JSX.Element {
  const counts=useLiveCounts();
  return <LinearGradient colors={ui.gradients.nav} style={styles.mobileNav}>{mobileTabs.map((item) => { const selected = item.key === active; return <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onNavigate(item.key)} style={styles.mobileNavItem}><View style={[styles.mobileIconWrap, selected && styles.mobileIconWrapActive]}><Ionicons name={item.icon} size={22} color={selected ? ui.colors.primary : ui.colors.muted} /></View><CountBadge count={item.key === "more" ? Math.max(counts.notifications, counts.messages) : item.key in counts ? counts[item.key as keyof typeof counts] : 0} /><Text numberOfLines={1} style={[styles.mobileNavText, selected && styles.mobileNavTextActive]}>{item.label}</Text></Pressable>; })}</LinearGradient>;
}

function CountBadge({count}:{count:number}): React.JSX.Element | null {
 return count>0?<View style={{position:'absolute',right:4,top:0,minWidth:19,height:19,borderRadius:10,backgroundColor:ui.colors.danger,alignItems:'center',justifyContent:'center',paddingHorizontal:3}}><Text style={{color:'white',fontSize:10,fontWeight:'800'}}>{count>99?'99+':count}</Text></View>:null;
}

function FamilyCard(): React.JSX.Element {
  const { user } = useAuth();
  return <View style={styles.familyScreen}><View style={styles.familyCard}><Image source={require('./assets/duecase-logo-hd.png')} style={styles.familyLogo} resizeMode="contain" /><Text style={styles.familyTitle}>{user?.family?.name ?? 'La tua famiglia'}</Text><Text style={styles.familyCode}>Codice famiglia: {user?.family?.inviteCode ?? '—'}</Text><Text style={styles.familyText}>Condividi questo codice solo con l’altro genitore per entrare nella stessa famiglia DueCase.</Text></View></View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, appRoot: { flex: 1, backgroundColor: ui.colors.backgroundSolid }, authenticatedRoot: { flex: 1, backgroundColor: ui.colors.backgroundSolid }, safeArea: { flex: 1, backgroundColor: 'transparent' }, mobilePageSafeArea: { flex: 1, backgroundColor: ui.colors.backgroundSolid }, mobileNavSafeArea: { flexShrink: 0, backgroundColor: '#FFF' }, desktopShell: { flex: 1, flexDirection: 'row' }, page: { flex: 1, minWidth: 0 },
  splash: { flex: 1, backgroundColor: ui.colors.cream, alignItems: 'center', justifyContent: 'center' }, splashImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }, splashImageInner: { backgroundColor: ui.colors.cream }, bootLogo: { width: 96, height: 96 }, bootText: { marginTop: 10, color: ui.colors.muted, fontSize: 13, fontWeight: '700' },
  sidebar: { width: 240, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: ui.colors.border, paddingHorizontal: 12, paddingTop: Platform.OS === 'web' ? 18 : 10, paddingBottom: 16 }, brand: { minHeight: 72, paddingHorizontal: 6, flexDirection: 'row', gap: 8, alignItems: 'center' }, brandLogo: { width: 54, height: 54 }, brandName: { fontSize: 20, fontWeight: '900', color: ui.colors.primaryDark }, brandPayoff: { fontSize: 9, color: ui.colors.muted, maxWidth: 145 }, sidebarNav: { flex: 1, paddingTop: 8, gap: 3 }, sideItem: { minHeight: 43, borderRadius: 13, paddingHorizontal: 11, flexDirection: 'row', gap: 10, alignItems: 'center' }, sideItemActive: { backgroundColor: ui.colors.orangeSoft, borderWidth: 1, borderColor: '#FFD6A8' }, sideText: { color: ui.colors.muted, fontWeight: '800', fontSize: 13 }, sideTextActive: { color: ui.colors.primaryDark, fontWeight: '900' }, sidebarUser: { borderTopWidth: 1, borderTopColor: ui.colors.border, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }, userAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1, minWidth: 0 }, userName: { fontSize: 12, fontWeight: '900', color: ui.colors.primaryDark }, userRole: { fontSize: 10, color: ui.colors.muted, marginTop: 1 },
  mobileNav: { flexDirection: 'row', flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.colors.border, paddingTop: 7, paddingBottom: 8, paddingHorizontal: 4 }, mobileNavItem: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 2 }, mobileIconWrap: { width: 42, height: 31, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, mobileIconWrapActive: { backgroundColor: ui.colors.orangeSoft }, mobileNavText: { color: ui.colors.muted, fontSize: 11, fontWeight: '800' }, mobileNavTextActive: { color: ui.colors.primary, fontWeight: '900' },
  moreBackdrop: { flex: 1, backgroundColor: 'rgba(12,43,99,0.32)', justifyContent: 'flex-end' }, moreSheet: { backgroundColor: ui.colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 8 }, sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: ui.colors.border, alignSelf: 'center', marginBottom: 12 }, moreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, moreTitle: { fontSize: 22, fontWeight: '900', color: ui.colors.primaryDark }, moreSubtitle: { color: ui.colors.muted, fontSize: 12 }, close: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, moreItem: { width: '48%', minHeight: 68, borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFF', padding: 10, justifyContent: 'center', alignItems: 'center', gap: 7, ...cardShadow }, moreItemActive: { backgroundColor: ui.colors.orangeSoft, borderColor: '#FFD19B' }, moreIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, moreItemText: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 11, textAlign: 'center' },
  familyScreen: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' }, familyCard: { width: '100%', maxWidth: 600, backgroundColor: '#FFFEFB', borderRadius: 24, borderWidth: 1, borderColor: ui.colors.border, padding: 26, alignItems: 'center', gap: 8, ...cardShadow }, familyLogo: { width: 92, height: 74 }, familyTitle: { fontSize: 24, fontWeight: '900', color: ui.colors.primaryDark }, familyCode: { color: ui.colors.orangeDark, fontWeight: '900' }, familyText: { color: ui.colors.muted, textAlign: 'center', lineHeight: 20, maxWidth: 420 },
  notificationBanner: { position: 'absolute', left: 14, right: 14, maxWidth: 720, alignSelf: 'center', minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: '#FFFEFB', flexDirection: 'row', alignItems: 'center', gap: 10, ...cardShadow, zIndex: 100 }, notificationDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ui.colors.orange }, notificationTextArea: { flex: 1, gap: 3 }, notificationTitle: { color: ui.colors.primaryDark, fontWeight: '900', fontSize: 14 }, notificationBody: { color: ui.colors.muted, fontSize: 13, lineHeight: 18 }, notificationAction: { color: ui.colors.primary, fontWeight: '900', fontSize: 12 },
});
