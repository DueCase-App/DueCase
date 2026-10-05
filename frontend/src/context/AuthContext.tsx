import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setApiToken } from '../services/api';
import { clearStoredToken, getStoredToken, storeToken } from '../services/tokenStorage';
import type { AuthUser, ParentRole } from '../types/models';

type RegisterInput = {
  displayName: string;
  email: string;
  password: string;
  role: ParentRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession(): Promise<void> {
      try {
        const token = await getStoredToken();
        if (!token) return;
        setApiToken(token);
        const restoredUser = await api.auth.me();
        if (active) setUser(restoredUser);
      } catch {
        setApiToken(null);
        await clearStoredToken();
      } finally {
        if (active) setBooting(false);
      }
    }

    void restoreSession();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.auth.login({ email, password });
    setApiToken(result.token);
    await storeToken(result.token);
    setUser(result.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.auth.register(input);
    setApiToken(result.token);
    await storeToken(result.token);
    setUser(result.user);
  }, []);

  const refreshUser = useCallback(async () => {
    const refreshed = await api.auth.me();
    setUser(refreshed);
  }, []);

  const logout = useCallback(async () => {
    setApiToken(null);
    setUser(null);
    await clearStoredToken();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    booting,
    login,
    register,
    refreshUser,
    logout,
  }), [user, booting, login, register, refreshUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
