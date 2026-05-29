import clsx from 'clsx';
import { SearchBar } from '~/components/SearchBar';

interface Props {
  className?: string;
  onSearch?: (search: string) => void;
}

export function Hero({ className, onSearch }: Props) {
  return (
    <section className={clsx('px-4 sm:px-8', className)}>
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center tracking-wide">UTxO Protocol Registry</h1>
      <SearchBar className="mt-8 mx-auto max-w-[836px]" onSearch={onSearch} />
    </section>
  );
}
