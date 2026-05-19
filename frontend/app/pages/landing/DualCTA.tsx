import { Link } from 'react-router';
import { ArrowRightIcon } from '~/components/icons/arrow-right';

export function DualCTA() {
  return (
    <section className="container relative py-12">
      <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5">
        <article
          className="relative overflow-hidden rounded-2xl border border-[#232326] bg-woodsmoke-950 px-8 py-7"
          style={{
            backgroundImage: 'linear-gradient(90deg, rgba(255, 0, 127, 0.14) 0%, rgba(255, 0, 127, 0) 100%)',
          }}
        >
          <div className="relative flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[1.6px] uppercase text-primary-400">
              <span className="block h-px w-3.5 bg-primary-400" />
              Use a protocol
            </div>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-zinc-50 leading-6">
                  Find a UTxO protocol and integrate in minutes.
                </h3>
                <p className="text-[13px] text-zinc-400 leading-5 max-w-[360px]">
                  Browse the registry, grab the typed SDK and start calling endpoints.
                </p>
              </div>
              <Link
                to="/protocols"
                className="group inline-flex items-center gap-2 self-start bg-primary-600 hover:bg-primary-700 text-zinc-50 rounded-lg px-5 py-3 text-sm font-semibold transition-colors shadow-[0_10px_30px_-12px_rgba(255,0,127,0.55)]"
              >
                Browse the registry
                <ArrowRightIcon width={16} height={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </article>

        <article
          className="relative overflow-hidden rounded-2xl border border-[#232326] bg-woodsmoke-950 px-8 py-7"
          style={{
            backgroundImage: 'linear-gradient(90deg, rgba(43, 127, 255, 0.14) 0%, rgba(43, 127, 255, 0) 100%)',
          }}
        >
          <div className="relative flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[1.6px] uppercase text-blue-400">
              <span className="block h-px w-3.5 bg-blue-400" />
              Publish a protocol
            </div>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-zinc-50 leading-6">
                  Ship your protocol as a typed, public API.
                </h3>
                <p className="text-[13px] text-zinc-400 leading-5 max-w-[360px]">
                  Describe it once in Tx3 and we'll generate SDKs, docs and live activity.
                </p>
              </div>
              <a
                href={import.meta.env.VITE_DOCS_URL ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 self-start bg-blue-500 hover:bg-blue-600 text-zinc-50 rounded-lg px-5 py-3 text-sm font-semibold transition-colors shadow-[0_10px_30px_-12px_rgba(43,127,255,0.55)]"
              >
                Request integration
                <ArrowRightIcon width={16} height={16} className="transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
