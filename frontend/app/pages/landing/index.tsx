import { Header } from '~/components/Header';
import { SearchBar } from '~/components/SearchBar';
import { Hero } from './Hero';
import { Features } from './Features';
import { Ticker } from './Ticker';
import { SneakPeek } from './SneakPeek';
import { DualCTA } from './DualCTA';

export function Landing() {
  return (
    <>
      <Header centerNode={<SearchBar dark className="mx-auto max-w-[420px]" />} />
      <main className="flex flex-col gap-24 pb-24">
        <Hero />
        <Features />
        <Ticker />
        <SneakPeek />
        <DualCTA />
      </main>
    </>
  );
}
