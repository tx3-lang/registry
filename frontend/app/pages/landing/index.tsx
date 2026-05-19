import { Header } from '~/components/Header';
import { SearchBar } from '~/components/SearchBar';
import { Hero } from './Hero';
import { Features } from './Features';
import { Ticker } from './Ticker';
import { SneakPeek } from './SneakPeek';
import { DualCTA } from './DualCTA';

export function Landing() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[900px] landing-glow-pink pointer-events-none" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-[900px] landing-grid-noise pointer-events-none" aria-hidden />

      <div className="relative">
        <Header centerNode={<SearchBar dark className="mx-auto max-w-[420px]" />} />
        <main className="flex flex-col">
          <Hero />
          <Features />
          <SneakPeek />
          <Ticker />
          <DualCTA />
        </main>
      </div>
    </div>
  );
}
