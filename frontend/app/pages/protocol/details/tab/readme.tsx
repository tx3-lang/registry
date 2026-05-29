import clsx from 'clsx';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import Markdown from 'react-markdown';
import { Link } from 'react-router';
import remarkGfm from 'remark-gfm';

// Info
import { EmptyState } from '~/components/EmptyState';
import { ChevronDownIcon } from '~/components/icons/chevron-down';
import { Info } from '../info';
import { UNOFFICIAL_DISCLAIMER, UNOFFICIAL_SCOPE } from '../index';
import { txAnchor } from './protocol';

interface Props {
  protocol: Protocol;
}

export function TabReadme({ protocol }: Props) {
  const markdownClasses = 'w-full max-w-none min-w-0 bg-woodsmoke-950 py-8 lg:pr-8 prose prose-sm prose-tx3' // Base
    + ' prose-headings:border-b prose-headings:border-zinc-800 prose-headings:pb-1.5' // Headings
    + ' prose-pre:whitespace-pre-wrap prose-pre:break-words'; // Preformatted

  const isUnofficial = protocol.scope === UNOFFICIAL_SCOPE;

  return (
    <div className="bg-zinc-950 flex flex-col flex-1">
      <div className="flex flex-col lg:flex-row container flex-1 bg-woodsmoke-950 lg:bg-gradient-to-r lg:from-woodsmoke-950 lg:from-50% lg:to-zinc-950 lg:to-50%">
        <div className={markdownClasses}>
          {isUnofficial && <UnofficialBanner />}
          {protocol.readme
            ? (
              <CollapsibleReadme>
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: 'h2',
                    h2: 'h3',
                    h3: 'h4',
                    h4: 'h5',
                  }}
                >
                  {protocol.readme}
                </Markdown>
              </CollapsibleReadme>
            )
            : (
              <EmptyState
                title="No README"
                description="This Protocol doesn't have a README at the moment."
              />
            )}
          {protocol.transactions.length > 0 && <TransactionsList transactions={protocol.transactions} />}
        </div>
        <Info
          protocol={protocol}
          className="w-full lg:max-w-[400px] bg-zinc-950 border-t lg:border-t-0 lg:border-l border-zinc-800 p-6 lg:p-8"
        />
      </div>
    </div>
  );
}

// Height tuned to comfortably show a heading and a couple of paragraphs.
const COLLAPSED_HEIGHT_PX = 240;

function CollapsibleReadme({ children }: PropsWithChildren) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setIsOverflowing(el.scrollHeight > COLLAPSED_HEIGHT_PX + 16);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clamp = isOverflowing && !isExpanded;

  return (
    <>
      <div
        ref={contentRef}
        className="relative overflow-hidden"
        style={{ maxHeight: clamp ? `${COLLAPSED_HEIGHT_PX}px` : 'none' }}
      >
        {children}
        {clamp && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-woodsmoke-950"
          />
        )}
      </div>
      {isOverflowing && (
        <div className="not-prose mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setIsExpanded(v => !v)}
            aria-expanded={isExpanded}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer"
          >
            {isExpanded ? 'Show less' : 'Show more'}
            <ChevronDownIcon
              width="16"
              height="16"
              className={clsx('transition-transform duration-200', isExpanded && 'rotate-180')}
            />
          </button>
        </div>
      )}
    </>
  );
}

function TransactionsList({ transactions }: { transactions: Tx[] }) {
  return (
    <section className="not-prose mt-12">
      <h2 className="text-lg font-semibold text-white mb-4">Transactions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {transactions.map(tx => (
          <Link
            key={tx.name}
            to={`?activeTab=protocol#${txAnchor(tx.name)}`}
            className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700 hover:bg-zinc-900/70 transition-colors"
          >
            <h3 className="font-mono text-sm font-semibold text-white">{tx.name}</h3>
            {tx.description && (
              <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">{tx.description}</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function UnofficialBanner() {
  return (
    <div
      role="alert"
      className="not-prose mb-8 border-l-6 border-amber-700 bg-amber-950/20 rounded-md px-4 py-3 text-sm"
    >
      <h3 className="font-mono font-semibold text-amber-500 mb-1">Unofficial protocol</h3>
      <p className="text-zinc-300">{UNOFFICIAL_DISCLAIMER}</p>
    </div>
  );
}
