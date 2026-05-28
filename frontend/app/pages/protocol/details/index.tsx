import { Link, useSearchParams } from 'react-router';
import clsx from 'clsx';

// Components
import { TabName } from '~/components/TabName';
import { SearchBar } from '~/components/SearchBar';
import { ToTopButton } from '~/components/ToTopButton';
import { Header } from '~/components/Header';
import { ProtocolLogo } from '~/components/ProtocolLogo';

// Icons
import { ArrowLeftIcon } from '~/components/icons/arrow-left';
import { InfoCircleIcon } from '~/components/icons/info-circle';
import { Stack2Icon } from '~/components/icons/stack-2';
import { CodeIcon } from '~/components/icons/code';
import { ChartDots3Icon } from '~/components/icons/chart-dots-3';
import { FileDescriptionIcon } from '~/components/icons/file-description';
import { FileCode } from '~/components/icons/file-code';
import { GraphIcon } from '~/components/icons/graph';

// Tabs
import { TabReadme } from './tab/readme';
import { TabTryOut } from './tab/tryOut';
import { TabTx3File } from './tab/tx3File';
import { TabProtocol } from './tab/protocol';
import { TabSDKs } from './tab/sdks';
import { TabActivity } from './tab/activity';

export const UNOFFICIAL_SCOPE = 'open-tx3';
export const UNOFFICIAL_DISCLAIMER
  = 'Preliminary, reverse-engineered version published by the tx3 team for testing and exploration. '
  + 'It is not endorsed by the original protocol authors. Do not use in mainnet.';

function UnofficialBadge() {
  return (
    <span className="group relative inline-flex items-center gap-1.5 rounded-sm border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-amber-300 font-mono text-sm">
      Unofficial
      <InfoCircleIcon width="16" height="16" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-80 rounded-md border border-zinc-800 bg-woodsmoke-950 p-3 text-xs font-sans font-normal text-zinc-300 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {UNOFFICIAL_DISCLAIMER}
      </span>
    </span>
  );
}

const validTabs = ['readme', 'protocol', 'tx3-file', 'try-out', 'sdks', 'activity'] as const;
type Tab = typeof validTabs[number];

function getValidTab(tab?: string): Tab {
  if (!tab) return 'readme';

  if (validTabs.includes(tab as Tab)) {
    return tab as Tab;
  }

  return 'readme';
}

interface ProtocolDetailsProps {
  protocol: Protocol;
  rpcDocsUrl: string | null;
}

export function ProtocolDetails({ protocol, rpcDocsUrl }: ProtocolDetailsProps) {
  const [searchParams, setSearchParams] = useSearchParams({ activeTab: 'readme' });
  const activeTab: Tab = getValidTab(searchParams.get('activeTab')?.toLowerCase());

  return (
    <>
      <Header
        centerNode={<SearchBar className="hidden md:flex md:max-w-[426px] mx-auto max-h-11" dark />}
      />
      <main className="mt-8 flex flex-col flex-1">
        <div className="container relative after:content-[''] after:absolute after:w-[719px] after:h-[559.95px] after:bg-[radial-gradient(ellipse_359px_280px_at_center,#5A5BED_0%,rgba(37,45,71,0)_100%)] after:-right-[223px] after:-top-12.5 after:-z-1 after:opacity-15">
          <div className="flex items-center gap-4">
            <ProtocolLogo scope={protocol.scope} name={protocol.name} size="lg" />
            <div className="border-l-[7px] border-zinc-800 rounded-sm pl-4">
              <h1 className="text-3xl font-semibold">{protocol.name}</h1>
              <div className="mt-2 flex items-center gap-2">
                {protocol.scope === 'open-tx3'
                  ? <UnofficialBadge />
                  : <h2 className="inline text-primary-600">@{protocol.scope}</h2>}
                <span className="opacity-50"> • v{protocol.version}</span>
              </div>
            </div>
          </div>

          <div className="flex mt-8 gap-2 -mx-4 sm:-mx-8 lg:mx-0 px-4 sm:px-8 lg:px-0 overflow-x-auto custom-scrollbar">
            <TabName
              icon={<InfoCircleIcon width="20" height="20" />}
              name="Readme"
              active={activeTab === 'readme'}
              onClick={() => setSearchParams({ activeTab: 'readme' })}
            />
            <TabName
              icon={<ChartDots3Icon width="20" height="20" />}
              name="Protocol"
              active={activeTab === 'protocol'}
              onClick={() => setSearchParams({ activeTab: 'protocol' })}
            />
            <TabName
              icon={<CodeIcon width="20" height="20" />}
              name="Tx3 File"
              active={activeTab === 'tx3-file'}
              onClick={() => setSearchParams({ activeTab: 'tx3-file' })}
            />
            <TabName
              icon={<Stack2Icon width="20" height="20" />}
              name="Try out"
              active={activeTab === 'try-out'}
              onClick={() => setSearchParams({ activeTab: 'try-out' })}
            />
            <TabName
              icon={<FileCode width="20" height="20" />}
              name="SDKs"
              active={activeTab === 'sdks'}
              onClick={() => setSearchParams({ activeTab: 'sdks' })}
            />
            <TabName
              icon={<GraphIcon width="20" height="20" />}
              name="Activity"
              active={activeTab === 'activity'}
              onClick={() => setSearchParams({ activeTab: 'activity' })}
            />
            {rpcDocsUrl && (
              <a href={rpcDocsUrl} target="_blank" rel="noreferrer">
                <TabName
                  icon={<FileDescriptionIcon width="20" height="20" />}
                  name="Web API"
                  active={false}
                />
              </a>
            )}
          </div>
        </div>

        <div className={clsx(
          'border-y border-zinc-800 w-full flex flex-col flex-1',
          activeTab !== 'readme' && 'bg-woodsmoke-950',
        )}
        >
          {activeTab === 'readme' && <TabReadme protocol={protocol} />}
          {activeTab === 'protocol' && <TabProtocol protocol={protocol} />}
          {activeTab === 'tx3-file' && <TabTx3File protocol={protocol} />}
          {activeTab === 'try-out' && <TabTryOut protocol={protocol} />}
          {activeTab === 'sdks' && <TabSDKs protocol={protocol} />}
          {activeTab === 'activity' && <TabActivity protocol={protocol} />}
        </div>

        <div className="container py-4">
          <Link to="/protocols" className="flex items-center gap-3 w-fit text-zinc-400 hover:text-zinc-100 font-medium py-3">
            <ArrowLeftIcon width="20" height="20" /> Back to all Protocols
          </Link>
        </div>
        <ToTopButton />
      </main>
    </>
  );
}
