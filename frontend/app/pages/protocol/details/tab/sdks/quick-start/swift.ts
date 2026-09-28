import {
  placeholderFor,
  profileSuppliedNames,
  type SdkRenderer,
  toCamelCase,
  toPascalCase,
  type TrpConfig,
  unboundPartyBindings,
  userProvidedParams,
} from './shared';

// The generated package exposes one module and client type, both named
// `<PascalName>Client`; tx param structs are top-level in that module.
function clientType(protocol: Protocol): string {
  return `${toPascalCase(protocol.name)}Client`;
}

function clientOptionsBlock(trp: TrpConfig): string[] {
  const endpoint = `URL(string: ${JSON.stringify(trp.endpoint)})!`;
  if (!trp.headers) {
    return [`    options: ClientOptions(endpoint: ${endpoint}),`];
  }
  const headers = Object.entries(trp.headers)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(', ');
  return [
    '    options: ClientOptions(',
    `        endpoint: ${endpoint},`,
    `        headers: [${headers}]`,
    '    ),',
  ];
}

function quickStart(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const client = clientType(protocol);
  const hasProfiles = (protocol.profiles ?? []).length > 0;
  const supplied = profileSuppliedNames(profile);
  const unbound = unboundPartyBindings(protocol, profile, supplied);

  const partyLines = unbound.map(p => {
    const setter = `with${toPascalCase(p.name)}`;
    if (p.kind === 'signer') {
      return `.${setter}(.signer(signer))`;
    }
    return `.${setter}(.address(Address(${JSON.stringify(p.address)})))`;
  });
  // `Address(_:)` throws, so the chain needs `try` only when it binds one.
  const tryPrefix = unbound.some(p => p.kind === 'address') ? 'try ' : '';

  const optionsLines = clientOptionsBlock(trp);
  if (!(hasProfiles && profile)) {
    // Drop the trailing comma on the last initializer argument.
    const last = optionsLines.length - 1;
    optionsLines[last] = optionsLines[last].replace(/,$/, '');
  }

  return [
    'import Foundation',
    'import Tx3SDK',
    `import ${client}`,
    '',
    'let signer = try CardanoSigner(mnemonic: "word1 word2 ...", address: Address("addr_test1..."))',
    '',
    `let client = ${tryPrefix}${client}(`,
    ...optionsLines,
    ...(hasProfiles && profile ? [`    profile: .${toCamelCase(profile.name)}`] : []),
    ')',
    ...partyLines,
  ].join('\n');
}

function txBlock(tx: Tx, protocol: Protocol): string {
  const supplied = profileSuppliedNames(null);
  const params = userProvidedParams(tx, protocol, supplied);
  const method = toCamelCase(tx.name);
  const paramsType = `${toPascalCase(tx.name)}Params`;
  if (params.length === 0) {
    return `let resolved = try await client.${method}(${paramsType}()).resolve()`;
  }
  const argLines = params.map((param, idx) =>
    `    ${toCamelCase(param.name)}: ${JSON.stringify(placeholderFor(param.type))}${idx < params.length - 1 ? ',' : ''}`,
  );
  return [
    ...(params.length > 1 ? ['// Pass the labels in the order the generated struct declares them.'] : []),
    `let resolved = try await client.${method}(${paramsType}(`,
    ...argLines,
    ')).resolve()',
  ].join('\n');
}

function lifecycle(_protocol: Protocol): string {
  return [
    '// `resolved` is the result of one of the transactions above.',
    'let signed = try resolved.sign()',
    'let submitted = try await signed.submit()',
    'let status = try await submitted.waitForConfirmed(PollConfig())',
  ].join('\n');
}

export const swiftRenderer: SdkRenderer = {
  lang: 'swift',
  quickStart,
  txBlock,
  lifecycle,
};
