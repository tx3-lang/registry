type Maybe<T> = T | null;
type InputMaybe<T> = Maybe<T>;
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
interface Scalars {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
}

/** Information about pagination in a connection */
interface PageInfo {
  /** When paginating forwards, the cursor to continue. */
  endCursor: Maybe<Scalars['String']['output']>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars['Boolean']['output'];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** When paginating backwards, the cursor to continue. */
  startCursor: Maybe<Scalars['String']['output']>;
}

interface PaginationInfo {
  pageSize: Scalars['Int']['output'];
  totalNodes: Scalars['Int']['output'];
}

interface Protocol {
  description: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  publishedDate: Scalars['Int']['output'];
  readme: Maybe<Scalars['String']['output']>;
  repositoryUrl: Maybe<Scalars['String']['output']>;
  scope: Scalars['String']['output'];
  source: Maybe<Scalars['String']['output']>;
  transactions: Array<Tx>;
  version: Scalars['String']['output'];
}

interface ProtocolConnection {
  /** A list of edges. */
  edges: Array<ProtocolEdge>;
  metadata: Maybe<PaginationInfo>;
  /** A list of nodes. */
  nodes: Array<Protocol>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
}

/** An edge in a connection. */
interface ProtocolEdge {
  /** A cursor for use in pagination */
  cursor: Scalars['String']['output'];
  /** The item at the end of the edge */
  node: Protocol;
}

type ProtocolSort =
  | 'ALPHABETIC_ASC'
  | 'ALPHABETIC_DSC'
  | 'DOWNLOADS'
  | 'RELEVANCE'
  | 'UPDATE_TIME';

interface Query {
  protocol: Maybe<Protocol>;
  protocols: ProtocolConnection;
}


interface QueryProtocolArgs {
  name: Scalars['String']['input'];
  scope: Scalars['String']['input'];
}


interface QueryProtocolsArgs {
  offset: InputMaybe<Scalars['Int']['input']>;
  pageSize: InputMaybe<Scalars['Int']['input']>;
  search: InputMaybe<Scalars['String']['input']>;
  sortBy: InputMaybe<ProtocolSort>;
}

interface Tx {
  description: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  parameters: Array<TxParam>;
  svg: Maybe<Scalars['String']['output']>;
  tir: Scalars['String']['output'];
  tirVersion: Scalars['String']['output'];
}

interface TxParam {
  description: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
}
