import clsx from 'clsx';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

interface Props {
  protocol: Protocol;
}

// Stable anchor id for a transaction so other tabs can deep-link into it.
export function txAnchor(name: string): string {
  return `tx-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

const SECTION_PARTIES = 'parties';
const SECTION_ENVIRONMENT = 'environment';
const SECTION_TRANSACTIONS = 'transactions';
const SECTION_PROFILES = 'profiles';

function SectionTitle({ children }: { children: React.ReactNode; }) {
  return (
    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
      {children}
    </h3>
  );
}

function PartiesSection({ parties }: { parties: Party[]; }) {
  if (parties.length === 0) return null;

  return (
    <section id={SECTION_PARTIES} className="scroll-mt-24">
      <SectionTitle>Parties</SectionTitle>
      <p className="text-zinc-500 text-sm mb-4">
        The participants involved in this protocol's transactions.
      </p>
      <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden">
        <div className="hidden sm:flex px-5 py-2.5 border-b border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          <span className="flex-1 basis-1/3">Name</span>
          <span className="flex-1 basis-2/3">Description</span>
        </div>
        {parties.map(party => (
          <div
            key={party.name}
            className="px-4 sm:px-5 py-3 border-b last:border-b-0 border-zinc-800/50 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-0"
          >
            <span className="sm:flex-1 sm:basis-1/3 text-zinc-50 font-medium text-sm break-words min-w-0">{party.name}</span>
            <span className="sm:flex-1 sm:basis-2/3 text-zinc-500 text-sm break-words min-w-0">
              {party.description || '\u2014'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnvironmentSection({ environment }: { environment: EnvironmentParam[]; }) {
  if (environment.length === 0) return null;

  return (
    <section id={SECTION_ENVIRONMENT} className="scroll-mt-24">
      <SectionTitle>Environment</SectionTitle>
      <p className="text-zinc-500 text-sm mb-4">
        Configuration values required to execute this protocol's transactions.
      </p>
      <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden">
        <div className="hidden sm:flex px-5 py-2.5 border-b border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          <span className="flex-1 basis-1/4">Name</span>
          <span className="flex-1 basis-2/4">Description</span>
          <span className="w-40 text-right">Type</span>
        </div>
        {environment.map(env => (
          <div
            key={env.name}
            className="px-4 sm:px-5 py-3 border-b last:border-b-0 border-zinc-800/50 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-0"
          >
            <span className="sm:flex-1 sm:basis-1/4 text-zinc-50 font-mono text-sm break-all min-w-0">{env.name}</span>
            <span className="sm:flex-1 sm:basis-2/4 text-zinc-500 text-sm break-words min-w-0">
              {env.description || '\u2014'}
            </span>
            <span className="sm:w-40 sm:text-right text-zinc-500 font-mono text-sm break-all">{env.type}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfilesSection({ profiles }: { profiles: Profile[]; }) {
  if (profiles.length === 0) return null;

  return (
    <section id={SECTION_PROFILES} className="scroll-mt-24">
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
                <div className="hidden sm:flex px-5 py-2.5 border-b border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  <span className="flex-1 basis-1/4">Key</span>
                  <span className="flex-1 basis-2/4">Value</span>
                  <span className="w-20 text-right">Type</span>
                </div>
                {rows.map(row => (
                  <div
                    key={row.key}
                    className="px-4 sm:px-5 py-3 border-b last:border-b-0 border-zinc-800/50 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-0"
                  >
                    <span className="sm:flex-1 sm:basis-1/4 text-zinc-400 font-mono text-sm break-all min-w-0">{row.key}</span>
                    <span className="sm:flex-1 sm:basis-2/4 text-zinc-50 font-mono text-sm break-all min-w-0">{row.value}</span>
                    <span className={`sm:w-20 sm:text-right text-xs font-medium ${row.kind === 'party' ? 'text-indigo-400' : 'text-emerald-400'}`}>
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

function TransactionDetail({ tx }: { tx: Tx; }) {
  const inputs = (tx as any).inputs as { name: string; party: string | null; hasRedeemer: boolean; }[] | undefined;
  const outputs = (tx as any).outputs as { party: string | null; hasDatum: boolean; optional: boolean; }[] | undefined;

  return (
    <div id={txAnchor(tx.name)} className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden scroll-mt-24">
      <div className="px-5 sm:px-8 py-5 border-b border-zinc-800">
        <p className="text-zinc-50 text-lg font-medium break-words">{tx.name}</p>
        {tx.description && (
          <p className="text-zinc-500 text-sm mt-1 break-words">{tx.description}</p>
        )}
      </div>

      <div className="px-5 sm:px-8 py-5 space-y-6">
        {tx.svg && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Diagram</p>
            <div className="overflow-x-auto custom-scrollbar [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: tx.svg }} />
          </div>
        )}

        {tx.parameters.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Parameters</p>
            <div className="border border-zinc-800 rounded-md overflow-hidden">
              <div className="hidden sm:flex px-4 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-600 uppercase tracking-wider">
                <span className="flex-1 basis-1/3">Name</span>
                <span className="flex-1 basis-1/3">Type</span>
                <span className="flex-1 basis-1/3">Description</span>
              </div>
              {tx.parameters.map(param => (
                <div key={param.name} className="px-4 py-2.5 border-b last:border-b-0 border-zinc-800/50 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-0">
                  <span className="sm:flex-1 sm:basis-1/3 text-zinc-50 font-mono text-sm break-all min-w-0">{param.name}</span>
                  <span className="sm:flex-1 sm:basis-1/3 text-zinc-500 font-mono text-sm break-all min-w-0">{param.type}</span>
                  <span className="sm:flex-1 sm:basis-1/3 text-zinc-500 text-sm break-words min-w-0">{param.description || '\u2014'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {inputs && inputs.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Inputs</p>
            <div className="border border-zinc-800 rounded-md overflow-hidden">
              <div className="hidden sm:flex px-4 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-600 uppercase tracking-wider">
                <span className="flex-1 basis-1/3">Name</span>
                <span className="flex-1 basis-1/3">Party</span>
                <span className="w-28 text-right">Redeemer</span>
              </div>
              {inputs.map(input => (
                <div key={input.name} className="px-4 py-2.5 border-b last:border-b-0 border-zinc-800/50 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-0">
                  <span className="sm:flex-1 sm:basis-1/3 text-zinc-50 font-mono text-sm break-all min-w-0">{input.name}</span>
                  <span className="sm:flex-1 sm:basis-1/3 text-indigo-400 text-sm break-all min-w-0">{input.party || '\u2014'}</span>
                  <span className="sm:w-28 sm:text-right">
                    {input.hasRedeemer
                      ? <span className="text-amber-400 text-xs font-medium">script</span>
                      : <span className="text-zinc-600 text-xs">wallet</span>}
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
              <div className="hidden sm:flex px-4 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-600 uppercase tracking-wider">
                <span className="flex-1 basis-1/3">Party</span>
                <span className="flex-1 basis-1/3">Datum</span>
                <span className="w-28 text-right">Optional</span>
              </div>
              {outputs.map((output, i) => (
                <div key={i} className="px-4 py-2.5 border-b last:border-b-0 border-zinc-800/50 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-0">
                  <span className="sm:flex-1 sm:basis-1/3 text-indigo-400 text-sm break-all min-w-0">{output.party || '\u2014'}</span>
                  <span className="sm:flex-1 sm:basis-1/3">
                    {output.hasDatum
                      ? <span className="text-emerald-400 text-xs font-medium">yes</span>
                      : <span className="text-zinc-600 text-xs">no</span>}
                  </span>
                  <span className="sm:w-28 sm:text-right">
                    {output.optional
                      ? <span className="text-amber-400 text-xs font-medium">yes</span>
                      : <span className="text-zinc-600 text-xs">no</span>}
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

function TransactionsSection({ transactions }: { transactions: Tx[]; }) {
  if (transactions.length === 0) return null;

  return (
    <section id={SECTION_TRANSACTIONS} className="scroll-mt-24">
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

function TxTocButton({ name, active, onClick }: { name: string; active: boolean; onClick: () => void; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={clsx(
        'text-left text-xs font-mono px-3 py-1.5 rounded transition-colors cursor-pointer truncate',
        active
          ? 'text-blue-400 bg-zinc-900'
          : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/40',
      )}
    >
      {name}
    </button>
  );
}

function SectionTocButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={clsx(
        'text-left text-sm px-3 py-2 rounded transition-colors cursor-pointer truncate',
        active
          ? 'bg-zinc-900 text-zinc-50 border-l-2 border-l-blue-400 rounded-l-none'
          : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200',
      )}
    >
      {label}
    </button>
  );
}

function SidebarLabel({ children, className }: { children: React.ReactNode; className?: string; }) {
  return (
    <p className={clsx('text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 mb-2', className)}>
      {children}
    </p>
  );
}

export function TabProtocol({ protocol }: Props) {
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const transactions = protocol.transactions ?? [];

  // React Router doesn't scroll to hash fragments by default; do it manually
  // when this tab mounts or the hash changes (e.g. arriving from a card link).
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  const parties = protocol.parties ?? [];
  const environment = protocol.environment ?? [];
  const profiles = protocol.profiles ?? [];

  const focusAnchor = (anchor: string) => {
    if (hash === `#${anchor}`) {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate(`${pathname}${search}#${anchor}`);
    }
  };

  const sections: { id: string; label: string; visible: boolean }[] = [
    { id: SECTION_PARTIES, label: 'Parties', visible: parties.length > 0 },
    { id: SECTION_ENVIRONMENT, label: 'Environment', visible: environment.length > 0 },
    { id: SECTION_TRANSACTIONS, label: 'Transactions', visible: transactions.length > 0 },
    { id: SECTION_PROFILES, label: 'Profiles', visible: profiles.length > 0 },
  ].filter(s => s.visible);

  const hasSidebar = sections.length > 0;

  return (
    <div className="container flex-1 flex py-8 items-start">
      {hasSidebar && (
        <aside className="hidden lg:block w-56 shrink-0 sticky top-6 self-start max-h-[calc(100vh-3rem)] pr-10 overflow-y-auto custom-scrollbar">
          <SidebarLabel>Sections</SidebarLabel>
          <div className="flex flex-col gap-1">
            {sections.map(s => (
              <div key={s.id}>
                <SectionTocButton
                  label={s.label}
                  active={hash === `#${s.id}`}
                  onClick={() => focusAnchor(s.id)}
                />
                {s.id === SECTION_TRANSACTIONS && transactions.length > 0 && (
                  <div className="mt-1 ml-3 pl-3 border-l border-zinc-800 flex flex-col gap-0.5">
                    {transactions.map(tx => (
                      <TxTocButton
                        key={tx.name}
                        name={tx.name}
                        active={hash === `#${txAnchor(tx.name)}`}
                        onClick={() => focusAnchor(txAnchor(tx.name))}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}

      <div className={clsx(
        'flex-1 min-w-0 space-y-10',
        hasSidebar && 'lg:pl-10 lg:border-l lg:border-zinc-800',
      )}
      >
        {protocol.description && (
          <section>
            <SectionTitle>About this Protocol</SectionTitle>
            <p className="text-zinc-300 leading-relaxed">{protocol.description}</p>
          </section>
        )}

        <PartiesSection parties={parties} />
        <EnvironmentSection environment={environment} />
        <TransactionsSection transactions={transactions} />
        <ProfilesSection profiles={profiles} />
      </div>
    </div>
  );
}
