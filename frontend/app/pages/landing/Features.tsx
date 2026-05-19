import { TerminalIcon } from '~/components/icons/terminal';
import { Stack2Icon } from '~/components/icons/stack-2';
import { PlugConnectedIcon } from '~/components/icons/plug-connected';

const FEATURES = [
  {
    number: '01',
    eyebrow: 'DSL & Tooling',
    title: 'One DSL. The full toolchain.',
    body: 'Describe inputs, outputs and datums once in `.tx3`. Lint in VS Code, run a local devnet and ship with Trix — batteries included.',
    icon: <TerminalIcon width={20} height={20} />,
    accent: 'text-primary-400',
  },
  {
    number: '02',
    eyebrow: 'For developers',
    title: 'Ready-to-use protocol SDKs.',
    body: 'Production endpoints backed by a managed provider. Drop the typed SDK in TypeScript, Rust, Go or Python and call your dApp like any other API.',
    icon: <Stack2Icon width={20} height={20} />,
    accent: 'text-blue-400',
  },
  {
    number: '03',
    eyebrow: 'MCP Server',
    title: 'Built for AI agents.',
    body: 'Every protocol ships with machine-readable specs, READMEs and an MCP server. Your agents call dApps the same way developers do.',
    icon: <PlugConnectedIcon width={20} height={20} />,
    accent: 'text-emerald-300',
    badge: 'Coming soon',
  },
];

export function Features() {
  return (
    <section className="container relative">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {FEATURES.map(f => (
          <article
            key={f.number}
            className="relative bg-woodsmoke-950/60 border border-woodsmoke-800/80 rounded-2xl p-7 hover:border-woodsmoke-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[1.6px] uppercase text-zinc-500">
                <span className="text-zinc-600">— {f.number}</span>
                <span>{f.eyebrow}</span>
              </div>
              {f.badge && (
                <span className="text-[10px] font-semibold tracking-[1.2px] uppercase text-emerald-300 bg-emerald-300/10 border border-emerald-300/20 rounded-full px-2 py-0.5">
                  ● {f.badge}
                </span>
              )}
            </div>

            <div className={`mt-6 inline-flex items-center justify-center size-10 rounded-lg bg-woodsmoke-900 border border-woodsmoke-800 ${f.accent}`}>
              {f.icon}
            </div>

            <h3 className="mt-6 text-lg font-semibold text-zinc-50">{f.title}</h3>
            <p className="mt-2.5 text-sm text-zinc-400 leading-6">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
