import { Link } from 'react-router';
import { ArrowRightIcon } from '~/components/icons/arrow-right';

export function Hero() {
  const docsUrl = import.meta.env.VITE_DOCS_URL ?? '#';

  return (
    <section className="relative">
      <div className="container relative py-14 flex flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-2 text-[12px] font-medium tracking-[1.5px] uppercase text-zinc-400">
            <span className="size-1.5 rounded-full bg-primary-600 shadow-[0_0_14px_rgba(255,0,127,0.6)]" />
            TX3 · Interface Description Format
          </div>

          <h1 className="max-w-[900px] text-[40px] sm:text-[48px] lg:text-[56px] leading-[1.1] lg:leading-[64px] font-semibold tracking-[-0.027em] text-zinc-50">
            A machine-readable interface
            <span className="block">for UTxO blockchain protocols.</span>
          </h1>

          <p className="max-w-[760px] text-zinc-400 text-lg leading-7">
            Protocol authors publish a spec. Application developers generate
            typed clients from it.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          <article className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-[#181818] px-9 py-8 min-h-[280px]">
            <div className="flex items-center gap-2">
              <span className="block h-[1.5px] w-3.5 bg-primary-600" />
              <span className="text-[12px] font-medium tracking-[1.5px] uppercase text-primary-600">
                Authoring protocols
              </span>
            </div>

            <h2 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] text-zinc-50">
              Publishing a protocol?
            </h2>

            <p className="text-[15px] leading-6 text-zinc-300">
              Declare what your protocol exposes in a .tx3 spec — parties,
              types, transactions. Ship it as a TII artifact that any consumer
              can read.
            </p>

            <div className="mt-auto flex flex-wrap items-center gap-4 pt-2">
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2.5 bg-primary-600 hover:bg-primary-700 text-zinc-50 rounded-lg px-5 py-3 text-sm font-semibold transition-colors shadow-[0_10px_30px_-12px_rgba(255,0,127,0.55)]"
              >
                Author a protocol
                <ArrowRightIcon
                  width={16}
                  height={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-50 transition-colors"
              >
                Read the spec
                <ArrowRightIcon
                  width={16}
                  height={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
            </div>
          </article>

          <article className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-[#181818] px-9 py-8 min-h-[280px]">
            <div className="flex items-center gap-2">
              <span className="block h-[1.5px] w-3.5 bg-blue-400" />
              <span className="text-[12px] font-medium tracking-[1.5px] uppercase text-blue-400">
                Consuming protocols
              </span>
            </div>

            <h2 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] text-zinc-50">
              Integrating a protocol?
            </h2>

            <p className="text-[15px] leading-6 text-zinc-300">
              Generate a typed client from a published .tii and invoke protocol
              transactions from TypeScript, Rust, Go or Python.
            </p>

            <div className="mt-auto flex flex-wrap items-center gap-4 pt-2">
              <Link
                to="/protocols"
                className="group inline-flex items-center gap-2.5 bg-blue-500 hover:bg-blue-600 text-zinc-50 rounded-lg px-5 py-3 text-sm font-semibold transition-colors shadow-[0_10px_30px_-12px_rgba(43,127,255,0.55)]"
              >
                Consume a protocol
                <ArrowRightIcon
                  width={16}
                  height={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                to="/protocols"
                className="group inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-50 transition-colors"
              >
                Browse the registry
                <ArrowRightIcon
                  width={16}
                  height={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </article>
        </div>

        <p className="text-xs text-zinc-500 tracking-wide text-center">
          Open source&nbsp;&nbsp;·&nbsp;&nbsp;Apache
          2.0&nbsp;&nbsp;·&nbsp;&nbsp;
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-zinc-300 transition-colors"
          >
            docs.txpipe.io/tx3
          </a>
        </p>
      </div>
    </section>
  );
}
