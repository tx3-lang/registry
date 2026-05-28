import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Info
import { EmptyState } from '~/components/EmptyState';
import { Info } from '../info';
import { UNOFFICIAL_DISCLAIMER, UNOFFICIAL_SCOPE } from '../index';

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
        {protocol.readme
          ? (
            <div className={markdownClasses}>
              {isUnofficial && <UnofficialBanner />}
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
            </div>
          )
          : (
            <div className="w-full bg-woodsmoke-950 py-8 lg:pr-8">
              {isUnofficial && <UnofficialBanner />}
              <EmptyState
                title="No README"
                description="This Protocol doesn't have a README at the moment."
              />
            </div>
          )}
        <Info
          protocol={protocol}
          className="w-full lg:max-w-[400px] bg-zinc-950 border-t lg:border-t-0 lg:border-l border-zinc-800 p-6 lg:p-8"
        />
      </div>
    </div>
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
