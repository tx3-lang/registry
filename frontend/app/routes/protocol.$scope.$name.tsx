import { redirect, type ShouldRevalidateFunctionArgs } from 'react-router';
import { DETAIL_QUERY, detailQueryKeyGenerator } from '~/gql/protocols.query';
import { requestGraphQL } from '~/gql/gql.server';
import { ProtocolDetails as Page } from '~/pages/protocol/details';
import { createTrackerDb } from '~/lib/tracker/db';
import { listMatchesForProtocol, type MatchRow } from '~/lib/tracker/queries';
import type { Route } from './+types/protocol.$scope.$name';

export function meta({ params }: Route.MetaArgs) {
  let title = 'Tx3';
  if (params.name) {
    title = `Tx3 - ${params.name}`;
  }
  return [
    { title },
    { name: 'description', content: 'Tx3 description' },
  ];
}

const RPC_DOCS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

let rpcDocsCache: { protocols: string[]; fetchedAt: number; } | null = null;

async function getRpcProtocols(): Promise<string[]> {
  const now = Date.now();

  if (rpcDocsCache && now - rpcDocsCache.fetchedAt < RPC_DOCS_CACHE_TTL) {
    return rpcDocsCache.protocols;
  }

  const baseUrl = process.env.RPC_DOCS_BASE_URL;
  if (!baseUrl) return [];

  try {
    const res = await fetch(baseUrl);
    if (!res.ok) return [];

    const data: { protocols: string[]; } = await res.json();
    rpcDocsCache = { protocols: data.protocols ?? [], fetchedAt: now };
    return rpcDocsCache.protocols;
  } catch {
    return [];
  }
}

async function checkRpcDocs(protocolName: string): Promise<string | null> {
  const baseUrl = process.env.RPC_DOCS_BASE_URL;
  if (!baseUrl) return null;

  const protocols = await getRpcProtocols();
  if (!protocols.includes(protocolName)) return null;

  return `${baseUrl}/${protocolName}/docs`;
}

/**
 * Fetch recent matches for the protocol from tracker.db.
 *
 * Resilient: if tracker.db is missing, unreadable, or empty for this
 * protocol, returns []. The Activity tab renders an empty-state in that
 * case instead of erroring the whole page.
 */
async function safeListMatches(protocolName: string): Promise<MatchRow[]> {
  try {
    const db = createTrackerDb();
    try {
      return await listMatchesForProtocol(db, protocolName, 50);
    } finally {
      await db.destroy();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console -- ops signal when tracker.db is missing/unreachable
    console.warn(`[activity] tracker.db unavailable for protocol=${protocolName}: ${msg}`);
    return [];
  }
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const id = `${params.name}/${params.scope}`;

  const [result, rpcDocsUrl, matches] = await Promise.all([
    context.queryClient.fetchQuery({
      queryKey: detailQueryKeyGenerator(id),
      queryFn: requestGraphQL<{ protocol: Query['protocol']; }, QueryProtocolArgs>(
        DETAIL_QUERY,
        { scope: params.scope, name: params.name },
      ),
    }),
    checkRpcDocs(params.name),
    safeListMatches(params.name),
  ]);

  if (!result.protocol) {
    throw redirect('/');
  }

  return { ...result, rpcDocsUrl, matches };
}

export default function DAppDetails({ loaderData }: Route.ComponentProps) {
  return (
    <Page
      protocol={loaderData.protocol!}
      rpcDocsUrl={loaderData.rpcDocsUrl}
      matches={loaderData.matches}
    />
  );
}

export function shouldRevalidate(arg: ShouldRevalidateFunctionArgs) {
  return arg.currentParams.scope !== arg.nextParams.scope || arg.currentParams.name !== arg.nextParams.name;
}
