import { absBigInt, fromScaledInt, toScaledInt } from './decimal'

export type GstSupplyType =
  | 'REGULAR'
  | 'EXPORT_LUT'
  | 'EXPORT_WPAY'
  | 'SEZ_LUT'
  | 'SEZ_WPAY'

export const INDIAN_GST_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '96', name: 'Foreign Country (Export)' },
  { code: '97', name: 'Other Territory' },
  { code: '99', name: 'Centre Jurisdiction' },
]

export function getGstStateName(code: string | null | undefined): string {
  if (!code) return '—'
  const match = INDIAN_GST_STATES.find((s) => s.code === code.trim())
  return match ? `${match.code} · ${match.name}` : code
}

/**
 * Signed ROUND_HALF_UP integer division for BigInt numerators and positive denominators.
 */
function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) return 0n
  const isNeg = numerator < 0n
  const absNum = isNeg ? -numerator : numerator
  const quotient = absNum / denominator
  const rem = absNum % denominator
  const rounded = rem * 2n >= denominator ? quotient + 1n : quotient
  return isNeg ? -rounded : rounded
}

/**
 * Rounds a 10^8-scaled BigInt (product of two 10^4 values) to paise (0.01)
 * and returns a 10^4-scaled BigInt.
 */
function quantizePaiseFromScaled8(valScaled8: bigint): bigint {
  return roundHalfUpDiv(valScaled8, 1_000_000n) * 100n
}

/**
 * Rounds a 10^4-scaled BigInt to paise (0.01) and returns a 10^4-scaled BigInt.
 */
function quantizePaiseFromScaled4(valScaled4: bigint): bigint {
  return roundHalfUpDiv(valScaled4, 100n) * 100n
}

/**
 * Computes (taxable_10_4 * rate_10_4 / 100) rounded ROUND_HALF_UP to paise (0.01),
 * returned as a 10^4-scaled BigInt.
 */
function computeTaxAmountScaled4(taxableScaled4: bigint, rateScaled4: bigint): bigint {
  if (taxableScaled4 <= 0n || rateScaled4 <= 0n) return 0n
  return roundHalfUpDiv(taxableScaled4 * rateScaled4, 100_000_000n) * 100n
}

export interface GstLineCalcInput {
  hsnSacCode?: string | null
  quantity: string
  unitPrice: string
  discountPct?: string
  discountAmount?: string
  slabCgstRate?: string
  slabSgstRate?: string
  slabIgstRate?: string
  slabCessRate?: string
}

export interface GstLineCalcOutput {
  hsnSacCode: string
  grossScaled: bigint
  discountAmountScaled: bigint
  discountPctScaled: bigint
  taxableScaled: bigint
  isInterState: boolean
  cgstRateScaled: bigint
  sgstRateScaled: bigint
  igstRateScaled: bigint
  cessRateScaled: bigint
  cgstAmountScaled: bigint
  sgstAmountScaled: bigint
  igstAmountScaled: bigint
  cessAmountScaled: bigint
  taxAmountScaled: bigint
  lineTotalScaled: bigint
}

export interface HsnSummaryPreviewRow {
  hsnSacCode: string
  taxableScaled: bigint
  cgstRateScaled: bigint
  cgstAmountScaled: bigint
  sgstRateScaled: bigint
  sgstAmountScaled: bigint
  igstRateScaled: bigint
  igstAmountScaled: bigint
  cessRateScaled: bigint
  cessAmountScaled: bigint
  totalTaxScaled: bigint
}

export interface GstInvoiceCalcOutput {
  isInterState: boolean
  lines: GstLineCalcOutput[]
  subtotalScaled: bigint
  totalDiscountScaled: bigint
  taxableTotalScaled: bigint
  cgstTotalScaled: bigint
  sgstTotalScaled: bigint
  igstTotalScaled: bigint
  cessTotalScaled: bigint
  taxTotalScaled: bigint
  roundOffScaled: bigint
  grandTotalScaled: bigint
  hsnSummary: HsnSummaryPreviewRow[]
}

