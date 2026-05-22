import { randomBytes, randomUUID } from 'node:crypto';

/** A time-sortable-ish unique id (UUID v4 is fine for the mockup scale). */
export function newId(): string {
  return randomUUID();
}

/** Short opaque id with an optional prefix (e.g. squad ids). */
export function shortId(prefix = ''): string {
  return prefix + randomBytes(8).toString('hex');
}

/** Current time in epoch milliseconds — the canonical timestamp unit. */
export function now(): number {
  return Date.now();
}
