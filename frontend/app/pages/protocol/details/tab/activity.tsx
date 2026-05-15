import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { type darkStyles, JsonView } from 'react-json-view-lite';

import { parseLifted, truncateHex } from '~/lib/tracker/lifted';
import { useFetcherPolling } from '~/hooks/useFetcherPolling';
import { PartyChip } from './activity/PartyChip';
import { TxNamePill } from './activity/TxNamePill';

interface Props {
  protocol: Protocol;
}

type MatchesResponse =
  | { matches: Match[]; pageInfo: { hasNextPage: boolean; endCursor: string | null; }; }
  | { error: string; message?: string; };

// JSON viewer theme matching the registry's zinc palette.
const jsonStyles: Partial<typeof darkStyles> = {
  container: 'font-mono text-xs leading-relaxed',
  basicChildStyle: 'ml-4 my-px',
  label: 'mr-1.5 font-semibold text-zinc-50',
  clickableLabel: 'mr-1.5 cursor-pointer font-semibold text-zinc-50 hover:text-primary-600',
  nullValue: 'italic text-zinc-500',
  undefinedValue: 'italic text-zinc-500',
  numberValue: 'text-amber-400',
  stringValue: 'text-emerald-400',
  booleanValue: 'text-amber-400',
  otherValue: 'text-zinc-500',
  punctuation: 'text-zinc-600',
  collapseIcon:
    "mr-1.5 inline-block w-4 select-none text-base font-bold leading-none text-primary-600 before:content-['▾']",
  expandIcon:
    "mr-1.5 inline-block w-4 select-none text-base font-bold leading-none text-primary-600 before:content-['▸']",
  collapsedContent: "text-zinc-500 before:mr-1 before:content-['…']",
  noQuotesForStringValues: false,
  quotesForFieldNames: false,
};

export function TabActivity({ protocol }: Props) {
  const [searchParams] = useSearchParams();
  const selectedHash = searchParams.get('tx');

  const fetcher = useFetcherPolling<MatchesResponse>({
    key: `activity-list:${protocol.scope}/${protocol.name}`,
    url: `/api/protocols/${protocol.scope}/${protocol.name}/matches`,
    intervalMs: 12_000,
  });

  const [firstPage, setFirstPage] = useState<Match[]>([]);
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    if (fetcher.data && 'matches' in fetcher.data) {
      setFirstPage(fetcher.data.matches);
      setHasNext(fetcher.data.pageInfo?.hasNextPage ?? false);
    }
  }, [fetcher.data]);

  const selected = selectedHash
    ? firstPage.find(m => m.txHash === selectedHash) ?? null
    : null;

  const hasError = fetcher.data !== undefined && 'error' in fetcher.data;
  const isInitialLoading = fetcher.data === undefined && fetcher.state === 'loading';

  return (
    <div className="container flex-1 py-8">
      {selectedHash
        ? <DetailView match={selected} hash={selectedHash} />
        : (
          <>
            {hasError && (
              <div className="mb-4 rounded-md border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
                No se pudo cargar la actividad — reintentando…
              </div>
            )}
            {isInitialLoading
              ? <LoadingSkeleton />
              : <ListView matches={firstPage} fetcherState={fetcher.state} />}
          </>
        )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <section className="space-y-2">
      <div className="animate-pulse bg-zinc-800/40 rounded h-14 w-full" />
      <div className="animate-pulse bg-zinc-800/40 rounded h-14 w-full" />
      <div className="animate-pulse bg-zinc-800/40 rounded h-14 w-full" />
    </section>
  );
}

