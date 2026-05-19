import { Landing } from '~/pages/landing';
import type { Route } from './+types/_index';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Tx3 — The Open API for UTxO blockchains' },
    { name: 'description', content: 'Tx3 turns UTxO dApps into ready-to-use SDKs and APIs — for your code, or your AI agents.' },
  ];
}

export default function IndexRoute() {
  return <Landing />;
}
