import clsx from 'clsx';

interface Props {
  className?: string;
  title: string;
  description: string;
}

export function EmptyState({ className, title, description }: Props) {
  return (
    <div className={clsx('flex flex-col justify-center items-center gap-3', className)}>
      <h2 className="text-lg font-medium text-zinc-50">{title}</h2>
      <p className="text-zinc-500">
        {description}
      </p>
    </div>
  );
}
