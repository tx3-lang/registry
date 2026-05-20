import {
  LIST_MATCHES_QUERY,
  listMatchesQueryKeyGenerator,
} from '~/gql/matches.query';

import { requestGraphQL } from '~/gql/gql.server';
import type { Route } from './+types/api.protocols.$scope.$name.matches';

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const { scope, name } = params;
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const firstRaw = searchParams.get('first');
  let first = 50;
  if (firstRaw !== null) {
    const parsed = parseInt(firstRaw, 10);
    if (isNaN(parsed)) {
      return Response.json({ error: 'invalid first' }, { status: 400 });
    }
    first = Math.min(200, Math.max(1, parsed));
  }

  const after = searchParams.get('after') ?? null;
  const version = searchParams.get('version') ?? null;

  try {
    const result = await context.queryClient.fetchQuery({
      queryKey: listMatchesQueryKeyGenerator(scope, name, version, after),
      queryFn: requestGraphQL<{ protocolMatches: Query['protocolMatches']; }, QueryProtocolMatchesArgs>(
        LIST_MATCHES_QUERY,
        { scope, name, version, first, after },
      ),
    });

    return {
      matches: result.protocolMatches.nodes,
      pageInfo: result.protocolMatches.pageInfo,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('upstream error fetching protocolMatches:', err);
    return Response.json({ error: 'upstream error', message: String(err) }, { status: 502 });
  }
}
