import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Info,
  Landmark,
  Printer,
  RefreshCw,
  RotateCcw,
  Rows3,
  Rows4,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ApiVoucherStatus, ApiVoucherType, DrCr, VoucherDTO } from '../../lib/api'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
  formatShortDate,
  parseDateBlock,
  splitCurrencyParts,
} from '../../lib/format'
import { COMPLIANCE_SNAPSHOT, type VoucherType } from '../../lib/dummyData'
import {
  useCancelVoucher,
  useDashboardKPIs,
  useDayBook,
} from '../../hooks/useAccounting'
import { Badge, StatusIndicator, type BadgeVariant } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
  type TableDensity,
} from '../../components/ui/DataTable'

export interface FinancialCommandPageProps {
  selectedVoucherId: number | null
  onSelectVoucher: (voucher: VoucherDTO | null) => void
  onOpenVoucher: (type: VoucherType) => void
  onOpenLedgerStatement: (ledgerId: number) => void
  onNavigateReport: (navId: string) => void
  onNotify: (message: string) => void
}

type VoucherFilter = 'ALL' | VoucherType

const FILTER_PILLS: Array<{ id: VoucherFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'SALES', label: 'Sales' },
  { id: 'PURCHASE', label: 'Purchase' },
  { id: 'PAYMENT', label: 'Payment' },
  { id: 'RECEIPT', label: 'Receipt' },
  { id: 'JOURNAL', label: 'Journal' },
  { id: 'CONTRA', label: 'Contra' },
]

function getStatusVariant(status: ApiVoucherStatus): BadgeVariant {
  if (status === 'POSTED') return 'success'
  if (status === 'DRAFT') return 'warning'
  return 'neutral'
}

function getRegisterDisplaySides(v: VoucherDTO): { debit: string; credit: string } {
  if (v.voucher_type === 'PURCHASE' || v.voucher_type === 'PAYMENT') {
    return { debit: '0.0000', credit: v.total_credit }
  }
  if (v.voucher_type === 'SALES' || v.voucher_type === 'RECEIPT') {
    return { debit: v.total_debit, credit: '0.0000' }
  }
  return { debit: v.total_debit, credit: v.total_credit }
}

