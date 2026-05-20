import clsx from 'clsx';
import { useState } from 'react';
import { CodeIcon } from '~/components/icons/code';
import { FileCode } from '~/components/icons/file-code';
import { FileDescriptionIcon } from '~/components/icons/file-description';
import { GraphIcon } from '~/components/icons/graph';
import { Stack2Icon } from '~/components/icons/stack-2';
import { CodeBlock } from '~/components/ui/CodeBlock';
import type { SupportedLanguages } from '~/utils/shiki';

type TabName = 'Activity' | 'Web API' | 'SDKs' | 'Try out' | 'Tx3 File';

const SDK_LANGUAGES = ['TypeScript', 'Rust', 'Go', 'Python'] as const;
type SdkLanguage = typeof SDK_LANGUAGES[number];

const SDK_SHIKI: Record<SdkLanguage, SupportedLanguages> = {
  TypeScript: 'typescript',
  Rust: 'rust',
  Go: 'go',
  Python: 'python',
};

const SDK_SNIPPETS: Record<SdkLanguage, string> = {
  TypeScript: `import { Tx3Client, Protocol, TrpClient } from "tx3-sdk";
const protocol = await Protocol.fromFile("indigo.tii");
const trp = new TrpClient({ endpoint, headers });
const tx3 = new Tx3Client(protocol, trp);

const unstake = await tx3.tx("unstake")
  .arg("owner_pkh", "0011…")
  .arg("position_utxo", "tx_hash#0")
  .resolve();
const submitted = await (await unstake.sign()).submit();`,
  Rust: `use tx3_sdk::{tii::Protocol, Tx3Client};
use tx3_sdk::trp::{Client, ClientOptions};
let protocol = Protocol::from_file("indigo.tii")?;
let trp = Client::new(ClientOptions { endpoint, headers });
let tx3 = Tx3Client::new(protocol, trp);

let unstake = tx3.tx("unstake")
  .arg("owner_pkh", json!("0011…"))
  .arg("position_utxo", json!("tx_hash#0"))
  .resolve().await?;
let submitted = unstake.sign()?.submit().await?;`,
  Go: `import tx3 "github.com/tx3-lang/go-sdk/sdk"
import "github.com/tx3-lang/go-sdk/sdk/trp"
protocol, _ := tx3.ProtocolFromFile("indigo.tii")
opts := trp.ClientOptions{Endpoint: endpoint, Headers: headers}
client := tx3.NewClient(protocol, tx3.NewTRPClient(opts))

unstake, _ := client.Tx("unstake").
  Arg("owner_pkh", "0011…").
  Arg("position_utxo", "tx_hash#0").
  Resolve(ctx)
submitted, _ := unstake.Sign().Submit(ctx)`,
  Python: `from tx3_sdk import Protocol, TrpClient, Tx3Client
protocol = Protocol.from_file("indigo.tii")
trp = TrpClient(endpoint=endpoint, headers=headers)
tx3 = Tx3Client(protocol, trp)

unstake = await (tx3.tx("unstake")
  .arg("owner_pkh", "0011…")
  .arg("position_utxo", "tx_hash#0")
  .resolve())
submitted = await (await unstake.sign()).submit()`,
};

const API_SNIPPET = `{
  "jsonrpc": "2.0",
  "method": "unstake",
  "params": {
    "owner_pkh": "0011…",
    "position_utxo": "tx_hash#0"
  },
  "id": 0
}`;

const TAB_ICONS: Record<TabName, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  Activity: GraphIcon,
  'Web API': FileDescriptionIcon,
  SDKs: FileCode,
  'Try out': Stack2Icon,
  'Tx3 File': CodeIcon,
};

function TabBar({ tabs, active }: { tabs: TabName[]; active: TabName; }) {
  return (
    <div className="relative h-10 bg-[#151519] border-b border-[#232326]">
      <div className="flex items-center gap-3.5 h-full px-4">
        {tabs.map(name => {
          const Icon = TAB_ICONS[name];
          const isActive = name === active;
          return (
            <div
              key={name}
              className={clsx(
                'flex items-center gap-1.5 px-2 py-1 rounded-sm',
                isActive ? 'text-zinc-50' : 'text-zinc-500',
              )}
            >
              <Icon width={14} height={14} strokeWidth={1.75} />
              <span className="text-[11px] leading-4">{name}</span>
            </div>
          );
        })}
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[32%] bg-gradient-to-r from-woodsmoke-950 via-woodsmoke-950/70 to-transparent"
        aria-hidden
      />
    </div>
  );
}

