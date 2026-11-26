# Current Task: Milestone 1 — Visual North Star (CURRENT_TASK.md)

## Objective

Build LedgerPrime's Visual North Star frontend milestone: lock the Tailwind CSS v4.3.5 + DESIGN_SYSTEM.md semantic token pipeline (Light/Dark + A4 print), craft all 9 state-complete reusable UI primitives (including TanStack Table v9), wire the Tally keyboard ergonomics engine (F4–F9, Alt+4–9, Alt+G, Esc, Ctrl+Enter), and ship the flagship Financial Command Center (FinancialCommandPage.tsx) inside AppShell backed by realistic synthetic FY 2026–27 data and an interactive, zero-float BigInt-validated Quick Voucher Entry Drawer.

> **Strict Milestone Scope Guardrail:** Frontend-only Visual North Star. Do NOT wire FastAPI endpoints, SQLite/Alembic migrations, or secondary route pages in this milestone. Zero raw hex colors in .tsx files, zero tailwind.config.js / postcss.config.js, zero legacy TanStack Table v8 APIs (useReactTable / getCoreRowModel), and zero React forwardRef / defaultProps.

---

## Prerequisite Commands

All required dependencies (react@^19.3.1, @tanstack/react-table@^9.3.1, @tanstack/react-query@^5.108.4, react-hook-form@^7.92.0, zod@^4.6.7, @hookform/resolvers@^7.0.9, lucide-react@^1.81.0, tailwindcss@^4.3.5, @tailwindcss/vite@^4.3.5, vite@^6.4.6) are already declared in frontend/package.json. 

Run these verification & cleanup commands before writing code:

```bash
cd frontend

# 1. Ensure dependencies are installed cleanly (zero extra packages needed)
npm install

# 2. Remove any legacy Tailwind v3 config files or unused default Vite boilerplate CSS if present
rm -f tailwind.config.js tailwind.config.ts postcss.config.js postcss.config.cjs src/App.css src/index.css

# 3. Create required directory structure
mkdir -p src/styles src/lib src/hooks src/components/ui src/components/layout src/features/dashboard

# 4. Ensure gitignored local screenshot directory exists at repo root
mkdir -p ../qa-screenshots
```

---

## Files to Create or Modify

| # | File Path | Purpose |
|---|-----------|---------|
| 1 | `frontend/vite.config.ts` | Vite 6.4 + @vitejs/plugin-react + @tailwindcss/vite + /api proxy to 127.0.0.1:8000 |
| 2 | `frontend/index.html` | Google Fonts (Plus Jakarta Sans, Inter, JetBrains Mono) + anti-FOUC data-theme init script |
| 3 | `frontend/src/styles/tokens.css` | Exact DESIGN_SYSTEM.md Light (:root) & Dark ([data-theme="dark"]) semantic CSS variables |
| 4 | `frontend/src/styles/index.css` | Tailwind v4 @import, @custom-variant dark, @theme inline, sticky-table scroll contract, @media print A4 rules |
| 5 | `frontend/src/lib/cn.ts` | Zero-dependency className joiner |
| 6 | `frontend/src/lib/decimal.ts` | Exact BigInt scaled * 10000n decimal math & validator (zero IEEE-754 float drift) |
| 7 | `frontend/src/lib/format.ts` | Indian Lakh/Crore (14,82,450.00) & ISO currency formatting, Dr/Cr nil (—) & DD-MMM-YYYY date helpers |
| 8 | `frontend/src/lib/dummyData.ts` | Realistic synthetic FY 2026–27 data for Bharat Hardware & Exports Pvt. Ltd. (zero PII, zero Lorem ipsum) |
| 9 | `frontend/src/hooks/useTheme.ts` | Light/Dark mode toggle persisted to localStorage via document.documentElement.dataset.theme |
| 10 | `frontend/src/hooks/useKeymap.ts` | Tally keyboard engine (Alt+G, F4–F9, Alt+4–9, Esc, Ctrl+Enter) with input-safety guards |
| 11 | `frontend/src/components/ui/Kbd.ts` | xTactile shortcut keycap chip |
| 12 | `frontend/src/components/ui/Badge.ts` | xSemantic status pill (always pairs icon + text label; color is never the sole signal) |
| 13 | `frontend/src/components/ui/Button.ts` | xState-complete button (primary, secondary, ghost, danger, loading, disabled, trailing <Kbd>) |
| 14 | `frontend/src/components/ui/Card.ts` | xFlat Level-1 hairline ledger card with skeleton loading state |
| 15 | `frontend/src/components/ui/Input.ts` | xAccessible control (--control-h, --border-input ≥ 3:1, numeric right-align, error + aria-describedby) |
| 16 | `frontend/src/components/ui/EmptyState.ts` | xMuted icon + 1-line explanation + clear primary CTA |
| 17 | `frontend/src/components/ui/Drawer.ts` | xResponsive slide-over panel (640px desktop / full-screen sheet 390px mobile) with sticky header/footer |
| 18 | `frontend/src/components/ui/DataTable.ts` | xReusable TanStack Table v9 grid (useTable, static tableFeatures, table.state.sorting, <table.FlexRender />) |
| 19 | `frontend/src/components/ui/CommandPalette.ts` | xAlt+G Go-To Command Palette with live search across actions, modules, ledgers, and vouchers |
| 20 | `frontend/src/components/layout/AppShell.ts` | xCollapsible 240px sidebar (mobile drawer at 390px) + sticky 56px topbar |
| 21 | `frontend/src/features/dashboard/QuickVoucherDrawer.ts` | xInteractive react-hook-form + zod v4 + BigInt balanced voucher entry drawer (F4–F9 tabs) |
| 22 | `frontend/src/features/dashboard/FinancialCommandPage.ts` | xFlagship showcase screen: 4-card KPI strip, filterable Day Book DataTable, Compliance Snapshot |
| 23 | `frontend/src/App.ts` | xTop-level state coordinator wiring AppShell, FinancialCommandPage, QuickVoucherDrawer, CommandPalette, useKeymap |
| 24 | `frontend/src/main.ts` | xReact 19.3 entrypoint with QueryClientProvider (ready for Milestone 2) |

---

## Exact Implementation Blueprint

### 1. `frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
```

---

### 2. `frontend/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LedgerPrime — Bharat Hardware &amp; Exports Pvt. Ltd. (FY 2026–27)</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <script>
      ;(function () {
        try {
          var saved = localStorage.getItem('ledgerprime-theme')
          if (saved === 'dark') {
            document.documentElement.dataset.theme = 'dark'
          } else {
            document.documentElement.dataset.theme = 'light'
          }
        } catch (_err) {
          document.documentElement.dataset.theme = 'light'
        }
      })()
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

### 3. `frontend/src/styles/tokens.css`

```css
:root {
  color-scheme: light;

  /* Surfaces */
  --bg-canvas: #f8fafc;
  --bg-surface: #ffffff;
  --bg-muted: #f1f5f9;
  --bg-table-header: #f1f5f9;
  --bg-row-stripe: #fafbfc;
  --bg-row-hover: #eef2f7;
  --bg-row-selected: #e6eef7;
  --bg-row-group: #f6f8fa;

  /* Text */
  --text-primary: #0f172a;
  --text-muted: #475569;
  --text-disabled: #64748b;

  /* Borders */
  --border-subtle: #e2e8f0; /* decorative only */
  --border-input: #64748b; /* >= 3:1 interactive controls */
  --border-strong: #94a3b8; /* totals, floating frames */

  /* Brand & focus */
  --accent-primary: #0f4c81;
  --accent-foreground: #ffffff;
  --ring-focus: #1d4ed8;

  /* Status (state, never Dr/Cr side) */
  --status-success: #15803d;
  --status-success-bg: #dcfce7;
  --status-warning: #b45309;
  --status-warning-bg: #fef3c7;
  --status-danger: #b91c1c;
  --status-danger-bg: #fee2e2;

  /* Type */
  --font-display: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-num: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  --num-features: tabular-nums lining-nums slashed-zero;
  --fs-kpi: 2rem;
  --fs-h1: 1.5rem;
  --fs-h2: 1.125rem;
  --fs-h3: 0.9375rem;
  --fs-body: 0.875rem;
  --fs-sm: 0.8125rem;
  --fs-th: 0.75rem;
  --fs-xs: 0.6875rem;

  /* Spacing (4px scale) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Sizing */
  --control-h: 40px;
  --row-h-compact: 32px;
  --row-h-comfortable: 40px;
  --row-h-mobile: 44px;

  /* Shape */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Elevation (floating layers only) */
  --shadow-sm: 0 2px 6px rgba(15, 23, 42, 0.08);
  --shadow-md: 0 10px 28px rgba(15, 23, 42, 0.12);
  --shadow-sticky-col: 4px 0 6px -4px rgba(15, 23, 42, 0.12);

  /* Layers */
  --z-sticky: 10;
  --z-topbar: 20;
  --z-drawer: 40;
  --z-modal: 50;
  --z-palette: 60;
  --z-toast: 70;

  /* Motion */
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 280ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* Backdrop overlay */
  --bg-backdrop: rgba(15, 23, 42, 0.45);
}

@media (max-width: 767px) {
  :root {
    --control-h: 44px;
    --fs-kpi: 1.625rem;
    --fs-h1: 1.25rem;
    --fs-h2: 1.0625rem;
  }
}

[data-theme='dark'] {
  color-scheme: dark;

  --bg-canvas: #0b0f14;
  --bg-surface: #121821;
  --bg-muted: #1a222e;
  --bg-table-header: #18202b;
  --bg-row-stripe: #151c26;
  --bg-row-hover: #1e2836;
  --bg-row-selected: #16304a;
  --bg-row-group: #161d27;

  --text-primary: #f1f5f9;
  --text-muted: #94a3b8;
  --text-disabled: #7c8aa0;

  --border-subtle: #243040;
  --border-input: #64748b;
  --border-strong: #475569;

  --accent-primary: #5ab0e8;
  --accent-foreground: #06243a;
  --ring-focus: #7dd3fc;

  --status-success: #4ade80;
  --status-success-bg: rgba(74, 222, 128, 0.14);
  --status-warning: #fbbf24;
  --status-warning-bg: rgba(251, 191, 36, 0.14);
  --status-danger: #f87171;
  --status-danger-bg: rgba(248, 113, 113, 0.14);

  --shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 12px 32px rgba(0, 0, 0, 0.55);
  --shadow-sticky-col: 4px 0 6px -4px rgba(0, 0, 0, 0.5);

  --bg-backdrop: rgba(2, 6, 23, 0.72);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-fast: 60ms;
    --dur-base: 80ms;
    --dur-slow: 80ms;
  }
}

@media print {
  [data-theme='dark'],
  :root {
    color-scheme: light;
    --bg-canvas: #ffffff;
    --bg-surface: #ffffff;
    --bg-muted: #f1f5f9;
    --bg-table-header: #f1f5f9;
    --bg-row-stripe: #ffffff;
    --bg-row-hover: #ffffff;
    --bg-row-selected: #ffffff;
    --bg-row-group: #f6f8fa;
    --text-primary: #0f172a;
    --text-muted: #475569;
    --text-disabled: #64748b;
    --border-subtle: #cbd5e1;
    --border-input: #64748b;
    --border-strong: #0f172a;
    --accent-primary: #0f4c81;
    --accent-foreground: #ffffff;
    --status-success: #15803d;
    --status-success-bg: #dcfce7;
    --status-warning: #b45309;
    --status-warning-bg: #fef3c7;
    --status-danger: #b91c1c;
    --status-danger-bg: #fee2e2;
    --shadow-sm: none;
    --shadow-md: none;
    --shadow-sticky-col: none;
  }
}
```

---

### 4. `frontend/src/styles/index.css`

