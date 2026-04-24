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

// -- Profile selection ------------------------------------------------------

function profileHasData(profile: Profile): boolean {
  if (profile.parties.length > 0) return true;
  if (!profile.environment) return false;
  try {
    return Object.keys(JSON.parse(profile.environment)).length > 0;
  } catch {
    return false;
  }
}

export function pickDefaultProfile(profiles: Profile[]): Profile | null {
  if (profiles.length === 0) return null;
  return profiles.find(profileHasData)
    ?? profiles.find(p => p.name === 'mainnet')
    ?? profiles[0];
}

// -- Helpers ----------------------------------------------------------------

// Path where `trix add {scope}/{name}` writes the compiled .tii, which each
// SDK then loads via Protocol.fromFile.
function tiiPath(protocol: Protocol): string {
  return `./.tx3/tii/${protocol.scope}/${protocol.name}.tii`;
}

function toCamelCase(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'result';
  return parts[0].toLowerCase() + parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
}

function toSnakeCase(name: string): string {
  return name.split(/[^A-Za-z0-9]+/).filter(Boolean).map(p => p.toLowerCase()).join('_') || 'result';
}

const byName = <T extends { name: string; }>(a: T, b: T) => a.name.localeCompare(b.name);

const PARTY_ADDRESS_PLACEHOLDER = 'addr_test1...';

interface PartyBinding {
  name: string;
  address: string;
}

// All parties declared by the protocol, sorted by name. Addresses are always
// placeholders so the snippet doesn't leak profile-specific values.
function sortedProtocolParties(protocol: Protocol): PartyBinding[] {
  return [...(protocol.parties ?? [])]
    .sort(byName)
    .map(p => ({ name: p.name, address: PARTY_ADDRESS_PLACEHOLDER }));
}

// Tx params that should surface as `.arg(...)` — everything except names that
// are already bound at the client level via `.withParty`.
function userProvidedParams(tx: Tx, protocol: Protocol): TxParam[] {
  const partyNames = new Set((protocol.parties ?? []).map(p => p.name));
  return tx.parameters
    .filter(p => !partyNames.has(p.name))
    .sort(byName);
}

function placeholderFor(type: string): unknown {
  const t = type.toLowerCase();
  if (t === 'int' || t === 'u64' || t === 'i64') return 0;
  if (t === 'bool') return false;
  if (t.includes('address')) return 'addr_test1...';
  if (t.includes('bytes') || t.includes('hash')) return '0011223344';
  if (t.includes('utxo')) return 'tx_hash#0';
  return '...';
}

// -- Per-language value formatters -----------------------------------------

function formatTsValue(value: unknown, type: string): string {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isInteger(value)) return `${value}n`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (type.toLowerCase() === 'int' && typeof value === 'string' && /^-?\d+$/.test(value)) return `${value}n`;
  return JSON.stringify(String(value));
}

function formatRustValue(value: unknown): string {
  if (typeof value === 'boolean') return `json!(${value})`;
  if (typeof value === 'number') return `json!(${value})`;
  if (typeof value === 'bigint') return `json!(${value})`;
  return `json!(${JSON.stringify(String(value))})`;
}

function formatPythonValue(value: unknown, type: string): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (type.toLowerCase() === 'int' && typeof value === 'string' && /^-?\d+$/.test(value)) return value;
  return JSON.stringify(String(value));
}

function formatGoValue(value: unknown, type: string): string {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (type.toLowerCase() === 'int' && typeof value === 'string' && /^-?\d+$/.test(value)) return value;
  return JSON.stringify(String(value));
}

// -- TypeScript -------------------------------------------------------------

function tsTrpInit(trp: TrpConfig): string[] {
  const headersLine = trp.headers
    ? `  headers: ${JSON.stringify(trp.headers)},`
    : null;
  if (!headersLine) {
    return [`const trp = new TrpClient({ endpoint: ${JSON.stringify(trp.endpoint)} });`];
  }
  return [
    'const trp = new TrpClient({',
    `  endpoint: ${JSON.stringify(trp.endpoint)},`,
    headersLine,
    '});',
  ];
}

