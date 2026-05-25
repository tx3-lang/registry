import {
  placeholderFor,
  profileSuppliedNames,
  type SdkRenderer,
  type SetupStep,
  toPascalCase,
  type TrpConfig,
  unboundParties,
  userProvidedParams,
} from './shared';

function formatValue(value: unknown, type: string): string {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (type.toLowerCase() === 'int' && typeof value === 'string' && /^-?\d+$/.test(value)) return value;
  return JSON.stringify(String(value));
}

function clientOptionsBlock(trp: TrpConfig): string[] {
  const endpoint = `    Endpoint: ${JSON.stringify(trp.endpoint)},`;
  if (!trp.headers) {
    return [
      'options := trp.ClientOptions{',
      endpoint,
      '}',
    ];
  }
  const headerLines = Object.entries(trp.headers).map(([k, v]) =>
    `        ${JSON.stringify(k)}: ${JSON.stringify(v)},`,
  );
  return [
    'options := trp.ClientOptions{',
    endpoint,
    '    Headers: map[string]string{',
    ...headerLines,
    '    },',
    '}',
  ];
}

function quickStart(protocol: Protocol, profile: Profile | null, trp: TrpConfig): string {
  const hasProfiles = (protocol.profiles ?? []).length > 0;
  const supplied = profileSuppliedNames(profile);
  const unbound = unboundParties(protocol, supplied);
  const profileArg = hasProfiles && profile
    ? `, protocol.Profile${toPascalCase(profile.name)}`
    : '';

  const partyLines = unbound.map((p, i) => {
    const setter = `With${toPascalCase(p.name)}`;
    if (i === 0) {
      return `    .${setter}(facade.SignerParty(signer))`;
    }
    return `    .${setter}(facade.AddressParty(${JSON.stringify(p.address)}))`;
  });

  const lines: string[] = [
    'import (',
    '    "context"',
    '    "log"',
    '',
    '    "github.com/tx3-lang/go-sdk/sdk/facade"',
    '    "github.com/tx3-lang/go-sdk/sdk/signer"',
    '    "github.com/tx3-lang/go-sdk/sdk/trp"',
    '    "./gen/go/protocol"',
    ')',
    '',
    'ctx := context.Background()',
    ...clientOptionsBlock(trp),
    '',
    'mySigner, err := signer.Ed25519FromHex("addr_test1...", "deadbeef...")',
    'if err != nil {',
    '    log.Fatal(err)',
    '}',
    '',
  ];
  if (partyLines.length === 0) {
    lines.push(`client := protocol.NewClient(options${profileArg})`);
  } else {
    lines.push(`client := protocol.NewClient(options${profileArg}).`);
    lines.push(...partyLines);
    // Strip trailing dot on the last chained call.
    const lastIdx = lines.length - 1;
    lines[lastIdx] = lines[lastIdx].replace(/\.\s*$/, '');
  }
  return lines.join('\n');
}

function txBlock(tx: Tx, protocol: Protocol): string {
  const supplied = profileSuppliedNames(null);
  const params = userProvidedParams(tx, protocol, supplied);
  const method = toPascalCase(tx.name);
  const paramsType = `protocol.${toPascalCase(tx.name)}Params`;
  if (params.length === 0) {
    return [
      `resolved, err := client.${method}(${paramsType}{}).Resolve(ctx)`,
      'if err != nil {',
      '    log.Fatal(err)',
      '}',
    ].join('\n');
  }
  const argLines = params.map(param =>
    `    ${toPascalCase(param.name)}: ${formatValue(placeholderFor(param.type), param.type)},`,
  );
  return [
    `resolved, err := client.${method}(${paramsType}{`,
    ...argLines,
    '}).Resolve(ctx)',
    'if err != nil {',
    '    log.Fatal(err)',
    '}',
  ].join('\n');
}

function lifecycle(_protocol: Protocol): string {
  return [
    '// `resolved` is the result of one of the transactions above.',
    'signed, err := resolved.Sign()',
    'if err != nil {',
    '    log.Fatal(err)',
    '}',
    'submitted, err := signed.Submit(ctx)',
    'if err != nil {',
    '    log.Fatal(err)',
    '}',
    'status, err := submitted.WaitForConfirmed(ctx, facade.DefaultPollConfig())',
    'if err != nil {',
    '    log.Fatal(err)',
    '}',
    '_ = status',
  ].join('\n');
}

const postCodegenInstall: SetupStep = {
  kind: 'shell',
  lang: 'bash',
  title: 'Install the generated client\'s dependencies',
  body: 'cd gen/go && go mod tidy',
  note: 'The generated go.mod declares the tx3 go-sdk; `go mod tidy` resolves it.',
};

export const goRenderer: SdkRenderer = {
  lang: 'go',
  postCodegenInstall,
  quickStart,
  txBlock,
  lifecycle,
};