```css
@import 'tailwindcss';
@import './tokens.css';

/* Enable [data-theme="dark"] dark-mode variant alongside runtime semantic CSS tokens */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* Map all semantic CSS custom properties from tokens.css into Tailwind v4 utilities */
@theme inline {
  --color-canvas: var(--bg-canvas);
  --color-surface: var(--bg-surface);
  --color-muted: var(--bg-muted);
  --color-table-header: var(--bg-table-header);
  --color-row-stripe: var(--bg-row-stripe);
  --color-row-hover: var(--bg-row-hover);
  --color-row-selected: var(--bg-row-selected);
  --color-row-group: var(--bg-row-group);
  --color-backdrop: var(--bg-backdrop);

  --color-primary-text: var(--text-primary);
  --color-muted-text: var(--text-muted);
  --color-disabled-text: var(--text-disabled);

  --color-border-subtle: var(--border-subtle);
  --color-border-input: var(--border-input);
  --color-border-strong: var(--border-strong);

  --color-accent: var(--accent-primary);
  --color-accent-foreground: var(--accent-foreground);
  --color-ring-focus: var(--ring-focus);

  --color-success: var(--status-success);
  --color-success-bg: var(--status-success-bg);
  --color-warning: var(--status-warning);
  --color-warning-bg: var(--status-warning-bg);
  --color-danger: var(--status-danger);
  --color-danger-bg: var(--status-danger-bg);

  --font-display: var(--font-display);
  --font-sans: var(--font-sans);
  --font-num: var(--font-num);
  --font-mono: var(--font-mono);

  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-full: var(--radius-full);

  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
}

@layer base {
  html,
  body {
    background-color: var(--bg-canvas);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: var(--fs-body);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: clip;
  }

  h1,
  h2,
  h3 {
    font-family: var(--font-display);
  }

  *:focus-visible {
    outline: 2px solid var(--ring-focus);
    outline-offset: 2px;
  }
}

.tabular-ledger {
  font-family: var(--font-num);
  font-variant-numeric: var(--num-features);
}

.tabular-mono {
  font-family: var(--font-mono);
  font-variant-numeric: var(--num-features);
}

/* Single scroll container contract (DESIGN_SYSTEM.md §8.2) */
.table-scroll {
  overflow-x: auto;
  overflow-y: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}

.grand-total-cell {
  border-top: 2px solid var(--border-strong);
  border-bottom: 3px double var(--border-strong);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: var(--dur-base) !important;
    scroll-behavior: auto !important;
  }
}

/* Zero-RAM A4 Print / PDF Export Rules (DOCS_REFERENCE.md & DESIGN_SYSTEM.md §8.13) */
@media print {
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  html,
  body {
    background: var(--bg-surface) !important;
    color: var(--text-primary) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  thead {
    display: table-header-group;
  }

  tfoot {
    display: table-footer-group;
    break-before: avoid;
  }

  tr {
    break-inside: avoid;
  }

  .table-scroll {
    overflow: visible !important;
    max-height: none !important;
  }
}
```

---

### 5. `frontend/src/lib/cn.ts`

```ts
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
```

---

### 6. `frontend/src/lib/decimal.ts`

```ts
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
```

---

### 7. `frontend/src/lib/format.ts`

```ts
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
```

---

### 8. `frontend/src/lib/dummyData.ts`

