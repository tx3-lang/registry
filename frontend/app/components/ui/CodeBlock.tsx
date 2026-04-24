import clsx from 'clsx';
import { useMemo } from 'react';

// Utils
import { highlighter, type SupportedLanguages } from '~/utils/shiki';
import { CopyButton } from './CopyButton';

interface CodeBlockProps {
  className?: string;
  code: string;
  // To include new languages, update `utils/shiki.ts`
  lang?: SupportedLanguages;
  // When true (default), shows a copy-to-clipboard button anchored to the
  // top-right corner of the block.
  copyable?: boolean;
}

export function CodeBlock({ className, code, lang = 'tx3', copyable = true }: CodeBlockProps) {
  const htmlCode = useMemo(() => highlighter.codeToHtml(code, {
    lang,
    theme: 'aurora-x',
    transformers: [{
      pre(node) {
        node.properties.class = clsx(node.properties.class, 'font-mono overflow-x-auto', className);
        delete node.properties.style;
      },
    }],

  }), [className, code, lang]);

  return (
    <div className="group relative">
      <div
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Needed
        dangerouslySetInnerHTML={{ __html: htmlCode }}
      />
      {copyable && (
        <CopyButton
          text={code}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150"
        />
      )}
    </div>
  );
}
