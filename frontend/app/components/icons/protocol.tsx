import type { SVGProps } from 'react';

// Tabler Icons protocol
export function ProtocolIcon({ strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M15 6 8 18M20 6l-7 12M5 14v.01M5 10.02v.01" />
    </svg>
  );
}
