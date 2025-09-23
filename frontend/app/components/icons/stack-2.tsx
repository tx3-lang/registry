import type { SVGProps } from 'react';

// Tabler Icons stack-2
export function Stack2Icon({ strokeWidth = 1.5, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M12 4 4 8l8 4 8-4-8-4M4 12l8 4 8-4M4 16l8 4 8-4" />
    </svg>
  );
}
