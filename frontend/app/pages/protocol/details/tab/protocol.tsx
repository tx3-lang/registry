interface Props {
  protocol: Protocol;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
      {children}
    </h3>
  );
}

function PartiesSection({ parties }: { parties: Party[] }) {
  if (parties.length === 0) return null;

  return (
    <section>
      <SectionTitle>Parties</SectionTitle>
      <p className="text-zinc-500 text-sm mb-4">
        The participants involved in this protocol's transactions.
      </p>
      <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden">
        <div className="px-5 py-2.5 border-b border-zinc-800 flex text-xs font-medium text-zinc-500 uppercase tracking-wider">
          <span className="flex-1 basis-1/3">Name</span>
          <span className="flex-1 basis-2/3">Description</span>
        </div>
        {parties.map(party => (
          <div
            key={party.name}
            className="px-5 py-3 border-b last:border-b-0 border-zinc-800/50 flex items-baseline"
          >
            <span className="flex-1 basis-1/3 text-zinc-50 font-medium text-sm">{party.name}</span>
            <span className="flex-1 basis-2/3 text-zinc-500 text-sm">
              {party.description || '\u2014'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnvironmentSection({ environment }: { environment: EnvironmentParam[] }) {
  if (environment.length === 0) return null;

  return (
    <section>
      <SectionTitle>Environment</SectionTitle>
      <p className="text-zinc-500 text-sm mb-4">
        Configuration values required to execute this protocol's transactions.
      </p>
      <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden">
        <div className="px-5 py-2.5 border-b border-zinc-800 flex text-xs font-medium text-zinc-500 uppercase tracking-wider">
          <span className="flex-1 basis-1/4">Name</span>
          <span className="flex-1 basis-2/4">Description</span>
          <span className="w-40 text-right">Type</span>
        </div>
        {environment.map(env => (
          <div
            key={env.name}
            className="px-5 py-3 border-b last:border-b-0 border-zinc-800/50 flex items-baseline"
          >
            <span className="flex-1 basis-1/4 text-zinc-50 font-mono text-sm">{env.name}</span>
            <span className="flex-1 basis-2/4 text-zinc-500 text-sm">
              {env.description || '\u2014'}
            </span>
            <span className="w-40 text-right text-zinc-500 font-mono text-sm">{env.type}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfilesSection({ profiles }: { profiles: Profile[] }) {
  if (profiles.length === 0) return null;

  return (
    <section>
      <SectionTitle>Profiles</SectionTitle>
      <p className="text-zinc-500 text-sm mb-4">
        Pre-configured sets of environment and party values for different deployment targets.
      </p>
      <div className="flex flex-col gap-6">
        {profiles.map(profile => {
          let envEntries: [string, unknown][] = [];
          if (profile.environment) {
            try {
              envEntries = Object.entries(JSON.parse(profile.environment));
            } catch { /* ignore */ }
          }
          const rows = [
            ...profile.parties.map(p => ({ key: p.name, value: p.address, kind: 'party' as const })),
            ...envEntries.map(([key, value]) => ({ key, value: String(value), kind: 'env' as const })),
          ];

          if (rows.length === 0) return null;

          return (
            <div key={profile.name}>
              <div className="mb-2">
                <span className="text-zinc-50 font-medium">{profile.name}</span>
                {profile.description && (
                  <span className="text-zinc-500 text-sm ml-2">{profile.description}</span>
                )}
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden">
                <div className="px-5 py-2.5 border-b border-zinc-800 flex text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  <span className="flex-1 basis-1/4">Key</span>
                  <span className="flex-1 basis-2/4">Value</span>
                  <span className="w-20 text-right">Type</span>
                </div>
                {rows.map(row => (
                  <div
                    key={row.key}
                    className="px-5 py-3 border-b last:border-b-0 border-zinc-800/50 flex items-baseline"
                  >
                    <span className="flex-1 basis-1/4 text-zinc-400 font-mono text-sm">{row.key}</span>
                    <span className="flex-1 basis-2/4 text-zinc-50 font-mono text-sm break-all">{row.value}</span>
                    <span className={`w-20 text-right text-xs font-medium ${row.kind === 'party' ? 'text-indigo-400' : 'text-emerald-400'}`}>
                      {row.kind}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TransactionDetail({ tx }: { tx: Tx }) {
  const inputs = (tx as any).inputs as { name: string; party: string | null; hasRedeemer: boolean }[] | undefined;
  const outputs = (tx as any).outputs as { party: string | null; hasDatum: boolean; optional: boolean }[] | undefined;

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden">
      <div className="px-8 py-5 border-b border-zinc-800">
        <p className="text-zinc-50 text-lg font-medium">{tx.name}</p>
        {tx.description && (
          <p className="text-zinc-500 text-sm mt-1">{tx.description}</p>
        )}
      </div>

      <div className="px-8 py-5 space-y-6">
        {tx.svg && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Diagram</p>
            <div dangerouslySetInnerHTML={{ __html: tx.svg }} />
          </div>
        )}

        {tx.parameters.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Parameters</p>
            <div className="border border-zinc-800 rounded-md overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 flex text-xs font-medium text-zinc-600 uppercase tracking-wider">
                <span className="flex-1 basis-1/3">Name</span>
                <span className="flex-1 basis-1/3">Type</span>
                <span className="flex-1 basis-1/3">Description</span>
              </div>
              {tx.parameters.map(param => (
                <div key={param.name} className="px-4 py-2.5 border-b last:border-b-0 border-zinc-800/50 flex items-baseline">
                  <span className="flex-1 basis-1/3 text-zinc-50 font-mono text-sm">{param.name}</span>
                  <span className="flex-1 basis-1/3 text-zinc-500 font-mono text-sm">{param.type}</span>
                  <span className="flex-1 basis-1/3 text-zinc-500 text-sm">{param.description || '\u2014'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {inputs && inputs.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Inputs</p>
            <div className="border border-zinc-800 rounded-md overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 flex text-xs font-medium text-zinc-600 uppercase tracking-wider">
                <span className="flex-1 basis-1/3">Name</span>
                <span className="flex-1 basis-1/3">Party</span>
                <span className="w-28 text-right">Redeemer</span>
              </div>
              {inputs.map(input => (
                <div key={input.name} className="px-4 py-2.5 border-b last:border-b-0 border-zinc-800/50 flex items-baseline">
                  <span className="flex-1 basis-1/3 text-zinc-50 font-mono text-sm">{input.name}</span>
                  <span className="flex-1 basis-1/3 text-indigo-400 text-sm">{input.party || '\u2014'}</span>
                  <span className="w-28 text-right">
                    {input.hasRedeemer
                      ? <span className="text-amber-400 text-xs font-medium">script</span>
                      : <span className="text-zinc-600 text-xs">wallet</span>
                    }
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {outputs && outputs.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Outputs</p>
            <div className="border border-zinc-800 rounded-md overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 flex text-xs font-medium text-zinc-600 uppercase tracking-wider">
                <span className="flex-1 basis-1/3">Party</span>
                <span className="flex-1 basis-1/3">Datum</span>
                <span className="w-28 text-right">Optional</span>
              </div>
              {outputs.map((output, i) => (
                <div key={i} className="px-4 py-2.5 border-b last:border-b-0 border-zinc-800/50 flex items-baseline">
                  <span className="flex-1 basis-1/3 text-indigo-400 text-sm">{output.party || '\u2014'}</span>
                  <span className="flex-1 basis-1/3">
                    {output.hasDatum
                      ? <span className="text-emerald-400 text-xs font-medium">yes</span>
                      : <span className="text-zinc-600 text-xs">no</span>
                    }
                  </span>
                  <span className="w-28 text-right">
                    {output.optional
                      ? <span className="text-amber-400 text-xs font-medium">yes</span>
                      : <span className="text-zinc-600 text-xs">no</span>
                    }
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionsSection({ transactions }: { transactions: Tx[] }) {
  if (transactions.length === 0) return null;

  return (
    <section>
      <SectionTitle>Transactions</SectionTitle>
      <p className="text-zinc-500 text-sm mb-4">
        The transactions defined in this protocol, with their parameters, inputs, and outputs.
      </p>
      <div className="flex flex-col gap-4">
        {transactions.map(tx => (
          <TransactionDetail key={tx.name} tx={tx} />
        ))}
      </div>
    </section>
  );
}

export function TabProtocol({ protocol }: Props) {
  return (
    <div className="container flex-1 py-8 space-y-10">
      {protocol.description && (
        <section>
          <SectionTitle>About this Protocol</SectionTitle>
          <p className="text-zinc-300 leading-relaxed">{protocol.description}</p>
        </section>
      )}

      <PartiesSection parties={protocol.parties ?? []} />
      <EnvironmentSection environment={protocol.environment ?? []} />
      <TransactionsSection transactions={protocol.transactions ?? []} />
      <ProfilesSection profiles={protocol.profiles ?? []} />
    </div>
  );
}
