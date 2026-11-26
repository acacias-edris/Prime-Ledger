import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface KbdProps {
  children: ReactNode
  variant?: 'default' | 'on-accent'
  revealOnHover?: boolean
  className?: string
}

export function Kbd({
  children,
  variant = 'default',
  revealOnHover = false,
  className,
}: KbdProps) {
  return (
    <kbd
      className={cn(
        'kbd-chip inline-flex items-center justify-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none tracking-wider select-none',
        'transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out)]',
        variant === 'default' &&
          'border border-border-subtle bg-muted text-muted-text',
        variant === 'on-accent' &&
          'border border-[var(--kbd-on-primary-border)] bg-[var(--kbd-on-primary-bg)] text-[var(--kbd-on-primary-text)]',
        revealOnHover && 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
