import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Printer, RefreshCw, XCircle } from 'lucide-react'
import type { BalanceSheetSectionGroupDTO } from '../../lib/api'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { useBalanceSheet } from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'

export interface BalanceSheetViewProps {
  onOpenLedgerStatement: (ledgerId: number) => void
}

function BalanceSheetColumn({
  groups,
  extraLine,
  onOpenLedger,
}: {
  groups: BalanceSheetSectionGroupDTO[]
  extraLine?: { label: string; sublabel: string; amount: string }
  onOpenLedger: (ledgerId: number) => void
}) {
  return (
    <div className="divide-y divide-border-row">
      {groups.map((grp) => (
        <div key={grp.group_id}>
          <div className="flex items-center justify-between gap-2 bg-row-group px-4 py-2.5">
            <span className="text-[13.5px] font-semibold text-primary-text">
              {grp.group_name}
            </span>
            <span className="code-mono text-[13.5px] font-semibold text-primary-text">
              {formatCurrency(grp.total, { showSymbol: false, negativeStyle: 'parens' })}
            </span>
          </div>
          <ul className="divide-y divide-border-row">
            {grp.ledgers.map((item) => (
              <li
                key={item.ledger_id}
                className="flex items-center justify-between gap-3 px-4 py-2 pl-7 hover:bg-row-hover"
              >
                <button
                  type="button"
                  onClick={() => onOpenLedger(item.ledger_id)}
                  className="truncate text-left text-[13.5px] font-medium text-accent hover:underline cursor-pointer"
                >
                  <span className="code-mono mr-2 text-[12px] text-muted-text">
                    {item.ledger_code}
                  </span>
                  {item.ledger_name}
                </button>
                <span className="shrink-0 code-mono text-[13.5px] text-primary-text">
                  {formatCurrency(item.amount, { showSymbol: false, negativeStyle: 'parens' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {extraLine ? (
        <div className="flex items-center justify-between gap-3 bg-row-group px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold text-primary-text">{extraLine.label}</p>
            <p className="text-[11.5px] text-muted-text">{extraLine.sublabel}</p>
          </div>
          <span className="code-mono text-[14px] font-bold text-primary-text">
            {formatCurrency(extraLine.amount, { showSymbol: false, negativeStyle: 'parens' })}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export function BalanceSheetView({ onOpenLedgerStatement }: BalanceSheetViewProps) {
  const [asOfDate, setAsOfDate] = useState('2027-03-31')
  const bsQuery = useBalanceSheet({ as_of_date: asOfDate || undefined })
  const bs = bsQuery.data

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            {bs ? `As of ${formatDisplayDate(bs.as_of_date)}` : 'Statement of Financial Position'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="type-h1">Balance Sheet</h1>
            {bs ? (
              bs.is_balanced ? (
                <Badge
                  variant="success"
                  icon={<CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                >
                  Balanced · Assets = Liabilities + Equity
                </Badge>
              ) : (
                <Badge
                  variant="danger"
                  icon={<XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                >
                  Difference: {formatCurrency(bs.difference)}
                </Badge>
              )
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <label className="text-[12.5px] font-medium text-muted-text" htmlFor="bs-as-of">
            As of
          </label>
          <input
            id="bs-as-of"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
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

      {bsQuery.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {bsQuery.error.message}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => bsQuery.refetch()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {bsQuery.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card loading />
          <Card loading />
        </div>
      ) : bs ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">
          {/* Left Side: Capital, Equity & Liabilities */}
          <Card padding="none">
            <CardHeader>
              <CardTitle>Liabilities &amp; Equity</CardTitle>
              <span className="code-mono text-[13px] font-semibold text-muted-text">INR (₹)</span>
            </CardHeader>
            <BalanceSheetColumn
              groups={[...bs.equity, ...bs.liabilities]}
              extraLine={{
                label: 'Current Period Net Profit / (Loss)',
                sublabel: 'Auto-carried from Profit & Loss Statement',
                amount: bs.current_period_net_profit,
              }}
              onOpenLedger={onOpenLedgerStatement}
            />
            <div className="flex items-center justify-between gap-3 border-t-2 border-border-strong bg-row-group px-4 py-3">
              <span className="text-[14px] font-bold text-primary-text">
                Total Liabilities &amp; Equity
              </span>
              <span className="grand-total-num-cell code-mono text-[15px] font-bold text-primary-text">
                {formatCurrency(bs.total_liabilities_and_equity, { negativeStyle: 'parens' })}
              </span>
            </div>
          </Card>

          {/* Right Side: Assets */}
          <Card padding="none">
            <CardHeader>
              <CardTitle>Assets</CardTitle>
              <span className="code-mono text-[13px] font-semibold text-muted-text">INR (₹)</span>
            </CardHeader>
            <BalanceSheetColumn
              groups={bs.assets}
              onOpenLedger={onOpenLedgerStatement}
            />
            <div className="flex items-center justify-between gap-3 border-t-2 border-border-strong bg-row-group px-4 py-3">
              <span className="text-[14px] font-bold text-primary-text">Total Assets</span>
              <span className="grand-total-num-cell code-mono text-[15px] font-bold text-primary-text">
                {formatCurrency(bs.total_assets, { negativeStyle: 'parens' })}
              </span>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
