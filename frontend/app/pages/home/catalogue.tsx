import { Link, useSearchParams } from 'react-router';
import { Card } from '~/components/ui/Card';
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
      <Card>
        <h3 className="text-lg font-semibold">{protocol.name}</h3>
        <div className="mt-2">
          <span className="text-primary-400">@{protocol.scope}</span>
          <span className="text-white/50"> • v{protocol.version}</span>
        </div>
      </Card>
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
    <section className={className}>
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-semibold">Protocols</h2>
        <div>
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
      </div>
      <div className="grid grid-cols-3 gap-6 mt-8">
        {protocols.nodes.map(protocol => (
          <PackageCard key={`protocol-${protocol.id}`} protocol={protocol} />
        ))}
      </div>
      <div className="mt-8 flex items-center justify-center gap-6">
        <span className="text-white/50">
          Showing {startCursor}-{endCursor} of {totalNodes}
        </span>
        <div className="flex gap-3">
          <Button
            type="button"
            color="primary"
            spacing="icon"
            disabled={!protocols.pageInfo.hasPreviousPage}
            onClick={() => {
              searchParams.set('page', `${Math.max(1, page - 1)}`);
              setSearchParams(searchParams, { preventScrollReset: true });
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            color="primary"
            spacing="icon"
            disabled={!protocols.pageInfo.hasNextPage}
            onClick={() => {
              searchParams.set('page', `${page + 1}`);
              setSearchParams(searchParams, { preventScrollReset: true });
            }}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </section>
  );
}
