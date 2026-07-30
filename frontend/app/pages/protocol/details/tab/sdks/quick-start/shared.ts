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
  // 'shell'/'toml' render `body` as a code block. 'link' renders `body` as the
  // label of a button that opens `href` — used to defer to external docs
  // instead of inlining commands.
  kind: 'shell' | 'toml' | 'link';
  lang: SupportedLanguages;
  title: string;
  body: string;
  href?: string;
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

export type PartyBindingKind = 'signer' | 'address';

export interface PartyBinding {
  name: string;
  kind: PartyBindingKind;
  // Meaningful when `kind` is 'address': a concrete address from the profile
  // env, or a placeholder naming what the caller must provide.
  address: string;
}

// Script parties (`positionscript`, `commitscript`, ...) are protocol-owned
// addresses. They must never receive the caller's signer or wallet address.
export function isScriptParty(name: string): boolean {
  return /script$/i.test(name);
}

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const BECH32_ADDRESS = /^(addr|addr_test|stake|stake_test)1[02-9ac-hj-np-z]+$/i;

// Script-party address sourced from the selected profile's environment: an env
// key matching the party name (optionally suffixed `address`/`addr`) whose
// value is a bech32 address.
export function envScriptAddress(profile: Profile | null, partyName: string): string | null {
  if (!profile?.environment) return null;
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(profile.environment) as Record<string, unknown>;
  } catch {
    return null;
  }
  const target = normalizeKey(partyName);
  for (const [key, value] of Object.entries(env)) {
    const norm = normalizeKey(key);
    const matches = norm === target || norm === `${target}address` || norm === `${target}addr`;
    if (matches && typeof value === 'string' && BECH32_ADDRESS.test(value)) {
      return value;
    }
  }
  return null;
}

export function scriptAddressPlaceholder(partyName: string): string {
  return `<${partyName} script address>`;
}

// Parties declared by the protocol that the profile does NOT supply — these
// need a `.with<Name>(...)` call on the generated Client. The signer belongs
// to the first non-script party (the caller's own wallet, e.g. `user` or
// `participant`); a script party takes its address from the profile env when
// one is published, and an explicit script-address placeholder otherwise.
export function unboundPartyBindings(
  protocol: Protocol,
  profile: Profile | null,
  supplied: Set<string>,
): PartyBinding[] {
  const unbound = [...(protocol.parties ?? [])]
    .filter(p => !supplied.has(p.name))
    .sort(byName);

  const signerName = unbound.find(p => !isScriptParty(p.name))?.name ?? null;

  return unbound.map(p => {
    if (p.name === signerName) {
      return { name: p.name, kind: 'signer' as const, address: '' };
    }
    if (isScriptParty(p.name)) {
      return {
        name: p.name,
        kind: 'address' as const,
        address: envScriptAddress(profile, p.name) ?? scriptAddressPlaceholder(p.name),
      };
    }
    return { name: p.name, kind: 'address' as const, address: PARTY_ADDRESS_PLACEHOLDER };
  });
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

// Default output dir used by `trix codegen` when the `[[codegen]]` entry sets
// no explicit `output_dir`: `.tx3/codegen/{plugin}/` (see trix
// `CodegenConfig::output_dir`).
const OUTPUT_DIR: Record<SDKKey, string> = {
  typescript: '.tx3/codegen/ts-client',
  rust: '.tx3/codegen/rust-client',
  go: '.tx3/codegen/go-client',
  python: '.tx3/codegen/python-client',
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
function generatedOutputDir(lang: SDKKey, protocol: Protocol): string {
  return `${OUTPUT_DIR[lang]}/${protocol.name}`;
}

// Shared install-flow steps, covering every SDK end to end.
export function commonSetupSteps(lang: SDKKey, protocol: Protocol): SetupStep[] {
  const ref = `${protocol.scope}/${protocol.name}:${protocol.version}`;
  return [
    {
      kind: 'link',
      lang: 'bash',
      title: 'Install the Tx3 toolchain',
      body: 'Read the installation guide',
      href: 'https://docs.txpipe.io/tx3/installation',
      note: 'Install `trix` for your platform by following the official guide. Skip if it is already on your PATH.',
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
      note: `Adds the [[codegen]] entry to trix.toml on first run and writes the typed client to ${generatedOutputDir(lang, protocol)}/. Open the README there for ${LANG_LABEL[lang]}-specific instructions on installing the runtime SDK and using the client.`,
    },
  ];
}