```ts
import type { SupportedCurrency } from './format'

export type VoucherType =
  | 'CONTRA'
  | 'PAYMENT'
  | 'RECEIPT'
  | 'JOURNAL'
  | 'SALES'
  | 'PURCHASE'

export type VoucherLifecycleStatus =
  | 'POSTED'
  | 'DRAFT'
  | 'POST_DATED'
  | 'OPTIONAL'
  | 'CANCELLED'

export type ComplianceReconStatus =
  | 'MATCHED'
  | 'RECONCILED'
  | 'PENDING_BRS'
  | 'GSTR2B_MISMATCH'
  | 'E_INVOICE_IRN'
  | 'POST_DATED'
  | 'CANCELLED'

export interface LedgerAccount {
  code: string
  name: string
  group: string
  nature: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
  currency: SupportedCurrency
}

export interface VoucherEntryLine {
  accountCode: string
  accountName: string
  debit: string
  credit: string
}

export interface DayBookVoucher {
  id: string
  voucherDate: string // YYYY-MM-DD
  voucherNo: string
  voucherType: VoucherType
  particulars: string
  narration: string
  referenceNo?: string
  currency: SupportedCurrency
  foreignAmount?: string
  exchangeRate?: string
  debit: string // Base INR debit column in Day Book ("0.0000" when nil)
  credit: string // Base INR credit column in Day Book ("0.0000" when nil)
  lifecycleStatus: VoucherLifecycleStatus
  complianceStatus: ComplianceReconStatus
  complianceLabel: string
  lines: VoucherEntryLine[]
}

export interface ComplianceDueItem {
  id: string
  filing: string
  period: string
  dueDate: string
  status: 'warning' | 'neutral' | 'success'
  statusText: string
}

export interface VoucherTypeMeta {
  type: VoucherType
  label: string
  shortKey: string
  backupChord: string
  prefix: string
  defaultDebitCode: string
  defaultCreditCode: string
}

export const COMPANY_PROFILE = {
  legalName: 'Bharat Hardware & Exports Pvt. Ltd.',
  fiscalYear: 'FY 2026–27',
  periodLabel: 'Nov 2026',
  // Synthetic placeholder GSTIN strictly for local dummy previews
  gstin: '09AABCB0000F1Z5',
  stateLabel: '09 · Uttar Pradesh',
  baseCurrency: 'INR' as SupportedCurrency,
} as const

export const VOUCHER_TYPE_META: Record<VoucherType, VoucherTypeMeta> = {
  CONTRA: {
    type: 'CONTRA',
    label: 'Contra',
    shortKey: 'F4',
    backupChord: 'Alt+4',
    prefix: 'CNT/26-27/',
    defaultDebitCode: '1010',
    defaultCreditCode: '1001',
  },
  PAYMENT: {
    type: 'PAYMENT',
    label: 'Payment',
    shortKey: 'F5',
    backupChord: 'Alt+5',
    prefix: 'PAY/26-27/',
    defaultDebitCode: '2001',
    defaultCreditCode: '1010',
  },
  RECEIPT: {
    type: 'RECEIPT',
    label: 'Receipt',
    shortKey: 'F6',
    backupChord: 'Alt+6',
    prefix: 'RCP/26-27/',
    defaultDebitCode: '1010',
    defaultCreditCode: '1101',
  },
  JOURNAL: {
    type: 'JOURNAL',
    label: 'Journal',
    shortKey: 'F7',
    backupChord: 'Alt+7',
    prefix: 'JRN/26-27/',
    defaultDebitCode: '5201',
    defaultCreditCode: '2201',
  },
  SALES: {
    type: 'SALES',
    label: 'Sales',
    shortKey: 'F8',
    backupChord: 'Alt+8',
    prefix: 'INV/26-27/',
    defaultDebitCode: '1101',
    defaultCreditCode: '4001',
  },
  PURCHASE: {
    type: 'PURCHASE',
    label: 'Purchase',
    shortKey: 'F9',
    backupChord: 'Alt+9',
    prefix: 'PUR/26-27/',
    defaultDebitCode: '5001',
    defaultCreditCode: '2001',
  },
}

export const VOUCHER_TYPE_ORDER: VoucherType[] = [
  'CONTRA',
  'PAYMENT',
  'RECEIPT',
  'JOURNAL',
  'SALES',
  'PURCHASE',
]

export const SYNTHETIC_LEDGERS: LedgerAccount[] = [
  { code: '1001', name: 'Cash-in-Hand (Head Office)', group: 'Cash-in-Hand', nature: 'ASSET', currency: 'INR' },
  { code: '1010', name: 'HDFC Bank Current A/c · 4821', group: 'Bank Accounts', nature: 'ASSET', currency: 'INR' },
  { code: '1012', name: 'SBI EEFC USD Current A/c · 9104', group: 'Bank Accounts', nature: 'ASSET', currency: 'USD' },
  { code: '1101', name: 'Apex Industrial Electricals Pvt. Ltd.', group: 'Sundry Debtors', nature: 'ASSET', currency: 'INR' },
  { code: '1102', name: 'Western Valves & Fittings LLP', group: 'Sundry Debtors', nature: 'ASSET', currency: 'INR' },
  { code: '1103', name: 'Nordic Fasteners AB (Sweden)', group: 'Sundry Debtors (Export)', nature: 'ASSET', currency: 'USD' },
  { code: '1201', name: 'Inventory — Finished Goods', group: 'Stock-in-Hand', nature: 'ASSET', currency: 'INR' },
  { code: '2001', name: 'Mahavir Copper Industries', group: 'Sundry Creditors', nature: 'LIABILITY', currency: 'INR' },
  { code: '2002', name: 'Kalyani Freight & Logistics', group: 'Sundry Creditors', nature: 'LIABILITY', currency: 'INR' },
  { code: '2101', name: 'Output CGST 9%', group: 'Duties & Taxes', nature: 'LIABILITY', currency: 'INR' },
  { code: '2102', name: 'Output SGST 9%', group: 'Duties & Taxes', nature: 'LIABILITY', currency: 'INR' },
  { code: '2103', name: 'Output IGST 18%', group: 'Duties & Taxes', nature: 'LIABILITY', currency: 'INR' },
  { code: '2111', name: 'Input CGST 9%', group: 'Duties & Taxes (ITC)', nature: 'ASSET', currency: 'INR' },
  { code: '2112', name: 'Input SGST 9%', group: 'Duties & Taxes (ITC)', nature: 'ASSET', currency: 'INR' },
  { code: '2113', name: 'Input IGST 18%', group: 'Duties & Taxes (ITC)', nature: 'ASSET', currency: 'INR' },
  { code: '2201', name: 'TDS Payable — Sec 194C / 194I', group: 'Statutory Liabilities', nature: 'LIABILITY', currency: 'INR' },
  { code: '4001', name: 'Sales — Electrical Hardware', group: 'Sales Accounts', nature: 'INCOME', currency: 'INR' },
  { code: '4002', name: 'Export Sales (LUT — Zero Rated)', group: 'Sales Accounts', nature: 'INCOME', currency: 'USD' },
  { code: '5001', name: 'Purchases — Copper & Alloys', group: 'Purchase Accounts', nature: 'EXPENSE', currency: 'INR' },
  { code: '5101', name: 'Freight & Forwarding Inward', group: 'Direct Expenses', nature: 'EXPENSE', currency: 'INR' },
  { code: '5201', name: 'Office Rent & Warehouse Utilities', group: 'Indirect Expenses', nature: 'EXPENSE', currency: 'INR' },
  { code: '5301', name: 'Round Off', group: 'Indirect Expenses', nature: 'EXPENSE', currency: 'INR' },
]

export const BASE_FINANCIAL_KPIS = {
  cashAndBank: '1482450.0000',
  cashAndBankDelta: '+6.4% vs Oct',
  sundryReceivables: '2245800.0000',
  receivablesNote: '4 bills aging > 30d',
  sundryPayables: '918620.0000',
  payablesNote: 'Next payout in 5 days',
  netGstItcSurplus: '114350.0000',
  gstPositionNote: 'Net ITC Available · Rule 88A',
} as const

export const COMPLIANCE_SNAPSHOT = {
  bankAccountLabel: 'HDFC Bank Current A/c · 4821',
  unreconciledBankLines: 7,
  unreconciledNetVariance: '-184250.0000',
  lastBankSync: '26-Nov-2026 · 10:15 IST',
  gstr2bMatchPercent: 91.4,
  gstr2bMatchedCount: 32,
  gstr2bTotalCount: 35,
  gstr2bMismatchCount: 2,
  gstr2bMissingCount: 1,
  dueDates: [
    {
      id: 'due-tds',
      filing: 'TDS Challan (ITNS 281)',
      period: 'Nov 2026',
      dueDate: '07-Dec-2026',
      status: 'warning',
      statusText: 'Due in 11d',
    },
    {
      id: 'due-gstr1',
      filing: 'GSTR-1 Outward Return',
      period: 'Nov 2026',
      dueDate: '11-Dec-2026',
      status: 'warning',
      statusText: 'Due in 15d',
    },
    {
      id: 'due-ims',
      filing: 'GSTR-2B Auto-Draft & IMS',
      period: 'Nov 2026',
      dueDate: '14-Dec-2026',
      status: 'neutral',
      statusText: 'Auto-generates',
    },
    {
      id: 'due-gstr3b',
      filing: 'GSTR-3B Summary & Set-Off',
      period: 'Nov 2026',
      dueDate: '20-Dec-2026',
      status: 'success',
      statusText: 'ITC Surplus',
    },
  ] satisfies ComplianceDueItem[],
}

export const INITIAL_VOUCHERS: DayBookVoucher[] = [
  {
    id: 'v-001',
    voucherDate: '2026-11-26',
    voucherNo: 'INV/26-27/0042',
    voucherType: 'SALES',
    particulars: 'Apex Industrial Electricals Pvt. Ltd.',
    narration: 'Copper Wire Coil 2.5mm (240 coils) · Intra-State CGST 9% + SGST 9%',
    referenceNo: 'PO-APEX-8841',
    currency: 'INR',
    debit: '283200.0000',
    credit: '0.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'E_INVOICE_IRN',
    complianceLabel: 'IRN Verified',
    lines: [
      { accountCode: '1101', accountName: 'Apex Industrial Electricals Pvt. Ltd.', debit: '283200.0000', credit: '0.0000' },
      { accountCode: '4001', accountName: 'Sales — Electrical Hardware', debit: '0.0000', credit: '240000.0000' },
      { accountCode: '2101', accountName: 'Output CGST 9%', debit: '0.0000', credit: '21600.0000' },
      { accountCode: '2102', accountName: 'Output SGST 9%', debit: '0.0000', credit: '21600.0000' },
    ],
  },
  {
    id: 'v-002',
    voucherDate: '2026-11-25',
    voucherNo: 'PUR/26-27/0118',
    voucherType: 'PURCHASE',
    particulars: 'Mahavir Copper Industries',
    narration: 'Electrolytic Copper Rod 8mm · Batch LOT-20261125 · ITC Eligible',
    referenceNo: 'MCI/26/9412',
    currency: 'INR',
    debit: '0.0000',
    credit: '413000.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'MATCHED',
    complianceLabel: '2B Matched',
    lines: [
      { accountCode: '5001', accountName: 'Purchases — Copper & Alloys', debit: '350000.0000', credit: '0.0000' },
      { accountCode: '2111', accountName: 'Input CGST 9%', debit: '31500.0000', credit: '0.0000' },
      { accountCode: '2112', accountName: 'Input SGST 9%', debit: '31500.0000', credit: '0.0000' },
      { accountCode: '2001', accountName: 'Mahavir Copper Industries', debit: '0.0000', credit: '413000.0000' },
    ],
  },
  {
    id: 'v-003',
    voucherDate: '2026-11-24',
    voucherNo: 'EXP/26-27/0009',
    voucherType: 'SALES',
    particulars: 'Nordic Fasteners AB (Sweden)',
    narration: 'Export under LUT (Zero-Rated) · USD 4,500.00 @ ₹84.4000',
    referenceNo: 'SB-902145',
    currency: 'USD',
    foreignAmount: '4500.0000',
    exchangeRate: '84.4000',
    debit: '379800.0000',
    credit: '0.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'E_INVOICE_IRN',
    complianceLabel: 'LUT Export · IRN',
    lines: [
      { accountCode: '1103', accountName: 'Nordic Fasteners AB (Sweden)', debit: '379800.0000', credit: '0.0000' },
      { accountCode: '4002', accountName: 'Export Sales (LUT — Zero Rated)', debit: '0.0000', credit: '379800.0000' },
    ],
  },
  {
    id: 'v-004',
    voucherDate: '2026-11-23',
    voucherNo: 'RCP/26-27/0061',
    voucherType: 'RECEIPT',
    particulars: 'Western Valves & Fittings LLP',
    narration: 'RTGS settlement against INV/26-27/0034 · UTR HDFCR5202611230091',
    referenceNo: 'HDFCR5202611230091',
    currency: 'INR',
    debit: '195000.0000',
    credit: '0.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'PENDING_BRS',
    complianceLabel: 'BRS Pending',
    lines: [
      { accountCode: '1010', accountName: 'HDFC Bank Current A/c · 4821', debit: '195000.0000', credit: '0.0000' },
      { accountCode: '1102', accountName: 'Western Valves & Fittings LLP', debit: '0.0000', credit: '195000.0000' },
    ],
  },
  {
    id: 'v-005',
    voucherDate: '2026-11-22',
    voucherNo: 'PUR/26-27/0119',
    voucherType: 'PURCHASE',
    particulars: 'Kalyani Freight & Logistics',
    narration: 'Inter-State GTA Haulage (Delhi → Hathras) · IGST variance ₹1,260.00 in 2B',
    referenceNo: 'KFL/26/402',
    currency: 'INR',
    debit: '0.0000',
    credit: '74340.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'GSTR2B_MISMATCH',
    complianceLabel: '2B Variance',
    lines: [
      { accountCode: '5101', accountName: 'Freight & Forwarding Inward', debit: '63000.0000', credit: '0.0000' },
      { accountCode: '2113', accountName: 'Input IGST 18%', debit: '11340.0000', credit: '0.0000' },
      { accountCode: '2002', accountName: 'Kalyani Freight & Logistics', debit: '0.0000', credit: '73080.0000' },
      { accountCode: '2201', accountName: 'TDS Payable — Sec 194C / 194I', debit: '0.0000', credit: '1260.0000' },
    ],
  },
  {
    id: 'v-006',
    voucherDate: '2026-11-21',
    voucherNo: 'PAY/26-27/0084',
    voucherType: 'PAYMENT',
    particulars: 'Mahavir Copper Industries',
    narration: 'NEFT part payout against MCI/26/8801 · Matched via bank statement',
    referenceNo: 'HDFCN5202611214421',
    currency: 'INR',
    debit: '0.0000',
    credit: '250000.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'RECONCILED',
    complianceLabel: 'Reconciled',
    lines: [
      { accountCode: '2001', accountName: 'Mahavir Copper Industries', debit: '250000.0000', credit: '0.0000' },
      { accountCode: '1010', accountName: 'HDFC Bank Current A/c · 4821', debit: '0.0000', credit: '250000.0000' },
    ],
  },
  {
    id: 'v-007',
    voucherDate: '2026-11-20',
    voucherNo: 'JRN/26-27/0019',
    voucherType: 'JOURNAL',
    particulars: 'Office Rent & Warehouse Utilities',
    narration: 'Nov 2026 godown lease accrual with 10% TDS u/s 194I',
    referenceNo: 'RENT-NOV-26',
    currency: 'INR',
    debit: '85000.0000',
    credit: '85000.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'MATCHED',
    complianceLabel: 'TDS Logged',
    lines: [
      { accountCode: '5201', accountName: 'Office Rent & Warehouse Utilities', debit: '85000.0000', credit: '0.0000' },
      { accountCode: '2201', accountName: 'TDS Payable — Sec 194C / 194I', debit: '0.0000', credit: '8500.0000' },
      { accountCode: '2002', accountName: 'Kalyani Freight & Logistics', debit: '0.0000', credit: '76500.0000' },
    ],
  },
  {
    id: 'v-008',
    voucherDate: '2026-11-19',
    voucherNo: 'CNT/26-27/0007',
    voucherType: 'CONTRA',
    particulars: 'HDFC Bank Current A/c · 4821',
    narration: 'Counter cash deposit to HDFC branch · Deposit slip #4091',
    referenceNo: 'SLIP-4091',
    currency: 'INR',
    debit: '45000.0000',
    credit: '45000.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'RECONCILED',
    complianceLabel: 'Reconciled',
    lines: [
      { accountCode: '1010', accountName: 'HDFC Bank Current A/c · 4821', debit: '45000.0000', credit: '0.0000' },
      { accountCode: '1001', accountName: 'Cash-in-Hand (Head Office)', debit: '0.0000', credit: '45000.0000' },
    ],
  },
  {
    id: 'v-009',
    voucherDate: '2026-12-05',
    voucherNo: 'PAY/26-27/0085',
    voucherType: 'PAYMENT',
    particulars: 'Kalyani Freight & Logistics',
    narration: 'Post-dated Cheque #000482 maturing 05-Dec-2026 (excluded from cash balance)',
    referenceNo: 'CHQ-000482',
    currency: 'INR',
    debit: '0.0000',
    credit: '38500.0000',
    lifecycleStatus: 'POST_DATED',
    complianceStatus: 'POST_DATED',
    complianceLabel: 'Post-dated',
    lines: [
      { accountCode: '2002', accountName: 'Kalyani Freight & Logistics', debit: '38500.0000', credit: '0.0000' },
      { accountCode: '1010', accountName: 'HDFC Bank Current A/c · 4821', debit: '0.0000', credit: '38500.0000' },
    ],
  },
  {
    id: 'v-010',
    voucherDate: '2026-11-18',
    voucherNo: 'INV/26-27/0039',
    voucherType: 'SALES',
    particulars: 'Western Valves & Fittings LLP',
    narration: 'Cancelled due to duplicate PO quantity — preserved for GSTR-1 Table 13',
    referenceNo: 'PO-WVF-112',
    currency: 'INR',
    debit: '64900.0000',
    credit: '0.0000',
    lifecycleStatus: 'CANCELLED',
    complianceStatus: 'CANCELLED',
    complianceLabel: 'Cancelled',
    lines: [
      { accountCode: '1102', accountName: 'Western Valves & Fittings LLP', debit: '64900.0000', credit: '0.0000' },
      { accountCode: '4001', accountName: 'Sales — Electrical Hardware', debit: '0.0000', credit: '55000.0000' },
      { accountCode: '2103', accountName: 'Output IGST 18%', debit: '0.0000', credit: '9900.0000' },
    ],
  },
]
```

---

### 9. `frontend/src/hooks/useTheme.ts`

```ts
import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'ledgerprime-theme'

function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // Ignore storage privacy restrictions
  }
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Ignore storage quota errors
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, setTheme: setThemeState, toggleTheme }
}
```

---

### 10. `frontend/src/hooks/useKeymap.ts`

```ts
import { useEffect } from 'react'
import type { VoucherType } from '../lib/dummyData'

export interface UseKeymapOptions {
  onOpenCommandPalette: () => void
  onOpenVoucher: (voucherType: VoucherType) => void
  onEscape: () => void
  onSubmitActiveForm?: () => void
  isFormSubmitEnabled?: boolean
}

const FUNCTION_KEY_MAP: Record<string, VoucherType> = {
  F4: 'CONTRA',
  F5: 'PAYMENT',
  F6: 'RECEIPT',
  F7: 'JOURNAL',
  F8: 'SALES',
  F9: 'PURCHASE',
}

const ALT_DIGIT_MAP: Record<string, VoucherType> = {
  Digit4: 'CONTRA',
  Digit5: 'PAYMENT',
  Digit6: 'RECEIPT',
  Digit7: 'JOURNAL',
  Digit8: 'SALES',
  Digit9: 'PURCHASE',
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/**
 * Tally Prime keyboard ergonomics engine:
 * - Alt+G: Toggle Go-To Command Palette
 * - F4–F9 AND Linux/Brave-safe Alt+4–Alt+9: Open/switch Quick Voucher Drawer
 *   (calls e.preventDefault() so F5 never refreshes the browser)
 * - Esc: Close topmost overlay
 * - Ctrl+Enter / Cmd+Enter: Submit balanced voucher form when open
 * - Single-key non-chord shortcuts are ignored inside editable form inputs.
 */
export function useKeymap({
  onOpenCommandPalette,
  onOpenVoucher,
  onEscape,
  onSubmitActiveForm,
  isFormSubmitEnabled = false,
}: UseKeymapOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key
      const code = event.code
      const inEditable = isEditableTarget(event.target)

      // 1. Escape closes overlays cleanly from anywhere
      if (key === 'Escape') {
        event.preventDefault()
        onEscape()
        return
      }

      // 2. Ctrl+Enter / Cmd+Enter submits balanced active voucher form
      if ((event.ctrlKey || event.metaKey) && key === 'Enter') {
        if (isFormSubmitEnabled && onSubmitActiveForm) {
          event.preventDefault()
          onSubmitActiveForm()
        }
        return
      }

      // 3. Alt+G opens Go-To Command Palette
      if (event.altKey && !event.ctrlKey && !event.metaKey && (key.toLowerCase() === 'g' || code === 'KeyG')) {
        event.preventDefault()
        onOpenCommandPalette()
        return
      }

      // 4. Function keys F4–F9 (explicit F-key chord works everywhere; prevents F5 reload)
      if (!event.ctrlKey && !event.metaKey && !event.altKey && key in FUNCTION_KEY_MAP) {
        event.preventDefault()
        onOpenVoucher(FUNCTION_KEY_MAP[key])
        return
      }

      // 5. Brave/Linux Mint-safe Alt+4 through Alt+9 backup chords
      if (event.altKey && !event.ctrlKey && !event.metaKey && code in ALT_DIGIT_MAP) {
        event.preventDefault()
        onOpenVoucher(ALT_DIGIT_MAP[code])
        return
      }

      // 6. Explicitly ignore plain single-key shortcuts when typing inside inputs
      if (inEditable) {
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [
    onOpenCommandPalette,
    onOpenVoucher,
    onEscape,
    onSubmitActiveForm,
    isFormSubmitEnabled,
  ])
}
```

