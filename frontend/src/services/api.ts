import type {
  AgreementCategory,
  AgreementHistoryItem,
  AgreementStatus,
  AlternatingWeekendPattern,
  AuthResponse,
  AuthUser,
  CustodyCurrent,
  CustodyException,
  CustodyPattern,
  DailyCustody,
  DocumentCategory,
  Expense,
  ExpenseCategory,
  ExpensePayment,
  FamilyActivity,
  FamilyAgreement,
  FamilyBalance,
  FamilyActionResponse,
  FamilyChild,
  FamilyChildInput,
  FamilyDocument,
  FamilyEvent,
  FamilyEventStatus,
  FamilyEventType,
  InAppNotification,
  LegalMessage,
  ParentRole,
  ParentingTimeReport,
  RegisterInput,
  SwapRequest,
  SwapRequestStatus,
  ToneAnalysis,
} from '../types/models';

const PRODUCTION_API_URL = 'https://duecase-api.onrender.com/api';
const LOCAL_DEFAULT_API_URL = 'http://localhost:10000/api';

function normalizeApiUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(normalized)) throw new Error('EXPO_PUBLIC_API_URL must start with http:// or https://');
  if (!normalized.endsWith('/api')) throw new Error('EXPO_PUBLIC_API_URL must end with /api');
  return normalized;
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
export const API_URL = normalizeApiUrl(configuredApiUrl || (__DEV__ ? LOCAL_DEFAULT_API_URL : PRODUCTION_API_URL));

let accessToken: string | null = null;
function authHeaders(): Record<string, string> { return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}; }

export class ApiClientError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function setApiToken(token: string | null): void { accessToken = token; }

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
    throw new ApiClientError(errorPayload?.error ?? `HTTP ${response.status}`, response.status, errorPayload?.code);
  }
  return payload as T;
}

