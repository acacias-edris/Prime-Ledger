import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  ChevronDown,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  ListTree,
  Menu,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Scale,
  Search,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { CompanyContextDTO } from '../../lib/api'
import {
  COMPANY_PROFILE,
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type VoucherType,
} from '../../lib/dummyData'
import type { ThemeMode } from '../../hooks/useTheme'
import { Kbd } from '../ui/Kbd'

export interface NavItem {
  id: string
  label: string
  section: 'core' | 'upcoming'
  milestoneTag?: string
  icon: ReactNode
}

const APP_NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    section: 'core',
    icon: <LayoutDashboard className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'coa',
    label: 'Chart of Accounts',
    section: 'core',
    icon: <ListTree className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'daybook',
    label: 'Day Book',
    section: 'core',
    icon: <FileText className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'ledger-statement',
    label: 'Ledger Statement',
    section: 'core',
    icon: <BookOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'trial-balance',
    label: 'Trial Balance',
    section: 'core',
    icon: <Scale className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'profit-loss',
    label: 'Profit & Loss',
    section: 'core',
    icon: <TrendingUp className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'balance-sheet',
    label: 'Balance Sheet',
    section: 'core',
    icon: <FileSpreadsheet className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    section: 'upcoming',
    milestoneTag: 'M3',
    icon: <Package className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'banking',
    label: 'Banking & BRS',
    section: 'upcoming',
    milestoneTag: 'M4',
    icon: <Landmark className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'tax',
    label: 'GST & Tax',
    section: 'upcoming',
    milestoneTag: 'M5',
    icon: <FileCheck2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'automation',
    label: 'Automation',
    section: 'upcoming',
    milestoneTag: 'M7',
    icon: <Bot className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
]

export interface AppShellProps {
  activeNav: string
  onSelectNav: (id: string) => void
  company?: CompanyContextDTO
  theme: ThemeMode
  onToggleTheme: () => void
  onOpenCommandPalette: () => void
  onOpenVoucher: (type: VoucherType) => void
  onOpenShortcutSheet: () => void
  mobileNavOpen: boolean
  onSetMobileNavOpen: (open: boolean) => void
  children: ReactNode
}

