import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId(): string | null {
  const easProjectId = Constants.easConfig?.projectId;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return easProjectId ?? extra?.eas?.projectId ?? null;
}

async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('duecase-events', {
    name: 'DueCase - attività famiglia',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export async function registerPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    await configureAndroidChannel();

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      console.info('Push notification permission was not granted.');
      return null;
    }

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
