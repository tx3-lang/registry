import {
  placeholderFor,
  profileSuppliedNames,
  type SdkRenderer,
  type SetupStep,
  toCamelCase,
  toPascalCase,
  type TrpConfig,
  unboundParties,
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

function clientOptionsLiteral(trp: TrpConfig): string {
  if (!trp.headers) {
    return `{ endpoint: ${JSON.stringify(trp.endpoint)} }`;
  }
  const headers = Object.entries(trp.headers)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(', ');
  return [
    '{',
    `  endpoint: ${JSON.stringify(trp.endpoint)},`,
    `  headers: { ${headers} },`,
    '}',
  ].join('\n');
}

function quickStart(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const hasProfiles = (protocol.profiles ?? []).length > 0;
  const supplied = profileSuppliedNames(profile);
  const unbound = unboundParties(protocol, supplied);
  const profileArg = hasProfiles && profile ? `, ${JSON.stringify(profile.name)}` : '';

  const partyLines = unbound.map((p, i) => {
    const setter = `with${toPascalCase(p.name)}`;
    if (i === 0) {
      return `  .${setter}(Party.signer(signer))`;
    }
    return `  .${setter}(Party.address(${JSON.stringify(p.address)}))`;
  });

  const lines: string[] = [
    `import { Client } from "./gen/typescript/${protocol.name}";`,
    'import { Ed25519Signer, Party } from "tx3-sdk";',
    '',
    'const signer = Ed25519Signer.fromHex("addr_test1...", "deadbeef...");',
    '',
  ];
  if (partyLines.length === 0) {
    lines.push(`const client = new Client(${clientOptionsLiteral(trp)}${profileArg});`);
  } else {
    lines.push(`const client = new Client(${clientOptionsLiteral(trp)}${profileArg})`);
    lines.push(...partyLines);
    lines[lines.length - 1] += ';';
  }
  return lines.join('\n');
}

function txBlock(tx: Tx, protocol: Protocol): string {
  const supplied = profileSuppliedNames(null);
  const params = userProvidedParams(tx, protocol, supplied);
  const varName = toCamelCase(tx.name);
  const method = toCamelCase(tx.name);
  if (params.length === 0) {
    return `const ${varName} = await client.${method}({}).resolve();`;
  }
  const argLines = params.map(param =>
    `  ${toCamelCase(param.name)}: ${formatValue(placeholderFor(param.type), param.type)},`,
  );
  return [
    `const ${varName} = await client.${method}({`,
    ...argLines,
    '}).resolve();',
  ].join('\n');
}

function lifecycle(_protocol: Protocol): string {
  return [
    'import { PollConfig } from "tx3-sdk";',
    '',
    '// `resolved` is the result of one of the transactions above.',
    'const signed = await resolved.sign();',
    'const submitted = await signed.submit();',
    'const status = await submitted.waitForConfirmed(PollConfig.default());',
  ].join('\n');
}

const postCodegenInstall: SetupStep = {
  kind: 'shell',
  lang: 'bash',
  title: 'Install the generated client\'s dependencies',
  body: 'cd gen/typescript && npm install',
  note: 'The generated package.json declares tx3-sdk as a dependency.',
};

export const typescriptRenderer: SdkRenderer = {
  lang: 'typescript',
  postCodegenInstall,
  quickStart,
  txBlock,
  lifecycle,
};
