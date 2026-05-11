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

export interface Lifted {
  readonly txName: string;
  readonly parties: Record<string, LiftedParty>;
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

interface RawLifted {
  tx_name?: unknown;
  parties?: Record<string, unknown>;
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

  return { txName, parties, raw: json };
}
