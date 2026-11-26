import type { ReactNode } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border-subtle bg-muted text-muted-text">
        {icon ?? <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />}
      </div>
      <div className="space-y-1">
        <p className="text-[15px] font-semibold text-primary-text">{title}</p>
        <p className="max-w-md text-[13px] text-muted-text">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
