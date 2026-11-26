# CURRENT_TASK — Milestone 1 Visual Polish Pass (Visual North Star QA Fixes)

## Objective
Fix all **P0**, **P1**, and **P2** defects identified in the Milestone 1 Multimodal Screenshot Visual QA across `1440×900` (Light, Dark, Command Palette) and `390×844` (Mobile) while strictly enforcing `DESIGN_SYSTEM.md` v2.

## Guardrails for Execution Agent
1. **Inspect existing exports & prop interfaces before editing stateful components** (`AppShell.tsx`, `DataTable.tsx`, `CommandPalette.tsx`, `FinancialCommandPage.tsx`, `QuickVoucherDrawer.tsx`, `dummyData.ts`). Preserve all existing navigation callbacks, keyboard listeners (`useKeymap.ts`), theme toggle (`useTheme.ts`), and `QuickVoucherDrawer` wiring.
2. **Zero raw hex values in `.tsx` files.** Use semantic CSS variables from `tokens.css` exclusively.
3. **Never use Tailwind v4 `text-[var(--fs-*)]` for font sizes** (Tailwind v4 parses untyped `text-[var(...)]` as `color`). Always use the semantic `.type-*` utilities defined in `frontend/src/styles/index.css` or `text-[length:var(--fs-*)]`.
4. **WCAG 1.4.11 boundary rule:** Every interactive control (button, input, search trigger, company selector, filter pill, segmented toggle) MUST use `border-[var(--border-input)]` (`≥ 3:1`). Reserve `border-[var(--border-subtle)]` strictly for decorative card frames and table gridlines.
5. **Run verification before finishing:** `cd frontend && npx tsc --noEmit && npm run build`.

---

## Step 1 — Design Tokens & Complete Print Override
**File:** `frontend/src/styles/tokens.css` (Replace full file)

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
  --border-subtle: #e2e8f0; /* decorative only: card frames, table gridlines */
  --border-input: #64748b;  /* >= 3:1 interactive controls */
  --border-strong: #94a3b8; /* totals, double-underline, floating frames */

  /* Brand & Focus */
  --accent-primary: #0f4c81;
  --accent-primary-hover: #0c3d68;
  --accent-foreground: #ffffff;
  --ring-focus: #1d4ed8;

  /* On-Primary Chip Tokens (WCAG AA >= 4.5:1 on --accent-primary) */
  --kbd-on-primary-bg: rgba(255, 255, 255, 0.16);
  --kbd-on-primary-border: rgba(255, 255, 255, 0.42);
  --kbd-on-primary-text: #ffffff;

  /* Status (state ONLY, never Dr/Cr side) */
  --status-success: #15803d;
  --status-success-bg: #dcfce7;
  --status-success-border: rgba(21, 128, 61, 0.28);
  --status-warning: #b45309;
  --status-warning-bg: #fef3c7;
  --status-warning-border: rgba(180, 83, 9, 0.28);
  --status-danger: #b91c1c;
  --status-danger-bg: #fee2e2;
  --status-danger-border: rgba(185, 28, 28, 0.28);

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-num: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --num-features: tabular-nums lining-nums slashed-zero;

  --fs-kpi: 2rem;        /* 32px */
  --fs-h1: 1.5rem;       /* 24px */
  --fs-h2: 1.125rem;     /* 18px */
  --fs-h3: 0.9375rem;    /* 15px */
  --fs-body: 0.875rem;   /* 14px */
  --fs-sm: 0.8125rem;    /* 13px */
  --fs-th: 0.75rem;      /* 12px */
  --fs-xs: 0.6875rem;    /* 11px */

  /* Spacing (4px base) */
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
  --shadow-md: 0 10px 28px rgba(15, 23, 42, 0.14);
  --shadow-sticky-col: 4px 0 6px -4px rgba(15, 23, 42, 0.14);
  --backdrop-scrim: rgba(15, 23, 42, 0.45);

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
}

@media (max-width: 767px) {
  :root {
    --control-h: 44px;
    --fs-kpi: 1.625rem;  /* 26px */
    --fs-h1: 1.25rem;    /* 20px */
    --fs-h2: 1.0625rem;  /* 17px */
  }
}

[data-theme="dark"] {
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
  --accent-primary-hover: #7cc2ee;
  --accent-foreground: #06243a;
  --ring-focus: #7dd3fc;

  --kbd-on-primary-bg: rgba(6, 36, 58, 0.14);
  --kbd-on-primary-border: rgba(6, 36, 58, 0.36);
  --kbd-on-primary-text: #06243a;

  --status-success: #4ade80;
  --status-success-bg: rgba(74, 222, 128, 0.14);
  --status-success-border: rgba(74, 222, 128, 0.32);
  --status-warning: #fbbf24;
  --status-warning-bg: rgba(251, 191, 36, 0.14);
  --status-warning-border: rgba(251, 191, 36, 0.32);
  --status-danger: #f87171;
  --status-danger-bg: rgba(248, 113, 113, 0.14);
  --status-danger-border: rgba(248, 113, 113, 0.32);

  --shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 12px 32px rgba(0, 0, 0, 0.58);
  --shadow-sticky-col: 4px 0 6px -4px rgba(0, 0, 0, 0.55);
  --backdrop-scrim: rgba(2, 6, 12, 0.68);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-base: 80ms;
    --dur-slow: 80ms;
  }
}

