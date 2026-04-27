import { useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

// Components
import { CodeBlock } from '~/components/ui/CodeBlock';
import { Dropdown } from '~/components/ui/Dropdown';
import { ChevronRightIcon } from '~/components/icons/chevron-right';

// Config
import { getTrpForProfile, TRP_ENDPOINTS } from '~/trp-config';

// Internal
import { generateQuickStart, pickDefaultProfile, type QuickStartSnippet } from './sdks/quick-start';

type TrpKind = 'local' | 'demeter';

const trpOptions: { label: string; value: TrpKind; }[] = [
  { label: 'Local', value: 'local' },
  { label: 'Demeter', value: 'demeter' },
];

function pickDefaultTrpKind(profileName: string | null): TrpKind {
  return profileName === 'local' ? 'local' : 'demeter';
}

type SDKKey = 'typescript' | 'rust' | 'go' | 'python';

interface SDKDef {
  key: SDKKey;
  name: string;
  title: string;
  icon: React.ReactNode;
  installCommand: string;
}

const sdks: SDKDef[] = [
  {
    key: 'typescript',
    name: 'TypeScript',
    title: 'TypeScript SDK',
    icon: <img src="/images/sdks/typescript.png" className="w-8 h-8" />,
    installCommand: 'npm install tx3-sdk',
  },
  {
    key: 'rust',
    name: 'Rust',
    title: 'Rust SDK',
    icon: <img src="/images/sdks/rust.png" className="w-8 h-8" />,
    installCommand: 'cargo add tx3-sdk serde_json',
  },
  {
    key: 'go',
    name: 'Go',
    title: 'Go SDK',
    icon: <img src="/images/sdks/go.png" className="w-8 h-8" />,
    installCommand: 'go get github.com/tx3-lang/go-sdk/sdk',
  },
  {
    key: 'python',
    name: 'Python',
    title: 'Python SDK',
    icon: <img src="/images/sdks/python.png" className="w-8 h-8" />,
    installCommand: 'pip install tx3-sdk',
  },
];

const codeBlockClasses = 'bg-zinc-950 border border-zinc-800 rounded-md px-5 py-3 text-sm overflow-x-auto';

function SidebarLabel({ children, className }: { children: React.ReactNode; className?: string; }) {
  return (
    <p className={clsx('text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 mb-2', className)}>
      {children}
    </p>
  );
}

interface SdkButtonProps {
  sdk: SDKDef;
  active: boolean;
  onClick: () => void;
}

function SdkButton({ sdk, active, onClick }: SdkButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={clsx(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-left transition-colors cursor-pointer',
        'border border-transparent',
        active
          ? 'bg-zinc-900 text-zinc-50 border-l-2 border-l-blue-400 rounded-l-none'
          : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200',
      )}
    >
      <span className={clsx('shrink-0', !active && 'opacity-75 grayscale')}>
        {sdk.icon}
      </span>
      <span>{sdk.name}</span>
    </button>
  );
}

interface TxTocButtonProps {
  name: string;
  active: boolean;
  onClick: () => void;
}