function PreviewCard({
  tabs,
  active,
  badge,
  title,
  description,
  children,
}: {
  tabs: TabName[];
  active: TabName;
  badge?: { label: string; tone: 'emerald'; };
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col bg-woodsmoke-950 border border-[#232326] rounded-2xl overflow-hidden">
      <div className="relative">
        <TabBar tabs={tabs} active={active} />
        {badge && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.6px] uppercase text-emerald-300 bg-emerald-300/15 rounded-full px-2 py-0.5">
            <span className="size-1 rounded-full bg-emerald-300" />
            {badge.label}
          </span>
        )}
      </div>
      <div className="bg-woodsmoke-950 h-[260px] px-5 py-[18px] font-mono text-[11.5px] leading-[18px] text-zinc-100 overflow-hidden">
        {children}
      </div>
      <div className="flex flex-col gap-1 bg-[#151519] border-t border-[#232326] px-6 py-4">
        <h3 className="text-[13px] font-semibold leading-[18px] text-zinc-50">{title}</h3>
        <p className="text-[11px] leading-4 text-zinc-400">{description}</p>
      </div>
    </article>
  );
}

export function SneakPeek() {
  return (
    <section className="container py-14">
      <div className="flex flex-col items-center gap-4 max-w-[760px] mx-auto py-2">
        <div className="inline-flex items-center gap-2 text-[12px] font-medium tracking-[1.5px] uppercase text-zinc-400">
          <span className="size-1.5 rounded-full bg-[#ff007f]" />
          Inside every published spec
        </div>
        <h2 className="text-center text-[32px] xl:text-[40px] font-semibold leading-[1.2] tracking-[-0.025em] text-zinc-50">
          Generated from one .tx3 spec.
        </h2>
        <p className="text-center text-base leading-6 text-zinc-400">
          Each protocol page on tx3.land exposes typed SDKs (TS · Rust · Go · Python),
          <br className="hidden sm:inline" /> a TRP-backed HTTP endpoint and a live transaction stream — all derived from the same TII.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SdkPreviewCard />

        <PreviewCard
          tabs={['Try out', 'Activity', 'Web API', 'SDKs']}
          active="Web API"
          title="Web API endpoints."
          description="Build & resolve transactions from any HTTP client."
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#ff637e] bg-[#4d0218] rounded-md px-2 py-0.5 leading-[14px]">POST</span>
              <span className="text-zinc-50 text-[12px] font-semibold leading-4">/indigo</span>
            </div>
            <CodeBlock
              code={API_SNIPPET}
              lang="json"
              copyable={false}
              className="!bg-transparent !p-0 !m-0 text-[11.5px] leading-[18px]"
            />
            <div className="mt-auto">
              <span className="inline-flex items-center gap-2 bg-[#151519] border border-[#232326] rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-zinc-500 leading-[14px]">
                <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_rgba(94,233,181,0.6)]" />
                200 OK
              </span>
            </div>
          </div>
        </PreviewCard>

        <PreviewCard
          tabs={['Tx3 File', 'Try out', 'Activity']}
          active="Activity"
          badge={{ label: 'Coming soon', tone: 'emerald' }}
          title="Live on-chain activity."
          description="Every protocol transaction streamed in real time."
        >
          <ActivityChart />
        </PreviewCard>
      </div>
    </section>
  );
}

