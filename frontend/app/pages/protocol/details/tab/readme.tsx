import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Info
import { EmptyState } from '~/components/EmptyState';
import { Info } from '../info';

interface Props {
  protocol: Protocol;
}

export function TabReadme({ protocol }: Props) {
  const markdownClasses = 'w-full max-w-none bg-woodsmoke-950 py-8 pr-8 prose prose-sm prose-tx3' // Base
    + ' prose-headings:border-b prose-headings:border-zinc-800 prose-headings:pb-1.5' // Headings
    + ' prose-pre:whitespace-pre-wrap prose-pre:break-words'; // Preformatted

  return (
    <div className="bg-zinc-950 flex flex-col flex-1">
      <div className="flex container flex-1 bg-gradient-to-r from-woodsmoke-950 from-50% to-zinc-950 to-50%">
        {protocol.readme
          ? (
            <div className={markdownClasses}>
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
            <EmptyState
              title="No README"
              description="This Protocol doesn't have a README at the moment."
              className="w-full bg-woodsmoke-950"
            />
          )}
        <Info protocol={protocol} className="max-w-[400px] bg-zinc-950 border-l border-zinc-800 p-8" />
      </div>
    </div>
  );
}
