# Design System: LedgerPrime

> **Strict Agent Directive:** Every color, font size, spacing value, radius, shadow, and motion duration in the UI MUST come from the semantic tokens below. Never invent unmapped hex values or override this contract without updating `DESIGN_SYSTEM.md` first.

## 1. Visual Identity & Aesthetic Direction
- **Product Personality:** Swiss-precision financial workbench — merges **Tally Prime's zero-latency keyboard efficiency** with **QuickBooks' calm, legible executive clarity**.
- **Default Theme Mode:** Light Mode default with first-class Dark Mode toggle (for late-night reconciliation sessions).
- **Reference Vibe:** Crisp hairline `1px` accounting ledger rules, generous breathing room around high-density tabular data, monospaced tabular numerals (`tabular-nums`), and restrained ink-and-emerald semantic cues.
- **Signature Visual Moves (3 Max):**
  1. **Hairline Ledger Grid:** `1px solid var(--border-subtle)` structural dividers and subtle zebra/hover states instead of heavy drop shadows or cluttered card borders.
  2. **Monospaced Tabular Figures Everywhere:** Every monetary figure, debit/credit column, GST breakdown, invoice number, and stock quantity renders in `JetBrains Mono` with `font-variant-numeric: tabular-nums;` and strict right-alignment.
  3. **Tactile Keyboard Shortcut Chips (`<Kbd>`):** Subtle inline keycap badges (`F8`, `F9`, `Alt+G`, `Ctrl+S`) on primary actions so power users can navigate Tally-style without lifting hands off the keyboard.

## 2. Semantic Color Tokens & Contrast Rules
Use semantic CSS variables only (zero raw hex values in TSX/CSS components). All body text meets WCAG AA (`>= 4.5:1`); large metrics and UI controls meet `>= 3:1`.

| Role | CSS Variable | Light Mode | Dark Mode | Strict Usage Rule |
| :--- | :--- | :--- | :--- | :--- |
| Page Canvas | `--bg-canvas` | `#F8FAFC` | `#0B0F14` | Main viewport workspace canvas |
| Primary Surface | `--bg-surface` | `#FFFFFF` | `#121821` | Ledger tables, cards, modals, drawers, topbar |
| Subtle Surface | `--bg-muted` | `#F1F5F9` | `#1A222E` | Table headers, sidebar active fill, `<Kbd>` chips, row hover |
| Primary Text | `--text-primary` | `#0F172A` | `#F1F5F9` | Headings, ledger names, primary monetary figures |
| Muted Text | `--text-muted` | `#475569` | `#94A3B8` | Column labels, HSN codes, dates, secondary metadata |
| Hairline Border | `--border-subtle` | `#E2E8F0` | `#243040` | Table gridlines, input borders, card frames |
| Strong Border | `--border-strong` | `#CBD5E1` | `#334155` | Active voucher totals divider, double-underline accounting totals |
| Primary Brand CTA | `--accent-primary` | `#0F4C81` | `#38BDF8` | Primary buttons ("Post Voucher", "New Invoice"), active nav bar ONLY |
| On Primary CTA | `--accent-foreground` | `#FFFFFF` | `#082F49` | Text/icons rendered on `--accent-primary` |
| Focus Ring | `--ring-focus` | `#1D4ED8` | `#7DD3FC` | Keyboard `:focus-visible` outline (`2px` offset) |
| Accounting Credit / Matched | `--status-success` | `#15803D` | `#4ADE80` | Reconciled bank lines, ITC matched, positive cash flow, Dr=Cr balanced |
| Pending / Variance | `--status-warning` | `#B45309` | `#FBBF24` | Uncleared cheques, GSTR-2B value mismatch, approaching TDS threshold |
| Accounting Debit Alert / Error | `--status-danger` | `#B91C1C` | `#F87171` | Unbalanced voucher (`Dr != Cr`), overdue bills, missing in GSTR-2B |

## 3. Typography Scale & Hierarchy
- **Display / Heading Font:** `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`
- **Body UI Font:** `'Inter', system-ui, sans-serif`
- **Monospace / Numeric Font:** `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace` (`font-variant-numeric: tabular-nums;`)

