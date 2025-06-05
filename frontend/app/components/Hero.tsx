import clsx from 'clsx';
import { SearchBar } from '~/components/SearchBar';

interface Props {
  className?: string;
  onSearch?: (search: string) => void;
}

export function Hero({ className, onSearch }: Props) {
  return (
    <section className={clsx(className)}>
      <h1 className="text-4xl font-bold text-center">Registry for UTxO Protocols</h1>
      <SearchBar className="mt-14 mx-auto  max-w-[836px]" onSearch={onSearch} />
    </section>
  );
}
