import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Plus,
  Printer,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { DECIMAL_INPUT_REGEX, fromScaledInt, toScaledInt } from '../../lib/decimal'
import { formatCurrency } from '../../lib/format'
import {
  calculateGstInvoiceBigInt,
  formatTaxRateLabel,
  getGstStateName,
  INDIAN_GST_STATES,
  type GstSupplyType,
} from '../../lib/gstMath'
import { ApiError } from '../../lib/api'
import { useCompanyContext, useLedgers } from '../../hooks/useAccounting'
import {
  useCreateInvoice,
  useGodowns,
  useInventoryItems,
  useInvoiceDetail,
  useInvoices,
  useTaxSlabs,
  type InvoiceDetailDTO,
  type InvoiceType,
} from '../../api/gstInventory'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Kbd } from '../../components/ui/Kbd'

export const INVOICE_BUILDER_FORM_ID = 'ledgerprime-invoice-builder-form'

const positiveDecimalSchema = z
  .string()
  .trim()
  .refine(
    (v) => v !== '' && DECIMAL_INPUT_REGEX.test(v) && toScaledInt(v) > 0n,
    'Must be > 0',
  )

const nonNegDecimalSchema = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || DECIMAL_INPUT_REGEX.test(v),
    'Invalid decimal (max 4 decimals)',
  )

const invoiceLineFormSchema = z.object({
  item_id: z.string(),
  godown_id: z.string(),
  description: z.string().trim().min(1, 'Description is required').max(255),
  hsn_sac_code: z.string().trim().max(8),
  uqc_code: z.string().trim().max(16),
  quantity: positiveDecimalSchema,
  unit_price: nonNegDecimalSchema,
  discount_mode: z.enum(['PCT', 'AMT']),
  discount_value: nonNegDecimalSchema,
  tax_slab_id: z.string(),
  batch_ref: z.string().trim().max(64),
})

const invoiceBuilderSchema = z.object({
  invoice_type: z.enum(['SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE']),
  supply_type: z.enum(['REGULAR', 'EXPORT_LUT', 'EXPORT_WPAY', 'SEZ_LUT', 'SEZ_WPAY']),
  invoice_date: z.string().min(1, 'Invoice date is required'),
  due_date: z.string(),
  party_ledger_id: z.string().min(1, 'Select a customer or vendor'),
  place_of_supply: z.string().min(2, 'Select Place of Supply'),
  is_rcm: z.boolean(),
  enable_round_off: z.boolean(),
  original_invoice_id: z.string(),
  supplier_invoice_no: z.string().trim().max(64),
  supplier_invoice_date: z.string(),
  narration: z.string().trim().max(500),
  lines: z.array(invoiceLineFormSchema).min(1, 'Add at least one invoice line'),
})

type InvoiceBuilderFormInput = z.input<typeof invoiceBuilderSchema>
type InvoiceBuilderFormOutput = z.output<typeof invoiceBuilderSchema>

const INVOICE_TYPE_TABS: Array<{ id: InvoiceType; label: string; shortcut?: string }> = [
  { id: 'SALES', label: 'Sales Invoice', shortcut: 'F8' },
  { id: 'PURCHASE', label: 'Purchase Bill', shortcut: 'F9' },
  { id: 'CREDIT_NOTE', label: 'Credit Note' },
  { id: 'DEBIT_NOTE', label: 'Debit Note' },
]

const SUPPLY_TYPE_OPTIONS: Array<{ value: GstSupplyType; label: string }> = [
  { value: 'REGULAR', label: 'Regular Domestic (B2B / B2C)' },
  { value: 'EXPORT_LUT', label: 'Export under LUT (Zero-Rated)' },
  { value: 'EXPORT_WPAY', label: 'Export with Payment of IGST' },
  { value: 'SEZ_LUT', label: 'SEZ Supply without Payment (LUT)' },
  { value: 'SEZ_WPAY', label: 'SEZ Supply with Payment of IGST' },
]

