import type { SVGProps } from 'react';

// Tabler Icons chart-dots-3
export function ChartDots3Icon({ strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M3 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0M14 15a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0M3 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0M9 17l5-1.5M6.5 8.5l7.81 5.37M7 7l8-1" />
    </svg>
  );
}
