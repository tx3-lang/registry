import type { SVGProps } from 'react';

// Tabler Icons arrow-left-right
export function ArrowLeftRightIcon({ strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement>) {
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
      {...props}>
      <path stroke="none" d="M0 0h24v24H0z" />
      <path d="M21 17H3M6 10 3 7l3-3M3 7h18M18 20l3-3-3-3" />
    </svg>
  );
}
