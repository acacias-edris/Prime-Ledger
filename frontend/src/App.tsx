import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Construction } from 'lucide-react'
import type { VoucherDTO } from './lib/api'
import { WORKSPACE_NAV_META, type VoucherType } from './lib/dummyData'
import type { InvoiceDetailDTO, InvoiceType } from './api/gstInventory'
import { useCompanyContext, useDayBook, useLedgers } from './hooks/useAccounting'
import { useKeymap } from './hooks/useKeymap'
import { useTheme } from './hooks/useTheme'
import { AppShell } from './components/layout/AppShell'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { CommandPalette } from './components/ui/CommandPalette'
import { EmptyState } from './components/ui/EmptyState'
import { ShortcutSheetModal } from './components/ui/ShortcutSheetModal'
import { FinancialCommandPage } from './features/dashboard/FinancialCommandPage'
import {
  QUICK_VOUCHER_FORM_ID,
  QuickVoucherDrawer,
} from './features/dashboard/QuickVoucherDrawer'
import { ChartOfAccountsView } from './features/accounting/ChartOfAccountsView'
import { DayBookView } from './features/accounting/DayBookView'
import { LedgerStatementView } from './features/accounting/LedgerStatementView'
import { TrialBalanceView } from './features/accounting/TrialBalanceView'
import { ProfitLossView } from './features/accounting/ProfitLossView'
import { BalanceSheetView } from './features/accounting/BalanceSheetView'
import {
  INVOICE_BUILDER_FORM_ID,
  InvoiceBuilderPage,
} from './features/vouchers/InvoiceBuilderPage'
import { InvoiceListPage } from './features/vouchers/InvoiceListPage'
import { TaxInvoicePrintView } from './features/vouchers/TaxInvoicePrintView'
import { InventoryPage } from './features/inventory/InventoryPage'

interface ParsedRoute {
  nav: string
  invoiceType: InvoiceType
  originalInvoiceId: number | null
  printInvoiceId: number | null
}

function parseLocationRoute(): ParsedRoute {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(window.location.search)

  if (path === '/invoices/new') {
    const rawType = (params.get('type') || 'SALES').toUpperCase()
    const validType: InvoiceType =
      rawType === 'PURCHASE' || rawType === 'CREDIT_NOTE' || rawType === 'DEBIT_NOTE'
        ? rawType
        : 'SALES'
    const rawOrig = params.get('originalId')
    const origNum = rawOrig ? Number.parseInt(rawOrig, 10) : NaN
    return {
      nav: validType === 'PURCHASE' ? 'new-purchase' : 'new-sale',
      invoiceType: validType,
      originalInvoiceId: Number.isFinite(origNum) && origNum > 0 ? origNum : null,
      printInvoiceId: null,
    }
  }

  const printMatch = path.match(/^\/invoices\/(\d+)\/print$/)
  if (printMatch) {
    return {
      nav: 'invoice-print',
      invoiceType: 'SALES',
      originalInvoiceId: null,
      printInvoiceId: Number.parseInt(printMatch[1], 10),
    }
  }

  if (path === '/invoices') {
    return { nav: 'invoices', invoiceType: 'SALES', originalInvoiceId: null, printInvoiceId: null }
  }
  if (path === '/inventory') {
    return { nav: 'inventory', invoiceType: 'SALES', originalInvoiceId: null, printInvoiceId: null }
  }
  const simpleMap: Record<string, string> = {
    '/coa': 'coa',
    '/daybook': 'daybook',
    '/ledger-statement': 'ledger-statement',
    '/trial-balance': 'trial-balance',
    '/profit-loss': 'profit-loss',
    '/balance-sheet': 'balance-sheet',
  }
  return {
    nav: simpleMap[path] ?? 'dashboard',
    invoiceType: 'SALES',
    originalInvoiceId: null,
    printInvoiceId: null,
  }
}

