import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Keyboard,
  Landmark,
  Printer,
  Rows3,
  Rows4,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { toScaledInt } from '../../lib/decimal'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
} from '../../lib/format'
import {
  BASE_FINANCIAL_KPIS,
  COMPANY_PROFILE,
  COMPLIANCE_SNAPSHOT,
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type ComplianceReconStatus,
  type DayBookVoucher,
  type VoucherType,
} from '../../lib/dummyData'
import { Badge, type BadgeVariant } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
  type TableDensity,
} from '../../components/ui/DataTable'
import { Kbd } from '../../components/ui/Kbd'

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

function getComplianceIcon(status: ComplianceReconStatus) {
  switch (status) {
    case 'MATCHED':
    case 'RECONCILED':
    case 'E_INVOICE_IRN':
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
    case 'PENDING_BRS':
    case 'POST_DATED':
      return <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
    case 'GSTR2B_MISMATCH':
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
    case 'CANCELLED':
      return <XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
  }
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
  const kpiFigures = useMemo(() => {
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
      cashAndBank: formatCurrency(cash, { currency: 'INR' }),
      sundryReceivables: formatCurrency(ar, { currency: 'INR' }),
      sundryPayables: formatCurrency(ap, { currency: 'INR' }),
      netGstItc: formatCurrency(BASE_FINANCIAL_KPIS.netGstItcSurplus, { currency: 'INR' }),
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
        meta: { align: 'left', minWidth: '108px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          return (
            <span
              className={cn(
                'whitespace-nowrap text-[13px] text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatDisplayDate(row.original.voucherDate)}
            </span>
          )
        },
      },
      {
        accessorKey: 'voucherNo',
        header: 'Voucher #',
        meta: { align: 'left', mono: true, minWidth: '146px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          return (
            <span
              className={cn(
                'tabular-mono whitespace-nowrap text-[13px] font-medium text-primary-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {row.original.voucherNo}
            </span>
          )
        },
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars',
        meta: { align: 'left', minWidth: '240px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const v = row.original
          const cancelled = v.lifecycleStatus === 'CANCELLED'
          return (
            <div className="min-w-0 max-w-[300px]">
              <div className="flex items-center gap-1.5">
                <p
                  title={v.particulars}
                  className={cn(
                    'truncate font-medium text-primary-text',
                    cancelled && 'line-through text-disabled-text',
                  )}
                >
                  {v.particulars}
                </p>
                {v.currency !== 'INR' && v.foreignAmount ? (
                  <span
                    title={`FX Rate: 1 ${v.currency} = ₹${v.exchangeRate}`}
                    className="shrink-0 rounded-sm border border-border-subtle bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-text"
                  >
                    {v.currency} {formatCurrency(v.foreignAmount, { currency: v.currency, showSymbol: false })}
                  </span>
                ) : null}
              </div>
              <p
                title={v.narration}
                className="truncate text-[12px] text-muted-text"
              >
                {v.narration}
              </p>
            </div>
          )
        },
      },
      {
        accessorKey: 'voucherType',
        header: 'Type',
        meta: { align: 'left', minWidth: '96px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const meta = VOUCHER_TYPE_META[row.original.voucherType]
          return (
            <Badge variant="neutral" icon={false}>
              {meta.label}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'debit',
        header: 'Debit (₹)',
        meta: { align: 'right', mono: true, minWidth: '132px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          const formatted = formatBookAmountCell(row.original.debit, 'INR')
          return (
            <span
              aria-label={formatted.isNil ? 'nil' : `${formatted.text} rupees debit`}
              className={cn(
                'tabular-mono whitespace-nowrap',
                formatted.isNil ? 'text-disabled-text' : 'text-primary-text font-medium',
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
          minWidth: '132px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          const formatted = formatBookAmountCell(row.original.credit, 'INR')
          return (
            <span
              aria-label={formatted.isNil ? 'nil' : `${formatted.text} rupees credit`}
              className={cn(
                'tabular-mono whitespace-nowrap',
                formatted.isNil ? 'text-disabled-text' : 'text-primary-text font-medium',
                cancelled && !formatted.isNil && 'line-through text-disabled-text',
              )}
            >
              {formatted.text}
            </span>
          )
        },
      },
      {
        accessorKey: 'complianceLabel',
        header: 'Status',
        meta: { align: 'center', minWidth: '136px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <Badge
            variant={getComplianceBadgeVariant(row.original.complianceStatus)}
            icon={getComplianceIcon(row.original.complianceStatus)}
          >
            {row.original.complianceLabel}
          </Badge>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-text">
            {COMPANY_PROFILE.periodLabel} · Books Open · {COMPANY_PROFILE.fiscalYear}
          </p>
          <h1 className="mt-1 text-[var(--fs-h1)] font-semibold leading-[1.25] tracking-[-0.02em] text-primary-text">
            Financial Command Center
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
          >
            Print A4
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenVoucher('PAYMENT')}
            shortcut="F5"
          >
            Payment
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenVoucher('RECEIPT')}
            shortcut="F6"
          >
            Receipt
          </Button>
        </div>
      </div>

      {/* 4-Card Financial KPI Strip */}
      <section aria-label="Key Financial Balances" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-text">
            Cash &amp; Bank Balance
          </p>
          <p className="mt-2 tabular-ledger text-[var(--fs-kpi)] font-bold leading-[1.15] tracking-[-0.025em] text-primary-text">
            {kpiFigures.cashAndBank}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-success">
            <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span>{BASE_FINANCIAL_KPIS.cashAndBankDelta}</span>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-text">
            Sundry Receivables
          </p>
          <p className="mt-2 tabular-ledger text-[var(--fs-kpi)] font-bold leading-[1.15] tracking-[-0.025em] text-primary-text">
            {kpiFigures.sundryReceivables}
          </p>
          <div className="mt-2.5">
            <Badge variant="warning">{BASE_FINANCIAL_KPIS.receivablesNote}</Badge>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-text">
            Sundry Payables
          </p>
          <p className="mt-2 tabular-ledger text-[var(--fs-kpi)] font-bold leading-[1.15] tracking-[-0.025em] text-primary-text">
            {kpiFigures.sundryPayables}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-muted-text">
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{BASE_FINANCIAL_KPIS.payablesNote}</span>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-text">
            Net GST / ITC Position
          </p>
          <p className="mt-2 tabular-ledger text-[var(--fs-kpi)] font-bold leading-[1.15] tracking-[-0.025em] text-primary-text">
            {kpiFigures.netGstItc}
          </p>
          <div className="mt-2.5">
            <Badge variant="success">{BASE_FINANCIAL_KPIS.gstPositionNote}</Badge>
          </div>
        </Card>
      </section>

      {/* Main 12-Column Split: Day Book (8) + Compliance Snapshot (4) */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        {/* Left: Recent Vouchers & Day Book */}
        <div className="xl:col-span-8 space-y-4 min-w-0">
          <Card padding="none">
            <CardHeader>
              <div>
                <CardTitle>Recent Vouchers &amp; Day Book</CardTitle>
                <p className="mt-0.5 text-[13px] text-muted-text">
                  Click any voucher or use <Kbd>↑</Kbd> <Kbd>↓</Kbd> + <Kbd>Enter</Kbd> to inspect double-entry legs.
                </p>
              </div>

              {/* Density Toggle */}
              <div className="flex items-center gap-1 rounded-md border border-border-subtle bg-canvas p-1 print:hidden">
                <button
                  type="button"
                  onClick={() => setDensity('comfortable')}
                  aria-pressed={density === 'comfortable'}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-medium cursor-pointer',
                    density === 'comfortable'
                      ? 'bg-surface text-primary-text shadow-sm'
                      : 'text-muted-text hover:text-primary-text',
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
                    'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-medium cursor-pointer',
                    density === 'compact'
                      ? 'bg-surface text-primary-text shadow-sm'
                      : 'text-muted-text hover:text-primary-text',
                  )}
                >
                  <Rows4 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Tally</span>
                </button>
              </div>
            </CardHeader>

            {/* Voucher Type Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 px-5 py-3 print:hidden">
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
                      'inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[12px] font-medium transition-colors duration-[var(--dur-fast)] cursor-pointer',
                      active
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border-subtle bg-canvas text-muted-text hover:bg-muted hover:text-primary-text',
                    )}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={cn(
                        'tabular-mono text-[11px]',
                        active ? 'text-accent-foreground/85' : 'text-disabled-text',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

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
                    colSpan={4}
                    className="border-t-2 border-border-strong px-3 py-2.5 text-[13px] font-bold text-primary-text"
                  >
                    Posted Register Totals ({filteredVouchers.length - excludedCount} active
                    {excludedCount > 0 ? ` · ${excludedCount} excluded` : ''})
                  </td>
                  <td className="grand-total-cell px-3 py-2.5 text-right tabular-mono text-[13px] font-bold text-primary-text whitespace-nowrap">
                    {formatCurrency(totalDebit, { currency: 'INR', showSymbol: false })}
                  </td>
                  <td className="grand-total-cell border-l border-border-subtle px-3 py-2.5 text-right tabular-mono text-[13px] font-bold text-primary-text whitespace-nowrap">
                    {formatCurrency(totalCredit, { currency: 'INR', showSymbol: false })}
                  </td>
                  <td className="border-t-2 border-border-strong px-3 py-2.5 text-center text-[11px] font-medium text-muted-text">
                    INR (₹)
                  </td>
                </tr>
              }
            />

            {excludedCount > 0 ? (
              <div className="border-t border-border-subtle bg-canvas px-5 py-2.5 text-[12px] text-muted-text">
                Note: Cancelled and post-dated vouchers remain visible for audit &amp; GSTR-1 Table 13 numbering continuity, and are automatically excluded from Posted Register Totals.
              </div>
            ) : null}
          </Card>

          {/* Inline Double-Entry Leg Inspector when a Voucher Row is Selected */}
          {selectedVoucher ? (
            <Card padding="none">
              <CardHeader className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <h3 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                    Voucher Drill-Down: <span className="tabular-mono">{selectedVoucher.voucherNo}</span>
                  </h3>
                  <Badge
                    variant={getComplianceBadgeVariant(selectedVoucher.complianceStatus)}
                    icon={getComplianceIcon(selectedVoucher.complianceStatus)}
                  >
                    {selectedVoucher.complianceLabel}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onSelectVoucher(null)}>
                  Close Inspector
                </Button>
              </CardHeader>

              <div className="px-5 py-3.5 space-y-3">
                <p className="text-[13px] text-muted-text">
                  <span className="font-semibold text-primary-text">Narration: </span>
                  {selectedVoucher.narration}
                </p>

                <div className="table-scroll rounded-md border border-border-subtle">
                  <table className="w-full min-w-[460px] border-collapse text-[13px]">
                    <thead className="bg-table-header">
                      <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase tracking-[0.03em] text-muted-text">
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Ledger Account</th>
                        <th className="px-3 py-2 text-right">Debit (₹)</th>
                        <th className="border-l border-border-subtle px-3 py-2 text-right">
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
                            className="border-b border-border-subtle last:border-b-0"
                          >
                            <td className="px-3 py-2 tabular-mono text-muted-text">
                              {line.accountCode}
                            </td>
                            <td className="px-3 py-2 font-medium text-primary-text">
                              {line.accountName}
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right tabular-mono',
                                dr.isNil ? 'text-disabled-text' : 'text-primary-text',
                              )}
                            >
                              {dr.text}
                            </td>
                            <td
                              className={cn(
                                'border-l border-border-subtle px-3 py-2 text-right tabular-mono',
                                cr.isNil ? 'text-disabled-text' : 'text-primary-text',
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

        {/* Right: Compliance & Reconciliation Snapshot Panel */}
        <aside className="xl:col-span-4 space-y-4 min-w-0">
          {/* Bank Reconciliation Snapshot */}
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                  Bank Reconciliation (BRS)
                </h2>
              </div>
              <Badge variant="warning">
                {COMPLIANCE_SNAPSHOT.unreconciledBankLines} Pending
              </Badge>
            </div>

            <p className="mt-1 text-[12px] text-muted-text">
              {COMPLIANCE_SNAPSHOT.bankAccountLabel}
            </p>

            <div className="mt-3.5 grid grid-cols-2 gap-3 rounded-md border border-border-subtle bg-canvas p-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-text">
                  Unreconciled Lines
                </p>
                <p className="mt-0.5 tabular-mono text-[20px] font-bold text-primary-text">
                  {COMPLIANCE_SNAPSHOT.unreconciledBankLines}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-text">
                  Net Timing Diff
                </p>
                <p className="mt-0.5 tabular-mono text-[15px] font-bold text-primary-text">
                  {formatCurrency(COMPLIANCE_SNAPSHOT.unreconciledNetVariance, {
                    currency: 'INR',
                    negativeStyle: 'parens',
                  })}
                </p>
              </div>
            </div>

            <p className="mt-2.5 text-[11px] text-muted-text">
              Last CSV import: <span className="tabular-mono">{COMPLIANCE_SNAPSHOT.lastBankSync}</span>
            </p>
          </Card>

          {/* GSTR-2B Match % Progress Bar */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-success" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                  GSTR-2B &amp; IMS Match
                </h2>
              </div>
              <span className="tabular-mono text-[14px] font-bold text-success">
                {COMPLIANCE_SNAPSHOT.gstr2bMatchPercent.toFixed(1)}%
              </span>
            </div>

            <div
              role="progressbar"
              aria-label="GSTR-2B ITC Reconciliation Match Percentage"
              aria-valuenow={COMPLIANCE_SNAPSHOT.gstr2bMatchPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${COMPLIANCE_SNAPSHOT.gstr2bMatchPercent}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-sm border border-border-subtle bg-canvas px-2 py-1.5">
                <p className="tabular-mono text-[14px] font-bold text-primary-text">
                  {COMPLIANCE_SNAPSHOT.gstr2bMatchedCount}/{COMPLIANCE_SNAPSHOT.gstr2bTotalCount}
                </p>
                <p className="text-[11px] text-muted-text">Exact Match</p>
              </div>
              <div className="rounded-sm border border-border-subtle bg-canvas px-2 py-1.5">
                <p className="tabular-mono text-[14px] font-bold text-warning">
                  {COMPLIANCE_SNAPSHOT.gstr2bMismatchCount}
                </p>
                <p className="text-[11px] text-muted-text">Variance</p>
              </div>
              <div className="rounded-sm border border-border-subtle bg-canvas px-2 py-1.5">
                <p className="tabular-mono text-[14px] font-bold text-danger">
                  {COMPLIANCE_SNAPSHOT.gstr2bMissingCount}
                </p>
                <p className="text-[11px] text-muted-text">Missing 2B</p>
              </div>
            </div>
          </Card>

          {/* Upcoming Statutory Due Dates */}
          <Card>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <h2 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                Statutory Compliance Calendar
              </h2>
            </div>

            <ul className="mt-3 divide-y divide-border-subtle">
              {COMPLIANCE_SNAPSHOT.dueDates.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-primary-text">
                      {item.filing}
                    </p>
                    <p className="tabular-mono text-[11px] text-muted-text">
                      Due {item.dueDate} · {item.period}
                    </p>
                  </div>
                  <Badge variant={item.status} icon={false}>
                    {item.statusText}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          {/* Tally Keyboard Cheat Sheet */}
          <Card className="print:hidden">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <h2 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                Tally Keyboard Engine
              </h2>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[12px]">
              {VOUCHER_TYPE_ORDER.map((type) => {
                const m = VOUCHER_TYPE_META[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onOpenVoucher(type)}
                    className="flex items-center justify-between rounded-sm border border-border-subtle bg-canvas px-2.5 py-1.5 text-left hover:bg-muted cursor-pointer"
                  >
                    <span className="font-medium text-primary-text">{m.label}</span>
                    <span className="flex items-center gap-1">
                      <Kbd>{m.shortKey}</Kbd>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2.5 text-[11px] text-muted-text">
              Linux/Brave backup chords: <Kbd>Alt+4</Kbd>–<Kbd>Alt+9</Kbd> · Go-To:{' '}
              <Kbd>Alt+G</Kbd> · Post: <Kbd>Ctrl+Enter</Kbd>
            </p>
          </Card>
        </aside>
      </section>
    </div>
  )
}
