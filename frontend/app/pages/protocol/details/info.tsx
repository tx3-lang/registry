import clsx from 'clsx';
import dayjs from 'dayjs';

import { GitIcon } from '~/components/icons/git';

interface Props {
  className?: string;
  protocol: Protocol;
}

function CommonDetails({ label, value }: { label: string; value: string; }) {
  return (
    <>
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </>
  );
}

export function Info({ protocol, className }: Props) {
  return (
    <div className={clsx('flex flex-col gap-8 w-full', className)}>
      <p className="text-2xl font-semibold text-zinc-50">{protocol.name}</p>

      <div>
        <p className="text-zinc-500">Published by</p>
        <p className="mt-2 text-lg text-primary-600">@{protocol.scope}</p>
      </div>

      {protocol.repositoryUrl && (
        <div>
          <p className="text-zinc-500">Repository</p>
          <a href={protocol.repositoryUrl} className="w-fit mt-2 text-zinc-100 flex items-center gap-2" target="_blank" rel="noreferrer">
            <GitIcon width="20" height="20" />
            <span className="underline">{protocol.repositoryUrl.replace(/http(s)?:\/\//i, '')}</span>
          </a>
        </div>
      )}

      {/* <div>
        <p className="text-zinc-500">Install</p>
        <p className="w-fit mt-2 px-4 py-2.5 flex items-center gap-3 font-mono rounded-lg border border-zinc-800">
          <span>trix install {protocol.scope}/{protocol.name}</span>
          <button
            type="button"
            className="cursor-pointer text-zinc-500"
            onClick={() => navigator.clipboard.writeText(`trix install ${protocol.scope}/${protocol.name}`)}
          >
            <CopyIcon width="18" height="18" />
          </button>
        </p>
      </div> */}

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <CommonDetails
          label="Publication date"
          value={`Published ${protocol.publishedDate ? dayjs(new Date(protocol.publishedDate * 1000)).fromNow() : ''}`}
        />
      </div>

    </div>
  );
}
