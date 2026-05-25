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

export interface SetupStep {
  // `kind` describes intent for the reader; `lang` drives syntax highlighting.
  kind: 'shell' | 'toml';
  lang: SupportedLanguages;
  title: string;
  body: string;
  note?: string;
}

export interface QuickStartSnippet {
  lang: SupportedLanguages;
  setupSteps: SetupStep[];
  quickStart: string;
  transactions: QuickStartTx[];
  lifecycle: string;
}

// Plug a new SDK in by implementing this and registering it in `index.ts`.
export interface SdkRenderer {
  lang: SupportedLanguages;
  // Optional follow-up after `trix codegen` to install the dependencies of the
  // generated client (the codegen output declares its SDK dep — Cargo picks it
  // up on build, so Rust doesn't need this; npm/pip/go need an explicit step).
  postCodegenInstall: SetupStep | null;
  quickStart(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string;
  txBlock(tx: Tx, protocol: Protocol): string;
  // The sign + submit chain that takes any resolved tx from `txBlock` and pushes
  // it to the chain. The example uses `tx` as the variable name.
  lifecycle(protocol: Protocol): string;
}

export const byName = <T extends { name: string; }>(a: T, b: T) => a.name.localeCompare(b.name);

export const PARTY_ADDRESS_PLACEHOLDER = 'addr_test1...';

export interface PartyBinding {
  name: string;
  address: string;
}

// Parties declared by the protocol that the profile does NOT supply — these
// need a `.with<Name>(...)` call on the generated Client.
export function unboundParties(protocol: Protocol, supplied: Set<string>): PartyBinding[] {
  return [...(protocol.parties ?? [])]
    .filter(p => !supplied.has(p.name))
    .sort(byName)
    .map(p => ({ name: p.name, address: PARTY_ADDRESS_PLACEHOLDER }));
}

export function toCamelCase(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'result';
  return parts[0].toLowerCase() + parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
}

export function toSnakeCase(name: string): string {
  return name.split(/[^A-Za-z0-9]+/).filter(Boolean).map(p => p.toLowerCase()).join('_') || 'result';
}

export function toPascalCase(name: string): string {
  const c = toCamelCase(name);
  return c[0] ? c[0].toUpperCase() + c.slice(1) : c;
}

// Names supplied by the active profile — parties bound on the profile and any
// keys declared in the profile env. These are baked into the generated client
// at codegen time, so `txBlock` filters them out of the user-facing args.
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

// Tx params that should surface as user-provided args — everything except party
// names declared by the protocol and names already supplied by the profile.
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

// Codegen plugin name per language target (matches `[[codegen]]` plugin keys
// recognized by `trix codegen`).
const CODEGEN_PLUGIN: Record<SDKKey, string> = {
  typescript: 'ts-client',
  rust: 'rust-client',
  go: 'go-client',
  python: 'python-client',
};

const OUTPUT_DIR: Record<SDKKey, string> = {
  typescript: './gen/typescript',
  rust: './gen/rust',
  go: './gen/go',
  python: './gen/python',
};

export function bindingPlugin(lang: SDKKey): string {
  return CODEGEN_PLUGIN[lang];
}

export function bindingsTomlBlock(lang: SDKKey): string {
  return [
    '[[codegen]]',
    `plugin = ${JSON.stringify(CODEGEN_PLUGIN[lang])}`,
    `output_dir = ${JSON.stringify(OUTPUT_DIR[lang])}`,
  ].join('\n');
}

export function outputDir(lang: SDKKey): string {
  return OUTPUT_DIR[lang];
}

// Shared install-flow steps. Each renderer prepends its own SDK install step.
export function commonSetupSteps(lang: SDKKey, protocol: Protocol): SetupStep[] {
  const ref = `${protocol.scope}/${protocol.name}@${protocol.version}`;
  return [
    {
      kind: 'shell',
      lang: 'bash',
      title: 'Install the Tx3 toolchain',
      body: 'brew install txpipe/tap/tx3up && tx3up',
      note: 'Skip if `trix` is already on your PATH. See https://docs.txpipe.io/tx3/installation for other platforms.',
    },
    {
      kind: 'shell',
      lang: 'bash',
      title: 'Initialize a trix project',
      body: 'trix init',
      note: 'Skip this step if you already have a trix project.',
    },
    {
      kind: 'shell',
      lang: 'bash',
      title: 'Install the protocol',
      body: `trix use ${ref}`,
      note: 'Downloads the compiled .tii into your trix project and registers it as a dependency.',
    },
    {
      kind: 'toml',
      lang: 'toml',
      title: 'Configure codegen',
      body: bindingsTomlBlock(lang),
      note: 'Add this entry to trix.toml so trix knows which language to generate.',
    },
    {
      kind: 'shell',
      lang: 'bash',
      title: 'Generate the client',
      body: 'trix codegen',
      note: `Writes the typed client to ${OUTPUT_DIR[lang]}.`,
    },
  ];
}