function tsSetup(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const partyLines = sortedProtocolParties(protocol).map(p =>
    `  .withParty(${JSON.stringify(p.name)}, Party.address(${JSON.stringify(p.address)}))`,
  );

  const clientLines = [
    'const tx3 = new Tx3Client(protocol, trp)',
    ...(profile ? [`  .withProfile(${JSON.stringify(profile.name)})`] : []),
    ...partyLines,
  ];
  clientLines[clientLines.length - 1] += ';';

  return [
    'import { Tx3Client, Protocol, TrpClient, Party } from "tx3-sdk";',
    '',
    '// 1. Load the protocol (compiled .tii file)',
    `const protocol = await Protocol.fromFile(${JSON.stringify(tiiPath(protocol))});`,
    '',
    '// 2. Connect to a TRP server',
    ...tsTrpInit(trp),
    '',
    '// 3. Configure a signer (uncomment to enable .sign() / .submit())',
    '// import { Ed25519Signer } from "tx3-sdk";',
    '// const signer = Ed25519Signer.fromHex("addr_test1...", "deadbeef...");',
    '',
    `// 4. Bind parties${profile ? ` and select the "${profile.name}" profile` : ''}`,
    ...clientLines,
    '',
    '// 5. Invoke one of the transactions listed below.',
    '',
    '// 6. Once a signer is bound, chain .sign() / .submit() / .waitForConfirmed():',
    '// import { PollConfig } from "tx3-sdk";',
    '// const status = await result',
    '//   .sign()',
    '//   .then(s => s.submit())',
    '//   .then(sub => sub.waitForConfirmed(PollConfig.default()));',
  ].join('\n');
}

function tsTxBlock(tx: Tx, protocol: Protocol): string {
  const varName = toCamelCase(tx.name);
  const argLines = userProvidedParams(tx, protocol).map(param =>
    `  .arg(${JSON.stringify(param.name)}, ${formatTsValue(placeholderFor(param.type), param.type)})`,
  );
  if (argLines.length === 0) {
    return `const ${varName} = await tx3.tx(${JSON.stringify(tx.name)}).resolve();`;
  }
  return [
    `const ${varName} = await tx3`,
    `  .tx(${JSON.stringify(tx.name)})`,
    ...argLines,
    '  .resolve();',
  ].join('\n');
}

// -- Rust -------------------------------------------------------------------

function rustTrpInit(trp: TrpConfig): string[] {
  const endpoint = `    endpoint: ${JSON.stringify(trp.endpoint)}.to_string(),`;
  if (!trp.headers) {
    return [
      'let trp = Client::new(ClientOptions {',
      endpoint,
      '    headers: None,',
      '});',
    ];
  }
  const headerInserts = Object.entries(trp.headers).map(([k, v]) =>
    `headers.insert(${JSON.stringify(k)}.to_string(), ${JSON.stringify(v)}.to_string());`,
  );
  return [
    'let mut headers = std::collections::HashMap::new();',
    ...headerInserts,
    'let trp = Client::new(ClientOptions {',
    endpoint,
    '    headers: Some(headers),',
    '});',
  ];
}

function rustSetup(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const partyLines = sortedProtocolParties(protocol).map(p =>
    `    .with_party(${JSON.stringify(p.name)}, Party::address(${JSON.stringify(p.address)}))`,
  );

  const clientLines = [
    'let tx3 = Tx3Client::new(protocol, trp)',
    ...(profile ? [`    .with_profile(${JSON.stringify(profile.name)})`] : []),
    ...partyLines,
  ];
  clientLines[clientLines.length - 1] += ';';

  return [
    'use serde_json::json;',
    'use tx3_sdk::trp::{Client, ClientOptions};',
    'use tx3_sdk::{Party, Tx3Client};',
    '',
    '// 1. Load the protocol (compiled .tii file)',
    `let protocol = tx3_sdk::tii::Protocol::from_file(${JSON.stringify(tiiPath(protocol))})?;`,
    '',
    '// 2. Connect to a TRP server',
    ...rustTrpInit(trp),
    '',
    '// 3. Configure a signer (uncomment to enable .sign() / .submit())',
    '// use tx3_sdk::CardanoSigner;',
    '// let signer = CardanoSigner::from_mnemonic("addr_test1...", "word1 word2 ... word24")?;',
    '',
    `// 4. Bind parties${profile ? ` and select the "${profile.name}" profile` : ''}`,
    ...clientLines,
    '',
    '// 5. Invoke one of the transactions listed below.',
    '',
    '// 6. Once a signer is bound, chain .sign() / .submit() / .wait_for_confirmed():',
    '// use tx3_sdk::PollConfig;',
    '// let signed = result.sign()?;',
    '// let submitted = signed.submit().await?;',
    '// let status = submitted.wait_for_confirmed(PollConfig::default()).await?;',
  ].join('\n');
}

