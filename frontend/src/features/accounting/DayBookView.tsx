import { useMemo, useState } from 'react'
import { Ban, FileSpreadsheet, Printer, RotateCcw, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ApiVoucherStatus, ApiVoucherType, VoucherDTO } from '../../lib/api'
import type { VoucherType } from '../../lib/dummyData'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
} from '../../lib/format'
import { useCancelVoucher, useDayBook } from '../../hooks/useAccounting'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'
import { StatusIndicator } from '../../components/ui/Badge'

export interface DayBookViewProps {
  onOpenVoucher: (type: VoucherType) => void
  onOpenLedgerStatement: (ledgerId: number) => void
  onNotify: (message: string) => void
}

export function DayBookView({
  onOpenVoucher,
  onOpenLedgerStatement,
  onNotify,
}: DayBookViewProps) {
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')
  const [voucherType, setVoucherType] = useState<'' | ApiVoucherType>('')
  const [statusFilter, setStatusFilter] = useState<'' | ApiVoucherStatus>('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const dayBookQuery = useDayBook({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    voucher_type: voucherType || undefined,
    status: statusFilter || undefined,
    search: search.trim() || undefined,
  })
  const cancelVoucher = useCancelVoucher()

  const vouchers = useMemo(() => dayBookQuery.data?.vouchers ?? [], [dayBookQuery.data])
  const selectedVoucher = useMemo(
    () => vouchers.find((v) => v.id === selectedId) ?? null,
    [vouchers, selectedId],
  )

  const handleAction = async (voucher: VoucherDTO, createReversal: boolean) => {
    try {
      const res = await cancelVoucher.mutateAsync({
        voucherId: voucher.id,
        createReversal,
      })
      onNotify(
        res.action === 'REVERSED' && res.reversal_voucher
          ? `Posted reversal ${res.reversal_voucher.voucher_number}`
          : `Cancelled ${voucher.voucher_number}`,
      )
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const columns = useMemo<DataTableColumnDef<VoucherDTO>[]>(
    () => [
      {
        accessorKey: 'voucher_date',
        header: 'Date',
        meta: { align: 'left', mono: true, width: '116px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span
            className={cn(
              'code-mono text-[13px] text-muted-text',
              row.original.status === 'CANCELLED' && 'line-through text-disabled-text',
            )}
          >
            {formatDisplayDate(row.original.voucher_date)}
          </span>
        ),
      },
      {
        accessorKey: 'voucher_number',
        header: 'Voucher No.',
        meta: { align: 'left', mono: true, width: '150px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span
            className={cn(
              'code-mono text-[13px] font-medium text-primary-text',
              row.original.status === 'CANCELLED' && 'line-through text-disabled-text',
            )}
          >
            {row.original.voucher_number}
          </span>
        ),
      },
      {
        accessorKey: 'voucher_type',
        header: 'Type',
        meta: { align: 'left', width: '104px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12px] font-medium text-muted-text">
            {row.original.voucher_type}
          </span>
        ),
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars & Narration',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    'truncate text-[14px] font-medium text-primary-text',
                    cancelled && 'line-through text-disabled-text',
                  )}
                >
                  {row.original.particulars}
                </p>
                {row.original.status !== 'POSTED' ? (
                  <StatusIndicator variant="neutral">{row.original.status}</StatusIndicator>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[12px] text-muted-text">
                {row.original.narration}
              </p>
            </div>
          )
        },
      },
      {
        accessorKey: 'total_debit',
        header: 'Debit (₹)',
        meta: { align: 'right', mono: true, width: '132px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-medium text-primary-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatCurrency(row.original.total_debit, { showSymbol: false })}
            </span>
          )
        },
      },
      {
        accessorKey: 'total_credit',
        header: 'Credit (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '132px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-medium text-primary-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatCurrency(row.original.total_credit, { showSymbol: false })}
            </span>
          )
        },
      },
    ],
    [],
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            Chronological Voucher Register · {dayBookQuery.data?.total_count ?? 0} Vouchers
          </p>
          <h1 className="mt-1 type-h1">Day Book</h1>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <Button variant="primary" onClick={() => onOpenVoucher('JOURNAL')} shortcut="F7">
            New Entry
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      </div>

      <Card padding="none">
        <CardHeader className="print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
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
            <select
              aria-label="Filter voucher type"
              value={voucherType}
              onChange={(e) => setVoucherType(e.target.value as '' | ApiVoucherType)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 text-[13px] text-primary-text"
            >
              <option value="">All Types</option>
              <option value="CONTRA">Contra (F4)</option>
              <option value="PAYMENT">Payment (F5)</option>
              <option value="RECEIPT">Receipt (F6)</option>
              <option value="JOURNAL">Journal (F7)</option>
              <option value="SALES">Sales (F8)</option>
              <option value="PURCHASE">Purchase (F9)</option>
              <option value="CREDIT_NOTE">Credit Note</option>
              <option value="DEBIT_NOTE">Debit Note</option>
            </select>
            <select
              aria-label="Filter voucher status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | ApiVoucherStatus)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 text-[13px] text-primary-text"
            >
              <option value="">All Statuses</option>
              <option value="POSTED">Posted</option>
              <option value="DRAFT">Draft</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-text"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voucher #, party, ref..."
              aria-label="Search day book"
              className="h-9 w-full rounded-sm border border-border-input bg-surface pl-9 pr-3 text-[13px] text-primary-text placeholder:text-disabled-text"
            />
          </div>
        </CardHeader>

        <DataTable
          ariaLabel="Full Day Book Register"
          data={vouchers}
          columns={columns}
          loading={dayBookQuery.isLoading}
          error={dayBookQuery.isError ? dayBookQuery.error.message : null}
          onRetry={() => dayBookQuery.refetch()}
          selectedRowId={selectedId !== null ? String(selectedId) : null}
          getRowId={(r) => String(r.id)}
          onRowActivate={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
          emptyTitle="No vouchers in selected range"
          emptyDescription="Adjust date/type filters or post a new balanced voucher."
          footer={
            <tr>
              <td
                colSpan={4}
                className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-semibold text-primary-text"
              >
                Posted Day Book Totals ({dayBookQuery.data?.posted_count ?? 0} posted
                {(dayBookQuery.data?.excluded_count ?? 0) > 0
                  ? ` · ${dayBookQuery.data?.excluded_count} excluded`
                  : ''}
                )
              </td>
              <td className="grand-total-num-cell px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                {formatCurrency(dayBookQuery.data?.posted_total_debit ?? '0.0000', {
                  showSymbol: false,
                })}
              </td>
              <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                {formatCurrency(dayBookQuery.data?.posted_total_credit ?? '0.0000', {
                  showSymbol: false,
                })}
              </td>
            </tr>
          }
        />
      </Card>

      {selectedVoucher ? (
        <Card padding="none">
          <CardHeader className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-accent" strokeWidth={1.75} />
              <CardTitle>
                <span className="code-mono">{selectedVoucher.voucher_number}</span>
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {selectedVoucher.status === 'POSTED' && !selectedVoucher.reversed_voucher_id ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={cancelVoucher.isPending}
                    leftIcon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    onClick={() => handleAction(selectedVoucher, true)}
                  >
                    Mirror Reversal
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={cancelVoucher.isPending}
                    leftIcon={<Ban className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    onClick={() => handleAction(selectedVoucher, false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
          </CardHeader>

          <div className="px-4 py-3.5 md:px-5">
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
                  {selectedVoucher.lines.map((ln) => {
                    const dr = formatBookAmountCell(ln.debit_amount)
                    const cr = formatBookAmountCell(ln.credit_amount)
                    return (
                      <tr key={ln.id} className="border-b border-border-row last:border-b-0">
                        <td className="px-3 py-2 code-mono text-muted-text">{ln.ledger_code}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => onOpenLedgerStatement(ln.ledger_id)}
                            className="font-medium text-accent hover:underline cursor-pointer"
                          >
                            {ln.ledger_name}
                          </button>
                        </td>
                        <td className="px-3 py-2 pr-4 text-right code-mono">{dr.text}</td>
                        <td className="border-l border-border-row px-3 py-2 pr-4 text-right code-mono">
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
  )
}
