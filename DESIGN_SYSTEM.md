# Design System: LedgerPrime

> **Strict Agent Directive:** Every color, font size, spacing value, radius, shadow, z-index, and motion duration in the UI MUST come from the semantic tokens below (see §11 `tokens.css`). Never invent unmapped hex values or override this contract without updating `DESIGN_SYSTEM.md` first.

> **Revision v2.1 (Milestone 1.1 Polish) changes:** Reconciled dark-mode elevation ladder (`--bg-chrome`, `--bg-raised`, `--border-row`, `--shadow-card`, dark `--border-subtle: #2a3646`, dark `--bg-table-header` / `--bg-row-group: #1a222e`) · KPI figures in Inter tabular (`--font-num`), table figures & codes in JetBrains Mono (`--font-mono`) · Comfort Day Book 2-line row `52px`, Tally compact single-line `32px` · Kbd & badge diet.

## 1. Visual Identity & Aesthetic Direction
- **Product Personality:** Swiss-precision financial workbench — merges **Tally Prime's zero-latency keyboard efficiency** with **QuickBooks' calm, legible executive clarity**.
- **Default Theme Mode:** Light Mode default with first-class Dark Mode toggle. Print/PDF export always renders Light Mode.
- **Reference Vibe:** Crisp hairline `1px` ledger rules, high-density but breathable tabular data, tabular numerals, restrained ink-and-emerald semantic cues.
- **Signature Visual Moves (3 Max):**
  1. **Hairline Ledger Grid:** `1px solid var(--border-subtle)` dividers and row-state fills instead of shadows or heavy card borders. Ledger surfaces are **flat** (no shadow); shadows are reserved for floating layers.
  2. **Tabular Figures Everywhere:** Every monetary figure, quantity, and rate uses `font-variant-numeric: tabular-nums lining-nums;` and strict right-alignment. Amounts use `--font-num` (Inter tabular); codes/IDs (invoice no., GSTIN, HSN, voucher no.) use `--font-mono`.
  3. **Tactile Keyboard Shortcut Chips (`<Kbd>`):** Inline keycap badges (`F8`, `F9`, `Alt+G`, `Ctrl+S`) on primary actions.

## 2. Semantic Color Tokens & Contrast Rules
Semantic CSS variables only (zero raw hex in TSX/CSS). Body text ≥ 4.5:1 (WCAG AA). UI component boundaries that identify a control (inputs, checkboxes, focus rings) ≥ 3:1 (WCAG 1.4.11). Decorative gridlines are exempt.

> **Debit and Credit are NOT statuses.** Dr/Cr are two neutral sides of a double entry and always render in `--text-primary`. Status colors describe *state* (matched, variance, error), never *side*. Never color a whole Dr or Cr column.

| Role | CSS Variable | Light | Dark | Strict Usage Rule |
| :--- | :--- | :--- | :--- | :--- |
| Page Canvas | `--bg-canvas` | `#F8FAFC` | `#0B0F14` | Workspace canvas |
| Chrome Surface | `--bg-chrome` | `#FFFFFF` | `#0E131A` | Topbar & sidebar shell |
| Primary Surface | `--bg-surface` | `#FFFFFF` | `#121821` | Tables, KPI strip, Level-1 cards |
| Raised Overlay | `--bg-raised` | `#FFFFFF` | `#182130` | Drawers, modals, command palette, popovers |
| Subtle Surface | `--bg-muted` | `#F1F5F9` | `#1A222E` | `<Kbd>` chips, segmented track, secondary hover |
| Table Header | `--bg-table-header` | `#F1F5F9` | `#1A222E` | Sticky table header only |
| Zebra Stripe | `--bg-row-stripe` | `#FAFBFC` | `#151C26` | Optional alternate rows (off by default) |
| Row Hover | `--bg-row-hover` | `#EEF2F7` | `#1E2836` | Pointer hover on a row |
| Row Selected / Cursor | `--bg-row-selected` | `#E6EEF7` | `#16304A` | Keyboard cursor row & selected rows (+ `2px` inset left bar `--accent-primary`) |
| Group / Subtotal Row | `--bg-row-group` | `#F6F8FA` | `#1A222E` | Ledger group headers, subtotal, and sticky totals rows |
| Primary Text | `--text-primary` | `#0F172A` | `#F1F5F9` | Headings, ledger names, all monetary figures incl. Dr & Cr |
| Muted Text | `--text-muted` | `#475569` | `#94A3B8` | Column labels, dates, metadata |
| Disabled / Nil Text | `--text-disabled` | `#64748B` | `#7C8AA0` | Nil/N-A markers, disabled controls (still ≥ 4.5:1 on surface) |
| Row Hairline Border | `--border-row` | `#E2E8F0` | `#1C2532` | **Decorative only:** internal table row dividers |
| Hairline Border | `--border-subtle` | `#E2E8F0` | `#2A3646` | **Decorative only:** card frames on canvas |
| Input Border | `--border-input` | `#64748B` | `#64748B` | Inputs, comboboxes, checkboxes (≈4.7:1 light / ≈3.6:1 dark) |
| Strong Border | `--border-strong` | `#94A3B8` | `#475569` | Subtotal & grand-total rules, floating layer frames |
| Primary Brand CTA | `--accent-primary` | `#0F4C81` | `#5AB0E8` | Primary buttons, active nav bar ONLY |
| On Primary CTA | `--accent-foreground` | `#FFFFFF` | `#06243A` | Text/icons on `--accent-primary` |
| Focus Ring | `--ring-focus` | `#1D4ED8` | `#7DD3FC` | `:focus-visible` outline, `2px` width, `2px` offset |
| Matched / Balanced | `--status-success` | `#15803D` | `#4ADE80` | Reconciled lines, ITC matched, Dr = Cr balanced pill |
| Pending / Variance | `--status-warning` | `#B45309` | `#FBBF24` | Uncleared cheques, GSTR-2B value mismatch, TDS threshold |
| Error / Overdue | `--status-danger` | `#B91C1C` | `#F87171` | Unbalanced voucher, overdue bills, missing in GSTR-2B |
| Status Tint BGs | `--status-*-bg` | see §11 | see §11 | Pill/alert backgrounds only, always paired with the status foreground |

