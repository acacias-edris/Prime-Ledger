import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Kbd } from './Kbd'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  shortcut?: string
  revealShortcutOnHover?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground border border-transparent hover:bg-accent-hover active:brightness-95',
  secondary:
    'bg-surface text-primary-text border border-border-input hover:bg-muted active:bg-row-hover',
  ghost:
    'bg-transparent text-primary-text border border-transparent hover:bg-muted active:bg-row-hover',
  danger:
    'bg-danger-bg text-danger border border-[var(--status-danger-border)] hover:bg-danger hover:text-accent-foreground active:brightness-95',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-[var(--control-h)] px-4 text-[14px] gap-2',
}

export function Button({
  ref,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  leftIcon,
  shortcut,
  revealShortcutOnHover = false,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'group inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,filter,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out)] cursor-pointer select-none',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children ? <span>{children}</span> : null}
      {shortcut && !loading ? (
        <Kbd
          variant={variant === 'primary' ? 'on-accent' : 'default'}
          revealOnHover={revealShortcutOnHover}
        >
          {shortcut}
        </Kbd>
      ) : null}
    </button>
  )
}
