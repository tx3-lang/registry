import type { Route } from './+types/api.protocols.$scope.$name.logo';

export async function loader({ params }: Route.LoaderArgs) {
  const { scope, name } = params;
  const upstream = `${process.env.API_ENDPOINT}/protocols/${encodeURIComponent(scope)}/${encodeURIComponent(name)}/logo`;

  const res = await fetch(upstream);
  if (!res.ok) {
    return new Response(null, { status: res.status });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
