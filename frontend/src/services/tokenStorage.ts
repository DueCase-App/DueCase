import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'separatedParents.accessToken';

type WebStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void; };

function webStorage(): WebStorage | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as typeof globalThis & { localStorage?: WebStorage }).localStorage ?? null;
}

export async function getStoredToken(): Promise<string | null> {
  const storage = webStorage();
  if (storage) return storage.getItem(TOKEN_KEY);
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function storeToken(token: string): Promise<void> {
  const storage = webStorage();
  if (storage) { storage.setItem(TOKEN_KEY, token); return; }
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  const storage = webStorage();
  if (storage) { storage.removeItem(TOKEN_KEY); return; }
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
