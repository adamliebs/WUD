import Database from 'better-sqlite3';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';

/**
 * Single shared SQLite connection.
 *
 * better-sqlite3 is synchronous and production-grade — every query blocks,
 * which keeps service code simple and transactions trivial.
 *
 * Pragmas:
 *  - journal_mode = WAL   → required for Litestream streaming replication and
 *                           lets readers run concurrently with a writer.
 *  - foreign_keys = ON    → cascades the schema relies on (unlike node:sqlite,
 *                           better-sqlite3 leaves FK enforcement off by default).
 *  - busy_timeout = 5000  → wait, don't fail, on brief write contention.
 *  - synchronous = NORMAL → safe + fast under WAL.
 */
export const db: Database.Database = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

/**
 * Prepared-statement cache. better-sqlite3 statements are reusable and caching
 * them avoids re-compiling SQL on every call to a hot query.
 */
const stmtCache = new Map<string, Database.Statement>();
function prep(sql: string): Database.Statement {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

/** Apply all pending versioned migrations (see db/migrate.ts). */
export function migrate(): void {
  runMigrations(db);
}

/**
 * Run a function inside a transaction. Commits on success, rolls back on throw.
 * better-sqlite3 supports nested calls via savepoints, so this is safe to nest.
 */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn)();
}

/** Readiness probe — true when the database answers a trivial query. */
export function dbHealthy(): boolean {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

/** Close the database connection (called during graceful shutdown). */
export function closeDb(): void {
  db.close();
}

/** Convenience: prepared-statement helpers with sensible return typing. */
export const q = {
  /** First row or undefined. */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    return prep(sql).get(...(params as never[])) as T | undefined;
  },
  /** All rows. */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return prep(sql).all(...(params as never[])) as T[];
  },
  /** Execute a write; returns rows-changed / last-insert info. */
  run(sql: string, ...params: unknown[]) {
    return prep(sql).run(...(params as never[]));
  },
};
