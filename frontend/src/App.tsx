import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Construction } from 'lucide-react'
import {
  INITIAL_VOUCHERS,
  WORKSPACE_NAV_META,
  type DayBookVoucher,
  type VoucherType,
} from './lib/dummyData'
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

export default function App() {
  const { theme, toggleTheme } = useTheme()

  const [activeNav, setActiveNav] = useState<string>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerVoucherType, setDrawerVoucherType] = useState<VoucherType>('SALES')

  const [vouchers, setVouchers] = useState<DayBookVoucher[]>(INITIAL_VOUCHERS)
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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
    } else if (selectedVoucherId) {
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

  const handlePostVoucher = useCallback((newVoucher: DayBookVoucher) => {
    setVouchers((prev) => [newVoucher, ...prev])
    setActiveNav('dashboard')
    setSelectedVoucherId(newVoucher.id)
    setToastMessage(`Posted ${newVoucher.voucherNo} (${newVoucher.voucherType})`)
  }, [])

  const nextSequenceNumber =
    vouchers.filter((v) => v.voucherType === drawerVoucherType).length + 43

  const activeNavMeta = WORKSPACE_NAV_META.find((n) => n.id === activeNav)

  return (
    <>
      <AppShell
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenVoucher={handleOpenVoucher}
        onOpenShortcutSheet={() => setShortcutSheetOpen(true)}
        mobileNavOpen={mobileNavOpen}
        onSetMobileNavOpen={setMobileNavOpen}
      >
        {activeNav === 'dashboard' ? (
          <FinancialCommandPage
            vouchers={vouchers}
            selectedVoucherId={selectedVoucherId}
            onSelectVoucher={(v) => setSelectedVoucherId(v?.id ?? null)}
            onOpenVoucher={handleOpenVoucher}
          />
        ) : (
          <Card className="my-4">
            <EmptyState
              icon={<Construction className="h-5 w-5" strokeWidth={1.75} />}
              title={`${activeNavMeta?.label ?? 'Workspace'} — Scheduled for ${activeNavMeta?.milestoneTag ?? 'Upcoming Milestone'}`}
              description="Milestone 1 (Visual North Star) locks the design system, UI primitives, Tally keyboard engine, and Financial Command Center before wiring FastAPI and secondary workspaces."
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
                    Test Quick Voucher
                  </Button>
                </div>
              }
            />
          </Card>
        )}
      </AppShell>

      <QuickVoucherDrawer
        open={drawerOpen}
        voucherType={drawerVoucherType}
        nextSequenceNumber={nextSequenceNumber}
        onChangeVoucherType={setDrawerVoucherType}
        onClose={() => setDrawerOpen(false)}
        onPostVoucher={handlePostVoucher}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        vouchers={vouchers}
        onOpenVoucher={handleOpenVoucher}
        onSelectNav={setActiveNav}
        onSelectVoucher={(v) => {
          setActiveNav('dashboard')
          setSelectedVoucherId(v.id)
        }}
      />

      <ShortcutSheetModal
        open={shortcutSheetOpen}
        onClose={() => setShortcutSheetOpen(false)}
      />

      {/* Non-intrusive Confirmation Toast */}
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
