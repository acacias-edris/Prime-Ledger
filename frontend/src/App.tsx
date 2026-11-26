import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Construction } from 'lucide-react'
import type { VoucherDTO } from './lib/api'
import { WORKSPACE_NAV_META, type VoucherType } from './lib/dummyData'
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

export default function App() {
  const { theme, toggleTheme } = useTheme()

  const [activeNav, setActiveNav] = useState<string>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerVoucherType, setDrawerVoucherType] = useState<VoucherType>('SALES')

  const [selectedVoucherId, setSelectedVoucherId] = useState<number | null>(null)
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const companyQuery = useCompanyContext()
  const dayBookQuery = useDayBook()
  const ledgersQuery = useLedgers()

  const vouchers = useMemo(() => dayBookQuery.data?.vouchers ?? [], [dayBookQuery.data])
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => setToastMessage(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const handleOpenVoucher = useCallback((type: VoucherType) => {
    setPaletteOpen(false)
    setShortcutSheetOpen(false)
    setMobileNavOpen(false)
    setDrawerVoucherType(type)
    setDrawerOpen(true)
  }, [])

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

  const handleSubmitActiveForm = useCallback(() => {
    const form = document.getElementById(QUICK_VOUCHER_FORM_ID) as HTMLFormElement | null
    form?.requestSubmit()
  }, [])

  useKeymap({
    onOpenCommandPalette: handleTogglePalette,
    onOpenVoucher: handleOpenVoucher,
    onEscape: handleEscape,
    onSubmitActiveForm: handleSubmitActiveForm,
    onToggleShortcutSheet: handleToggleShortcutSheet,
    isFormSubmitEnabled: drawerOpen,
  })

  const handleVoucherPosted = useCallback((created: VoucherDTO) => {
    setSelectedVoucherId(created.id)
    setToastMessage(`Posted ${created.voucher_number} (${created.voucher_type})`)
  }, [])

  const handleOpenLedgerStatement = useCallback((ledgerId: number) => {
    setSelectedLedgerId(ledgerId)
    setActiveNav('ledger-statement')
  }, [])

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
            onNavigateReport={setActiveNav}
            onNotify={setToastMessage}
          />
        )
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
            onBackToCoa={() => setActiveNav('coa')}
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
              description="Milestone 2 completes the live double-entry FastAPI backend, Chart of Accounts, Day Book, Ledger Statements, Trial Balance, P&L, and Balance Sheet."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="primary" onClick={() => setActiveNav('dashboard')}>
                    Return to Dashboard
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenVoucher('SALES')}
                    shortcut="F8"
                  >
                    New Voucher
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
        onSelectNav={setActiveNav}
        company={companyQuery.data}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenVoucher={handleOpenVoucher}
        onOpenShortcutSheet={() => setShortcutSheetOpen(true)}
        mobileNavOpen={mobileNavOpen}
        onSetMobileNavOpen={setMobileNavOpen}
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
        onSelectNav={setActiveNav}
        onSelectLedger={handleOpenLedgerStatement}
        onSelectVoucher={(v) => {
          setActiveNav('dashboard')
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
