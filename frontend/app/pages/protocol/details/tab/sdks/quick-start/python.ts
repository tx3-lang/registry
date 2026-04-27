import {
  placeholderFor,
  type SdkRenderer,
  sortedProtocolParties,
  tiiPath,
  toSnakeCase,
  type TrpConfig,
  userProvidedParams,
} from './shared';

function formatValue(value: unknown, type: string): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (type.toLowerCase() === 'int' && typeof value === 'string' && /^-?\d+$/.test(value)) return value;
  return JSON.stringify(String(value));
}

function trpInit(trp: TrpConfig): string {
  if (!trp.headers) {
    return `    trp = TrpClient(endpoint=${JSON.stringify(trp.endpoint)})`;
  }
  const headersPyDict = '{'
    + Object.entries(trp.headers).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')
    + '}';
  return `    trp = TrpClient(endpoint=${JSON.stringify(trp.endpoint)}, headers=${headersPyDict})`;
}

function setup(protocol: Protocol, profile: Profile | null, trp: TrpConfig, supplied: Set<string>): string {
  const partyLines = sortedProtocolParties(protocol, supplied).map(p =>
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
    'from tx3_sdk import CardanoSigner, Party, PollConfig, Protocol, TrpClient, Tx3Client',
    '',
    '',
    'async def main() -> None:',
    '    # 1) Load the protocol (compiled .tii file)',
    `    protocol = Protocol.from_file(${JSON.stringify(tiiPath(protocol))})`,
    '',
    '    # 2) Connect to a TRP server',
    trpInit(trp),
    '',
    '    # 3) Configure a signer (uncomment to enable .sign() / .submit())',
    '    # signer = CardanoSigner.from_mnemonic(address="addr_test1...", phrase="word1 word2 ... word24")',
    '',
    `    # 4) Bind parties${profile ? ` and select the "${profile.name}" profile` : ''}`,
    ...clientLines,
    '',
    '    # 5) Invoke one of the transactions listed below.',
    '',
    '    # 6) Once a signer is bound, chain .sign() / .submit() / .wait_for_confirmed():',
    '    signed = await result.sign()',
    '    submitted = await signed.submit()',
    '    status = await submitted.wait_for_confirmed(PollConfig.default())',
    '',
    '',
    'asyncio.run(main())',
  ].join('\n');
}

function txBlock(tx: Tx, protocol: Protocol, supplied: Set<string>): string {
  const varName = toSnakeCase(tx.name);
  const argLines = userProvidedParams(tx, protocol, supplied).map(param =>
    `        .arg(${JSON.stringify(param.name)}, ${formatValue(placeholderFor(param.type), param.type)})`,
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

export const pythonRenderer: SdkRenderer = { lang: 'python', setup, txBlock };
