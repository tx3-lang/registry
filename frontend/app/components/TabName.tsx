import type { ReactNode } from 'react';

interface TabProps {
  icon?: ReactNode;
  name: string;
  onClick?: () => void;
  active?: boolean;
}

export function TabName({ icon, name, onClick, active }: TabProps) {
  return (
    <button
      data-active={active}
      type="button"
      className="flex items-center px-3 py-2 gap-2 text-zinc-500 data-[active=true]:text-zinc-50 cursor-pointer transition-colors duration-300 hover:text-zinc-300"
      onClick={onClick}
    >
      {icon}
      <span>{name}</span>
    </button>
  );
}
