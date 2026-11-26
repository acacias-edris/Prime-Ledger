import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Info, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

export interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  icon?: ReactNode | boolean
  className?: string
}

const DEFAULT_ICONS: Record<BadgeVariant, ReactNode> = {
  neutral: <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  danger: <XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  accent: <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-muted text-muted-text border-border-subtle',
  success: 'bg-success-bg text-success border-[var(--status-success-border)]',
  warning: 'bg-warning-bg text-warning border-[var(--status-warning-border)]',
  danger: 'bg-danger-bg text-danger border-[var(--status-danger-border)]',
  accent: 'bg-row-selected text-accent border-accent/30',
}

export function Badge({
  children,
  variant = 'neutral',
  icon = true,
  className,
}: BadgeProps) {
  const renderedIcon = icon === true ? DEFAULT_ICONS[variant] : icon === false ? null : icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-semibold leading-tight tracking-[0.03em] whitespace-nowrap',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {renderedIcon}
      <span>{children}</span>
    </span>
  )
}

const DOT_BG: Record<BadgeVariant, string> = {
  neutral: 'bg-muted-text',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
}

const DOT_TEXT: Record<BadgeVariant, string> = {
  neutral: 'text-muted-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  accent: 'text-accent',
}

export function StatusIndicator({
  children,
  variant = 'neutral',
  className,
}: {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap',
        DOT_TEXT[variant],
        className,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_BG[variant])}
        aria-hidden="true"
      />
      <span>{children}</span>
    </span>
  )
}
