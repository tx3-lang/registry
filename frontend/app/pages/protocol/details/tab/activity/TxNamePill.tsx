interface Props {
  name: string;
}

export function TxNamePill({ name }: Props) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary-600/10 px-2 py-0.5 text-xs font-semibold text-primary-600">
      {name}
    </span>
  );
}
