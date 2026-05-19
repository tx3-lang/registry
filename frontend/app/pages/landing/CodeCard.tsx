import { useState } from 'react';
import clsx from 'clsx';
import { FileCode } from '~/components/icons/file-code';

const LANGUAGES = ['TypeScript', 'Rust', 'Go', 'Python'] as const;
type Language = typeof LANGUAGES[number];

const SNIPPETS: Record<Language, React.ReactNode> = {
  TypeScript: (
    <>
      <Line n={1}>
        <K>import</K> {'{ '}<V>swap</V>{' }'} <K>from</K> <S>{`"@tx3/indigo"`}</S>;
      </Line>
      <Line n={2} />
      <Line n={3}>
        <C>{`// Production endpoint, managed provider`}</C>
      </Line>
      <Line n={4}>
        <K>const</K> <V>tx</V> = <K>await</K> <F>swap</F>{'({'}
      </Line>
      <Line n={5}>
        {'  '}<P>quantity</P>: <N>1_000</N>,
      </Line>
      <Line n={6}>
        {'  '}<P>price</P>:{'    '}<F>ada</F>(<N>420</N>),
      </Line>
      <Line n={7}>{'});'}</Line>
      <Line n={8} />
      <Line n={9}>
        <K>await</K> <V>wallet</V>.<F>sign</F>(<V>tx</V>);
      </Line>
    </>
  ),
  Rust: (
    <>
      <Line n={1}><K>use</K> <V>tx3_indigo</V>::<F>swap</F>;</Line>
      <Line n={2} />
      <Line n={3}><C>{`// Production endpoint, managed provider`}</C></Line>
      <Line n={4}><K>let</K> tx = <F>swap</F>(<V>SwapArgs</V> {'{'}</Line>
      <Line n={5}>{'  '}<P>quantity</P>: <N>1_000</N>,</Line>
      <Line n={6}>{'  '}<P>price</P>: <F>ada</F>(<N>420</N>),</Line>
      <Line n={7}>{'}).await?;'}</Line>
      <Line n={8} />
      <Line n={9}><V>wallet</V>.<F>sign</F>(&tx).<F>await</F>?;</Line>
    </>
  ),
  Go: (
    <>
      <Line n={1}><K>import</K> <S>{`"github.com/tx3/indigo"`}</S></Line>
      <Line n={2} />
      <Line n={3}><C>{`// Production endpoint, managed provider`}</C></Line>
      <Line n={4}>tx, err := indigo.<F>Swap</F>(indigo.<V>SwapArgs</V>{'{'}</Line>
      <Line n={5}>{'  '}<P>Quantity</P>: <N>1_000</N>,</Line>
      <Line n={6}>{'  '}<P>Price</P>: indigo.<F>Ada</F>(<N>420</N>),</Line>
      <Line n={7}>{'})'}</Line>
      <Line n={8} />
      <Line n={9}>wallet.<F>Sign</F>(tx)</Line>
    </>
  ),
  Python: (
    <>
      <Line n={1}><K>from</K> tx3_indigo <K>import</K> <F>swap</F></Line>
      <Line n={2} />
      <Line n={3}><C>{`# Production endpoint, managed provider`}</C></Line>
      <Line n={4}>tx = <K>await</K> <F>swap</F>(</Line>
      <Line n={5}>{'  '}<P>quantity</P>=<N>1_000</N>,</Line>
      <Line n={6}>{'  '}<P>price</P>=<F>ada</F>(<N>420</N>),</Line>
      <Line n={7}>)</Line>
      <Line n={8} />
      <Line n={9}><K>await</K> wallet.<F>sign</F>(tx)</Line>
    </>
  ),
};

export function CodeCard() {
  const [active, setActive] = useState<Language>('TypeScript');

  return (
    <div className="relative w-full lg:w-[480px]">
      <div className="absolute -inset-4 bg-primary-600/10 blur-3xl rounded-full pointer-events-none" aria-hidden />
      <div className="relative bg-woodsmoke-950/80 backdrop-blur border border-woodsmoke-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-woodsmoke-800">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <FileCode width={14} height={14} className="text-primary-400" />
            <span className="font-medium">SDK</span>
          </div>
          <div className="flex items-center gap-0.5 text-[11px]">
            {LANGUAGES.map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => setActive(lang)}
                className={clsx(
                  'px-2.5 py-1 rounded-md transition-colors cursor-pointer',
                  active === lang
                    ? 'bg-woodsmoke-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <div className="px-1.5 py-4 overflow-x-auto custom-scrollbar font-mono text-[13px] leading-6 text-zinc-200">
          {SNIPPETS[active]}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-woodsmoke-800 text-xs">
          <span className="text-zinc-500">
            Generated from: <span className="text-zinc-300">transfer.tx3</span>
          </span>
          <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-300/10 border border-emerald-300/20 rounded-full px-2.5 py-0.5 text-[10px] tracking-[1px] uppercase font-semibold">
            <span className="size-1.5 rounded-full bg-emerald-300" />
            MCP Ready
          </span>
        </div>
      </div>
    </div>
  );
}

function Line({ n, children }: { n: number; children?: React.ReactNode; }) {
  return (
    <div className="grid grid-cols-[2.25rem_1fr] gap-3 px-3 hover:bg-white/[0.015]">
      <span className="text-right text-zinc-700 select-none">{n}</span>
      <span className="whitespace-pre">{children ?? ' '}</span>
    </div>
  );
}

// Token spans for lightweight syntax highlighting
function K({ children }: { children: React.ReactNode; }) { return <span className="text-primary-400">{children}</span>; }
function V({ children }: { children: React.ReactNode; }) { return <span className="text-blue-300">{children}</span>; }
function S({ children }: { children: React.ReactNode; }) { return <span className="text-emerald-300">{children}</span>; }
function C({ children }: { children: React.ReactNode; }) { return <span className="text-zinc-600 italic">{children}</span>; }
function F({ children }: { children: React.ReactNode; }) { return <span className="text-amber-300">{children}</span>; }
function N({ children }: { children: React.ReactNode; }) { return <span className="text-rose-400">{children}</span>; }
function P({ children }: { children: React.ReactNode; }) { return <span className="text-zinc-200">{children}</span>; }