**Color is never the sole signal.** Every status pill/cell carries an icon (`CheckCircle2`, `Clock`, `AlertTriangle`, `XCircle`) and/or text label.

## 3. Typography Scale & Hierarchy
- **UI / Display Font:** `'Inter', system-ui, sans-serif` (single family; headings differentiated by weight & tracking — no second display font to load).
- **Numeric Font:** `--font-num: 'Inter', system-ui, sans-serif` + `font-variant-numeric: tabular-nums lining-nums slashed-zero;` (compact, aligned, readable at density).
- **Mono Font:** `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace` — IDs, GSTIN/HSN, voucher numbers, `<Kbd>`, KPI hero figure optional.

| Role | Token | Desktop | Mobile (`390px`) | Weight | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| KPI Hero Figure | `--fs-kpi` | `32px` | `26px` | `700` | `1.15` | `-0.025em` | Top KPIs (tabular) |
| H1 Page Title | `--fs-h1` | `24px` | `20px` | `600` | `1.25` | `-0.02em` | Workspace header |
| H2 Section | `--fs-h2` | `18px` | `17px` | `600` | `1.3` | `-0.015em` | Panel/drawer titles |
| H3 Card Title | `--fs-h3` | `15px` | `15px` | `600` | `1.35` | `-0.01em` | Card labels, sub-ledger headers |
| Body / Table Cell | `--fs-body` | `14px` | `14px` | `400` | `1.5` | `0` | Ledger rows |
| Small / Meta | `--fs-sm` | `13px` | `13px` | `500` | `1.4` | `0` | Narration, timestamps, GSTIN |
| Table Header | `--fs-th` | `12px` | `12px` | `600` | `1.2` | `+0.03em` | Uppercase column headers |
| Eyebrow / `<Kbd>` | `--fs-xs` | `11px` | `11px` | `600` | `1.2` | `+0.05em` | Status pills, shortcut chips (never body content) |

## 4. Spacing, Grid & Responsive Layout Rhythm
- **Base Unit:** `4px`. Tokens `--space-1 … --space-12` = `4, 8, 12, 16, 20, 24, 32, 40, 48px`. No off-scale values.
- **App Shell:** Collapsible Left Sidebar (`240px` desktop, slide-over drawer on mobile) + Sticky Top Bar (`56px`: Company/FY selector, `Alt+G` search, theme toggle, "New Voucher" CTA).
- **Max Content Width:** `1360px`, `24px` desktop / `16px` mobile padding.
- **Breakpoints:** Mobile `390px` (single-column KPIs), Tablet `768px` (2-col KPIs), Desktop `1280–1440px` (4-col KPI strip + 12-col split).
- **Control Heights:** Fixed via `--control-h`: `40px` desktop / `44px` mobile for buttons, inputs, comboboxes and voucher tabs (heights are set explicitly, not derived from padding).
- **Z-Index Scale:** `--z-sticky: 10` (table header/first column), `--z-topbar: 20`, `--z-drawer: 40`, `--z-modal: 50`, `--z-palette: 60`, `--z-toast: 70`.

