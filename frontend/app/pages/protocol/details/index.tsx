import { Link, useSearchParams } from 'react-router';

// Components
import clsx from 'clsx';
import { TabName } from '~/components/TabName';
import { SearchBar } from '~/components/SearchBar';
import { ToTopButton } from '~/components/ToTopButton';
import { Header } from '~/components/Header';

// Icons
import { ArrowLeftIcon } from '~/components/icons/arrow-left';
import { InfoCircleIcon } from '~/components/icons/info-circle';
import { Stack2Icon } from '~/components/icons/stack-2';
import { CodeIcon } from '~/components/icons/code';
import { ChartDots3Icon } from '~/components/icons/chart-dots-3';
import { ProtocolIcon } from '~/components/icons/protocol';

// Tabs
import { TabReadme } from './tab/readme';
import { TabTransactions } from './tab/transactions';

const validTabs = ['readme', 'transactions', 'tx3-file', 'diagrams', 'deploy'] as const;
type Tab = typeof validTabs[number];

function getValidTab(tab?: string): Tab {
  if (!tab) return 'readme';

  if (validTabs.includes(tab as Tab)) {
    return tab as Tab;
  }

  return 'readme';
}

export function ProtocolDetails({ protocol }: { protocol: Protocol; }) {
  const [searchParams, setSearchParams] = useSearchParams({ activeTab: 'readme' });
  const activeTab: Tab = getValidTab(searchParams.get('activeTab')?.toLowerCase());

  return (
    <>
      <Header
        appName="Registry"
        centerNode={<SearchBar className="md:max-w-[426px] mx-auto" dark />}
      />
      <main className="mt-8 flex flex-col flex-1">
        <div className="container relative after:content-[''] after:absolute after:w-[719px] after:h-[559.95px] after:bg-[radial-gradient(ellipse_359px_280px_at_center,#5A5BED_0%,rgba(37,45,71,0)_100%)] after:-right-[223px] after:-top-12.5 after:-z-1 after:opacity-15">
          <div className="border-l-[7px] border-zinc-800 rounded-sm pl-4">
            <h1 className="text-3xl font-semibold">{protocol.name}</h1>
            <div className="mt-2">
              <h2 className="inline text-primary-600">@{protocol.scope}</h2>
              <span className="opacity-50"> • v{protocol.version}</span>
            </div>
          </div>

          <div className="flex mt-8 gap-2">
            <TabName
              icon={<InfoCircleIcon width="20" height="20" />}
              name="Readme"
              active={activeTab === 'readme'}
              onClick={() => setSearchParams({ activeTab: 'readme' })}
            />
            <TabName
              icon={<Stack2Icon width="20" height="20" />}
              name="Transactions"
              active={activeTab === 'transactions'}
              onClick={() => setSearchParams({ activeTab: 'transactions' })}
            />
            <TabName
              icon={<CodeIcon width="20" height="20" />}
              name="Tx3 File"
              active={activeTab === 'tx3-file'}
              onClick={() => setSearchParams({ activeTab: 'tx3-file' })}
            />
            <TabName
              icon={<ChartDots3Icon width="20" height="20" />}
              name="Diagrams"
              active={activeTab === 'diagrams'}
              onClick={() => setSearchParams({ activeTab: 'diagrams' })}
            />
            <TabName
              icon={<ProtocolIcon width="20" height="20" />}
              name="Deploy"
              active={activeTab === 'deploy'}
              onClick={() => setSearchParams({ activeTab: 'deploy' })}
            />
          </div>
        </div>

        <div className={clsx(
          'border-y border-zinc-800 w-full flex flex-col flex-1',
          activeTab !== 'readme' && 'bg-woodsmoke-950',
        )}
        >
          {activeTab === 'readme' && <TabReadme protocol={protocol} />}
          {activeTab === 'transactions' && <TabTransactions protocol={protocol} />}
        </div>

        <div className="container px-14 py-4">
          <Link to="/" className="flex items-center gap-3 w-fit text-zinc-400 hover:text-zinc-100 font-medium py-3">
            <ArrowLeftIcon width="20" height="20" /> Back to all Protocols
          </Link>
        </div>
        <ToTopButton />
      </main>
    </>
  );
}
