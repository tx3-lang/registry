import {
  placeholderFor,
  type SdkRenderer,
  sortedProtocolParties,
  tiiPath,
  toSnakeCase,
  type TrpConfig,
  userProvidedParams,
} from './shared';

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return `json!(${value})`;
  if (typeof value === 'number') return `json!(${value})`;
  if (typeof value === 'bigint') return `json!(${value})`;
  return `json!(${JSON.stringify(String(value))})`;
}

function trpInit(trp: TrpConfig): string[] {
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

function setup(protocol: Protocol, profile: Profile | null, trp: TrpConfig, supplied: Set<string>): string {
  const partyLines = sortedProtocolParties(protocol, supplied).map(p =>
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
    'use tx3_sdk::{CardanoSigner, Party, PollConfig, Tx3Client};',
    '',
    '// 1. Load the protocol (compiled .tii file)',
    `let protocol = tx3_sdk::tii::Protocol::from_file(${JSON.stringify(tiiPath(protocol))})?;`,
    '',
    '// 2. Connect to a TRP server',
    ...trpInit(trp),
    '',
    '// 3. Configure a signer (uncomment to enable .sign() / .submit())',
    '// let signer = CardanoSigner::from_mnemonic("addr_test1...", "word1 word2 ... word24")?;',
    '',
    `// 4. Bind parties${profile ? ` and select the "${profile.name}" profile` : ''}`,
    ...clientLines,
    '',
    '// 5. Invoke one of the transactions listed below.',
    '',
    '// 6. Once a signer is bound, chain .sign() / .submit() / .wait_for_confirmed():',
    'let signed = result.sign()?;',
    'let submitted = signed.submit().await?;',
    'let status = submitted.wait_for_confirmed(PollConfig::default()).await?;',
  ].join('\n');
}

function txBlock(tx: Tx, protocol: Protocol, supplied: Set<string>): string {
  const varName = toSnakeCase(tx.name);
  const argLines = userProvidedParams(tx, protocol, supplied).map(param =>
    `    .arg(${JSON.stringify(param.name)}, ${formatValue(placeholderFor(param.type))})`,
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

export const rustRenderer: SdkRenderer = { lang: 'rust', setup, txBlock };
