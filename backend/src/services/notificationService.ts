import { randomUUID } from 'node:crypto';
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

export function parentRoleLabel(role: 'father' | 'mother'): 'Papà' | 'Mamma' {
  return role === 'father' ? 'Papà' : 'Mamma';
}

export function parentRoleSubject(role: 'father' | 'mother'): 'Papà' | 'Mamma' {
  return role === 'father' ? 'Papà' : 'Mamma';
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

function notificationType(notification: NotificationInput): string {
  const value = notification.data?.type;
  return typeof value === 'string' && value.trim() ? value.slice(0, 120) : 'general';
}

function notificationEntity(notification: NotificationInput): { type: string | null; id: string | null } {
  const data = notification.data ?? {};
  const candidates: Array<[string, string]> = [
    ['expenseId', 'expense'], ['paymentId', 'expense_payment'], ['agreementId', 'agreement'],
    ['messageId', 'message'], ['eventId', 'event'], ['exceptionId', 'custody_exception'],
    ['documentId', 'document'], ['childId', 'child'],
  ];
  for (const [key, type] of candidates) {
    const value = data[key];
    if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) return { type, id: value };
  }
  return { type: null, id: null };
}

async function persistInAppNotification(
  userId: string,
  familyId: string,
  notification: NotificationInput,
): Promise<void> {
  try {
    const entity = notificationEntity(notification);
    await pool.query(
      `INSERT INTO in_app_notifications
        (id, family_id, user_id, type, title, body, entity_type, entity_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), familyId, userId, notificationType(notification), notification.title, notification.body, entity.type, entity.id],
    );
  } catch (error) {
    // La notifica non deve mai annullare l'azione principale.
    console.error('Unable to persist in-app notification', { userId, familyId, error });
  }
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
      if (ticket.details?.error === 'DeviceNotRegistered') await clearInvalidToken(userId, token);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Expo push notification failed', { userId, error });
    return false;
  }
}

export async function sendPushToUser(userId: string, notification: NotificationInput): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ familyId: string | null; expoPushToken: string | null }>(
      `SELECT family_id AS "familyId", expo_push_token AS "expoPushToken"
         FROM users
        WHERE id = $1`,
      [userId],
    );

    const recipient = rows[0];
    if (!recipient) return false;
    if (recipient.familyId) await persistInAppNotification(userId, recipient.familyId, notification);
    if (!recipient.expoPushToken) return false;
    return await deliver(userId, recipient.expoPushToken, notification);
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
    if (!recipient) return false;
    await persistInAppNotification(recipient.id, familyId, notification);
    if (!recipient.expoPushToken) return false;
    return await deliver(recipient.id, recipient.expoPushToken, notification);
  } catch (error) {
    console.error('Unable to load other parent push token', { familyId, actorUserId, error });
    return false;
  }
}
