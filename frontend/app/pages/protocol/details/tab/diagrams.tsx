interface Props {
  protocol: Protocol;
}

export function TabDiagrams({ protocol }: Props) {
  return (
    <div className="container flex-1 py-8">
      {protocol.transactions.map(tx => (
        <div key={tx.name} className="bg-zinc-950 border border-zinc-800 px-8 py-6 rounded-md mt-8 first:mt-0">
          {/* <h3 className="text-lg font-semibold text-zinc-50 mb-4">{tx.name}</h3> */}
          {tx.svg && (
            <div dangerouslySetInnerHTML={{ __html: tx.svg }} />
          )}
        </div>
      ))}
    </div>
  );
}
