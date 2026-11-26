# Task State (Session Handoff Bridge)

- **Last Updated:** 2026-11-27 02:32 IST
- **Active Milestone:** Milestone 2 — Basic Domestic Double-Entry FastAPI Backend & Live Financial Statements
- **Status:** Milestone 2 Verified Complete
- **Last Account / Tool Used:** Local Linux Mint Workspace
- **Git / Sync Status:** Uncommitted working tree changes on `main` (Milestone 2 backend + frontend files created/updated; `backend/ledgerprime.db` gitignored while SQLite WAL sidecars `backend/ledgerprime.db-wal` and `backend/ledgerprime.db-shm` remain untracked when generated locally)

## Completed Files (Current Milestone)
### Backend
- [backend/.env.example](file:///home/acacia/projects/ledgerprime/backend/.env.example)
- [backend/app/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/__init__.py)
- [backend/app/core/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/core/__init__.py)
- [backend/app/core/config.py](file:///home/acacia/projects/ledgerprime/backend/app/core/config.py)
- [backend/app/core/money.py](file:///home/acacia/projects/ledgerprime/backend/app/core/money.py)
- [backend/app/core/database.py](file:///home/acacia/projects/ledgerprime/backend/app/core/database.py) (uses SQLAlchemy 2.1 `isolation_level = None` + explicit `begin` listener on `aiosqlite` so `PRAGMA journal_mode=WAL;` runs cleanly outside any transaction while preserving full transaction/rollback semantics)
- [backend/app/models/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/models/__init__.py)
- [backend/app/models/company.py](file:///home/acacia/projects/ledgerprime/backend/app/models/company.py)
- [backend/app/models/ledger.py](file:///home/acacia/projects/ledgerprime/backend/app/models/ledger.py)
- [backend/alembic.ini](file:///home/acacia/projects/ledgerprime/backend/alembic.ini)
- [backend/alembic/env.py](file:///home/acacia/projects/ledgerprime/backend/alembic/env.py) (with `render_as_batch=True`, `compare_type=True`, and `_render_item` auto-importing `MoneyNumeric18_4`)
- [backend/alembic/script.py.mako](file:///home/acacia/projects/ledgerprime/backend/alembic/script.py.mako)
- [backend/alembic/versions/e0a66c115a4a_milestone_2_double_entry_core.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/e0a66c115a4a_milestone_2_double_entry_core.py)
- [backend/app/modules/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/__init__.py)
- [backend/app/modules/ledger/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/__init__.py)
- [backend/app/modules/ledger/exceptions.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/exceptions.py)
- [backend/app/modules/ledger/schemas.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/schemas.py)
- [backend/app/modules/ledger/service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/service.py)
- [backend/app/modules/ledger/router.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/router.py)
- [backend/app/main.py](file:///home/acacia/projects/ledgerprime/backend/app/main.py)
- [backend/app/seed/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/seed/__init__.py)
- [backend/app/seed/dummy_company.py](file:///home/acacia/projects/ledgerprime/backend/app/seed/dummy_company.py)
- [backend/tests/__init__.py](file:///home/acacia/projects/ledgerprime/backend/tests/__init__.py)
- [backend/tests/conftest.py](file:///home/acacia/projects/ledgerprime/backend/tests/conftest.py)
- [backend/tests/test_double_entry.py](file:///home/acacia/projects/ledgerprime/backend/tests/test_double_entry.py)

### Frontend
- [frontend/src/lib/api.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/api.ts)
- [frontend/src/hooks/useAccounting.ts](file:///home/acacia/projects/ledgerprime/frontend/src/hooks/useAccounting.ts)
- [frontend/src/components/layout/AppShell.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/layout/AppShell.tsx)
- [frontend/src/components/ui/CommandPalette.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/ui/CommandPalette.tsx)
- [frontend/src/features/dashboard/QuickVoucherDrawer.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/dashboard/QuickVoucherDrawer.tsx)
- [frontend/src/features/dashboard/FinancialCommandPage.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/dashboard/FinancialCommandPage.tsx)
- [frontend/src/features/accounting/ChartOfAccountsView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/ChartOfAccountsView.tsx)
- [frontend/src/features/accounting/DayBookView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/DayBookView.tsx)
- [frontend/src/features/accounting/LedgerStatementView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/LedgerStatementView.tsx)
- [frontend/src/features/accounting/TrialBalanceView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/TrialBalanceView.tsx)
- [frontend/src/features/accounting/ProfitLossView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/ProfitLossView.tsx)
- [frontend/src/features/accounting/BalanceSheetView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/BalanceSheetView.tsx)
- [frontend/src/App.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/App.tsx)

## Last Verification & Test Result
- **Alembic Migration (`cd backend && source .venv/bin/activate && alembic revision --autogenerate -m "milestone_2_double_entry_core" && alembic upgrade head`):** Passed; generated [e0a66c115a4a_milestone_2_double_entry_core.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/e0a66c115a4a_milestone_2_double_entry_core.py) and applied cleanly to `backend/ledgerprime.db`.
- **Idempotent Seed (`python -m app.seed.dummy_company` run twice):**
  - Run 1: `Seeded Bharat Hardware & Exports Pvt. Ltd. (FY 2026-27): groups_created=28, ledgers_created=20, vouchers_created=15`
  - Run 2: `Seeded Bharat Hardware & Exports Pvt. Ltd. (FY 2026-27): groups_created=0, ledgers_created=0, vouchers_created=0`
- **Backend Async Pytest Suite (`pytest tests/test_double_entry.py -v`):** `8 passed in 5.66s` (0 errors, 0 failures) covering:
  1. `test_1_balanced_f4_f5_f6_f7_posting_and_auto_numbering`
  2. `test_2_unbalanced_single_line_and_zero_amount_rejections`
  3. `test_3_exact_fixed_point_decimal_zero_float_drift`
  4. `test_4_mutually_exclusive_dr_cr_line_rejection`
  5. `test_5_cancellation_and_mirror_reversal_preserve_equilibrium`
  6. `test_6_seed_idempotency_and_trial_balance_equilibrium`
  7. `test_7_profit_loss_and_balance_sheet_exact_math`
  8. `test_8_ledger_statement_chronological_running_balance`
- **ASGI Endpoint Smoke Check (against seeded `backend/ledgerprime.db`):**
  - `/api/v1/health`: `200` (`{"status": "ok", "version": "0.2.0", "dialect": "sqlite"}`)
  - `/api/v1/reports/dashboard-kpis`: `200` (`cash_and_bank_balance="1650400.0000"`, `sundry_debtors="1610200.0000"`, `sundry_creditors="1315000.0000"`, `net_gst_position="297900.0000"`, `posted_vouchers=15`, `trial_balance_balanced=True`)
  - `/api/v1/reports/trial-balance`: `200` (`is_balanced=True`, `difference="0.0000"`)
  - `/api/v1/reports/profit-loss`: `200` (`gross_profit="345000.0000"`, `net_profit="233500.0000"`)
  - `/api/v1/reports/balance-sheet`: `200` (`is_balanced=True`, `total_assets="5850600.0000"`)
- **Frontend Typecheck (`cd frontend && npx tsc --noEmit`):** Passed (exit 0).
- **Frontend Lint (`cd frontend && npm run lint`):** Passed (`eslint .` exited 0 with 0 errors and 0 warnings).
- **Frontend Build (`cd frontend && npm run build`):** Passed (`tsc -b && vite build` exited 0 in `5.08s`; `dist/index.html` `1.19 kB`, `dist/assets/index-CivyrZZs.css` `40.01 kB`, `dist/assets/index-CPhaoOe8.js` `579.74 kB`).
- **Design-System Guardrails (`frontend/src`):**
  - `PASS: Zero raw hex values in TSX`
  - `PASS: Zero untyped text-[var(--fs-*)]`
  - `PASS: Strict React 19.3 + TanStack Table v9`

## Known Issues or Blockers
- None blocking Milestone 2. Note that Milestone 2 changes are uncommitted in the local git working tree, and `backend/ledgerprime.db-wal` / `backend/ledgerprime.db-shm` are SQLite WAL sidecars created locally when running migrations/seeding.

## Exact Next Step
- **Milestone 3: Perpetual FIFO Inventory, Godowns & India GST Invoicing** (expand `CURRENT_TASK.md` for `modules/inventory/` + `modules/tax_india/` item masters, godowns, FIFO lot consumption & COGS posting hooks, GST HSN/SAC slabs, and A4 GST Tax Invoice print layout).

## Beginner Architecture Summary (Latest Milestone)
- **Exact Money, Async SQLite WAL & Migrations ([config.py](file:///home/acacia/projects/ledgerprime/backend/app/core/config.py), [money.py](file:///home/acacia/projects/ledgerprime/backend/app/core/money.py), [database.py](file:///home/acacia/projects/ledgerprime/backend/app/core/database.py), [env.py](file:///home/acacia/projects/ledgerprime/backend/alembic/env.py), [e0a66c115a4a_milestone_2_double_entry_core.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/e0a66c115a4a_milestone_2_double_entry_core.py)):** Replaces binary floats across Python and SQLite with `MoneyNumeric18_4`, which scales `Decimal("0.0001")` amounts by `10,000` into 64-bit SQLite integers (while targeting native `NUMERIC(18, 4)` on PostgreSQL) and serializes JSON values as exact 4-decimal strings. `database.py` uses explicit `BEGIN` hooks so SQLite WAL mode and foreign keys activate cleanly.
- **Double-Entry ORM & Safety Net ([company.py](file:///home/acacia/projects/ledgerprime/backend/app/models/company.py), [ledger.py](file:///home/acacia/projects/ledgerprime/backend/app/models/ledger.py), [exceptions.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/exceptions.py)):** Defines `Company`, `FiscalYear`, `AccountGroup`, `Ledger`, `Voucher`, and `VoucherLine` with SQL `CHECK` constraints (`non_negative_line_amounts`, `mutually_exclusive_dr_cr`) and a synchronous SQLAlchemy `before_flush` listener that blocks any `POSTED` voucher whose debits do not equal credits.
- **Ledger Engine, API & Synthetic Seed ([schemas.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/schemas.py), [service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/service.py), [router.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/router.py), [main.py](file:///home/acacia/projects/ledgerprime/backend/app/main.py), [dummy_company.py](file:///home/acacia/projects/ledgerprime/backend/app/seed/dummy_company.py), [test_double_entry.py](file:///home/acacia/projects/ledgerprime/backend/tests/test_double_entry.py)):** Validates voucher posting inside fiscal year boundaries, assigns sequential FY-scoped voucher numbers, supports non-destructive cancellation and mirror journal reversals, aggregates Trial Balance / Trading & P&L / Balance Sheet / Ledger Statements / Dashboard KPIs via SQL sums over `POSTED` rows, and seeds `Bharat Hardware & Exports Pvt. Ltd.` (28 Tally groups, 20 balanced ledgers, 15 vouchers).
- **Typed Frontend API & Live Query Cache ([api.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/api.ts), [useAccounting.ts](file:///home/acacia/projects/ledgerprime/frontend/src/hooks/useAccounting.ts), [App.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/App.tsx), [AppShell.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/layout/AppShell.tsx), [CommandPalette.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/ui/CommandPalette.tsx)):** Calls FastAPI `/api/v1/*` via Vite's `/api` proxy using typed DTOs and TanStack Query hooks; posting a voucher or creating a ledger invalidates `ACCOUNTING_KEYS.all` so KPIs, registers, and statements update automatically.
- **Live Command Center & Accounting Workspaces ([QuickVoucherDrawer.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/dashboard/QuickVoucherDrawer.tsx), [FinancialCommandPage.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/dashboard/FinancialCommandPage.tsx), [ChartOfAccountsView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/ChartOfAccountsView.tsx), [DayBookView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/DayBookView.tsx), [LedgerStatementView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/LedgerStatementView.tsx), [TrialBalanceView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/TrialBalanceView.tsx), [ProfitLossView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/ProfitLossView.tsx), [BalanceSheetView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/BalanceSheetView.tsx)):** `QuickVoucherDrawer` enforces scaled `BigInt` (`* 10000n`) equality before submitting to FastAPI; `FinancialCommandPage` and `DayBookView` drill down into voucher lines and trigger cancellations/reversals; `ChartOfAccountsView` adds ledgers across the 28 Tally groups; and `LedgerStatementView`, `TrialBalanceView`, `ProfitLossView`, and `BalanceSheetView` present live, print-ready statements built on `DESIGN_SYSTEM.md` tokens and TanStack Table v9 (`DataTable.tsx`).
