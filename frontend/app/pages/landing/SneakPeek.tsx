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
  TypeScript: `import { swap } from "@tx3/indigo";

const tx = await swap({
  quantity: 1_000,
  price:    ada(420),
});

await wallet.sign(tx);`,
  Rust: `use tx3_indigo::swap;

let tx = swap(SwapArgs {
  quantity: 1_000,
  price:    ada(420),
}).await?;

wallet.sign(&tx).await?;`,
  Go: `import "github.com/tx3/indigo"

tx, err := indigo.Swap(indigo.SwapArgs{
  Quantity: 1_000,
  Price:    indigo.Ada(420),
})

wallet.Sign(tx)`,
  Python: `from tx3_indigo import swap

tx = await swap(
  quantity=1_000,
  price=   ada(420),
)

await wallet.sign(tx)`,
};

const API_SNIPPET = `{
  "args": {
    "quantity": 1000,
    "price":    420
  }
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
      <div className="bg-woodsmoke-950 h-[210px] px-5 py-[18px] font-mono text-[11.5px] leading-[18px] text-zinc-100 overflow-hidden">
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
      <div className="text-center">
        <div className="inline-flex items-center justify-center text-[11px] font-semibold tracking-[1.4px] uppercase text-zinc-500">
          Inside every protocol
        </div>
        <h2 className="mt-3 text-3xl xl:text-4xl font-semibold tracking-[-0.02em]">
          Everything you need, one tab away.
        </h2>
        <p className="mt-3 text-sm text-zinc-400 max-w-[560px] mx-auto leading-6">
          Each protocol page on tx3.land ships with ready-to-use SDKs, a public web API and live transaction activity.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
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
              <span className="text-zinc-50 text-[12px] font-semibold leading-4">/api/indigo/swap</span>
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
                200 OK · cbor: 84a4008182…
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
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[80px_90px_70px_1fr] gap-3.5 pb-1.5 border-b border-[#232326] text-[9px] font-semibold uppercase tracking-[0.8px] text-zinc-700 leading-3">
              <span>TX</span><span>Hash</span><span>Slot</span><span>When</span>
            </div>
            <ActivityRow tx="unstake" hash="95ffba…2a063a" slot="186,750,253" when="2026-05-11" />
            <ActivityRow tx="place_buy" hash="60d263…8a0c2a" slot="187,287,264" when="2026-05-15" />
            <ActivityRow tx="cancel_order" hash="66a7be…4a01ca" slot="187,287,264" when="2026-05-15" />
          </div>
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

function ActivityRow({ tx, hash, slot, when }: { tx: string; hash: string; slot: string; when: string; }) {
  return (
    <div className="grid grid-cols-[80px_90px_70px_1fr] gap-3.5 items-center py-[5px]">
      <span>
        <span className="inline-block text-[9px] font-semibold text-[#ff637e] bg-[#4d0218] rounded-full px-2 py-0.5 leading-3">{tx}</span>
      </span>
      <span className="text-[10px] font-medium text-[#ff637e] leading-[14px]">{hash}</span>
      <span className="text-[10px] font-medium text-zinc-500 leading-[14px]">{slot}</span>
      <span className="text-[10px] font-medium text-zinc-500 leading-[14px]">{when}</span>
    </div>
  );
}
