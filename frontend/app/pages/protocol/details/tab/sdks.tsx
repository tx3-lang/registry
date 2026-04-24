import { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';

import typescriptReadme from './sdks/typescript-readme.md?raw';
import rustReadme from './sdks/rust-readme.md?raw';
import goReadme from './sdks/go-readme.md?raw';
import pythonReadme from './sdks/python-readme.md?raw';

type SDKKey = 'typescript' | 'rust' | 'go' | 'python';

interface SDKDef {
  key: SDKKey;
  name: string;
  title: string;
  icon: React.ReactNode;
  readme: string;
}

const sdks: SDKDef[] = [
  {
    key: 'typescript',
    name: 'TypeScript',
    title: 'TypeScript SDK',
    icon: <img src="/images/sdks/typescript.png" className="w-8 h-8" />,
    readme: typescriptReadme,
  },
  {
    key: 'rust',
    name: 'Rust',
    title: 'Rust SDK',
    icon: <img src="/images/sdks/rust.png" className="w-8 h-8" />,
    readme: rustReadme,
  },
  {
    key: 'go',
    name: 'Go',
    title: 'Go SDK',
    icon: <img src="/images/sdks/go.png" className="w-8 h-8" />,
    readme: goReadme,
  },
  {
    key: 'python',
    name: 'Python',
    title: 'Python SDK',
    icon: <img src="/images/sdks/python.png" className="w-8 h-8" />,
    readme: pythonReadme,
  },
];

const markdownComponents = {
  h1: 'h2',
  h2: 'h3',
  h3: 'h4',
  h4: 'h5',
} as const;

// Splits a SDK README into the content before the Quick start section, the
// Quick start section itself (heading included), and everything after it.
// The Quick start section will be replaced by a protocol-aware snippet, so
// this keeps the two concerns decoupled.
function splitAtQuickStart(md: string): { before: string; quickStart: string; after: string; } {
  const lines = md.split('\n');
  const startIdx = lines.findIndex(line => /^##\s+Quick start\b/i.test(line));
  if (startIdx === -1) return { before: md, quickStart: '', after: '' };

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  return {
    before: lines.slice(0, startIdx).join('\n').trimEnd(),
    quickStart: lines.slice(startIdx, endIdx).join('\n').trim(),
    after: lines.slice(endIdx).join('\n').trimStart(),
  };
}

function SidebarLabel({ children }: { children: React.ReactNode; }) {
  return (
    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 mb-2">
      {children}
    </p>
  );
}

interface SdkButtonProps {
  sdk: SDKDef;
  active: boolean;
  onClick: () => void;
}

function SdkButton({ sdk, active, onClick }: SdkButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={clsx(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-left transition-colors cursor-pointer',
        'border border-transparent',
        active
          ? 'bg-zinc-900 text-zinc-50 border-l-2 border-l-blue-400 rounded-l-none'
          : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200',
      )}
    >
      <span className={clsx('shrink-0', !active && 'opacity-75 grayscale')}>
        {sdk.icon}
      </span>
      <span>{sdk.name}</span>
    </button>
  );
}

interface QuickStartProps {
  sdk: SDKDef;
  protocol: Protocol;
  fallbackMarkdown: string;
}

// TODO: replace with a protocol-aware snippet generated from `protocol`
// (parties, profiles, first transaction, args). For now we render the static
// Quick start shipped in each SDK README so the layout stays stable.
function QuickStartSection({ fallbackMarkdown }: QuickStartProps) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {fallbackMarkdown}
    </Markdown>
  );
}

interface Props {
  protocol: Protocol;
}

export function TabSDKs({ protocol }: Props) {
  const [selectedKey, setSelectedKey] = useState<SDKKey>('typescript');
  const selected = sdks.find(s => s.key === selectedKey)!;

  const { before, quickStart, after } = useMemo(
    () => splitAtQuickStart(selected.readme),
    [selected.readme],
  );

  const markdownClasses = clsx(
    'w-full max-w-none prose prose-sm prose-tx3',
    'prose-headings:border-b prose-headings:border-zinc-800 prose-headings:pb-1.5',
    'prose-pre:whitespace-pre-wrap prose-pre:break-words',
  );

  return (
    <div className="container flex-1 flex gap-10 py-8">
      <aside className="w-56 shrink-0">
        <SidebarLabel>SDKs</SidebarLabel>
        <div className="flex flex-col gap-1">
          {sdks.map(sdk => (
            <SdkButton
              key={sdk.key}
              sdk={sdk}
              active={sdk.key === selectedKey}
              onClick={() => setSelectedKey(sdk.key)}
            />
          ))}
        </div>
      </aside>

      <section className="flex-1 min-w-0">
        <h2 className="text-2xl font-semibold text-zinc-50 mb-6">{selected.title}</h2>

        <div className={markdownClasses}>
          {before && (
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {before}
            </Markdown>
          )}

          <QuickStartSection sdk={selected} protocol={protocol} fallbackMarkdown={quickStart} />

          {after && (
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {after}
            </Markdown>
          )}
        </div>
      </section>
    </div>
  );
}
