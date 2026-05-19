import clsx from 'clsx';

function TabBar({ tabs, active }: { tabs: string[]; active: string; }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-woodsmoke-800/80 bg-woodsmoke-950/80">
      {tabs.map(t => (
        <span
          key={t}
          className={clsx(
            'text-[11px] px-2.5 py-1 rounded-md',
            t === active ? 'bg-woodsmoke-800 text-zinc-100' : 'text-zinc-500',
          )}
        >
          {t}
        </span>
      ))}
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
  tabs: string[];
  active: string;
  badge?: { label: string; tone: 'emerald'; };
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col bg-woodsmoke-950/60 border border-woodsmoke-800/80 rounded-2xl overflow-hidden">
      <div className="relative">
        <TabBar tabs={tabs} active={active} />
        {badge && (
          <span className="absolute right-3 top-1.5 text-[10px] font-semibold tracking-[1.2px] uppercase text-emerald-300 bg-emerald-300/10 border border-emerald-300/20 rounded-full px-2 py-0.5">
            ● {badge.label}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-[160px] p-4 font-mono text-[11.5px] leading-5 text-zinc-300">
        {children}
      </div>
      <div className="px-5 py-4 border-t border-woodsmoke-800/80">
        <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
        <p className="mt-1 text-xs text-zinc-400 leading-5">{description}</p>
      </div>
    </article>
  );
}

export function SneakPeek() {
  return (
    <section className="container">
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

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <PreviewCard
          tabs={['Activity', 'Web API', 'SDKs']}
          active="SDKs"
          title="Production SDKs."
          description="TypeScript · Rust · Go · Python — all typed, all ready."
        >
          <div className="space-y-1">
            <div><span className="text-zinc-600">TypeScript</span> <span className="text-zinc-700">Rust</span> <span className="text-zinc-700">Go</span> <span className="text-zinc-700">Python</span></div>
            <div className="pt-2"><span className="text-primary-400">import</span> {'{ '}<span className="text-blue-300">swap</span>{' }'} <span className="text-primary-400">from</span> <span className="text-emerald-300">{`"@tx3/indigo"`}</span>;</div>
            <div className="pt-1"><span className="text-primary-400">const</span> <span className="text-blue-300">tx</span> = <span className="text-primary-400">await</span> <span className="text-amber-300">swap</span>({'{'}</div>
            <div>{'  '}<span className="text-zinc-200">quantity</span>: <span className="text-rose-400">1_000</span>,</div>
            <div>{'  '}<span className="text-zinc-200">price</span>:{'    '}<span className="text-amber-300">ada</span>(<span className="text-rose-400">420</span>),</div>
            <div>{'});'}</div>
          </div>
        </PreviewCard>

        <PreviewCard
          tabs={['Try out', 'Activity', 'Web API', 'SDKs']}
          active="Web API"
          title="Web API endpoints."
          description="Build & resolve transactions from any HTTP client."
        >
          <div className="space-y-1">
            <div>
              <span className="text-emerald-300 font-semibold">POST</span>{' '}
              <span className="text-zinc-200">/api/indigo/swap</span>
            </div>
            <div className="pt-2">{'{'}</div>
            <div>{'  '}<span className="text-zinc-200">"args"</span>: {'{'}</div>
            <div>{'    '}<span className="text-zinc-200">"quantity"</span>: <span className="text-rose-400">1000</span>,</div>
            <div>{'    '}<span className="text-zinc-200">"price"</span>: <span className="text-rose-400">420</span></div>
            <div>{'  '}{'}'}</div>
            <div>{'}'}</div>
          </div>
        </PreviewCard>

        <PreviewCard
          tabs={['Tx3 File', 'Try out', 'Activity']}
          active="Activity"
          badge={{ label: 'Coming soon', tone: 'emerald' }}
          title="Live on-chain activity."
          description="Every protocol transaction streamed in real time."
        >
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-[10px] uppercase tracking-[1.2px] text-zinc-600 pb-1 border-b border-woodsmoke-800/80">
              <span>Hash</span><span>Slot</span><span>When</span>
            </div>
            <Row hash="60d263…8a0c2a" slot="187,287,264" when="2026-05-11" tone="emerald" />
            <Row hash="66a7be…4a01ca" slot="187,287,260" when="2026-05-15" tone="primary" />
            <Row hash="95ffba…2a063a" slot="186,750,253" when="2026-05-10" tone="rose" />
          </div>
        </PreviewCard>
      </div>
    </section>
  );
}

function Row({ hash, slot, when, tone }: { hash: string; slot: string; when: string; tone: 'emerald' | 'primary' | 'rose'; }) {
  const dot = tone === 'emerald' ? 'bg-emerald-300' : tone === 'primary' ? 'bg-primary-400' : 'bg-rose-400';
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 items-center text-zinc-300">
      <span className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${dot}`} />
        {hash}
      </span>
      <span className="text-zinc-400">{slot}</span>
      <span className="text-zinc-400">{when}</span>
    </div>
  );
}
