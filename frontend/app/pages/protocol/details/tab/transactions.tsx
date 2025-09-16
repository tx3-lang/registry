import React, { useState } from 'react';
import { TRPClient } from 'tx3-trp';
import type { TxEnvelope, ProtoTx } from 'tx3-trp';

import { Button } from '~/components/ui/Button';

interface Props {
  protocol: Protocol;
}

interface TransactionProps {
  tx: Tx;
}

const Transaction: React.FunctionComponent<TransactionProps> = props => {
  const [tryMode, setTryMode] = useState<boolean>(false);
  const [parameters, setParameters] = useState<Record<string, string | number>>({});
  const [response, setResponse] = useState<string | null>(null);

  const updateParameter = (key: string, type: string, value: string) => {
    setParameters({ ...parameters, [key]: type === 'Int' ? parseInt(value) : value });
  };

  const handleExecute = async () => {
    const protoTx: ProtoTx = {
      tir: {
        encoding: 'hex',
        version: props.tx.tirVersion,
        bytecode: props.tx.tir,
      },
      args: parameters,
    };

    const result = await resolveTx(protoTx).catch(error => {
      // eslint-disable-next-line no-console
      console.error(error);
      // eslint-disable-next-line no-console
      console.error(error.cause);
      setResponse(`${error.message}${error.cause ? `\n(${error.cause})` : ''}`);
    });

    if (result) {
      setResponse(result.tx);
    }
  };

  const resolveTx = async (tx: ProtoTx): Promise<TxEnvelope> => {
    const client = new TRPClient({
      endpoint: 'https://cardano-preview.trp-m1.demeter.run',
      headers: { 'dmtr-api-key': 'trpjodqbmjblunzpbikpcrl' },
    });

    return await client.resolve(tx);
  };

  return (
    <div className="bg-white/5 border border-[#3E3E3E] p-6 mb-8 rounded-md">
      <h3 className="text-xl font-semibold text-primary-400 mb-8">Transaction {props.tx.name}</h3>

      <div className="border border-[#3E3E3E] rounded-md">
        <div className="bg-white/5 py-3 px-4 flex justify-between items-center">
          <h3 className="text-lg text-white/80 flex-1">Parameters</h3>
          {!tryMode && (
            <div className="flex-none">
              <Button spacing="compact" weight="semibold" color="primary" text="small" onClick={() => setTryMode(true)}>
                Try it out
              </Button>
            </div>
          )}
          {tryMode && (
            <div className="flex-none">
              <Button spacing="compact" weight="semibold" color="white" text="small" className="inline-block mr-3" outlined onClick={() => setTryMode(false)}>
                Cancel
              </Button>
              <Button spacing="compact" weight="semibold" color="primary" text="small" className="inline-block" onClick={handleExecute}>
                Execute
              </Button>
            </div>
          )}
        </div>
        <div className="px-4 py-6">
          <p className="border-b border-b-white/10 text-white/30 text-base pb-1 flex">
            <span className="flex-1 basis-1/4">Name</span>
            {tryMode && (
              <span className="flex-1 basis-3/4">Values</span>
            )}
          </p>
          {Object.keys(props.tx.parameters).map((key, index) => (
            <div key={index} className="border-b border-b-white/10 py-3 flex">
              <div className="flex-1 basis-1/4">
                <p className="text-white text-base mb-1">
                  {key}
                </p>
                <p className="text-white/30 text-sm font-roboto">
                  {props.tx.parameters[key]}
                </p>
              </div>
              {tryMode && (
                <div className="flex-1 basis-3/4">
                  <input
                    type={props.tx.parameters[key] === 'Int' ? 'number' : 'text'}
                    className="w-full rounded-lg py-3 px-4 bg-white/5"
                    value={parameters[key]}
                    onChange={e => updateParameter(key, props.tx.parameters[key], e.target.value)}
                  />
                </div>
              )}
            </div>
          ),
          )}
        </div>
      </div>

      {response && (
        <div className="border border-[#3E3E3E] rounded-md mt-8">
          <div className="bg-white/5 py-3 px-4 flex justify-between items-center">
            <h3 className="text-lg text-white/80 flex-1">Response</h3>
          </div>
          <p className="p-4 font-roboto text-white text-wrap break-all">
            {response}
          </p>
        </div>
      )}
    </div>
  );
};

export function TabTransactions({ protocol }: Props) {
  return (
    <div>
      {protocol.transactions.map((tx, index) =>
        <Transaction key={index} tx={tx} />,
      )}
    </div>
  );
}
