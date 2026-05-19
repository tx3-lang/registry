import { ChevronLeftIcon } from '~/components/icons/chevron-left';
import { ChevronRightIcon } from '~/components/icons/chevron-right';

const PROTOCOLS = [
  { name: 'Indigo', scope: 'indigoprotocol', version: '2.0.0', initial: 'I', tint: 'text-primary-400' },
  { name: 'FluidTokens', scope: 'fluidtokens', version: '0.1.0', initial: 'F', tint: 'text-zinc-400' },
  { name: 'vyfi', scope: 'vyfi', version: '0.1.0', initial: 'V', tint: 'text-amber-300' },
  { name: 'Bodega Market', scope: 'bodega-market', version: '0.1.0', initial: 'B', tint: 'text-emerald-300' },
  { name: 'snek.fun', scope: 'snekdotfun', version: '0.1.0', initial: 'S', tint: 'text-rose-400' },
  { name: 'STRIKE Finance', scope: 'strike-finance', version: '0.1.0', initial: 'S', tint: 'text-blue-300' },
  { name: 'asteria', scope: 'txpipe', version: '0.1.0', initial: 'A', tint: 'text-purple-300' },
  { name: 'Buidler Fest', scope: 'buidler-fest', version: '0.1.0', initial: 'B', tint: 'text-zinc-400' },
  { name: 'Partner Chain', scope: 'txpipe', version: '0.0.0', initial: 'P', tint: 'text-zinc-400' },
];

function ProtocolChip({ p }: { p: typeof PROTOCOLS[number]; }) {
  return (
    <div className="shrink-0 flex items-center gap-3 bg-woodsmoke-950 border border-woodsmoke-800/80 rounded-full pl-2 pr-5 py-2">
      <span className={`size-7 rounded-full bg-woodsmoke-900 border border-woodsmoke-800 grid place-items-center text-xs font-semibold ${p.tint}`}>
        {p.initial}
      </span>
      <span className="text-sm font-medium text-zinc-100">{p.name}</span>
      <span className="text-xs text-zinc-500">v{p.version}</span>
    </div>
  );
}

export function Ticker() {
  return (
    <section className="relative">
      <div className="container flex items-center justify-between pb-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[1.4px] uppercase text-zinc-500">
          <span className="size-1.5 rounded-full bg-primary-600" />
          Building on Tx3
          <span className="text-zinc-600 normal-case tracking-normal font-normal italic">growing</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous"
            className="size-8 rounded-full border border-woodsmoke-800 grid place-items-center text-zinc-400 hover:text-zinc-100 hover:border-woodsmoke-700 transition-colors cursor-pointer"
          >
            <ChevronLeftIcon width={14} height={14} />
          </button>
          <button
            type="button"
            aria-label="Next"
            className="size-8 rounded-full border border-woodsmoke-800 grid place-items-center text-zinc-400 hover:text-zinc-100 hover:border-woodsmoke-700 transition-colors cursor-pointer"
          >
            <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-r from-zinc-950 to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-l from-zinc-950 to-transparent" />
        <div className="ticker-track flex gap-3 w-max">
          {[...PROTOCOLS, ...PROTOCOLS].map((p, i) => (
            <ProtocolChip key={`${p.name}-${i}`} p={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
