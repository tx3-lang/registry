import { gql } from 'graphql-request';

export const LIST_MATCHES_QUERY = gql`
  query protocolMatches($scope: String!, $name: String!, $version: String, $first: Int, $after: String) {
    protocolMatches(scope: $scope, name: $name, version: $version, first: $first, after: $after) {
      nodes {
        id
        txHash
        txName
        profileName
        protocolName
        blockSlot
        blockHash
        matchedAt
        lifted
        source {
          scope
          name
          version
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const MATCH_BY_HASH_QUERY = gql`
  query protocolMatch($scope: String!, $name: String!, $txHash: String!) {
    protocolMatch(scope: $scope, name: $name, txHash: $txHash) {
      id
      txHash
      txName
      profileName
      protocolName
      blockSlot
      blockHash
      matchedAt
      lifted
      source {
        scope
        name
        version
      }
    }
  }
`;

export function listMatchesQueryKeyGenerator(
  scope: string,
  name: string,
  version?: string | null,
  after?: string | null,
): string[] {
  return ['matches', `${scope}/${name}`, `version-${version ?? '*'}`, `after-${after ?? 'start'}`];
}

export function matchByHashQueryKeyGenerator(scope: string, name: string, txHash: string): string[] {
  return ['match', `${scope}/${name}`, txHash];
}
