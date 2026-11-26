import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  absBigInt,
  DECIMAL_INPUT_REGEX,
  fromScaledInt,
  toScaledInt,
} from '../../lib/decimal'
import { formatCurrency } from '../../lib/format'
import type { VoucherDTO } from '../../lib/api'
import {
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type VoucherType,
} from '../../lib/dummyData'
import { useCreateVoucher, useLedgers } from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { Input } from '../../components/ui/Input'
import { Kbd } from '../../components/ui/Kbd'

export const QUICK_VOUCHER_FORM_ID = 'ledgerprime-quick-voucher-form'

const decimalAmountSchema = z
  .string()
  .trim()
  .refine(
    (val) => val === '' || DECIMAL_INPUT_REGEX.test(val),
    'Enter valid amount (max 4 decimals)',
  )

const voucherLineSchema = z
  .object({
    accountCode: z.string().min(1, 'Select a ledger'),
    debit: decimalAmountSchema,
    credit: decimalAmountSchema,
  })
  .refine(
    (line) => {
      const dr = toScaledInt(line.debit)
      const cr = toScaledInt(line.credit)
      return (dr > 0n && cr === 0n) || (cr > 0n && dr === 0n)
    },
    {
      message: 'Each line must have either Debit or Credit (> 0.00), not both.',
      path: ['debit'],
    },
  )

const quickVoucherSchema = z
  .object({
    voucherDate: z.string().min(1, 'Date is required'),
    voucherNo: z.string().trim().max(40).optional(),
    referenceNo: z.string().trim().max(64).optional(),
    narration: z.string().trim().min(1, 'Narration is required').max(500),
    lines: z.array(voucherLineSchema).min(2, 'At least 2 ledger lines are required'),
  })
  .refine(
    (form) => {
      const totalDr = form.lines.reduce((acc, ln) => acc + toScaledInt(ln.debit), 0n)
      const totalCr = form.lines.reduce((acc, ln) => acc + toScaledInt(ln.credit), 0n)
      return totalDr > 0n && totalDr === totalCr
    },
    {
      message: 'Total Debit must equal Total Credit and exceed ₹0.00',
      path: ['lines'],
    },
  )

type QuickVoucherInput = z.input<typeof quickVoucherSchema>
type QuickVoucherOutput = z.output<typeof quickVoucherSchema>

export interface QuickVoucherDrawerProps {
  open: boolean
  voucherType: VoucherType
  onChangeVoucherType: (type: VoucherType) => void
  onClose: () => void
  onVoucherPosted: (voucher: VoucherDTO) => void
}

