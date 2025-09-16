import { Link, NavLink } from 'react-router';
import clsx from 'clsx';

interface Props {
  appName?: string;
  appLink?: string;
  className?: string;
  centerNode?: React.ReactNode;
}

export function Header({ className, appName, appLink, centerNode }: Props) {
  return (
    <header className={clsx('border-b border-zinc-800 py-8', className)}>
      <div className="container px-20 header-grid">
        <div className="flex items-center gap-4 leading-relaxed tracking-[0.51px]" style={{ gridArea: 'logo' }}>
          <Link to="/">
            <img src="/logo.svg" alt="Logo" className="mt-[-2px] h-full w-auto inline-block" />
          </Link>
          {!!appName && (
            <>
              <div className="bg-zinc-600 w-1 h-1 rounded-full" />
              <Link to={appLink ?? '/'} className="text-zinc-600 text-2xl">{appName}</Link>
            </>
          )}
        </div>

        <div style={{ gridArea: 'center' }}>
          {centerNode}
        </div>

        <nav className="flex items-center justify-end gap-8" style={{ gridArea: 'nav' }}>
          <NavLink to={import.meta.env.VITE_DOCS_URL} target="_blank" rel="noreferrer">Docs</NavLink>
          <NavLink to="/" className="text-primary-600">Registry</NavLink>
          {/* <NavLink to="/support">Support</NavLink> */}
        </nav>
      </div>
    </header>
  );
}
