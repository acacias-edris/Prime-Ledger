import { absBigInt, fromScaledInt, toScaledInt } from './decimal'

export type SupportedCurrency = 'INR' | 'USD' | 'GBP'

const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  INR: '₹',
  USD: '$',
  GBP: '£',
}

/**
 * Applies Indian Lakh/Crore digit grouping (e.g. "1482450" -> "14,82,450").
 */
function groupIndianInteger(intStr: string): string {
  if (intStr.length <= 3) return intStr
  const lastThree = intStr.slice(-3)
  const leading = intStr.slice(0, -3)
  const groupedLeading = leading.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${groupedLeading},${lastThree}`
}

/**
 * Applies International thousand grouping (e.g. "124500" -> "124,500").
 */
function groupInternationalInteger(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export interface FormatCurrencyOptions {
  currency?: SupportedCurrency
  showSymbol?: boolean
  negativeStyle?: 'parens' | 'minus'
}

/**
 * Formats an exact decimal string or scaled BigInt into Indian Lakh/Crore (INR)
 * or International (USD/GBP) currency notation without floating-point drift.
 */
export function formatCurrency(
  value: string | bigint,
  options: FormatCurrencyOptions = {},
): string {
  const { currency = 'INR', showSymbol = true, negativeStyle = 'parens' } = options
  const scaled = typeof value === 'bigint' ? value : toScaledInt(value)
  const isNegative = scaled < 0n
  const fixed2 = fromScaledInt(absBigInt(scaled), 2)
  const [wholePart = '0', fracPart = '00'] = fixed2.split('.')

  const groupedWhole =
    currency === 'INR'
      ? groupIndianInteger(wholePart)
      : groupInternationalInteger(wholePart)

  const symbol = showSymbol ? CURRENCY_SYMBOLS[currency] : ''
  const formattedAbs = `${symbol}${groupedWhole}.${fracPart}`

  if (!isNegative) return formattedAbs
  if (negativeStyle === 'parens') return `(${formattedAbs})`
  // Uses true Unicode minus sign U+2212 per DESIGN_SYSTEM.md §8.3
  return `\u2212${formattedAbs}`
}

/**
 * Formats a Debit or Credit table cell per DESIGN_SYSTEM.md §8.4 & §8.7:
 * returns em dash "—" when zero (nil side), otherwise right-aligned currency without symbol.
 */
export function formatBookAmountCell(
  value: string | bigint,
  currency: SupportedCurrency = 'INR',
): { text: string; isNil: boolean } {
  const scaled = typeof value === 'bigint' ? value : toScaledInt(value)
  if (scaled === 0n) {
    return { text: '—', isNil: true }
  }
  return {
    text: formatCurrency(scaled, { currency, showSymbol: false, negativeStyle: 'parens' }),
    isNil: false,
  }
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Splits formatted currency into symbol, integer, and decimal parts for baseline-scaled KPI display.
 */
export function splitCurrencyParts(
  value: string | bigint,
  currency: SupportedCurrency = 'INR',
): { symbol: string; integer: string; fraction: string; isNegative: boolean } {
  const scaled = typeof value === 'bigint' ? value : toScaledInt(value)
  const isNegative = scaled < 0n
  const fixed2 = fromScaledInt(absBigInt(scaled), 2)
  const [wholePart = '0', fracPart = '00'] = fixed2.split('.')
  const groupedWhole =
    currency === 'INR'
      ? groupIndianInteger(wholePart)
      : groupInternationalInteger(wholePart)

  return {
    symbol: CURRENCY_SYMBOLS[currency],
    integer: groupedWhole,
    fraction: `.${fracPart}`,
    isNegative,
  }
}

/**
 * Formats YYYY-MM-DD strictly as DD-MMM-YYYY (e.g. "24-Nov-2026") per DESIGN_SYSTEM.md §8.9.
 */
export function formatDisplayDate(isoDate: string): string {
  const parts = isoDate.split('-')
  if (parts.length !== 3) return isoDate
  const year = parts[0]
  const monthIdx = Number(parts[1]) - 1
  const day = parts[2].padStart(2, '0')
  const month = MONTH_ABBR[monthIdx]
  if (!month) return isoDate
  return `${day}-${month}-${year}`
}

/**
 * Formats YYYY-MM-DD as compact "26 Nov" for Day Book cells (year implied by FY).
 */
export function formatShortDate(isoDate: string): string {
  const parts = isoDate.split('-')
  if (parts.length !== 3) return isoDate
  const monthIdx = Number(parts[1]) - 1
  const day = parts[2].padStart(2, '0')
  const month = MONTH_ABBR[monthIdx]
  if (!month) return isoDate
  return `${day} ${month}`
}

/**
 * Extracts day and uppercase month from "DD-MMM-YYYY" for compliance date blocks.
 */
export function parseDateBlock(displayDate: string): { day: string; month: string } {
  const [day = '—', month = ''] = displayDate.split('-')
  return { day, month: month.toUpperCase() }
}
