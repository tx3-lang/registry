import clsx from 'clsx';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CopyIcon } from '../icons/copy';
import { Button } from './Button';

interface AlertProps extends PropsWithChildren {
  type: 'success' | 'error';
  title?: string;
  className?: string;
  textToCopy?: string;
}

export function Alert({ type, children, className, textToCopy, title }: AlertProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [showGradients, setShowGradients] = useState({
    top: false,
    bottom: false,
  });

  useEffect(() => {
    const checkScroll = () => {
      if (contentRef.current) {
        const element = contentRef.current;
        const hasVerticalScroll = element.scrollHeight > element.clientHeight;
        const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
        const isAtTop = element.scrollTop === 0;

        setShowGradients({
          top: hasVerticalScroll && !isAtTop,
          bottom: hasVerticalScroll && !isAtBottom,
        });
      }
    };

    const handleScroll = () => {
      checkScroll();
    };

    checkScroll();

    // Observar cambios en el contenido
    const observer = new ResizeObserver(checkScroll);
    if (contentRef.current) {
      observer.observe(contentRef.current);
      contentRef.current.addEventListener('scroll', handleScroll);
    }

    return () => {
      observer.disconnect();
      if (contentRef.current) {
        contentRef.current.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  return (
    <div
      className={clsx(
        'w-full border-l-6 px-4.5 rounded-md break-words text-zinc-400 flex flex-col relative',
        {
          'border-emerald-800 bg-emerald-950/20': type === 'success',
          'border-rose-800 bg-rose-950/20': type === 'error',
        },
        className,
      )}
    >
      {(title || textToCopy) && (
        <div className="flex justify-between items-center py-2">
          <h3
            className={clsx('font-mono font-semibold', {
              'text-emerald-600': type === 'success',
              'text-rose-600': type === 'error',
            })}
          >
            {title}
          </h3>
          {!!textToCopy && (
            <Button
              type="button"
              variant="ghost"
              color="zinc"
              size="s"
              className="text-zinc-400"
              onClick={() => navigator.clipboard.writeText(textToCopy)}
            >
              Copy
              <CopyIcon width="20" height="20" />
            </Button>
          )}
        </div>
      )}
      <div className="relative min-h-0 pb-4">
        <div ref={contentRef} className="h-full overflow-auto pr-2 text-sm whitespace-pre-line">{children}</div>
        <div className={clsx(
          'absolute bottom-8.5 left-0 right-2 -top-4 pointer-events-none bg-gradient-to-b to-transparent transition-opacity duration-300 to-66%',
          showGradients.top ? 'opacity-100' : 'opacity-0',
          {
            'from-[#071010]': type === 'success',
            'from-[#16070E]': type === 'error',
          },
        )}
        />
        <div className={clsx(
          'absolute bottom-0 left-0 right-2 top-8.5 pointer-events-none bg-gradient-to-t to-transparent transition-opacity duration-300 to-66%',
          showGradients.bottom ? 'opacity-100' : 'opacity-0',
          {
            'from-[#071010]': type === 'success',
            'from-[#16070E]': type === 'error',
          },
        )}
        />
      </div>
    </div>
  );
}