export function calculateGstLineBigInt(
  input: GstLineCalcInput,
  options: {
    originStateCode: string
    placeOfSupply: string
    supplyType: GstSupplyType
    isRcm: boolean
  },
): GstLineCalcOutput {
  const qty = toScaledInt(input.quantity)
  const price = toScaledInt(input.unitPrice)
  const discPctIn = toScaledInt(input.discountPct)
  const discAmtIn = toScaledInt(input.discountAmount)

  const gross = qty > 0n && price >= 0n ? quantizePaiseFromScaled8(qty * price) : 0n

  let effDiscAmt = 0n
  let effDiscPct = 0n

  if (discAmtIn > 0n) {
    effDiscAmt = quantizePaiseFromScaled4(discAmtIn > gross ? gross : discAmtIn)
    effDiscPct =
      gross > 0n ? roundHalfUpDiv(effDiscAmt * 1_000_000n, gross) : 0n
  } else if (discPctIn > 0n) {
    const clampedPct = discPctIn > 1_000_000n ? 1_000_000n : discPctIn
    effDiscPct = clampedPct
    effDiscAmt = computeTaxAmountScaled4(gross, clampedPct)
  }

  const taxable = gross - effDiscAmt > 0n ? gross - effDiscAmt : 0n

  const slabCgst = toScaledInt(input.slabCgstRate)
  const slabSgst = toScaledInt(input.slabSgstRate)
  const slabIgst = toScaledInt(input.slabIgstRate)
  const slabCess = toScaledInt(input.slabCessRate)

  let isInterState: boolean
  let cgstRate = 0n
  let sgstRate = 0n
  let igstRate = 0n
  let cessRate = 0n

  if (options.supplyType === 'EXPORT_LUT' || options.supplyType === 'SEZ_LUT') {
    isInterState = true
  } else if (options.supplyType === 'EXPORT_WPAY' || options.supplyType === 'SEZ_WPAY') {
    isInterState = true
    igstRate = slabIgst
    cessRate = slabCess
  } else if (options.originStateCode.trim() === options.placeOfSupply.trim()) {
    isInterState = false
    cgstRate = slabCgst
    sgstRate = slabSgst
    cessRate = slabCess
  } else {
    isInterState = true
    igstRate = slabIgst
    cessRate = slabCess
  }

  const cgstAmt = computeTaxAmountScaled4(taxable, cgstRate)
  const sgstAmt = computeTaxAmountScaled4(taxable, sgstRate)
  const igstAmt = computeTaxAmountScaled4(taxable, igstRate)
  const cessAmt = computeTaxAmountScaled4(taxable, cessRate)
  const taxAmt = cgstAmt + sgstAmt + igstAmt + cessAmt
  const lineTotal = options.isRcm ? taxable : taxable + taxAmt

  return {
    hsnSacCode: (input.hsnSacCode ?? '').trim().toUpperCase() || 'N/A',
    grossScaled: gross,
    discountAmountScaled: effDiscAmt,
    discountPctScaled: effDiscPct,
    taxableScaled: taxable,
    isInterState,
    cgstRateScaled: cgstRate,
    sgstRateScaled: sgstRate,
    igstRateScaled: igstRate,
    cessRateScaled: cessRate,
    cgstAmountScaled: cgstAmt,
    sgstAmountScaled: sgstAmt,
    igstAmountScaled: igstAmt,
    cessAmountScaled: cessAmt,
    taxAmountScaled: taxAmt,
    lineTotalScaled: lineTotal,
  }
}

