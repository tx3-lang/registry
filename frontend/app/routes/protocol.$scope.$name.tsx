import { redirect, type ShouldRevalidateFunctionArgs } from 'react-router';
import { DETAIL_QUERY, detailQueryKeyGenerator } from '~/gql/protocols.query';
import { requestGraphQL } from '~/gql/gql.server';
import { ProtocolDetails as Page } from '~/pages/protocol/details';
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

export async function loader({ context, params }: Route.LoaderArgs) {
  const id = `${params.name}/${params.scope}`;

  const result: { protocol: Query['protocol']; } = await context.queryClient.fetchQuery({
    queryKey: detailQueryKeyGenerator(id),
    queryFn: requestGraphQL<{ protocol: Query['protocol']; }, QueryProtocolArgs>(
      DETAIL_QUERY,
      { scope: params.scope, name: params.name },
    ),
  });

  if (!result.protocol) {
    throw redirect('/');
  }

  return result;
}

export default function DAppDetails({ loaderData }: Route.ComponentProps) {
  return (
    <Page protocol={loaderData.protocol!} />
  );
}

export function shouldRevalidate(arg: ShouldRevalidateFunctionArgs) {
  return arg.currentParams.scope !== arg.nextParams.scope || arg.currentParams.name !== arg.nextParams.name;
}
