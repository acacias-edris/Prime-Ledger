import { useEffect } from 'react'
import type { VoucherType } from '../lib/dummyData'

export interface UseKeymapOptions {
  onOpenCommandPalette: () => void
  onOpenVoucher: (voucherType: VoucherType) => void
  onEscape: () => void
  onSubmitActiveForm?: () => void
  onToggleShortcutSheet?: () => void
  isFormSubmitEnabled?: boolean
}

const FUNCTION_KEY_MAP: Record<string, VoucherType> = {
  F4: 'CONTRA',
  F5: 'PAYMENT',
  F6: 'RECEIPT',
  F7: 'JOURNAL',
  F8: 'SALES',
  F9: 'PURCHASE',
}

const ALT_DIGIT_MAP: Record<string, VoucherType> = {
  Digit4: 'CONTRA',
  Digit5: 'PAYMENT',
  Digit6: 'RECEIPT',
  Digit7: 'JOURNAL',
  Digit8: 'SALES',
  Digit9: 'PURCHASE',
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/**
 * Tally Prime keyboard ergonomics engine:
 * - Alt+G: Toggle Go-To Command Palette
 * - F4–F9 AND Linux/Brave-safe Alt+4–Alt+9: Open/switch Quick Voucher Drawer
 *   (calls e.preventDefault() so F5 never refreshes the browser)
 * - Esc: Close topmost overlay
 * - Ctrl+Enter / Cmd+Enter: Submit balanced voucher form when open
 * - Single-key non-chord shortcuts are ignored inside editable form inputs.
 */
export function useKeymap({
  onOpenCommandPalette,
  onOpenVoucher,
  onEscape,
  onSubmitActiveForm,
  onToggleShortcutSheet,
  isFormSubmitEnabled = false,
}: UseKeymapOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key
      const code = event.code
      const inEditable = isEditableTarget(event.target)

      // 1. Escape closes overlays cleanly from anywhere
      if (key === 'Escape') {
        event.preventDefault()
        onEscape()
        return
      }

      // 2. Ctrl+Enter / Cmd+Enter submits balanced active voucher form
      if ((event.ctrlKey || event.metaKey) && key === 'Enter') {
        if (isFormSubmitEnabled && onSubmitActiveForm) {
          event.preventDefault()
          onSubmitActiveForm()
        }
        return
      }

      // 3. Alt+G opens Go-To Command Palette
      if (event.altKey && !event.ctrlKey && !event.metaKey && (key.toLowerCase() === 'g' || code === 'KeyG')) {
        event.preventDefault()
        onOpenCommandPalette()
        return
      }

      // 4. Function keys F4–F9 (explicit F-key chord works everywhere; prevents F5 reload)
      if (!event.ctrlKey && !event.metaKey && !event.altKey && key in FUNCTION_KEY_MAP) {
        event.preventDefault()
        onOpenVoucher(FUNCTION_KEY_MAP[key])
        return
      }

      // 5. Brave/Linux Mint-safe Alt+4 through Alt+9 backup chords
      if (event.altKey && !event.ctrlKey && !event.metaKey && code in ALT_DIGIT_MAP) {
        event.preventDefault()
        onOpenVoucher(ALT_DIGIT_MAP[code])
        return
      }

      // 6. Explicitly ignore plain single-key shortcuts when typing inside inputs
      if (inEditable) {
        return
      }

      // 7. '?' opens Keyboard Shortcut Sheet
      if (key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        onToggleShortcutSheet?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [
    onOpenCommandPalette,
    onOpenVoucher,
    onEscape,
    onSubmitActiveForm,
    onToggleShortcutSheet,
    isFormSubmitEnabled,
  ])
}
