import { useEffect, useMemo, useState } from 'react';
import { Link, useFetcher, useSearchParams } from 'react-router';
import { type darkStyles, JsonView } from 'react-json-view-lite';

import { parseLifted, truncateHex } from '~/lib/tracker/lifted';
import { useFetcherPolling } from '~/hooks/useFetcherPolling';
import { PartyChip } from './activity/PartyChip';
import { TxNamePill } from './activity/TxNamePill';

interface Props {
  protocol: Protocol;
}

type MatchesListResp =
  | { matches: Match[]; pageInfo: { hasNextPage: boolean; endCursor: string | null; }; }
  | { error: string; message?: string; };

type DetailResp =
  | { match: Match | null; }
  | { error: string; message?: string; };

function dedupeById<T extends { id: string | number }>(rows: T[]): T[] {
  const seen = new Set<string | number>();
  return rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

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
  const { scope, name } = protocol;
  const [searchParams] = useSearchParams();
  const selectedHash = searchParams.get('tx');

  const fetcher = useFetcherPolling<MatchesListResp>({
    key: `activity-list:${scope}/${name}`,
    url: `/api/protocols/${scope}/${name}/matches`,
    intervalMs: 12_000,
    enabled: !selectedHash,
  });

  const loadMoreFetcher = useFetcher<MatchesListResp>({ key: `activity-loadmore:${scope}/${name}` });
  const detailFetcher = useFetcher<DetailResp>({ key: 'activity-detail' });

  const [firstPage, setFirstPage] = useState<Match[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [extraPages, setExtraPages] = useState<Match[]>([]);
  const [extraEndCursor, setExtraEndCursor] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.data && 'matches' in fetcher.data) {
      setFirstPage(fetcher.data.matches);
      setHasNext(fetcher.data.pageInfo?.hasNextPage ?? false);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (loadMoreFetcher.data && 'matches' in loadMoreFetcher.data) {
      const { matches, pageInfo } = loadMoreFetcher.data;
      setExtraPages(prev => [...prev, ...matches]);
      setExtraEndCursor(pageInfo.endCursor ?? null);
      setHasNext(pageInfo.hasNextPage);
    }
  }, [loadMoreFetcher.data]);

  useEffect(() => {
    if (!selectedHash) return;
    detailFetcher.load(`/api/protocols/${scope}/${name}/matches/${selectedHash}`);
    // detailFetcher is intentionally NOT in deps: its identity changes when
    // its state cycles (idle → loading → idle), which would re-fire this
    // effect on every load and produce an infinite request loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHash, scope, name]);

  const firstPageEndCursor =
    fetcher.data && 'matches' in fetcher.data
      ? (fetcher.data.pageInfo?.endCursor ?? null)
      : null;

  function loadMore() {
    const cursor = extraEndCursor ?? firstPageEndCursor;
    if (!cursor) return;
    loadMoreFetcher.load(
      `/api/protocols/${scope}/${name}/matches?after=${encodeURIComponent(cursor)}`,
    );
  }

  const renderedList = useMemo(
    () => dedupeById([...firstPage, ...extraPages]),
    [firstPage, extraPages],
  );

  const detailMatch: Match | null =
    detailFetcher.data && 'match' in detailFetcher.data
      ? detailFetcher.data.match
      : null;

  const isDetailLoading = detailFetcher.state !== 'idle';
  const hasDetailError =
    detailFetcher.data !== undefined && 'error' in detailFetcher.data;

  const hasError = fetcher.data !== undefined && 'error' in fetcher.data;
  const isInitialLoading = fetcher.data === undefined && fetcher.state === 'loading';
  const isLoadingMore = loadMoreFetcher.state !== 'idle';
  const showLoadMore = firstPage.length > 0;

  return (
    <div className="container flex-1 py-8">
      {/*
        ListView stays mounted while viewing a detail so its scroll position
        and loaded pages survive the round trip. Polling is paused via the
        `enabled` flag above.
      */}
      <div hidden={!!selectedHash}>
        {hasError && (
          <div className="mb-4 rounded-md border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
            No se pudo cargar la actividad — reintentando…
          </div>
        )}
        {isInitialLoading
          ? <LoadingSkeleton />
          : (
            <ListView
              matches={renderedList}
              fetcherState={fetcher.state}
              hasNext={hasNext}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
              showLoadMore={showLoadMore}
            />
          )}
      </div>
      {selectedHash && (
        <>
          {hasDetailError && (
            <div className="mb-4 rounded-md border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
              No se pudo cargar el detalle — reintentando…
            </div>
          )}
          <DetailView match={detailMatch} hash={selectedHash} loading={isDetailLoading} />
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

interface ListViewProps {
  matches: Match[];
  fetcherState: string;
  hasNext: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  showLoadMore: boolean;
}

function ListView({ matches, fetcherState, hasNext, isLoadingMore, onLoadMore, showLoadMore }: ListViewProps) {
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

      {showLoadMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={!hasNext || isLoadingMore}
            className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
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

function DetailView({ match, hash, loading }: { match: Match | null; hash: string; loading: boolean; }) {
  const backLink = (
    <Link to="?activeTab=activity" className="inline-block text-sm text-zinc-400 hover:text-primary-600">
      ← Back to activity
    </Link>
  );

  if (loading && !match) {
    return (
      <div className="space-y-6">
        {backLink}
        <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center space-y-2">
          <span className="text-xs text-zinc-500">Loading…</span>
          <p className="text-xs text-zinc-500 font-mono break-all">{hash}</p>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="space-y-6">
        {backLink}
        <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center space-y-2">
          <p className="text-sm text-zinc-50">Tx not found</p>
          <p className="text-xs text-zinc-500 font-mono break-all">{hash}</p>
        </div>
      </div>
    );
  }

  const { parties } = parseLifted(match.lifted);

  return (
    <div className="space-y-6">
      {backLink}
      <article className="space-y-8">
        <DetailHeader match={match} />
        <PartiesSection parties={parties} />
        <RawLiftedDetails rawLifted={match.lifted} />
      </article>
    </div>
  );
}

function DetailHeader({ match }: { match: Match; }) {
  const matchedAt = new Date(match.matchedAt);
  const when = matchedAt.toISOString().replace('T', ' ').slice(0, 19);

  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <TxNamePill name={match.txName} />
          <span className="text-xs text-zinc-500 font-mono">v{match.source.version}</span>
          <span className="text-sm text-zinc-500">
            {match.protocolName} · {match.profileName} · slot {Number(match.blockSlot).toLocaleString()}
          </span>
        </div>
        <a
          href={cexplorerUrl(match.profileName, match.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          View on cexplorer ↗
        </a>
      </div>
      <p className="font-mono text-sm break-all text-zinc-50">{match.txHash}</p>
      <span className="block font-mono text-xs text-zinc-500">{when}</span>
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
