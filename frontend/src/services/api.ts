import type {
  AuthResponse,
  AuthUser,
  DailyCustody,
  DocumentCategory,
  Expense,
  ExpenseCategory,
  FamilyBalance,
  FamilyActionResponse,
  FamilyDocument,
  ParentRole,
  SwapRequest,
  SwapRequestStatus,
} from '../types/models';

/**
 * DueCase API configuration.
 *
 * Production/preview builds use the Render API by default.
 * During local development, EXPO_PUBLIC_API_URL can override the endpoint:
 * - iOS simulator / web: http://localhost:10000/api
 * - Android emulator:    http://10.0.2.2:10000/api
 * - Physical device:     http://<YOUR_LAN_IP>:10000/api
 */
const PRODUCTION_API_URL = 'https://duecase-api.onrender.com/api';
const LOCAL_DEFAULT_API_URL = 'http://localhost:10000/api';

function normalizeApiUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('EXPO_PUBLIC_API_URL must start with http:// or https://');
  }

  if (!normalized.endsWith('/api')) {
    throw new Error('EXPO_PUBLIC_API_URL must end with /api');
  }

  return normalized;
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = normalizeApiUrl(
  configuredApiUrl || (__DEV__ ? LOCAL_DEFAULT_API_URL : PRODUCTION_API_URL),
);

let accessToken: string | null = null;

function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function setApiToken(token: string | null): void {
  accessToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null) as { error?: string; code?: string } | T | null;

  if (!response.ok) {
    const errorPayload = payload as { error?: string; code?: string } | null;
    throw new ApiClientError(
      errorPayload?.error ?? `HTTP ${response.status}`,
      response.status,
      errorPayload?.code,
    );
  }

  return payload as T;
}

export const api = {
  auth: {
    register: (input: { displayName: string; email: string; password: string; role: ParentRole }) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
    login: (input: { email: string; password: string }) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    me: () => request<AuthUser>('/auth/me'),
  },
  family: {
    create: (name?: string) => request<FamilyActionResponse>('/family/create', { method: 'POST', body: JSON.stringify(name?.trim() ? { name: name.trim() } : {}) }),
    join: (inviteCode: string) => request<FamilyActionResponse>('/family/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }),
  },
  turns: {
    list: (from: string, to: string) => request<DailyCustody[]>(`/turns?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    setDay: (date: string, custodianRole: ParentRole, notes?: string) => request<DailyCustody>(`/turns/${encodeURIComponent(date)}`, { method: 'PUT', body: JSON.stringify({ custodianRole, notes }) }),
  },
  swapRequests: {
    list: (status?: SwapRequestStatus) => request<SwapRequest[]>(`/swap-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    create: (input: { targetDate: string; proposedDate: string; notes?: string }) => request<SwapRequest>('/swap-requests', { method: 'POST', body: JSON.stringify(input) }),
    approve: (id: string) => request<SwapRequest>(`/swap-requests/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
    reject: (id: string) => request<SwapRequest>(`/swap-requests/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
  },
  expenses: {
    list: () => request<Expense[]>('/expenses'),
    balance: () => request<FamilyBalance>('/expenses/balance'),
    create: (input: { title: string; amount: string; category: ExpenseCategory; expenseDate?: string; notes?: string; receipt?: { uri: string; name: string; type: string; file?: Blob } }) => {
      const form = new FormData();
      form.append('title', input.title); form.append('amount', input.amount); form.append('category', input.category);
      if (input.expenseDate) form.append('expenseDate', input.expenseDate);
      if (input.notes?.trim()) form.append('notes', input.notes.trim());
      if (input.receipt) {
        if (input.receipt.file) form.append('receipt', input.receipt.file, input.receipt.name);
        else form.append('receipt', { uri: input.receipt.uri, name: input.receipt.name, type: input.receipt.type } as unknown as Blob);
      }
      return request<Expense>('/expenses', { method: 'POST', body: form });
    },
    approve: (id: string) => request<Expense>(`/expenses/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
    decline: (id: string) => request<Expense>(`/expenses/${encodeURIComponent(id)}/decline`, { method: 'POST' }),
    receiptSource: (path: string) => ({ uri: `${API_URL}${path}`, headers: authHeaders() }),
  },
  documents: {
    list: () => request<FamilyDocument[]>('/documents'),
    create: (input: { title: string; description?: string; category: DocumentCategory; file: { uri: string; name: string; type: string; file?: Blob } }) => {
      const form = new FormData();
      form.append('title', input.title); form.append('category', input.category);
      if (input.description?.trim()) form.append('description', input.description.trim());
      if (input.file.file) form.append('file', input.file.file, input.file.name);
      else form.append('file', { uri: input.file.uri, name: input.file.name, type: input.file.type } as unknown as Blob);
      return request<FamilyDocument>('/documents', { method: 'POST', body: form });
    },
    fileRequest: (path: string, download = false) => ({ url: `${API_URL}${path}${download ? `${path.includes('?') ? '&' : '?'}download=1` : ''}`, headers: authHeaders() }),
    fileSource: (path: string) => ({ uri: `${API_URL}${path}`, headers: authHeaders() }),
  },
};
