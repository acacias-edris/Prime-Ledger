import { useMemo, useState } from 'react'
import { CheckCircle2, Printer, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { TrialBalanceGroupSummaryDTO, TrialBalanceRowDTO } from '../../lib/api'
import { formatBookAmountCell, formatCurrency, formatDisplayDate } from '../../lib/format'
import { useTrialBalance } from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'

export interface TrialBalanceViewProps {
  onOpenLedgerStatement: (ledgerId: number) => void
}

function renderAmountCell(value: string, bold = false) {
  const formatted = formatBookAmountCell(value)
  return (
    <span
      className={cn(
        'code-mono text-[13.5px]',
        bold ? 'font-semibold' : 'font-medium',
        formatted.isNil ? 'text-muted-text' : 'text-primary-text',
      )}
    >
      {formatted.text}
    </span>
  )
}

export function TrialBalanceView({ onOpenLedgerStatement }: TrialBalanceViewProps) {
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')
  const [includeZero, setIncludeZero] = useState(false)
  const [viewMode, setViewMode] = useState<'ledger' | 'group'>('ledger')

  const tbQuery = useTrialBalance({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    include_zero: includeZero,
  })
  const tb = tbQuery.data

  const ledgerColumns = useMemo<DataTableColumnDef<TrialBalanceRowDTO>[]>(
    () => [
      {
        accessorKey: 'ledger_name',
        header: 'Ledger Account',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-accent">
              {row.original.ledger_name}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-text">
              <span className="code-mono">{row.original.ledger_code}</span> ·{' '}
              {row.original.group_name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'opening_debit',
        header: 'Opening Dr',
        meta: { align: 'right', mono: true, width: '120px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.opening_debit),
      },
      {
        accessorKey: 'opening_credit',
        header: 'Opening Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.opening_credit),
      },
      {
        accessorKey: 'period_debit',
        header: 'Period Dr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.period_debit),
      },
      {
        accessorKey: 'period_credit',
        header: 'Period Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.period_credit),
      },
      {
        accessorKey: 'closing_debit',
        header: 'Closing Dr',
        meta: {
          align: 'right',
          mono: true,
          width: '130px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.closing_debit, true),
      },
      {
        accessorKey: 'closing_credit',
        header: 'Closing Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '130px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.closing_credit, true),
      },
    ],
    [],
  )

  const groupColumns = useMemo<DataTableColumnDef<TrialBalanceGroupSummaryDTO>[]>(
    () => [
      {
        accessorKey: 'group_name',
        header: 'Account Group',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-primary-text">
              {row.original.group_name}
            </span>
            <Badge variant="neutral" icon={false}>
              {row.original.nature}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: 'opening_debit',
        header: 'Opening Dr',
        meta: { align: 'right', mono: true, width: '120px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.opening_debit),
      },
      {
        accessorKey: 'opening_credit',
        header: 'Opening Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.opening_credit),
      },
      {
        accessorKey: 'period_debit',
        header: 'Period Dr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.period_debit),
      },
      {
        accessorKey: 'period_credit',
        header: 'Period Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.period_credit),
      },
      {
        accessorKey: 'closing_debit',
        header: 'Closing Dr',
        meta: {
          align: 'right',
          mono: true,
          width: '130px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.closing_debit, true),
      },
      {
        accessorKey: 'closing_credit',
        header: 'Closing Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '130px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.closing_credit, true),
      },
    ],
    [],
  )

  const footerRow = tb ? (
    <tr>
      <td className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-bold text-primary-text">
        Grand Totals (INR)
      </td>
      <td className="grand-total-num-cell px-3 py-2.5 pr-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
        {formatCurrency(tb.total_opening_debit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
        {formatCurrency(tb.total_opening_credit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
        {formatCurrency(tb.total_period_debit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
        {formatCurrency(tb.total_period_credit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-bold text-primary-text">
        {formatCurrency(tb.total_debit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-bold text-primary-text">
        {formatCurrency(tb.total_credit, { showSymbol: false })}
      </td>
    </tr>
  ) : undefined

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            {tb
              ? `${formatDisplayDate(tb.from_date)} to ${formatDisplayDate(tb.to_date)}`
              : 'Exact 4-Decimal Double-Entry Proof'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="type-h1">Trial Balance</h1>
            {tb ? (
              tb.is_balanced ? (
                <Badge
                  variant="success"
                  icon={<CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                >
                  Balanced · Difference ₹0.00
                </Badge>
              ) : (
                <Badge
                  variant="danger"
                  icon={<XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                >
                  Out of Balance: {formatCurrency(tb.difference)}
                </Badge>
              )
            ) : null}
          </div>
        </div>

        <Button
          variant="secondary"
          className="print:hidden"
          leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
          onClick={() => window.print()}
        >
          Print A4
        </Button>
      </div>

      <Card padding="none">
        <CardHeader className="print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-0.5 rounded-md border border-border-input bg-muted p-[3px]">
              <button
                type="button"
                aria-pressed={viewMode === 'ledger'}
                onClick={() => setViewMode('ledger')}
                className={cn(
                  'h-8 rounded-sm px-3 text-[12px] cursor-pointer',
                  viewMode === 'ledger'
                    ? 'bg-surface font-semibold text-primary-text shadow-sm'
                    : 'font-medium text-muted-text hover:text-primary-text',
                )}
              >
                Ledger-wise
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'group'}
                onClick={() => setViewMode('group')}
                className={cn(
                  'h-8 rounded-sm px-3 text-[12px] cursor-pointer',
                  viewMode === 'group'
                    ? 'bg-surface font-semibold text-primary-text shadow-sm'
                    : 'font-medium text-muted-text hover:text-primary-text',
                )}
              >
                Group-wise
              </button>
            </div>

            <input
              type="date"
              aria-label="From date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
            />
            <span className="text-[12px] text-muted-text">to</span>
            <input
              type="date"
              aria-label="To date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-[13px] font-medium text-primary-text cursor-pointer">
            <input
              type="checkbox"
              checked={includeZero}
              onChange={(e) => setIncludeZero(e.target.checked)}
              className="h-4 w-4 rounded-sm border border-border-input accent-[var(--accent-primary)]"
            />
            <span>Show zero-balance ledgers</span>
          </label>
        </CardHeader>

        {viewMode === 'ledger' ? (
          <DataTable
            ariaLabel="Trial Balance Ledger-wise"
            data={tb?.rows ?? []}
            columns={ledgerColumns}
            density="compact"
            loading={tbQuery.isLoading}
            error={tbQuery.isError ? tbQuery.error.message : null}
            onRetry={() => tbQuery.refetch()}
            getRowId={(r) => String(r.ledger_id)}
            onRowActivate={(r) => onOpenLedgerStatement(r.ledger_id)}
            footer={footerRow}
          />
        ) : (
          <DataTable
            ariaLabel="Trial Balance Group-wise"
            data={tb?.groups ?? []}
            columns={groupColumns}
            density="compact"
            loading={tbQuery.isLoading}
            error={tbQuery.isError ? tbQuery.error.message : null}
            onRetry={() => tbQuery.refetch()}
            getRowId={(r) => String(r.group_id)}
            footer={footerRow}
          />
        )}
      </Card>
    </div>
  )
}
