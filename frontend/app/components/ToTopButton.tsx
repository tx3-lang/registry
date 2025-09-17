import { useEffect, useState } from 'react';
import clsx from 'clsx';

// Components
import { Button } from '~/components/ui/Button';
import { ChevronUpIcon } from './icons/chevron-up';

export function ToTopButton() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > window.innerHeight / 2);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <Button
      spacing="icon"
      type="button"
      color="primary"
      className={clsx(
        'rounded-full p-4 fixed bottom-18 transition-opacity duration-300 right-14',
        'xl:right-auto xl:left-1/2 xl:translate-x-[calc(720px-56px-100%)]',
        { 'opacity-100': isScrolled, 'opacity-0': !isScrolled },
      )}
      onClick={() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <ChevronUpIcon width="28" height="28" />
    </Button>
  );
}
