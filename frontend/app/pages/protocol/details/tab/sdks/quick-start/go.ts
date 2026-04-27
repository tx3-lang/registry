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
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (type.toLowerCase() === 'int' && typeof value === 'string' && /^-?\d+$/.test(value)) return value;
  return JSON.stringify(String(value));
}

function trpInit(trp: TrpConfig): string[] {
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

function setup(protocol: Protocol, profile: Profile | null, trp: TrpConfig, supplied: Set<string>): string {
  const partyLines = sortedProtocolParties(protocol, supplied).map(p =>
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
    ...trpInit(trp),
    '',
    '    // 3. Configure a signer (uncomment to enable .Sign() / .Submit())',
    '    // mySigner, _ := signer.CardanoSignerFromMnemonic("addr_test1...", "word1 word2 ... word24")',
    '',
    `    // 4. Bind parties${profile ? ` and select the "${profile.name}" profile` : ''}`,
    ...clientLines,
    '',
    '    ctx := context.Background()',
    '',
    '    // 5. Invoke one of the transactions listed below.',
    '',
    '    // 6. Once a signer is bound, chain .Sign() / .Submit() / .WaitForConfirmed():',
    '    signed := result.Sign()',
    '    submitted, _ := signed.Submit(ctx)',
    '    status, _ := submitted.WaitForConfirmed(ctx, tx3.DefaultPollConfig())',
    '    _ = status',
    '}',
  ].join('\n');
}

function txBlock(tx: Tx, protocol: Protocol, supplied: Set<string>): string {
  const varName = toCamelCase(tx.name);
  const argLines = userProvidedParams(tx, protocol, supplied).map(param =>
    `    Arg(${JSON.stringify(param.name)}, ${formatValue(placeholderFor(param.type), param.type)}).`,
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

export const goRenderer: SdkRenderer = { lang: 'go', setup, txBlock };
