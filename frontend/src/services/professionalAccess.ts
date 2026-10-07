import { API_URL } from './api';
import { getStoredToken } from './tokenStorage';

export type ProfessionalScope = 'calendar'|'expenses'|'agreements'|'documents'|'dossier'|'messages';
export type ProfessionalInvitation = {
  id: string;
  email: string;
  scopes: ProfessionalScope[];
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt?: string;
  status: 'pending'|'accepted'|'expired'|'revoked';
};
export type ProfessionalGrant = {
  id: string;
  professionalId: string;
  email: string;
  displayName: string;
  organization: string | null;
  scopes: ProfessionalScope[];
  createdAt: string;
};
export type ProfessionalAccessState = { invitations: ProfessionalInvitation[]; grants: ProfessionalGrant[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getStoredToken();
  if (!token) throw new Error('Sessione non disponibile. Accedi nuovamente.');
  const response = await fetch(`${API_URL}/professionals${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? `HTTP ${response.status}`);
  return payload as T;
}

export const professionalAccess = {
  list: () => request<ProfessionalAccessState>(''),
  invite: (email: string, scopes: ProfessionalScope[]) => request<ProfessionalInvitation>('/invitations', {
    method: 'POST', body: JSON.stringify({ email, scopes }),
  }),
  resend: (id: string) => request<ProfessionalInvitation>(`/invitations/${encodeURIComponent(id)}/resend`, { method: 'POST' }),
  cancelInvitation: async (id: string) => {
    const token = await getStoredToken();
    if (!token) throw new Error('Sessione non disponibile. Accedi nuovamente.');
    const response = await fetch(`${API_URL}/professionals/invitations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok && response.status !== 204) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? `HTTP ${response.status}`);
    }
  },
  updateGrant: (id: string, scopes: ProfessionalScope[]) => request<{id:string;scopes:ProfessionalScope[];updatedAt:string}>(`/grants/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ scopes }),
  }),
  revokeGrant: async (id: string) => {
    const token = await getStoredToken();
    if (!token) throw new Error('Sessione non disponibile. Accedi nuovamente.');
    const response = await fetch(`${API_URL}/professionals/grants/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok && response.status !== 204) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? `HTTP ${response.status}`);
    }
  },
};
