import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Linking } from 'react-native';
import { api, ApiClientError, setApiToken } from '../services/api';
import { registerPushNotificationsAsync, unregisterPushNotificationsAsync } from '../services/notifications';
import {
  clearPendingParentInvite,
  getPendingParentInvite,
  parseParentInviteUrl,
  rememberParentInvite,
} from '../services/parentInvitations';
import { clearStoredToken, getStoredToken, storeToken } from '../services/tokenStorage';
import type { AuthUser, RegisterInput } from '../types/models';

type AuthContextValue = {
  user: AuthUser | null;
  booting: boolean;
  bootError: string | null;
  retrySession: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  replaceToken:(token:string)=>Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const LEGAL_DOCUMENT_VERSION = '2026-10-07';
const handledAuthenticatedInvites = new Set<string>();

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError,setBootError]=useState<string|null>(null);
  const [attempt,setAttempt]=useState(0);
  const retrySession=useCallback(()=>{setBootError(null);setBooting(true);setAttempt(v=>v+1);},[]);

  useEffect(() => {
    let active = true;

    async function restoreSession(): Promise<void> {
      try {
        const token = await getStoredToken();
        if (!token) return;
        setApiToken(token);
        const restoredUser = await api.auth.me();
        if (active) {
          setUser(restoredUser);
          void registerPushNotificationsAsync();
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          setApiToken(null);
          await clearStoredToken();
        } else if(active) setBootError('Connessione non disponibile. Il tuo accesso è conservato: riprova tra poco.');
      } finally {
        if (active) setBooting(false);
      }
    }

    void restoreSession();
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    let handling = false;

    const handleAuthenticatedInvite = async (url: string | null | undefined): Promise<void> => {
      if (!active) return;
      const invite = parseParentInviteUrl(url);
      if (!invite) return;

      const pending = getPendingParentInvite();
      if (pending?.inviteCode === invite.inviteCode) return;

      const handledKey = `${user.id}:${invite.inviteCode}`;
      if (handledAuthenticatedInvites.has(handledKey)) return;
      handledAuthenticatedInvites.add(handledKey);

      if (invite.email !== user.email.trim().toLowerCase()) {
        Alert.alert('Invito DueCase', `Questo invito è destinato a ${invite.email}. Accedi con quell’indirizzo email per continuare.`);
        return;
      }

      if (user.familyId) {
        Alert.alert('Invito DueCase', 'Questo account è già collegato a una famiglia. Se l’invito riguarda un altro account, esci e accedi con l’indirizzo email indicato nell’invito.');
        return;
      }

      rememberParentInvite(invite);
      if (handling) return;
      handling = true;
      try {
        await api.family.join(invite.inviteCode);
        const refreshedUser = await api.auth.me();
        if (!active) return;
        setUser(refreshedUser);
        clearPendingParentInvite();
        Alert.alert('Invito accettato', 'Ora sei collegato alla famiglia condivisa su DueCase.');
      } catch (error) {
        if (!active) return;
        Alert.alert('Invito non accettato', error instanceof Error ? error.message : 'Non è stato possibile collegare l’account alla famiglia.');
      } finally {
        handling = false;
      }
    };

    void Linking.getInitialURL().then((url) => handleAuthenticatedInvite(url)).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => { void handleAuthenticatedInvite(url); });
    return () => { active = false; subscription.remove(); };
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.auth.login({ email, password });
    setApiToken(result.token);
    await storeToken(result.token);
    setUser(result.user);
    void registerPushNotificationsAsync();
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const payload = {
      ...input,
      privacyAcknowledged: true,
      privacyPolicyVersion: LEGAL_DOCUMENT_VERSION,
      termsAccepted: true,
      termsVersion: LEGAL_DOCUMENT_VERSION,
    };
    const result = await api.auth.register(payload);
    setApiToken(result.token);
    await storeToken(result.token);
    setUser(result.user);
    void registerPushNotificationsAsync();
  }, []);

  const refreshUser = useCallback(async () => {
    const refreshed = await api.auth.me();
    setUser(refreshed);
  }, []);

  const logout = useCallback(async () => {
    await unregisterPushNotificationsAsync();
    await api.auth.logoutSession().catch(()=>{});
    setApiToken(null);
    setUser(null);
    await clearStoredToken();
  }, []);

  const replaceToken=useCallback(async(token:string)=>{setApiToken(token);await storeToken(token);void registerPushNotificationsAsync();},[]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    booting, bootError, retrySession,
    login,
    register,
    refreshUser,
    logout, replaceToken,
  }), [user, booting, bootError, retrySession, login, register, refreshUser, logout, replaceToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
