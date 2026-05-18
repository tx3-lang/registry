import type { Route } from './+types/_index';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Tx3' },
    { name: 'description', content: 'Tx3' },
  ];
}

export default function Landing() {
  return <main />;
}