---

### 11. `frontend/src/components/ui/Kbd.tsx`

```tsx
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface KbdProps {
  children: ReactNode
  variant?: 'default' | 'on-accent'
  className?: string
}

export function Kbd({ children, variant = 'default', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none tracking-wider select-none',
        variant === 'default' &&
          'border border-border-subtle bg-muted text-muted-text',
        variant === 'on-accent' &&
          'border border-accent-foreground/30 bg-accent-foreground/15 text-accent-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
```

---

### 12. `frontend/src/components/ui/Badge.tsx`

```tsx
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Info, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

export interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  icon?: ReactNode | boolean
  className?: string
}

const DEFAULT_ICONS: Record<BadgeVariant, ReactNode> = {
  neutral: <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  danger: <XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  accent: <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-muted text-muted-text border-border-subtle',
  success: 'bg-success-bg text-success border-success/25',
  warning: 'bg-warning-bg text-warning border-warning/30',
  danger: 'bg-danger-bg text-danger border-danger/30',
  accent: 'bg-row-selected text-accent border-accent/25',
}

export function Badge({
  children,
  variant = 'neutral',
  icon = true,
  className,
}: BadgeProps) {
  const renderedIcon = icon === true ? DEFAULT_ICONS[variant] : icon === false ? null : icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-semibold leading-tight tracking-[0.03em] whitespace-nowrap',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {renderedIcon}
      <span>{children}</span>
    </span>
  )
}
```

---

### 13. `frontend/src/components/ui/Button.tsx`

```tsx
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Kbd } from './Kbd'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  shortcut?: string
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground border border-transparent hover:brightness-110 active:brightness-95',
  secondary:
    'bg-surface text-primary-text border border-border-input hover:bg-muted active:bg-row-hover',
  ghost:
    'bg-transparent text-primary-text border border-transparent hover:bg-muted active:bg-row-hover',
  danger:
    'bg-danger-bg text-danger border border-danger/40 hover:bg-danger hover:text-accent-foreground active:brightness-95',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-[var(--control-h)] px-4 text-[14px] gap-2',
}

export function Button({
  ref,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  leftIcon,
  shortcut,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,filter,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out)] cursor-pointer select-none',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {shortcut && !loading ? (
        <Kbd variant={variant === 'primary' ? 'on-accent' : 'default'}>{shortcut}</Kbd>
      ) : null}
    </button>
  )
}
```

---

### 14. `frontend/src/components/ui/Card.tsx`

```tsx
import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>
  padding?: 'none' | 'sm' | 'md'
  loading?: boolean
}

export function Card({
  ref,
  padding = 'md',
  loading = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-md border border-border-subtle bg-surface text-primary-text',
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-5',
        className,
      )}
      {...props}
    >
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading panel">
          <div className="h-3.5 w-28 rounded-sm bg-muted animate-pulse" />
          <div className="h-8 w-44 rounded-sm bg-muted animate-pulse" />
          <div className="h-3.5 w-36 rounded-sm bg-muted animate-pulse" />
        </div>
      ) : (
        children
      )}
    </div>
  )
}

export function CardHeader({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardTitle({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <h2
      className={cn(
        'text-[var(--fs-h2)] font-semibold leading-[1.3] tracking-[-0.015em] text-primary-text',
        className,
      )}
    >
      {children}
    </h2>
  )
}
```

---

### 15. `frontend/src/components/ui/Input.tsx`

