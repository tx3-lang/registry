import type { MouseEventHandler, PropsWithChildren } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

const button = tv({
  base: 'text-base flex items-center flex-row gap-3 cursor-pointer rounded-lg',
  variants: {
    size: {
      m: 'px-5 py-3 font-medium rounded-full',
      s: 'px-4 py-2.5 text-sm',
      icon: 'p-2',
    },
    color: {
      primary: '',
      zinc: '',
    },
    full: {
      true: 'w-full justify-center',
    },
    variant: {
      solid: '',
      outlined: 'border',
      ghost: 'bg-transparent',
      underlined: 'bg-transparent underline underline-offset-4',
    },
    disabled: {
      true: 'bg-zinc-400 text-zinc-50 cursor-not-allowed opacity-50',
    },
  },

  compoundVariants: [
    // COLOR => Primary
    { color: 'primary', variant: 'solid', class: 'bg-primary-600 text-zinc-50 hover:bg-primary-700', disabled: false },
    { color: 'primary', variant: 'outlined', class: 'border-primary-800 text-primary-600 hover:border-primary-950 hover:text-primary:800', disabled: false },
    { color: 'primary', variant: ['ghost', 'underlined'], class: 'text-primary-600 hover:text-primary-800', disabled: false },

    // COLOR => Zinc
    { color: 'zinc', variant: 'solid', class: 'bg-zinc-50 text-zinc-950 hover:bg-zinc-200', disabled: false },
    { color: 'zinc', variant: 'outlined', class: 'border-zinc-800 hover:bg-woodsmoke-900 text-zinc-200 hover:text-zinc-100', disabled: false },
    { color: 'zinc', variant: ['ghost', 'underlined'], class: 'text-zinc-300 hover:text-zinc-100', disabled: false },
  ],

  defaultVariants: {
    color: 'primary',
    variant: 'solid',
    size: 'm',
  },
});

type ButtonVariants = VariantProps<typeof button>;

interface Props extends ButtonVariants {
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
}

export function Button({ type, children, onClick, ...buttonProps }: PropsWithChildren<Props>) {
  return (
    <button
      type={type}
      onClick={!buttonProps.disabled ? onClick : undefined}
      className={button(buttonProps)}
      disabled={buttonProps.loading || buttonProps.disabled}
    >
      {children}
    </button>
  );
}
