import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

export type SupportedLanguages = 'tx3' | 'typescript' | 'python' | 'rust' | 'go' | 'bash' | 'toml';

// To include new languages, add them to the `langs` array below.
// See https://shiki.matsu.io/languages for available languages.
// For custom languages, see https://shiki.matsu.io/guide/load-lang
// and add the corresponding JSON file to the `app/utils` folder.

export const highlighter = await createHighlighterCore({
  themes: [
    import('shiki/themes/aurora-x.mjs'),
  ],
  langs: [
    import('./tx3.tmLanguage.json'),
    import('shiki/langs/typescript.mjs'),
    import('shiki/langs/python.mjs'),
    import('shiki/langs/rust.mjs'),
    import('shiki/langs/go.mjs'),
    import('shiki/langs/bash.mjs'),
    import('shiki/langs/toml.mjs'),
  ],
  // `shiki/wasm` contains the wasm binary inlined as base64 string.
  engine: createOnigurumaEngine(import('shiki/wasm')),
});
