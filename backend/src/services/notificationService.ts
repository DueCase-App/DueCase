import { Expo } from 'expo-server-sdk';
import { pool } from '../db.js';

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
});

export type NotificationData = Record<string, string | number | boolean | null>;

export type NotificationInput = {
  title: string;
  body: string;
  data?: NotificationData;
};

export function parentRoleLabel(role: 'father' | 'mother'): 'Padre' | 'Madre' {
  return role === 'father' ? 'Padre' : 'Madre';
}

export function formatItalianDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatEuroAmount(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return `${value} €`;
  return `${numeric.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function isValidExpoPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}

async function clearInvalidToken(userId: string, token: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE users
          SET expo_push_token = NULL, updated_at = NOW()
        WHERE id = $1 AND expo_push_token = $2`,
      [userId, token],
    );
  } catch (error) {
    console.error('Unable to clear invalid Expo push token', { userId, error });
  }
}

async function deliver(userId: string, token: string, notification: NotificationInput): Promise<boolean> {
  if (!Expo.isExpoPushToken(token)) {
    console.warn('Ignoring invalid Expo push token', { userId });
    await clearInvalidToken(userId, token);
    return false;
  }

  try {
    const [ticket] = await expo.sendPushNotificationsAsync([{
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data,
      channelId: 'duecase-events',
      priority: 'high',
    }]);

    if (!ticket) {
      console.error('Expo push service returned no ticket', { userId });
      return false;
    }

    if (ticket.status === 'error') {
      console.error('Expo push notification rejected', {
        userId,
        message: ticket.message,
        details: ticket.details,
      });

      if (ticket.details?.error === 'DeviceNotRegistered') {
        await clearInvalidToken(userId, token);
      }
      return false;
    }

    return true;
  } catch (error) {
    // Notifications must never roll back the business action that triggered them.
    console.error('Expo push notification failed', { userId, error });
    return false;
  }
}

export async function sendPushToUser(userId: string, notification: NotificationInput): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ expoPushToken: string | null }>(
      `SELECT expo_push_token AS "expoPushToken"
         FROM users
        WHERE id = $1`,
      [userId],
    );

    const token = rows[0]?.expoPushToken;
    if (!token) return false;
    return await deliver(userId, token, notification);
  } catch (error) {
    console.error('Unable to load push token for user', { userId, error });
    return false;
  }
}

export async function sendPushToOtherParent(
  familyId: string,
  actorUserId: string,
  notification: NotificationInput,
): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ id: string; expoPushToken: string | null }>(
      `SELECT id, expo_push_token AS "expoPushToken"
         FROM users
        WHERE family_id = $1
          AND id <> $2
        ORDER BY created_at ASC
        LIMIT 1`,
      [familyId, actorUserId],
    );

    const recipient = rows[0];
    if (!recipient?.expoPushToken) return false;
    return await deliver(recipient.id, recipient.expoPushToken, notification);
  } catch (error) {
    console.error('Unable to load other parent push token', { familyId, actorUserId, error });
    return false;
  }
}
