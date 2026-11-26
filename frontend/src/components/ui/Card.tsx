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
        'rounded-md border border-border-subtle bg-surface text-primary-text shadow-[var(--shadow-card)]',
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-4 md:p-5',
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
        'flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5 md:px-5 md:py-4',
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
  return <h2 className={cn('type-h2', className)}>{children}</h2>
}
