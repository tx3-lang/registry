import clsx from 'clsx';
import { useMemo } from 'react';

// Utils
import { highlighter } from '~/utils/shiki';

interface CodeBlockProps {
  className?: string;
  code: string;
  // To include new languages, update `utils/shiki.ts`
  lang?: 'tx3';
}

export function CodeBlock({ className, code, lang = 'tx3' }: CodeBlockProps) {
  const htmlCode = useMemo(() => highlighter.codeToHtml(code, {
    lang,
    theme: 'aurora-x',
    transformers: [{
      pre(node) {
        node.properties.class = clsx(node.properties.class, 'text-sm font-mono', className);
        delete node.properties.style;
      },
    }],

  }), [className, code, lang]);

  return (
    <div
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Needed
      dangerouslySetInnerHTML={{ __html: htmlCode }}
    />
  );
}
