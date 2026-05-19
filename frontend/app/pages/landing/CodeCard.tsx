import { useState } from 'react';
import clsx from 'clsx';
import { ArrowRightIcon } from '~/components/icons/arrow-right';
import { CodeBlock } from '~/components/ui/CodeBlock';
import type { SupportedLanguages } from '~/utils/shiki';

const LANGUAGES = ['TypeScript', 'Rust', 'Go', 'Python'] as const;
type Language = typeof LANGUAGES[number];

const SHIKI_LANG: Record<Language, SupportedLanguages> = {
  TypeScript: 'typescript',
  Rust: 'rust',
  Go: 'go',
  Python: 'python',
};

const SNIPPETS: Record<Language, string> = {
  TypeScript: `import { swap } from "@tx3/indigo";

// Production endpoint, managed provider
const tx = await swap({
  quantity: 1_000,
  price:    ada(420),
});

await wallet.sign(tx);`,
  Rust: `use tx3_indigo::swap;

// Production endpoint, managed provider
let tx = swap(SwapArgs {
  quantity: 1_000,
  price:    ada(420),
}).await?;

wallet.sign(&tx).await?;`,
  Go: `import "github.com/tx3/indigo"

// Production endpoint, managed provider
tx, err := indigo.Swap(indigo.SwapArgs{
  Quantity: 1_000,
  Price:    indigo.Ada(420),
})

wallet.Sign(tx)`,
  Python: `from tx3_indigo import swap

# Production endpoint, managed provider
tx = await swap(
  quantity=1_000,
  price=   ada(420),
)

await wallet.sign(tx)`,
};

export function CodeCard() {
  const [active, setActive] = useState<Language>('TypeScript');

  return (
    <div className="w-full lg:w-[564px] bg-woodsmoke-950 border border-[#232326] rounded-2xl overflow-hidden">
      <div className="flex items-center h-11 bg-[#151519] pl-4 pr-[18px]">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-xl leading-none">◆</span>
          <span className="text-[11px] font-semibold tracking-[1.4px] text-zinc-500">SDK</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {LANGUAGES.map(lang => (
            <button
              key={lang}
              type="button"
              onClick={() => setActive(lang)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-[11px] leading-4 transition-colors cursor-pointer',
                active === lang
                  ? 'bg-woodsmoke-950 border border-[#232326] text-zinc-50 font-semibold'
                  : 'text-zinc-500 font-medium hover:text-zinc-300 border border-transparent',
              )}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-woodsmoke-950 h-[244px] pt-5 pb-3 px-6 overflow-hidden">
        <CodeBlock
          code={SNIPPETS[active]}
          lang={SHIKI_LANG[active]}
          copyable={false}
          className="code-card-block !bg-transparent !p-0 !m-0 text-[13px] leading-[22px]"
        />
      </div>

      <div className="flex items-center justify-between h-[52px] bg-[#151519] border-t border-[#232326] px-[18px]">
        <div className="flex items-center gap-2 text-[11px]">
          <ArrowRightIcon width={12} height={12} className="text-zinc-500" />
          <span className="text-zinc-500 font-medium tracking-[0.4px]">Generated from</span>
          <span className="text-zinc-400 font-semibold">transfer.tx3</span>
        </div>
        <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-300/15 rounded-full px-2 py-0.5 text-[10px] tracking-[0.6px] uppercase font-semibold">
          <span className="size-1 rounded-full bg-emerald-300" />
          MCP · soon
        </span>
      </div>
    </div>
  );
}