@media print {
  :root,
  [data-theme="dark"] {
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
    --shadow-sm: none;
    --shadow-md: none;
    --shadow-sticky-col: none;
  }
}
---
### Milestone 1.1 — Visual Critique Fixes (merge before QA screenshots)

#### 0. Contract reconciliation (do first)
- [ ] Update DESIGN_SYSTEM.md to settle the drift: dark --accent-primary (#38BDF8 vs #5AB0E8), --border-strong (#CBD5E1 vs #94A3B8), row heights, --font-num
- [ ] Decide KPI hero font: Inter `font-feature-settings:'tnum','lnum','zero'` (recommended at 32px) OR JetBrains Mono; table cells stay JetBrains Mono
- [ ] Re-capture QA screenshots at a real 1440×900 CSS viewport (DPR 1) and at 1280×800

#### 1. Type scale (fixes flat hierarchy)
- [ ] H1 "Financial Command Center": 24px / 600 / lh 1.25 / -0.02em, --font-display (mobile 20px)
- [ ] Page eyebrow: 11px / 600 / +0.06em / --text-muted; text "NOV 2026 · BOOKS OPEN" (drop the duplicate FY, already in topbar); "Books open" = 6px --status-success dot + text
- [ ] Eyebrow→H1 gap 4px; H1→KPI strip gap 24px
- [ ] KPI label: 11px / 600 / +0.05em / --text-muted (currently ~12px; must sit clearly below the figure)
- [ ] KPI figure: 32px / 700 / lh 1.15 / -0.025em; `₹` and `.00` wrapped in <span> at 0.6em / 500 / --text-muted, baseline-aligned
- [ ] KPI balance suffix: " Dr" / " Cr" at 12.5px / 500 / --text-muted, margin-left 4px
- [ ] Panel titles ("Recent Vouchers & Day Book", rail cards): H2 18px/600/-0.015em (rail: H3 15px/600)
- [ ] Panel subtitle: 12.5px / 500 / --text-muted, 2px below title

#### 2. App shell and grid
- [ ] Topbar height 56px (now 48px); company selector: name 14px/600 --text-primary + FY as 11px mono chip, min-height 40px
- [ ] Content: max-width 1360px, LEFT-aligned at 24px from sidebar (remove centred float / 174px dead band at ≥1680px)
- [ ] All gutters on the 4px scale: KPI internal 0 (single strip), main↔rail gap 24px (now 21px), card↔card vertical 16px
- [ ] Grid at ≥1280px: main 8fr / rail 4fr → change to `minmax(0,1fr) 360px` so the ledger gets every spare pixel
- [ ] Below 1440px: rail drops under main OR collapses to a 48px icon rail; ledger must never lose Dr/Cr columns

#### 3. KPI strip (replace 4 boxed cards)
- [ ] One Level-1 surface, radius 8px, `display:grid; grid-template-columns:repeat(4,1fr)`; dividers `border-left:1px solid var(--border-subtle)` on cells 2–4
- [ ] Cell padding 20px 24px; strict 3-line stack: label → figure (8px gap) → delta/status (8px gap)
- [ ] Delta/status as text + 14px lucide icon, NOT bordered pills (remove pill frame from "4 bills aging", "Net ITC Available")

#### 4. Day Book ledger table
- [ ] Remove TYPE column; encode type as voucher prefix + optional 6px colour-neutral glyph. Reclaims ~125px
- [ ] Columns @≥1280px: Date 72px | Voucher No. 132px | Particulars minmax(240px,1fr) | Debit 128px | Credit 128px. Zero horizontal scroll at ≥1280px
- [ ] Date: "26 Nov" mono 13px --text-muted (year implied by FY; full date in title attr)
- [ ] Voucher No.: mono 13px / 500 / --text-muted (quieter than amounts)
- [ ] Party: 14px/500 --text-primary; narration 12.5px/400 --text-muted, 1 line ellipsis, 2px gap
- [ ] Amounts: JetBrains Mono 14px/500, tabular-nums, right-aligned, padding-right 16px; nil = "—" in --text-muted
- [ ] Vertical alignment: all cells `vertical-align:top; padding-top:10px` (shared first-line baseline); Comfort row 52px, Tally/compact row 32px single-line (narration hidden)
- [ ] Header: 36px, --bg-table-header, 11px/600/+0.05em uppercase; sort icon 12px, 4px gap, appears on hover/active only
- [ ] Totals row (tfoot, sticky bottom): `border-top:2px solid var(--border-strong)`; amount cells add `border-bottom:3px double var(--border-strong)`; 14px/600
- [ ] Scroll body max-height = header + (N × row-h) so no half-row ever peeks behind the sticky totals row; hide the inner horizontal scrollbar at ≥1280px
- [ ] Footnote ("Cancelled and post-dated…") → 14px info icon + tooltip inside the totals row label
- [ ] Filters: segmented control, 32px height (38px hit area), active = --bg-surface + --text-primary 600 + shadow-sm inside a --bg-muted track. NO --accent-primary fill. Counts 11px mono --text-muted

#### 5. Badge / Kbd diet (target ≤12 chips on desktop first view)
- [ ] Kbd visible always ONLY on: topbar search (Alt+G), New Voucher (F8), command palette rows
- [ ] All other Kbd: `opacity:0` → `1` on :hover/:focus-visible (--dur-fast)
- [ ] Fix duplicate sidebar "M2"; replace M# with real chords (Alt+1…Alt+7) or remove
- [ ] Status pills → dot + text (6px --radius-full dot, 12.5px/500 text in status colour); keep pill only for the single most urgent item per card
- [ ] Delete "Tally Keyboard Engine" rail card → `?` shortcut-sheet overlay
- [ ] Header actions: Print A4 → 36px icon-only ghost button; Payment/Receipt → merge into "New Voucher" split-button menu (F4–F9 listed inside)
- [ ] Secondary button border: --border-subtle (currently darker than card frames); hover → --bg-muted

#### 6. Right rail (flatten)
- [ ] Remove nested bordered boxes in BRS + GSTR-2B; use label/value rows separated by 1px --border-subtle, row padding 10px 0
- [ ] BRS: "7 unreconciled" 15px/600 + "(₹1,84,250.00)" mono 14px right-aligned, same baseline
- [ ] GSTR-2B: progress bar 4px tall, radius-full; 3 stats as inline row "32/35 matched · 2 variance · 1 missing" with status-colour numerals only
- [ ] Compliance calendar: 40px date block ("07" 15px/700 mono over "DEC" 11px/600 muted), urgency: ≤7d danger, 8–15d warning, >15d neutral (TDS 11d and GSTR-1 15d must not look identical)

#### 7. Dark-mode elevation ladder (add tokens)
- [ ] --bg-canvas #0B0F14 | NEW --bg-chrome #0E131A (sidebar + topbar) | --bg-surface #121821 | --bg-table-header #1A222E | NEW --bg-raised #182130 (palette, drawer, popover)
- [ ] Split borders: NEW --border-row #1C2532 (internal row rules, quieter) vs --border-subtle #243040 → #2A3646 (card frames on canvas)
- [ ] Level-1 cards in dark: add `box-shadow: inset 0 1px 0 rgba(255,255,255,0.04)` (top-edge highlight token, not raw in TSX)
- [ ] Totals row dark: --bg-muted #1A222E (currently #161D27, ~1.1:1 vs surface)
- [ ] Verify dark accent fill on New Voucher doesn't out-weigh KPI figures; accent nowhere else except active nav

#### 8. Command palette
- [ ] Width 640px, top 15vh, radius 12px, --bg-raised + 1px --border-strong + --shadow-md
- [ ] Input row 52px, text 15px/400, bottom border 1px --border-subtle
- [ ] Result rows 40px single line: 16px type-specific lucide icon | label 14px/500 | next number mono 12.5px muted ("CNT/26-27/0008", not "xxxx") | Kbd right. Remove trailing arrow
- [ ] Show ≥9 rows without scrolling; overlay scrollbar (no permanent track)

#### 9. Mobile 390px
- [ ] `@media (hover:none) and (pointer:coarse)`: hide ALL <Kbd>, Comfort/Tally toggle, and the "↑ ↓ + Enter" hint → "Tap a voucher to see its entries"
- [ ] Topbar 56px: [≡ 44×44] [company name 15px/600 ellipsis + "FY 2026–27" 11px mono muted] … [search 44×44] [+ 44×44 accent]; theme toggle → drawer
- [ ] Remove Print/Payment/Receipt from top; add sticky bottom bar 64px + `env(safe-area-inset-bottom)`: Payment | Receipt | "+ New Voucher" (primary, 48px tall, flex 1.4)
- [ ] KPIs: one "Position" card — Cash & Bank hero 26px/700 mono on top; Receivables/Payables/Net GST as 3 rows (label 13px muted left, figure 16px/600 mono right, 44px row height, hairline dividers). Target total height ≤ 260px (now ~470px)
- [ ] Filters: single-row horizontal scroll, 36px visual / 44px hit area, 8px gap, 16px edge padding, scroll-snap
- [ ] Day Book → list rows 64px: line 1 party 15px/500 + amount mono 15px/600 right + Dr/Cr suffix; line 2 voucher no · date mono 12.5px muted
- [ ] Page horizontal padding 16px; card padding 16px; inter-card gap 12px