function addDaysIso(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return isoDate
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export interface InvoiceBuilderPageProps {
  initialType: InvoiceType
  initialOriginalId?: number | null
  onBack: () => void
  onSaved: (invoice: InvoiceDetailDTO, openPrint: boolean) => void
}

export function InvoiceBuilderPage({
  initialType,
  initialOriginalId = null,
  onBack,
  onSaved,
}: InvoiceBuilderPageProps) {
  const companyQuery = useCompanyContext()
  const ledgersQuery = useLedgers()
  const itemsQuery = useInventoryItems()
  const godownsQuery = useGodowns()
  const slabsQuery = useTaxSlabs()
  const postedInvoicesQuery = useInvoices({ status: 'POSTED' })
  const origDetailQuery = useInvoiceDetail(initialOriginalId)
  const createInvoice = useCreateInvoice()

  const prefilledOrigRef = useRef<number | null>(null)
  const [activeSubmitIntent, setActiveSubmitIntent] = useState<'DRAFT' | 'POSTED' | 'POST_PRINT'>(
    'POSTED',
  )
  const [serverErrorState, setServerErrorState] = useState<{
    forType: InvoiceType
    message: string
    details?: Record<string, unknown>
  } | null>(null)
  const serverError =
    serverErrorState && serverErrorState.forType === initialType ? serverErrorState : null

  const company = companyQuery.data
  const originState = company?.state_code ?? '09'
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const godowns = useMemo(() => godownsQuery.data ?? [], [godownsQuery.data])
  const slabs = useMemo(() => slabsQuery.data ?? [], [slabsQuery.data])
  const defaultGodown = useMemo(
    () => godowns.find((g) => g.is_default) ?? godowns[0],
    [godowns],
  )

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<InvoiceBuilderFormInput, unknown, InvoiceBuilderFormOutput>({
    resolver: zodResolver(invoiceBuilderSchema),
    mode: 'onChange',
    defaultValues: {
      invoice_type: initialType,
      supply_type: 'REGULAR',
      invoice_date: '2026-11-27',
      due_date: '',
      party_ledger_id: '',
      place_of_supply: originState,
      is_rcm: false,
      enable_round_off: true,
      original_invoice_id: initialOriginalId ? String(initialOriginalId) : '',
      supplier_invoice_no: '',
      supplier_invoice_date: '',
      narration: '',
      lines: [
        {
          item_id: '',
          godown_id: defaultGodown ? String(defaultGodown.id) : '',
          description: '',
          hsn_sac_code: '',
          uqc_code: 'NOS',
          quantity: '1.00',
          unit_price: '0.00',
          discount_mode: 'PCT',
          discount_value: '0.00',
          tax_slab_id: '',
          batch_ref: '',
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const watchedType = useWatch({ control, name: 'invoice_type' })
  const watchedSupply = useWatch({ control, name: 'supply_type' })
  const watchedPos = useWatch({ control, name: 'place_of_supply' })
  const watchedRcm = useWatch({ control, name: 'is_rcm' })
  const watchedRoundOff = useWatch({ control, name: 'enable_round_off' })
  const watchedPartyId = useWatch({ control, name: 'party_ledger_id' })
  const watchedDate = useWatch({ control, name: 'invoice_date' })
  const rawWatchedLines = useWatch({ control, name: 'lines' })
  const watchedLines = useMemo(() => rawWatchedLines ?? [], [rawWatchedLines])

  // Sync URL prop transitions (F8 <-> F9)
  useEffect(() => {
    setValue('invoice_type', initialType)
    if (initialType === 'SALES' || initialType === 'CREDIT_NOTE') {
      setValue('is_rcm', false)
    }
  }, [initialType, setValue])

  // Default godown once loaded
  useEffect(() => {
    if (!defaultGodown) return
    watchedLines.forEach((ln, idx) => {
      const selectedItem = items.find((i) => String(i.id) === ln?.item_id)
      if ((!selectedItem || selectedItem.item_type === 'GOODS') && !ln?.godown_id) {
        setValue(`lines.${idx}.godown_id`, String(defaultGodown.id))
      }
    })
  }, [defaultGodown, items, watchedLines, setValue])

  // Auto-populate when ?originalId=... is opened for Credit/Debit Note
  useEffect(() => {
    const orig = origDetailQuery.data
    if (!orig || prefilledOrigRef.current === orig.id) return
    prefilledOrigRef.current = orig.id

    const targetType: InvoiceType =
      orig.invoice_type === 'PURCHASE' ? 'DEBIT_NOTE' : 'CREDIT_NOTE'
    reset({
      invoice_type: targetType,
      supply_type: orig.supply_type,
      invoice_date: '2026-11-27',
      due_date: '',
      party_ledger_id: String(orig.party_ledger_id),
      place_of_supply: orig.place_of_supply,
      is_rcm: orig.is_rcm,
      enable_round_off: true,
      original_invoice_id: String(orig.id),
      supplier_invoice_no: orig.supplier_invoice_no ?? '',
      supplier_invoice_date: orig.supplier_invoice_date ?? '',
      narration: `Against ${orig.invoice_number}`,
      lines: orig.lines.map((ln) => ({
        item_id: ln.item_id ? String(ln.item_id) : '',
        godown_id: ln.godown_id ? String(ln.godown_id) : '',
        description: ln.description,
        hsn_sac_code: ln.hsn_sac_code ?? '',
        uqc_code: ln.uqc_code,
        quantity: ln.quantity,
        unit_price: ln.unit_price,
        discount_mode: 'PCT' as const,
        discount_value: ln.discount_pct,
        tax_slab_id: ln.tax_slab_id ? String(ln.tax_slab_id) : '',
        batch_ref: ln.batch_ref ?? '',
      })),
    })
  }, [origDetailQuery.data, reset])

  const selectedParty = useMemo(
    () => ledgers.find((l) => String(l.id) === watchedPartyId) ?? null,
    [ledgers, watchedPartyId],
  )

  const handlePartyChange = useCallback(
    (ledgerIdStr: string) => {
      setValue('party_ledger_id', ledgerIdStr, { shouldValidate: true })
      const party = ledgers.find((l) => String(l.id) === ledgerIdStr)
      if (!party) return
      if (watchedSupply === 'EXPORT_LUT' || watchedSupply === 'EXPORT_WPAY') {
        setValue('place_of_supply', '96', { shouldValidate: true })
      } else if (party.party_state_code) {
        setValue('place_of_supply', party.party_state_code, { shouldValidate: true })
      }
      if (party.credit_days > 0 && watchedDate) {
        setValue('due_date', addDaysIso(watchedDate, party.credit_days))
      }
    },
    [ledgers, setValue, watchedDate, watchedSupply],
  )

  const handleSupplyChange = useCallback(
    (newSupply: GstSupplyType) => {
      setValue('supply_type', newSupply, { shouldValidate: true })
      if (newSupply === 'EXPORT_LUT' || newSupply === 'EXPORT_WPAY') {
        setValue('place_of_supply', '96', { shouldValidate: true })
      } else if (selectedParty?.party_state_code) {
        setValue('place_of_supply', selectedParty.party_state_code, {
          shouldValidate: true,
        })
      } else {
        setValue('place_of_supply', originState, { shouldValidate: true })
      }
    },
    [originState, selectedParty, setValue],
  )

  const handleItemSelect = useCallback(
    (index: number, itemIdStr: string) => {
      setValue(`lines.${index}.item_id`, itemIdStr)
      const item = items.find((i) => String(i.id) === itemIdStr)
      if (!item) return

      setValue(`lines.${index}.description`, item.name, { shouldValidate: true })
      setValue(`lines.${index}.hsn_sac_code`, item.hsn_sac_code ?? '')
      setValue(`lines.${index}.uqc_code`, item.unit_uqc)
      if (item.default_tax_slab_id) {
        setValue(`lines.${index}.tax_slab_id`, String(item.default_tax_slab_id))
      }
      const isBuySide = watchedType === 'PURCHASE' || watchedType === 'DEBIT_NOTE'
      setValue(
        `lines.${index}.unit_price`,
        isBuySide ? item.standard_purchase_cost : item.standard_selling_price,
        { shouldValidate: true },
      )
      if (item.item_type === 'SERVICE') {
        setValue(`lines.${index}.godown_id`, '')
      } else if (defaultGodown) {
        setValue(`lines.${index}.godown_id`, String(defaultGodown.id))
      }
    },
    [defaultGodown, items, setValue, watchedType],
  )

  const eligibleOriginalInvoices = useMemo(() => {
    const all = postedInvoicesQuery.data ?? []
    if (watchedType === 'CREDIT_NOTE') {
      return all.filter((i) => i.invoice_type === 'SALES')
    }
    if (watchedType === 'DEBIT_NOTE') {
      return all.filter((i) => i.invoice_type === 'PURCHASE')
    }
    return []
  }, [postedInvoicesQuery.data, watchedType])

  const { recommendedParties, otherParties } = useMemo(() => {
    const targetGroup =
      watchedType === 'PURCHASE' || watchedType === 'DEBIT_NOTE'
        ? 'Sundry Creditors'
        : 'Sundry Debtors'
    const rec = ledgers.filter((l) => l.group_name === targetGroup)
    const rest = ledgers.filter((l) => l.group_name !== targetGroup)
    return { recommendedParties: rec, otherParties: rest }
  }, [ledgers, watchedType])

  // Real-time BigInt preview math matching backend gst_calculator.py
  const preview = useMemo(() => {
    const slabMap = new Map(slabs.map((s) => [String(s.id), s]))
    return calculateGstInvoiceBigInt(
      watchedLines.map((ln) => {
        const slab = slabMap.get(ln?.tax_slab_id ?? '')
        const isPct = ln?.discount_mode !== 'AMT'
        return {
          hsnSacCode: ln?.hsn_sac_code,
          quantity: ln?.quantity || '0',
          unitPrice: ln?.unit_price || '0',
          discountPct: isPct ? ln?.discount_value || '0' : '0',
          discountAmount: !isPct ? ln?.discount_value || '0' : '0',
          slabCgstRate: slab?.cgst_rate ?? '0',
          slabSgstRate: slab?.sgst_rate ?? '0',
          slabIgstRate: slab?.igst_rate ?? '0',
          slabCessRate: slab?.cess_rate ?? '0',
        }
      }),
      {
        originStateCode: originState,
        placeOfSupply: watchedPos || originState,
        supplyType: (watchedSupply ?? 'REGULAR') as GstSupplyType,
        isRcm: Boolean(watchedRcm),
        enableRoundOff: Boolean(watchedRoundOff),
      },
    )
  }, [slabs, watchedLines, originState, watchedPos, watchedSupply, watchedRcm, watchedRoundOff])

  const submitWithIntent = async (
    data: InvoiceBuilderFormOutput,
    intent: 'DRAFT' | 'POSTED' | 'POST_PRINT',
  ) => {
    setServerErrorState(null)

    // Cross-validate GOODS require godown and discount bounds
    let hasValidationIssue = false
    data.lines.forEach((ln, idx) => {
      const item = items.find((i) => String(i.id) === ln.item_id)
      if (item && item.item_type === 'GOODS' && !ln.godown_id) {
        setError(`lines.${idx}.godown_id`, { message: 'Select godown for goods' })
        hasValidationIssue = true
      }
      if (ln.discount_mode === 'PCT' && toScaledInt(ln.discount_value) > 1_000_000n) {
        setError(`lines.${idx}.discount_value`, { message: 'Max 100%' })
        hasValidationIssue = true
      }
      const previewLine = preview.lines[idx]
      if (
        ln.discount_mode === 'AMT' &&
        previewLine &&
        toScaledInt(ln.discount_value) > previewLine.grossScaled
      ) {
        setError(`lines.${idx}.discount_value`, { message: 'Exceeds gross' })
        hasValidationIssue = true
      }
    })
    if (hasValidationIssue) return

    setActiveSubmitIntent(intent)
    const targetStatus = intent === 'DRAFT' ? 'DRAFT' : 'POSTED'

    try {
      const created = await createInvoice.mutateAsync({
        status: targetStatus,
        invoice_type: data.invoice_type,
        supply_type: data.supply_type,
        invoice_date: data.invoice_date,
        due_date: data.due_date || null,
        party_ledger_id: Number(data.party_ledger_id),
        place_of_supply: data.place_of_supply,
        is_rcm:
          data.invoice_type === 'PURCHASE' || data.invoice_type === 'DEBIT_NOTE'
            ? data.is_rcm
            : false,
        enable_round_off: data.enable_round_off,
        original_invoice_id: data.original_invoice_id
          ? Number(data.original_invoice_id)
          : null,
        supplier_invoice_no: data.supplier_invoice_no || null,
        supplier_invoice_date: data.supplier_invoice_date || null,
        narration: data.narration,
        lines: data.lines.map((ln) => ({
          item_id: ln.item_id ? Number(ln.item_id) : null,
          godown_id: ln.godown_id ? Number(ln.godown_id) : null,
          description: ln.description,
          hsn_sac_code: ln.hsn_sac_code || null,
          uqc_code: ln.uqc_code || 'NOS',
          quantity: fromScaledInt(toScaledInt(ln.quantity), 4),
          unit_price: fromScaledInt(toScaledInt(ln.unit_price), 4),
          discount_pct:
            ln.discount_mode === 'PCT'
              ? fromScaledInt(toScaledInt(ln.discount_value), 4)
              : '0.0000',
          discount_amount:
            ln.discount_mode === 'AMT'
              ? fromScaledInt(toScaledInt(ln.discount_value), 4)
              : '0.0000',
          tax_slab_id: ln.tax_slab_id ? Number(ln.tax_slab_id) : null,
          batch_ref: ln.batch_ref || null,
        })),
      })
      onSaved(created, intent === 'POST_PRINT')
    } catch (err) {
      if (err instanceof ApiError) {
        setServerErrorState({
          forType: initialType,
          message: err.message,
          details: err.details,
        })
      } else {
        setServerErrorState({
          forType: initialType,
          message: err instanceof Error ? err.message : 'Failed to save invoice.',
        })
      }
    }
  }

  const showSupplierFields = watchedType === 'PURCHASE'
  const showOriginalInvoice =
    watchedType === 'CREDIT_NOTE' || watchedType === 'DEBIT_NOTE'
  const showRcmToggle =
    watchedType === 'PURCHASE' || watchedType === 'DEBIT_NOTE'

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-text hover:text-primary-text cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Back to Invoice Register</span>
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="type-h1">GST Tax Invoice &amp; Inventory Billing</h1>
            <Badge variant={preview.isInterState ? 'accent' : 'neutral'} icon={false}>
              {watchedSupply === 'EXPORT_LUT' || watchedSupply === 'SEZ_LUT'
                ? 'Zero-Rated LUT'
                : preview.isInterState
                  ? 'Inter-State · IGST'
                  : 'Intra-State · CGST + SGST'}
            </Badge>
          </div>
        </div>

        {/* Segmented Invoice Type Switcher */}
        <div
          role="tablist"
          aria-label="Invoice Document Type"
          className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border-input bg-muted p-[3px]"
        >
          {INVOICE_TYPE_TABS.map((tab) => {
            const active = watchedType === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setValue('invoice_type', tab.id)
                  if (tab.id === 'SALES' || tab.id === 'CREDIT_NOTE') {
                    setValue('is_rcm', false)
                  }
                }}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[12.5px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                  active
                    ? 'bg-surface font-semibold text-primary-text shadow-sm'
                    : 'font-medium text-muted-text hover:text-primary-text',
                )}
              >
                <span>{tab.label}</span>
                {tab.shortcut ? <Kbd>{tab.shortcut}</Kbd> : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* Inline Backend Error Banner (e.g. HTTP 422 INSUFFICIENT_STOCK) */}
      {serverError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">{serverError.message}</p>
            {serverError.details &&
            'available_qty' in serverError.details &&
            'requested_qty' in serverError.details ? (
              <p className="code-mono text-[12px]">
                Requested: {String(serverError.details.requested_qty)} · Available in Godown:{' '}
                {String(serverError.details.available_qty)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <form
        id={INVOICE_BUILDER_FORM_ID}
        onSubmit={handleSubmit((data) => submitWithIntent(data, 'POSTED'))}
        className="space-y-4"
        noValidate
      >
        {/* Header Metadata Card */}
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5 flex flex-col gap-1.5">
              <label
                htmlFor="inv-party-select"
                className="text-[13px] font-medium text-primary-text"
              >
                {watchedType === 'PURCHASE' || watchedType === 'DEBIT_NOTE'
                  ? 'Supplier / Vendor Ledger'
                  : 'Customer / Buyer Ledger'}
              </label>
              <select
                id="inv-party-select"
                aria-invalid={errors.party_ledger_id ? true : undefined}
                value={watchedPartyId}
                onChange={(e) => handlePartyChange(e.target.value)}
                className={cn(
                  'h-[var(--control-h)] w-full rounded-sm border bg-surface px-3 text-[14px] text-primary-text',
                  errors.party_ledger_id ? 'border-danger' : 'border-border-input',
                )}
              >
                <option value="">Select Party Ledger...</option>
                {recommendedParties.length > 0 ? (
                  <optgroup label="Recommended Parties">
                    {recommendedParties.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} · {l.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {otherParties.length > 0 ? (
                  <optgroup label="All Other Ledgers">
                    {otherParties.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} · {l.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              {errors.party_ledger_id ? (
                <p className="text-[12px] font-medium text-danger">
                  {errors.party_ledger_id.message}
                </p>
              ) : selectedParty ? (
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-text">
                  <span className="code-mono">
                    GSTIN: {selectedParty.party_gstin ?? 'Unregistered'}
                  </span>
                  <span>·</span>
                  <span>State: {getGstStateName(selectedParty.party_state_code)}</span>
                </div>
              ) : null}
            </div>

            <div className="md:col-span-3 flex flex-col gap-1.5">
              <label
                htmlFor="inv-supply-type"
                className="text-[13px] font-medium text-primary-text"
              >
                GST Supply Type
              </label>
              <select
                id="inv-supply-type"
                value={watchedSupply}
                onChange={(e) => handleSupplyChange(e.target.value as GstSupplyType)}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[13.5px] text-primary-text"
              >
                {SUPPLY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <Input
                label="Invoice Date"
                type="date"
                error={errors.invoice_date?.message}
                {...register('invoice_date')}
              />
            </div>

            <div className="md:col-span-2">
              <Input label="Due Date" type="date" {...register('due_date')} />
            </div>

            <div className="md:col-span-4 flex flex-col gap-1.5">
              <label
                htmlFor="inv-pos-select"
                className="text-[13px] font-medium text-primary-text"
              >
                Place of Supply (Origin: {getGstStateName(originState)})
              </label>
              <select
                id="inv-pos-select"
                {...register('place_of_supply')}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[13.5px] text-primary-text"
              >
                {INDIAN_GST_STATES.map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.code} · {st.name}
                  </option>
                ))}
              </select>
            </div>

            {showSupplierFields ? (
              <>
                <div className="md:col-span-3">
                  <Input
                    label="Supplier Invoice No."
                    placeholder="e.g. SMC/26-27/204"
                    className="tabular-mono"
                    {...register('supplier_invoice_no')}
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Supplier Inv. Date"
                    type="date"
                    {...register('supplier_invoice_date')}
                  />
                </div>
              </>
            ) : null}

            {showOriginalInvoice ? (
              <div className="md:col-span-5 flex flex-col gap-1.5">
                <label
                  htmlFor="inv-original-select"
                  className="text-[13px] font-medium text-primary-text"
                >
                  Original Posted Invoice (Optional · Preserves Exact Cost)
                </label>
                <select
                  id="inv-original-select"
                  {...register('original_invoice_id')}
                  className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[13.5px] text-primary-text"
                >
                  <option value="">Standalone (No linked invoice)</option>
                  {eligibleOriginalInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} · {inv.party_name_snapshot} (
                      {formatCurrency(inv.grand_total)})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="md:col-span-3 flex flex-wrap items-end gap-4 pb-2">
              <label className="inline-flex items-center gap-2 text-[13px] font-medium text-primary-text cursor-pointer">
                <input
                  type="checkbox"
                  {...register('enable_round_off')}
                  className="h-4 w-4 rounded-sm border border-border-input accent-[var(--accent-primary)]"
                />
                <span>Nearest-Rupee Round Off</span>
              </label>

              {showRcmToggle ? (
                <label className="inline-flex items-center gap-2 text-[13px] font-medium text-primary-text cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('is_rcm')}
                    className="h-4 w-4 rounded-sm border border-border-input accent-[var(--accent-primary)]"
                  />
                  <span>Reverse Charge (RCM)</span>
                </label>
              ) : null}
            </div>
          </div>

          {showRcmToggle && watchedRcm ? (
            <div
              role="status"
              className="mt-4 flex items-center gap-2.5 rounded-md border border-[var(--status-warning-border)] bg-warning-bg px-3.5 py-2.5 text-[13px] font-medium text-warning"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>
                Reverse Charge Mechanism (RCM) active: Vendor payable excludes self-assessed GST.
                Ledger posts Input GST (Dr) and RCM Output Tax Payable (Cr) separately.
              </span>
            </div>
          ) : null}
        </Card>

        {/* Line Items Grid */}
        <Card padding="none">
          <CardHeader>
            <div>
              <CardTitle>Invoice Line Items</CardTitle>
              <p className="mt-0.5 text-[12.5px] text-muted-text">
                Select inventory item to auto-fill HSN/SAC, UQC, GST slab, and godown.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
              onClick={() =>
                append({
                  item_id: '',
                  godown_id: defaultGodown ? String(defaultGodown.id) : '',
                  description: '',
                  hsn_sac_code: '',
                  uqc_code: 'NOS',
                  quantity: '1.00',
                  unit_price: '0.00',
                  discount_mode: 'PCT',
                  discount_value: '0.00',
                  tax_slab_id: slabs[3]?.id ? String(slabs[3].id) : '',
                  batch_ref: '',
                })
              }
            >
              Add Line
            </Button>
          </CardHeader>

          <div className="table-scroll">
            <table className="w-full min-w-[1080px] border-collapse text-left text-[13px]">
              <thead className="bg-table-header">
                <tr className="h-9 border-b border-border-row text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                  <th className="w-[220px] px-3 py-2">Item / Description</th>
                  <th className="w-[150px] px-2.5 py-2">Godown</th>
                  <th className="w-[90px] px-2.5 py-2">HSN/SAC</th>
                  <th className="w-[96px] px-2.5 py-2 text-right">Qty</th>
                  <th className="w-[116px] px-2.5 py-2 text-right">Rate (₹)</th>
                  <th className="w-[138px] px-2.5 py-2 text-right">Discount</th>
                  <th className="w-[116px] px-2.5 py-2">GST Slab</th>
                  <th className="w-[110px] px-2.5 py-2 text-right">Taxable</th>
                  {preview.isInterState ? (
                    <th className="w-[104px] px-2.5 py-2 text-right">IGST</th>
                  ) : (
                    <>
                      <th className="w-[94px] px-2.5 py-2 text-right">CGST</th>
                      <th className="w-[94px] px-2.5 py-2 text-right">SGST</th>
                    </>
                  )}
                  <th className="w-[116px] px-3 py-2 text-right">Line Total</th>
                  <th className="w-[46px] px-2 py-2 text-center">Del</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => {
                  const rowVals = watchedLines[idx]
                  const selectedItem = items.find((i) => String(i.id) === rowVals?.item_id)
                  const isService = selectedItem?.item_type === 'SERVICE'
                  const lineErr = errors.lines?.[idx]
                  const calc = preview.lines[idx]

                  return (
                    <tr key={field.id} className="border-b border-border-row align-top">
                      <td className="px-3 py-2.5 space-y-1.5">
                        <select
                          aria-label={`Line ${idx + 1} Item`}
                          value={rowVals?.item_id ?? ''}
                          onChange={(e) => handleItemSelect(idx, e.target.value)}
                          className="h-9 w-full rounded-sm border border-border-input bg-surface px-2 text-[13px] text-primary-text"
                        >
                          <option value="">Custom / Non-Item Line</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.sku} · {it.name} ({it.item_type === 'SERVICE' ? 'Svc' : it.valuation_method})
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          aria-label={`Line ${idx + 1} Description`}
                          placeholder="Item or service description..."
                          {...register(`lines.${idx}.description`)}
                          className={cn(
                            'h-8 w-full rounded-sm border bg-surface px-2 text-[12.5px] text-primary-text',
                            lineErr?.description ? 'border-danger' : 'border-border-input',
                          )}
                        />
                        {lineErr?.description ? (
                          <p className="text-[11px] text-danger">{lineErr.description.message}</p>
                        ) : null}
                      </td>

                      <td className="px-2.5 py-2.5">
                        {isService ? (
                          <div className="flex h-9 items-center justify-center rounded-sm border border-border-subtle bg-muted text-[12px] text-disabled-text">
                            N/A (Service)
                          </div>
                        ) : (
                          <>
                            <select
                              aria-label={`Line ${idx + 1} Godown`}
                              {...register(`lines.${idx}.godown_id`)}
                              className={cn(
                                'h-9 w-full rounded-sm border bg-surface px-2 text-[12.5px] text-primary-text',
                                lineErr?.godown_id ? 'border-danger' : 'border-border-input',
                              )}
                            >
                              <option value="">Select...</option>
                              {godowns.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.code}
                                </option>
                              ))}
                            </select>
                            {watchedType === 'PURCHASE' ? (
                              <input
                                type="text"
                                placeholder="Batch (auto)"
                                aria-label={`Line ${idx + 1} Batch`}
                                {...register(`lines.${idx}.batch_ref`)}
                                className="mt-1.5 h-8 w-full rounded-sm border border-border-input bg-surface px-2 code-mono text-[11.5px] text-primary-text"
                              />
                            ) : null}
                          </>
                        )}
                      </td>

                      <td className="px-2.5 py-2.5">
                        <input
                          type="text"
                          aria-label={`Line ${idx + 1} HSN/SAC`}
                          placeholder="8544"
                          {...register(`lines.${idx}.hsn_sac_code`)}
                          className="h-9 w-full rounded-sm border border-border-input bg-surface px-2 code-mono text-[12.5px] text-primary-text"
                        />
                        <p className="mt-1 code-mono text-[11px] text-muted-text">
                          UQC: {rowVals?.uqc_code || 'NOS'}
                        </p>
                      </td>

                      <td className="px-2.5 py-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Line ${idx + 1} Quantity`}
                          {...register(`lines.${idx}.quantity`)}
                          className={cn(
                            'h-9 w-full rounded-sm border bg-surface px-2 text-right code-mono text-[13px] text-primary-text',
                            lineErr?.quantity ? 'border-danger' : 'border-border-input',
                          )}
                        />
                        {lineErr?.quantity ? (
                          <p className="mt-1 text-[11px] text-danger">{lineErr.quantity.message}</p>
                        ) : null}
                      </td>

                      <td className="px-2.5 py-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Line ${idx + 1} Unit Price`}
                          {...register(`lines.${idx}.unit_price`)}
                          className={cn(
                            'h-9 w-full rounded-sm border bg-surface px-2 text-right code-mono text-[13px] text-primary-text',
                            lineErr?.unit_price ? 'border-danger' : 'border-border-input',
                          )}
                        />
                      </td>

                      <td className="px-2.5 py-2.5">
                        <div className="flex items-center gap-1">
                          <select
                            aria-label={`Line ${idx + 1} Discount Mode`}
                            {...register(`lines.${idx}.discount_mode`)}
                            className="h-9 w-12 shrink-0 rounded-sm border border-border-input bg-muted px-1 text-[12px] font-semibold text-primary-text"
                          >
                            <option value="PCT">%</option>
                            <option value="AMT">₹</option>
                          </select>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Line ${idx + 1} Discount`}
                            {...register(`lines.${idx}.discount_value`)}
                            className={cn(
                              'h-9 w-full rounded-sm border bg-surface px-2 text-right code-mono text-[12.5px] text-primary-text',
                              lineErr?.discount_value ? 'border-danger' : 'border-border-input',
                            )}
                          />
                        </div>
                        {lineErr?.discount_value ? (
                          <p className="mt-1 text-[11px] text-danger">
                            {lineErr.discount_value.message}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-2.5 py-2.5">
                        <select
                          aria-label={`Line ${idx + 1} Tax Slab`}
                          {...register(`lines.${idx}.tax_slab_id`)}
                          className="h-9 w-full rounded-sm border border-border-input bg-surface px-2 text-[12.5px] text-primary-text"
                        >
                          <option value="">0% Nil</option>
                          {slabs.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.code}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-2.5 py-2.5 pt-4 text-right code-mono text-[13px] text-primary-text">
                        {formatCurrency(calc?.taxableScaled ?? 0n, { showSymbol: false })}
                      </td>

                      {preview.isInterState ? (
                        <td className="px-2.5 py-2.5 pt-3 text-right code-mono text-[12.5px] text-primary-text">
                          <div>{formatCurrency(calc?.igstAmountScaled ?? 0n, { showSymbol: false })}</div>
                          <div className="text-[11px] text-muted-text">
                            {formatTaxRateLabel(calc?.igstRateScaled ?? 0n)}
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-2.5 py-2.5 pt-3 text-right code-mono text-[12.5px] text-primary-text">
                            <div>
                              {formatCurrency(calc?.cgstAmountScaled ?? 0n, { showSymbol: false })}
                            </div>
                            <div className="text-[11px] text-muted-text">
                              {formatTaxRateLabel(calc?.cgstRateScaled ?? 0n)}
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5 pt-3 text-right code-mono text-[12.5px] text-primary-text">
                            <div>
                              {formatCurrency(calc?.sgstAmountScaled ?? 0n, { showSymbol: false })}
                            </div>
                            <div className="text-[11px] text-muted-text">
                              {formatTaxRateLabel(calc?.sgstRateScaled ?? 0n)}
                            </div>
                          </td>
                        </>
                      )}

                      <td className="px-3 py-2.5 pt-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
                        {formatCurrency(calc?.lineTotalScaled ?? 0n, { showSymbol: false })}
                      </td>

                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          disabled={fields.length <= 1}
                          onClick={() => remove(idx)}
                          aria-label={`Remove line ${idx + 1}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-text hover:bg-danger-bg hover:text-danger disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Narration + Sticky Summary Footer */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
          <Card className="lg:col-span-6">
            <Input
              label="Narration / Delivery Note"
              placeholder="e.g. Being goods supplied against PO #... via Noida Warehouse"
              error={errors.narration?.message}
              {...register('narration')}
            />
          </Card>

          <Card className="lg:col-span-6 space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-text">Subtotal (Gross)</span>
                <span className="code-mono font-medium text-primary-text">
                  {formatCurrency(preview.subtotalScaled)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-text">Total Discount</span>
                <span className="code-mono font-medium text-primary-text">
                  {formatCurrency(preview.totalDiscountScaled)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-text">Taxable Value</span>
                <span className="code-mono font-semibold text-primary-text">
                  {formatCurrency(preview.taxableTotalScaled)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-text">
                  {preview.isInterState ? 'IGST Total' : 'CGST + SGST'}
                </span>
                <span className="code-mono font-medium text-primary-text">
                  {preview.isInterState
                    ? formatCurrency(preview.igstTotalScaled)
                    : `${formatCurrency(preview.cgstTotalScaled)} + ${formatCurrency(preview.sgstTotalScaled)}`}
                </span>
              </div>
              {preview.cessTotalScaled > 0n ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-text">Cess Total</span>
                  <span className="code-mono font-medium text-primary-text">
                    {formatCurrency(preview.cessTotalScaled)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-muted-text">Round Off</span>
                <span className="code-mono font-medium text-primary-text">
                  {formatCurrency(preview.roundOffScaled, { negativeStyle: 'minus' })}
                </span>
              </div>
              <div className="col-span-2 mt-2 flex items-center justify-between border-t-2 border-border-strong pt-2.5">
                <div className="flex items-center gap-2">
                  <span className="type-h3">
                    {watchedRcm && showRcmToggle ? 'Vendor Payable (Excl. RCM Tax)' : 'Grand Total'}
                  </span>
                  <Badge
                    variant="success"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />}
                  >
                    Auto-Balanced
                  </Badge>
                </div>
                <span className="type-h2 num-tabular font-bold text-primary-text">
                  {formatCurrency(preview.grandTotalScaled)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border-subtle pt-3">
              <Button
                type="button"
                variant="secondary"
                loading={createInvoice.isPending && activeSubmitIntent === 'DRAFT'}
                leftIcon={<Save className="h-4 w-4" strokeWidth={1.75} />}
                onClick={() => {
                  void handleSubmit((data) => submitWithIntent(data, 'DRAFT'))()
                }}
              >
                Save as Draft
              </Button>
              <Button
                type="button"
                variant="secondary"
                loading={createInvoice.isPending && activeSubmitIntent === 'POST_PRINT'}
                leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
                onClick={() => {
                  void handleSubmit((data) => submitWithIntent(data, 'POST_PRINT'))()
                }}
              >
                Post &amp; Print A4
              </Button>
              <Button
                type="submit"
                variant="primary"
                shortcut="Ctrl+Enter"
                loading={createInvoice.isPending && activeSubmitIntent === 'POSTED'}
                leftIcon={<Send className="h-4 w-4" strokeWidth={1.75} />}
              >
                Post Invoice
              </Button>
            </div>
          </Card>
        </div>
      </form>
    </div>
  )
}
