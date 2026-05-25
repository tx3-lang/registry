import {
  byName,
  commonSetupSteps,
  type QuickStartOptions,
  type QuickStartSnippet,
  type QuickStartTx,
  type SdkRenderer,
  type SDKKey,
  type SetupStep,
  type TrpConfig,
} from './shared';
import { goRenderer } from './go';
import { pythonRenderer } from './python';
import { rustRenderer } from './rust';
import { typescriptRenderer } from './typescript';

export type { SDKKey, TrpConfig, QuickStartOptions, QuickStartTx, QuickStartSnippet, SetupStep };

// To add a new SDK: implement an `SdkRenderer` in its own file and register it here.
const RENDERERS: Record<SDKKey, SdkRenderer> = {
  typescript: typescriptRenderer,
  rust: rustRenderer,
  python: pythonRenderer,
  go: goRenderer,
};

function profileHasData(profile: Profile): boolean {
  if (profile.parties.length > 0) return true;
  if (!profile.environment) return false;
  try {
    return Object.keys(JSON.parse(profile.environment)).length > 0;
  } catch {
    return false;
  }
}

export function pickDefaultProfile(profiles: Profile[]): Profile | null {
  if (profiles.length === 0) return null;
  return profiles.find(profileHasData)
    ?? profiles.find(p => p.name === 'mainnet')
    ?? profiles[0];
}

export function generateQuickStart(
  sdk: SDKKey,
  protocol: Protocol,
  options: QuickStartOptions,
): QuickStartSnippet {
  const { profile, trp } = options;
  const txs = [...(protocol.transactions ?? [])].sort(byName);
  const renderer = RENDERERS[sdk];
  const setupSteps = [...commonSetupSteps(sdk, protocol)];
  if (renderer.postCodegenInstall) setupSteps.push(renderer.postCodegenInstall);
  return {
    lang: renderer.lang,
    setupSteps,
    quickStart: renderer.quickStart(protocol, profile, trp),
    transactions: txs.map(tx => ({
      name: tx.name,
      description: tx.description,
      code: renderer.txBlock(tx, protocol),
    })),
    lifecycle: renderer.lifecycle(protocol),
  };
}
