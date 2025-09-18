import type { SVGProps } from 'react';

// Tabler Icons bell-ringing-2
export function BellRinging2Icon({ strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M19.36 4.64a2 2 0 0 1 0 2.82 7 7 0 0 1-1.41 7.08l-2.12 2.12a4 4 0 0 0-.7 3.53L3.8 8.88a4 4 0 0 0 3.53-.7l2.12-2.13a7 7 0 0 1 7.08-1.41 2 2 0 0 1 2.82 0z" />
      <path d="m7.34 12.41-.7.71a3 3 0 0 0 4.24 4.24l.7-.7" />
    </svg>
  );
}
