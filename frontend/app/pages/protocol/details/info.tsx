import clsx from 'clsx';
import dayjs from 'dayjs';

import { CopyIcon } from '~/components/icons/copy';
import { GitIcon } from '~/components/icons/git';

interface Props {
  className?: string;
  protocol: Protocol;
}

function CommonDetails({ label, value }: { label: string; value: string; }) {
  return (
    <div>
      <span className="text-white/30">{label}</span>
      <span className="text-white/50 ml-4">{value}</span>
    </div>
  );
}

export function Info({ protocol, className }: Props) {
  return (
    <div className={clsx('grid grid-cols-1 gap-8 w-full', className)}>
      <p className="text-2xl font-semibold">{protocol.name}</p>

      <div>
        <p className="text-white/50">Published by</p>
        <p className="mt-4 text-primary-400">@{protocol.scope}</p>
      </div>

      {protocol.repositoryUrl && (
        <div>
          <p className="text-white/50">Repository</p>
          <a href={protocol.repositoryUrl} className="w-fit mt-4 text-white flex items-center gap-2.5" target="_blank" rel="noreferrer">
            <GitIcon width="15" height="15" />
            <span className="underline">{protocol.repositoryUrl.replace(/http(s)?:\/\//i, '')}</span>
          </a>
        </div>
      )}

      <div>
        <p className="text-white/50">Install</p>
        <p className="w-fit mt-4 px-8 py-4 flex items-center gap-3 font-roboto bg-linear-to-b from-[#434343]/35 to-transparent rounded-lg backdrop-blur-[14.605px]">
          <span>trix install {protocol.scope}/{protocol.name}</span>
          <button type="button" onClick={() => navigator.clipboard.writeText(`trix install ${protocol.scope}/${protocol.name}`)}>
            <CopyIcon />
          </button>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <CommonDetails
          label="Publication date"
          value={`Published ${protocol.publishedDate ? dayjs(new Date(protocol.publishedDate * 1000)).fromNow() : ''}`}
        />
      </div>

    </div>
  );
}
