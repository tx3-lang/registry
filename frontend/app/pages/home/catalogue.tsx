import { Link, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { ProtocolLogo } from '~/components/ProtocolLogo';
import { Button } from '~/components/ui/Button';
import { ChevronLeftIcon } from '~/components/icons/chevron-left';
import { ChevronRightIcon } from '~/components/icons/chevron-right';
import { Dropdown } from '~/components/ui/Dropdown';
import { DEFAULT_PAGINATION, DEFAULT_SORT } from '~/gql/protocols.query';

interface CatalogueProps {
  className?: string;
  protocols: ProtocolConnection;
}

function PackageCard({ protocol }: { protocol: Protocol; }) {
  return (
    <Link to={`/protocol/${protocol.scope}/${protocol.name}`}>
      <div className="h-full py-5 px-5 sm:py-6 sm:px-8 border border-zinc-900 bg-woodsmoke-950 rounded-lg flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <ProtocolLogo scope={protocol.scope} name={protocol.name} size="sm" />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold truncate leading-tight">{protocol.name}</h3>
            <div className="mt-0.5 text-sm">
              <span className="text-primary-600">@{protocol.scope}</span>
              <span className="text-zinc-400"> • v{protocol.version}</span>
            </div>
          </div>
        </div>
        {protocol.description && (
          <p className="text-sm text-zinc-400 line-clamp-3">
            {protocol.description}
          </p>
        )}
      </div>
    </Link>
  );
}

const sortOptions = [
  { label: 'Alphabetical', value: 'alphabetical' },
  { label: 'Most recent', value: 'most-recent' },
  { label: 'Most viewed', value: 'most-viewed' },
];

export function Catalogue({ className, protocols }: CatalogueProps) {
  const [searchParams, setSearchParams] = useSearchParams({
    page: DEFAULT_PAGINATION.page.toString(),
    sort: DEFAULT_SORT,
  });

  const page = parseInt(searchParams.get('page') ?? '0', 10) || DEFAULT_PAGINATION.page;

  const startCursor = +(protocols.pageInfo.startCursor ?? 0) + 1;
  const endCursor = +(protocols.pageInfo.endCursor ?? 0) + 1;
  const totalNodes = protocols.metadata?.totalNodes ?? 0;
  return (
    <section className={clsx('container lg:px-[162px]', className)}>
      <div className="flex flex-wrap justify-between items-center gap-4">
        <h2 className="text-2xl sm:text-3xl font-semibold">Protocols</h2>
        <Dropdown
          label="Sort by:"
          value={searchParams.get('sort') ?? DEFAULT_SORT}
          showValue
          options={sortOptions}
          onOptionSelected={value => {
            searchParams.set('sort', value);
            setSearchParams(searchParams, { preventScrollReset: true });
          }}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-8">
        {protocols.nodes.map(protocol => (
          <PackageCard key={`protocol-${protocol.id}`} protocol={protocol} />
        ))}
      </div>
      <div className="mt-8 flex items-center justify-center gap-6">
        <span className="text-zinc-400 text-sm">
          Displaying {startCursor}-{endCursor} of {totalNodes}
        </span>
        <div className="flex gap-3">
          <Button
            type="button"
            color="primary"
            size="icon"
            disabled={!protocols.pageInfo.hasPreviousPage}
            onClick={() => {
              searchParams.set('page', `${Math.max(1, page - 1)}`);
              setSearchParams(searchParams, { preventScrollReset: true });
            }}
          >
            <ChevronLeftIcon width={16} height={16} />
          </Button>
          <Button
            type="button"
            color="primary"
            size="icon"
            disabled={!protocols.pageInfo.hasNextPage}
            onClick={() => {
              searchParams.set('page', `${page + 1}`);
              setSearchParams(searchParams, { preventScrollReset: true });
            }}
          >
            <ChevronRightIcon width={16} height={16} />
          </Button>
        </div>
      </div>
    </section>
  );
}
