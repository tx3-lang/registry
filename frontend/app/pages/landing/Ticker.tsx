import { Link } from 'react-router';

type TickerProtocol = Pick<Protocol, 'name' | 'scope'>;

function ProtocolChip({ p }: { p: TickerProtocol; }) {
  const initial = p.name.charAt(0).toUpperCase() || '?';
  return (
    <Link
      to={`/protocol/${p.scope}/${p.name}`}
      className="shrink-0 flex items-center gap-3 bg-woodsmoke-950 border border-woodsmoke-800/80 rounded-xl pl-3 pr-4 h-14 hover:border-woodsmoke-700 hover:bg-woodsmoke-900 transition-colors"
    >
      <span className="size-8 rounded-lg bg-woodsmoke-900 border border-woodsmoke-800 grid place-items-center text-[13px] font-bold text-zinc-400">
        {initial}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] leading-4 font-semibold text-zinc-100">{p.name}</span>
        <span className="text-[10px] leading-[14px] font-medium text-zinc-600">@{p.scope}</span>
      </span>
    </Link>
  );
}

const TICKER_REPEATS_PER_GROUP = 4;

export function Ticker({ protocols }: { protocols: ProtocolConnection; }) {
  const items = protocols.nodes;

  if (items.length === 0) {
    return null;
  }

  const groupItems = Array.from({ length: TICKER_REPEATS_PER_GROUP }, () => items).flat();

  return (
    <section className="relative py-8">
      <div className="container flex items-center pb-4">
        <div className="flex items-center gap-2.5 text-[11px] leading-4 font-semibold tracking-[2px] uppercase text-zinc-500">
          <span className="size-1.5 rounded-full bg-blue-400" />
          Building on Tx3
          <span className="text-zinc-600 font-medium tracking-normal normal-case">· Highlights</span>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-[180px] z-10 bg-gradient-to-r from-zinc-950 to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-[180px] z-10 bg-gradient-to-l from-zinc-950 to-transparent" />
        <div className="ticker-track flex w-max">
          <div className="flex items-center gap-[14px] pr-[14px] shrink-0">
            {groupItems.map((p, i) => (
              <ProtocolChip key={`a-${p.scope}-${p.name}-${i}`} p={p} />
            ))}
          </div>
          <div className="flex items-center gap-[14px] pr-[14px] shrink-0" aria-hidden>
            {groupItems.map((p, i) => (
              <ProtocolChip key={`b-${p.scope}-${p.name}-${i}`} p={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