export default function App() {
  const { theme, toggleTheme } = useTheme()

  const initialRoute = useMemo(() => parseLocationRoute(), [])
  const [activeNav, setActiveNav] = useState<string>(initialRoute.nav)
  const [invoiceBuilderType, setInvoiceBuilderType] = useState<InvoiceType>(
    initialRoute.invoiceType,
  )
  const [originalInvoiceId, setOriginalInvoiceId] = useState<number | null>(
    initialRoute.originalInvoiceId,
  )
  const [printInvoiceId, setPrintInvoiceId] = useState<number | null>(
    initialRoute.printInvoiceId,
  )

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerVoucherType, setDrawerVoucherType] = useState<VoucherType>('JOURNAL')

  const [selectedVoucherId, setSelectedVoucherId] = useState<number | null>(null)
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const companyQuery = useCompanyContext()
  const dayBookQuery = useDayBook()
  const ledgersQuery = useLedgers()

  const vouchers = useMemo(() => dayBookQuery.data?.vouchers ?? [], [dayBookQuery.data])
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])

  const pushPath = useCallback((url: string) => {
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, '', url)
    }
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseLocationRoute()
      setActiveNav(parsed.nav)
      setInvoiceBuilderType(parsed.invoiceType)
      setOriginalInvoiceId(parsed.originalInvoiceId)
      setPrintInvoiceId(parsed.printInvoiceId)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => setToastMessage(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const navigateToNewInvoice = useCallback(
    (type: InvoiceType, origId?: number) => {
      setDrawerOpen(false)
      setPaletteOpen(false)
      setShortcutSheetOpen(false)
      setMobileNavOpen(false)
      setInvoiceBuilderType(type)
      setOriginalInvoiceId(origId ?? null)
      setActiveNav(type === 'PURCHASE' ? 'new-purchase' : 'new-sale')
      const qs = new URLSearchParams({ type })
      if (origId) qs.set('originalId', String(origId))
      pushPath(`/invoices/new?${qs.toString()}`)
    },
    [pushPath],
  )

  const navigateToPrintInvoice = useCallback(
    (invoiceId: number) => {
      setDrawerOpen(false)
      setPaletteOpen(false)
      setPrintInvoiceId(invoiceId)
      setActiveNav('invoice-print')
      pushPath(`/invoices/${invoiceId}/print`)
    },
    [pushPath],
  )

  const handleSelectNav = useCallback(
    (navId: string) => {
      if (navId === 'new-sale') {
        navigateToNewInvoice('SALES')
        return
      }
      if (navId === 'new-purchase') {
        navigateToNewInvoice('PURCHASE')
        return
      }
      setActiveNav(navId)
      const pathMap: Record<string, string> = {
        dashboard: '/',
        invoices: '/invoices',
        inventory: '/inventory',
        coa: '/coa',
        daybook: '/daybook',
        'ledger-statement': '/ledger-statement',
        'trial-balance': '/trial-balance',
        'profit-loss': '/profit-loss',
        'balance-sheet': '/balance-sheet',
      }
      if (pathMap[navId]) {
        pushPath(pathMap[navId])
      }
    },
    [navigateToNewInvoice, pushPath],
  )

  const handleOpenVoucher = useCallback(
    (type: VoucherType) => {
      if (type === 'SALES') {
        navigateToNewInvoice('SALES')
        return
      }
      if (type === 'PURCHASE') {
        navigateToNewInvoice('PURCHASE')
        return
      }
      setPaletteOpen(false)
      setShortcutSheetOpen(false)
      setMobileNavOpen(false)
      setDrawerVoucherType(type)
      setDrawerOpen(true)
    },
    [navigateToNewInvoice],
  )

  const handleTogglePalette = useCallback(() => {
    setMobileNavOpen(false)
    setShortcutSheetOpen(false)
    setPaletteOpen((prev) => !prev)
  }, [])

  const handleToggleShortcutSheet = useCallback(() => {
    setPaletteOpen(false)
    setMobileNavOpen(false)
    setShortcutSheetOpen((prev) => !prev)
  }, [])

  const handleEscape = useCallback(() => {
    if (shortcutSheetOpen) {
      setShortcutSheetOpen(false)
    } else if (paletteOpen) {
      setPaletteOpen(false)
    } else if (drawerOpen) {
      setDrawerOpen(false)
    } else if (mobileNavOpen) {
      setMobileNavOpen(false)
    } else if (selectedVoucherId !== null) {
      setSelectedVoucherId(null)
    }
  }, [shortcutSheetOpen, paletteOpen, drawerOpen, mobileNavOpen, selectedVoucherId])

  const isInvoiceBuilderActive = activeNav === 'new-sale' || activeNav === 'new-purchase'

  const handleSubmitActiveForm = useCallback(() => {
    if (drawerOpen) {
      const form = document.getElementById(QUICK_VOUCHER_FORM_ID) as HTMLFormElement | null
      form?.requestSubmit()
      return
    }
    if (isInvoiceBuilderActive) {
      const invForm = document.getElementById(INVOICE_BUILDER_FORM_ID) as HTMLFormElement | null
      invForm?.requestSubmit()
    }
  }, [drawerOpen, isInvoiceBuilderActive])

  useKeymap({
    onOpenCommandPalette: handleTogglePalette,
    onOpenVoucher: handleOpenVoucher,
    onEscape: handleEscape,
    onSubmitActiveForm: handleSubmitActiveForm,
    onToggleShortcutSheet: handleToggleShortcutSheet,
    isFormSubmitEnabled: drawerOpen || isInvoiceBuilderActive,
  })

  const handleVoucherPosted = useCallback((created: VoucherDTO) => {
    setSelectedVoucherId(created.id)
    setToastMessage(`Posted ${created.voucher_number} (${created.voucher_type})`)
  }, [])

  const handleOpenLedgerStatement = useCallback(
    (ledgerId: number) => {
      setSelectedLedgerId(ledgerId)
      handleSelectNav('ledger-statement')
    },
    [handleSelectNav],
  )

  const handleInvoiceSaved = useCallback(
    (created: InvoiceDetailDTO, openPrint: boolean) => {
      setToastMessage(
        `${created.status === 'POSTED' ? 'Posted' : 'Saved draft'} ${created.invoice_number} (${created.invoice_type})`,
      )
      if (openPrint) {
        navigateToPrintInvoice(created.id)
      } else {
        handleSelectNav('invoices')
      }
    },
    [handleSelectNav, navigateToPrintInvoice],
  )

  const activeNavMeta = WORKSPACE_NAV_META.find((n) => n.id === activeNav)

  const renderWorkspace = () => {
    switch (activeNav) {
      case 'dashboard':
        return (
          <FinancialCommandPage
            selectedVoucherId={selectedVoucherId}
            onSelectVoucher={(v) => setSelectedVoucherId(v?.id ?? null)}
            onOpenVoucher={handleOpenVoucher}
            onOpenLedgerStatement={handleOpenLedgerStatement}
            onNavigateReport={handleSelectNav}
            onNotify={setToastMessage}
          />
        )
      case 'invoices':
        return (
          <InvoiceListPage
            onNewInvoice={navigateToNewInvoice}
            onPrintInvoice={navigateToPrintInvoice}
            onNotify={setToastMessage}
          />
        )
      case 'new-sale':
      case 'new-purchase':
        return (
          <InvoiceBuilderPage
            initialType={invoiceBuilderType}
            initialOriginalId={originalInvoiceId}
            onBack={() => handleSelectNav('invoices')}
            onSaved={handleInvoiceSaved}
          />
        )
      case 'invoice-print':
        return printInvoiceId ? (
          <TaxInvoicePrintView
            invoiceId={printInvoiceId}
            onBack={() => handleSelectNav('invoices')}
          />
        ) : (
          <InvoiceListPage
            onNewInvoice={navigateToNewInvoice}
            onPrintInvoice={navigateToPrintInvoice}
            onNotify={setToastMessage}
          />
        )
      case 'inventory':
        return <InventoryPage onNotify={setToastMessage} />
      case 'coa':
        return (
          <ChartOfAccountsView
            onOpenLedgerStatement={handleOpenLedgerStatement}
            onNotify={setToastMessage}
          />
        )
      case 'daybook':
        return (
          <DayBookView
            onOpenVoucher={handleOpenVoucher}
            onOpenLedgerStatement={handleOpenLedgerStatement}
            onNotify={setToastMessage}
          />
        )
      case 'ledger-statement':
        return (
          <LedgerStatementView
            selectedLedgerId={selectedLedgerId}
            onSelectLedger={setSelectedLedgerId}
            onBackToCoa={() => handleSelectNav('coa')}
          />
        )
      case 'trial-balance':
        return <TrialBalanceView onOpenLedgerStatement={handleOpenLedgerStatement} />
      case 'profit-loss':
        return <ProfitLossView onOpenLedgerStatement={handleOpenLedgerStatement} />
      case 'balance-sheet':
        return <BalanceSheetView onOpenLedgerStatement={handleOpenLedgerStatement} />
      default:
        return (
          <Card className="my-4">
            <EmptyState
              icon={<Construction className="h-5 w-5" strokeWidth={1.75} />}
              title={`${activeNavMeta?.label ?? 'Workspace'} — Scheduled for ${activeNavMeta?.milestoneTag ?? 'Upcoming Milestone'}`}
              description="Milestone 3 completes GST Billing, Perpetual FIFO/WAC Inventory, and A4 Tax Invoice printing."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="primary" onClick={() => handleSelectNav('dashboard')}>
                    Return to Dashboard
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenVoucher('SALES')}
                    shortcut="F8"
                  >
                    New Sales Invoice
                  </Button>
                </div>
              }
            />
          </Card>
        )
    }
  }

  return (
    <>
      <AppShell
        activeNav={activeNav}
        onSelectNav={handleSelectNav}
        company={companyQuery.data}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenVoucher={handleOpenVoucher}
        onOpenShortcutSheet={() => setShortcutSheetOpen(true)}
        mobileNavOpen={mobileNavOpen}
        onSetMobileNavOpen={setMobileNavOpen}
        hidePrintLetterhead={activeNav === 'invoice-print'}
      >
        {renderWorkspace()}
      </AppShell>

      <QuickVoucherDrawer
        open={drawerOpen}
        voucherType={drawerVoucherType}
        onChangeVoucherType={setDrawerVoucherType}
        onClose={() => setDrawerOpen(false)}
        onVoucherPosted={handleVoucherPosted}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        vouchers={vouchers}
        ledgers={ledgers}
        onOpenVoucher={handleOpenVoucher}
        onSelectNav={handleSelectNav}
        onSelectLedger={handleOpenLedgerStatement}
        onSelectVoucher={(v) => {
          handleSelectNav('dashboard')
          setSelectedVoucherId(v.id)
        }}
      />

      <ShortcutSheetModal
        open={shortcutSheetOpen}
        onClose={() => setShortcutSheetOpen(false)}
      />

      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-5 right-5 z-[var(--z-toast)] flex items-center gap-2 rounded-md border border-[var(--status-success-border)] bg-raised px-4 py-3 text-[13px] font-medium text-primary-text shadow-md print:hidden"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />
          <span>{toastMessage}</span>
        </div>
      ) : null}
    </>
  )
}