function rustTxBlock(tx: Tx, protocol: Protocol): string {
  const varName = toSnakeCase(tx.name);
  const argLines = userProvidedParams(tx, protocol).map(param =>
    `    .arg(${JSON.stringify(param.name)}, ${formatRustValue(placeholderFor(param.type))})`,
  );
  if (argLines.length === 0) {
    return `let ${varName} = tx3.tx(${JSON.stringify(tx.name)}).resolve().await?;`;
  }
  return [
    `let ${varName} = tx3`,
    `    .tx(${JSON.stringify(tx.name)})`,
    ...argLines,
    '    .resolve()',
    '    .await?;',
  ].join('\n');
}

// -- Python -----------------------------------------------------------------

function pythonTrpInit(trp: TrpConfig): string {
  if (!trp.headers) {
    return `    trp = TrpClient(endpoint=${JSON.stringify(trp.endpoint)})`;
  }
  const headersPyDict = '{'
    + Object.entries(trp.headers).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')
    + '}';
  return `    trp = TrpClient(endpoint=${JSON.stringify(trp.endpoint)}, headers=${headersPyDict})`;
}

function pythonSetup(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const partyLines = sortedProtocolParties(protocol).map(p =>
    `        .with_party(${JSON.stringify(p.name)}, Party.address(${JSON.stringify(p.address)}))`,
  );

  const clientLines = [
    '    client = (',
    '        Tx3Client(protocol, trp)',
    ...(profile ? [`        .with_profile(${JSON.stringify(profile.name)})`] : []),
    ...partyLines,
    '    )',
  ];

  return [
    'import asyncio',
    '',
    'from tx3_sdk import Party, Protocol, TrpClient, Tx3Client',
    '',
    '',
    'async def main() -> None:',
    '    # 1) Load the protocol (compiled .tii file)',
    `    protocol = Protocol.from_file(${JSON.stringify(tiiPath(protocol))})`,
    '',
    '    # 2) Connect to a TRP server',
    pythonTrpInit(trp),
    '',
    '    # 3) Configure a signer (uncomment to enable .sign() / .submit())',
    '    # from tx3_sdk import CardanoSigner',
    '    # signer = CardanoSigner.from_mnemonic(address="addr_test1...", phrase="word1 word2 ... word24")',
    '',
    `    # 4) Bind parties${profile ? ` and select the "${profile.name}" profile` : ''}`,
    ...clientLines,
    '',
    '    # 5) Invoke one of the transactions listed below.',
    '',
    '    # 6) Once a signer is bound, chain .sign() / .submit() / .wait_for_confirmed():',
    '    # from tx3_sdk import PollConfig',
    '    # signed = await result.sign()',
    '    # submitted = await signed.submit()',
    '    # status = await submitted.wait_for_confirmed(PollConfig.default())',
    '',
    '',
    'asyncio.run(main())',
  ].join('\n');
}

function pythonTxBlock(tx: Tx, protocol: Protocol): string {
  const varName = toSnakeCase(tx.name);
  const argLines = userProvidedParams(tx, protocol).map(param =>
    `        .arg(${JSON.stringify(param.name)}, ${formatPythonValue(placeholderFor(param.type), param.type)})`,
  );
  if (argLines.length === 0) {
    return `${varName} = await client.tx(${JSON.stringify(tx.name)}).resolve()`;
  }
  return [
    `${varName} = await (`,
    `    client.tx(${JSON.stringify(tx.name)})`,
    ...argLines,
    '        .resolve()',
    ')',
  ].join('\n');
}

// -- Go ---------------------------------------------------------------------

function goTrpInit(trp: TrpConfig): string[] {
  const endpoint = `        Endpoint: ${JSON.stringify(trp.endpoint)},`;
  if (!trp.headers) {
    return [
      '    trpClient := tx3.NewTRPClient(trp.ClientOptions{',
      endpoint,
      '    })',
    ];
  }
  const headerLines = Object.entries(trp.headers).map(([k, v]) =>
    `            ${JSON.stringify(k)}: ${JSON.stringify(v)},`,
  );
  return [
    '    trpClient := tx3.NewTRPClient(trp.ClientOptions{',
    endpoint,
    '        Headers: map[string]string{',
    ...headerLines,
    '        },',
    '    })',
  ];
}