export function QuickVoucherDrawer({
  open,
  voucherType,
  onChangeVoucherType,
  onClose,
  onVoucherPosted,
}: QuickVoucherDrawerProps) {
  const meta = VOUCHER_TYPE_META[voucherType]
  const ledgersQuery = useLedgers()
  const createVoucher = useCreateVoucher()
  const [serverError, setServerError] = useState<string | null>(null)

  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])

  const handleClose = useCallback(() => {
    setServerError(null)
    onClose()
  }, [onClose])

  const handleChangeVoucherType = useCallback(
    (type: VoucherType) => {
      setServerError(null)
      onChangeVoucherType(type)
    },
    [onChangeVoucherType],
  )

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<QuickVoucherInput, unknown, QuickVoucherOutput>({
    resolver: zodResolver(quickVoucherSchema),
    mode: 'onChange',
    defaultValues: {
      voucherDate: '2026-11-27',
      voucherNo: '',
      referenceNo: '',
      narration: '',
      lines: [
        { accountCode: meta.defaultDebitCode, debit: '', credit: '' },
        { accountCode: meta.defaultCreditCode, debit: '', credit: '' },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const rawWatchedLines = useWatch({ control, name: 'lines' })
  const watchedLines = useMemo(() => rawWatchedLines ?? [], [rawWatchedLines])

  useEffect(() => {
    if (!open) return
    const typeMeta = VOUCHER_TYPE_META[voucherType]
    const hasCode = (code: string) => ledgers.some((l) => l.code === code)
    const drCode = hasCode(typeMeta.defaultDebitCode)
      ? typeMeta.defaultDebitCode
      : ledgers[0]?.code ?? ''
    const crCode = hasCode(typeMeta.defaultCreditCode)
      ? typeMeta.defaultCreditCode
      : ledgers[1]?.code ?? ''

    const hasAnyAmounts = watchedLines.some(
      (l) => toScaledInt(l?.debit) > 0n || toScaledInt(l?.credit) > 0n,
    )
    if (!hasAnyAmounts) {
      reset({
        voucherDate: '2026-11-27',
        voucherNo: '',
        referenceNo: '',
        narration: '',
        lines: [
          { accountCode: drCode, debit: '', credit: '' },
          { accountCode: crCode, debit: '', credit: '' },
        ],
      })
    }
    // Intentionally triggers on drawer open, voucherType switch, or initial ledgers load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voucherType, ledgers.length])

  const { totalDebit, totalCredit, difference, isBalanced } = useMemo(() => {
    const dr = watchedLines.reduce((sum, ln) => sum + toScaledInt(ln?.debit), 0n)
    const cr = watchedLines.reduce((sum, ln) => sum + toScaledInt(ln?.credit), 0n)
    const diff = absBigInt(dr - cr)
    return {
      totalDebit: dr,
      totalCredit: cr,
      difference: diff,
      isBalanced: dr > 0n && dr === cr,
    }
  }, [watchedLines])

  const onSubmit = async (data: QuickVoucherOutput) => {
    setServerError(null)
    try {
      const created = await createVoucher.mutateAsync({
        voucher_type: voucherType,
        voucher_date: data.voucherDate,
        voucher_number: data.voucherNo?.trim() || null,
        reference_no: data.referenceNo?.trim() || null,
        narration: data.narration,
        status: 'POSTED',
        lines: data.lines.map((ln) => ({
          account_code: ln.accountCode,
          debit_amount: fromScaledInt(toScaledInt(ln.debit), 4),
          credit_amount: fromScaledInt(toScaledInt(ln.credit), 4),
        })),
      })
      reset({
        voucherDate: '2026-11-27',
        voucherNo: '',
        referenceNo: '',
        narration: '',
        lines: [
          { accountCode: meta.defaultDebitCode, debit: '', credit: '' },
          { accountCode: meta.defaultCreditCode, debit: '', credit: '' },
        ],
      })
      onVoucherPosted(created)
      handleClose()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to post voucher.')
    }
  }

  const saveDisabledReason =
    totalDebit === 0n && totalCredit === 0n
      ? 'Enter at least one balanced Debit and Credit amount'
      : !isBalanced
        ? `Debit and Credit must balance: difference ${formatCurrency(difference)}`
        : undefined

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={`${meta.label} Voucher Entry`}
      subtitle="Live FastAPI double-entry posting · Switch type with F4–F9 or Alt+4–9"
      headerExtra={
        <div
          role="tablist"
          aria-label="Voucher Type Switcher"
          className="flex flex-wrap gap-1.5"
        >
          {VOUCHER_TYPE_ORDER.map((type) => {
            const item = VOUCHER_TYPE_META[type]
            const active = type === voucherType
            return (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleChangeVoucherType(type)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-[var(--dur-fast)] cursor-pointer',
                  active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border-input bg-surface text-primary-text hover:bg-muted',
                )}
              >
                <span>{item.label}</span>
                <Kbd variant={active ? 'on-accent' : 'default'} revealOnHover>
                  {item.shortKey}
                </Kbd>
              </button>
            )
          })}
        </div>
      }
      footer={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-canvas px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-4 text-[13px]">
              <div>
                <span className="text-muted-text">Total Debit: </span>
                <span className="tabular-mono font-semibold text-primary-text">
                  {formatCurrency(totalDebit)}
                </span>
              </div>
              <div>
                <span className="text-muted-text">Total Credit: </span>
                <span className="tabular-mono font-semibold text-primary-text">
                  {formatCurrency(totalCredit)}
                </span>
              </div>
            </div>

            {isBalanced ? (
              <Badge
                variant="success"
                icon={<CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
              >
                Balanced
              </Badge>
            ) : (
              <Badge
                variant="danger"
                icon={<XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
              >
                {totalDebit === 0n && totalCredit === 0n
                  ? 'Enter Amounts'
                  : `Out of Balance: ${formatCurrency(difference)}`}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={QUICK_VOUCHER_FORM_ID}
              variant="primary"
              loading={createVoucher.isPending}
              disabled={!isBalanced || ledgersQuery.isLoading}
              title={saveDisabledReason}
              shortcut="Ctrl+Enter"
              revealShortcutOnHover
            >
              Post Balanced Voucher
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={QUICK_VOUCHER_FORM_ID}
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3.5 py-2.5 text-[13px] font-medium text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Input
            label="Voucher Date"
            type="date"
            error={errors.voucherDate?.message}
            {...register('voucherDate')}
          />
          <Input
            label="Voucher # (Optional)"
            placeholder="Auto-generated"
            className="tabular-mono"
            error={errors.voucherNo?.message}
            {...register('voucherNo')}
          />
          <Input
            label="Ref / Cheque / UTR"
            placeholder="Optional"
            className="tabular-mono"
            error={errors.referenceNo?.message}
            {...register('referenceNo')}
          />
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="type-h3">Ledger Entries (Dr / Cr)</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => append({ accountCode: '', debit: '', credit: '' })}
              leftIcon={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
            >
              Add Line
            </Button>
          </div>

          <div className="rounded-md border border-border-subtle bg-canvas p-3 space-y-3">
            <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-text">
              <div className="col-span-5">Ledger Account</div>
              <div className="col-span-3 text-right">Debit (₹)</div>
              <div className="col-span-3 text-right">Credit (₹)</div>
              <div className="col-span-1 text-right">Del</div>
            </div>

            {fields.map((field, index) => {
              const lineErr = errors.lines?.[index]
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-1 gap-2.5 rounded-md border border-border-subtle bg-surface p-2.5 sm:grid-cols-12 sm:items-start sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <div className="sm:col-span-5">
                    <label
                      htmlFor={`line-account-${index}`}
                      className="mb-1 block text-[12px] font-medium text-muted-text sm:sr-only"
                    >
                      Ledger Account #{index + 1}
                    </label>
                    <select
                      id={`line-account-${index}`}
                      disabled={ledgersQuery.isLoading}
                      aria-invalid={lineErr?.accountCode ? true : undefined}
                      {...register(`lines.${index}.accountCode`)}
                      className={cn(
                        'h-[var(--control-h)] w-full rounded-sm border bg-surface px-2.5 text-[13px] text-primary-text',
                        lineErr?.accountCode ? 'border-danger' : 'border-border-input',
                      )}
                    >
                      <option value="">
                        {ledgersQuery.isLoading ? 'Loading ledgers...' : 'Select ledger...'}
                      </option>
                      {ledgers.map((ledger) => (
                        <option key={ledger.id} value={ledger.code}>
                          {ledger.code} · {ledger.name}
                        </option>
                      ))}
                    </select>
                    {lineErr?.accountCode ? (
                      <p className="mt-1 text-[11px] text-danger">
                        {lineErr.accountCode.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:col-span-6 sm:grid-cols-6">
                    <div className="sm:col-span-3">
                      <Input
                        aria-label={`Line ${index + 1} Debit`}
                        placeholder="0.00"
                        inputMode="decimal"
                        numeric
                        error={lineErr?.debit?.message}
                        {...register(`lines.${index}.debit`, {
                          onChange: (e) => {
                            if (toScaledInt(e.target.value) > 0n) {
                              setValue(`lines.${index}.credit`, '', { shouldValidate: true })
                            }
                          },
                        })}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Input
                        aria-label={`Line ${index + 1} Credit`}
                        placeholder="0.00"
                        inputMode="decimal"
                        numeric
                        error={lineErr?.credit?.message}
                        {...register(`lines.${index}.credit`, {
                          onChange: (e) => {
                            if (toScaledInt(e.target.value) > 0n) {
                              setValue(`lines.${index}.debit`, '', { shouldValidate: true })
                            }
                          },
                        })}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end sm:col-span-1">
                    <button
                      type="button"
                      disabled={fields.length <= 2}
                      onClick={() => remove(index)}
                      aria-label={`Remove line ${index + 1}`}
                      title={
                        fields.length <= 2
                          ? 'Double-entry requires at least 2 lines'
                          : 'Remove line'
                      }
                      className="flex h-[var(--control-h)] w-10 items-center justify-center rounded-sm border border-transparent text-muted-text hover:bg-danger-bg hover:text-danger disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {errors.lines?.root?.message ? (
            <p
              role="alert"
              className="flex items-center gap-1.5 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3 py-2 text-[12px] font-medium text-danger"
            >
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{errors.lines.root.message}</span>
            </p>
          ) : null}
        </div>

        <Input
          label="Narration"
          placeholder="e.g. Being payment made via NEFT against invoice #..."
          error={errors.narration?.message}
          {...register('narration')}
        />
      </form>
    </Drawer>
  )
}
