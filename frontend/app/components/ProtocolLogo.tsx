import { useState } from 'react';
import clsx from 'clsx';

interface ProtocolLogoProps {
  scope: string;
  name: string;
  size: 'sm' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<ProtocolLogoProps['size'], string> = {
  sm: 'w-10 h-10 text-base',
  lg: 'w-16 h-16 text-2xl',
};

function initialsFor(scope: string, name: string): string {
  const head = (name || scope || '?').trim();
  return head.slice(0, 2).toUpperCase();
}

// Renders the protocol logo by hitting the same-origin
// `/api/protocols/:scope/:name/logo` resource route. The backend serves PNG
// bytes from the OCI artifact or 404 when no logo layer was attached at
// publish time. On any non-OK response we fall back to a placeholder so the
// card layout is stable whether or not the publisher shipped a logo.
export function ProtocolLogo({ scope, name, size, className }: ProtocolLogoProps) {
  const [failed, setFailed] = useState(false);

  const wrapper = clsx(
    SIZE_CLASSES[size],
    'shrink-0 rounded-md bg-woodsmoke-900 border border-zinc-800 overflow-hidden flex items-center justify-center',
    className,
  );

  if (failed) {
    return (
      <div className={wrapper}>
        <span className="font-semibold text-zinc-400">{initialsFor(scope, name)}</span>
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <img
        src={`/api/protocols/${encodeURIComponent(scope)}/${encodeURIComponent(name)}/logo`}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
