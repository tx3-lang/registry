import {
  placeholderFor,
  type SdkRenderer,
  sortedProtocolParties,
  tiiPath,
  toCamelCase,
  type TrpConfig,
  userProvidedParams,
} from './shared';

function formatValue(value: unknown, type: string): string {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isInteger(value)) return `${value}n`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (type.toLowerCase() === 'int' && typeof value === 'string' && /^-?\d+$/.test(value)) return `${value}n`;
  return JSON.stringify(String(value));
}

function trpInit(trp: TrpConfig): string[] {
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

function setup(protocol: Protocol, profile: Profile | null, trp: TrpConfig, supplied: Set<string>): string {
  const partyLines = sortedProtocolParties(protocol, supplied).map(p =>
    `  .withParty(${JSON.stringify(p.name)}, Party.address(${JSON.stringify(p.address)}))`,
  );

  const clientLines = [
    'const tx3 = new Tx3Client(protocol, trp)',
    ...(profile ? [`  .withProfile(${JSON.stringify(profile.name)})`] : []),
    ...partyLines,
  ];
  clientLines[clientLines.length - 1] += ';';

  return [
    'import { Tx3Client, Protocol, TrpClient, Party, Ed25519Signer, PollConfig } from "tx3-sdk";',
    '',
    '// 1. Load the protocol (compiled .tii file)',
    `const protocol = await Protocol.fromFile(${JSON.stringify(tiiPath(protocol))});`,
    '',
    '// 2. Connect to a TRP server',
    ...trpInit(trp),
    '',
    '// 3. Configure a signer (uncomment to enable .sign() / .submit())',
    '// const signer = Ed25519Signer.fromHex("addr_test1...", "deadbeef...");',
    '',
    `// 4. Bind parties${profile ? ` and select the "${profile.name}" profile` : ''}`,
    ...clientLines,
    '',
    '// 5. Invoke one of the transactions listed below.',
    '',
    '// 6. Once a signer is bound, chain .sign() / .submit() / .waitForConfirmed():',
    'const status = await result',
    '  .sign()',
    '  .then(s => s.submit())',
    '  .then(sub => sub.waitForConfirmed(PollConfig.default()));',
  ].join('\n');
}

function txBlock(tx: Tx, protocol: Protocol, supplied: Set<string>): string {
  const varName = toCamelCase(tx.name);
  const argLines = userProvidedParams(tx, protocol, supplied).map(param =>
    `  .arg(${JSON.stringify(param.name)}, ${formatValue(placeholderFor(param.type), param.type)})`,
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

export const typescriptRenderer: SdkRenderer = { lang: 'typescript', setup, txBlock };
