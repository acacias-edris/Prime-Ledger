import { useId, type InputHTMLAttributes, type Ref } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>
  label?: string
  helperText?: string
  error?: string
  numeric?: boolean
  loading?: boolean
  wrapperClassName?: string
}

export function Input({
  ref,
  id,
  label,
  helperText,
  error,
  numeric = false,
  loading = false,
  disabled,
  className,
  wrapperClassName,
  ...props
}: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-msg`

  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      {label ? (
        <label
          htmlFor={inputId}
          className="text-[13px] font-medium leading-[1.4] text-primary-text"
        >
          {label}
        </label>
      ) : null}

      {loading ? (
        <div
          className="h-[var(--control-h)] w-full rounded-sm border border-border-subtle bg-muted animate-pulse"
          aria-busy="true"
        />
      ) : (
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || helperText ? messageId : undefined}
          className={cn(
            'h-[var(--control-h)] w-full rounded-sm border bg-surface px-3 text-[14px] text-primary-text placeholder:text-disabled-text',
            'transition-[border-color,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]',
            'hover:border-border-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-text',
            error ? 'border-danger' : 'border-border-input',
            numeric && 'tabular-mono text-right',
            className,
          )}
          {...props}
        />
      )}

      {error ? (
        <p
          id={messageId}
          role="alert"
          className="flex items-center gap-1.5 text-[12px] font-medium text-danger"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p id={messageId} className="text-[12px] text-muted-text">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}
