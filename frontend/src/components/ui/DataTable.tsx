import { useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
  type ColumnDef,
} from '@tanstack/react-table'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

// Static TanStack Table v9 features declared outside component for tree-shaking & stable types
const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

export type DataTableFeatures = typeof dataTableFeatures
export type DataTableColumnDef<TData extends object> = ColumnDef<
  DataTableFeatures,
  TData
>

export interface LedgerColumnMeta {
  align?: 'left' | 'right' | 'center'
  mono?: boolean
  minWidth?: string
  dividerLeft?: boolean
}

export type TableDensity = 'comfortable' | 'compact'

export interface DataTableProps<TData extends object> {
  data: TData[]
  columns: DataTableColumnDef<TData>[]
  density?: TableDensity
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  footer?: ReactNode
  selectedRowId?: string | null
  getRowId?: (row: TData) => string
  getRowClassName?: (row: TData) => string
  onRowActivate?: (row: TData) => void
  ariaLabel: string
  maxHeightClassName?: string
}

export function DataTable<TData extends object>({
  data,
  columns,
  density = 'comfortable',
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No matching entries',
  emptyDescription = 'Try clearing your filter or create a new voucher.',
  emptyAction,
  footer,
  selectedRowId,
  getRowId,
  getRowClassName,
  onRowActivate,
  ariaLabel,
  maxHeightClassName = 'max-h-[540px]',
}: DataTableProps<TData>) {
  const [cursorIndex, setCursorIndex] = useState<number>(-1)

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
  })

  const rows = table.getRowModel().rows
  const sortingState = table.state.sorting

  const handleTableKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursorIndex((prev) => Math.min(rows.length - 1, prev + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursorIndex((prev) => Math.max(0, prev - 1))
    } else if (event.key === 'Enter' && cursorIndex >= 0 && cursorIndex < rows.length) {
      event.preventDefault()
      onRowActivate?.(rows[cursorIndex].original)
    }
  }

  const rowHeightClass =
    density === 'compact'
      ? 'h-[var(--row-h-mobile)] md:h-[var(--row-h-compact)] text-[13px]'
      : 'h-[var(--row-h-mobile)] md:h-[var(--row-h-comfortable)] text-[14px]'

  return (
    <div className="w-full">
      {error ? (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/35 bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{error}</span>
          </div>
          {onRetry ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetry}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
        aria-label={ariaLabel}
        className={cn(
          'table-scroll w-full border-t border-border-subtle focus-visible:outline-2 focus-visible:outline-ring-focus',
          maxHeightClassName,
        )}
      >
        <table className="w-full min-w-[780px] border-collapse text-left">
          <thead className="sticky top-0 z-[var(--z-sticky)] bg-table-header">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border-subtle">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as LedgerColumnMeta | undefined
                  const canSort = header.column.getCanSort()
                  const activeSort = sortingState.find((s) => s.id === header.column.id)
                  const ariaSort: 'ascending' | 'descending' | 'none' = activeSort
                    ? activeSort.desc
                      ? 'descending'
                      : 'ascending'
                    : 'none'

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={canSort ? ariaSort : undefined}
                      style={meta?.minWidth ? { minWidth: meta.minWidth } : undefined}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      className={cn(
                        'px-3 py-2.5 text-[var(--fs-th)] font-semibold uppercase leading-[1.2] tracking-[0.03em] text-muted-text whitespace-nowrap select-none',
                        canSort && 'cursor-pointer hover:text-primary-text',
                        meta?.align === 'right' && 'text-right',
                        meta?.align === 'center' && 'text-center',
                        meta?.dividerLeft && 'border-l border-border-subtle',
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
                              <ArrowDown className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                            ) : (
                              <ArrowUp className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-55" strokeWidth={1.75} aria-hidden="true" />
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
            {loading ? (
              Array.from({ length: 8 }).map((_, rowIdx) => (
                <tr key={`skeleton-${rowIdx}`} className={cn('border-b border-border-subtle', rowHeightClass)}>
                  {columns.map((_col, colIdx) => (
                    <td key={`skeleton-${rowIdx}-${colIdx}`} className="px-3 py-2">
                      <div className="h-3.5 w-full max-w-[140px] rounded-sm bg-muted animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const rowKey = getRowId ? getRowId(row.original) : row.id
                const isSelected =
                  (selectedRowId != null && rowKey === selectedRowId) || idx === cursorIndex
                const customClass = getRowClassName ? getRowClassName(row.original) : ''

                return (
                  <tr
                    key={row.id}
                    onClick={() => {
                      setCursorIndex(idx)
                      onRowActivate?.(row.original)
                    }}
                    className={cn(
                      'border-b border-border-subtle transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                      rowHeightClass,
                      onRowActivate && 'cursor-pointer',
                      isSelected
                        ? 'bg-row-selected shadow-[inset_2px_0_0_0_var(--accent-primary)]'
                        : 'bg-surface hover:bg-row-hover',
                      customClass,
                    )}
                  >
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as LedgerColumnMeta | undefined
                      return (
                        <td
                          key={cell.id}
                          style={meta?.minWidth ? { minWidth: meta.minWidth } : undefined}
                          className={cn(
                            'px-3 py-2 align-middle text-primary-text',
                            meta?.align === 'right' && 'text-right pr-3',
                            meta?.align === 'center' && 'text-center',
                            meta?.mono && 'tabular-mono',
                            meta?.dividerLeft && 'border-l border-border-subtle',
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>

          {footer && !loading && rows.length > 0 ? (
            <tfoot className="sticky bottom-0 z-[var(--z-sticky)] bg-row-group">
              {footer}
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}
