const SITE_NAME = 'Tx3 Registry';
const DEFAULT_IMAGE = '/og-image.png';

function absolute(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = (import.meta.env.VITE_MAIN_URL ?? '').replace(/\/$/, '');
  if (!base) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

interface SocialMetaInput {
  title: string;
  description: string;
  url?: string;
  image?: string;
  type?: 'website' | 'article';
}

export function socialMeta({
  title,
  description,
  url,
  image = DEFAULT_IMAGE,
  type = 'website',
}: SocialMetaInput) {
  const absoluteImage = absolute(image);
  const absoluteUrl = url ? absolute(url) : undefined;

  return [
    { title },
    { name: 'description', content: description },

    { property: 'og:type', content: type },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: absoluteImage },
    ...(absoluteUrl ? [{ property: 'og:url', content: absoluteUrl }] : []),

    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: absoluteImage },
  ];
}
