/**
 * Pure helpers for the subset of `matches.lifted` JSON the Activity tab renders.
 *
 * The tracker writes byte-valued fields (addresses, hashes, policy ids) as
 * JSON arrays of integers — e.g. `address: [0x61, 0x12, 0x34]`. The Activity
 * tab renders them as lowercase hex strings, optionally truncated.
 */

export interface LiftedParty {
  readonly address: string;
  readonly role: string;
}

export interface LiftedReference {
  readonly name: string;
  /** UTxO reference as `txhash#index`, lowercase hex. */
  readonly ref: string;
}

export interface Lifted {
  readonly txName: string;
  readonly parties: Record<string, LiftedParty>;
  /**
   * Reference inputs of the matched transaction. This is how callers discover
   * the concrete UTxO refs a protocol expects as parameters (e.g. bodega's
   * `project_info_ref`): the values real on-chain transactions used.
   */
  readonly references: LiftedReference[];
  readonly raw: string;
}

/** Encode a byte array as a lowercase hex string with no `0x` prefix. */
export function bytesToHex(bytes: readonly number[]): string {
  let out = '';
  for (const b of bytes) {
    if (!Number.isInteger(b) || b < 0 || b > 255) {
      throw new Error(`invalid byte value: ${b}`);
    }
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Truncate a hex string to its `edge` leading and trailing characters joined
 * by a U+2026 horizontal ellipsis. Strings of length `<= edge * 2` are
 * returned unchanged.
 */
export function truncateHex(hex: string, edge = 6): string {
  if (hex.length <= edge * 2) {
    return hex;
  }
  return `${hex.slice(0, edge)}…${hex.slice(-edge)}`;
}

interface RawLiftedParty {
  address?: unknown;
  role?: unknown;
}

interface RawLiftedReference {
  tir_input_name?: unknown;
  utxo_ref?: unknown;
}

interface RawLifted {
  tx_name?: unknown;
  parties?: Record<string, unknown>;
  references?: unknown;
}

/**
 * Parse a `lifted` JSON document into the shape the Activity tab renders.
 * Tolerant of missing fields — defaults to empty.
 */
export function parseLifted(json: string): Lifted {
  const data = JSON.parse(json) as RawLifted;

  const txName = typeof data.tx_name === 'string' ? data.tx_name : '';
  const parties: Record<string, LiftedParty> = {};

  if (data.parties && typeof data.parties === 'object') {
    for (const [name, value] of Object.entries(data.parties)) {
      if (!value || typeof value !== 'object') continue;
      const party = value as RawLiftedParty;
      if (!Array.isArray(party.address)) continue;
      parties[name] = {
        address: bytesToHex(party.address as number[]),
        role: typeof party.role === 'string' ? party.role : '',
      };
    }
  }

  // The tracker writes a reference input as
  // `{ tir_input_name, utxo_ref: [[...tx hash bytes], index], ... }`.
  const references: LiftedReference[] = [];
  if (Array.isArray(data.references)) {
    for (const value of data.references) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as RawLiftedReference;
      if (!Array.isArray(entry.utxo_ref) || entry.utxo_ref.length !== 2) continue;
      const [hash, index] = entry.utxo_ref as [unknown, unknown];
      if (!Array.isArray(hash) || typeof index !== 'number') continue;
      try {
        references.push({
          name: typeof entry.tir_input_name === 'string' ? entry.tir_input_name : '',
          ref: `${bytesToHex(hash as number[])}#${index}`,
        });
      } catch {
        // malformed byte array — skip this entry, keep the rest
      }
    }
  }

  return { txName, parties, references, raw: json };
}
