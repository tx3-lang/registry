import {
  LIST_QUERY,
  listQueryKeyGenerator,
  generateListArgs,
  DEFAULT_PAGINATION,
  DEFAULT_SORT,
} from '~/gql/protocols.query';

import { requestGraphQL } from '~/gql/gql.server';
import { Home as HomePage } from '~/pages/home';
import type { Route } from './+types/_index';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Tx3' },
    { name: 'description', content: 'Tx3 description' },
  ];
}

export async function loader({ context, ...others }: Route.LoaderArgs) {
  const url = new URL(others.request.url);
  const page = parseInt(url.searchParams.get('page') || DEFAULT_PAGINATION.page.toString(), 10)
    || DEFAULT_PAGINATION.page;
  let size = parseInt(url.searchParams.get('size') || DEFAULT_PAGINATION.size.toString(), 10)
    || DEFAULT_PAGINATION.size;
  const sortBy = url.searchParams.get('sort') || DEFAULT_SORT;

  // Limit the size to 25
  if (size > 25) {
    size = 25;
  }

  const result = await context.queryClient.fetchQuery({
    queryKey: listQueryKeyGenerator(page, size),
    queryFn: requestGraphQL<{ protocols: Query['protocols']; }, QueryProtocolsArgs>(
      LIST_QUERY,
      generateListArgs(page, size, undefined, sortBy),
    ),
  });

  return {
    protocols: result.protocols,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <HomePage protocols={loaderData.protocols} />;
}
