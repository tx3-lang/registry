import {
  LIST_QUERY,
  listQueryKeyGenerator,
  generateListArgs,
  DEFAULT_PAGINATION
} from '~/gql/protocols.query';

import { requestGraphQL } from '~/gql/gql.server';
import type { Route } from './+types/api.search';

export async function loader({ context, ...others }: Route.LoaderArgs) {
  const url = new URL(others.request.url);
  const search = url.searchParams.get('q') || '';
  const result = await context.queryClient.fetchQuery({
    queryKey: listQueryKeyGenerator(1, DEFAULT_PAGINATION.size, search),
    queryFn: requestGraphQL<{ protocols: Query['protocols']; }, QueryProtocolsArgs>(
      LIST_QUERY,
      generateListArgs(1, DEFAULT_PAGINATION.size, search),
    ),
  });

  return {
    protocols: result.protocols,
  };
}