function TxTocButton({ name, active, onClick }: TxTocButtonProps) {
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

function SectionHeading({ children }: { children: React.ReactNode; }) {
  return (
    <h3 className="text-lg font-semibold text-zinc-50 mb-4 pb-2 border-b border-zinc-800">
      {children}
    </h3>
  );
}

function InlineCode({ children }: { children: React.ReactNode; }) {
  return (
    <code className="text-zinc-200 bg-zinc-900 px-1.5 py-0.5 rounded text-[0.9em]">
      {children}
    </code>
  );
}

interface InstallSectionProps {
  sdk: SDKDef;
  protocol: Protocol;
}

function InstallSection({ sdk, protocol }: InstallSectionProps) {
  const trixCmd = `trix add ${protocol.scope}/${protocol.name}@${protocol.version}`;
  const tiiPath = `./.tx3/tii/${protocol.scope}/${protocol.name}.tii`;
  return (
    <section>
      <SectionHeading>Install</SectionHeading>

      <p className="text-zinc-400 text-sm mb-3">Install the SDK:</p>
      <CodeBlock lang="bash" code={sdk.installCommand} className={codeBlockClasses} />

      <p className="text-zinc-400 text-sm mt-6 mb-3">
        Then download this protocol's compiled <InlineCode>.tii</InlineCode> file with{' '}
        <InlineCode>trix</InlineCode>. It fetches the artifact into{' '}
        <InlineCode>{tiiPath}</InlineCode> so your code can load it via{' '}
        <InlineCode>Protocol.fromFile</InlineCode>.
      </p>
      <CodeBlock lang="bash" code={trixCmd} className={codeBlockClasses} />
    </section>
  );
}

interface QuickStartSectionProps {
  snippet: QuickStartSnippet;
  profiles: Profile[];
  selectedProfileName: string;
  onSelectProfile: (name: string) => void;
  selectedTrpKind: TrpKind;
  onSelectTrpKind: (kind: TrpKind) => void;
  trpLocked: boolean;
  openTxs: Set<string>;
  onToggleTx: (name: string, open: boolean) => void;
  registerTxRef: (name: string, el: HTMLDetailsElement | null) => void;
}

function QuickStartSection({
  snippet,
  profiles,
  selectedProfileName,
  onSelectProfile,
  selectedTrpKind,
  onSelectTrpKind,
  trpLocked,
  openTxs,
  onToggleTx,
  registerTxRef,
}: QuickStartSectionProps) {
  const profileOptions = profiles.map(p => ({ label: p.name, value: p.name }));

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-4 pb-2 border-b border-zinc-800">
        <h3 className="text-lg font-semibold text-zinc-50">Quick start</h3>
        <div className="flex items-center gap-2">
          {profileOptions.length > 0 && (
            <Dropdown
              label="Profile"
              showValue
              modal={false}
              value={selectedProfileName}
              options={profileOptions}
              onOptionSelected={onSelectProfile}
            />
          )}
          <Dropdown
            label="TRP"
            showValue
            modal={false}
            disabled={trpLocked}
            value={selectedTrpKind}
            options={trpOptions}
            onOptionSelected={value => onSelectTrpKind(value as TrpKind)}
          />
        </div>
      </div>
      <CodeBlock code={snippet.setup} lang={snippet.lang} className={codeBlockClasses} />

      {snippet.transactions.length > 0 && (
        <>
          <h4 className="text-sm font-semibold text-zinc-200 mt-6 mb-3">
            Transactions
          </h4>
          <div className="flex flex-col gap-2">
            {snippet.transactions.map(tx => (
              <details
                key={tx.name}
                ref={el => registerTxRef(tx.name, el)}
                open={openTxs.has(tx.name)}
                onToggle={e => onToggleTx(tx.name, (e.target as HTMLDetailsElement).open)}
                className="group border border-zinc-800 rounded-md bg-zinc-950 overflow-hidden scroll-mt-6"
              >
                <summary className="cursor-pointer px-4 py-3 text-sm flex items-center gap-3 list-none [&::-webkit-details-marker]:hidden hover:bg-zinc-900/40 transition-colors">
                  <ChevronRightIcon
                    width="14"
                    height="14"
                    className="text-zinc-500 shrink-0 transition-transform group-open:rotate-90"
                  />
                  <code className="text-blue-400 font-mono">{tx.name}</code>
                  {tx.description && (
                    <span className="text-zinc-500 text-xs truncate">— {tx.description}</span>
                  )}
                </summary>
                <div className="border-t border-zinc-800">
                  <CodeBlock
                    code={tx.code}
                    lang={snippet.lang}
                    className="bg-zinc-950 px-5 py-3 text-sm overflow-x-auto"
                  />
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

interface Props {
  protocol: Protocol;
}

export function TabSDKs({ protocol }: Props) {
  const profiles = protocol.profiles ?? [];

  const defaultProfile = useMemo(() => pickDefaultProfile(profiles), [profiles]);

  const [selectedKey, setSelectedKey] = useState<SDKKey>('typescript');
  const [selectedProfileName, setSelectedProfileName] = useState<string>(defaultProfile?.name ?? '');
  const [trpKindPref, setTrpKindPref] = useState<TrpKind>(() => pickDefaultTrpKind(defaultProfile?.name ?? null));
  const [openTxs, setOpenTxs] = useState<Set<string>>(new Set());
  const txRefs = useRef<Map<string, HTMLDetailsElement>>(new Map());

  const selected = sdks.find(s => s.key === selectedKey)!;
  const selectedProfile = profiles.find(p => p.name === selectedProfileName) ?? null;
  const trpLocked = selectedProfileName === 'local';
  const selectedTrpKind: TrpKind = trpLocked ? 'local' : trpKindPref;
  const selectedTrp = selectedTrpKind === 'local' ? TRP_ENDPOINTS.local : getTrpForProfile(selectedProfileName);

  const snippet = useMemo(
    () => generateQuickStart(selected.key, protocol, { profile: selectedProfile, trp: selectedTrp }),
    [selected.key, protocol, selectedProfile, selectedTrp],
  );

  const registerTxRef = useCallback((name: string, el: HTMLDetailsElement | null) => {
    if (el) txRefs.current.set(name, el);
    else txRefs.current.delete(name);
  }, []);

  const handleToggleTx = useCallback((name: string, open: boolean) => {
    setOpenTxs(prev => {
      if (prev.has(name) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(name);
      else next.delete(name);
      return next;
    });
  }, []);

  const focusTx = useCallback((name: string) => {
    setOpenTxs(prev => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    const el = txRefs.current.get(name);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="container flex-1 flex py-8 items-start">
      <aside className="w-56 shrink-0 sticky top-6 self-start max-h-[calc(100vh-3rem)] pr-10 overflow-y-auto custom-scrollbar">
        <SidebarLabel>SDKs</SidebarLabel>
        <div className="flex flex-col gap-1">
          {sdks.map(sdk => (
            <SdkButton
              key={sdk.key}
              sdk={sdk}
              active={sdk.key === selectedKey}
              onClick={() => setSelectedKey(sdk.key)}
            />
          ))}
        </div>

        {snippet.transactions.length > 0 && (
          <>
            <SidebarLabel className="mt-6">Transactions</SidebarLabel>
            <div className="flex flex-col gap-0.5">
              {snippet.transactions.map(tx => (
                <TxTocButton
                  key={tx.name}
                  name={tx.name}
                  active={openTxs.has(tx.name)}
                  onClick={() => focusTx(tx.name)}
                />
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="flex-1 min-w-0 flex flex-col gap-10 pl-10 border-l border-zinc-800">
        <h2 className="text-2xl font-semibold text-zinc-50">{selected.title}</h2>
        <InstallSection sdk={selected} protocol={protocol} />
        <QuickStartSection
          snippet={snippet}
          profiles={profiles}
          selectedProfileName={selectedProfileName}
          onSelectProfile={setSelectedProfileName}
          selectedTrpKind={selectedTrpKind}
          onSelectTrpKind={setTrpKindPref}
          trpLocked={trpLocked}
          openTxs={openTxs}
          onToggleTx={handleToggleTx}
          registerTxRef={registerTxRef}
        />
      </section>
    </div>
  );
}