function goSetup(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const partyLines = sortedProtocolParties(protocol).map(p =>
    `        WithParty(${JSON.stringify(p.name)}, tx3.AddressParty(${JSON.stringify(p.address)})).`,
  );

  const clientLines = [
    '    client := tx3.NewClient(protocol, trpClient).',
    ...(profile ? [`        WithProfile(${JSON.stringify(profile.name)}).`] : []),
    ...partyLines,
  ];
  // Strip trailing dot on the last chained call.
  const lastIdx = clientLines.length - 1;
  clientLines[lastIdx] = clientLines[lastIdx].replace(/\.\s*$/, '');

  return [
    'package main',
    '',
    'import (',
    '    "context"',
    '    "log"',
    '',
    '    tx3 "github.com/tx3-lang/go-sdk/sdk"',
    '    "github.com/tx3-lang/go-sdk/sdk/trp"',
    ')',
    '',
    'func main() {',
    '    // 1. Load the protocol (compiled .tii file)',
    `    protocol, err := tx3.ProtocolFromFile(${JSON.stringify(tiiPath(protocol))})`,
    '    if err != nil {',
    '        log.Fatal(err)',
    '    }',
    '',
    '    // 2. Connect to a TRP server',
    ...goTrpInit(trp),
    '',
    '    // 3. Configure a signer (uncomment to enable .Sign() / .Submit())',
    '    // mySigner, _ := signer.CardanoSignerFromMnemonic("addr_test1...", "word1 word2 ... word24")',
    '',
    `    // 4. Bind parties${profile ? ` and select the "${profile.name}" profile` : ''}`,
    ...clientLines,
    '',
    '    ctx := context.Background()',
    '    _ = ctx',
    '',
    '    // 5. Invoke one of the transactions listed below.',
    '',
    '    // 6. Once a signer is bound, chain .Sign() / .Submit() / .WaitForConfirmed():',
    '    // signed := result.Sign()',
    '    // submitted, _ := signed.Submit(ctx)',
    '    // status, _ := submitted.WaitForConfirmed(ctx, tx3.DefaultPollConfig())',
    '}',
  ].join('\n');
}

function goTxBlock(tx: Tx, protocol: Protocol): string {
  const varName = toCamelCase(tx.name);
  const argLines = userProvidedParams(tx, protocol).map(param =>
    `    Arg(${JSON.stringify(param.name)}, ${formatGoValue(placeholderFor(param.type), param.type)}).`,
  );
  if (argLines.length === 0) {
    return [
      `${varName}, err := client.Tx(${JSON.stringify(tx.name)}).Resolve(ctx)`,
      'if err != nil {',
      '    log.Fatal(err)',
      '}',
      `_ = ${varName}`,
    ].join('\n');
  }
  return [
    `${varName}, err := client.Tx(${JSON.stringify(tx.name)}).`,
    ...argLines,
    '    Resolve(ctx)',
    'if err != nil {',
    '    log.Fatal(err)',
    '}',
    `_ = ${varName}`,
  ].join('\n');
}

// -- Entry point ------------------------------------------------------------

export function generateQuickStart(
  sdk: SDKKey,
  protocol: Protocol,
  options: QuickStartOptions,
): QuickStartSnippet {
  const { profile, trp } = options;
  const txs = [...(protocol.transactions ?? [])].sort(byName);

  const buildBlocks = (render: (tx: Tx) => string): QuickStartTx[] =>
    txs.map(tx => ({ name: tx.name, description: tx.description, code: render(tx) }));

  switch (sdk) {
    case 'typescript':
      return {
        lang: 'typescript',
        setup: tsSetup(protocol, profile, trp),
        transactions: buildBlocks(tx => tsTxBlock(tx, protocol)),
      };
    case 'rust':
      return {
        lang: 'rust',
        setup: rustSetup(protocol, profile, trp),
        transactions: buildBlocks(tx => rustTxBlock(tx, protocol)),
      };
    case 'python':
      return {
        lang: 'python',
        setup: pythonSetup(protocol, profile, trp),
        transactions: buildBlocks(tx => pythonTxBlock(tx, protocol)),
      };
    case 'go':
      return {
        lang: 'go',
        setup: goSetup(protocol, profile, trp),
        transactions: buildBlocks(tx => goTxBlock(tx, protocol)),
      };
  }
}
