import { Link } from 'react-router';
import { ArrowRightIcon } from '~/components/icons/arrow-right';

export function DualCTA() {
  return (
    <section className="container relative">
      <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5">
        <article className="relative overflow-hidden rounded-2xl border border-primary-900/60 bg-gradient-to-br from-primary-950/60 via-woodsmoke-950 to-woodsmoke-950 p-8">
          <div className="absolute -top-20 -right-16 size-64 rounded-full bg-primary-600/20 blur-3xl pointer-events-none" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[1.4px] uppercase text-primary-400">
              <span className="size-1.5 rounded-full bg-primary-600" />
              Use a protocol
            </div>
            <h3 className="mt-4 text-xl font-semibold text-zinc-50 leading-tight max-w-[320px]">
              Find a UTxO protocol and integrate in minutes.
            </h3>
            <p className="mt-3 text-sm text-zinc-400 leading-6 max-w-[380px]">
              Browse the registry, grab the typed SDK and start calling endpoints.
            </p>
            <Link
              to="/protocols"
              className="group mt-7 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-zinc-50 rounded-lg pl-5 pr-4 py-3 text-sm font-medium transition-colors shadow-[0_10px_30px_-12px_rgba(255,0,127,0.55)]"
            >
              Browse the registry
              <ArrowRightIcon width={16} height={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </article>

        <article className="relative overflow-hidden rounded-2xl border border-blue-900/60 bg-gradient-to-br from-blue-950/60 via-woodsmoke-950 to-woodsmoke-950 p-8">
          <div className="absolute -top-20 -right-16 size-64 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[1.4px] uppercase text-blue-400">
              <span className="size-1.5 rounded-full bg-blue-500" />
              Publish a protocol
            </div>
            <h3 className="mt-4 text-xl font-semibold text-zinc-50 leading-tight max-w-[320px]">
              Ship your protocol as a typed, public API.
            </h3>
            <p className="mt-3 text-sm text-zinc-400 leading-6 max-w-[380px]">
              Describe it once in Tx3 and we'll generate SDKs, docs and live activity.
            </p>
            <a
              href={import.meta.env.VITE_DOCS_URL ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="group mt-7 inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-zinc-50 rounded-lg pl-5 pr-4 py-3 text-sm font-medium transition-colors shadow-[0_10px_30px_-12px_rgba(43,127,255,0.55)]"
            >
              Request integration
              <ArrowRightIcon width={16} height={16} className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}
