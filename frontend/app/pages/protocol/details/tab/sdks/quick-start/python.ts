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

function pythonModule(protocol: Protocol): string {
  return `gen.python.${toSnakeCase(protocol.name)}`;
}

function clientOptionsLiteral(trp: TrpConfig): string {
  if (!trp.headers) {
    return `ClientOptions(endpoint=${JSON.stringify(trp.endpoint)})`;
  }
  const headers = '{'
    + Object.entries(trp.headers).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')
    + '}';
  return `ClientOptions(endpoint=${JSON.stringify(trp.endpoint)}, headers=${headers})`;
}

function quickStart(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const module = pythonModule(protocol);
  const hasProfiles = (protocol.profiles ?? []).length > 0;
  const supplied = profileSuppliedNames(profile);
  const unbound = unboundParties(protocol, supplied);
  const profileArg = hasProfiles && profile
    ? `, Profile.${toSnakeCase(profile.name).toUpperCase()}`
    : '';

  const partyLines = unbound.map((p, i) => {
    const setter = `with_${toSnakeCase(p.name)}`;
    if (i === 0) {
      return `client = client.${setter}(Party.signer(signer))`;
    }
    return `client = client.${setter}(Party.address(${JSON.stringify(p.address)}))`;
  });

  return [
    `from ${module} import Client${hasProfiles ? ', Profile' : ''}`,
    'from tx3_sdk import Party',
    'from tx3_sdk.signer import CardanoSigner',
    'from tx3_sdk.trp.client import ClientOptions',
    '',
    'signer = CardanoSigner.from_hex("addr_test1...", "deadbeef...")',
    '',
    `client = Client(${clientOptionsLiteral(trp)}${profileArg})`,
    ...partyLines,
  ].join('\n');
}

function txBlock(tx: Tx, protocol: Protocol): string {
  const supplied = profileSuppliedNames(null);
  const params = userProvidedParams(tx, protocol, supplied);
  const varName = toSnakeCase(tx.name);
  const method = toSnakeCase(tx.name);
  const paramsImport = `from ${pythonModule(protocol)} import ${toPascalCase(tx.name)}Params`;
  const paramsType = `${toPascalCase(tx.name)}Params`;
  if (params.length === 0) {
    return [
      paramsImport,
      '',
      `${varName} = await client.${method}(${paramsType}()).resolve()`,
    ].join('\n');
  }
  const argLines = params.map(param =>
    `    ${toSnakeCase(param.name)}=${JSON.stringify(placeholderFor(param.type))},`,
  );
  return [
    paramsImport,
    '',
    `${varName} = await client.${method}(${paramsType}(`,
    ...argLines,
    ')).resolve()',
  ].join('\n');
}

function lifecycle(_protocol: Protocol): string {
  return [
    'from tx3_sdk.facade import PollConfig',
    '',
    '# `resolved` is the result of one of the transactions above.',
    'signed = await resolved.sign()',
    'submitted = await signed.submit()',
    'status = await submitted.wait_for_confirmed(PollConfig.default())',
  ].join('\n');
}

export const pythonRenderer: SdkRenderer = {
  lang: 'python',
  quickStart,
  txBlock,
  lifecycle,
};