function KpiHeroAmount({ value, side }: { value: string; side: DrCr }) {
  const parts = splitCurrencyParts(value, 'INR')
  const sideLabel = side === 'DR' ? 'Dr' : 'Cr'
  return (
    <p className="mt-2 type-kpi leading-[1.15]">
      {parts.isNegative ? <span className="mr-0.5">&#x2212;</span> : null}
      <span className="text-[0.6em] font-medium text-muted-text">{parts.symbol}</span>
      <span>{parts.integer}</span>
      <span className="text-[0.6em] font-medium text-muted-text">{parts.fraction}</span>
      <span className="ml-1 text-[12.5px] font-medium tracking-normal text-muted-text">
        {sideLabel}
      </span>
    </p>
  )
}

export function FinancialCommandPage({
  selectedVoucherId,
  onSelectVoucher,
  onOpenVoucher,
  onOpenLedgerStatement,
  onNavigateReport,
  onNotify,
}: FinancialCommandPageProps) {
  const [activeFilter, setActiveFilter] = useState<VoucherFilter>('ALL')
  const [density, setDensity] = useState<TableDensity>('comfortable')

  const kpisQuery = useDashboardKPIs()
  const dayBookQuery = useDayBook()
  const cancelVoucher = useCancelVoucher()

  const allVouchers = useMemo(
    () => dayBookQuery.data?.vouchers ?? [],
    [dayBookQuery.data],
  )

  const filteredVouchers = useMemo(() => {
    if (activeFilter === 'ALL') return allVouchers
    return allVouchers.filter((v) => v.voucher_type === (activeFilter as ApiVoucherType))
  }, [allVouchers, activeFilter])

  const selectedVoucher = useMemo(
    () => allVouchers.find((v) => v.id === selectedVoucherId) ?? null,
    [allVouchers, selectedVoucherId],
  )

  const handleVoucherAction = async (voucher: VoucherDTO, createReversal: boolean) => {
    try {
      const res = await cancelVoucher.mutateAsync({
        voucherId: voucher.id,
        createReversal,
        reason: createReversal
          ? 'Mirror reversal posted from Financial Command Center'
          : 'Cancelled from Financial Command Center',
      })
      if (res.action === 'REVERSED' && res.reversal_voucher) {
        onNotify(
          `Posted reversal ${res.reversal_voucher.voucher_number} for ${voucher.voucher_number}`,
        )
      } else {
        onNotify(`Cancelled ${voucher.voucher_number} (preserved for audit trail)`)
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update voucher status')
    }
  }

  const columns = useMemo<DataTableColumnDef<VoucherDTO>[]>(
    () => [
      {
        accessorKey: 'voucher_date',
        header: 'Date',
        meta: { align: 'left', width: '76px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              title={formatDisplayDate(row.original.voucher_date)}
              className={cn(
                'code-mono text-[13px] text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatShortDate(row.original.voucher_date)}
            </span>
          )
        },
      },
      {
        accessorKey: 'voucher_number',
        header: 'Voucher No.',
        meta: { align: 'left', mono: true, width: '148px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 code-mono text-[13px] font-medium text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-text/60" aria-hidden="true" />
              <span>{row.original.voucher_number}</span>
            </span>
          )
        },
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const v = row.original
          const cancelled = v.status === 'CANCELLED'
          return (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p
                  title={v.particulars}
                  className={cn(
                    'truncate text-[14px] font-medium leading-snug text-primary-text',
                    cancelled && 'line-through text-disabled-text',
                  )}
                >
                  {v.particulars}
                </p>
                {v.status !== 'POSTED' ? (
                  <StatusIndicator variant={getStatusVariant(v.status)} className="shrink-0">
                    {v.status === 'CANCELLED' ? 'Cancelled' : 'Draft'}
                  </StatusIndicator>
                ) : v.reversed_voucher_id ? (
                  <StatusIndicator variant="accent" className="shrink-0">
                    Reversal
                  </StatusIndicator>
                ) : null}
              </div>
              {density === 'comfortable' ? (
                <p
                  title={v.narration}
                  className="mt-0.5 truncate text-[12.5px] font-normal leading-tight text-muted-text"
                >
                  {v.narration}
                </p>
              ) : null}
            </div>
          )
        },
      },
      {
        id: 'register_debit',
        header: 'Debit (₹)',
        accessorFn: (row) => getRegisterDisplaySides(row).debit,
        meta: { align: 'right', mono: true, width: '124px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          const formatted = formatBookAmountCell(
            getRegisterDisplaySides(row.original).debit,
            'INR',
          )
          return (
            <span
              aria-label={formatted.isNil ? 'nil' : `${formatted.text} rupees debit`}
              className={cn(
                'code-mono text-[14px] font-medium',
                formatted.isNil ? 'text-muted-text' : 'text-primary-text',
                cancelled && !formatted.isNil && 'line-through text-disabled-text',
              )}
            >
              {formatted.text}
            </span>
          )
        },
      },
      {
        id: 'register_credit',
        header: 'Credit (₹)',
        accessorFn: (row) => getRegisterDisplaySides(row).credit,
        meta: {
          align: 'right',
          mono: true,
          width: '124px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          const formatted = formatBookAmountCell(
            getRegisterDisplaySides(row.original).credit,
            'INR',
          )
          return (
            <span
              aria-label={formatted.isNil ? 'nil' : `${formatted.text} rupees credit`}
              className={cn(
                'code-mono text-[14px] font-medium',
                formatted.isNil ? 'text-muted-text' : 'text-primary-text',
                cancelled && !formatted.isNil && 'line-through text-disabled-text',
              )}
            >
              {formatted.text}
            </span>
          )
        },
      },
    ],
    [density],
  )

  const kpis = kpisQuery.data
  const postedFilteredCount = filteredVouchers.filter((v) => v.status === 'POSTED').length
  const excludedCount = filteredVouchers.length - postedFilteredCount

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-text">
            <span>{kpis?.fiscal_year_label ?? 'FY 2026-27'}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  kpis?.trial_balance_balanced === false ? 'bg-danger' : 'bg-success',
                )}
                aria-hidden="true"
              />
              <span>
                {kpis
                  ? kpis.trial_balance_balanced
                    ? 'Books Balanced · SQLite WAL'
                    : 'Trial Balance Variance'
                  : 'Connecting to FastAPI...'}
              </span>
            </span>
          </div>
          <h1 className="mt-1 type-h1">Financial Command Center</h1>
        </div>

        <div className="hidden md:flex items-center gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={() => onNavigateReport('trial-balance')}>
            Trial Balance
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigateReport('profit-loss')}>
            P&amp;L
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigateReport('balance-sheet')}>
            Balance Sheet
          </Button>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print A4"
            title="Print A4 Statement"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border-input bg-surface text-muted-text hover:bg-muted hover:text-primary-text transition-colors duration-[var(--dur-fast)] cursor-pointer"
          >
            <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* KPI Error Banner */}
      {kpisQuery.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>
              Could not load live KPIs from FastAPI ({kpisQuery.error.message}). Ensure{' '}
              <code className="code-mono">uvicorn app.main:app --reload</code> is running on port 8000.
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => kpisQuery.refetch()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {/* Mobile KPI Card */}
      <section aria-label="Key Financial Position" className="md:hidden">
        <Card padding="sm" loading={kpisQuery.isLoading}>
          {kpis ? (
            <>
              <div className="pb-3">
                <p className="type-xs uppercase text-muted-text">Cash &amp; Bank Balance</p>
                <KpiHeroAmount
                  value={kpis.cash_and_bank_balance}
                  side={kpis.cash_and_bank_dr_cr}
                />
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-success">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  <span>{kpis.posted_vouchers} posted vouchers active</span>
                </p>
              </div>
              <div className="divide-y divide-border-row border-t border-border-row">
                <div className="flex h-11 items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-muted-text">Sundry Debtors</span>
                  <span className="code-mono text-[16px] font-semibold text-primary-text">
                    {formatCurrency(kpis.sundry_debtors)}
                    <span className="ml-1 text-[11px] font-medium text-muted-text">
                      {kpis.sundry_debtors_dr_cr === 'DR' ? 'Dr' : 'Cr'}
                    </span>
                  </span>
                </div>
                <div className="flex h-11 items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-muted-text">Sundry Creditors</span>
                  <span className="code-mono text-[16px] font-semibold text-primary-text">
                    {formatCurrency(kpis.sundry_creditors)}
                    <span className="ml-1 text-[11px] font-medium text-muted-text">
                      {kpis.sundry_creditors_dr_cr === 'DR' ? 'Dr' : 'Cr'}
                    </span>
                  </span>
                </div>
                <div className="flex h-11 items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-muted-text">Net GST / Duties</span>
                  <span className="code-mono text-[16px] font-semibold text-primary-text">
                    {formatCurrency(kpis.net_gst_position)}
                    <span className="ml-1 text-[11px] font-medium text-muted-text">
                      {kpis.net_gst_dr_cr === 'DR' ? 'Dr' : 'Cr'}
                    </span>
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      </section>

      {/* Desktop Unified 4-Cell Live KPI Strip */}
      <section aria-label="Key Financial Balances" className="hidden md:block">
        {kpisQuery.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={`kpi-skel-${i}`} loading />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 rounded-md border border-border-subtle bg-surface shadow-[var(--shadow-card)]">
            <div className="px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                Cash &amp; Bank Balance
              </p>
              <KpiHeroAmount
                value={kpis.cash_and_bank_balance}
                side={kpis.cash_and_bank_dr_cr}
              />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-success">
                <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                <span>Live from Cash + Bank ledgers</span>
              </p>
            </div>

            <div className="border-l border-border-subtle px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                Sundry Debtors (Receivables)
              </p>
              <KpiHeroAmount value={kpis.sundry_debtors} side={kpis.sundry_debtors_dr_cr} />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-muted-text">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>Customer balances outstanding</span>
              </p>
            </div>

            <div className="border-t border-border-subtle lg:border-t-0 lg:border-l px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                Sundry Creditors (Payables)
              </p>
              <KpiHeroAmount value={kpis.sundry_creditors} side={kpis.sundry_creditors_dr_cr} />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-muted-text">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {kpis.posted_vouchers} posted · {kpis.cancelled_vouchers} cancelled
                </span>
              </p>
            </div>

            <div className="border-t border-l border-border-subtle lg:border-t-0 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                Duties &amp; Taxes / Net GST
              </p>
              <KpiHeroAmount value={kpis.net_gst_position} side={kpis.net_gst_dr_cr} />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {kpis.net_gst_dr_cr === 'DR' ? 'Net ITC Credit Surplus' : 'Net GST Payable'}
                </span>
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* Main Split: Day Book + Compliance Rail */}
      <section className="grid grid-cols-1 gap-4 md:gap-6 min-[1400px]:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="space-y-4 min-w-0">
          <Card padding="none">
            <CardHeader>
              <div>
                <CardTitle>Recent Vouchers &amp; Day Book</CardTitle>
                <p className="mt-0.5 text-[12.5px] font-medium text-muted-text">
                  <span className="desktop-only-hint">
                    Click any row or use ↑ ↓ + Enter to inspect double-entry legs.
                  </span>
                  <span className="touch-only-hint">Tap a voucher to see its entries.</span>
                </p>
              </div>

              <div className="desktop-only-hint hidden md:inline-flex items-center gap-0.5 rounded-md border border-border-input bg-muted p-[3px] print:hidden">
                <button
                  type="button"
                  onClick={() => setDensity('comfortable')}
                  aria-pressed={density === 'comfortable'}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                    density === 'comfortable'
                      ? 'bg-surface font-semibold text-primary-text shadow-sm'
                      : 'font-medium text-muted-text hover:text-primary-text',
                  )}
                >
                  <Rows3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Comfort</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  aria-pressed={density === 'compact'}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                    density === 'compact'
                      ? 'bg-surface font-semibold text-primary-text shadow-sm'
                      : 'font-medium text-muted-text hover:text-primary-text',
                  )}
                >
                  <Rows4 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Tally</span>
                </button>
              </div>
            </CardHeader>

            {/* Filter Pills */}
            <div className="px-4 py-2.5 md:px-5 md:py-3 print:hidden">
              <div className="no-scrollbar flex flex-nowrap md:inline-flex items-center gap-1 overflow-x-auto snap-x rounded-md border border-border-input bg-muted p-[3px]">
                {FILTER_PILLS.map((pill) => {
                  const active = pill.id === activeFilter
                  const count =
                    pill.id === 'ALL'
                      ? allVouchers.length
                      : allVouchers.filter((v) => v.voucher_type === pill.id).length

                  return (
                    <button
                      key={pill.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setActiveFilter(pill.id)}
                      className={cn(
                        'inline-flex h-9 md:h-8 shrink-0 snap-start items-center gap-1.5 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                        active
                          ? 'bg-surface font-semibold text-primary-text shadow-sm'
                          : 'font-medium text-muted-text hover:text-primary-text',
                      )}
                    >
                      <span>{pill.label}</span>
                      <span className="code-mono text-[11px] font-medium text-muted-text">
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Mobile Card-List Day Book */}
            <div className="md:hidden border-t border-border-row">
              {dayBookQuery.isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`mob-skel-${i}`} className="h-14 rounded-sm bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredVouchers.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[14px] font-semibold text-primary-text">No matching vouchers</p>
                  <p className="mt-1 text-[13px] text-muted-text">
                    Clear your filter or post a balanced voucher.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border-row">
                  {filteredVouchers.map((v) => {
                    const cancelled = v.status === 'CANCELLED'
                    const isSelected = v.id === selectedVoucherId
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => onSelectVoucher(isSelected ? null : v)}
                          className={cn(
                            'flex min-h-[64px] w-full flex-col justify-center gap-1 px-4 py-3 text-left transition-colors duration-[var(--dur-fast)] cursor-pointer',
                            isSelected
                              ? 'bg-row-selected shadow-[inset_2px_0_0_0_var(--accent-primary)]'
                              : 'bg-surface active:bg-row-hover',
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span
                              className={cn(
                                'truncate text-[15px] font-medium text-primary-text',
                                cancelled && 'line-through text-disabled-text',
                              )}
                            >
                              {v.particulars}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 code-mono text-[15px] font-semibold text-primary-text',
                                cancelled && 'line-through text-disabled-text',
                              )}
                            >
                              {formatCurrency(v.total_debit, { currency: 'INR', showSymbol: false })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="code-mono text-[12.5px] text-muted-text">
                              {v.voucher_number} · {formatShortDate(v.voucher_date)}
                            </span>
                            <StatusIndicator variant={getStatusVariant(v.status)}>
                              {v.status}
                            </StatusIndicator>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Desktop 5-Column Live Table */}
            <div className="hidden md:block">
              <DataTable
                ariaLabel="Recent Vouchers and Day Book"
                data={filteredVouchers}
                columns={columns}
                density={density}
                loading={dayBookQuery.isLoading}
                error={dayBookQuery.isError ? dayBookQuery.error.message : null}
                onRetry={() => dayBookQuery.refetch()}
                selectedRowId={selectedVoucherId !== null ? String(selectedVoucherId) : null}
                getRowId={(row) => String(row.id)}
                onRowActivate={(row) =>
                  onSelectVoucher(row.id === selectedVoucherId ? null : row)
                }
                emptyTitle={`No ${activeFilter === 'ALL' ? '' : activeFilter.toLowerCase() + ' '}vouchers found`}
                emptyDescription="Post a balanced voucher using F4–F9 or clear your active filter."
                emptyAction={
                  <Button variant="primary" onClick={() => onOpenVoucher('SALES')} shortcut="F8">
                    Create Voucher
                  </Button>
                }
                footer={
                  <tr>
                    <td
                      colSpan={3}
                      className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-semibold text-primary-text"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span>Posted Register ({postedFilteredCount} active)</span>
                        {excludedCount > 0 ? (
                          <span
                            title={`${excludedCount} cancelled or draft vouchers excluded from posted totals`}
                            className="inline-flex items-center text-muted-text cursor-help"
                          >
                            <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="grand-total-num-cell px-3 py-2.5 text-right code-mono text-[14px] font-semibold text-primary-text pr-4">
                      {formatCurrency(dayBookQuery.data?.posted_total_debit ?? '0.0000', {
                        currency: 'INR',
                        showSymbol: false,
                      })}
                    </td>
                    <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 text-right code-mono text-[14px] font-semibold text-primary-text pr-4">
                      {formatCurrency(dayBookQuery.data?.posted_total_credit ?? '0.0000', {
                        currency: 'INR',
                        showSymbol: false,
                      })}
                    </td>
                  </tr>
                }
              />
            </div>
          </Card>

          {/* Inline Double-Entry Leg Inspector with Cancel / Reversal Controls */}
          {selectedVoucher ? (
            <Card padding="none">
              <CardHeader className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <h3 className="type-h3">
                    Voucher Drill-Down:{' '}
                    <span className="code-mono">{selectedVoucher.voucher_number}</span>
                  </h3>
                  <StatusIndicator variant={getStatusVariant(selectedVoucher.status)}>
                    {selectedVoucher.status}
                  </StatusIndicator>
                </div>

                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  {selectedVoucher.status === 'POSTED' && !selectedVoucher.reversed_voucher_id ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={cancelVoucher.isPending}
                        leftIcon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                        onClick={() => handleVoucherAction(selectedVoucher, true)}
                      >
                        Post Reversal
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={cancelVoucher.isPending}
                        leftIcon={<Ban className="h-3.5 w-3.5" strokeWidth={1.75} />}
                        onClick={() => handleVoucherAction(selectedVoucher, false)}
                      >
                        Cancel Voucher
                      </Button>
                    </>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => onSelectVoucher(null)}>
                    Close
                  </Button>
                </div>
              </CardHeader>

              <div className="px-4 py-3.5 md:px-5 space-y-3">
                <p className="text-[13px] text-muted-text">
                  <span className="font-semibold text-primary-text">Narration: </span>
                  {selectedVoucher.narration || '—'}
                </p>

                <div className="table-scroll rounded-md border border-border-subtle">
                  <table className="w-full min-w-[460px] border-collapse text-[13px]">
                    <thead className="bg-table-header">
                      <tr className="h-9 border-b border-border-row text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Ledger Account (Click for Statement)</th>
                        <th className="px-3 py-2 pr-4 text-right">Debit (₹)</th>
                        <th className="border-l border-border-row px-3 py-2 pr-4 text-right">
                          Credit (₹)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVoucher.lines.map((line) => {
                        const dr = formatBookAmountCell(line.debit_amount, 'INR')
                        const cr = formatBookAmountCell(line.credit_amount, 'INR')
                        return (
                          <tr
                            key={line.id}
                            className="border-b border-border-row last:border-b-0 hover:bg-row-hover"
                          >
                            <td className="px-3 py-2 code-mono text-muted-text">
                              {line.ledger_code}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => onOpenLedgerStatement(line.ledger_id)}
                                className="font-medium text-accent hover:underline text-left cursor-pointer"
                              >
                                {line.ledger_name}
                              </button>
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 pr-4 text-right code-mono',
                                dr.isNil ? 'text-muted-text' : 'text-primary-text',
                              )}
                            >
                              {dr.text}
                            </td>
                            <td
                              className={cn(
                                'border-l border-border-row px-3 py-2 pr-4 text-right code-mono',
                                cr.isNil ? 'text-muted-text' : 'text-primary-text',
                              )}
                            >
                              {cr.text}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        {/* Right Rail: Compliance & Reconciliation Preview (Wired in M4/M5) */}
        <aside className="space-y-4 min-w-0">
          <Card>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-row">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="type-h3">Bank Reconciliation (BRS)</h2>
              </div>
              <Badge variant="warning">M4 Preview</Badge>
            </div>
            <div className="divide-y divide-border-row">
              <div className="flex items-baseline justify-between gap-2 py-2.5">
                <span className="text-[14px] font-semibold text-primary-text">
                  {COMPLIANCE_SNAPSHOT.unreconciledBankLines} unreconciled
                </span>
                <span className="code-mono text-[14px] font-medium text-primary-text">
                  {formatCurrency(COMPLIANCE_SNAPSHOT.unreconciledNetVariance, {
                    currency: 'INR',
                    negativeStyle: 'parens',
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2.5 text-[12.5px]">
                <span className="text-muted-text">Account</span>
                <span className="font-medium text-primary-text truncate">
                  {COMPLIANCE_SNAPSHOT.bankAccountLabel}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-success" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="type-h3">GSTR-2B &amp; IMS Match</h2>
              </div>
              <span className="code-mono text-[14px] font-bold text-success">
                {COMPLIANCE_SNAPSHOT.gstr2bMatchPercent.toFixed(1)}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="GSTR-2B ITC Reconciliation Match Percentage"
              aria-valuenow={COMPLIANCE_SNAPSHOT.gstr2bMatchPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${COMPLIANCE_SNAPSHOT.gstr2bMatchPercent}%` }}
              />
            </div>
            <p className="mt-3 text-[12.5px] font-medium text-muted-text">
              <span className="code-mono font-semibold text-primary-text">
                {COMPLIANCE_SNAPSHOT.gstr2bMatchedCount}/{COMPLIANCE_SNAPSHOT.gstr2bTotalCount}
              </span>{' '}
              matched · Scheduled for M5 GST Suite
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 pb-2 border-b border-border-row">
              <CalendarClock className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <h2 className="type-h3">Statutory Compliance Calendar</h2>
            </div>
            <ul className="divide-y divide-border-row">
              {COMPLIANCE_SNAPSHOT.dueDates.map((item) => {
                const block = parseDateBlock(item.dueDate)
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex w-10 shrink-0 flex-col items-center justify-center rounded-sm bg-muted py-1">
                        <span className="code-mono text-[15px] font-bold leading-none text-primary-text">
                          {block.day}
                        </span>
                        <span className="mt-0.5 text-[11px] font-semibold leading-none tracking-[0.04em] text-muted-text">
                          {block.month}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-primary-text">
                          {item.filing}
                        </p>
                        <p className="text-[11.5px] text-muted-text">{item.period}</p>
                      </div>
                    </div>
                    {item.urgentPill ? (
                      <Badge variant={item.status} icon={false}>
                        {item.statusText}
                      </Badge>
                    ) : (
                      <StatusIndicator variant={item.status}>{item.statusText}</StatusIndicator>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        </aside>
      </section>
    </div>
  )
}
