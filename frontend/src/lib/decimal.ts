export const DECIMAL_SCALE = 10000n
export const DECIMAL_INPUT_REGEX = /^\d{1,14}(\.\d{1,4})?$/

/**
 * Parses a decimal string (e.g. "14500.25", "100", "") into a scaled BigInt (* 10_000n).
 * Never uses IEEE-754 floating-point arithmetic.
 */
export function toScaledInt(raw: string | undefined | null): bigint {
  if (!raw) return 0n
  const cleaned = raw.trim().replace(/,/g, '')
  if (cleaned === '' || cleaned === '.') return 0n

  const isNegative = cleaned.startsWith('-') || cleaned.startsWith('−')
  const unsigned = isNegative ? cleaned.slice(1) : cleaned

  if (!DECIMAL_INPUT_REGEX.test(unsigned)) {
    return 0n
  }

  const [wholePart = '0', fracPart = ''] = unsigned.split('.')
  const whole = BigInt(wholePart || '0')
  const frac = BigInt(fracPart.slice(0, 4).padEnd(4, '0'))
  const scaled = whole * DECIMAL_SCALE + frac

  return isNegative ? -scaled : scaled
}

/**
 * Converts a scaled BigInt (* 10_000n) back to a fixed decimal string ("14500.2500").
 */
export function fromScaledInt(scaled: bigint, decimals: 2 | 4 = 4): string {
  const isNegative = scaled < 0n
  const abs = isNegative ? -scaled : scaled

  let rounded = abs
  if (decimals === 2) {
    // ROUND_HALF_UP from 4 dp to 2 dp
    const remainder = abs % 100n
    const base = abs / 100n
    rounded = remainder >= 50n ? (base + 1n) * 100n : base * 100n
  }

  const whole = rounded / DECIMAL_SCALE
  const frac4 = (rounded % DECIMAL_SCALE).toString().padStart(4, '0')
  const frac = decimals === 2 ? frac4.slice(0, 2) : frac4

  return `${isNegative ? '-' : ''}${whole.toString()}.${frac}`
}

export function sumScaledStrings(values: ReadonlyArray<string>): bigint {
  return values.reduce((acc, value) => acc + toScaledInt(value), 0n)
}

export function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value
}

export function isValidDecimalString(raw: string): boolean {
  const trimmed = raw.trim()
  if (trimmed === '') return true
  return DECIMAL_INPUT_REGEX.test(trimmed)
}
