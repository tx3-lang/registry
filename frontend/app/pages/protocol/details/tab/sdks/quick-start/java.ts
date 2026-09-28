import {
  placeholderFor,
  profileSuppliedNames,
  type SdkRenderer,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  type TrpConfig,
  unboundPartyBindings,
  userProvidedParams,
} from './shared';

// The generated client lives in `land.tx3.generated.<camelName>` as a single
// `<PascalName>Client` class; tx params are records nested inside it.
function clientClass(protocol: Protocol): string {
  return `${toPascalCase(protocol.name)}Client`;
}

function clientOptionsBlock(trp: TrpConfig): string[] {
  const uri = `java.net.URI.create(${JSON.stringify(trp.endpoint)})`;
  if (!trp.headers) {
    return [`var options = ClientOptions.forEndpoint(${uri});`];
  }
  const headers = Object.entries(trp.headers)
    .map(([k, v]) => `${JSON.stringify(k)}, ${JSON.stringify(v)}`)
    .join(', ');
  return [
    'var options = new ClientOptions(',
    `    ${uri},`,
    `    java.util.Map.of(${headers}),`,
    '    null);',
  ];
}

function quickStart(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const client = clientClass(protocol);
  const hasProfiles = (protocol.profiles ?? []).length > 0;
  const supplied = profileSuppliedNames(profile);
  const unbound = unboundPartyBindings(protocol, profile, supplied);
  const profileArg = hasProfiles && profile
    ? `, ${client}.Profile.${toSnakeCase(profile.name).toUpperCase()}`
    : '';

  const partyLines = unbound.map(p => {
    const setter = `with${toPascalCase(p.name)}`;
    if (p.kind === 'signer') {
      return `    .${setter}(Party.signer(signer))`;
    }
    return `    .${setter}(Party.address(new Address(${JSON.stringify(p.address)})))`;
  });

  const lines: string[] = [
    `import land.tx3.generated.${toCamelCase(protocol.name)}.${client};`,
    'import land.tx3.sdk.Address;',
    'import land.tx3.sdk.CardanoSigner;',
    'import land.tx3.sdk.ClientOptions;',
    'import land.tx3.sdk.Party;',
    '',
    'var signer = new CardanoSigner("word1 word2 ...", new Address("addr_test1..."));',
    ...clientOptionsBlock(trp),
    '',
  ];
  if (partyLines.length === 0) {
    lines.push(`var client = new ${client}(options${profileArg});`);
  } else {
    lines.push(`var client = new ${client}(options${profileArg})`);
    lines.push(...partyLines);
    lines[lines.length - 1] += ';';
  }
  return lines.join('\n');
}

function txBlock(tx: Tx, protocol: Protocol): string {
  const supplied = profileSuppliedNames(null);
  const params = userProvidedParams(tx, protocol, supplied);
  const method = toCamelCase(tx.name);
  const paramsType = `${clientClass(protocol)}.${toPascalCase(tx.name)}Params`;
  if (params.length === 0) {
    return `var resolved = client.${method}(new ${paramsType}()).resolve().join();`;
  }
  // Records are positional, so each value is labelled with its component name.
  const argLines = params.map((param, idx) =>
    `    /* ${toCamelCase(param.name)} */ ${JSON.stringify(placeholderFor(param.type))}${idx < params.length - 1 ? ',' : ''}`,
  );
  return [
    ...(params.length > 1 ? ['// Pass the values in the order the generated record declares them.'] : []),
    `var resolved = client.${method}(new ${paramsType}(`,
    ...argLines,
    ')).resolve().join();',
  ].join('\n');
}

function lifecycle(_protocol: Protocol): string {
  return [
    'import land.tx3.sdk.PollConfig;',
    '',
    '// `resolved` is the result of one of the transactions above.',
    'var signed = resolved.sign();',
    'var submitted = signed.submit().join();',
    'var status = submitted.waitForConfirmed(PollConfig.defaults()).join();',
  ].join('\n');
}

export const javaRenderer: SdkRenderer = {
  lang: 'java',
  quickStart,
  txBlock,
  lifecycle,
};
