import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { twMerge } from 'tailwind-merge';

// Components
import { SearchIcon } from '~/components/icons/search';
import { TimesIcon } from '~/components/icons/times';

// Hooks
import { useDebounce } from '~/hooks/useDebounce';
import { useFetcherWithReset } from '~/hooks/useFetcherWithReset';

interface Props {
  className?: string;
  onSearch?: (search: string) => void;
  dark?: boolean;
}

function SearchResult({ protocol, onResultClick }: { protocol: Protocol; onResultClick?: () => void; }) {
  return (
    <Link
      to={`/protocol/${protocol.scope}/${protocol.name}`}
      className="hover:bg-woodsmoke-900 rounded-lg py-2 px-4 block text-zinc-300"
      onClick={onResultClick}
    >
      {protocol.name}
      <div className="mt-2 text-sm text-zinc-500">
        <span>@{protocol.scope}</span>
        <span> • </span>
        <span>v{protocol.version}</span>
      </div>
    </Link>
  );
}

export function SearchBar({ className, dark }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const searchRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcherWithReset<{ protocols: ProtocolConnection; }>({ key: 'search-fetcher' });

  useEffect(() => {
    if (debouncedSearch) {
      fetcher.load(`/api/search?q=${encodeURIComponent(debouncedSearch)}`);
    } else {
      fetcher.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const resetInput = () => {
    setSearch('');
    searchRef.current?.focus();
    fetcher.reset();
  };

  const { nodes } = fetcher.data?.protocols || { nodes: [] };

  return (
    <div className="flex items-center gap-14">
      <search className={twMerge('flex relative gap-8 w-full items-center text-zinc-400', className, dark && 'text-zinc-500')}>
        <SearchIcon className="absolute left-6 pointer-events-none" width="24" height="24" />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search protocols..."
          onChange={e => setSearch(e.target.value)}
          value={search}
          name="search-text"
          className={twMerge('text-lg w-full rounded-full py-2.5 px-15 text-zinc-800 placeholder:text-zinc-400 placeholder:text-lg placeholder:font-normal', dark && 'border border-zinc-800 placeholder:text-zinc-500 text-zinc-200 bg-transparent ring-zinc-500')}
        />
        <TimesIcon
          className={
            clsx(
              'absolute right-6 cursor-pointer transition-opacity duration-200',
              search ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )
          }
          width="24"
          height="24"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            resetInput();
          }}
        />
        {nodes.length > 0 && (
          <div className="absolute left-0 right-0 -bottom-1 bg-woodsmoke-950 border border-zinc-900 rounded-xl p-6 translate-y-full z-10 shadow-[0px_0px_12.3px_0px_rgba(250,250,250,0.08)]">
            <span className="text-zinc-600">Top results</span>
            <ul className="max-h-64 overflow-y-auto mt-4 custom-scrollbar">
              {nodes.map(protocol => (
                <li key={protocol.id} className="mt-1 first:mt-0">
                  <SearchResult protocol={protocol} onResultClick={resetInput} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </search>
    </div>
  );
}
