import { Link, useSearchParams } from 'react-router';

import { DocumentIcon } from '~/components/icons/document';
import { TabName } from '~/components/TabName';
import { SearchBar } from '~/components/SearchBar';
import { ToTopButton } from '~/components/ToTopButton';
import { Header } from '~/components/Header';
import { ArrowLeftIcon } from '~/components/icons/arrow-left';
import { TabReadme } from './tab/readme';
import { TabTransactions } from './tab/transactions';
import { Info } from './info';

type Tab = 'readme' | 'transactions';
const validTabs: Tab[] = ['readme', 'transactions'];

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
        centerNode={<SearchBar className="md:max-w-[500px]" dark />}
      />
      <main className="mt-20">
        <h1 className="text-3xl font-semibold mt-20">{protocol.name}</h1>
        <div className="mt-2 text-xl">
          <h2 className="inline text-primary-400">@{protocol.scope}</h2>
          <span className="text-white/60"> • v{protocol.version}</span>
        </div>
        <p className="text-white/30 mt-6">{protocol.description}</p>

        <div className="flex mt-14 border-b-[#3E3E3E] border-b gap-8">
          <TabName
            icon={<DocumentIcon width="18" height="18" gradient={activeTab === 'readme' ? 'secondary' : undefined} />}
            name="Readme"
            active={activeTab === 'readme'}
            onClick={() => setSearchParams({ activeTab: 'readme' })}
          />
          <TabName
            icon={<DocumentIcon width="18" height="18" gradient={activeTab === 'transactions' ? 'secondary' : undefined} />}
            name="Transactions"
            active={activeTab === 'transactions'}
            onClick={() => setSearchParams({ activeTab: 'transactions' })}
          />
        </div>

        <div className="flex gap-14 mt-8 items-start">
          <div className="w-full">
            {activeTab === 'readme' && <TabReadme readme={protocol.readme} />}
            {activeTab === 'transactions' && <TabTransactions protocol={protocol} />}
          </div>
          <Info protocol={protocol} className="max-w-[460px] sticky top-8" />
        </div>
        <ToTopButton />

        <Link to="/" className="flex items-center gap-3 w-fit text-white/80 hover:underline hover:underline-offset-[3px] hover:text-primary-400 mt-14">
          <ArrowLeftIcon width="18" height="18" /> Back to all Protocols
        </Link>
      </main>
    </>
  );
}
