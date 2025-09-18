import type { SVGProps } from 'react';

// Tabler Icons git-commit
export function GitCommitIcon({ strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      strokeWidth={strokeWidth}
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" />
      <path d="M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 3v6M12 15v6" />
    </svg>
  );
}
