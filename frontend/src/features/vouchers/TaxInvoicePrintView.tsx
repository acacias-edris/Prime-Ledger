import { AlertTriangle, ArrowLeft, Printer, RefreshCw } from 'lucide-react'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import {
  formatQuantityWithDecimals,
  formatTaxRateLabel,
  getGstStateName,
} from '../../lib/gstMath'
import { toScaledInt } from '../../lib/decimal'
import { useInvoiceDetail } from '../../api/gstInventory'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

export interface TaxInvoicePrintViewProps {
  invoiceId: number
  onBack: () => void
}

function getDocumentHeading(invoiceType: string): { title: string; copyLabel: string } {
  switch (invoiceType) {
    case 'PURCHASE':
      return { title: 'PURCHASE VOUCHER', copyLabel: 'Internal Accounting Copy' }
    case 'CREDIT_NOTE':
      return { title: 'CREDIT NOTE (GST)', copyLabel: 'Original for Recipient' }
    case 'DEBIT_NOTE':
      return { title: 'DEBIT NOTE (GST)', copyLabel: 'Original for Supplier' }
    default:
      return { title: 'TAX INVOICE', copyLabel: 'Original for Recipient' }
  }
}

export function TaxInvoicePrintView({ invoiceId, onBack }: TaxInvoicePrintViewProps) {
  const detailQuery = useInvoiceDetail(invoiceId)
  const inv = detailQuery.data

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <Button
            variant="secondary"
            leftIcon={<ArrowLeft className="h-4 w-4" strokeWidth={1.75} />}
            onClick={onBack}
          >
            Back to Invoices
          </Button>
        </div>
        <Card loading />
      </div>
    )
  }

  if (detailQuery.isError || !inv) {
    return (
      <div className="space-y-4">
        <Button
          variant="secondary"
          leftIcon={<ArrowLeft className="h-4 w-4" strokeWidth={1.75} />}
          onClick={onBack}
        >
          Back to Invoices
        </Button>
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {detailQuery.error?.message ?? 'Invoice not found.'}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => detailQuery.refetch()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const heading = getDocumentHeading(inv.invoice_type)
  const isPurchaseSide =
    inv.invoice_type === 'PURCHASE' || inv.invoice_type === 'DEBIT_NOTE'
  const showCess = toScaledInt(inv.cess_total) > 0n

  return (
    <div className="space-y-4">
      {/* Screen-Only Action Bar (Hidden in Print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button
          variant="secondary"
          leftIcon={<ArrowLeft className="h-4 w-4" strokeWidth={1.75} />}
          onClick={onBack}
        >
          Back to Invoices
        </Button>
        <div className="flex items-center gap-2">
          {inv.status === 'CANCELLED' ? (
            <Badge variant="danger">Cancelled Document</Badge>
          ) : null}
          <Button
            variant="primary"
            leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => window.print()}
          >
            Print / Save A4 PDF
          </Button>
        </div>
      </div>

      {/* A4 Printable Tax Invoice Sheet */}
      <article className="mx-auto w-full max-w-[920px] rounded-md border border-border-strong bg-surface p-6 text-primary-text print:max-w-none print:rounded-none print:border-border-strong print:p-0 print:shadow-none">
        {/* 1. Statutory Title & Copy Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border-strong pb-3">
          <div>
            <p className="type-xs uppercase text-muted-text">{heading.copyLabel}</p>
            <h1 className="text-[20px] font-bold tracking-tight text-primary-text">
              {heading.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="rounded-sm border border-border-subtle bg-muted px-2 py-0.5 font-semibold text-primary-text">
              Supply: {inv.supply_type}
            </span>
            <span className="rounded-sm border border-border-subtle bg-muted px-2 py-0.5 font-semibold text-primary-text">
              Reverse Charge: {inv.is_rcm ? 'Yes' : 'No'}
            </span>
            {inv.status === 'CANCELLED' ? (
              <span className="rounded-sm border border-[var(--status-danger-border)] bg-danger-bg px-2 py-0.5 font-bold uppercase text-danger">
                CANCELLED
              </span>
            ) : null}
          </div>
        </div>

        {/* 2. Seller, Buyer & Invoice Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 print:grid-cols-12 border-b border-border-strong">
          <div className="md:col-span-4 print:col-span-4 border-b md:border-b-0 md:border-r print:border-b-0 print:border-r border-border-subtle p-3.5 space-y-1">
            <p className="type-xs uppercase text-muted-text">
              {isPurchaseSide ? 'Recipient (Our Company)' : 'Supplier (Seller)'}
            </p>
            <p className="text-[14px] font-bold text-primary-text">
              {inv.seller_snapshot.legal_name}
            </p>
            <p className="code-mono text-[12px] text-primary-text">
              GSTIN: {inv.seller_snapshot.gstin ?? 'Unregistered'}
            </p>
            <p className="text-[12px] text-muted-text">
              State: {getGstStateName(inv.origin_state_code)}
            </p>
          </div>

          <div className="md:col-span-4 print:col-span-4 border-b md:border-b-0 md:border-r print:border-b-0 print:border-r border-border-subtle p-3.5 space-y-1">
            <p className="type-xs uppercase text-muted-text">
              {isPurchaseSide ? 'Supplier (Vendor)' : 'Buyer (Bill To / Ship To)'}
            </p>
            <p className="text-[14px] font-bold text-primary-text">
              {inv.party_snapshot.name}
            </p>
            <p className="code-mono text-[12px] text-primary-text">
              GSTIN: {inv.party_snapshot.gstin ?? 'Unregistered'}
            </p>
            <p className="text-[12px] text-muted-text">
              Place of Supply: {getGstStateName(inv.place_of_supply)}
            </p>
          </div>

          <div className="md:col-span-4 print:col-span-4 p-3.5 space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-2">
              <span className="text-muted-text">Invoice No.</span>
              <span className="code-mono font-bold text-primary-text">
                {inv.invoice_number}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-text">Date</span>
              <span className="code-mono font-medium text-primary-text">
                {formatDisplayDate(inv.invoice_date)}
              </span>
            </div>
            {inv.due_date ? (
              <div className="flex justify-between gap-2">
                <span className="text-muted-text">Due Date</span>
                <span className="code-mono font-medium text-primary-text">
                  {formatDisplayDate(inv.due_date)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <span className="text-muted-text">Voucher Ref</span>
              <span className="code-mono font-medium text-primary-text">
                {inv.voucher_number ?? 'Draft (Unposted)'}
              </span>
            </div>
            {inv.supplier_invoice_no ? (
              <div className="flex justify-between gap-2">
                <span className="text-muted-text">Supplier Ref</span>
                <span className="code-mono font-medium text-primary-text">
                  {inv.supplier_invoice_no}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* 3. Line Items Table */}
        <div className="mt-4 overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse border border-border-strong text-[12px]">
            <thead className="bg-table-header">
              <tr className="border-b border-border-strong text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-text">
                <th className="w-8 border-r border-border-subtle px-2 py-2 text-center">#</th>
                <th className="border-r border-border-subtle px-2.5 py-2 text-left">
                  Description of Goods / Services
                </th>
                <th className="w-20 border-r border-border-subtle px-2 py-2 text-left">HSN/SAC</th>
                <th className="w-24 border-r border-border-subtle px-2 py-2 text-right">Qty</th>
                <th className="w-24 border-r border-border-subtle px-2 py-2 text-right">Rate</th>
                <th className="w-20 border-r border-border-subtle px-2 py-2 text-right">Disc.</th>
                <th className="w-24 border-r border-border-subtle px-2 py-2 text-right">Taxable</th>
                {inv.is_inter_state ? (
                  <th className="w-28 border-r border-border-subtle px-2 py-2 text-right">
                    IGST
                  </th>
                ) : (
                  <>
                    <th className="w-24 border-r border-border-subtle px-2 py-2 text-right">
                      CGST
                    </th>
                    <th className="w-24 border-r border-border-subtle px-2 py-2 text-right">
                      SGST
                    </th>
                  </>
                )}
                <th className="w-28 px-2.5 py-2 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((ln) => (
                <tr key={ln.id} className="border-b border-border-row align-top">
                  <td className="border-r border-border-subtle px-2 py-2 text-center code-mono text-muted-text">
                    {ln.line_no}
                  </td>
                  <td className="border-r border-border-subtle px-2.5 py-2">
                    <p className="font-semibold text-primary-text">{ln.description}</p>
                    {ln.item_sku || ln.batch_ref || ln.godown_code ? (
                      <p className="mt-0.5 code-mono text-[10.5px] text-muted-text">
                        {[
                          ln.item_sku ? `SKU: ${ln.item_sku}` : null,
                          ln.batch_ref ? `Batch: ${ln.batch_ref}` : null,
                          ln.expiry_date ? `Exp: ${formatDisplayDate(ln.expiry_date)}` : null,
                          ln.godown_code ? `Wh: ${ln.godown_code}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </td>
                  <td className="border-r border-border-subtle px-2 py-2 code-mono text-primary-text">
                    {ln.hsn_sac_code ?? '—'}
                  </td>
                  <td className="border-r border-border-subtle px-2 py-2 text-right code-mono">
                    {formatQuantityWithDecimals(ln.quantity, 2)}{' '}
                    <span className="text-[10.5px] text-muted-text">{ln.uqc_code}</span>
                  </td>
                  <td className="border-r border-border-subtle px-2 py-2 text-right code-mono">
                    {formatCurrency(ln.unit_price, { showSymbol: false })}
                  </td>
                  <td className="border-r border-border-subtle px-2 py-2 text-right code-mono text-muted-text">
                    {toScaledInt(ln.discount_amount) > 0n
                      ? formatCurrency(ln.discount_amount, { showSymbol: false })
                      : '—'}
                  </td>
                  <td className="border-r border-border-subtle px-2 py-2 text-right code-mono font-medium">
                    {formatCurrency(ln.taxable_amount, { showSymbol: false })}
                  </td>
                  {inv.is_inter_state ? (
                    <td className="border-r border-border-subtle px-2 py-2 text-right code-mono">
                      <div>{formatCurrency(ln.igst_amount, { showSymbol: false })}</div>
                      <div className="text-[10.5px] text-muted-text">
                        @{formatTaxRateLabel(ln.igst_rate)}
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="border-r border-border-subtle px-2 py-2 text-right code-mono">
                        <div>{formatCurrency(ln.cgst_amount, { showSymbol: false })}</div>
                        <div className="text-[10.5px] text-muted-text">
                          @{formatTaxRateLabel(ln.cgst_rate)}
                        </div>
                      </td>
                      <td className="border-r border-border-subtle px-2 py-2 text-right code-mono">
                        <div>{formatCurrency(ln.sgst_amount, { showSymbol: false })}</div>
                        <div className="text-[10.5px] text-muted-text">
                          @{formatTaxRateLabel(ln.sgst_rate)}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-2.5 py-2 text-right code-mono font-semibold text-primary-text">
                    {formatCurrency(ln.line_total, { showSymbol: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 4. HSN / SAC Tax Summary Table */}
        <div className="mt-4 print-keep-together">
          <p className="mb-1.5 type-xs uppercase text-muted-text">HSN / SAC Tax Summary</p>
          <table className="w-full border-collapse border border-border-strong text-[11.5px]">
            <thead className="bg-table-header">
              <tr className="border-b border-border-strong font-semibold uppercase tracking-[0.04em] text-muted-text">
                <th className="border-r border-border-subtle px-2.5 py-1.5 text-left">HSN/SAC</th>
                <th className="border-r border-border-subtle px-2.5 py-1.5 text-right">
                  Taxable Value (₹)
                </th>
                <th className="border-r border-border-subtle px-2.5 py-1.5 text-right">CGST</th>
                <th className="border-r border-border-subtle px-2.5 py-1.5 text-right">SGST</th>
                <th className="border-r border-border-subtle px-2.5 py-1.5 text-right">IGST</th>
                <th className="px-2.5 py-1.5 text-right">Total Tax (₹)</th>
              </tr>
            </thead>
            <tbody>
              {inv.hsn_summary.map((h, i) => (
                <tr key={`${h.hsn_sac_code}-${i}`} className="border-b border-border-row">
                  <td className="border-r border-border-subtle px-2.5 py-1.5 code-mono font-medium">
                    {h.hsn_sac_code}
                  </td>
                  <td className="border-r border-border-subtle px-2.5 py-1.5 text-right code-mono">
                    {formatCurrency(h.taxable_amount, { showSymbol: false })}
                  </td>
                  <td className="border-r border-border-subtle px-2.5 py-1.5 text-right code-mono">
                    {formatCurrency(h.cgst_amount, { showSymbol: false })}{' '}
                    <span className="text-[10px] text-muted-text">
                      ({formatTaxRateLabel(h.cgst_rate)})
                    </span>
                  </td>
                  <td className="border-r border-border-subtle px-2.5 py-1.5 text-right code-mono">
                    {formatCurrency(h.sgst_amount, { showSymbol: false })}{' '}
                    <span className="text-[10px] text-muted-text">
                      ({formatTaxRateLabel(h.sgst_rate)})
                    </span>
                  </td>
                  <td className="border-r border-border-subtle px-2.5 py-1.5 text-right code-mono">
                    {formatCurrency(h.igst_amount, { showSymbol: false })}{' '}
                    <span className="text-[10px] text-muted-text">
                      ({formatTaxRateLabel(h.igst_rate)})
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right code-mono font-semibold">
                    {formatCurrency(h.total_tax, { showSymbol: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 5. Totals, Amount in Words & Authorized Signatory */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 print:grid-cols-12 border border-border-strong print-keep-together">
          <div className="md:col-span-7 print:col-span-7 flex flex-col justify-between border-b md:border-b-0 md:border-r print:border-b-0 print:border-r border-border-subtle p-4 space-y-4">
            <div>
              <p className="type-xs uppercase text-muted-text">Amount Chargeable (in words)</p>
              <p className="mt-1 text-[13px] font-semibold text-primary-text">
                {inv.amount_in_words}
              </p>
            </div>
            {inv.narration ? (
              <div>
                <p className="type-xs uppercase text-muted-text">Remarks / Narration</p>
                <p className="mt-0.5 text-[12px] text-muted-text">{inv.narration}</p>
              </div>
            ) : null}
            <div className="border-t border-border-subtle pt-2.5 text-[11px] text-muted-text">
              <p className="font-semibold text-primary-text">Statutory Declaration</p>
              <p>
                We declare that this invoice shows the actual price of the goods/services
                described and that all particulars are true and correct under CGST Rules.
              </p>
            </div>
          </div>

          <div className="md:col-span-5 print:col-span-5 flex flex-col justify-between p-4">
            <div className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted-text">Taxable Value</span>
                <span className="code-mono font-medium">
                  {formatCurrency(inv.taxable_total)}
                </span>
              </div>
              {!inv.is_inter_state ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-text">CGST</span>
                    <span className="code-mono">{formatCurrency(inv.cgst_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-text">SGST</span>
                    <span className="code-mono">{formatCurrency(inv.sgst_total)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-text">IGST</span>
                  <span className="code-mono">{formatCurrency(inv.igst_total)}</span>
                </div>
              )}
              {showCess ? (
                <div className="flex justify-between">
                  <span className="text-muted-text">Cess</span>
                  <span className="code-mono">{formatCurrency(inv.cess_total)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-text">Round Off</span>
                <span className="code-mono">
                  {formatCurrency(inv.round_off, { negativeStyle: 'minus' })}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border-strong pt-2">
                <span className="text-[13.5px] font-bold text-primary-text">Grand Total</span>
                <span className="grand-total-num-cell code-mono text-[15px] font-bold text-primary-text">
                  {formatCurrency(inv.grand_total)}
                </span>
              </div>
            </div>

            <div className="mt-8 border-t border-border-subtle pt-3 text-right">
              <p className="text-[11.5px] font-semibold text-primary-text">
                For {inv.seller_snapshot.legal_name}
              </p>
              <p className="mt-8 text-[11px] text-muted-text">Authorised Signatory</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}
