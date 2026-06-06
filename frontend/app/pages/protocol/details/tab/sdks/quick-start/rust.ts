import {
  placeholderFor,
  profileSuppliedNames,
  type SdkRenderer,
  toPascalCase,
  toSnakeCase,
  type TrpConfig,
  unboundParties,
  userProvidedParams,
} from './shared';

function cratePath(protocol: Protocol): string {
  return toSnakeCase(protocol.name);
}

function clientOptionsBlock(trp: TrpConfig): string[] {
  if (!trp.headers) {
    return [
      'let options = ClientOptions {',
      `    endpoint: ${JSON.stringify(trp.endpoint)}.to_string(),`,
      '    headers: None,',
      '};',
    ];
  }
  const headerInserts = Object.entries(trp.headers).map(([k, v]) =>
    `headers.insert(${JSON.stringify(k)}.to_string(), ${JSON.stringify(v)}.to_string());`,
  );
  return [
    'let mut headers = std::collections::HashMap::new();',
    ...headerInserts,
    'let options = ClientOptions {',
    `    endpoint: ${JSON.stringify(trp.endpoint)}.to_string(),`,
    '    headers: Some(headers),',
    '};',
  ];
}

function quickStart(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const crate = cratePath(protocol);
  const hasProfiles = (protocol.profiles ?? []).length > 0;
  const supplied = profileSuppliedNames(profile);
  const unbound = unboundParties(protocol, supplied);
  const profileArg = hasProfiles && profile
    ? `, ${crate}::Profile::${toPascalCase(profile.name)}`
    : '';

  const partyLines = unbound.map((p, i) => {
    const setter = `with_${toSnakeCase(p.name)}`;
    if (i === 0) {
      return `    .${setter}(Party::signer(signer))`;
    }
    return `    .${setter}(Party::address(${JSON.stringify(p.address)}))`;
  });

  const lines: string[] = [
    `use ${crate}::Client;`,
    'use tx3_sdk::Party;',
    'use tx3_sdk::signer::CardanoSigner;',
    'use tx3_sdk::trp::ClientOptions;',
    '',
    ...clientOptionsBlock(trp),
    '',
    'let signer = CardanoSigner::from_hex("addr_test1...", "deadbeef...")?;',
    '',
  ];
  if (partyLines.length === 0) {
    lines.push(`let client = Client::new(options${profileArg});`);
  } else {
    lines.push(`let client = Client::new(options${profileArg})`);
    lines.push(...partyLines);
    lines[lines.length - 1] += ';';
  }
  return lines.join('\n');
}

function txBlock(tx: Tx, protocol: Protocol): string {
  const supplied = profileSuppliedNames(null);
  const params = userProvidedParams(tx, protocol, supplied);
  const varName = toSnakeCase(tx.name);
  const method = toSnakeCase(tx.name);
  const paramsType = `${cratePath(protocol)}::${toPascalCase(tx.name)}Params`;
  if (params.length === 0) {
    return `let ${varName} = client.${method}(${paramsType} {}).resolve().await?;`;
  }
  const argLines = params.map(param =>
    `    ${toSnakeCase(param.name)}: ${JSON.stringify(placeholderFor(param.type))}.to_string(),`,
  );
  return [
    `let ${varName} = client.${method}(${paramsType} {`,
    ...argLines,
    '}).resolve().await?;',
  ].join('\n');
}

function lifecycle(_protocol: Protocol): string {
  return [
    'use tx3_sdk::facade::PollConfig;',
    '',
    '// `resolved` is the result of one of the transactions above.',
    'let signed = resolved.sign()?;',
    'let submitted = signed.submit().await?;',
    'let status = submitted.wait_for_confirmed(PollConfig::default()).await?;',
  ].join('\n');
}

export const rustRenderer: SdkRenderer = {
  lang: 'rust',
  postCodegenInstall: null,
  quickStart,
  txBlock,
  lifecycle,
};
