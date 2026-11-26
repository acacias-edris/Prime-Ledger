# Task State (Session Handoff Bridge)

- **Last Updated:** 2026-11-26 19:33 IST
- **Active Milestone:** Milestone 1 — Visual North Star
- **Status:** Milestone 1 Built - Awaiting Visual QA #1
- **Last Account / Tool Used:** Local Linux Mint Workspace
- **Git / Sync Status:** Local Milestone 1 frontend files built and verified (awaiting browser Visual QA #1)

## Completed Files (Current Milestone)
- `frontend/vite.config.ts`
- `frontend/index.html`
- `frontend/src/styles/tokens.css`
- `frontend/src/styles/index.css`
- `frontend/src/lib/cn.ts`
- `frontend/src/lib/decimal.ts`
- `frontend/src/lib/format.ts`
- `frontend/src/lib/dummyData.ts`
- `frontend/src/hooks/useTheme.ts`
- `frontend/src/hooks/useKeymap.ts`
- `frontend/src/components/ui/Kbd.tsx`
- `frontend/src/components/ui/Badge.tsx`
- `frontend/src/components/ui/Button.tsx`
- `frontend/src/components/ui/Card.tsx`
- `frontend/src/components/ui/Input.tsx`
- `frontend/src/components/ui/EmptyState.tsx`
- `frontend/src/components/ui/Drawer.tsx`
- `frontend/src/components/ui/DataTable.tsx`
- `frontend/src/components/ui/CommandPalette.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/features/dashboard/QuickVoucherDrawer.tsx`
- `frontend/src/features/dashboard/FinancialCommandPage.tsx`
- `frontend/src/App.tsx`
- `frontend/src/main.tsx`

## Last Verification & Visual QA Result
- Build Command (`cd frontend && npm run build`): Passed (`tsc -b && vite build` exited 0 in 5.70s; produced `dist/index.html` 1.23 kB, `dist/assets/index-DWQXHNwD.css` 32.91 kB, `dist/assets/index-DH5JAu_w.js` 508.48 kB).
- Lint Command (`cd frontend && npm run lint`): Passed (`eslint .` exited 0 with 0 errors and 0 warnings).
- Guardrail Checks:
  - Raw hex scan (`src/**/*.tsx`): Passed (`PASS: Zero raw hex values in TSX`).
  - Legacy API scan (`useReactTable|getCoreRowModel|forwardRef|defaultProps`): Passed (`PASS: Strict React 19.3 + TanStack Table v9`).
- Multimodal Visual QA: Pending — ready for `npm run dev` in Brave on Linux Mint and screenshot capture into `qa-screenshots/` (`m1-desktop-light-1440.png`, `m1-desktop-dark-drawer-1440.png`, `m1-desktop-palette-1440.png`, `m1-mobile-light-390.png`).

## Known Issues or Blockers
- None. (Note: In TanStack Table v9 without `columnVisibilityFeature`, `DataTable.tsx` uses `row.getAllCells()` per `@tanstack/react-table` v9 core API.)

## Exact Next Step (For Next Session or Visual QA)
1. Run `cd frontend && npm run dev`, open `http://localhost:5173` in Brave on Linux Mint, and verify the Manual Tally Keyboard & Accounting Math checklist + capture the 4 `qa-screenshots/` PNGs for Visual QA Loop #1.
2. Once Visual QA Loop #1 passes, proceed to Milestone 2 (Backend Foundation + Core Double-Entry Ledger Engine & Reports).

## Beginner Architecture Summary (Latest Milestone)
Think of Milestone 1 like constructing a bank's physical branch, vault doors, and teller counters before connecting the live payment wires:

- **Single Source of Truth for Styling ([tokens.css](file:///home/acacia/projects/ledgerprime/frontend/src/styles/tokens.css) + [index.css](file:///home/acacia/projects/ledgerprime/frontend/src/styles/index.css) + [useTheme.ts](file:///home/acacia/projects/ledgerprime/frontend/src/hooks/useTheme.ts)):** Every color, spacing step, font, and Light/Dark swap lives in CSS custom properties in `tokens.css` and maps directly into Tailwind CSS v4 utilities via `@theme inline`. Flipping the theme toggle updates `data-theme` on `<html>` (persisted in `localStorage`), while `@media print` forces crisp Light Mode A4 output with zero extra RAM.
- **Exact Money Without Rounding Bugs ([decimal.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/decimal.ts) + [format.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/format.ts) + [dummyData.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/dummyData.ts)):** Normal JavaScript floating-point numbers can corrupt totals. Instead, amounts are parsed into scaled whole-number `BigInt` values (`* 10000n`) for exact arithmetic and formatted into Indian Lakh/Crore grouping (`₹14,82,450.00`), international grouping for USD/GBP, `—` for nil Dr/Cr sides, and `DD-MMM-YYYY` dates.
- **Reusable UI Primitives & Shell ([components/ui/](file:///home/acacia/projects/ledgerprime/frontend/src/components/ui/DataTable.tsx) + [AppShell.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/layout/AppShell.tsx)):** `Kbd`, `Badge`, `Button`, `Card`, `Input`, `EmptyState`, `Drawer`, `DataTable` (built with TanStack Table v9 `useTable` + `tableFeatures`), and `CommandPalette` provide accessible, state-complete building blocks inside a responsive sidebar + sticky topbar layout.
- **Tally Keyboard Engine ([useKeymap.ts](file:///home/acacia/projects/ledgerprime/frontend/src/hooks/useKeymap.ts) + [CommandPalette.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/ui/CommandPalette.tsx)):** A capture-phase window listener intercepts `F4–F9`, `Alt+4`–`Alt+9`, `Alt+G`, `Esc`, and `Ctrl+Enter` (blocking `F5` browser refresh while ignoring non-chord typing inside inputs).
- **Interactive Dashboard & Double-Entry Dry Run ([FinancialCommandPage.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/dashboard/FinancialCommandPage.tsx) + [QuickVoucherDrawer.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/dashboard/QuickVoucherDrawer.tsx) + [App.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/App.tsx)):** `App.tsx` coordinates the active workspace, Day Book vouchers, `QuickVoucherDrawer`, and `CommandPalette`. Posting a balanced voucher validates every line through Zod v4 + `BigInt`, prepends it to the sortable Day Book table, opens its inline leg drill-down, and updates KPI balances immediately without float drift.
