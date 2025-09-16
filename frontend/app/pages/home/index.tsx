import { useState } from 'react';

// Components
import { Hero } from '~/components/Hero';
import { Header } from '~/components/Header';

// Local components
import { Catalogue } from './catalogue';

export function Home({ protocols }: { protocols: ProtocolConnection; }) {
  const [_search, setSearch] = useState('');

  return (
    <>
      <Header appName="Registry" />
      <main className="mt-14">
        <Hero onSearch={setSearch} />
        <Catalogue
          className="mt-14"
          protocols={protocols}
        />
      </main>
    </>
  );
}
