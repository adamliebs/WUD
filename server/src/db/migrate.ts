import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

interface MigrationRow { version: string }

/**
 * Versioned migration runner.
 *
 * Each migration is a plain SQL file in `db/migrations/`, named
 * `NNNN_description.sql`. Files run once, in filename order, each inside a
 * transaction — a failure rolls back cleanly and leaves the DB untouched.
 * Applied versions are recorded in `schema_migrations` so re-running is a no-op.
 *
 * To add a schema change: drop a new `NNNN_*.sql` file in the migrations dir.
 * Never edit an already-applied migration — add a new one instead.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations')
      .all()
      .map(r => (r as MigrationRow).version),
  );

  const files = readdirSync(migrationsDir)
    .filter(f => /^\d+.*\.sql$/.test(f))
    .sort();

  const record = db.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
  );

  let appliedCount = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    // Per-migration prelude: heal known schema-drift cases before applying
    // the SQL. Some dev DBs have ended up with the 0006 row in
    // schema_migrations but without the float_id column on notifications
    // (e.g. partial restore, manual DB reset). 0007's rebuild SELECTs
    // float_id explicitly, so add it back idempotently before running.
    if (version === '0007_notification_types') {
      ensureNotificationsHasFloatId(db);
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(version, Date.now());
    })();

    appliedCount++;
    console.log(`[migrate] applied ${version}`);
  }

  console.log(
    appliedCount === 0
      ? '[migrate] database up to date'
      : `[migrate] applied ${appliedCount} migration(s)`,
  );
}

interface ColumnInfo { name: string }

/** Adds `notifications.float_id` if it's missing. No-op if the column exists. */
function ensureNotificationsHasFloatId(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(notifications)').all() as ColumnInfo[];
  const hasFloatId = cols.some(c => c.name === 'float_id');
  if (hasFloatId) return;
  db.exec(
    'ALTER TABLE notifications ADD COLUMN float_id TEXT REFERENCES floats(id) ON DELETE SET NULL',
  );
  console.log('[migrate] healed notifications.float_id (was missing before 0007)');
}
