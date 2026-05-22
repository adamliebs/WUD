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
