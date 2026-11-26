import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { Kbd } from './Kbd'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  headerExtra?: ReactNode
  footer?: ReactNode
  children: ReactNode
  widthClassName?: string
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  footer,
  children,
  widthClassName = 'w-full sm:max-w-[680px]',
}: DrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const rafId = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(rafId)
      document.body.style.overflow = originalOverflow
      previousFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[var(--z-drawer)] flex justify-end print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-backdrop transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        className={cn(
          'relative z-10 flex h-full flex-col border-l border-border-strong bg-surface text-primary-text shadow-md',
          'transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]',
          widthClassName,
        )}
      >
        {/* Sticky Drawer Header */}
        <div className="shrink-0 border-b border-border-subtle bg-surface px-4 py-3.5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="drawer-title"
                className="text-[var(--fs-h2)] font-semibold leading-[1.3] tracking-[-0.015em] text-primary-text"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 text-[13px] text-muted-text">{subtitle}</p>
              ) : null}
            </div>
            <Button
              ref={closeBtnRef}
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close drawer"
              className="shrink-0 px-2"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <Kbd className="hidden sm:inline-flex">Esc</Kbd>
            </Button>
          </div>
          {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>

        {/* Sticky Footer */}
        {footer ? (
          <div className="shrink-0 border-t border-border-strong bg-surface px-4 py-3.5 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