| Role | Desktop Size | Mobile Size (`390px`) | Weight | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| KPI Hero Figure | `32px` (`2rem`) | `26px` (`1.625rem`) | `700` | `1.15` | `-0.025em` | Top cash balance / net profit KPIs (Mono tabular) |
| H1 Page Title | `24px` (`1.5rem`) | `20px` (`1.25rem`) | `600` | `1.25` | `-0.02em` | Workspace header (e.g., "Financial Command", "Day Book") |
| H2 Section | `18px` (`1.125rem`) | `17px` (`1.0625rem`) | `600` | `1.3` | `-0.015em` | Panel titles, drawer headers |
| H3 Card Title | `15px` (`0.9375rem`) | `15px` (`0.9375rem`) | `600` | `1.35` | `-0.01em` | KPI card labels, sub-ledger section headers |
| Body / Table Cell | `14px` (`0.875rem`) | `14px` (`0.875rem`) | `400` | `1.5` | `0em` | Standard text & ledger rows (dense yet scannable) |
| Small / Meta | `12.5px` (`0.78rem`) | `13px` (`0.8125rem`) | `500` | `1.4` | `0em` | Narration hints, timestamps, GSTIN/HSN metadata |
| Eyebrow / `<Kbd>` | `11px` (`0.6875rem`) | `11px` (`0.6875rem`) | `600` | `1.2` | `+0.05em` | Table headers (uppercase), status pills, shortcut chips |

## 4. Spacing, Grid & Responsive Layout Rhythm
- **Base Unit:** `4px` scale (`4, 8, 12, 16, 20, 24, 32, 40, 48px`).
- **App Shell Layout:** Fixed collapsible Left Sidebar (`240px` desktop, slide-over drawer on `390px` mobile) + Sticky Top Bar (`56px` height containing Company/FY Selector, `Alt+G` Command Search Trigger, Theme Toggle, and Primary "New Voucher" CTA).
- **Max Content Width:** `1360px` centered inside workspace with `24px` desktop / `16px` mobile horizontal padding.
- **Responsive Breakpoints:** Mobile `390px` (single column KPI stack, horizontally scrollable wrapper for multi-column financial tables — zero page-level horizontal overflow), Tablet `768px` (2-column KPIs), Desktop `1280px–1440px` (4-column KPI strip + 12-column analytical split).
- **Touch Target Minimum:** All buttons, voucher tabs, and inputs `>= 38px` tall on desktop and `>= 44px` tall on mobile.

## 5. Shape, Borders & Elevation
- **Radius Menu (Use ONLY These):**
  - `--radius-sm`: `6px` (inputs, `<Kbd>` chips, compact table actions, status pills)
  - `--radius-md`: `8px` (cards, dropdowns, primary buttons, alerts)
  - `--radius-lg`: `12px` (modals, voucher entry drawers, command palette)
  - `--radius-full`: `9999px` (company avatars, live status dots)
- **Elevation Hierarchy:**
  - Level 0 (Canvas): `--bg-canvas`
  - Level 1 (Ledger Surface / Card): `--bg-surface` + `1px solid var(--border-subtle)` + `--shadow-sm`
  - Level 2 (Command Palette / Voucher Drawer): `--bg-surface` + `1px solid var(--border-strong)` + `--shadow-md`

