import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface KbdProps {
  children: ReactNode
  variant?: 'default' | 'on-accent'
  className?: string
}

export function Kbd({ children, variant = 'default', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none tracking-wider select-none',
        variant === 'default' &&
          'border border-border-subtle bg-muted text-muted-text',
        variant === 'on-accent' &&
          'border border-accent-foreground/30 bg-accent-foreground/15 text-accent-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
