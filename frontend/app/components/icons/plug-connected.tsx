import type { SVGProps } from 'react';

// Tabler Icons plug-connected
export function PlugConnectedIcon({ strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="m7 12 5 5-1.5 1.5a3.54 3.54 0 1 1-5-5L7 12zM17 12l-5-5 1.5-1.5a3.54 3.54 0 1 1 5 5L17 12zM3 21l2.5-2.5M18.5 5.5 21 3M10 11l-2 2M13 14l-2 2" />
    </svg>
  );
}
