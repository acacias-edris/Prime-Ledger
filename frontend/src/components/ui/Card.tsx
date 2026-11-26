import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>
  padding?: 'none' | 'sm' | 'md'
  loading?: boolean
}

export function Card({
  ref,
  padding = 'md',
  loading = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-md border border-border-subtle bg-surface text-primary-text',
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-5',
        className,
      )}
      {...props}
    >
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading panel">
          <div className="h-3.5 w-28 rounded-sm bg-muted animate-pulse" />
          <div className="h-8 w-44 rounded-sm bg-muted animate-pulse" />
          <div className="h-3.5 w-36 rounded-sm bg-muted animate-pulse" />
        </div>
      ) : (
        children
      )}
    </div>
  )
}

export function CardHeader({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardTitle({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <h2
      className={cn(
        'text-[var(--fs-h2)] font-semibold leading-[1.3] tracking-[-0.015em] text-primary-text',
        className,
      )}
    >
      {children}
    </h2>
  )
}
