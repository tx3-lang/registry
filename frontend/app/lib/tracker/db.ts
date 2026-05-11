import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

export interface MatchesRow {
  readonly id: number;
  readonly tx_hash: Buffer;
  readonly block_slot: number;
  readonly block_hash: Buffer;
  readonly source_name: string;
  readonly protocol_name: string;
  readonly tx_name: string;
  readonly profile_name: string;
  readonly lifted: string;
  readonly matched_at: number;
}

export interface CursorRow {
  readonly id: number;
  readonly slot: number;
  readonly block_hash: Buffer;
}

export interface SchemaVersionRow {
  readonly name: string;
  readonly applied_at: number;
}

export interface TrackerDatabase {
  matches: MatchesRow;
  cursor: CursorRow;
  _schema_versions: SchemaVersionRow;
}

export interface CreateDbOptions {
  path?: string;
  existing?: BetterSqlite3.Database;
}

/**
 * Open a read-only Kysely instance over the tracker.db SQLite file produced
 * by tx3-lift's tracker. Server-side only — invoked from react-router loaders.
 *
 * Path resolution: opts.path → process.env.TRACKER_DB_PATH → './tracker.db'.
 */
export function createTrackerDb(opts: CreateDbOptions = {}): Kysely<TrackerDatabase> {
  const sqlite = resolveSqlite(opts);
  return new Kysely<TrackerDatabase>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}

function resolveSqlite(opts: CreateDbOptions): BetterSqlite3.Database {
  if (opts.existing) {
    return opts.existing;
  }
  const path = opts.path ?? process.env.TRACKER_DB_PATH ?? './tracker.db';
  const sqlite = new BetterSqlite3(path, { readonly: true, fileMustExist: true });
  sqlite.pragma('journal_mode = WAL');
  return sqlite;
}
