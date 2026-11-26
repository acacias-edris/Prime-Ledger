import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Info,
  Landmark,
  Printer,
  Rows3,
  Rows4,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { toScaledInt } from '../../lib/decimal'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
  formatShortDate,
  parseDateBlock,
  splitCurrencyParts,
} from '../../lib/format'
import {
  BASE_FINANCIAL_KPIS,
  COMPANY_PROFILE,
  COMPLIANCE_SNAPSHOT,
  type ComplianceReconStatus,
  type DayBookVoucher,
  type VoucherType,
} from '../../lib/dummyData'
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
  vouchers: DayBookVoucher[]
  selectedVoucherId: string | null
  onSelectVoucher: (voucher: DayBookVoucher | null) => void
  onOpenVoucher: (type: VoucherType) => void
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

function getComplianceBadgeVariant(status: ComplianceReconStatus): BadgeVariant {
  switch (status) {
    case 'MATCHED':
    case 'RECONCILED':
    case 'E_INVOICE_IRN':
      return 'success'
    case 'PENDING_BRS':
    case 'POST_DATED':
      return 'warning'
    case 'GSTR2B_MISMATCH':
      return 'danger'
    case 'CANCELLED':
      return 'neutral'
  }
}

function KpiHeroAmount({
  value,
  side,
}: {
  value: string | bigint
  side: 'Dr' | 'Cr'
}) {
  const parts = splitCurrencyParts(value, 'INR')
  return (
    <p className="mt-2 type-kpi leading-[1.15]">
      {parts.isNegative ? <span className="mr-0.5">&#x2212;</span> : null}
      <span className="text-[0.6em] font-medium text-muted-text">{parts.symbol}</span>
      <span>{parts.integer}</span>
      <span className="text-[0.6em] font-medium text-muted-text">{parts.fraction}</span>
      <span className="ml-1 text-[12.5px] font-medium tracking-normal text-muted-text">
        {side}
      </span>
    </p>
  )
}

export function FinancialCommandPage({
  vouchers,
  selectedVoucherId,
  onSelectVoucher,
  onOpenVoucher,
}: FinancialCommandPageProps) {
  const [activeFilter, setActiveFilter] = useState<VoucherFilter>('ALL')
  const [density, setDensity] = useState<TableDensity>('comfortable')

  const filteredVouchers = useMemo(() => {
    if (activeFilter === 'ALL') return vouchers
    return vouchers.filter((v) => v.voucherType === activeFilter)
  }, [vouchers, activeFilter])

  // Compute Day Book totals strictly over POSTED vouchers (excludes CANCELLED & POST_DATED per DESIGN_SYSTEM §8.8)
  const { totalDebit, totalCredit, excludedCount } = useMemo(() => {
    let dr = 0n
    let cr = 0n
    let excluded = 0
    for (const v of filteredVouchers) {
      if (v.lifecycleStatus !== 'POSTED') {
        excluded += 1
        continue
      }
      dr += toScaledInt(v.debit)
      cr += toScaledInt(v.credit)
    }
    return { totalDebit: dr, totalCredit: cr, excludedCount: excluded }
  }, [filteredVouchers])

  // Dynamically reflect newly posted local session vouchers in Cash & AR/AP KPIs using exact BigInt
  const kpiRaw = useMemo(() => {
    let cash = toScaledInt(BASE_FINANCIAL_KPIS.cashAndBank)
    let ar = toScaledInt(BASE_FINANCIAL_KPIS.sundryReceivables)
    let ap = toScaledInt(BASE_FINANCIAL_KPIS.sundryPayables)

    for (const v of vouchers) {
      if (!v.id.startsWith('v-local-') || v.lifecycleStatus !== 'POSTED') continue
      for (const ln of v.lines) {
        const netDr = toScaledInt(ln.debit) - toScaledInt(ln.credit)
        if (ln.accountCode === '1001' || ln.accountCode === '1010' || ln.accountCode === '1012') {
          cash += netDr
        } else if (ln.accountCode.startsWith('11')) {
          ar += netDr
        } else if (ln.accountCode.startsWith('20')) {
          ap -= netDr
        }
      }
    }

    return {
      cashAndBank: cash,
      sundryReceivables: ar,
      sundryPayables: ap,
      netGstItc: toScaledInt(BASE_FINANCIAL_KPIS.netGstItcSurplus),
    }
  }, [vouchers])

  const selectedVoucher = useMemo(
    () => vouchers.find((v) => v.id === selectedVoucherId) ?? null,
    [vouchers, selectedVoucherId],
  )

  const columns = useMemo<DataTableColumnDef<DayBookVoucher>[]>(
    () => [
      {
        accessorKey: 'voucherDate',
        header: 'Date',
        meta: {
          align: 'left',
          width: '72px',
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          return (
            <span
              title={formatDisplayDate(row.original.voucherDate)}
              className={cn(
                'code-mono text-[13px] text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatShortDate(row.original.voucherDate)}
            </span>
          )
        },
      },
      {
        accessorKey: 'voucherNo',
        header: 'Voucher No.',
        meta: {
          align: 'left',
          mono: true,
          width: '140px',
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 code-mono text-[13px] font-medium text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-text/60" aria-hidden="true" />
              <span>{row.original.voucherNo}</span>
            </span>
          )
        },
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars',
        meta: {
          align: 'left',
          minWidth: '220px',
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const v = row.original
          const cancelled = v.lifecycleStatus === 'CANCELLED'
          const showInlineStatus =
            v.complianceStatus === 'GSTR2B_MISMATCH' ||
            v.complianceStatus === 'PENDING_BRS' ||
            v.complianceStatus === 'POST_DATED' ||
            v.complianceStatus === 'CANCELLED'

          return (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p
                    title={v.particulars}
                    className={cn(
                      'truncate text-[14px] font-medium leading-snug text-primary-text',
                      cancelled && 'line-through text-disabled-text',
                    )}
                  >
                    {v.particulars}
                  </p>
                  {v.currency !== 'INR' && v.foreignAmount ? (
                    <span
                      title={`FX Rate: 1 ${v.currency} = ₹${v.exchangeRate}`}
                      className="shrink-0 code-mono text-[11px] font-medium text-muted-text"
                    >
                      ({v.currency} {formatCurrency(v.foreignAmount, { currency: v.currency, showSymbol: false })})
                    </span>
                  ) : null}
                </div>
                {showInlineStatus ? (
                  <StatusIndicator
                    variant={getComplianceBadgeVariant(v.complianceStatus)}
                    className="shrink-0"
                  >
                    {v.complianceLabel}
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
        accessorKey: 'debit',
        header: 'Debit (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '124px',
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          const formatted = formatBookAmountCell(row.original.debit, 'INR')
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
        accessorKey: 'credit',
        header: 'Credit (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '124px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          const formatted = formatBookAmountCell(row.original.credit, 'INR')
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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-text">
            <span>{COMPANY_PROFILE.periodLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              <span>Books Open</span>
            </span>
          </div>
          <h1 className="mt-1 type-h1">Financial Command Center</h1>
        </div>

        <div className="hidden md:flex items-center gap-2 print:hidden">
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

      {/* Mobile Position Card (<= 260px compact height at 390px) */}
      <section aria-label="Key Financial Position" className="md:hidden">
        <Card padding="sm">
          <div className="pb-3">
            <p className="type-xs uppercase text-muted-text">Cash &amp; Bank Balance</p>
            <KpiHeroAmount value={kpiRaw.cashAndBank} side="Dr" />
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-success">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>{BASE_FINANCIAL_KPIS.cashAndBankDelta}</span>
            </p>
          </div>

          <div className="divide-y divide-border-row border-t border-border-row">
            <div className="flex h-11 items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-muted-text">Sundry Receivables</span>
              <span className="code-mono text-[16px] font-semibold text-primary-text">
                {formatCurrency(kpiRaw.sundryReceivables, { currency: 'INR' })}
                <span className="ml-1 text-[11px] font-medium text-muted-text">Dr</span>
              </span>
            </div>
            <div className="flex h-11 items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-muted-text">Sundry Payables</span>
              <span className="code-mono text-[16px] font-semibold text-primary-text">
                {formatCurrency(kpiRaw.sundryPayables, { currency: 'INR' })}
                <span className="ml-1 text-[11px] font-medium text-muted-text">Cr</span>
              </span>
            </div>
            <div className="flex h-11 items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-muted-text">Net GST / ITC</span>
              <span className="code-mono text-[16px] font-semibold text-primary-text">
                {formatCurrency(kpiRaw.netGstItc, { currency: 'INR' })}
                <span className="ml-1 text-[11px] font-medium text-muted-text">Dr</span>
              </span>
            </div>
          </div>
        </Card>
      </section>

      {/* Desktop/Tablet Unified 4-Cell Financial KPI Strip */}
      <section aria-label="Key Financial Balances" className="hidden md:block">
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-md border border-border-subtle bg-surface shadow-[var(--shadow-card)]">
          <div className="px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
              Cash &amp; Bank Balance
            </p>
            <KpiHeroAmount value={kpiRaw.cashAndBank} side="Dr" />
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-success">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>{BASE_FINANCIAL_KPIS.cashAndBankDelta}</span>
            </p>
          </div>

          <div className="border-l border-border-subtle px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
              Sundry Receivables
            </p>
            <KpiHeroAmount value={kpiRaw.sundryReceivables} side="Dr" />
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{BASE_FINANCIAL_KPIS.receivablesNote}</span>
            </p>
          </div>

          <div className="border-t border-border-subtle lg:border-t-0 lg:border-l px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
              Sundry Payables
            </p>
            <KpiHeroAmount value={kpiRaw.sundryPayables} side="Cr" />
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-muted-text">
              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{BASE_FINANCIAL_KPIS.payablesNote}</span>
            </p>
          </div>

          <div className="border-t border-l border-border-subtle lg:border-t-0 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
              Net GST / ITC Position
            </p>
            <KpiHeroAmount value={kpiRaw.netGstItc} side="Dr" />
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{BASE_FINANCIAL_KPIS.gstPositionNote}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Main Split: Day Book (minmax(0,1fr)) + Compliance Rail (360px at >=1400px) */}
      <section className="grid grid-cols-1 gap-4 md:gap-6 min-[1400px]:grid-cols-[minmax(0,1fr)_360px] items-start">
        {/* Left: Recent Vouchers & Day Book */}
        <div className="space-y-4 min-w-0">
          <Card padding="none">
            <CardHeader>
              <div>
                <CardTitle>Recent Vouchers &amp; Day Book</CardTitle>
                <p className="mt-0.5 text-[12.5px] font-medium text-muted-text">
                  <span className="desktop-only-hint">
                    Click any row or use ↑ ↓ + Enter to inspect double-entry legs.
                  </span>
                  <span className="touch-only-hint">
                    Tap a voucher to see its entries.
                  </span>
                </p>
              </div>

              {/* Comfort / Tally Density Segmented Control (Desktop only) */}
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

            {/* Voucher Type Filter Segmented Control */}
            <div className="px-4 py-2.5 md:px-5 md:py-3 print:hidden">
              <div className="no-scrollbar flex flex-nowrap md:inline-flex items-center gap-1 overflow-x-auto snap-x rounded-md border border-border-input bg-muted p-[3px]">
                {FILTER_PILLS.map((pill) => {
                  const active = pill.id === activeFilter
                  const count =
                    pill.id === 'ALL'
                      ? vouchers.length
                      : vouchers.filter((v) => v.voucherType === pill.id).length

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

            {/* Mobile Card-List Day Book (<768px) */}
            <div className="md:hidden border-t border-border-row">
              {filteredVouchers.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[14px] font-semibold text-primary-text">
                    No matching vouchers
                  </p>
                  <p className="mt-1 text-[13px] text-muted-text">
                    Clear your active filter or post a new voucher.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border-row">
                  {filteredVouchers.map((v) => {
                    const isDebit = toScaledInt(v.debit) > 0n
                    const displayAmount = isDebit ? v.debit : v.credit
                    const side = isDebit ? 'Dr' : 'Cr'
                    const cancelled = v.lifecycleStatus === 'CANCELLED'
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
                              {formatCurrency(displayAmount, { currency: 'INR', showSymbol: false })}
                              <span className="ml-1 text-[11px] font-medium text-muted-text">
                                {side}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="code-mono text-[12.5px] text-muted-text">
                              {v.voucherNo} · {formatShortDate(v.voucherDate)}
                            </span>
                            <StatusIndicator variant={getComplianceBadgeVariant(v.complianceStatus)}>
                              {v.complianceLabel}
                            </StatusIndicator>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Desktop 5-Column Ledger Table (>=768px) */}
            <div className="hidden md:block">
              <DataTable
                ariaLabel="Recent Vouchers and Day Book"
                data={filteredVouchers}
                columns={columns}
                density={density}
                selectedRowId={selectedVoucherId}
                getRowId={(row) => row.id}
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
                        <span>
                          Posted Register Totals ({filteredVouchers.length - excludedCount} active)
                        </span>
                        {excludedCount > 0 ? (
                          <span
                            tabIndex={0}
                            aria-label={`${excludedCount} cancelled or post-dated vouchers excluded from totals`}
                            title={`${excludedCount} cancelled/post-dated vouchers remain visible for GSTR-1 Table 13 numbering continuity and are excluded from Posted Register Totals.`}
                            className="inline-flex items-center text-muted-text hover:text-primary-text cursor-help"
                          >
                            <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="grand-total-num-cell px-3 py-2.5 text-right code-mono text-[14px] font-semibold text-primary-text pr-4">
                      {formatCurrency(totalDebit, { currency: 'INR', showSymbol: false })}
                    </td>
                    <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 text-right code-mono text-[14px] font-semibold text-primary-text pr-4">
                      {formatCurrency(totalCredit, { currency: 'INR', showSymbol: false })}
                    </td>
                  </tr>
                }
              />
            </div>
          </Card>

          {/* Inline Double-Entry Leg Inspector when a Voucher Row is Selected */}
          {selectedVoucher ? (
            <Card padding="none">
              <CardHeader className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <h3 className="type-h3">
                    Voucher Drill-Down: <span className="code-mono">{selectedVoucher.voucherNo}</span>
                  </h3>
                  <StatusIndicator variant={getComplianceBadgeVariant(selectedVoucher.complianceStatus)}>
                    {selectedVoucher.complianceLabel}
                  </StatusIndicator>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onSelectVoucher(null)}>
                  Close Inspector
                </Button>
              </CardHeader>

              <div className="px-4 py-3.5 md:px-5 space-y-3">
                <p className="text-[13px] text-muted-text">
                  <span className="font-semibold text-primary-text">Narration: </span>
                  {selectedVoucher.narration}
                </p>

                <div className="table-scroll rounded-md border border-border-subtle">
                  <table className="w-full min-w-[460px] border-collapse text-[13px]">
                    <thead className="bg-table-header">
                      <tr className="h-9 border-b border-border-row text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Ledger Account</th>
                        <th className="px-3 py-2 pr-4 text-right">Debit (₹)</th>
                        <th className="border-l border-border-row px-3 py-2 pr-4 text-right">
                          Credit (₹)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVoucher.lines.map((line, idx) => {
                        const dr = formatBookAmountCell(line.debit, 'INR')
                        const cr = formatBookAmountCell(line.credit, 'INR')
                        return (
                          <tr
                            key={`${selectedVoucher.id}-ln-${idx}`}
                            className="border-b border-border-row last:border-b-0"
                          >
                            <td className="px-3 py-2 code-mono text-muted-text">
                              {line.accountCode}
                            </td>
                            <td className="px-3 py-2 font-medium text-primary-text">
                              {line.accountName}
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

        {/* Right Rail: Flattened Compliance & Reconciliation Snapshot */}
        <aside className="space-y-4 min-w-0">
          {/* Bank Reconciliation Snapshot */}
          <Card>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-row">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="type-h3">Bank Reconciliation (BRS)</h2>
              </div>
              <Badge variant="warning">
                {COMPLIANCE_SNAPSHOT.unreconciledBankLines} Pending
              </Badge>
            </div>

            <div className="divide-y divide-border-row">
              <div className="flex items-baseline justify-between gap-2 py-2.5">
                <span className="text-[15px] font-semibold text-primary-text">
                  {COMPLIANCE_SNAPSHOT.unreconciledBankLines} unreconciled
                </span>
                <span className="code-mono text-[14px] font-medium text-primary-text">
                  {formatCurrency(COMPLIANCE_SNAPSHOT.unreconciledNetVariance, {
                    currency: 'INR',
                    negativeStyle: 'parens',
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 py-2.5 text-[12.5px]">
                <span className="text-muted-text">Account</span>
                <span className="font-medium text-primary-text truncate">
                  {COMPLIANCE_SNAPSHOT.bankAccountLabel}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2.5 text-[12px]">
                <span className="text-muted-text">Last CSV import</span>
                <span className="code-mono text-muted-text">
                  {COMPLIANCE_SNAPSHOT.lastBankSync}
                </span>
              </div>
            </div>
          </Card>

          {/* GSTR-2B & IMS Match */}
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
              matched
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="code-mono font-semibold text-warning">
                {COMPLIANCE_SNAPSHOT.gstr2bMismatchCount}
              </span>{' '}
              variance
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="code-mono font-semibold text-danger">
                {COMPLIANCE_SNAPSHOT.gstr2bMissingCount}
              </span>{' '}
              missing
            </p>
          </Card>

          {/* Statutory Compliance Calendar */}
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
                        <p className="text-[11.5px] text-muted-text">
                          {item.period}
                        </p>
                      </div>
                    </div>

                    {item.urgentPill ? (
                      <Badge variant={item.status} icon={false}>
                        {item.statusText}
                      </Badge>
                    ) : (
                      <StatusIndicator variant={item.status}>
                        {item.statusText}
                      </StatusIndicator>
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
