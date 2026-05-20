import { SettingsIcon } from '~/components/icons/settings';
import { CommandIcon } from '~/components/icons/command';
import { ArrowLeftRightIcon } from '~/components/icons/arrow-left-right';

const FEATURES = [
  {
    number: '01',
    eyebrow: 'DSL & Tooling',
    title: 'One DSL. The full toolchain.',
    body: 'Describe inputs, outputs and datums once in `.tx3`. Lint in VS Code, run a local devnet and ship with Trix — batteries included.',
    icon: <SettingsIcon width={24} height={24} />,
  },
  {
    number: '02',
    eyebrow: 'For developers',
    title: 'Ready-to-use protocol SDKs.',
    body: 'Production endpoints backed by a managed provider. Drop the typed SDK in TypeScript, Rust, Go or Python and call your dApp like any other API.',
    icon: <CommandIcon width={24} height={24} />,
  },
  {
    number: '03',
    eyebrow: 'MCP Server',
    title: 'Built for AI agents.',
    body: 'Every protocol ships with machine-readable specs, READMEs and an MCP server. Your agents call dApps the same way developers do.',
    icon: <ArrowLeftRightIcon width={24} height={24} />,
    badge: 'Coming soon',
  },
];

export function Features() {
  return (
    <section className="container relative py-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FEATURES.map(f => (
          <article
            key={f.number}
            className="relative flex flex-col gap-3.5 bg-woodsmoke-950 border border-woodsmoke-800 rounded-2xl px-7 py-6 hover:border-woodsmoke-700 transition-colors"
          >
            {f.badge && (
              <span className="absolute right-5 top-[21px] flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.6px] uppercase text-emerald-300 bg-emerald-300/15 rounded-full px-2 py-0.5">
                <span className="size-[5px] rounded-full bg-emerald-300" />
                {f.badge}
              </span>
            )}

            <div className="flex items-center gap-3 text-[11px] font-semibold tracking-[1.6px] uppercase">
              <span className="flex items-center gap-2 text-blue-400">
                <span className="block h-[1.5px] w-[14px] bg-blue-400" />
                <span>{f.number}</span>
              </span>
              <span className="text-zinc-500">{f.eyebrow}</span>
            </div>

            <div className="inline-flex items-center justify-center size-10 rounded-[10px] bg-blue-400/15 border border-blue-400/30 text-blue-400">
              {f.icon}
            </div>

            <h3 className="text-xl font-semibold leading-[26px] text-zinc-50">{f.title}</h3>
            <p className="text-sm text-zinc-400 leading-[22px]">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
