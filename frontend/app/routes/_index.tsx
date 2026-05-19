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
    { title: 'Tx3 — A machine-readable interface for UTxO blockchain protocols' },
    { name: 'description', content: 'Protocol authors publish a .tx3 spec. Application developers generate typed clients in TypeScript, Rust, Go or Python. The interface is data, not lore.' },
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
