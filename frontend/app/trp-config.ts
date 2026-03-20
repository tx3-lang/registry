import type { ClientOptions } from 'tx3-sdk/trp';

export const TRP_ENDPOINTS: Record<string, ClientOptions> = {
  local: {
    endpoint: 'http://localhost:8164',
  },
  preview: {
    endpoint: 'https://cardano-preview.trp-m1.demeter.run',
    headers: { 'dmtr-api-key': 'trp1ffyf88ugcyg6j6n3yuh' },
  },
  preprod: {
    endpoint: 'https://cardano-preprod.trp-m1.demeter.run',
    headers: { 'dmtr-api-key': 'trp1mtg35n2n9lv7yauanfa' },
  },
  mainnet: {
    endpoint: 'https://cardano-mainnet.trp-m1.demeter.run',
    headers: { 'dmtr-api-key': 'trp1lrnhzcax5064cgxsaup' },
  },
};

export const TRP_DEFAULT = TRP_ENDPOINTS.preview;

export function getTrpForProfile(profileName: string): ClientOptions {
  return TRP_ENDPOINTS[profileName] ?? TRP_DEFAULT;
}
