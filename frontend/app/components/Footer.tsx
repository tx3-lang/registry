import clsx from 'clsx';

interface Props {
  className?: string;
}

export function Footer({ className }: Props) {
  return (
    <footer className={clsx('border-t border-zinc-800', className)}>
      <div className="container flex flex-col sm:flex-row items-center gap-1 text-xs py-5.5 text-zinc-500 px-20">
        <span>Copyright © 2025 TxPipe</span>
        <span className="hidden sm:block">|</span>
        <span>All Rights Reserved</span>
        {/* <span className="hidden sm:block">|</span>
        <a href="#" className="text-blue-300 underline">Terms and Conditions</a>
        <span className="hidden sm:block">|</span>
        <a href="#" className="text-blue-300 underline">Privacy Policy</a> */}
      </div>
    </footer>
  );
}
