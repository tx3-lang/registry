import type { Kysely, Selectable } from 'kysely';
import type { LiftedParty } from './lifted';
import { parseLifted } from './lifted';
import type { MatchesRow, TrackerDatabase } from './db';

export interface MatchRow {
  readonly id: number;
  readonly hash: string;
  readonly txName: string;
  readonly protocolName: string;
  readonly profileName: string;
  readonly blockSlot: number;
  readonly matchedAt: Date;
  readonly parties: Record<string, LiftedParty>;
  readonly rawLifted: string;
}

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;

const SELECT_COLUMNS = [
  'id',
  'tx_hash',
  'block_slot',
  'protocol_name',
  'profile_name',
  'tx_name',
  'lifted',
  'matched_at',
] as const;

type SelectedMatch = Pick<
  Selectable<MatchesRow>,
  'id' | 'tx_hash' | 'block_slot' | 'protocol_name' | 'profile_name' | 'tx_name' | 'lifted' | 'matched_at'
>;

function toMatchRow(raw: SelectedMatch): MatchRow {
  const lifted = parseLifted(raw.lifted);
  return {
    id: raw.id,
    hash: raw.tx_hash.toString('hex'),
    txName: raw.tx_name,
    protocolName: raw.protocol_name,
    profileName: raw.profile_name,
    blockSlot: raw.block_slot,
    matchedAt: new Date(raw.matched_at * 1000),
    parties: lifted.parties,
    rawLifted: raw.lifted,
  };
}

/**
 * AP-1 — list recent matches for a given protocol, newest-first.
 *
 * Filters by `protocol_name` (the lifter writes this from the TII's
 * `protocol.name`, so it equals the registry's protocol name in the URL).
 * `limit` defaults to 50 and is clamped to `[1, 200]`.
 */
export async function listMatchesForProtocol(
  db: Kysely<TrackerDatabase>,
  protocolName: string,
  limit: number = DEFAULT_LIMIT,
): Promise<MatchRow[]> {
  const clamped = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, limit));
  const rows = await db
    .selectFrom('matches')
    .select(SELECT_COLUMNS)
    .where('protocol_name', '=', protocolName)
    .orderBy('id', 'desc')
    .limit(clamped)
    .execute();
  return rows.map(toMatchRow);
}

/**
 * AP-2 — fetch a single match by its `tx_hash` (hex string), within a
 * specific protocol scope.
 *
 * Throws if `txHashHex` is not a valid even-length hex string.
 */
export async function getMatchByHash(
  db: Kysely<TrackerDatabase>,
  protocolName: string,
  txHashHex: string,
): Promise<MatchRow | null> {
  if (!/^[0-9a-fA-F]+$/.test(txHashHex) || txHashHex.length % 2 !== 0) {
    throw new Error(`invalid tx_hash hex: ${txHashHex}`);
  }
  const buf = Buffer.from(txHashHex, 'hex');
  const row = await db
    .selectFrom('matches')
    .select(SELECT_COLUMNS)
    .where('tx_hash', '=', buf)
    .where('protocol_name', '=', protocolName)
    .limit(1)
    .executeTakeFirst();
  return row ? toMatchRow(row) : null;
}
