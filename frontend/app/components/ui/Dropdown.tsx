import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

// Components
import { ChevronDownIcon } from '~/components/icons/chevron-down';

interface Props {
  label?: string;
  value: string;
  showValue?: boolean;
  options: { label: string; value: string; }[];
  onOptionSelected?: (value: string) => void;
}

export function Dropdown({ label, value, showValue, options, onOptionSelected }: Props) {
  const [activeOption, setActiveOption] = useState(options.find(option => option.value === value));

  useEffect(() => {
    if (value !== activeOption?.value) {
      setActiveOption(options.find(option => option.value === value));
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Menu as="div">
      <MenuButton className="flex flex-row gap-3 py-2.5 px-4 rounded-lg items-center text-sm border text-zinc-500 border-zinc-800 cursor-pointer">
        {!!label && (
          <span>{label}</span>
        )}
        {(showValue && activeOption) && (
          <span className="text-zinc-100">{activeOption?.label}</span>
        )}
        <ChevronDownIcon width="18" height="18" />
      </MenuButton>
      <MenuItems anchor="bottom end" className="bg-woodsmoke-950 border border-zinc-900 rounded-xl p-4 z-10 shadow-[0px_0px_12.3px_0px_rgba(250,250,250,0.08)] flex flex-col gap-2 text-zinc-300 min-w-64 mt-1 outline-0 custom-scrollbar">
        {options.map(option => (
          <MenuItem key={option.value}>
            <button
              type="button"
              className={clsx(
                'text-left py-2 px-2.5 rounded-lg transition-all hover:bg-woodsmoke-900 hover:font-semibold cursor-pointer',
                { 'text-primary-500 font-semibold': option.value === activeOption?.value },
              )}
              onClick={() => {
                setActiveOption(option);
                onOptionSelected?.(option.value);
              }}
            >
              {option.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