```tsx
import { useId, type InputHTMLAttributes, type Ref } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>
  label?: string
  helperText?: string
  error?: string
  numeric?: boolean
  loading?: boolean
  wrapperClassName?: string
}

export function Input({
  ref,
  id,
  label,
  helperText,
  error,
  numeric = false,
  loading = false,
  disabled,
  className,
  wrapperClassName,
  ...props
}: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-msg`

  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      {label ? (
        <label
          htmlFor={inputId}
          className="text-[13px] font-medium leading-[1.4] text-primary-text"
        >
          {label}
        </label>
      ) : null}

      {loading ? (
        <div
          className="h-[var(--control-h)] w-full rounded-sm border border-border-subtle bg-muted animate-pulse"
          aria-busy="true"
        />
      ) : (
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || helperText ? messageId : undefined}
          className={cn(
            'h-[var(--control-h)] w-full rounded-sm border bg-surface px-3 text-[14px] text-primary-text placeholder:text-disabled-text',
            'transition-[border-color,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]',
            'hover:border-border-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-text',
            error ? 'border-danger' : 'border-border-input',
            numeric && 'tabular-mono text-right',
            className,
          )}
          {...props}
        />
      )}

      {error ? (
        <p
          id={messageId}
          role="alert"
          className="flex items-center gap-1.5 text-[12px] font-medium text-danger"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p id={messageId} className="text-[12px] text-muted-text">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}
```

---

### 16. `frontend/src/components/ui/EmptyState.tsx`

```tsx
import type { ReactNode } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border-subtle bg-muted text-muted-text">
        {icon ?? <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />}
      </div>
      <div className="space-y-1">
        <p className="text-[15px] font-semibold text-primary-text">{title}</p>
        <p className="max-w-md text-[13px] text-muted-text">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
```

---

### 17. `frontend/src/components/ui/Drawer.tsx`

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { Kbd } from './Kbd'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  headerExtra?: ReactNode
  footer?: ReactNode
  children: ReactNode
  widthClassName?: string
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  footer,
  children,
  widthClassName = 'w-full sm:max-w-[680px]',
}: DrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const rafId = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(rafId)
      document.body.style.overflow = originalOverflow
      previousFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[var(--z-drawer)] flex justify-end print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-backdrop transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        className={cn(
          'relative z-10 flex h-full flex-col border-l border-border-strong bg-surface text-primary-text shadow-md',
          'transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]',
          widthClassName,
        )}
      >
        {/* Sticky Drawer Header */}
        <div className="shrink-0 border-b border-border-subtle bg-surface px-4 py-3.5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="drawer-title"
                className="text-[var(--fs-h2)] font-semibold leading-[1.3] tracking-[-0.015em] text-primary-text"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 text-[13px] text-muted-text">{subtitle}</p>
              ) : null}
            </div>
            <Button
              ref={closeBtnRef}
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close drawer"
              className="shrink-0 px-2"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <Kbd className="hidden sm:inline-flex">Esc</Kbd>
            </Button>
          </div>
          {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>

        {/* Sticky Footer */}
        {footer ? (
          <div className="shrink-0 border-t border-border-strong bg-surface px-4 py-3.5 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

---

### 18. `frontend/src/components/ui/DataTable.tsx`

```tsx
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
export const dataTableFeatures = tableFeatures({
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
                    {row.getVisibleCells().map((cell) => {
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
```

---

### 19. `frontend/src/components/ui/CommandPalette.tsx`

```tsx
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowRight,
  BookOpen,
  FilePlus2,
  Landmark,
  ReceiptText,
  Search,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  SYNTHETIC_LEDGERS,
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type DayBookVoucher,
  type VoucherType,
} from '../../lib/dummyData'
import { formatCurrency } from '../../lib/format'
import { Kbd } from './Kbd'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  vouchers: DayBookVoucher[]
  onOpenVoucher: (type: VoucherType) => void
  onSelectNav: (navId: string) => void
  onSelectVoucher: (voucher: DayBookVoucher) => void
}

interface PaletteItem {
  id: string
  group: 'Quick Vouchers' | 'Workspaces' | 'Ledgers' | 'Recent Vouchers'
  label: string
  meta: string
  shortcut?: string
  onExecute: () => void
}

const WORKSPACE_COMMANDS = [
  { id: 'dashboard', label: 'Financial Command Center', meta: 'Dashboard · Active' },
  { id: 'vouchers', label: 'Vouchers & Day Book', meta: 'Milestone 2' },
  { id: 'reports', label: 'Trial Balance, P&L & Balance Sheet', meta: 'Milestone 2' },
  { id: 'inventory', label: 'Inventory & FIFO Godowns', meta: 'Milestone 3' },
  { id: 'banking', label: 'Banking & BRS Workbench', meta: 'Milestone 4' },
  { id: 'tax', label: 'GST Returns (GSTR-1/2B/3B) & TDS', meta: 'Milestone 5' },
  { id: 'automation', label: 'Rules, Recurring & OCR Inbox', meta: 'Milestone 7' },
]

export function CommandPalette({
  open,
  onClose,
  vouchers,
  onOpenVoucher,
  onSelectNav,
  onSelectVoucher,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const rafId = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [open])

  const allItems = useMemo<PaletteItem[]>(() => {
    const voucherActions: PaletteItem[] = VOUCHER_TYPE_ORDER.map((type) => {
      const meta = VOUCHER_TYPE_META[type]
      return {
        id: `action-${type}`,
        group: 'Quick Vouchers',
        label: `New ${meta.label} Voucher`,
        meta: `${meta.prefix}xxxx · ${meta.backupChord}`,
        shortcut: meta.shortKey,
        onExecute: () => {
          onClose()
          onOpenVoucher(type)
        },
      }
    })

    const navItems: PaletteItem[] = WORKSPACE_COMMANDS.map((ws) => ({
      id: `nav-${ws.id}`,
      group: 'Workspaces',
      label: ws.label,
      meta: ws.meta,
      onExecute: () => {
        onClose()
        onSelectNav(ws.id)
      },
    }))

    const ledgerItems: PaletteItem[] = SYNTHETIC_LEDGERS.slice(0, 8).map((l) => ({
      id: `ledger-${l.code}`,
      group: 'Ledgers',
      label: `${l.code} · ${l.name}`,
      meta: `${l.group} (${l.currency})`,
      onExecute: () => {
        onClose()
        onSelectNav('reports')
      },
    }))

    const recentVoucherItems: PaletteItem[] = vouchers.slice(0, 6).map((v) => {
      const amount = v.debit !== '0.0000' ? v.debit : v.credit
      return {
        id: `voucher-${v.id}`,
        group: 'Recent Vouchers',
        label: `${v.voucherNo} — ${v.particulars}`,
        meta: `${v.voucherType} · ${formatCurrency(amount, { currency: 'INR' })}`,
        onExecute: () => {
          onClose()
          onSelectVoucher(v)
        },
      }
    })

    return [...voucherActions, ...navItems, ...ledgerItems, ...recentVoucherItems]
  }, [vouchers, onClose, onOpenVoucher, onSelectNav, onSelectVoucher])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.meta.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q),
    )
  }, [allItems, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) =>
        filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length,
      )
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault()
      filtered[activeIndex].onExecute()
    }
  }

  const groupIcon = (group: PaletteItem['group']) => {
    switch (group) {
      case 'Quick Vouchers':
        return <FilePlus2 className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
      case 'Workspaces':
        return <Landmark className="h-4 w-4 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
      case 'Ledgers':
        return <BookOpen className="h-4 w-4 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
      case 'Recent Vouchers':
        return <ReceiptText className="h-4 w-4 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
    }
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-palette)] flex items-start justify-center px-4 pt-16 sm:pt-24 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Go-To Command Palette"
    >
      <div
        className="fixed inset-0 bg-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[600px] overflow-hidden rounded-lg border border-border-strong bg-surface shadow-md">
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go To voucher, ledger, report, or shortcut (e.g. Sales, HDFC, GSTR-1)..."
            aria-label="Go-To command search"
            className="w-full bg-transparent text-[14px] text-primary-text placeholder:text-disabled-text focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted-text">
              No matching command, ledger, or voucher for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <ul role="listbox" className="space-y-0.5">
              {filtered.map((item, idx) => {
                const isActive = idx === activeIndex
                const prevGroup = idx > 0 ? filtered[idx - 1].group : null
                const showGroupHeader = item.group !== prevGroup

                return (
                  <li key={item.id}>
                    {showGroupHeader ? (
                      <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                        {item.group}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={item.onExecute}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-[var(--dur-fast)] cursor-pointer',
                        isActive
                          ? 'bg-row-selected text-primary-text shadow-[inset_2px_0_0_0_var(--accent-primary)]'
                          : 'text-primary-text hover:bg-row-hover',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {groupIcon(item.group)}
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium">{item.label}</p>
                          <p className="truncate text-[12px] text-muted-text">{item.meta}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-muted px-4 py-2 text-[11px] text-muted-text">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Enter</Kbd> Open
            </span>
          </div>
          <span>Tally Go-To Engine · Alt+G</span>
        </div>
      </div>
    </div>
  )
}
```

---

### 20. `frontend/src/components/layout/AppShell.tsx`

```tsx
import { useState, type ReactNode } from 'react'
import {
  BarChart3,
  Bot,
  Building2,
  FileCheck2,
  FileText,
  Landmark,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { COMPANY_PROFILE, type VoucherType } from '../../lib/dummyData'
import type { ThemeMode } from '../../hooks/useTheme'
import { Button } from '../ui/Button'
import { Kbd } from '../ui/Kbd'

export interface NavItem {
  id: string
  label: string
  milestoneTag?: string
  icon: ReactNode
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'vouchers',
    label: 'Vouchers',
    milestoneTag: 'M2',
    icon: <FileText className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'reports',
    label: 'Reports',
    milestoneTag: 'M2',
    icon: <BarChart3 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    milestoneTag: 'M3',
    icon: <Package className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'banking',
    label: 'Banking & BRS',
    milestoneTag: 'M4',
    icon: <Landmark className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'tax',
    label: 'GST & Tax',
    milestoneTag: 'M5',
    icon: <FileCheck2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'automation',
    label: 'Automation',
    milestoneTag: 'M7',
    icon: <Bot className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
]

export interface AppShellProps {
  activeNav: string
  onSelectNav: (id: string) => void
  theme: ThemeMode
  onToggleTheme: () => void
  onOpenCommandPalette: () => void
  onOpenVoucher: (type: VoucherType) => void
  mobileNavOpen: boolean
  onSetMobileNavOpen: (open: boolean) => void
  children: ReactNode
}

export function AppShell({
  activeNav,
  onSelectNav,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenVoucher,
  mobileNavOpen,
  onSetMobileNavOpen,
  children,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const renderNavList = (isMobile: boolean) => (
    <nav aria-label="Primary Workspace Navigation" className="flex-1 space-y-1 px-2.5 py-3">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === activeNav
        const showLabel = isMobile || !sidebarCollapsed

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onSelectNav(item.id)
              if (isMobile) onSetMobileNavOpen(false)
            }}
            title={!showLabel ? item.label : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-[var(--control-h)] w-full items-center rounded-md px-3 text-[14px] font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] cursor-pointer',
              showLabel ? 'justify-between gap-2.5' : 'justify-center',
              isActive
                ? 'bg-muted text-primary-text shadow-[inset_3px_0_0_0_var(--accent-primary)]'
                : 'text-muted-text hover:bg-row-hover hover:text-primary-text',
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={cn(isActive ? 'text-accent' : 'text-muted-text')}>
                {item.icon}
              </span>
              {showLabel ? <span className="truncate">{item.label}</span> : null}
            </span>

            {showLabel && item.milestoneTag ? (
              <span className="rounded-sm border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-text">
                {item.milestoneTag}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen bg-canvas text-primary-text flex">
      {/* Desktop Collapsible Sidebar (240px expanded / 68px collapsed) */}
      <aside
        className={cn(
          'hidden lg:flex lg:flex-col lg:shrink-0 border-r border-border-subtle bg-surface transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)] print:hidden',
          sidebarCollapsed ? 'w-[68px]' : 'w-[240px]',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border-subtle px-3.5">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono text-[13px] font-bold">
                LP
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold tracking-[-0.02em] text-primary-text">
                  LedgerPrime
                </p>
                <p className="truncate font-mono text-[11px] text-muted-text">
                  v1.0 · Books
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono text-[13px] font-bold">
              LP
            </div>
          )}

          {!sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-primary-text cursor-pointer"
            >
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>

        {sidebarCollapsed ? (
          <div className="flex justify-center border-b border-border-subtle py-2">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expand sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-primary-text cursor-pointer"
            >
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        ) : null}

        {renderNavList(false)}

        {!sidebarCollapsed ? (
          <div className="border-t border-border-subtle p-3.5">
            <div className="rounded-md border border-border-subtle bg-canvas p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                GSTIN · Synthetic
              </p>
              <p className="mt-0.5 font-mono text-[12px] font-medium text-primary-text">
                {COMPANY_PROFILE.gstin}
              </p>
              <p className="mt-1 text-[11px] text-muted-text">
                {COMPANY_PROFILE.stateLabel}
              </p>
            </div>
          </div>
        ) : null}
      </aside>

      {/* Mobile Slide-Over Sidebar Drawer (390px viewport safe) */}
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-[var(--z-drawer)] flex lg:hidden print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          <div
            className="fixed inset-0 bg-backdrop"
            onClick={() => onSetMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex h-full w-[264px] max-w-[82vw] flex-col border-r border-border-strong bg-surface shadow-md">
            <div className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono text-[13px] font-bold">
                  LP
                </div>
                <span className="font-display text-[15px] font-bold text-primary-text">
                  LedgerPrime
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSetMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-10 w-10 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-primary-text cursor-pointer"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            {renderNavList(true)}
            <div className="border-t border-border-subtle p-4">
              <p className="text-[12px] font-semibold text-primary-text">
                {COMPANY_PROFILE.legalName}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-text">
                {COMPANY_PROFILE.fiscalYear} · {COMPANY_PROFILE.gstin}
              </p>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky 56px Topbar */}
        <header className="sticky top-0 z-[var(--z-topbar)] flex h-14 items-center justify-between gap-2 border-b border-border-subtle bg-surface px-4 lg:px-6 print:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => onSetMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border-input text-primary-text hover:bg-muted lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>

            {/* Company & Fiscal Year Pill */}
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border-subtle bg-canvas px-2.5 py-1.5">
              <Building2 className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate text-[13px] font-semibold text-primary-text max-w-[132px] sm:max-w-[260px] md:max-w-none">
                {COMPANY_PROFILE.legalName}
              </span>
              <span className="hidden sm:inline text-border-strong" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline shrink-0 font-mono text-[12px] font-semibold text-muted-text">
                {COMPANY_PROFILE.fiscalYear}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Alt+G Go-To Search Bar Button */}
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="Open Go-To command palette (Alt+G)"
              className="flex h-[var(--control-h)] items-center gap-2 rounded-md border border-border-input bg-surface px-2.5 sm:px-3 text-[13px] text-muted-text hover:bg-muted hover:text-primary-text transition-colors duration-[var(--dur-fast)] cursor-pointer"
            >
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden md:inline">Go To ledger, voucher...</span>
              <Kbd className="hidden sm:inline-flex">Alt+G</Kbd>
            </button>

            {/* Light / Dark Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="flex h-[var(--control-h)] w-[var(--control-h)] shrink-0 items-center justify-center rounded-md border border-border-input bg-surface text-primary-text hover:bg-muted transition-colors duration-[var(--dur-fast)] cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>

            {/* Primary CTA: + New Voucher (F8) */}
            <Button
              variant="primary"
              onClick={() => onOpenVoucher('SALES')}
              leftIcon={<Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
              shortcut="F8"
              className="px-3 sm:px-4"
            >
              <span className="hidden sm:inline">New Voucher</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </header>

        {/* Print-Only Formal Statutory Letterhead */}
        <div className="hidden print:block border-b-2 border-border-strong px-2 pb-3 mb-4">
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="text-[18px] font-bold text-primary-text">
                {COMPANY_PROFILE.legalName}
              </h1>
              <p className="font-mono text-[12px] text-muted-text">
                GSTIN: {COMPANY_PROFILE.gstin} · {COMPANY_PROFILE.stateLabel}
              </p>
            </div>
            <div className="text-right font-mono text-[12px] text-muted-text">
              <p>{COMPANY_PROFILE.fiscalYear}</p>
              <p>Period: {COMPANY_PROFILE.periodLabel}</p>
            </div>
          </div>
        </div>

        {/* Workspace Canvas (Max 1360px) */}
        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}

```

---

### 21. `frontend/src/features/dashboard/QuickVoucherDrawer.tsx`

```tsx
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  absBigInt,
  DECIMAL_INPUT_REGEX,
  fromScaledInt,
  toScaledInt,
} from '../../lib/decimal'
import { formatCurrency } from '../../lib/format'
import {
  SYNTHETIC_LEDGERS,
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type DayBookVoucher,
  type VoucherType,
} from '../../lib/dummyData'
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
    voucherNo: z.string().trim().min(1, 'Voucher # is required').max(40),
    referenceNo: z.string().trim().max(64).optional(),
    narration: z.string().trim().min(1, 'Narration is required').max(255),
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
  nextSequenceNumber: number
  onChangeVoucherType: (type: VoucherType) => void
  onClose: () => void
  onPostVoucher: (voucher: DayBookVoucher) => void
}

function buildVoucherNo(type: VoucherType, seq: number): string {
  return `${VOUCHER_TYPE_META[type].prefix}${String(seq).padStart(4, '0')}`
}

export function QuickVoucherDrawer({
  open,
  voucherType,
  nextSequenceNumber,
  onChangeVoucherType,
  onClose,
  onPostVoucher,
}: QuickVoucherDrawerProps) {
  const meta = VOUCHER_TYPE_META[voucherType]

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<QuickVoucherInput, unknown, QuickVoucherOutput>({
    resolver: zodResolver(quickVoucherSchema),
    mode: 'onChange',
    defaultValues: {
      voucherDate: '2026-11-26',
      voucherNo: buildVoucherNo(voucherType, nextSequenceNumber),
      referenceNo: '',
      narration: '',
      lines: [
        { accountCode: meta.defaultDebitCode, debit: '', credit: '' },
        { accountCode: meta.defaultCreditCode, debit: '', credit: '' },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const watchedLines = useWatch({ control, name: 'lines' }) ?? []

  // Sync voucher number & default accounts cleanly when opening or switching F4–F9 tabs
  useEffect(() => {
    if (!open) return
    const typeMeta = VOUCHER_TYPE_META[voucherType]
    const hasAnyAmounts = watchedLines.some(
      (l) => toScaledInt(l?.debit) > 0n || toScaledInt(l?.credit) > 0n,
    )

    if (!hasAnyAmounts) {
      reset({
        voucherDate: '2026-11-26',
        voucherNo: buildVoucherNo(voucherType, nextSequenceNumber),
        referenceNo: '',
        narration: '',
        lines: [
          { accountCode: typeMeta.defaultDebitCode, debit: '', credit: '' },
          { accountCode: typeMeta.defaultCreditCode, debit: '', credit: '' },
        ],
      })
    } else {
      setValue('voucherNo', buildVoucherNo(voucherType, nextSequenceNumber), {
        shouldValidate: true,
      })
    }
    // Intentionally triggers on drawer open or voucherType switch only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voucherType, nextSequenceNumber])

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

  const ledgerByCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const ledger of SYNTHETIC_LEDGERS) {
      map.set(ledger.code, ledger.name)
    }
    return map
  }, [])

  const onSubmit = (data: QuickVoucherOutput) => {
    const normalizedLines = data.lines.map((ln) => ({
      accountCode: ln.accountCode,
      accountName: ledgerByCode.get(ln.accountCode) ?? ln.accountCode,
      debit: fromScaledInt(toScaledInt(ln.debit), 4),
      credit: fromScaledInt(toScaledInt(ln.credit), 4),
    }))

    const totalBase = fromScaledInt(totalDebit, 4)
    const primaryLine = normalizedLines[0]
    const isCreditRegisterType = voucherType === 'PURCHASE' || voucherType === 'PAYMENT'
    const isDualSidedRegisterType = voucherType === 'JOURNAL' || voucherType === 'CONTRA'

    const newVoucher: DayBookVoucher = {
      id: `v-local-${Date.now()}`,
      voucherDate: data.voucherDate,
      voucherNo: data.voucherNo,
      voucherType,
      particulars: primaryLine?.accountName ?? 'Manual Entry',
      narration: data.narration,
      referenceNo: data.referenceNo || undefined,
      currency: 'INR',
      debit: isDualSidedRegisterType
        ? totalBase
        : isCreditRegisterType
          ? '0.0000'
          : totalBase,
      credit: isDualSidedRegisterType
        ? totalBase
        : isCreditRegisterType
          ? totalBase
          : '0.0000',
      lifecycleStatus: 'POSTED',
      complianceStatus: 'MATCHED',
      complianceLabel: 'Posted · Local',
      lines: normalizedLines,
    }

    onPostVoucher(newVoucher)
    reset({
      voucherDate: '2026-11-26',
      voucherNo: buildVoucherNo(voucherType, nextSequenceNumber + 1),
      referenceNo: '',
      narration: '',
      lines: [
        { accountCode: meta.defaultDebitCode, debit: '', credit: '' },
        { accountCode: meta.defaultCreditCode, debit: '', credit: '' },
      ],
    })
    onClose()
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
      onClose={onClose}
      title={`${meta.label} Voucher Entry`}
      subtitle={`Double-entry zero-float validation · Switch type with F4–F9 or Alt+4–9`}
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
                onClick={() => onChangeVoucherType(type)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-[var(--dur-fast)] cursor-pointer',
                  active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border-input bg-surface text-primary-text hover:bg-muted',
                )}
              >
                <span>{item.label}</span>
                <Kbd variant={active ? 'on-accent' : 'default'}>{item.shortKey}</Kbd>
              </button>
            )
          })}
        </div>
      }
      footer={
        <div className="space-y-3">
          {/* Live Scaled BigInt Totals Strip */}
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

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={QUICK_VOUCHER_FORM_ID}
              variant="primary"
              loading={isSubmitting}
              disabled={!isBalanced}
              title={saveDisabledReason}
              shortcut="Ctrl+Enter"
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
        {/* Header Metadata */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Input
            label="Voucher Date"
            type="date"
            error={errors.voucherDate?.message}
            {...register('voucherDate')}
          />
          <Input
            label="Voucher #"
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

        {/* Dynamic Double-Entry Lines */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[var(--fs-h3)] font-semibold text-primary-text">
              Ledger Entries (Dr / Cr)
            </h3>
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
            {/* Desktop Column Header */}
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
                      aria-invalid={lineErr?.accountCode ? true : undefined}
                      {...register(`lines.${index}.accountCode`)}
                      className={cn(
                        'h-[var(--control-h)] w-full rounded-sm border bg-surface px-2.5 text-[13px] text-primary-text',
                        lineErr?.accountCode ? 'border-danger' : 'border-border-input',
                      )}
                    >
                      <option value="">Select ledger...</option>
                      {SYNTHETIC_LEDGERS.map((ledger) => (
                        <option key={ledger.code} value={ledger.code}>
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
              className="flex items-center gap-1.5 rounded-md border border-danger/35 bg-danger-bg px-3 py-2 text-[12px] font-medium text-danger"
            >
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{errors.lines.root.message}</span>
            </p>
          ) : null}
        </div>

        {/* Narration */}
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

```

---

### 22. `frontend/src/features/dashboard/FinancialCommandPage.tsx`

```tsx
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Keyboard,
  Landmark,
  Printer,
  Rows3,
  Rows4,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { toScaledInt } from '../../lib/decimal'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
} from '../../lib/format'
import {
  BASE_FINANCIAL_KPIS,
  COMPANY_PROFILE,
  COMPLIANCE_SNAPSHOT,
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type ComplianceReconStatus,
  type DayBookVoucher,
  type VoucherType,
} from '../../lib/dummyData'
import { Badge, type BadgeVariant } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
  type TableDensity,
} from '../../components/ui/DataTable'
import { Kbd } from '../../components/ui/Kbd'

export interface FinancialCommandPageProps {
  vouchers: DayBookVoucher[]
  selectedVoucherId: string | null
  onSelectVoucher: (voucher: DayBookVoucher | null) => void
  onOpenVoucher: (type: VoucherType) => void
}

type VoucherFilter = 'ALL' | VoucherType

const FILTER_PILLS: Array<{ id: VoucherFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'SALES', label: 'Sales' },
  { id: 'PURCHASE', label: 'Purchase' },
  { id: 'PAYMENT', label: 'Payment' },
  { id: 'RECEIPT', label: 'Receipt' },
  { id: 'JOURNAL', label: 'Journal' },
  { id: 'CONTRA', label: 'Contra' },
]

function getComplianceBadgeVariant(status: ComplianceReconStatus): BadgeVariant {
  switch (status) {
    case 'MATCHED':
    case 'RECONCILED':
    case 'E_INVOICE_IRN':
      return 'success'
    case 'PENDING_BRS':
    case 'POST_DATED':
      return 'warning'
    case 'GSTR2B_MISMATCH':
      return 'danger'
    case 'CANCELLED':
      return 'neutral'
  }
}

function getComplianceIcon(status: ComplianceReconStatus) {
  switch (status) {
    case 'MATCHED':
    case 'RECONCILED':
    case 'E_INVOICE_IRN':
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
    case 'PENDING_BRS':
    case 'POST_DATED':
      return <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
    case 'GSTR2B_MISMATCH':
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
    case 'CANCELLED':
      return <XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
  }
}

export function FinancialCommandPage({
  vouchers,
  selectedVoucherId,
  onSelectVoucher,
  onOpenVoucher,
}: FinancialCommandPageProps) {
  const [activeFilter, setActiveFilter] = useState<VoucherFilter>('ALL')
  const [density, setDensity] = useState<TableDensity>('comfortable')

  const filteredVouchers = useMemo(() => {
    if (activeFilter === 'ALL') return vouchers
    return vouchers.filter((v) => v.voucherType === activeFilter)
  }, [vouchers, activeFilter])

  // Compute Day Book totals strictly over POSTED vouchers (excludes CANCELLED & POST_DATED per DESIGN_SYSTEM §8.8)
  const { totalDebit, totalCredit, excludedCount } = useMemo(() => {
    let dr = 0n
    let cr = 0n
    let excluded = 0
    for (const v of filteredVouchers) {
      if (v.lifecycleStatus !== 'POSTED') {
        excluded += 1
        continue
      }
      dr += toScaledInt(v.debit)
      cr += toScaledInt(v.credit)
    }
    return { totalDebit: dr, totalCredit: cr, excludedCount: excluded }
  }, [filteredVouchers])

  // Dynamically reflect newly posted local session vouchers in Cash & AR/AP KPIs using exact BigInt
  const kpiFigures = useMemo(() => {
    let cash = toScaledInt(BASE_FINANCIAL_KPIS.cashAndBank)
    let ar = toScaledInt(BASE_FINANCIAL_KPIS.sundryReceivables)
    let ap = toScaledInt(BASE_FINANCIAL_KPIS.sundryPayables)

    for (const v of vouchers) {
      if (!v.id.startsWith('v-local-') || v.lifecycleStatus !== 'POSTED') continue
      for (const ln of v.lines) {
        const netDr = toScaledInt(ln.debit) - toScaledInt(ln.credit)
        if (ln.accountCode === '1001' || ln.accountCode === '1010' || ln.accountCode === '1012') {
          cash += netDr
        } else if (ln.accountCode.startsWith('11')) {
          ar += netDr
        } else if (ln.accountCode.startsWith('20')) {
          ap -= netDr
        }
      }
    }

    return {
      cashAndBank: formatCurrency(cash, { currency: 'INR' }),
      sundryReceivables: formatCurrency(ar, { currency: 'INR' }),
      sundryPayables: formatCurrency(ap, { currency: 'INR' }),
      netGstItc: formatCurrency(BASE_FINANCIAL_KPIS.netGstItcSurplus, { currency: 'INR' }),
    }
  }, [vouchers])

  const selectedVoucher = useMemo(
    () => vouchers.find((v) => v.id === selectedVoucherId) ?? null,
    [vouchers, selectedVoucherId],
  )

  const columns = useMemo<DataTableColumnDef<DayBookVoucher>[]>(
    () => [
      {
        accessorKey: 'voucherDate',
        header: 'Date',
        meta: { align: 'left', minWidth: '108px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          return (
            <span
              className={cn(
                'whitespace-nowrap text-[13px] text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatDisplayDate(row.original.voucherDate)}
            </span>
          )
        },
      },
      {
        accessorKey: 'voucherNo',
        header: 'Voucher #',
        meta: { align: 'left', mono: true, minWidth: '146px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          return (
            <span
              className={cn(
                'tabular-mono whitespace-nowrap text-[13px] font-medium text-primary-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {row.original.voucherNo}
            </span>
          )
        },
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars',
        meta: { align: 'left', minWidth: '240px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const v = row.original
          const cancelled = v.lifecycleStatus === 'CANCELLED'
          return (
            <div className="min-w-0 max-w-[300px]">
              <div className="flex items-center gap-1.5">
                <p
                  title={v.particulars}
                  className={cn(
                    'truncate font-medium text-primary-text',
                    cancelled && 'line-through text-disabled-text',
                  )}
                >
                  {v.particulars}
                </p>
                {v.currency !== 'INR' && v.foreignAmount ? (
                  <span
                    title={`FX Rate: 1 ${v.currency} = ₹${v.exchangeRate}`}
                    className="shrink-0 rounded-sm border border-border-subtle bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-text"
                  >
                    {v.currency} {formatCurrency(v.foreignAmount, { currency: v.currency, showSymbol: false })}
                  </span>
                ) : null}
              </div>
              <p
                title={v.narration}
                className="truncate text-[12px] text-muted-text"
              >
                {v.narration}
              </p>
            </div>
          )
        },
      },
      {
        accessorKey: 'voucherType',
        header: 'Type',
        meta: { align: 'left', minWidth: '96px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const meta = VOUCHER_TYPE_META[row.original.voucherType]
          return (
            <Badge variant="neutral" icon={false}>
              {meta.label}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'debit',
        header: 'Debit (₹)',
        meta: { align: 'right', mono: true, minWidth: '132px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          const formatted = formatBookAmountCell(row.original.debit, 'INR')
          return (
            <span
              aria-label={formatted.isNil ? 'nil' : `${formatted.text} rupees debit`}
              className={cn(
                'tabular-mono whitespace-nowrap',
                formatted.isNil ? 'text-disabled-text' : 'text-primary-text font-medium',
                cancelled && !formatted.isNil && 'line-through text-disabled-text',
              )}
            >
              {formatted.text}
            </span>
          )
        },
      },
      {
        accessorKey: 'credit',
        header: 'Credit (₹)',
        meta: {
          align: 'right',
          mono: true,
          minWidth: '132px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.lifecycleStatus === 'CANCELLED'
          const formatted = formatBookAmountCell(row.original.credit, 'INR')
          return (
            <span
              aria-label={formatted.isNil ? 'nil' : `${formatted.text} rupees credit`}
              className={cn(
                'tabular-mono whitespace-nowrap',
                formatted.isNil ? 'text-disabled-text' : 'text-primary-text font-medium',
                cancelled && !formatted.isNil && 'line-through text-disabled-text',
              )}
            >
              {formatted.text}
            </span>
          )
        },
      },
      {
        accessorKey: 'complianceLabel',
        header: 'Status',
        meta: { align: 'center', minWidth: '136px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <Badge
            variant={getComplianceBadgeVariant(row.original.complianceStatus)}
            icon={getComplianceIcon(row.original.complianceStatus)}
          >
            {row.original.complianceLabel}
          </Badge>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-text">
            {COMPANY_PROFILE.periodLabel} · Books Open · {COMPANY_PROFILE.fiscalYear}
          </p>
          <h1 className="mt-1 text-[var(--fs-h1)] font-semibold leading-[1.25] tracking-[-0.02em] text-primary-text">
            Financial Command Center
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
          >
            Print A4
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenVoucher('PAYMENT')}
            shortcut="F5"
          >
            Payment
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenVoucher('RECEIPT')}
            shortcut="F6"
          >
            Receipt
          </Button>
        </div>
      </div>

      {/* 4-Card Financial KPI Strip */}
      <section aria-label="Key Financial Balances" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-text">
            Cash &amp; Bank Balance
          </p>
          <p className="mt-2 tabular-ledger text-[var(--fs-kpi)] font-bold leading-[1.15] tracking-[-0.025em] text-primary-text">
            {kpiFigures.cashAndBank}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-success">
            <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span>{BASE_FINANCIAL_KPIS.cashAndBankDelta}</span>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-text">
            Sundry Receivables
          </p>
          <p className="mt-2 tabular-ledger text-[var(--fs-kpi)] font-bold leading-[1.15] tracking-[-0.025em] text-primary-text">
            {kpiFigures.sundryReceivables}
          </p>
          <div className="mt-2.5">
            <Badge variant="warning">{BASE_FINANCIAL_KPIS.receivablesNote}</Badge>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-text">
            Sundry Payables
          </p>
          <p className="mt-2 tabular-ledger text-[var(--fs-kpi)] font-bold leading-[1.15] tracking-[-0.025em] text-primary-text">
            {kpiFigures.sundryPayables}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-muted-text">
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{BASE_FINANCIAL_KPIS.payablesNote}</span>
          </div>
        </Card>

        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-text">
            Net GST / ITC Position
          </p>
          <p className="mt-2 tabular-ledger text-[var(--fs-kpi)] font-bold leading-[1.15] tracking-[-0.025em] text-primary-text">
            {kpiFigures.netGstItc}
          </p>
          <div className="mt-2.5">
            <Badge variant="success">{BASE_FINANCIAL_KPIS.gstPositionNote}</Badge>
          </div>
        </Card>
      </section>

      {/* Main 12-Column Split: Day Book (8) + Compliance Snapshot (4) */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        {/* Left: Recent Vouchers & Day Book */}
        <div className="xl:col-span-8 space-y-4 min-w-0">
          <Card padding="none">
            <CardHeader>
              <div>
                <CardTitle>Recent Vouchers &amp; Day Book</CardTitle>
                <p className="mt-0.5 text-[13px] text-muted-text">
                  Click any voucher or use <Kbd>↑</Kbd> <Kbd>↓</Kbd> + <Kbd>Enter</Kbd> to inspect double-entry legs.
                </p>
              </div>

              {/* Density Toggle */}
              <div className="flex items-center gap-1 rounded-md border border-border-subtle bg-canvas p-1 print:hidden">
                <button
                  type="button"
                  onClick={() => setDensity('comfortable')}
                  aria-pressed={density === 'comfortable'}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-medium cursor-pointer',
                    density === 'comfortable'
                      ? 'bg-surface text-primary-text shadow-sm'
                      : 'text-muted-text hover:text-primary-text',
                  )}
                >
                  <Rows3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Comfort</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  aria-pressed={density === 'compact'}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-medium cursor-pointer',
                    density === 'compact'
                      ? 'bg-surface text-primary-text shadow-sm'
                      : 'text-muted-text hover:text-primary-text',
                  )}
                >
                  <Rows4 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Tally</span>
                </button>
              </div>
            </CardHeader>

            {/* Voucher Type Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 px-5 py-3 print:hidden">
              {FILTER_PILLS.map((pill) => {
                const active = pill.id === activeFilter
                const count =
                  pill.id === 'ALL'
                    ? vouchers.length
                    : vouchers.filter((v) => v.voucherType === pill.id).length

                return (
                  <button
                    key={pill.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveFilter(pill.id)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[12px] font-medium transition-colors duration-[var(--dur-fast)] cursor-pointer',
                      active
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border-subtle bg-canvas text-muted-text hover:bg-muted hover:text-primary-text',
                    )}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={cn(
                        'tabular-mono text-[11px]',
                        active ? 'text-accent-foreground/85' : 'text-disabled-text',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            <DataTable
              ariaLabel="Recent Vouchers and Day Book"
              data={filteredVouchers}
              columns={columns}
              density={density}
              selectedRowId={selectedVoucherId}
              getRowId={(row) => row.id}
              onRowActivate={(row) =>
                onSelectVoucher(row.id === selectedVoucherId ? null : row)
              }
              emptyTitle={`No ${activeFilter === 'ALL' ? '' : activeFilter.toLowerCase() + ' '}vouchers found`}
              emptyDescription="Post a balanced voucher using F4–F9 or clear your active filter."
              emptyAction={
                <Button variant="primary" onClick={() => onOpenVoucher('SALES')} shortcut="F8">
                  Create Voucher
                </Button>
              }
              footer={
                <tr>
                  <td
                    colSpan={4}
                    className="border-t-2 border-border-strong px-3 py-2.5 text-[13px] font-bold text-primary-text"
                  >
                    Posted Register Totals ({filteredVouchers.length - excludedCount} active
                    {excludedCount > 0 ? ` · ${excludedCount} excluded` : ''})
                  </td>
                  <td className="grand-total-cell px-3 py-2.5 text-right tabular-mono text-[13px] font-bold text-primary-text whitespace-nowrap">
                    {formatCurrency(totalDebit, { currency: 'INR', showSymbol: false })}
                  </td>
                  <td className="grand-total-cell border-l border-border-subtle px-3 py-2.5 text-right tabular-mono text-[13px] font-bold text-primary-text whitespace-nowrap">
                    {formatCurrency(totalCredit, { currency: 'INR', showSymbol: false })}
                  </td>
                  <td className="border-t-2 border-border-strong px-3 py-2.5 text-center text-[11px] font-medium text-muted-text">
                    INR (₹)
                  </td>
                </tr>
              }
            />

            {excludedCount > 0 ? (
              <div className="border-t border-border-subtle bg-canvas px-5 py-2.5 text-[12px] text-muted-text">
                Note: Cancelled and post-dated vouchers remain visible for audit &amp; GSTR-1 Table 13 numbering continuity, and are automatically excluded from Posted Register Totals.
              </div>
            ) : null}
          </Card>

          {/* Inline Double-Entry Leg Inspector when a Voucher Row is Selected */}
          {selectedVoucher ? (
            <Card padding="none">
              <CardHeader className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <h3 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                    Voucher Drill-Down: <span className="tabular-mono">{selectedVoucher.voucherNo}</span>
                  </h3>
                  <Badge
                    variant={getComplianceBadgeVariant(selectedVoucher.complianceStatus)}
                    icon={getComplianceIcon(selectedVoucher.complianceStatus)}
                  >
                    {selectedVoucher.complianceLabel}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onSelectVoucher(null)}>
                  Close Inspector
                </Button>
              </CardHeader>

              <div className="px-5 py-3.5 space-y-3">
                <p className="text-[13px] text-muted-text">
                  <span className="font-semibold text-primary-text">Narration: </span>
                  {selectedVoucher.narration}
                </p>

                <div className="table-scroll rounded-md border border-border-subtle">
                  <table className="w-full min-w-[460px] border-collapse text-[13px]">
                    <thead className="bg-table-header">
                      <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase tracking-[0.03em] text-muted-text">
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Ledger Account</th>
                        <th className="px-3 py-2 text-right">Debit (₹)</th>
                        <th className="border-l border-border-subtle px-3 py-2 text-right">
                          Credit (₹)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVoucher.lines.map((line, idx) => {
                        const dr = formatBookAmountCell(line.debit, 'INR')
                        const cr = formatBookAmountCell(line.credit, 'INR')
                        return (
                          <tr
                            key={`${selectedVoucher.id}-ln-${idx}`}
                            className="border-b border-border-subtle last:border-b-0"
                          >
                            <td className="px-3 py-2 tabular-mono text-muted-text">
                              {line.accountCode}
                            </td>
                            <td className="px-3 py-2 font-medium text-primary-text">
                              {line.accountName}
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right tabular-mono',
                                dr.isNil ? 'text-disabled-text' : 'text-primary-text',
                              )}
                            >
                              {dr.text}
                            </td>
                            <td
                              className={cn(
                                'border-l border-border-subtle px-3 py-2 text-right tabular-mono',
                                cr.isNil ? 'text-disabled-text' : 'text-primary-text',
                              )}
                            >
                              {cr.text}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        {/* Right: Compliance & Reconciliation Snapshot Panel */}
        <aside className="xl:col-span-4 space-y-4 min-w-0">
          {/* Bank Reconciliation Snapshot */}
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                  Bank Reconciliation (BRS)
                </h2>
              </div>
              <Badge variant="warning">
                {COMPLIANCE_SNAPSHOT.unreconciledBankLines} Pending
              </Badge>
            </div>

            <p className="mt-1 text-[12px] text-muted-text">
              {COMPLIANCE_SNAPSHOT.bankAccountLabel}
            </p>

            <div className="mt-3.5 grid grid-cols-2 gap-3 rounded-md border border-border-subtle bg-canvas p-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-text">
                  Unreconciled Lines
                </p>
                <p className="mt-0.5 tabular-mono text-[20px] font-bold text-primary-text">
                  {COMPLIANCE_SNAPSHOT.unreconciledBankLines}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-text">
                  Net Timing Diff
                </p>
                <p className="mt-0.5 tabular-mono text-[15px] font-bold text-primary-text">
                  {formatCurrency(COMPLIANCE_SNAPSHOT.unreconciledNetVariance, {
                    currency: 'INR',
                    negativeStyle: 'parens',
                  })}
                </p>
              </div>
            </div>

            <p className="mt-2.5 text-[11px] text-muted-text">
              Last CSV import: <span className="tabular-mono">{COMPLIANCE_SNAPSHOT.lastBankSync}</span>
            </p>
          </Card>

          {/* GSTR-2B Match % Progress Bar */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-success" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                  GSTR-2B &amp; IMS Match
                </h2>
              </div>
              <span className="tabular-mono text-[14px] font-bold text-success">
                {COMPLIANCE_SNAPSHOT.gstr2bMatchPercent.toFixed(1)}%
              </span>
            </div>

            <div
              role="progressbar"
              aria-label="GSTR-2B ITC Reconciliation Match Percentage"
              aria-valuenow={COMPLIANCE_SNAPSHOT.gstr2bMatchPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${COMPLIANCE_SNAPSHOT.gstr2bMatchPercent}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-sm border border-border-subtle bg-canvas px-2 py-1.5">
                <p className="tabular-mono text-[14px] font-bold text-primary-text">
                  {COMPLIANCE_SNAPSHOT.gstr2bMatchedCount}/{COMPLIANCE_SNAPSHOT.gstr2bTotalCount}
                </p>
                <p className="text-[11px] text-muted-text">Exact Match</p>
              </div>
              <div className="rounded-sm border border-border-subtle bg-canvas px-2 py-1.5">
                <p className="tabular-mono text-[14px] font-bold text-warning">
                  {COMPLIANCE_SNAPSHOT.gstr2bMismatchCount}
                </p>
                <p className="text-[11px] text-muted-text">Variance</p>
              </div>
              <div className="rounded-sm border border-border-subtle bg-canvas px-2 py-1.5">
                <p className="tabular-mono text-[14px] font-bold text-danger">
                  {COMPLIANCE_SNAPSHOT.gstr2bMissingCount}
                </p>
                <p className="text-[11px] text-muted-text">Missing 2B</p>
              </div>
            </div>
          </Card>

          {/* Upcoming Statutory Due Dates */}
          <Card>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <h2 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                Statutory Compliance Calendar
              </h2>
            </div>

            <ul className="mt-3 divide-y divide-border-subtle">
              {COMPLIANCE_SNAPSHOT.dueDates.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-primary-text">
                      {item.filing}
                    </p>
                    <p className="tabular-mono text-[11px] text-muted-text">
                      Due {item.dueDate} · {item.period}
                    </p>
                  </div>
                  <Badge variant={item.status} icon={false}>
                    {item.statusText}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          {/* Tally Keyboard Cheat Sheet */}
          <Card className="print:hidden">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <h2 className="text-[var(--fs-h3)] font-semibold text-primary-text">
                Tally Keyboard Engine
              </h2>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[12px]">
              {VOUCHER_TYPE_ORDER.map((type) => {
                const m = VOUCHER_TYPE_META[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onOpenVoucher(type)}
                    className="flex items-center justify-between rounded-sm border border-border-subtle bg-canvas px-2.5 py-1.5 text-left hover:bg-muted cursor-pointer"
                  >
                    <span className="font-medium text-primary-text">{m.label}</span>
                    <span className="flex items-center gap-1">
                      <Kbd>{m.shortKey}</Kbd>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2.5 text-[11px] text-muted-text">
              Linux/Brave backup chords: <Kbd>Alt+4</Kbd>–<Kbd>Alt+9</Kbd> · Go-To:{' '}
              <Kbd>Alt+G</Kbd> · Post: <Kbd>Ctrl+Enter</Kbd>
            </p>
          </Card>
        </aside>
      </section>
    </div>
  )
}

```

---

### 23. `frontend/src/App.tsx`

```tsx
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Construction } from 'lucide-react'
import {
  INITIAL_VOUCHERS,
  type DayBookVoucher,
  type VoucherType,
} from './lib/dummyData'
import { useKeymap } from './hooks/useKeymap'
import { useTheme } from './hooks/useTheme'
import { AppShell, NAV_ITEMS } from './components/layout/AppShell'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { CommandPalette } from './components/ui/CommandPalette'
import { EmptyState } from './components/ui/EmptyState'
import { FinancialCommandPage } from './features/dashboard/FinancialCommandPage'
import {
  QUICK_VOUCHER_FORM_ID,
  QuickVoucherDrawer,
} from './features/dashboard/QuickVoucherDrawer'

export default function App() {
  const { theme, toggleTheme } = useTheme()

  const [activeNav, setActiveNav] = useState<string>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerVoucherType, setDrawerVoucherType] = useState<VoucherType>('SALES')

  const [vouchers, setVouchers] = useState<DayBookVoucher[]>(INITIAL_VOUCHERS)
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => setToastMessage(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const handleOpenVoucher = useCallback((type: VoucherType) => {
    setPaletteOpen(false)
    setMobileNavOpen(false)
    setDrawerVoucherType(type)
    setDrawerOpen(true)
  }, [])

  const handleTogglePalette = useCallback(() => {
    setMobileNavOpen(false)
    setPaletteOpen((prev) => !prev)
  }, [])

  const handleEscape = useCallback(() => {
    if (paletteOpen) {
      setPaletteOpen(false)
    } else if (drawerOpen) {
      setDrawerOpen(false)
    } else if (mobileNavOpen) {
      setMobileNavOpen(false)
    } else if (selectedVoucherId) {
      setSelectedVoucherId(null)
    }
  }, [paletteOpen, drawerOpen, mobileNavOpen, selectedVoucherId])

  const handleSubmitActiveForm = useCallback(() => {
    const form = document.getElementById(QUICK_VOUCHER_FORM_ID) as HTMLFormElement | null
    form?.requestSubmit()
  }, [])

  useKeymap({
    onOpenCommandPalette: handleTogglePalette,
    onOpenVoucher: handleOpenVoucher,
    onEscape: handleEscape,
    onSubmitActiveForm: handleSubmitActiveForm,
    isFormSubmitEnabled: drawerOpen,
  })

  const handlePostVoucher = useCallback((newVoucher: DayBookVoucher) => {
    setVouchers((prev) => [newVoucher, ...prev])
    setActiveNav('dashboard')
    setSelectedVoucherId(newVoucher.id)
    setToastMessage(`Posted ${newVoucher.voucherNo} (${newVoucher.voucherType})`)
  }, [])

  const nextSequenceNumber =
    vouchers.filter((v) => v.voucherType === drawerVoucherType).length + 43

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeNav)

  return (
    <>
      <AppShell
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenVoucher={handleOpenVoucher}
        mobileNavOpen={mobileNavOpen}
        onSetMobileNavOpen={setMobileNavOpen}
      >
        {activeNav === 'dashboard' ? (
          <FinancialCommandPage
            vouchers={vouchers}
            selectedVoucherId={selectedVoucherId}
            onSelectVoucher={(v) => setSelectedVoucherId(v?.id ?? null)}
            onOpenVoucher={handleOpenVoucher}
          />
        ) : (
          <Card className="my-4">
            <EmptyState
              icon={<Construction className="h-5 w-5" strokeWidth={1.75} />}
              title={`${activeNavMeta?.label ?? 'Workspace'} — Scheduled for ${activeNavMeta?.milestoneTag ?? 'Upcoming Milestone'}`}
              description="Milestone 1 (Visual North Star) locks the design system, UI primitives, Tally keyboard engine, and Financial Command Center before wiring FastAPI and secondary workspaces."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="primary" onClick={() => setActiveNav('dashboard')}>
                    Return to Dashboard
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenVoucher('SALES')}
                    shortcut="F8"
                  >
                    Test Quick Voucher
                  </Button>
                </div>
              }
            />
          </Card>
        )}
      </AppShell>

      <QuickVoucherDrawer
        open={drawerOpen}
        voucherType={drawerVoucherType}
        nextSequenceNumber={nextSequenceNumber}
        onChangeVoucherType={setDrawerVoucherType}
        onClose={() => setDrawerOpen(false)}
        onPostVoucher={handlePostVoucher}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        vouchers={vouchers}
        onOpenVoucher={handleOpenVoucher}
        onSelectNav={setActiveNav}
        onSelectVoucher={(v) => {
          setActiveNav('dashboard')
          setSelectedVoucherId(v.id)
        }}
      />

      {/* Non-intrusive Confirmation Toast */}
      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[var(--z-toast)] flex items-center gap-2 rounded-md border border-success/35 bg-surface px-4 py-3 text-[13px] font-medium text-primary-text shadow-md print:hidden"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />
          <span>{toastMessage}</span>
        </div>
      ) : null}
    </>
  )
}

```

---

### 24. `frontend/src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/index.css'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

```

---

## Verification Commands & Acceptance Gate

Run every check below in order before marking Milestone 1 complete in `TASK_STATE.md`.

### 1. Build, TypeScript & Lint Checks

```bash
cd frontend

# Strict TypeScript compilation + Tailwind v4 / Vite 6.4 production bundle
npm run build

# ESLint check
npm run lint

# Verify zero raw hex colors leaked into TSX files (expected: zero matches)
grep -rnE "#[0-9a-fA-F]{3,8}" src --include="*.tsx" || echo "PASS: Zero raw hex values in TSX"

# Verify zero legacy TanStack Table v8 or React forwardRef patterns
grep -rnE "useReactTable|getCoreRowModel|forwardRef|defaultProps" src || echo "PASS: Strict React 19.3 + TanStack Table v9"

# Start local dev server for browser & visual QA
npm run dev

```

Open `http://localhost:5173` in **Brave** on Linux Mint.

### 2. Manual Tally Keyboard & Accounting Math Checklist (Brave on Linux Mint)

* Press `Alt+G`: Go-To Command Palette opens with search input focused; type `HDFC` or `Sales`, navigate with `↑` / `↓`, press `Enter` to trigger, and `Esc` to close.
* Press `F5` (Payment): Browser MUST **NOT** refresh—Quick Voucher Drawer opens directly on the **Payment** tab.
* Test `F4` (Contra), `F6` (Receipt), `F7` (Journal), `F8` (Sales), `F9` (Purchase) AND backup chords `Alt+4` through `Alt+9`.
* Enter an **unbalanced** voucher (e.g., Debit `12500.50`, Credit `10000.00`): verify sticky footer switches to red `Out of Balance: ₹2,500.50` pill and disables **Post Balanced Voucher**.
* Balance the entry (Credit `12500.50`), add a narration, and press `Ctrl+Enter`: verify the drawer closes, the new voucher prepends immediately to the Day Book, KPI balances update without float drift, and the confirmation toast appears.
* Click inside an input box and type normal letters/numbers (`g`, `4`, `5`): confirm typing is never hijacked by shortcuts.
* Click the **Sun/Moon** toggle and reload the page: confirm `data-theme="dark"` persists cleanly via `localStorage`.
* Click **Print A4**: confirm print preview forces crisp Light Mode with formal company letterhead and hides sidebar/topbar/buttons.



### 3. Multimodal Screenshot Visual QA Capture Checklist (`qa-screenshots/`)

Use **Brave DevTools → Toggle Device Toolbar (`Ctrl+Shift+M`)** and save all 4 captures into the gitignored `qa-screenshots/` folder:

1. `qa-screenshots/m1-desktop-light-1440.png` — `1440×900`, Light Mode, Dashboard with Day Book + Compliance Snapshot.
2. `qa-screenshots/m1-desktop-dark-drawer-1440.png` — `1440×900`, Dark Mode, Quick Voucher Drawer open with live Balanced/Unbalanced footer visible.
3. `qa-screenshots/m1-desktop-palette-1440.png` — `1440×900`, Light Mode, `Alt+G` Go-To Command Palette open.
4. `qa-screenshots/m1-mobile-light-390.png` — `390×844`, Light Mode; verify **zero page-level horizontal scrollbar** (only the inner `.table-scroll` container scrolls horizontally) and all tap targets are `44px`.



Upload these 4 PNGs (never commit them to Git) to **`Gemini 4 Neon` (`High`)** and/or **`AWS Quick Plus Smart Mode`** for Visual QA Loop #1 before moving to Milestone 2.

---

## Plain-English Beginner Architecture Summary

Think of Milestone 1 like constructing a bank's physical branch, vault doors, and teller counters before connecting the live payment wires:

* **Single Source of Truth for Styling (`tokens.css` + `index.css`):** Every color, spacing step, font, and dark-mode swap lives in one CSS variable sheet (`tokens.css`) and automatically wires into Tailwind CSS v4 (`@theme inline`). When you flip the Light/Dark toggle or hit **Print A4**, the entire app re-skins instantaneously without touching a single React component.


* **Exact Money Without Rounding Bugs (`decimal.ts` + `format.ts`):** Normal JavaScript numbers (`0.1 + 0.2 = 0.30000000000000004`) can silently corrupt tax totals. Instead, every rupee amount is converted into a whole-number `BigInt` scaled by `10,000` (down to 1/100th of a paisa) for math, and then formatted cleanly into Indian Lakh/Crore grouping (`₹14,82,450.00`) for display.


* **Reusable Building Blocks (`components/ui/`):** Instead of re-styling buttons, tables, and drawers on every future page, all 9 UI primitives are built once with full keyboard focus, loading skeletons, empty states, and TanStack Table v9 sorting (`useTable` + static `tableFeatures`) so Milestones 2–8 can reuse them straight out of the box.


* **Tally Keyboard Brain (`useKeymap.ts` + `CommandPalette.tsx`):** One centralized listener intercepts `F4–F9`, Linux/Brave-safe `Alt+4–9`, `Alt+G`, `Esc`, and `Ctrl+Enter` at the window level—blocking accidental `F5` browser refreshes while staying out of your way whenever you are typing text into a form.


* **End-to-End Dry Run (`App.tsx` + `QuickVoucherDrawer.tsx`):** Even without FastAPI running yet, posting a balanced voucher validates every line through Zod v4 + `BigInt`, prepends it to the Day Book table, and recalculates the KPI balances live so you can feel and test the real accounting workflow immediately.
