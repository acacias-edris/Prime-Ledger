import { Keyboard, X } from 'lucide-react'
import { VOUCHER_TYPE_META, VOUCHER_TYPE_ORDER } from '../../lib/dummyData'
import { Button } from './Button'
import { Kbd } from './Kbd'

export interface ShortcutSheetModalProps {
  open: boolean
  onClose: () => void
}

const GENERAL_SHORTCUTS = [
  { label: 'Go-To Command Palette', keys: ['Alt+G'] },
  { label: 'Post Balanced Voucher', keys: ['Ctrl+Enter'] },
  { label: 'Navigate Day Book Rows', keys: ['↑', '↓', 'Enter'] },
  { label: 'Close Overlay / Inspector', keys: ['Esc'] },
  { label: 'Toggle Keyboard Cheat Sheet', keys: ['?'] },
]

export function ShortcutSheetModal({ open, onClose }: ShortcutSheetModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center px-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-sheet-title"
    >
      <div
        className="fixed inset-0 bg-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-lg border border-border-strong bg-raised text-primary-text shadow-md">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
            <h2 id="shortcut-sheet-title" className="type-h2">
              Tally Keyboard Shortcuts
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close shortcut sheet"
            className="px-2"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <Kbd>Esc</Kbd>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
          <div>
            <p className="type-xs uppercase text-muted-text">Voucher Entry (F4–F9)</p>
            <ul className="mt-2.5 divide-y divide-border-row">
              {VOUCHER_TYPE_ORDER.map((type) => {
                const meta = VOUCHER_TYPE_META[type]
                return (
                  <li
                    key={type}
                    className="flex items-center justify-between gap-2 py-2 text-[13px]"
                  >
                    <span className="font-medium text-primary-text">{meta.label}</span>
                    <span className="flex items-center gap-1.5">
                      <Kbd>{meta.shortKey}</Kbd>
                      <span className="text-[11px] text-muted-text">or</span>
                      <Kbd>{meta.backupChord}</Kbd>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <div>
            <p className="type-xs uppercase text-muted-text">Navigation &amp; Posting</p>
            <ul className="mt-2.5 divide-y divide-border-row">
              {GENERAL_SHORTCUTS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-2 py-2 text-[13px]"
                >
                  <span className="font-medium text-primary-text">{item.label}</span>
                  <span className="flex items-center gap-1">
                    {item.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
