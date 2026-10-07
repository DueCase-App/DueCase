import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiClientError, setApiToken } from '../services/api';
import { registerPushNotificationsAsync, unregisterPushNotificationsAsync } from '../services/notifications';
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
};

const AuthContext = createContext<AuthContextValue | null>(null);

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

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.auth.login({ email, password });
    setApiToken(result.token);
    await storeToken(result.token);
    setUser(result.user);
    void registerPushNotificationsAsync();
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.auth.register(input);
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
    setApiToken(null);
    setUser(null);
    await clearStoredToken();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    booting, bootError, retrySession,
    login,
    register,
    refreshUser,
    logout,
  }), [user, booting, bootError, retrySession, login, register, refreshUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
