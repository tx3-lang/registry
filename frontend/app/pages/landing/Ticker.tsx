import { ChevronLeftIcon } from '~/components/icons/chevron-left';
import { ChevronRightIcon } from '~/components/icons/chevron-right';

type Protocol = {
  name: string;
  scope: string;
  initial: string;
  tint: string;
};

const PROTOCOLS: Protocol[] = [
  { name: 'Indigo', scope: 'indigoprotocol', initial: 'I', tint: 'text-primary-400' },
  { name: 'FluidTokens', scope: 'fluidtokens', initial: 'F', tint: 'text-zinc-400' },
  { name: 'vyfi', scope: 'vyfi', initial: 'v', tint: 'text-zinc-400' },
  { name: 'Bodega Market', scope: 'bodega-market', initial: 'B', tint: 'text-zinc-400' },
  { name: 'snek.fun', scope: 'snekdotfun', initial: 's', tint: 'text-zinc-400' },
  { name: 'STRIKE Finance', scope: 'strike-finance', initial: 'S', tint: 'text-zinc-400' },
  { name: 'asteria', scope: 'txpipe', initial: 'a', tint: 'text-zinc-400' },
  { name: 'Buidler Fest', scope: 'buidler-fest', initial: 'B', tint: 'text-zinc-400' },
  { name: 'Partner Chain', scope: 'txpipe', initial: 'P', tint: 'text-zinc-400' },
];

function ProtocolChip({ p }: { p: Protocol; }) {
  return (
    <div className="shrink-0 flex items-center gap-3 bg-woodsmoke-950 border border-woodsmoke-800/80 rounded-xl pl-3 pr-4 h-14">
      <span className={`size-8 rounded-lg bg-woodsmoke-900 border border-woodsmoke-800 grid place-items-center text-[13px] font-bold ${p.tint}`}>
        {p.initial}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] leading-4 font-semibold text-zinc-100">{p.name}</span>
        <span className="text-[10px] leading-[14px] font-medium text-zinc-600">@{p.scope}</span>
      </span>
    </div>
  );
}

export function Ticker() {
  return (
    <section className="relative py-8">
      <div className="container flex items-center justify-between pb-4">
        <div className="flex items-center gap-2.5 text-[11px] leading-4 font-semibold tracking-[2px] uppercase text-zinc-500">
          <span className="size-1.5 rounded-full bg-blue-400" />
          Building on Tx3
          <span className="text-zinc-600 font-medium tracking-normal normal-case">· Highlights</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous"
            className="size-7 rounded-full bg-woodsmoke-950 border border-woodsmoke-800 grid place-items-center text-zinc-400 hover:text-zinc-100 hover:border-woodsmoke-700 transition-colors cursor-pointer"
          >
            <ChevronLeftIcon width={10.67} height={10.67} />
          </button>
          <button
            type="button"
            aria-label="Next"
            className="size-7 rounded-full bg-woodsmoke-950 border border-woodsmoke-800 grid place-items-center text-zinc-400 hover:text-zinc-100 hover:border-woodsmoke-700 transition-colors cursor-pointer"
          >
            <ChevronRightIcon width={10.67} height={10.67} />
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-[180px] z-10 bg-gradient-to-r from-zinc-950 to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-[180px] z-10 bg-gradient-to-l from-zinc-950 to-transparent" />
        <div className="ticker-track flex gap-[14px] w-max">
          {[...PROTOCOLS, ...PROTOCOLS].map((p, i) => (
            <ProtocolChip key={`${p.name}-${i}`} p={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
