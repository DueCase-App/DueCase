import { createHash } from 'node:crypto';

export const MESSAGE_HASH_VERSION = 'DUECASE-MSG-V1';
export const REPORT_HASH_VERSION = 'DUECASE-REPORT-V1';

export function canonicalTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp for integrity calculation');
  }
  return date.toISOString();
}

export function messageDataHash(text: string, senderId: string, createdAt: Date | string): string {
  const canonical = `${text}|${senderId}|${canonicalTimestamp(createdAt)}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
  }

  return JSON.stringify(String(value));
}

export function reportDataHash(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value), 'utf8').digest('hex');
}

export function verificationString(reportId: string, generatedAt: string, reportHash: string): string {
  return `${REPORT_HASH_VERSION}|${reportId}|${generatedAt}|${reportHash}`;
}
