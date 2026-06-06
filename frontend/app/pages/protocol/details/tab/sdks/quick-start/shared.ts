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

// A typed placeholder rendered as a string literal in every target language.
// Using a string literal regardless of the field's declared type keeps the
// snippet syntactically valid (so syntax highlighting stays consistent) while
// making it obvious to the reader that the value must be replaced.
export function placeholderFor(type: string): string {
  return `<input ${type}>`;
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

// Human-readable SDK names, used in prose.
const LANG_LABEL: Record<SDKKey, string> = {
  typescript: 'TypeScript',
  rust: 'Rust',
  go: 'Go',
  python: 'Python',
};

// `trix codegen` writes each protocol's binding into a subfolder named after
// the protocol (raw name, no casing transform) under the plugin output dir,
// alongside a README with language-specific usage instructions.
function generatedReadmePath(lang: SDKKey, protocol: Protocol): string {
  return `${OUTPUT_DIR[lang]}/${protocol.name}/README.md`;
}

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

// Shared install-flow steps, covering every SDK end to end.
export function commonSetupSteps(lang: SDKKey, protocol: Protocol): SetupStep[] {
  const ref = `${protocol.scope}/${protocol.name}:${protocol.version}`;
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
      title: 'Install the protocol',
      body: `trix use ${ref}`,
      note: 'Auto-bootstraps a trix.toml in the current directory if none exists, then downloads the compiled .tii and pins the dependency.',
    },
    {
      kind: 'shell',
      lang: 'bash',
      title: 'Generate the client',
      body: `trix codegen --plugin ${CODEGEN_PLUGIN[lang]}`,
      note: `Adds the [[codegen]] entry to trix.toml on first run and writes the typed client (defaults to .tx3/codegen/${CODEGEN_PLUGIN[lang]}/; override with output_dir in trix.toml).`,
    },
    {
      kind: 'shell',
      lang: 'bash',
      title: 'Read the generated client\'s README',
      body: generatedReadmePath(lang, protocol),
      note: `Open this README for ${LANG_LABEL[lang]}-specific instructions on installing the runtime SDK dependency and using the generated client.`,
    },
  ];
}