## 5. Shape, Borders & Elevation
- **Radius Menu (ONLY these):** `--radius-sm 6px` (inputs, `<Kbd>`, pills) · `--radius-md 8px` (cards, buttons, dropdowns, alerts) · `--radius-lg 12px` (modals, drawers, palette) · `--radius-full` (avatars, status dots).
- **Elevation:**
  - Level 0 — Canvas: `--bg-canvas`
  - Level 1 — Ledger Surface / Card: `--bg-surface` + `1px solid var(--border-subtle)`, **no shadow**
  - Level 2 — Dropdown / Popover: `--bg-surface` + `1px solid var(--border-strong)` + `--shadow-sm`
  - Level 3 — Drawer / Modal / Command Palette: `--bg-surface` + `1px solid var(--border-strong)` + `--shadow-md`

## 6. Motion & Interactive States
- **Durations:** `--dur-fast 120ms` (hover, focus, row highlight) · `--dur-base 200ms` (drawer/modal) · `--dur-slow 280ms` (mobile nav).
- **Easing:** `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.
- **Reduced Motion:** Under `prefers-reduced-motion: reduce`, drawers/modals switch to a `≤ 80ms` opacity fade (no translate), skeleton shimmer becomes static, number count-up animations are disabled.
- **Never animate monetary values** (no count-up on balances or totals outside of decorative onboarding).
- **Mandatory States:** `default`, `hover`, `focus-visible`, `active`, `disabled`, `loading` (skeleton rows matching column widths), `empty`, `error`.

## 7. Core Component Recipes
- **Primary Button:** `--accent-primary` fill, `--accent-foreground` text, `--radius-md`, height `--control-h`, `0 var(--space-4)` padding, `500` weight, optional trailing `<Kbd>`.
- **Secondary / Ghost Button:** `--bg-surface` + `1px solid var(--border-input)` → `--bg-muted` on hover.
- **Financial KPI Card:** `--bg-surface`, `1px solid var(--border-subtle)`, `--radius-md`, `var(--space-5)` padding; 3-line stack: eyebrow (`--text-muted`) → tabular hero figure (`--text-primary`) → period delta (icon + sign + text, e.g. `▲ 4.2% vs Oct`) or reconciliation badge.
- **Form Input & Ledger Combobox:** height `--control-h`, `1px solid var(--border-input)`, explicit `<label>` above, numeric inputs right-aligned; error = `--status-danger` border + icon + inline message (`"Debit and Credit must balance: difference ₹1,250.00"`) linked via `aria-describedby`.
- **Voucher Entry Drawer / Modal:** `560–720px` slide-over desktop, full-screen sheet mobile. Sticky header (voucher type badge + `F4–F9` switcher). Sticky footer: `Total Dr`, `Total Cr`, `Difference`, Balance Pill (`✓ Balanced` success / `✕ Out of balance ₹X` danger), `Save Voucher (Ctrl+Enter)` — Save disabled while unbalanced, with a tooltip stating why.
- **Accounting Data Table:** see §8 for the full contract.

## 8. Numeric Formatting & Accounting Table States

### 8.1 Table Anatomy & Density
- **Density modes** (user toggle, persisted): `compact` = `32px` single-line rows / `13px` cells (Tally mode); `comfortable` = `52px` two-line rows (or `40px` single-line) / `14px` cells (default). Mobile always `>= 44px` (`64px` 2-line mobile Day Book rows).
- Header: sticky, `--bg-table-header`, `--fs-th` uppercase, sort icon (`ArrowUp`/`ArrowDown`/`ArrowUpDown`) with `aria-sort`.
- Rules: `1px solid var(--border-subtle)` horizontal only; no vertical rules except between Dr | Cr column pairs.
- Alignment: text left; all amounts, quantities, rates, % right-aligned; dates left; status centered.
- Numeric cell padding: `var(--space-3)` right, plus a fixed `2ch` sign/suffix gutter so `(…)` and `Dr/Cr` suffixes don't break decimal alignment.

### 8.2 Scroll & Sticky Contract
- The table lives in **one** scroll container (`.table-scroll { overflow: auto; max-height: … }`) that owns **both** axes. The sticky header and sticky first column (ledger/party name) are relative to this container — never place `position: sticky` headers inside a container that scrolls only on X while the page scrolls Y.
- Sticky first column gets a right-edge shadow (`--shadow-sticky-col`) only while horizontally scrolled.
- Page never scrolls horizontally at `390px`.

### 8.3 Negative Values & Dr/Cr Presentation
- **Ledger / Trial Balance / Books:** Separate `Debit` and `Credit` columns, both neutral `--text-primary`. A single-balance column uses Tally suffix: `12,450.00 Dr` / `8,300.00 Cr` (suffix in `--text-muted`, `--fs-sm`).
- **Reports (P&L, cash flow, variance):** Negatives in parentheses `(1,250.00)`. Never color-only; red is permitted only when the negative represents an **error/adverse variance** state, and then with an icon.
- Never use a bare hyphen; if a minus sign is required (exports, inputs) use `−` (U+2212).
- **Abbreviation rule:** `Cr` ALWAYS means Credit in tables. Crore is written in full (`₹4.2 crore`) and only in KPI/summary copy, never in ledger cells. Lakh likewise (`₹12.5 lakh`).

### 8.4 Zero, Nil & Not Applicable
| Case | Render | Style |
| :--- | :--- | :--- |
| Calculated zero | `0.00` | `--text-primary` |
| No transaction in period | `—` (em dash) | `--text-disabled`, `aria-label="nil"` |
| Not applicable (e.g. IGST on intrastate) | `N/A` | `--text-disabled`, `--fs-sm` |
| Value pending / loading | skeleton bar | never `0.00` placeholder |
| Data unavailable / error | `⚠ —` | `--status-warning`, tooltip with reason |

### 8.5 Precision & Units
- Amounts: 2 dp. Quantities: per stock unit's configured precision (e.g. `Nos` 0 dp, `kg` 3 dp, `m` 2 dp). FX rates: 4 dp. Percentages: 2 dp with `%`. Tax rates: as configured (`9%`, `18%`, `0.1%`).
- Units render in a dedicated `Unit` column or as a muted suffix (`25.000 kg`) — never mixed silently.
- Never truncate a number. Columns set `min-width` based on the widest expected value (`₹1,00,00,00,000.00` = 17 tabular characters); if it still overflows, the column widens and the table scrolls.

### 8.6 Totals, Subtotals & Running Balances
| Row Type | Style |
| :--- | :--- |
| Group header (Tally Group → Sub-group → Ledger) | `--bg-row-group`, `600` weight, chevron expand/collapse (`ChevronRight` rotates), indent `var(--space-4)` per level (max 4 levels; deeper uses breadcrumb) |
| Subtotal | `600` weight, `1px solid var(--border-strong)` top rule on numeric cells only |
| Grand total | `700` weight, `1px solid var(--border-strong)` top rule + **double underline** (`border-bottom: 3px double var(--border-strong)`) on numeric cells |
| Opening balance | First row, italic label "Opening Balance", amount with Dr/Cr suffix |
| Closing balance | Final row above grand total, `600` weight |
| Brought / Carried forward | `b/f` and `c/f` rows on paginated or printed views, `--text-muted` labels |
| Running balance column | Right-most, Dr/Cr suffix, recalculated on sort only when sorted by date (otherwise column hidden with note "Sort by date to show running balance") |
| Round-off | Dedicated `Round Off` ledger line, never silently absorbed. If displayed totals differ from the sum of displayed rows due to rounding, show `ⓘ` with "Totals computed on unrounded values". |

### 8.7 Currency & Locale
- Each company has one base currency. Indian grouping (`12,45,000.00`) for INR, international (`124,500.00`) for others — grouping follows the **currency**, not the user locale.
- Single-currency table: symbol in the column header (`Amount (₹)`), not in each cell.
- Multi-currency table: ISO code column (`INR` / `USD`) + amount in original currency + base-currency equivalent column; FX rate & date shown in a tooltip.

### 8.8 Voucher & Line States
| State | Visual |
| :--- | :--- |
| Draft | `Draft` pill (muted), dashed left bar |
| Posted | Default (no indicator) |
| Optional / Memorandum (Tally) | `Optional` pill, amounts in `--text-muted`, excluded from totals with footnote |
| Post-dated | `Post-dated` pill with date, `--status-warning` icon |
| Cancelled / Void | Amounts struck through (`text-decoration: line-through`) in `--text-disabled`, `Cancelled` pill, excluded from totals |
| Partially reconciled | Split pill `Matched ₹X / Pending ₹Y` with `--status-warning` |
| Locked period (books closed) | `Lock` icon in row, edit actions disabled with tooltip |
| Unbalanced (Dr ≠ Cr) | Row `--status-danger-bg`, `XCircle` icon, difference shown |

### 8.9 Text Content in Cells
- Ledger/party names: wrap up to 2 lines, then ellipsis with full name in tooltip and `title`.
- Narration: single line ellipsis in table; full text in row expansion.
- GSTIN, PAN, invoice no.: never wrap or truncate; `--font-mono`, copy-on-click affordance.
- Dates: `DD-MMM-YYYY` (`05-Nov-2026`) in tables; FY displayed as `FY 2026–27`. Period filters must not cross FY boundaries without an explicit "multi-year" indicator.

### 8.10 Keyboard & Editing
- Arrow keys move the row cursor (`--bg-row-selected` + left bar); `Enter` opens/drills down; `Esc` returns up a level (Tally drill-down semantics, with breadcrumb).
- Editable grid cells: `1px solid var(--border-input)` on focus, `--ring-focus` outline; per-cell error = danger border + icon + tooltip message.
- Multi-select via `Space` / `Shift+↑↓`; bulk action bar appears sticky at the table bottom.

### 8.11 Empty, Loading & Error
- Empty: icon + one-line reason + primary action (e.g. "No vouchers in Nov 2026 — `Create Voucher (F8)`"). Header remains visible.
- Loading: 8 skeleton rows matching column widths; totals row skeleton too.
- Error: inline banner above the table with retry; never an empty table that looks like "no data".

### 8.12 Accessibility
- Native `<table>` semantics with `<th scope>`; group rows use `aria-level` / `aria-expanded` (treegrid when collapsible).
- Screen-reader text: `(1,250.00)` → "minus 1,250 rupees"; `Dr`/`Cr` → "debit"/"credit"; `—` → "nil".
- Status always conveyed by icon + text, not color (deuteranopia-safe for success/danger).

### 8.13 Print & Export
- `@media print`: Light tokens forced, no shadows/row fills except group rows, `thead { display: table-header-group }` to repeat headers, `tr { break-inside: avoid }`, totals row never orphaned (`break-before: avoid`), c/f and b/f rows per page, company name + GSTIN + FY + period + page `X of Y` in header/footer.
- CSV/XLSX export: raw unformatted numbers with sign (no parentheses, no symbols), separate currency column.

## 9. Iconography & Data Realism
- **Icon Library:** `lucide-react` exclusively (`1.75px` stroke; `16px` inline, `18px` nav).
- **Zero Lorem Ipsum:** Realistic Indian + global dummy data (*Bharat Hardware & Exports Pvt. Ltd.*, FY 2026–27, `INV/26-27/0042`, HDFC Bank Current A/c, CGST/SGST 9%+9%, IGST 18%, *Copper Wire Coil 2.5mm*, a USD export invoice for multi-currency previews). Previews must include at least one negative, one nil, one cancelled voucher and one multi-level group to exercise §8.

## 10. Strict Do / Don't Guardrails
- **DO** align every decimal point vertically using tabular numerals and the sign gutter.
- **DO** make Company Name, Active FY, and `Alt+G` unmistakable at a glance.
- **DO** keep focus outlines crisp and visible when tabbing voucher lines.
- **DO** pair every status color with an icon or label.
- **DON'T** color Debit or Credit columns red/green, or treat Dr as "bad".
- **DON'T** use `--border-subtle` for interactive control borders.
- **DON'T** use neon gradients, glowing orbs, glassmorphism, or rainbow icon circles.
- **DON'T** center-align numbers, truncate numbers, or animate monetary values.
- **DON'T** mix INR and USD formatting without ISO codes.
- **DON'T** write `Cr` to mean crore in any table.
- **DON'T** let any table cause page-level horizontal scroll at `390px`.

## 11. Starter `frontend/src/styles/tokens.css`
```css
:root {
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
  --border-subtle: #e2e8f0;   /* decorative only */
  --border-input: #64748b;    /* >= 3:1 controls */
  --border-strong: #94a3b8;   /* totals, floating frames */

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
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
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
  --z-sticky: 10; --z-topbar: 20; --z-drawer: 40;
  --z-modal: 50;  --z-palette: 60; --z-toast: 70;

  /* Motion */
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 280ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

@media (max-width: 767px) {
  :root {
    --control-h: 44px;
    --fs-kpi: 1.625rem;
    --fs-h1: 1.25rem;
    --fs-h2: 1.0625rem;
  }
}

[data-theme="dark"] {
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
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-base: 80ms; --dur-slow: 80ms; }
}

@media print {
  /* Force light tokens; see §8.13 */
  [data-theme="dark"] { color-scheme: light; }
}
```