export function calculateGstInvoiceBigInt(
  lineInputs: GstLineCalcInput[],
  options: {
    originStateCode: string
    placeOfSupply: string
    supplyType: GstSupplyType
    isRcm: boolean
    enableRoundOff: boolean
  },
): GstInvoiceCalcOutput {
  const lines = lineInputs.map((ln) => calculateGstLineBigInt(ln, options))
  const isInterState =
    lines[0]?.isInterState ??
    (options.supplyType !== 'REGULAR' ||
      options.originStateCode.trim() !== options.placeOfSupply.trim())

  let subtotalScaled = 0n
  let totalDiscountScaled = 0n
  let taxableTotalScaled = 0n
  let cgstTotalScaled = 0n
  let sgstTotalScaled = 0n
  let igstTotalScaled = 0n
  let cessTotalScaled = 0n

  const hsnMap = new Map<string, HsnSummaryPreviewRow>()

  for (const ln of lines) {
    subtotalScaled += ln.grossScaled
    totalDiscountScaled += ln.discountAmountScaled
    taxableTotalScaled += ln.taxableScaled
    cgstTotalScaled += ln.cgstAmountScaled
    sgstTotalScaled += ln.sgstAmountScaled
    igstTotalScaled += ln.igstAmountScaled
    cessTotalScaled += ln.cessAmountScaled

    const key = [
      ln.hsnSacCode,
      ln.cgstRateScaled.toString(),
      ln.sgstRateScaled.toString(),
      ln.igstRateScaled.toString(),
      ln.cessRateScaled.toString(),
    ].join('|')
    const existing = hsnMap.get(key)
    if (existing) {
      existing.taxableScaled += ln.taxableScaled
      existing.cgstAmountScaled += ln.cgstAmountScaled
      existing.sgstAmountScaled += ln.sgstAmountScaled
      existing.igstAmountScaled += ln.igstAmountScaled
      existing.cessAmountScaled += ln.cessAmountScaled
      existing.totalTaxScaled += ln.taxAmountScaled
    } else {
      hsnMap.set(key, {
        hsnSacCode: ln.hsnSacCode,
        taxableScaled: ln.taxableScaled,
        cgstRateScaled: ln.cgstRateScaled,
        cgstAmountScaled: ln.cgstAmountScaled,
        sgstRateScaled: ln.sgstRateScaled,
        sgstAmountScaled: ln.sgstAmountScaled,
        igstRateScaled: ln.igstRateScaled,
        igstAmountScaled: ln.igstAmountScaled,
        cessRateScaled: ln.cessRateScaled,
        cessAmountScaled: ln.cessAmountScaled,
        totalTaxScaled: ln.taxAmountScaled,
      })
    }
  }

  const taxTotalScaled =
    cgstTotalScaled + sgstTotalScaled + igstTotalScaled + cessTotalScaled
  const rawPayable = options.isRcm
    ? taxableTotalScaled
    : taxableTotalScaled + taxTotalScaled

  let roundOffScaled = 0n
  let grandTotalScaled = rawPayable
  if (options.enableRoundOff) {
    const rounded = roundHalfUpDiv(rawPayable, 10000n) * 10000n
    roundOffScaled = rounded - rawPayable
    grandTotalScaled = rounded
  }

  return {
    isInterState,
    lines,
    subtotalScaled,
    totalDiscountScaled,
    taxableTotalScaled,
    cgstTotalScaled,
    sgstTotalScaled,
    igstTotalScaled,
    cessTotalScaled,
    taxTotalScaled,
    roundOffScaled,
    grandTotalScaled,
    hsnSummary: Array.from(hsnMap.values()),
  }
}

export function formatTaxRateLabel(rateStr: string | bigint): string {
  const scaled = typeof rateStr === 'bigint' ? rateStr : toScaledInt(rateStr)
  const str = fromScaledInt(absBigInt(scaled), 2)
  return `${str.endsWith('.00') ? str.slice(0, -3) : str}%`
}

export function formatQuantityWithDecimals(qtyStr: string, decimalPlaces: number): string {
  const scaled = toScaledInt(qtyStr)
  const fixed4 = fromScaledInt(scaled, 4)
  if (decimalPlaces >= 4) return fixed4
  const [whole = '0', frac = '0000'] = fixed4.split('.')
  if (decimalPlaces <= 0) return whole
  return `${whole}.${frac.slice(0, decimalPlaces)}`
}