function SdkPreviewCard() {
  const [active, setActive] = useState<SdkLanguage>('TypeScript');
  return (
    <PreviewCard
      tabs={['Activity', 'Web API', 'SDKs']}
      active="SDKs"
      title="Production SDKs."
      description="TypeScript · Rust · Go · Python — all typed, all ready."
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 mb-2 -mt-1">
          {SDK_LANGUAGES.map(lang => (
            <button
              key={lang}
              type="button"
              onClick={() => setActive(lang)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-[11px] leading-4 transition-colors cursor-pointer',
                active === lang
                  ? 'bg-woodsmoke-950 border border-[#232326] text-zinc-50 font-semibold'
                  : 'text-zinc-500 font-medium hover:text-zinc-300 border border-transparent',
              )}
            >
              {lang}
            </button>
          ))}
        </div>
        <CodeBlock
          code={SDK_SNIPPETS[active]}
          lang={SDK_SHIKI[active]}
          copyable={false}
          className="!bg-transparent !p-0 !m-0 text-[11.5px] leading-[18px]"
        />
      </div>
    </PreviewCard>
  );
}

const TXS_PATH = '0,82 26,78 52,70 78,75 104,60 130,55 156,50 182,42 208,46 234,32 260,36 286,22 312,28 338,18';
const CALLERS_PATH = '0,90 26,88 52,85 78,82 104,84 130,78 156,77 182,72 208,75 234,66 260,70 286,60 312,64 338,58';
const MARKER_X_PCT = (338 / 365) * 100;

function ActivityChart() {
  return (
    <div className="relative h-full font-sans">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="block w-2.5 h-0.5 bg-[#51a2ff]" />
          <span className="text-[11px] leading-[14px] text-zinc-400">txs / day</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="block w-2.5 h-0.5 bg-[#ff637e]" />
          <span className="text-[11px] leading-[14px] text-zinc-400">unique callers</span>
        </div>
      </div>

      <div className="absolute inset-x-0 top-[56px] h-[120px]">
        <div className="relative h-[100px] w-full">
          <svg
            viewBox="0 0 365 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            <path d="M0 0H365" stroke="#27272A" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d="M0 33H365" stroke="#27272A" strokeWidth="0.5" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
            <path d="M0 66H365" stroke="#27272A" strokeWidth="0.5" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
            <path d="M0 99H365" stroke="#27272A" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <polyline
              points={TXS_PATH}
              fill="none"
              stroke="#51A2FF"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={CALLERS_PATH}
              fill="none"
              stroke="#FF637E"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <span
            className="absolute block size-[7px] -ml-[3.5px] -mt-[3.5px] rounded-full bg-woodsmoke-950 border-[1.5px] border-[#51A2FF]"
            style={{ left: `${MARKER_X_PCT}%`, top: '18%' }}
          />
          <span
            className="absolute block size-[7px] -ml-[3.5px] -mt-[3.5px] rounded-full bg-woodsmoke-950 border-[1.5px] border-[#FF637E]"
            style={{ left: `${MARKER_X_PCT}%`, top: '58%' }}
          />
        </div>

        <div className="absolute inset-x-0 top-[108px] flex justify-between text-[10px] leading-3 text-zinc-500">
          <span>May 5</span>
          <span>May 9</span>
          <span>May 13</span>
          <span>May 17</span>
          <span>May 19</span>
        </div>
      </div>

      <div className="absolute right-2 top-[22px] bg-zinc-800 border border-[#3f3f46] rounded-md px-2.5 py-2 flex flex-col gap-1.5">
        <p className="text-[10px] leading-3 text-zinc-500 tracking-[0.5px]">May 19, 2026</p>
        <div className="flex items-center gap-2">
          <span className="block size-1.5 rounded-full bg-[#51A2FF]" />
          <span className="text-[11px] leading-[14px] text-zinc-400 w-[34px]">txs</span>
          <span className="text-[11px] leading-[14px] text-zinc-50 font-semibold">1,284</span>
          <span className="inline-flex items-center bg-[#2b7fff] rounded-full px-1.5 py-px text-[10px] leading-3 text-blue-50">+47%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="block size-1.5 rounded-full bg-[#FF637E]" />
          <span className="text-[11px] leading-[14px] text-zinc-400">callers</span>
          <span className="text-[11px] leading-[14px] text-zinc-50 font-semibold w-[30px]">312</span>
          <span className="inline-flex items-center bg-[#ff007f] rounded-full px-1.5 py-px text-[10px] leading-3 text-rose-50">+12%</span>
        </div>
      </div>
    </div>
  );
}
