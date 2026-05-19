import {
  LIST_QUERY,
  listQueryKeyGenerator,
  generateListArgs,
} from '~/gql/protocols.query';
import { requestGraphQL } from '~/gql/gql.server';
import { Landing } from '~/pages/landing';
import type { Route } from './+types/_index';

const TICKER_PAGE_SIZE = 25;

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Tx3 — The Open API for UTxO blockchains' },
    { name: 'description', content: 'Tx3 turns UTxO dApps into ready-to-use SDKs and APIs — for your code, or your AI agents.' },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const result = await context.queryClient.fetchQuery({
    queryKey: listQueryKeyGenerator(1, TICKER_PAGE_SIZE),
    queryFn: requestGraphQL<{ protocols: Query['protocols']; }, QueryProtocolsArgs>(
      LIST_QUERY,
      generateListArgs(1, TICKER_PAGE_SIZE),
    ),
  });

  return {
    protocols: result.protocols,
  };
}

export default function IndexRoute({ loaderData }: Route.ComponentProps) {
  return <Landing protocols={loaderData.protocols} />;
}
