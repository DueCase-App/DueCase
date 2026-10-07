import { API_URL } from './api';
import { getStoredToken } from './tokenStorage';
import type { ParentRole } from '../types/models';

export type ParentInvitationStatus = {
  email: string | null;
  role: ParentRole;
  status: 'none' | 'pending' | 'accepted';
  sentAt: string | null;
  expiresAt: string | null;
};

export type ParentInviteLink = {
  inviteCode: string;
  email: string;
  role: ParentRole;
};

let pendingInviteLink: ParentInviteLink | null = null;

async function invitationRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getStoredToken();
  if (!token) throw new Error('Accedi a DueCase per continuare.');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error;
    throw new Error(message || 'Operazione non riuscita. Riprova.');
  }
  return payload as T;
}

export const parentInvitations = {
  status: () => invitationRequest<ParentInvitationStatus>('/family/parent-invitation'),
  send: (email: string) => invitationRequest<ParentInvitationStatus>('/family/parent-invitation', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  resend: () => invitationRequest<ParentInvitationStatus>('/family/parent-invitation/resend', { method: 'POST' }),
  cancel: () => invitationRequest<{ canceled: true }>('/family/parent-invitation', { method: 'DELETE' }),
};

export function parseParentInviteUrl(url: string | null | undefined): ParentInviteLink | null {
  if (!url) return null;
  try {
    const normalized = url.replace(/^duecase:\/\//i, 'https://duecase.local/');
    const parsed = new URL(normalized);
    const isRegister = parsed.pathname.replace(/^\//, '') === 'register' || parsed.hostname === 'register';
    if (!isRegister) return null;
    const inviteCode = parsed.searchParams.get('inviteCode')?.trim().toUpperCase() ?? '';
    const email = parsed.searchParams.get('email')?.trim().toLowerCase() ?? '';
    const role = parsed.searchParams.get('role');
    if (inviteCode.length < 6 || !email.includes('@') || (role !== 'father' && role !== 'mother')) return null;
    return { inviteCode, email, role };
  } catch {
    return null;
  }
}

export function rememberParentInvite(invite: ParentInviteLink): void {
  pendingInviteLink = invite;
}

export function getPendingParentInvite(): ParentInviteLink | null {
  return pendingInviteLink;
}

export function clearPendingParentInvite(): void {
  pendingInviteLink = null;
}