export const api = {
  auth: {
    register: (input: RegisterInput) => request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
    login: (input: { email: string; password: string }) => request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    me: () => request<AuthUser>('/auth/me'),
    setPushToken: (expoPushToken: string | null) => request<{ ok: true }>('/auth/push-token', { method: 'PUT', body: JSON.stringify({ expoPushToken }) }),
    deleteAccount: () => request<{ deleted: true }>('/auth/delete-account', { method: 'DELETE' }),
  },
  family: {
    create: (name?: string) => request<FamilyActionResponse>('/family/create', { method: 'POST', body: JSON.stringify(name?.trim() ? { name: name.trim() } : {}) }),
    join: (inviteCode: string) => request<FamilyActionResponse>('/family/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }),
    children: () => request<FamilyChild[]>('/family/children'),
    createChild: (input: FamilyChildInput) => request<FamilyChild>('/family/children', { method: 'POST', body: JSON.stringify(input) }),
    updateChild: (id: string, input: Partial<FamilyChildInput>) => request<FamilyChild>(`/family/children/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  },
  events: {
    list: (from?: string, to?: string, status?: FamilyEventStatus) => {
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      if (status) query.set('status', status);
      const suffix = query.toString();
      return request<FamilyEvent[]>(`/events${suffix ? `?${suffix}` : ''}`);
    },
    listUpcoming: (limit = 3) => request<FamilyEvent[]>(`/events/upcoming?limit=${encodeURIComponent(String(limit))}`),
    create: (input: { title: string; startsAt: string; endsAt?: string | null; location?: string | null; notes?: string | null; childId?: string | null; eventType?: FamilyEventType; requiresApproval?: boolean }) => request<FamilyEvent>('/events', { method: 'POST', body: JSON.stringify(input) }),
    respond: (id: string, status: 'confirmed' | 'rejected', note?: string | null) => request<FamilyEvent>(`/events/${encodeURIComponent(id)}/respond`, { method: 'POST', body: JSON.stringify({ status, note }) }),
  },
  turns: {
    list: (from: string, to: string) => request<DailyCustody[]>(`/turns?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    setDay: (date: string, custodianRole: ParentRole, notes?: string) => request<DailyCustody>(`/turns/${encodeURIComponent(date)}`, { method: 'PUT', body: JSON.stringify({ custodianRole, notes }) }),
  },
  permanence: {
    current: (date?: string) => request<CustodyCurrent>(`/permanence/current${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    pattern: () => request<CustodyPattern[]>('/permanence/pattern'),
    setPatternDay: (childId: string, weekday: number, input: { custodianRole: ParentRole; overnight?: boolean; notes?: string | null }) => request<CustodyPattern>(`/permanence/pattern/${encodeURIComponent(childId)}/${weekday}`, { method: 'PUT', body: JSON.stringify(input) }),
    alternatingWeekends: () => request<AlternatingWeekendPattern[]>('/permanence/alternating-weekends'),
    setAlternatingWeekend: (childId: string, input: { anchorSaturday: string; firstWeekendRole: ParentRole; secondWeekendRole: ParentRole; overnight?: boolean; notes?: string | null }) => request<AlternatingWeekendPattern>(`/permanence/alternating-weekends/${encodeURIComponent(childId)}`, { method: 'PUT', body: JSON.stringify(input) }),
    exceptions: () => request<CustodyException[]>('/permanence/exceptions'),
    createException: (input: { childId: string; custodyDate: string; custodianRole: ParentRole; overnight?: boolean; notes?: string | null }) => request<CustodyException>('/permanence/exceptions', { method: 'POST', body: JSON.stringify(input) }),
    respondException: (id: string, status: 'approved' | 'rejected') => request<CustodyException>(`/permanence/exceptions/${encodeURIComponent(id)}/respond`, { method: 'POST', body: JSON.stringify({ status }) }),
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
    create: (input: { title: string; amount: string; category: ExpenseCategory; expenseDate?: string; notes?: string; isExtraordinary?: boolean; fatherPercentage?: number; motherPercentage?: number; childIds?: string[]; receipt?: { uri: string; name: string; type: string; file?: Blob } }) => {
      const form = new FormData();
      form.append('title', input.title);
      form.append('amount', input.amount);
      form.append('category', input.category);
      form.append('isExtraordinary', input.isExtraordinary ? 'true' : 'false');
      if (input.expenseDate) form.append('expenseDate', input.expenseDate);
      if (input.notes?.trim()) form.append('notes', input.notes.trim());
      if (input.fatherPercentage !== undefined) form.append('fatherPercentage', String(input.fatherPercentage));
      if (input.motherPercentage !== undefined) form.append('motherPercentage', String(input.motherPercentage));
      if (input.childIds?.length) form.append('childIds', JSON.stringify(input.childIds));
      if (input.receipt) {
        if (input.receipt.file) form.append('receipt', input.receipt.file, input.receipt.name);
        else form.append('receipt', { uri: input.receipt.uri, name: input.receipt.name, type: input.receipt.type } as unknown as Blob);
      }
      return request<Expense>('/expenses', { method: 'POST', body: form });
    },
    requestOtp: (id: string) => request<{ ok: true; expiresInSeconds: number; maskedEmail: string }>(`/expenses/${encodeURIComponent(id)}/request-otp`, { method: 'POST' }),
    verifyOtp: (id: string, code: string) => request<Expense>(`/expenses/${encodeURIComponent(id)}/verify-otp`, { method: 'POST', body: JSON.stringify({ code }) }),
    approve: (id: string) => request<Expense>(`/expenses/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify({}) }),
    decline: (id: string) => request<Expense>(`/expenses/${encodeURIComponent(id)}/decline`, { method: 'POST' }),
    dispute: (id: string, reason: string) => request<{ id: string; status: 'disputed'; reviewedAt: string; disputeReason: string }>(`/expenses/${encodeURIComponent(id)}/dispute`, { method: 'POST', body: JSON.stringify({ reason }) }),
    history: (id: string) => request<FamilyActivity[]>(`/expenses/${encodeURIComponent(id)}/history`),
    receiptSource: (path: string) => ({ uri: `${API_URL}${path}`, headers: authHeaders() }),
    payments: (id: string) => request<ExpensePayment[]>(`/expenses/${encodeURIComponent(id)}/payments`),
    createPayment: (id: string, input: { amount: string; paidAt?: string; notes?: string; receipt?: { uri: string; name: string; type: string; file?: Blob } }) => {
      const form = new FormData();
      form.append('amount', input.amount);
      if (input.paidAt) form.append('paidAt', input.paidAt);
      if (input.notes?.trim()) form.append('notes', input.notes.trim());
      if (input.receipt) {
        if (input.receipt.file) form.append('receipt', input.receipt.file, input.receipt.name);
        else form.append('receipt', { uri: input.receipt.uri, name: input.receipt.name, type: input.receipt.type } as unknown as Blob);
      }
      return request<ExpensePayment>(`/expenses/${encodeURIComponent(id)}/payments`, { method: 'POST', body: form });
    },
    confirmPayment: (expenseId: string, paymentId: string) => request<{ id: string; status: 'confirmed'; expenseStatus: Expense['status'] }>(`/expenses/${encodeURIComponent(expenseId)}/payments/${encodeURIComponent(paymentId)}/confirm`, { method: 'POST' }),
    paymentReceiptSource: (path: string) => ({ uri: `${API_URL}${path}`, headers: authHeaders() }),
  },
  agreements: {
    list: (status?: AgreementStatus) => request<FamilyAgreement[]>(`/agreements${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    create: (input: { category: AgreementCategory; title: string; body: string }) => request<FamilyAgreement>('/agreements', { method: 'POST', body: JSON.stringify(input) }),
    respond: (id: string, status: 'approved' | 'rejected' | 'changes_requested', note?: string | null) => request<FamilyAgreement>(`/agreements/${encodeURIComponent(id)}/respond`, { method: 'POST', body: JSON.stringify({ status, note }) }),
    history: (id: string) => request<AgreementHistoryItem[]>(`/agreements/${encodeURIComponent(id)}/history`),
  },
  messages: {
    list: (limit = 100) => request<LegalMessage[]>(`/messages?limit=${encodeURIComponent(String(limit))}`),
    send: (text: string, attachment?: { uri: string; name: string; type: string; file?: Blob }) => {
      const form = new FormData();
      form.append('text', text);
      if (attachment) {
        if (attachment.file) form.append('attachment', attachment.file, attachment.name);
        else form.append('attachment', { uri: attachment.uri, name: attachment.name, type: attachment.type } as unknown as Blob);
      }
      return request<LegalMessage>('/messages', { method: 'POST', body: form });
    },
    markRead: (id: string) => request<LegalMessage>(`/messages/${encodeURIComponent(id)}/read`, { method: 'PUT' }),
    analyzeTone: (text: string) => request<ToneAnalysis>('/messages/analyze-tone', { method: 'POST', body: JSON.stringify({ text }) }),
    attachmentSource: (path: string) => ({ uri: `${API_URL}${path}`, headers: authHeaders() }),
  },
  documents: {
    list: () => request<FamilyDocument[]>('/documents'),
    create: (input: { title: string; description?: string; category: DocumentCategory; childIds?: string[]; file: { uri: string; name: string; type: string; file?: Blob } }) => {
      const form = new FormData();
      form.append('title', input.title);
      form.append('category', input.category);
      if (input.description?.trim()) form.append('description', input.description.trim());
      if (input.childIds?.length) form.append('childIds', JSON.stringify(input.childIds));
      if (input.file.file) form.append('file', input.file.file, input.file.name);
      else form.append('file', { uri: input.file.uri, name: input.file.name, type: input.file.type } as unknown as Blob);
      return request<FamilyDocument>('/documents', { method: 'POST', body: form });
    },
    fileRequest: (path: string, download = false) => ({ url: `${API_URL}${path}${download ? `${path.includes('?') ? '&' : '?'}download=1` : ''}`, headers: authHeaders() }),
    fileSource: (path: string) => ({ uri: `${API_URL}${path}`, headers: authHeaders() }),
  },
  reports: {
    parentingTime: (from?: string, to?: string) => {
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const suffix = query.toString();
      return request<ParentingTimeReport>(`/reports/parenting-time${suffix ? `?${suffix}` : ''}`);
    },
  },
  history: {
    list: (limit = 100, entityType?: string) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (entityType) query.set('entityType', entityType);
      return request<FamilyActivity[]>(`/history?${query.toString()}`);
    },
  },
  notifications: {
    list: (unreadOnly = false) => request<InAppNotification[]>(`/notifications${unreadOnly ? '?unread=1' : ''}`),
    markRead: (id: string) => request<{ id: string; readAt: string }>('/notifications/' + encodeURIComponent(id) + '/read', { method: 'PUT' }),
    readAll: () => request<{ ok: true; updated: number }>('/notifications/read-all', { method: 'PUT' }),
  },
};
