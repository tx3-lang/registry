import { Link } from 'react-router';
import { ArrowRightIcon } from '~/components/icons/arrow-right';
import { CodeCard } from './CodeCard';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 landing-glow-pink pointer-events-none" aria-hidden />
      <div className="absolute inset-0 landing-grid-noise pointer-events-none" aria-hidden />

      <div className="container relative pt-20 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-14 items-start">
          <div className="max-w-[560px]">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[1.4px] uppercase text-primary-400">
              <span className="size-1.5 rounded-full bg-primary-600 shadow-[0_0_14px_rgba(255,0,127,0.6)]" />
              Use or publish UTxO protocols
            </div>

            <h1 className="mt-7 text-[68px] xl:text-[76px] leading-[0.95] font-semibold tracking-[-0.035em]">
              The <span className="text-primary-600">Open API</span><br />
              for UTxO<br />
              blockchains.
            </h1>

            <p className="mt-7 text-zinc-400 text-base leading-7 max-w-[500px]">
              Whether you're using a protocol or publishing your own, Tx3 turns UTxO dApps into ready-to-use SDKs and APIs — for your code, or your AI agents.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                to="/protocols"
                className="group flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-zinc-50 rounded-lg pl-5 pr-4 py-3 text-sm font-medium transition-colors shadow-[0_10px_30px_-12px_rgba(255,0,127,0.55)]"
              >
                Use a protocol
                <ArrowRightIcon width={16} height={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href={import.meta.env.VITE_DOCS_URL ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-zinc-50 rounded-lg pl-5 pr-4 py-3 text-sm font-medium transition-colors shadow-[0_10px_30px_-12px_rgba(43,127,255,0.55)]"
              >
                Publish your protocol
                <ArrowRightIcon width={16} height={16} className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href={import.meta.env.VITE_DOCS_URL ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-200 text-sm underline underline-offset-4 hover:text-zinc-50 transition-colors px-1"
              >
                Read the docs
              </a>
            </div>

            <p className="mt-7 text-xs text-zinc-500 tracking-wide">
              Open source · Apache 2.0
            </p>
          </div>

          <CodeCard />
        </div>
      </div>
    </section>
  );
}