export function AppShell({
  activeNav,
  onSelectNav,
  company,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenVoucher,
  onOpenShortcutSheet,
  mobileNavOpen,
  onSetMobileNavOpen,
  children,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [splitMenuOpen, setSplitMenuOpen] = useState(false)
  const splitMenuRef = useRef<HTMLDivElement>(null)

  const companyName = company?.legal_name ?? COMPANY_PROFILE.legalName
  const fyLabel = company?.active_fiscal_year.label ?? COMPANY_PROFILE.fiscalYear
  const gstin = company?.gstin ?? COMPANY_PROFILE.gstin
  const stateLabel = company
    ? `${company.state_code} · ${company.country_code} (${company.base_currency})`
    : COMPANY_PROFILE.stateLabel

  useEffect(() => {
    if (!splitMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(event.target as Node)) {
        setSplitMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [splitMenuOpen])

  const coreNav = APP_NAV_ITEMS.filter((i) => i.section === 'core')
  const upcomingNav = APP_NAV_ITEMS.filter((i) => i.section === 'upcoming')

  const renderNavButton = (item: NavItem, isMobile: boolean) => {
    const isActive = item.id === activeNav
    const showLabel = isMobile || !sidebarCollapsed

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onSelectNav(item.id)
          if (isMobile) onSetMobileNavOpen(false)
        }}
        title={!showLabel ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex h-[var(--control-h)] w-full items-center rounded-md px-3 text-[14px] font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] cursor-pointer',
          showLabel ? 'justify-between gap-2' : 'justify-center',
          isActive
            ? 'bg-muted text-primary-text shadow-[inset_3px_0_0_0_var(--accent-primary)]'
            : 'text-muted-text hover:bg-row-hover hover:text-primary-text',
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={cn(isActive ? 'text-accent' : 'text-muted-text')}>
            {item.icon}
          </span>
          {showLabel ? <span className="truncate">{item.label}</span> : null}
        </span>
        {showLabel && item.milestoneTag ? (
          <span className="code-mono text-[10px] font-semibold uppercase text-disabled-text">
            {item.milestoneTag}
          </span>
        ) : null}
      </button>
    )
  }

  const renderNavList = (isMobile: boolean) => (
    <nav aria-label="Primary Workspace Navigation" className="flex-1 overflow-y-auto px-2.5 py-3">
      <div className="space-y-1">{coreNav.map((item) => renderNavButton(item, isMobile))}</div>
      <div className="my-3 border-t border-border-subtle" />
      {(isMobile || !sidebarCollapsed) ? (
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-disabled-text">
          Upcoming Modules
        </p>
      ) : null}
      <div className="space-y-1">
        {upcomingNav.map((item) => renderNavButton(item, isMobile))}
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-canvas text-primary-text flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex lg:flex-col lg:shrink-0 border-r border-border-subtle bg-chrome transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)] print:hidden',
          sidebarCollapsed ? 'w-[68px]' : 'w-[240px]',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border-subtle px-3.5">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono text-[13px] font-bold">
                LP
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-primary-text">
                  LedgerPrime
                </p>
                <p className="truncate font-mono text-[11px] text-muted-text">
                  v0.2 · Live Books
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono text-[13px] font-bold">
              LP
            </div>
          )}

          {!sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-primary-text cursor-pointer"
            >
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>

        {sidebarCollapsed ? (
          <div className="flex justify-center border-b border-border-subtle py-2">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expand sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-primary-text cursor-pointer"
            >
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        ) : null}

        {renderNavList(false)}

        {!sidebarCollapsed ? (
          <div className="border-t border-border-subtle p-3.5">
            <div className="rounded-md border border-border-subtle bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="type-xs uppercase text-muted-text">GSTIN · Synthetic</p>
                <BarChart3 className="h-3.5 w-3.5 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <p className="mt-0.5 code-mono text-[12px] font-medium text-primary-text">
                {gstin}
              </p>
              <p className="mt-1 text-[11px] text-muted-text">{stateLabel}</p>
            </div>
          </div>
        ) : null}
      </aside>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-[var(--z-drawer)] flex lg:hidden print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          <div
            className="fixed inset-0 bg-backdrop"
            onClick={() => onSetMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex h-full w-[264px] max-w-[82vw] flex-col border-r border-border-strong bg-raised shadow-md">
            <div className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono text-[13px] font-bold">
                  LP
                </div>
                <span className="text-[15px] font-bold text-primary-text">
                  LedgerPrime
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSetMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-primary-text cursor-pointer"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>

            {renderNavList(true)}

            <div className="border-t border-border-subtle p-4 space-y-3">
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex h-11 w-full items-center justify-between rounded-md border border-border-input bg-surface px-3 text-[13px] font-medium text-primary-text hover:bg-muted cursor-pointer"
              >
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-muted-text" strokeWidth={1.75} />
                ) : (
                  <Moon className="h-4 w-4 text-muted-text" strokeWidth={1.75} />
                )}
              </button>

              <div>
                <p className="text-[12px] font-semibold text-primary-text">{companyName}</p>
                <p className="mt-0.5 code-mono text-[11px] text-muted-text">
                  {fyLabel} · {gstin}
                </p>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky 56px Topbar */}
        <header className="sticky top-0 z-[var(--z-topbar)] flex h-14 items-center justify-between gap-2 border-b border-border-subtle bg-chrome px-4 lg:px-6 print:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => onSetMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border-input bg-surface text-primary-text hover:bg-muted lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <div className="flex min-w-0 min-h-[40px] items-center gap-2 rounded-md border border-border-input bg-surface px-2.5 py-1.5">
              <Building2
                className="hidden sm:block h-4 w-4 shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <span className="truncate text-[15px] sm:text-[14px] font-semibold leading-tight text-primary-text max-w-[160px] sm:max-w-[260px] md:max-w-none">
                  {companyName}
                </span>
                <span className="shrink-0 code-mono text-[11px] font-semibold text-muted-text sm:rounded-sm sm:border sm:border-border-subtle sm:bg-muted sm:px-1.5 sm:py-0.5">
                  {fyLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="Open Go-To command palette (Alt+G)"
              className="flex h-11 w-11 md:h-[var(--control-h)] md:w-auto items-center justify-center md:justify-start gap-2 rounded-md border border-border-input bg-surface md:px-3 text-[13px] text-muted-text hover:bg-muted hover:text-primary-text transition-colors duration-[var(--dur-fast)] cursor-pointer"
            >
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden md:inline">Go To ledger, voucher...</span>
              <Kbd className="hidden md:inline-flex">Alt+G</Kbd>
            </button>

            <button
              type="button"
              onClick={onOpenShortcutSheet}
              aria-label="Keyboard shortcuts (?)"
              title="Tally Keyboard Shortcuts (?)"
              className="hidden md:flex h-[var(--control-h)] w-[var(--control-h)] shrink-0 items-center justify-center rounded-md border border-border-input bg-surface text-muted-text hover:bg-muted hover:text-primary-text transition-colors duration-[var(--dur-fast)] cursor-pointer"
            >
              <HelpCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="hidden lg:flex h-[var(--control-h)] w-[var(--control-h)] shrink-0 items-center justify-center rounded-md border border-border-input bg-surface text-primary-text hover:bg-muted transition-colors duration-[var(--dur-fast)] cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenVoucher('SALES')}
              aria-label="New Voucher"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground hover:bg-accent-hover sm:hidden cursor-pointer"
            >
              <Plus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </button>

            <div ref={splitMenuRef} className="relative hidden sm:inline-flex">
              <button
                type="button"
                onClick={() => onOpenVoucher('SALES')}
                className="inline-flex h-[var(--control-h)] items-center gap-2 rounded-l-md bg-accent px-3.5 text-[14px] font-medium text-accent-foreground hover:bg-accent-hover transition-colors duration-[var(--dur-fast)] cursor-pointer"
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                <span>New Voucher</span>
                <Kbd variant="on-accent">F8</Kbd>
              </button>
              <button
                type="button"
                aria-label="Choose voucher type"
                aria-expanded={splitMenuOpen}
                aria-haspopup="menu"
                onClick={() => setSplitMenuOpen((prev) => !prev)}
                className="inline-flex h-[var(--control-h)] w-9 items-center justify-center rounded-r-md border-l border-[var(--kbd-on-primary-border)] bg-accent text-accent-foreground hover:bg-accent-hover transition-colors duration-[var(--dur-fast)] cursor-pointer"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>

              {splitMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Voucher types"
                  className="absolute right-0 top-[calc(100%+6px)] z-[var(--z-modal)] w-56 rounded-md border border-border-strong bg-raised p-1.5 shadow-md"
                >
                  {VOUCHER_TYPE_ORDER.map((type) => {
                    const meta = VOUCHER_TYPE_META[type]
                    return (
                      <button
                        key={type}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSplitMenuOpen(false)
                          onOpenVoucher(type)
                        }}
                        className="flex h-9 w-full items-center justify-between rounded-sm px-2.5 text-left text-[13px] font-medium text-primary-text hover:bg-row-hover cursor-pointer"
                      >
                        <span>{meta.label}</span>
                        <Kbd>{meta.shortKey}</Kbd>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Print-Only Statutory Letterhead */}
        <div className="hidden print:block border-b-2 border-border-strong px-2 pb-3 mb-4">
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="text-[18px] font-bold text-primary-text">{companyName}</h1>
              <p className="code-mono text-[12px] text-muted-text">
                GSTIN: {gstin} · {stateLabel}
              </p>
            </div>
            <div className="text-right code-mono text-[12px] text-muted-text">
              <p>{fyLabel}</p>
              <p>Generated from LedgerPrime</p>
            </div>
          </div>
        </div>

        {/* Workspace Canvas */}
        <main className="w-full max-w-[1360px] flex-1 px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-6">
          {children}
        </main>

        {/* Mobile Sticky Bottom Action Bar */}
        <div className="fixed inset-x-0 bottom-0 z-[var(--z-topbar)] flex items-center gap-2 border-t border-border-subtle bg-chrome px-4 py-2 pb-[calc(8px+env(safe-area-inset-bottom))] md:hidden print:hidden">
          <button
            type="button"
            onClick={() => onOpenVoucher('PAYMENT')}
            className="flex h-12 flex-1 items-center justify-center rounded-md border border-border-input bg-surface text-[14px] font-medium text-primary-text active:bg-row-hover cursor-pointer"
          >
            Payment
          </button>
          <button
            type="button"
            onClick={() => onOpenVoucher('RECEIPT')}
            className="flex h-12 flex-1 items-center justify-center rounded-md border border-border-input bg-surface text-[14px] font-medium text-primary-text active:bg-row-hover cursor-pointer"
          >
            Receipt
          </button>
          <button
            type="button"
            onClick={() => onOpenVoucher('SALES')}
            className="flex h-12 flex-[1.4] items-center justify-center gap-1.5 rounded-md bg-accent text-[14px] font-medium text-accent-foreground active:brightness-95 cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span>New Voucher</span>
          </button>
        </div>
      </div>
    </div>
  )
}
