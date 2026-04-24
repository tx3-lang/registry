import React, { useState } from 'react';
import { TRPClient, type ProtoTxRequest, type ResolveResponse } from 'tx3-sdk/trp';

// Components
import { Alert } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Dropdown } from '~/components/ui/Dropdown';

// Config
import { getTrpForProfile } from '~/trp-config';

interface Props {
  protocol: Protocol;
}

interface TransactionProps {
  tx: Tx;
  profiles: Profile[];
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

function hasEnvironment(env: string | null | undefined): boolean {
  if (!env) return false;
  try {
    return Object.keys(JSON.parse(env)).length > 0;
  } catch {
    return false;
  }
}

function getDefaultProfile(profiles: Profile[]): string {
  const withInfo = profiles.find(p => p.parties.length > 0 || hasEnvironment(p.environment));
  if (withInfo) return withInfo.name;

  const mainnet = profiles.find(p => p.name === 'mainnet');
  if (mainnet) return mainnet.name;

  return profiles.length > 0 ? profiles[0].name : '';
}

const Transaction: React.FunctionComponent<TransactionProps> = props => {
  const [parameters, setParameters] = useState<Record<string, string | number>>({});
  const [response, setResponse] = useState<Response | null>(null);

  const hasProfiles = props.profiles.length > 0;
  const [selectedProfileName, setSelectedProfileName] = useState<string>(getDefaultProfile(props.profiles));
  const selectedProfile = props.profiles.find(p => p.name === selectedProfileName) ?? null;

  const profileOptions = props.profiles.map(p => ({
    label: p.name,
    value: p.name,
  }));

  const updateParameter = (key: string, type: string, value: string) => {
    setParameters({ ...parameters, [key]: type === 'Int' ? parseInt(value) : value });
  };

  const buildArgs = (): Record<string, string | number> => {
    const profileArgs: Record<string, string> = {};

    if (selectedProfile) {
      for (const party of selectedProfile.parties) {
        profileArgs[party.name] = party.address;
      }

      if (selectedProfile.environment) {
        try {
          const env = JSON.parse(selectedProfile.environment);
          for (const [key, value] of Object.entries(env)) {
            profileArgs[key] = String(value);
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    return { ...profileArgs, ...parameters };
  };

  const handleExecute = async () => {
    const protoTx: ProtoTxRequest = {
      tir: {
        encoding: 'hex',
        version: props.tx.tirVersion,
        content: props.tx.tir,
      },
      args: buildArgs(),
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
    const client = new TRPClient(getTrpForProfile(selectedProfileName));

    return await client.resolve(tx);
  };

  const getProfileValue = (paramName: string): string | undefined => {
    if (!selectedProfile) return undefined;

    const partyMatch = selectedProfile.parties.find(p => p.name === paramName);
    if (partyMatch) return partyMatch.address;

    if (selectedProfile.environment) {
      try {
        const env = JSON.parse(selectedProfile.environment);
        if (paramName in env) return String(env[paramName]);
      } catch {
        // ignore parse errors
      }
    }

    return undefined;
  };

  const getParameterValue = (paramName: string): string | number | undefined => {
    if (parameters[paramName] !== undefined) return parameters[paramName];
    return getProfileValue(paramName);
  };

  return (
    <div className="w-full border border-zinc-800 bg-zinc-950 rounded-md">
      <div className="py-3 px-8 flex justify-between items-center border-b border-zinc-800">
        <div>
          <h3 className="text-lg text-zinc-400">
            <span className="font-semibold text-zinc-50">{props.tx.name}</span> parameters
          </h3>
          {!!props.tx.description && (
            <p className="mt-3.5 text-zinc-600">
              {props.tx.description}
            </p>
          )}
        </div>
        <div className="flex gap-5 items-center">
          {hasProfiles && (
            <Dropdown
              label="Profile"
              showValue
              value={selectedProfileName}
              options={profileOptions}
              onOptionSelected={setSelectedProfileName}
            />
          )}
          <LoadingButton asyncOnClick={handleExecute} />
        </div>
      </div>
      <div className="px-8 py-5">
        <p className="border-b border-zinc-900 text-zinc-700 pb-1 flex">
          <span className="flex-1 basis-1/4">Name</span>
          <span className="flex-1 basis-3/4">Value</span>
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
              <input
                type={param.type === 'Int' ? 'number' : 'text'}
                className="w-full rounded-lg py-2.5 px-4 bg-woodsmoke-950 border border-zinc-800 text-zinc-100 text-sm"
                value={getParameterValue(param.name) ?? ''}
                onChange={e => updateParameter(param.name, param.type, e.target.value)}
              />
              {!!param.description && (
                <p className="text-xs text-zinc-400">
                  {param.description}
                </p>
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
  );
};

export function TabTryOut({ protocol }: Props) {
  const profiles = protocol.profiles ?? [];

  return (
    <div className="container pt-8 pb-14 flex flex-col gap-8">
      {protocol.transactions.map(tx => (
        <Transaction key={tx.name} tx={tx} profiles={profiles} />
      ))}
    </div>
  );
}
