import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Single shared SQLite connection. node:sqlite is synchronous — every query
 * blocks, which keeps service code simple and transactions trivial.
 */
export const db = new DatabaseSync(config.dbFile);

/** Apply the schema (idempotent — every statement is CREATE ... IF NOT EXISTS). */
export function migrate(): void {
  const schema = readFileSync(join(here, 'schema.sql'), 'utf8');
  db.exec(schema);
}

/**
 * Run a function inside a transaction. Commits on success, rolls back on throw.
 * node:sqlite has no nested-transaction support, so callers must not nest.
 */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Convenience: prepared-statement helpers with sensible return typing. */
export const q = {
  /** First row or undefined. */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    return db.prepare(sql).get(...(params as never[])) as T | undefined;
  },
  /** All rows. */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return db.prepare(sql).all(...(params as never[])) as T[];
  },
  /** Execute a write; returns rows-changed / last-insert info. */
  run(sql: string, ...params: unknown[]) {
    return db.prepare(sql).run(...(params as never[]));
  },
};
