import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    // While the app is open App.tsx renders a dedicated in-app banner.
    // Background/terminated notifications are displayed by the operating system.
    shouldShowBanner: false,
    shouldShowList: true,
  }),
});

let permissionRequestInFlight: Promise<boolean> | null = null;

function getProjectId(): string | null {
  const easProjectId = Constants.easConfig?.projectId;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return easProjectId ?? extra?.eas?.projectId ?? null;
}

async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('duecase-events', {
    name: 'DueCase - attività famiglia',
    description: 'Spese, richieste di scambio e aggiornamenti condivisi della famiglia.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    await configureAndroidChannel();

    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    if (requested.status !== 'granted') {
      console.info('Push notification permission was not granted.');
      return false;
    }

    return true;
  } catch (error) {
    // Notification permissions must never crash app startup.
    console.warn('Unable to initialize notification permissions', error);
    return false;
  }
}

/**
 * Called when the app starts. Multiple callers share the same request so iOS/Android
 * never receive duplicate permission prompts during session restoration.
 */
export async function initializePushNotificationsAsync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (!permissionRequestInFlight) {
    permissionRequestInFlight = requestPermission().finally(() => {
      permissionRequestInFlight = null;
    });
  }

  return permissionRequestInFlight;
}

/**
 * Gets the Expo device token and associates it with the currently authenticated user.
 */
export async function registerPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const granted = await initializePushNotificationsAsync();
    if (!granted) return null;

    const projectId = getProjectId();
    if (!projectId) {
      console.warn('EAS projectId unavailable: Expo push token cannot be created.');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.auth.setPushToken(token);
    return token;
  } catch (error) {
    // Push registration must never block login or app startup.
    console.warn('Unable to register Expo push notifications', error);
    return null;
  }
}

export async function unregisterPushNotificationsAsync(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await api.auth.setPushToken(null);
  } catch (error) {
    // Logout must still succeed if the backend or network is temporarily unavailable.
    console.warn('Unable to clear Expo push token during logout', error);
  }
}
