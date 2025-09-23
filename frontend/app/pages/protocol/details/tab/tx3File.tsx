// Info
import { EmptyState } from '~/components/EmptyState';
import { CodeBlock } from '~/components/ui/CodeBlock';

interface Props {
  protocol: Protocol;
}

export function TabTx3File({ protocol }: Props) {
  return (
    <div className="container py-8">
      {protocol.source
        ? (
          <CodeBlock code={protocol.source} className="bg-zinc-950 border border-zinc-800 rounded-md px-8 py-6" />
        )
        : (
          <EmptyState title="No Tx3 Source" description="No tx3 file available." />
        )}
    </div>
  );
}