function ListView({ matches, fetcherState }: { matches: Match[]; fetcherState: string; }) {
  if (matches.length === 0) return <EmptyState />;

  const isRefreshing = fetcherState === 'submitting' || fetcherState === 'loading';

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-50">Recent activity</h2>
        {isRefreshing
          ? (
            <span className="text-xs text-zinc-500">
              {matches.length} most recent matches • Refreshing…
            </span>
          )
          : <p className="text-sm text-zinc-500">{matches.length} most recent matches</p>}
      </header>

      <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Tx</th>
              <th className="px-4 py-2 font-medium">Hash</th>
              <th className="px-4 py-2 font-medium">Slot</th>
              <th className="px-4 py-2 font-medium">Parties</th>
              <th className="px-4 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {matches.map(m => <MatchRowItem key={m.id} match={m} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatchRowItem({ match }: { match: Match; }) {
  const matchedAt = new Date(match.matchedAt);
  const when = matchedAt.toISOString().replace('T', ' ').slice(0, 19);
  const linkClass = 'block px-4 py-3';
  const linkSearch = `?activeTab=activity&tx=${match.txHash}`;
  const { parties } = parseLifted(match.lifted);

  return (
    <tr className="group cursor-pointer hover:bg-zinc-900/40">
      <td className="align-middle">
        <Link to={linkSearch} className={linkClass}>
          <div className="flex items-center gap-2">
            <TxNamePill name={match.txName} />
            <span className="text-xs text-zinc-500 font-mono">v{match.source.version}</span>
          </div>
        </Link>
      </td>
      <td className="align-middle">
        <Link
          to={linkSearch}
          className={`${linkClass} font-mono text-sm text-primary-600 group-hover:underline`}
        >
          {truncateHex(match.txHash)}
        </Link>
      </td>
      <td className="align-middle">
        <Link to={linkSearch} className={linkClass}>
          <span className="font-mono text-sm text-zinc-500">{Number(match.blockSlot).toLocaleString()}</span>
        </Link>
      </td>
      <td className="align-middle">
        <Link to={linkSearch} className={linkClass}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(parties).map(([name, party]) => (
              <PartyChip key={name} name={name} address={party.address} role={party.role} />
            ))}
          </div>
        </Link>
      </td>
      <td className="align-middle">
        <Link to={linkSearch} className={linkClass}>
          <span className="font-mono text-xs text-zinc-500">{when}</span>
        </Link>
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
      <p className="text-sm text-zinc-500">
        No matches yet for this protocol — the tracker has not seen on-chain activity in its current cursor window.
      </p>
    </div>
  );
}

function DetailView({ match, hash }: { match: Match | null; hash: string; }) {
  if (!match) {
    return (
      <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center space-y-2">
        <p className="text-sm text-zinc-50">Tx not found in recent matches</p>
        <p className="text-xs text-zinc-500 font-mono break-all">{hash}</p>
        <Link to="?activeTab=activity" className="inline-block text-sm text-primary-600 hover:underline">
          ← back to list
        </Link>
      </div>
    );
  }

  const { parties } = parseLifted(match.lifted);

  return (
    <article className="space-y-8">
      <DetailHeader match={match} />
      <PartiesSection parties={parties} />
      <RawLiftedDetails rawLifted={match.lifted} />
    </article>
  );
}

function DetailHeader({ match }: { match: Match; }) {
  const matchedAt = new Date(match.matchedAt);
  const when = matchedAt.toISOString().replace('T', ' ').slice(0, 19);

  return (
    <header className="space-y-3">
      <div className="flex items-center gap-3">
        <TxNamePill name={match.txName} />
        <span className="text-xs text-zinc-500 font-mono">v{match.source.version}</span>
        <span className="text-sm text-zinc-500">
          {match.protocolName} · {match.profileName} · slot {Number(match.blockSlot).toLocaleString()}
        </span>
      </div>
      <p className="font-mono text-sm break-all text-zinc-50">{match.txHash}</p>
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="font-mono">{when}</span>
        <Link to="?activeTab=activity" className="text-primary-600 hover:underline">
          ← back to list
        </Link>
        <a
          href={cexplorerUrl(match.profileName, match.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:underline"
        >
          View on cexplorer ↗
        </a>
      </div>
    </header>
  );
}

function PartiesSection({ parties }: { parties: Record<string, { address: string; role: string; }>; }) {
  const entries = Object.entries(parties);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
        Parties ({entries.length})
      </h3>
      {entries.length === 0
        ? <p className="text-sm text-zinc-500">No parties annotated for this match.</p>
        : (
          <div className="flex flex-wrap gap-2">
            {entries.map(([name, party]) => (
              <PartyChip key={name} name={name} address={party.address} role={party.role} />
            ))}
          </div>
        )}
    </section>
  );
}

function RawLiftedDetails({ rawLifted }: { rawLifted: string; }) {
  let parsed: unknown = null;
  let parseFailed = false;
  try {
    parsed = JSON.parse(rawLifted);
  } catch {
    parseFailed = true;
  }

  return (
    <details className="rounded-md border border-zinc-800 bg-zinc-950 p-4">
      <summary className="cursor-pointer text-sm font-medium text-zinc-50">Raw lifted JSON (debug)</summary>
      <div className="mt-3 overflow-x-auto font-mono text-xs">
        {parseFailed || parsed === null || typeof parsed !== 'object'
          ? <pre>{rawLifted}</pre>
          : (
            <JsonView
              data={parsed as object}
              style={jsonStyles}
              shouldExpandNode={level => level < 1}
              clickToExpandNode
            />
          )}
      </div>
    </details>
  );
}

function cexplorerUrl(profile: string, hash: string): string {
  const sub = profile === 'preview' ? 'preview.' : profile === 'preprod' ? 'preprod.' : '';
  return `https://${sub}cexplorer.io/tx/${hash}`;
}
