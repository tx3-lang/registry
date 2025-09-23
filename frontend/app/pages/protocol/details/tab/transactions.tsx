import React, { useState } from 'react';
import { TRPClient, type ProtoTxRequest, type ResolveResponse } from 'tx3-sdk/trp';

// Components
import { Alert } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';

// Config
import { TRP_PREVIEW } from '~/trp-config';

interface Props {
  protocol: Protocol;
}

interface TransactionProps {
  tx: Tx;
}

interface Response {
  type: 'success' | 'error';
  message: string;
}

function LoadingButton({ asyncOnClick }: { asyncOnClick: () => Promise<void>; }) {
  const [isLoading, setIsLoading] = useState(false);

  const onClick = async () => {
    setIsLoading(true);
    await asyncOnClick();
    setIsLoading(false);
  };

  return (
    <Button type="button" color="zinc" size="s" onClick={onClick} loading={isLoading}>
      {isLoading ? 'Executing...' : 'Execute'}
    </Button>
  );
}

const Transaction: React.FunctionComponent<TransactionProps> = props => {
  const [tryMode, setTryMode] = useState<boolean>(false);
  const [parameters, setParameters] = useState<Record<string, string | number>>({});
  const [response, setResponse] = useState<Response | null>(null);

  const updateParameter = (key: string, type: string, value: string) => {
    setParameters({ ...parameters, [key]: type === 'Int' ? parseInt(value) : value });
  };

  const handleExecute = async () => {
    const protoTx: ProtoTxRequest = {
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
      setResponse({
        type: 'error',
        message: `${error.message}\nCause: ${JSON.stringify(error.cause)}` || 'Unknown error',
      });
    });

    if (result) {
      setResponse({
        type: 'success',
        message: result.tx,
      });
    }
  };

  const resolveTx = async (tx: ProtoTxRequest): Promise<ResolveResponse> => {
    // TODO: allow user to select which trp endpoint to use in the future
    const client = new TRPClient(TRP_PREVIEW);

    return await client.resolve(tx);
  };

  return (
    <div className="flex gap-9">
      <div className="w-45">
        <h3 className="text-lg font-semibold text-zinc-50">{props.tx.name}</h3>
        {!!props.tx.description && (
          <p className="mt-3.5 text-zinc-600">
            {props.tx.description}
          </p>
        )}
      </div>

      <div className="w-full border border-zinc-800 bg-zinc-950 rounded-md">
        <div className="py-3 px-8 flex justify-between items-center border-b border-zinc-800">
          <h3 className="text-lg text-zinc-400">Parameters</h3>
          <div className="flex gap-5">
            {!tryMode
              ? (
                <Button type="button" variant="outlined" color="zinc" size="s" onClick={() => setTryMode(true)}>
                  Try it out
                </Button>
              )
              : (
                <>
                  <Button
                    type="button"
                    color="zinc"
                    variant="outlined"
                    size="s"
                    onClick={() => {
                      setTryMode(false);
                      setResponse(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <LoadingButton asyncOnClick={handleExecute} />
                </>
              )}
          </div>
        </div>
        <div className="px-8 py-5">
          <p className="border-b border-zinc-900 text-zinc-700 pb-1 flex">
            <span className="flex-1 basis-1/4">Name</span>
            <span className="flex-1 basis-3/4">Description</span>
          </p>
          {props.tx.parameters.map(param => (
            <div key={param.name} className="border-b last:border-b-0 border-zinc-900 flex py-4 last:pb-0 gap-1">
              <div className="flex-1 basis-1/4">
                <p className="text-zinc-50 text-base wrap-anywhere">
                  {param.name} <span className="text-rose-400">*</span>
                </p>
                <p className="text-zinc-600 text-sm font-mono mt-2">
                  {param.type}
                </p>
              </div>
              <div className="flex-1 basis-3/4 flex flex-col gap-3">
                {!!param.description && (
                  <p className="text-sm text-zinc-50">
                    {param.description}
                  </p>
                )}
                {tryMode && (
                  <input
                    type={param.type === 'Int' ? 'number' : 'text'}
                    className="w-full rounded-lg py-2.5 px-4 bg-woodsmoke-950 border border-zinc-800 text-zinc-100 text-sm"
                    value={parameters[param.name]}
                    onChange={e => updateParameter(param.name, param.type, e.target.value)}
                  />
                )}
              </div>
            </div>
          ),
          )}
        </div>

        {response && (
          <div className="px-8 py-6 max-h-55 flex">
            <Alert type={response.type} title="Response" textToCopy={response.message}>
              {response.message}
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
};

export function TabTransactions({ protocol }: Props) {
  return (
    <div className="container pt-8 pb-14 flex flex-col gap-8">
      {protocol.transactions.map(tx => (
        <Transaction key={tx.name} tx={tx} />
      ))}
    </div>
  );
}
