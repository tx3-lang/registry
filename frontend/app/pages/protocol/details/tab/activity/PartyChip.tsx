import { truncateHex } from '~/lib/tracker/lifted';

interface Props {
  name: string;
  address: string;
  role?: string;
}

export function PartyChip({ name, address, role }: Props) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
      <span className="font-medium text-zinc-50">{name}</span>
      <span className="font-mono text-zinc-500">{truncateHex(address)}</span>
      {role
        ? <span className="text-[10px] uppercase tracking-wide text-zinc-600">{role}</span>
        : null}
    </span>
  );
}
