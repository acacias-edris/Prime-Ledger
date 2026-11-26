import { useMemo, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { LedgerStatementRowDTO } from '../../lib/api'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
} from '../../lib/format'
import { useLedgers, useLedgerStatement } from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'

export interface LedgerStatementViewProps {
  selectedLedgerId: number | null
  onSelectLedger: (ledgerId: number) => void
  onBackToCoa: () => void
}

export function LedgerStatementView({
  selectedLedgerId,
  onSelectLedger,
  onBackToCoa,
}: LedgerStatementViewProps) {
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')

  const ledgersQuery = useLedgers()
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])
  const effectiveLedgerId = selectedLedgerId ?? ledgers[0]?.id ?? null

  const statementQuery = useLedgerStatement(effectiveLedgerId, {
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  })

  const stmt = statementQuery.data
  const entries = useMemo(() => stmt?.entries ?? [], [stmt])

  const columns = useMemo<DataTableColumnDef<LedgerStatementRowDTO>[]>(
    () => [
      {
        accessorKey: 'voucher_date',
        header: 'Date',
        meta: { align: 'left', mono: true, width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] text-muted-text">
            {formatDisplayDate(row.original.voucher_date)}
          </span>
        ),
      },
      {
        accessorKey: 'voucher_number',
        header: 'Voucher No.',
        meta: { align: 'left', mono: true, width: '146px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-medium text-primary-text">
            {row.original.voucher_number}
          </span>
        ),
      },
      {
        accessorKey: 'voucher_type',
        header: 'Type',
        meta: { align: 'left', width: '96px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12px] text-muted-text">
            {row.original.voucher_type}
          </span>
        ),
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars',
        meta: { align: 'left', minWidth: '210px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-primary-text">
              {row.original.particulars}
            </p>
            <p
              title={row.original.narration}
              className="mt-0.5 truncate text-[12px] text-muted-text"
            >
              {row.original.narration}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'debit_amount',
        header: 'Debit (₹)',
        meta: { align: 'right', mono: true, width: '126px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const dr = formatBookAmountCell(row.original.debit_amount)
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-medium',
                dr.isNil ? 'text-muted-text' : 'text-primary-text',
              )}
            >
              {dr.text}
            </span>
          )
        },
      },
      {
        accessorKey: 'credit_amount',
        header: 'Credit (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '126px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cr = formatBookAmountCell(row.original.credit_amount)
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-medium',
                cr.isNil ? 'text-muted-text' : 'text-primary-text',
              )}
            >
              {cr.text}
            </span>
          )
        },
      },
      {
        accessorKey: 'running_balance',
        header: 'Running Bal (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '156px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13.5px] font-semibold text-primary-text">
            {formatCurrency(row.original.running_balance, { showSymbol: false })}
            <span className="ml-1 text-[11px] font-medium text-muted-text">
              {row.original.running_dr_cr === 'DR' ? 'Dr' : 'Cr'}
            </span>
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBackToCoa}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-text hover:text-primary-text cursor-pointer print:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>Chart of Accounts</span>
            </button>
            {stmt ? (
              <>
                <span className="text-muted-text" aria-hidden="true">
                  ·
                </span>
                <Badge variant="neutral" icon={false}>
                  {stmt.group_name} ({stmt.group_nature})
                </Badge>
              </>
            ) : null}
          </div>
          <h1 className="mt-1 type-h1">
            {stmt ? (
              <>
                <span className="code-mono text-muted-text mr-2">{stmt.ledger_code}</span>
                {stmt.ledger_name}
              </>
            ) : (
              'Ledger Account Statement'
            )}
          </h1>
        </div>

        <Button
          variant="secondary"
          className="print:hidden"
          leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
          onClick={() => window.print()}
        >
          Print Statement
        </Button>
      </div>

      {/* Opening / Period / Closing Summary Strip */}
      {stmt ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-md border border-border-subtle bg-surface shadow-[var(--shadow-card)]">
          <div className="px-5 py-4">
            <p className="type-xs uppercase text-muted-text">
              Opening ({formatDisplayDate(stmt.from_date)})
            </p>
            <p className="mt-1.5 code-mono text-[18px] font-bold text-primary-text">
              {formatCurrency(stmt.opening_balance)}
              <span className="ml-1 text-[12px] font-medium text-muted-text">
                {stmt.opening_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </p>
          </div>
          <div className="border-l border-border-subtle px-5 py-4">
            <p className="type-xs uppercase text-muted-text">Period Debit</p>
            <p className="mt-1.5 code-mono text-[18px] font-bold text-primary-text">
              {formatCurrency(stmt.period_debit)}
            </p>
          </div>
          <div className="border-t border-border-subtle lg:border-t-0 lg:border-l px-5 py-4">
            <p className="type-xs uppercase text-muted-text">Period Credit</p>
            <p className="mt-1.5 code-mono text-[18px] font-bold text-primary-text">
              {formatCurrency(stmt.period_credit)}
            </p>
          </div>
          <div className="border-t border-l border-border-subtle lg:border-t-0 px-5 py-4">
            <p className="type-xs uppercase text-muted-text">
              Closing ({formatDisplayDate(stmt.to_date)})
            </p>
            <p className="mt-1.5 code-mono text-[18px] font-bold text-primary-text">
              {formatCurrency(stmt.closing_balance)}
              <span className="ml-1 text-[12px] font-medium text-muted-text">
                {stmt.closing_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </p>
          </div>
        </div>
      ) : null}

      <Card padding="none">
        <CardHeader className="print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Select ledger account"
              value={effectiveLedgerId ?? ''}
              onChange={(e) => {
                if (e.target.value) onSelectLedger(Number(e.target.value))
              }}
              className="h-9 min-w-[260px] rounded-sm border border-border-input bg-surface px-2.5 text-[13px] font-medium text-primary-text"
            >
              {ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.name}
                </option>
              ))}
            </select>

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
        </CardHeader>

        {/* Opening Balance Band */}
        {stmt ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-row bg-row-group px-4 py-2.5 text-[13px]">
            <span className="italic font-medium text-muted-text">
              Opening Balance brought forward as of {formatDisplayDate(stmt.from_date)}
            </span>
            <span className="code-mono font-semibold text-primary-text">
              {formatCurrency(stmt.opening_balance)}
              <span className="ml-1 text-[11px] font-medium text-muted-text">
                {stmt.opening_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </span>
          </div>
        ) : null}

        <DataTable
          ariaLabel="Ledger Account Statement Transactions"
          data={entries}
          columns={columns}
          loading={ledgersQuery.isLoading || statementQuery.isLoading}
          error={statementQuery.isError ? statementQuery.error.message : null}
          onRetry={() => statementQuery.refetch()}
          getRowId={(r) => `${r.voucher_id}-${r.voucher_number}-${r.debit_amount}-${r.credit_amount}`}
          emptyTitle="No posted transactions in this period"
          emptyDescription="Opening balance carries forward unchanged to Closing Balance."
          footer={
            stmt ? (
              <tr>
                <td
                  colSpan={4}
                  className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-semibold text-primary-text"
                >
                  Period Totals &amp; Closing Balance ({entries.length} entries)
                </td>
                <td className="grand-total-num-cell px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                  {formatCurrency(stmt.period_debit, { showSymbol: false })}
                </td>
                <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                  {formatCurrency(stmt.period_credit, { showSymbol: false })}
                </td>
                <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                  {formatCurrency(stmt.closing_balance, { showSymbol: false })}
                  <span className="ml-1 text-[11px] font-medium text-muted-text">
                    {stmt.closing_dr_cr === 'DR' ? 'Dr' : 'Cr'}
                  </span>
                </td>
              </tr>
            ) : undefined
          }
        />
      </Card>
    </div>
  )
}
