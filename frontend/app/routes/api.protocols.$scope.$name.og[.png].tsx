import type { Route } from './+types/api.protocols.$scope.$name.og[.png]';

// Proxy the social/Open Graph card PNG rendered by the backend so it is served
// from the same origin as the protocol page (better for og:image + caching).
// Mirrors the logo proxy in `api.protocols.$scope.$name.logo.tsx`.
export async function loader({ params }: Route.LoaderArgs) {
  const { scope, name } = params;
  const upstream = `${process.env.API_ENDPOINT}/protocols/${encodeURIComponent(scope)}/${encodeURIComponent(name)}/og.png`;

  const res = await fetch(upstream);
  if (!res.ok) {
    return new Response(null, { status: res.status });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': res.headers.get('Cache-Control') ?? 'public, max-age=3600',
    },
  });
}
