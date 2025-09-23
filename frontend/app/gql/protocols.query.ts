import { gql } from 'graphql-request';

export const DEFAULT_PAGINATION = {
  size: 15,
  page: 1,
};

export const DEFAULT_SORT = 'alphabetical';

export const LIST_QUERY = gql`
  query protocols($pageSize: Int, $offset: Int, $search: String, $sortBy: ProtocolSort) {
    protocols(pageSize: $pageSize, offset: $offset, search: $search, sortBy: $sortBy) {
      nodes {
        id
        name
        scope
        version
      }
      pageInfo {
        hasPreviousPage
        hasNextPage
        startCursor
        endCursor
      }
      metadata {
        totalNodes
        pageSize
      }
    }
  }
`;

export function listQueryKeyGenerator(
  page = DEFAULT_PAGINATION.page,
  size = DEFAULT_PAGINATION.size,
  search = '',
  sortBy = DEFAULT_SORT,
) {
  const _search = search.trim().toLowerCase();
  const output = ['protocols', `page-${page}`, `size-${size}`, `sortBy-${sortBy}`];
  if (_search.length > 0) {
    output.push(`search-${_search}`);
  }
  return output;
}

export function generateListArgs(
  page = DEFAULT_PAGINATION.page,
  size = DEFAULT_PAGINATION.size,
  search = '',
  sortBy = DEFAULT_SORT,
): QueryProtocolsArgs {
  const after = ((page - 1) * size);
  const _search = search.trim().toLowerCase();
  let _sortBy: ProtocolSort = 'ALPHABETIC_ASC';
  switch (sortBy) {
    case 'most-recent':
      _sortBy = 'UPDATE_TIME';
      break;
    case 'most-viewed':
      _sortBy = 'DOWNLOADS';
      break;
    case 'alphabetical':
    default:
      _sortBy = 'ALPHABETIC_ASC';
      break;
  }
  return {
    pageSize: size,
    offset: after <= 0 ? null : after,
    search: _search.length > 0 ? _search : null,
    sortBy: _sortBy,
  };
}

export const DETAIL_QUERY = gql`
  query protocol($scope: String!, $name: String!) {
    protocol(scope: $scope, name: $name) {
      id
      name
      description
      scope
      version
      publishedDate
      repositoryUrl
      readme
      description
      source
      transactions {
        name
        parameters {
          name
          type
          description
        }
        tir
        tirVersion
        svg
      }
    }
  }
`;

export function detailQueryKeyGenerator(id: string) {
  return ['protocol', id];
}
