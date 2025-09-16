import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  readme: string | null;
}

export function TabReadme({ readme }: Props) {
  if (!readme || readme.length === 0) {
    return null;
  }

  return (

    <div className="bg-white/5 p-4 rounded-xl mt-8 prose prose-invert max-w-none prose-headings:border-b prose-headings:border-b-white/20 prose-headings:pb-1.5 prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:font-roboto">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: 'h2',
          h2: 'h3',
          h3: 'h4',
          h4: 'h5',
        }}
      >
        {readme}
      </Markdown>
    </div>
  );
}
