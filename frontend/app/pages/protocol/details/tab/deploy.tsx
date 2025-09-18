import type { ReactNode } from 'react';
import { BellRinging2Icon } from '~/components/icons/bell-ringing-2';
import { BoltIcon } from '~/components/icons/bolt';
import { DownloadIcon } from '~/components/icons/download';
import { FileDescriptionIcon } from '~/components/icons/file-description';
import { GitCommitIcon } from '~/components/icons/git-commit';
import { GraphIcon } from '~/components/icons/graph';
import { PlugConnectedIcon } from '~/components/icons/plug-connected';
import { RocketIcon } from '~/components/icons/rocket';
import { ShieldCheckIcon } from '~/components/icons/shield-check';

// Components
import { TerminalIcon } from '~/components/icons/terminal';
import { VectorSplineIcon } from '~/components/icons/vector-spline';
import { Button } from '~/components/ui/Button';

interface Props {
  protocol: Protocol;
}

function ListBox({
  items, removeLastBorder = false,
}: { items: { icon: ReactNode; text: string; }[]; removeLastBorder?: boolean; }) {
  return (
    <div className="flex-1 border border-zinc-900 rounded-lg text-sm text-zinc-300">
      {items.map(item => (
        <div key={item.text} className={`flex flex-row items-center py-3.5 px-4 gap-3 border-b border-zinc-900${removeLastBorder ? ' last:border-0' : ''}`}>
          <div className="rounded-full border border-zinc-800 aspect-square p-1.5">
            {item.icon}
          </div>
          {item.text}
        </div>
      ))}
    </div>
  );
}

const manualDeploymentItems = [
  { icon: <DownloadIcon width="20" height="20" />, text: 'Install and configure the SDK in your own environment.' },
  { icon: <GitCommitIcon width="20" height="20" />, text: 'Full control over setup, integration, and infrastructure.' },
  { icon: <VectorSplineIcon width="20" height="20" />, text: 'Best if you want flexibility or to run on your own stack.' },
];

const oneClickDeploymentItems = [
  { icon: <PlugConnectedIcon width="20" height="20" />, text: 'Get SDKs instantly deployed and connected to a managed provider.' },
  { icon: <RocketIcon width="20" height="20" />, text: 'Best if you want to focus on building and skip the ops overhead.' },
  { icon: <BoltIcon width="20" height="20" />, text: 'No infrastructure setup, no manual integration.' },
  { icon: <GraphIcon width="20" height="20" />, text: 'Private dashboard for monitoring tx activity.' },
  { icon: <ShieldCheckIcon width="20" height="20" />, text: 'Built-in error and security analysis.' },
  { icon: <BellRinging2Icon width="20" height="20" />, text: 'Notifications for key events.' },
];

export function TabDeploy({ protocol }: Props) {
  return (
    <div className="container flex-1 pt-8 pb-14 relative">
      <div className="absolute w-[719px] h-[559.95px] bg-[radial-gradient(ellipse_359px_280px_at_center,#5A5BED_0%,rgba(37,45,71,0)_100%)] left-[calc(50%+54px)] transform -translate-x-1/2 -top-[45px] pointer-events-none opacity-20 z-0" />
      <h3 className="relative text-2xl font-semibold text-zinc-50">Deploy your own Tx3 off-chain backend.</h3>
      <p className="relative text-sm text-zinc-400 mt-3">Tx3 currently provides SDKs for Rust, TypeScript, Python, and Go.</p>

      <div className="relative bg-zinc-950 border border-zinc-800 pt-5 pb-6 px-8 rounded-md mt-9 flex flex-row gap-8">
        <div className="flex flex-col gap-6 flex-1">
          <h4 className="flex flex-row gap-3 items-center font-medium text-zinc-200">
            <TerminalIcon width="24" height="24" />
            Manual Deployment
          </h4>
          <ListBox items={manualDeploymentItems} />
          <Button variant="outlined" color="zinc" className="rounded-lg" full>
            <FileDescriptionIcon width="20" height="20" />
            Read the docs
          </Button>
        </div>
        <div className="min-h-full w-0.25 bg-zinc-900" />
        <div className="flex flex-col gap-6 flex-1">
          <h4 className="flex flex-row gap-3 items-center font-medium text-zinc-200">
            <TerminalIcon width="24" height="24" />
            One-click Deploy
          </h4>
          <ListBox items={oneClickDeploymentItems} removeLastBorder />
          <Button color="zinc" className="rounded-lg" full>
            <RocketIcon width="20" height="20" />
            Deploy with Tx3 Cloud
          </Button>
        </div>
      </div>
    </div>
  );
}
