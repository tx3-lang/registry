import type { SupportedLanguages } from '~/utils/shiki';

export type SDKKey = 'typescript' | 'rust' | 'go' | 'python';

export interface TrpConfig {
  endpoint: string;
  headers?: Record<string, string>;
}

export interface QuickStartOptions {
  profile: Profile | null;
  trp: TrpConfig;
}

export interface QuickStartTx {
  name: string;
  description: Maybe<string>;
  code: string;
}

export interface QuickStartSnippet {
  lang: SupportedLanguages;
  setup: string;
  transactions: QuickStartTx[];
}

export interface PartyBinding {
  name: string;
  address: string;
}

// Plug a new SDK in by implementing this and registering it in `index.ts`.
export interface SdkRenderer {
  lang: SupportedLanguages;
  setup(protocol: Protocol, profile: Profile | null, trp: TrpConfig, supplied: Set<string>): string;
  txBlock(tx: Tx, protocol: Protocol, supplied: Set<string>): string;
}

export const PARTY_ADDRESS_PLACEHOLDER = 'addr_test1...';

export const byName = <T extends { name: string; }>(a: T, b: T) => a.name.localeCompare(b.name);

// Path where `trix add {scope}/{name}` writes the compiled .tii, which each
// SDK then loads via Protocol.fromFile.
export function tiiPath(protocol: Protocol): string {
  return `./.tx3/tii/${protocol.scope}/${protocol.name}.tii`;
}

export function toCamelCase(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'result';
  return parts[0].toLowerCase() + parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
}

export function toSnakeCase(name: string): string {
  return name.split(/[^A-Za-z0-9]+/).filter(Boolean).map(p => p.toLowerCase()).join('_') || 'result';
}

// Names supplied by the profile — either bound directly via `profile.parties`
// or declared as keys in the `profile.environment` JSON. The SDK applies these
// at runtime through `.withProfile()`, so the snippet skips them.
export function profileSuppliedNames(profile: Profile | null): Set<string> {
  const names = new Set<string>();
  if (!profile) return names;
  for (const p of profile.parties) names.add(p.name);
  if (profile.environment) {
    try {
      for (const k of Object.keys(JSON.parse(profile.environment))) names.add(k);
    } catch {
      // malformed JSON — leave env contribution empty
    }
  }
  return names;
}

// All parties declared by the protocol, sorted by name. Addresses are always
// placeholders so the snippet doesn't leak profile-specific values. Parties
// already supplied by the profile (via parties or env) are omitted.
export function sortedProtocolParties(protocol: Protocol, supplied: Set<string>): PartyBinding[] {
  return [...(protocol.parties ?? [])]
    .filter(p => !supplied.has(p.name))
    .sort(byName)
    .map(p => ({ name: p.name, address: PARTY_ADDRESS_PLACEHOLDER }));
}

// Tx params that should surface as `.arg(...)` — everything except names that
// are already bound at the client level via `.withParty` or supplied by the
// profile.
export function userProvidedParams(tx: Tx, protocol: Protocol, supplied: Set<string>): TxParam[] {
  const partyNames = new Set((protocol.parties ?? []).map(p => p.name));
  return tx.parameters
    .filter(p => !partyNames.has(p.name) && !supplied.has(p.name))
    .sort(byName);
}

export function placeholderFor(type: string): unknown {
  const t = type.toLowerCase();
  if (t === 'int' || t === 'u64' || t === 'i64') return 0;
  if (t === 'bool') return false;
  if (t.includes('address')) return 'addr_test1...';
  if (t.includes('bytes') || t.includes('hash')) return '0011223344';
  if (t.includes('utxo')) return 'tx_hash#0';
  return '...';
}
