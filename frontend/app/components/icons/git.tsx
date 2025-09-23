import type { SVGProps } from 'react';

// Tabler Icons brand-git
export function GitIcon({ strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M15 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0M11 8a1 1 0 1 0 2 0 1 1 0 1 0-2 0M11 16a1 1 0 1 0 2 0 1 1 0 1 0-2 0M12 15V9M15 11l-2-2M11 7 9.1 5.1" />
      <path d="m13.45 2.6 7.95 7.95a2.04 2.04 0 0 1 0 2.9l-7.95 7.95a2.04 2.04 0 0 1-2.9 0L2.6 13.45a2.04 2.04 0 0 1 0-2.9l7.95-7.95a2.04 2.04 0 0 1 2.9 0z" />
    </svg>
  );
}
