import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  Landmark,
  Receipt,
  Search,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  SYNTHETIC_LEDGERS,
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type DayBookVoucher,
  type VoucherType,
} from '../../lib/dummyData'
import { formatCurrency } from '../../lib/format'
import { Kbd } from './Kbd'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  vouchers: DayBookVoucher[]
  onOpenVoucher: (type: VoucherType) => void
  onSelectNav: (navId: string) => void
  onSelectVoucher: (voucher: DayBookVoucher) => void
}

interface PaletteItem {
  id: string
  group: 'Quick Vouchers' | 'Workspaces' | 'Ledgers' | 'Recent Vouchers'
  icon: ReactNode
  label: string
  meta: string
  shortcut?: string
  onExecute: () => void
}

const WORKSPACE_COMMANDS = [
  { id: 'dashboard', label: 'Financial Command Center', meta: 'Dashboard · Active' },
  { id: 'vouchers', label: 'Vouchers & Day Book', meta: 'Workspace · Register' },
  { id: 'reports', label: 'Trial Balance, P&L & Balance Sheet', meta: 'Workspace · Reports' },
  { id: 'inventory', label: 'Inventory & FIFO Godowns', meta: 'Workspace · Stock' },
  { id: 'banking', label: 'Banking & BRS Workbench', meta: 'Workspace · Recon' },
  { id: 'tax', label: 'GST Returns (GSTR-1/2B/3B) & TDS', meta: 'Workspace · Compliance' },
  { id: 'automation', label: 'Rules, Recurring & OCR Inbox', meta: 'Workspace · Automation' },
]

function getVoucherIcon(type: VoucherType): ReactNode {
  switch (type) {
    case 'CONTRA':
      return <ArrowLeftRight className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'PAYMENT':
      return <Wallet className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'RECEIPT':
      return <Receipt className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'JOURNAL':
      return <FileText className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'SALES':
      return <ArrowUpRight className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'PURCHASE':
      return <ShoppingBag className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
  }
}

export function CommandPalette({
  open,
  onClose,
  vouchers,
  onOpenVoucher,
  onSelectNav,
  onSelectVoucher,
}: CommandPaletteProps) {
  if (!open) return null

  return (
    <CommandPaletteDialog
      onClose={onClose}
      vouchers={vouchers}
      onOpenVoucher={onOpenVoucher}
      onSelectNav={onSelectNav}
      onSelectVoucher={onSelectVoucher}
    />
  )
}

function CommandPaletteDialog({
  onClose,
  vouchers,
  onOpenVoucher,
  onSelectNav,
  onSelectVoucher,
}: Omit<CommandPaletteProps, 'open'>) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const navMethodRef = useRef<'keyboard' | 'mouse'>('keyboard')

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [])

  useEffect(() => {
    if (navMethodRef.current !== 'keyboard') return
    const container = scrollContainerRef.current
    if (!container) return
    if (activeIndex === 0) {
      container.scrollTop = 0
      return
    }
    const activeOption = container.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex]
    activeOption?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const allItems = useMemo<PaletteItem[]>(() => {
    const voucherActions: PaletteItem[] = VOUCHER_TYPE_ORDER.map((type) => {
      const meta = VOUCHER_TYPE_META[type]
      const seq = vouchers.filter((v) => v.voucherType === type).length + 43
      const nextNo = `${meta.prefix}${String(seq).padStart(4, '0')}`
      return {
        id: `action-${type}`,
        group: 'Quick Vouchers',
        icon: getVoucherIcon(type),
        label: `New ${meta.label} Voucher`,
        meta: nextNo,
        shortcut: meta.shortKey,
        onExecute: () => {
          onClose()
          onOpenVoucher(type)
        },
      }
    })

    const navItems: PaletteItem[] = WORKSPACE_COMMANDS.map((ws) => ({
      id: `nav-${ws.id}`,
      group: 'Workspaces',
      icon: <Landmark className="h-4 w-4 text-muted-text" strokeWidth={1.75} aria-hidden="true" />,
      label: ws.label,
      meta: ws.meta,
      onExecute: () => {
        onClose()
        onSelectNav(ws.id)
      },
    }))

    const ledgerItems: PaletteItem[] = SYNTHETIC_LEDGERS.slice(0, 8).map((l) => ({
      id: `ledger-${l.code}`,
      group: 'Ledgers',
      icon: <BookOpen className="h-4 w-4 text-muted-text" strokeWidth={1.75} aria-hidden="true" />,
      label: `${l.code} · ${l.name}`,
      meta: `${l.group} (${l.currency})`,
      onExecute: () => {
        onClose()
        onSelectNav('reports')
      },
    }))

    const recentVoucherItems: PaletteItem[] = vouchers.slice(0, 6).map((v) => {
      const amount = v.debit !== '0.0000' ? v.debit : v.credit
      return {
        id: `voucher-${v.id}`,
        group: 'Recent Vouchers',
        icon: getVoucherIcon(v.voucherType),
        label: v.particulars,
        meta: `${v.voucherNo} · ${formatCurrency(amount, { currency: 'INR' })}`,
        onExecute: () => {
          onClose()
          onSelectVoucher(v)
        },
      }
    })

    return [...voucherActions, ...navItems, ...ledgerItems, ...recentVoucherItems]
  }, [vouchers, onClose, onOpenVoucher, onSelectNav, onSelectVoucher])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.meta.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q),
    )
  }, [allItems, query])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      navMethodRef.current = 'keyboard'
      setActiveIndex((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      navMethodRef.current = 'keyboard'
      setActiveIndex((prev) =>
        filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length,
      )
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault()
      filtered[activeIndex].onExecute()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-palette)] flex items-start justify-center px-4 pt-[15vh] print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Go-To Command Palette"
    >
      <div
        className="fixed inset-0 bg-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-lg border border-border-strong bg-raised shadow-md">
        <div className="flex h-[52px] items-center gap-3 border-b border-border-subtle px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              navMethodRef.current = 'keyboard'
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Go To voucher, ledger, report, or shortcut (e.g. Sales, HDFC, GSTR-1)..."
            aria-label="Go-To command search"
            className="w-full bg-transparent text-[15px] font-normal text-primary-text placeholder:text-disabled-text focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={scrollContainerRef} className="max-h-[420px] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted-text">
              No matching command, ledger, or voucher for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <ul role="listbox" className="space-y-0.5">
              {filtered.map((item, idx) => {
                const isActive = idx === activeIndex
                const prevGroup = idx > 0 ? filtered[idx - 1].group : null
                const showGroupHeader = item.group !== prevGroup

                return (
                  <li key={item.id}>
                    {showGroupHeader ? (
                      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                        {item.group}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => {
                        navMethodRef.current = 'mouse'
                        setActiveIndex(idx)
                      }}
                      onClick={item.onExecute}
                      className={cn(
                        'flex h-10 w-full items-center justify-between gap-3 rounded-md px-3 text-left transition-colors duration-[var(--dur-fast)] cursor-pointer',
                        isActive
                          ? 'bg-row-selected text-primary-text shadow-[inset_2px_0_0_0_var(--accent-primary)]'
                          : 'text-primary-text hover:bg-row-hover',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {item.icon}
                        <span className="truncate text-[14px] font-medium">{item.label}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="code-mono text-[12.5px] text-muted-text">
                          {item.meta}
                        </span>
                        {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-muted px-4 py-2 text-[11px] text-muted-text">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Enter</Kbd> Open
            </span>
          </div>
          <span>Tally Go-To Engine · Alt+G</span>
        </div>
      </div>
    </div>
  )
}
