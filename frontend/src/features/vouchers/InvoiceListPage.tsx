import { useMemo, useState } from 'react'
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FilePlus2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { ApiError } from '../../lib/api'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { getGstStateName } from '../../lib/gstMath'
import {
  useCancelInvoice,
  useInvoices,
  usePostDraftInvoice,
  type InvoiceListItemDTO,
  type InvoiceStatus,
  type InvoiceType,
} from '../../api/gstInventory'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import type { LedgerColumnMeta } from '../../components/ui/DataTable'

const invoiceTableFeatures = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    equalsString: filterFn_equalsString,
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
  },
})

type InvoiceTableColumnDef = ColumnDef<typeof invoiceTableFeatures, InvoiceListItemDTO>

const TYPE_PILLS: Array<{ id: 'ALL' | InvoiceType; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'SALES', label: 'Sales' },
  { id: 'PURCHASE', label: 'Purchase' },
  { id: 'CREDIT_NOTE', label: 'Credit Notes' },
  { id: 'DEBIT_NOTE', label: 'Debit Notes' },
]

export interface InvoiceListPageProps {
  onNewInvoice: (type: InvoiceType, originalId?: number) => void
  onPrintInvoice: (invoiceId: number) => void
  onNotify: (message: string) => void
}

export function InvoiceListPage({
  onNewInvoice,
  onPrintInvoice,
  onNotify,
}: InvoiceListPageProps) {
  const [typeFilter, setTypeFilter] = useState<'ALL' | InvoiceType>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('ALL')
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')
  const [searchText, setSearchText] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const [cancelTarget, setCancelTarget] = useState<InvoiceListItemDTO | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const invoicesQuery = useInvoices({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  })
  const postDraft = usePostDraftInvoice()
  const cancelInvoice = useCancelInvoice()

  const allInvoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data])

  // Apply search filter cleanly while letting TanStack Table v9 columnFilteringFeature filter type & status
  const searchFilteredData = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return allInvoices
    return allInvoices.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.party_name_snapshot.toLowerCase().includes(q) ||
        (inv.party_gstin_snapshot ?? '').toLowerCase().includes(q),
    )
  }, [allInvoices, searchText])

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = []
    if (typeFilter !== 'ALL') {
      filters.push({ id: 'invoice_type', value: typeFilter })
    }
    if (statusFilter !== 'ALL') {
      filters.push({ id: 'status', value: statusFilter })
    }
    return filters
  }, [typeFilter, statusFilter])

  const columns = useMemo<InvoiceTableColumnDef[]>(
    () => [
      {
        accessorKey: 'invoice_date',
        header: 'Date',
        meta: { align: 'left', mono: true, width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'code-mono text-[13px] text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatDisplayDate(row.original.invoice_date)}
            </span>
          )
        },
      },
      {
        accessorKey: 'invoice_number',
        header: 'Invoice No.',
        meta: { align: 'left', mono: true, width: '164px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const inv = row.original
          const cancelled = inv.status === 'CANCELLED'
          const isCopied = copiedId === inv.id
          return (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  navigator.clipboard?.writeText(inv.invoice_number)
                  setCopiedId(inv.id)
                  window.setTimeout(() => setCopiedId((prev) => (prev === inv.id ? null : prev)), 1500)
                }}
                title="Copy invoice number"
                className={cn(
                  'inline-flex items-center gap-1 code-mono text-[13px] font-medium hover:text-accent cursor-pointer',
                  cancelled ? 'line-through text-disabled-text' : 'text-primary-text',
                )}
              >
                <span>{inv.invoice_number}</span>
                {isCopied ? (
                  <Check className="h-3 w-3 text-success" strokeWidth={2} />
                ) : (
                  <Copy className="h-3 w-3 opacity-50" strokeWidth={1.75} />
                )}
              </button>
            </div>
          )
        },
      },
      {
        accessorKey: 'invoice_type',
        header: 'Type',
        filterFn: 'equalsString',
        meta: { align: 'left', width: '116px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <Badge variant={row.original.is_rcm ? 'warning' : 'neutral'} icon={false}>
            {row.original.invoice_type.replace('_', ' ')}
          </Badge>
        ),
      },
      {
        accessorKey: 'party_name_snapshot',
        header: 'Party & GSTIN',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const inv = row.original
          const cancelled = inv.status === 'CANCELLED'
          return (
            <div className="min-w-0">
              <p
                title={inv.party_name_snapshot}
                className={cn(
                  'truncate text-[13.5px] font-medium text-primary-text',
                  cancelled && 'line-through text-disabled-text',
                )}
              >
                {inv.party_name_snapshot}
              </p>
              <p className="mt-0.5 code-mono text-[11.5px] text-muted-text">
                {inv.party_gstin_snapshot ?? 'Unregistered'}
              </p>
            </div>
          )
        },
      },
      {
        accessorKey: 'place_of_supply',
        header: 'POS / Supply',
        meta: { align: 'left', width: '150px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0 text-[12.5px]">
            <p className="truncate text-primary-text">
              {getGstStateName(row.original.place_of_supply)}
            </p>
            <p className="text-[11px] text-muted-text">
              {row.original.is_inter_state ? 'IGST' : 'CGST+SGST'} · {row.original.supply_type}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'taxable_total',
        header: 'Taxable (₹)',
        meta: { align: 'right', mono: true, width: '124px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'code-mono text-[13px]',
                cancelled ? 'line-through text-disabled-text' : 'text-primary-text',
              )}
            >
              {formatCurrency(row.original.taxable_total, { showSymbol: false })}
            </span>
          )
        },
      },
      {
        accessorKey: 'tax_total',
        header: 'GST (₹)',
        meta: { align: 'right', mono: true, width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'code-mono text-[13px]',
                cancelled ? 'line-through text-disabled-text' : 'text-primary-text',
              )}
            >
              {formatCurrency(row.original.tax_total, { showSymbol: false })}
            </span>
          )
        },
      },
      {
        accessorKey: 'grand_total',
        header: 'Grand Total (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '136px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-semibold',
                cancelled ? 'line-through text-disabled-text' : 'text-primary-text',
              )}
            >
              {formatCurrency(row.original.grand_total, { showSymbol: false })}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        filterFn: 'equalsString',
        meta: { align: 'center', width: '120px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const st = row.original.status
          if (st === 'POSTED') {
            return (
              <Badge
                variant="success"
                icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />}
              >
                Posted
              </Badge>
            )
          }
          if (st === 'DRAFT') {
            return (
              <Badge variant="warning" icon={<Clock className="h-3.5 w-3.5" strokeWidth={2} />}>
                Draft
              </Badge>
            )
          }
          return (
            <Badge variant="danger" icon={<XCircle className="h-3.5 w-3.5" strokeWidth={2} />}>
              Cancelled
            </Badge>
          )
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right', width: '210px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const inv = row.original
          return (
            <div className="inline-flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                title="Print A4 Tax Invoice"
                aria-label={`Print ${inv.invoice_number}`}
                onClick={() => onPrintInvoice(inv.id)}
                className="h-8 px-2"
              >
                <Printer className="h-3.5 w-3.5" strokeWidth={1.75} />
              </Button>
              {inv.status === 'DRAFT' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={postDraft.isPending}
                  onClick={async () => {
                    try {
                      const posted = await postDraft.mutateAsync(inv.id)
                      onNotify(`Posted ${posted.invoice_number} and created Voucher`)
                    } catch (err) {
                      onNotify(err instanceof Error ? err.message : 'Failed to post draft')
                    }
                  }}
                  className="h-8 px-2 text-[12px]"
                  leftIcon={<Send className="h-3 w-3" strokeWidth={1.75} />}
                >
                  Post
                </Button>
              ) : null}
              {inv.status === 'POSTED' &&
              (inv.invoice_type === 'SALES' || inv.invoice_type === 'PURCHASE') ? (
                <Button
                  variant="ghost"
                  size="sm"
                  title={
                    inv.invoice_type === 'SALES'
                      ? 'Create Credit Note (Sales Return)'
                      : 'Create Debit Note (Purchase Return)'
                  }
                  onClick={() =>
                    onNewInvoice(
                      inv.invoice_type === 'SALES' ? 'CREDIT_NOTE' : 'DEBIT_NOTE',
                      inv.id,
                    )
                  }
                  className="h-8 px-2 text-[12px]"
                  leftIcon={<FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                >
                  {inv.invoice_type === 'SALES' ? 'CN' : 'DN'}
                </Button>
              ) : null}
              {inv.status !== 'CANCELLED' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Cancel Invoice"
                  aria-label={`Cancel ${inv.invoice_number}`}
                  onClick={() => {
                    setCancelTarget(inv)
                    setCancelReason('')
                    setCancelError(null)
                  }}
                  className="h-8 px-2 text-danger hover:bg-danger-bg"
                >
                  <Ban className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Button>
              ) : null}
            </div>
          )
        },
      },
    ],
    [copiedId, onNewInvoice, onNotify, onPrintInvoice, postDraft],
  )

  const table = useTable({
    features: invoiceTableFeatures,
    columns,
    data: searchFilteredData,
    state: { columnFilters },
  })

  const rows = table.getRowModel().rows
  const sortingState = table.state.sorting

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return
    if (cancelReason.trim().length < 3) {
      setCancelError('Cancellation reason must be at least 3 characters.')
      return
    }
    setCancelError(null)
    try {
      const cancelled = await cancelInvoice.mutateAsync({
        invoiceId: cancelTarget.id,
        reason: cancelReason.trim(),
      })
      onNotify(`Cancelled ${cancelled.invoice_number} and reversed stock/ledger entries`)
      setCancelTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        setCancelError(err.message)
      } else {
        setCancelError(err instanceof Error ? err.message : 'Unable to cancel invoice.')
      }
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            GST Tax Invoices, Purchases &amp; Credit/Debit Notes · {rows.length} Documents
          </p>
          <h1 className="mt-1 type-h1">Invoice Register</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            shortcut="F9"
            leftIcon={<Plus className="h-4 w-4" strokeWidth={2} />}
            onClick={() => onNewInvoice('PURCHASE')}
          >
            New Purchase
          </Button>
          <Button
            variant="primary"
            shortcut="F8"
            leftIcon={<Plus className="h-4 w-4" strokeWidth={2} />}
            onClick={() => onNewInvoice('SALES')}
          >
            New Sales Invoice
          </Button>
        </div>
      </div>

      <Card padding="none">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border-input bg-muted p-[3px]">
              {TYPE_PILLS.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  aria-pressed={typeFilter === pill.id}
                  onClick={() => setTypeFilter(pill.id)}
                  className={cn(
                    'h-8 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                    typeFilter === pill.id
                      ? 'bg-surface font-semibold text-primary-text shadow-sm'
                      : 'font-medium text-muted-text hover:text-primary-text',
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter invoice status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | InvoiceStatus)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 text-[13px] text-primary-text"
            >
              <option value="ALL">All Statuses</option>
              <option value="POSTED">Posted</option>
              <option value="DRAFT">Draft</option>
              <option value="CANCELLED">Cancelled</option>
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

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-text"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search invoice #, party, GSTIN..."
              aria-label="Search invoices"
              className="h-9 w-full rounded-sm border border-border-input bg-surface pl-9 pr-3 text-[13px] text-primary-text placeholder:text-disabled-text"
            />
          </div>
        </CardHeader>

        {invoicesQuery.isError ? (
          <div
            role="alert"
            className="m-4 flex items-center justify-between gap-3 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
          >
            <span className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {invoicesQuery.error.message}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => invoicesQuery.refetch()}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
            >
              Retry
            </Button>
          </div>
        ) : null}

        <div className="table-scroll max-h-[680px] border-t border-border-row">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead className="sticky top-0 z-[var(--z-sticky)] bg-table-header">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="h-9 border-b border-border-row">
                  {hg.headers.map((header) => {
                    const meta = header.column.columnDef.meta as LedgerColumnMeta | undefined
                    const canSort = header.column.getCanSort()
                    const activeSort = sortingState.find((s) => s.id === header.column.id)
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        style={meta?.width ? { width: meta.width } : undefined}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        className={cn(
                          'group/th px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text whitespace-nowrap select-none',
                          canSort && 'cursor-pointer hover:text-primary-text',
                          meta?.align === 'right' && 'text-right pr-4',
                          meta?.align === 'center' && 'text-center',
                          meta?.dividerLeft && 'border-l border-border-row',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex items-center gap-1',
                            meta?.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          <table.FlexRender header={header} />
                          {canSort ? (
                            activeSort ? (
                              activeSort.desc ? (
                                <ArrowDown className="h-3 w-3 text-accent" strokeWidth={1.75} />
                              ) : (
                                <ArrowUp className="h-3 w-3 text-accent" strokeWidth={1.75} />
                              )
                            ) : (
                              <ArrowUpDown
                                className="h-3 w-3 opacity-0 group-hover/th:opacity-70"
                                strokeWidth={1.75}
                              />
                            )
                          ) : null}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {invoicesQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} className="h-12 border-b border-border-row">
                    {columns.map((_c, colIdx) => (
                      <td key={`skel-${idx}-${colIdx}`} className="px-3 py-2.5">
                        <div className="h-3.5 w-full max-w-[110px] rounded-sm bg-muted animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    <EmptyState
                      title="No matching invoices"
                      description="Adjust your filters or create a new GST Sales or Purchase invoice."
                      action={
                        <Button
                          variant="primary"
                          shortcut="F8"
                          onClick={() => onNewInvoice('SALES')}
                        >
                          New Sales Invoice
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="h-[52px] border-b border-border-row bg-surface hover:bg-row-hover transition-colors duration-[var(--dur-fast)]"
                  >
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as LedgerColumnMeta | undefined
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            'px-3 py-2 align-middle text-primary-text',
                            meta?.align === 'right' && 'text-right pr-4',
                            meta?.align === 'center' && 'text-center',
                            meta?.dividerLeft && 'border-l border-border-row',
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Non-Destructive Cancel Modal (Displays HTTP 409 LOT_ALREADY_CONSUMED inline) */}
      {cancelTarget ? (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center px-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-invoice-title"
        >
          <div
            className="fixed inset-0 bg-backdrop"
            onClick={() => setCancelTarget(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-[480px] rounded-lg border border-border-strong bg-raised p-5 text-primary-text shadow-md space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="cancel-invoice-title" className="type-h2">
                  Cancel Invoice{' '}
                  <span className="code-mono">{cancelTarget.invoice_number}</span>
                </h2>
                <p className="mt-1 text-[13px] text-muted-text">
                  Preserves statutory invoice number for GSTR-1 Table 13 and reverses linked
                  voucher &amp; stock batches atomically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                aria-label="Close modal"
                className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-text hover:bg-muted hover:text-primary-text cursor-pointer"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            {cancelError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3.5 py-2.5 text-[13px] font-medium text-danger"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>{cancelError}</span>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="cancel-reason-input"
                className="text-[13px] font-medium text-primary-text"
              >
                Cancellation Reason (Required, min 3 chars)
              </label>
              <textarea
                id="cancel-reason-input"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Duplicate entry or order cancelled prior to dispatch"
                className="w-full rounded-sm border border-border-input bg-surface p-2.5 text-[13.5px] text-primary-text placeholder:text-disabled-text"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                Keep Invoice
              </Button>
              <Button
                variant="danger"
                loading={cancelInvoice.isPending}
                onClick={handleConfirmCancel}
                leftIcon={<Ban className="h-4 w-4" strokeWidth={1.75} />}
              >
                Confirm Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
