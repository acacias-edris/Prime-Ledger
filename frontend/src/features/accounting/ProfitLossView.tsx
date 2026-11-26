import { useState } from 'react'
import { AlertTriangle, Printer, RefreshCw } from 'lucide-react'
import type { StatementLineItemDTO } from '../../lib/api'
import { absBigInt, fromScaledInt, toScaledInt } from '../../lib/decimal'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { useProfitLoss } from '../../hooks/useAccounting'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'

export interface ProfitLossViewProps {
  onOpenLedgerStatement: (ledgerId: number) => void
}

function StatementSideTable({
  title,
  items,
  extraRows,
  totalLabel,
  totalAmount,
  onOpenLedger,
}: {
  title: string
  items: StatementLineItemDTO[]
  extraRows?: Array<{ label: string; amount: string; emphasized?: boolean }>
  totalLabel: string
  totalAmount: string
  onOpenLedger: (ledgerId: number) => void
}) {
  return (
    <div className="flex flex-col justify-between">
      <div className="table-scroll">
        <table className="w-full border-collapse text-[13.5px]">
          <thead className="bg-table-header">
            <tr className="h-9 border-b border-border-row text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
              <th className="px-4 py-2 text-left">{title}</th>
              <th className="px-4 py-2 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (!extraRows || extraRows.length === 0) ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-[13px] text-disabled-text">
                  No posted entries in this section
                </td>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr
                key={item.ledger_id}
                className="border-b border-border-row hover:bg-row-hover"
              >
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenLedger(item.ledger_id)}
                    className="text-left font-medium text-accent hover:underline cursor-pointer"
                  >
                    {item.ledger_name}
                  </button>
                  <p className="text-[11.5px] text-muted-text">
                    <span className="code-mono">{item.ledger_code}</span> · {item.group_name}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-right code-mono font-medium text-primary-text">
                  {formatCurrency(item.amount, { showSymbol: false, negativeStyle: 'parens' })}
                </td>
              </tr>
            ))}
            {extraRows?.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border-row bg-row-group"
              >
                <td
                  className={
                    row.emphasized
                      ? 'px-4 py-2.5 font-semibold text-primary-text'
                      : 'px-4 py-2.5 font-medium text-muted-text'
                  }
                >
                  {row.label}
                </td>
                <td className="px-4 py-2.5 text-right code-mono font-semibold text-primary-text">
                  {formatCurrency(row.amount, { showSymbol: false, negativeStyle: 'parens' })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-row-group">
            <tr>
              <td className="border-t-2 border-border-strong px-4 py-2.5 text-[14px] font-bold text-primary-text">
                {totalLabel}
              </td>
              <td className="grand-total-num-cell px-4 py-2.5 text-right code-mono text-[14px] font-bold text-primary-text">
                {formatCurrency(totalAmount, { showSymbol: false, negativeStyle: 'parens' })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export function ProfitLossView({ onOpenLedgerStatement }: ProfitLossViewProps) {
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')

  const plQuery = useProfitLoss({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  })
  const pl = plQuery.data

  const grossProfitScaled = toScaledInt(pl?.gross_profit)
  const netProfitScaled = toScaledInt(pl?.net_profit)
  const isGrossLoss = grossProfitScaled < 0n
  const isNetLoss = netProfitScaled < 0n

  const absGrossAmt = fromScaledInt(absBigInt(grossProfitScaled), 4)
  const absNetAmt = fromScaledInt(absBigInt(netProfitScaled), 4)
  const plBalancedSideTotal = fromScaledInt(
    (!isGrossLoss ? grossProfitScaled : 0n) +
      toScaledInt(pl?.total_indirect_income) +
      (isNetLoss ? absBigInt(netProfitScaled) : 0n),
    4,
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            {pl
              ? `Trading & P&L · ${formatDisplayDate(pl.from_date)} to ${formatDisplayDate(pl.to_date)}`
              : 'Trading Account & Profit & Loss Statement'}
          </p>
          <h1 className="mt-1 type-h1">Profit &amp; Loss Statement</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
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
          <Button
            variant="secondary"
            leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => window.print()}
          >
            Print A4
          </Button>
        </div>
      </div>

      {plQuery.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {plQuery.error.message}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => plQuery.refetch()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {/* Top Executive Strip */}
      {plQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card loading />
          <Card loading />
          <Card loading />
        </div>
      ) : pl ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 rounded-md border border-border-subtle bg-surface shadow-[var(--shadow-card)]">
            <div className="px-6 py-5">
              <p className="type-xs uppercase text-muted-text">Total Direct Revenue</p>
              <p className="mt-2 type-kpi">
                {formatCurrency(pl.total_direct_income, { negativeStyle: 'parens' })}
              </p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-border-subtle px-6 py-5">
              <p className="type-xs uppercase text-muted-text">
                {isGrossLoss ? 'Gross Loss' : 'Gross Profit'}
              </p>
              <p className="mt-2 type-kpi">
                {formatCurrency(pl.gross_profit, { negativeStyle: 'parens' })}
              </p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-border-subtle px-6 py-5">
              <p className="type-xs uppercase text-muted-text">
                {isNetLoss ? 'Net Loss' : 'Net Profit'}
              </p>
              <p className="mt-2 type-kpi">
                {formatCurrency(pl.net_profit, { negativeStyle: 'parens' })}
              </p>
            </div>
          </div>

          {/* Part 1: Trading Account */}
          <Card padding="none">
            <CardHeader>
              <CardTitle>Part I — Trading Account (Gross Profit / Loss)</CardTitle>
              <span className="code-mono text-[13px] font-semibold text-primary-text">
                {isGrossLoss ? 'Gross Loss: ' : 'Gross Profit: '}
                {formatCurrency(pl.gross_profit, { negativeStyle: 'parens' })}
              </span>
            </CardHeader>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
              <StatementSideTable
                title="Direct Expenses (Dr)"
                items={pl.direct_expenses}
                extraRows={
                  !isGrossLoss
                    ? [{ label: 'Gross Profit c/o', amount: absGrossAmt, emphasized: true }]
                    : undefined
                }
                totalLabel={isGrossLoss ? 'Total Direct Expenses' : 'Total Direct Expenses + Gross Profit'}
                totalAmount={isGrossLoss ? pl.total_direct_expenses : pl.total_direct_income}
                onOpenLedger={onOpenLedgerStatement}
              />
              <StatementSideTable
                title="Direct Income / Sales (Cr)"
                items={pl.direct_income}
                extraRows={
                  isGrossLoss
                    ? [{ label: 'Gross Loss c/o', amount: absGrossAmt, emphasized: true }]
                    : undefined
                }
                totalLabel={isGrossLoss ? 'Total Direct Income + Gross Loss' : 'Total Direct Income'}
                totalAmount={isGrossLoss ? pl.total_direct_expenses : pl.total_direct_income}
                onOpenLedger={onOpenLedgerStatement}
              />
            </div>
          </Card>

          {/* Part 2: Profit & Loss Account */}
          <Card padding="none">
            <CardHeader>
              <CardTitle>Part II — Profit &amp; Loss Account (Net Profit / Loss)</CardTitle>
              <span className="code-mono text-[13px] font-semibold text-primary-text">
                {isNetLoss ? 'Net Loss: ' : 'Net Profit: '}
                {formatCurrency(pl.net_profit, { negativeStyle: 'parens' })}
              </span>
            </CardHeader>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
              <StatementSideTable
                title="Indirect Expenses (Dr)"
                items={pl.indirect_expenses}
                extraRows={[
                  ...(isGrossLoss
                    ? [{ label: 'Gross Loss b/f', amount: absGrossAmt }]
                    : []),
                  ...(!isNetLoss
                    ? [{ label: 'Net Profit (Transferred to Balance Sheet)', amount: absNetAmt, emphasized: true }]
                    : []),
                ]}
                totalLabel={
                  isNetLoss
                    ? 'Total Indirect Expenses'
                    : 'Total Indirect Expenses + Net Profit'
                }
                totalAmount={plBalancedSideTotal}
                onOpenLedger={onOpenLedgerStatement}
              />
              <StatementSideTable
                title="Gross Profit & Indirect Income (Cr)"
                items={pl.indirect_income}
                extraRows={[
                  ...(!isGrossLoss
                    ? [{ label: 'Gross Profit b/f', amount: absGrossAmt, emphasized: true }]
                    : []),
                  ...(isNetLoss
                    ? [{ label: 'Net Loss (Transferred to Balance Sheet)', amount: absNetAmt, emphasized: true }]
                    : []),
                ]}
                totalLabel={
                  isNetLoss
                    ? 'Total Income + Net Loss'
                    : 'Total Gross Profit & Indirect Income'
                }
                totalAmount={plBalancedSideTotal}
                onOpenLedger={onOpenLedgerStatement}
              />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}
