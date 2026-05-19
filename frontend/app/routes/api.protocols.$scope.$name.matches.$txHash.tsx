import {
  MATCH_BY_HASH_QUERY,
  matchByHashQueryKeyGenerator,
} from '~/gql/matches.query';

import { requestGraphQL } from '~/gql/gql.server';
import type { Route } from './+types/api.protocols.$scope.$name.matches.$txHash';

export async function loader({ context, params }: Route.LoaderArgs) {
  const { scope, name, txHash } = params;

  if (!/^[0-9a-fA-F]+$/.test(txHash) || txHash.length % 2 !== 0) {
    return Response.json({ error: 'invalid txHash' }, { status: 400 });
  }

  try {
    const result = await context.queryClient.fetchQuery({
      queryKey: matchByHashQueryKeyGenerator(scope, name, txHash),
      queryFn: requestGraphQL<{ protocolMatch: Query['protocolMatch']; }, QueryProtocolMatchArgs>(
        MATCH_BY_HASH_QUERY,
        { scope, name, txHash },
      ),
    });

    return { match: result.protocolMatch };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('upstream error fetching protocolMatch:', err);
    return Response.json(
      { error: 'upstream error', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
