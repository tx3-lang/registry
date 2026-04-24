import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { CopyIcon } from '~/components/icons/copy';

interface Props {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: Props) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — silently ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 text-xs rounded-md cursor-pointer transition-colors',
        'bg-zinc-900/80 border backdrop-blur-sm',
        copied
          ? 'text-emerald-400 border-emerald-900/60'
          : 'text-zinc-400 border-zinc-800 hover:text-zinc-100 hover:border-zinc-700',
        className,
      )}
    >
      <CopyIcon width="14" height="14" />
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