## 6. Motion & Interactive States
- **Durations:** `--dur-fast: 120ms` (keyboard focus/hover/row highlight — Tally-snappy), `--dur-base: 200ms` (drawer/modal transitions), `--dur-slow: 280ms` (mobile nav drawer).
- **Easing:** `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.
- **Reduced Motion:** Respect `@media (prefers-reduced-motion: reduce)`.
- **Mandatory Component States:** Every interactive control MUST implement `default`, `hover`, `focus-visible` (high-visibility keyboard ring for Tally-style tabbing), `active`, `disabled`, `loading` (skeleton rows), and `empty/error` states.

## 7. Core Component Recipes (Visual North Star Primitives)
- **Primary Button:** `--accent-primary` fill, `--accent-foreground` text, `--radius-md`, `8px 14px` padding, `500` weight, optional trailing `<Kbd>` chip.
- **Secondary / Ghost Button:** `--bg-surface` + `1px solid var(--border-subtle)` -> `--bg-muted` on hover.
- **Financial KPI Card:** `--bg-surface`, `1px solid var(--border-subtle)`, `--radius-md`, `18px 20px` padding; strict 3-line stack: Eyebrow label (`--text-muted`) -> Mono tabular Hero Figure (`--text-primary`) -> Period delta / reconciliation badge.
- **Accounting Data Table:** Sticky `--bg-muted` header (`11px` uppercase tracked), `44px` comfortable row height, `1px solid var(--border-subtle)` horizontal rules, text columns left-aligned, ALL numeric/currency columns strictly right-aligned in `JetBrains Mono` with `tabular-nums`, bold bottom summary row with `2px solid var(--border-strong)` top border.
- **Form Input & Ledger Combobox:** `40px` desktop / `44px` mobile height, explicit `<label>` above input, `--status-danger` border + inline accounting validation message on error (e.g., `"Debit and Credit must balance: difference ₹1,250.00"`).
- **Voucher Entry Drawer / Modal:** Slide-over panel (`560px–720px` desktop, full-screen sheet on `390px` mobile) with sticky header (Voucher Type badge + `F4–F9` quick switcher) and sticky footer displaying live `Total Debit`, `Total Credit`, Balance Pill (`Balanced` green / `Out of Balance` red), and `Save Voucher (Ctrl+Enter)`.

## 8. Iconography & Data Realism
- **Icon Library:** `lucide-react` exclusively (`1.75px` stroke width; `16px` inline, `18px` sidebar/nav).
- **Zero Lorem Ipsum:** Populate all previews with realistic Indian + Global dummy data (e.g., *Bharat Hardware & Exports Pvt. Ltd.*, FY 2026–27, invoices `INV/26-27/0042`, HDFC Bank Current A/c, CGST/SGST 9%+9%, IGST 18%, stock item *Copper Wire Coil 2.5mm*).

## 9. Strict Do / Don't Guardrails (Anti-AI-Slop Rules)
- **DO** align every currency symbol and decimal point vertically in ledger columns using `tabular-nums`.
- **DO** make the Company Name, Active Financial Year, and `Alt+G` Go-To Command Palette unmistakable at a glance.
- **DO** keep keyboard focus outlines crisp and immediately visible when tabbing through voucher lines.
- **DON'T** use neon purple-to-cyan gradients, decorative glowing orbs, dark glassmorphism, or rainbow icon circles on KPI cards.
- **DON'T** center-align currency columns or mix Indian (`₹12,45,000.00`) and US (`$124,500.00`) formatting inside the same company without explicit currency ISO codes (`INR` / `USD`).
- **DON'T** let any table cause full-page horizontal scroll on `390px` mobile (always wrap tables inside `overflow-x-auto` containers).

## 10. Starter `frontend/src/styles/tokens.css` Block
```css
:root {
  --bg-canvas: #f8fafc;
  --bg-surface: #ffffff;
  --bg-muted: #f1f5f9;
  --text-primary: #0f172a;
  --text-muted: #475569;
  --border-subtle: #e2e8f0;
  --border-strong: #cbd5e1;
  --accent-primary: #0f4c81;
  --accent-foreground: #ffffff;
  --ring-focus: #1d4ed8;
  --status-success: #15803d;
  --status-success-bg: #dcfce7;
  --status-warning: #b45309;
  --status-warning-bg: #fef3c7;
  --status-danger: #b91c1c;
  --status-danger-bg: #fee2e2;

  --font-display: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 10px 28px rgba(15, 23, 42, 0.10);

  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 280ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

[data-theme="dark"] {
  --bg-canvas: #0b0f14;
  --bg-surface: #121821;
  --bg-muted: #1a222e;
  --text-primary: #f1f5f9;
  --text-muted: #94a3b8;
  --border-subtle: #243040;
  --border-strong: #334155;
  --accent-primary: #38bdf8;
  --accent-foreground: #082f49;
  --ring-focus: #7dd3fc;
  --status-success: #4ade80;
  --status-success-bg: rgba(74, 222, 128, 0.14);
  --status-warning: #fbbf24;
  --status-warning-bg: rgba(251, 191, 36, 0.14);
  --status-danger: #f87171;
  --status-danger-bg: rgba(248, 113, 113, 0.14);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 12px 32px rgba(0, 0, 0, 0.55);
}
