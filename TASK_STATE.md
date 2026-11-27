# Task State (Session Handoff Bridge)

- **Last Updated:** 2026-11-28 01:47 IST
- **Active Milestone:** Milestone 3 — Domestic India GST Billing, Perpetual Inventory (FIFO / WAC) & Zero-RAM `@media print` A4 Tax Invoice
- **Status:** Milestone 3 Verified Complete
- **Next Milestone:** Milestone 4 — Indian Bank CSV Parser, Split-Screen Recon Workbench & BRS
- **Last Account / Tool Used:** Local Linux Mint Workspace
- **Git / Sync Status:** Uncommitted Milestone 2 Round-2 audit + Milestone 3 implementation changes in working tree on `main` (building on commit `c076122`, ahead 1 of `origin/main`, not pushed); `*.db`, `*.db-journal`, `*.db-wal`, and `*.db-shm` ignored in [.gitignore](file:///home/acacia/projects/ledgerprime/.gitignore)

---

## Milestone 3 Verification Summary

- **Alembic Migration:** Generated [b0d200d12f4c_milestone_3_gst_invoicing_and_inventory.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/b0d200d12f4c_milestone_3_gst_invoicing_and_inventory.py) and verified `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` (`b0d200d12f4c (head)`).
- **Idempotent Synthetic Seed:** Executed `python -m app.seed.dummy_company` twice cleanly — Run 1 created `m3_ledgers=16, slabs=5, hsn_sac=5, units=5, godowns=2, items=5, invoices=4`; Run 2 reported `groups_created=0, ledgers_created=0, vouchers_created=0, m3_ledgers=0, slabs=0, hsn_sac=0, units=0, godowns=0, items=0, invoices=0`.
- **Full Backend Pytest Suite:** `cd backend && source .venv/bin/activate && pytest tests/ -v` -> **`32 passed in 94.36s`** (19 Milestone 2 regression tests + 13 Milestone 3 GST/inventory/invoicing tests, 0 failures, 0 warnings).
- **Frontend TypeScript Check:** `cd frontend && npx tsc --noEmit` -> exit code `0` (0 errors).
- **Frontend ESLint Check:** Note that `npm run lint` (`eslint .`) on Node `v18.19.1` hits an ESLint `10.15.0` default `stylish` formatter crash (`util.styleText is not a function`), whereas `cd frontend && npx eslint . -f json --max-warnings 0` exited cleanly with code `0` (`0` errors, `0` warnings across all files).
- **Frontend Vite Production Build:** `cd frontend && npm run build` (`tsc -b && vite build`) -> exit code `0`, `2452 modules transformed`, built in `13.55s` (`dist/index.html 1.43 kB`, `dist/assets/index-PXiyPbwx.css 43.12 kB`, `dist/assets/vendor-icons-CrG6GFpk.js 19.32 kB`, `dist/assets/vendor-zod-KpnfYWIG.js 85.59 kB`, `dist/assets/index-BVG0KZau.js 230.67 kB`, `dist/assets/vendor-ybnFLLDo.js 354.00 kB`).
- **Frontend Design & Stack Hygiene Audits:** Zero matches for `forwardRef`, v8 `useReactTable`, or raw hex colors (`#[0-9a-fA-F]{3,8}`) across Milestone 3 frontend components, utilities, and styles.

## Milestone 3 Completed Files

### Backend
- [indian_words.py](file:///home/acacia/projects/ledgerprime/backend/app/core/indian_words.py) — Exact `Decimal`-based INR Lakh/Crore Indian numbering words converter (`amount_to_indian_words`).
- [gst.py](file:///home/acacia/projects/ledgerprime/backend/app/models/gst.py) — `HsnSacType`, `GstTaxSlab`, and `HsnSacCode` ORM models with `MoneyNumeric18_4` precision constraints.
- [inventory.py](file:///home/acacia/projects/ledgerprime/backend/app/models/inventory.py) — `UnitOfMeasure`, `Godown`, `InventoryItem`, `InventoryLot`, `StockMovement`, and `FifoLotAllocation` ORM models (`ItemType`, `ValuationMethod`, `StockDirection`, `MovementReason`).
- [invoicing.py](file:///home/acacia/projects/ledgerprime/backend/app/models/invoicing.py) — `Invoice`, `InvoiceLine`, `InvoiceType`, `SupplyType`, and `InvoiceStatus` ORM models.
- [__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/models/__init__.py) — Registers and exports all Milestone 3 ORM models and enums alongside M1/M2 models.
- [tax_india/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/tax_india/__init__.py) — Exports `tax_india_router`.
- [gst_calculator.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/tax_india/gst_calculator.py) — Stateless paise-rounded GST engine (Mod-36 GSTIN checksum validation, intra-state CGST+SGST vs inter-state IGST, LUT/SEZ zero-rating, RCM flags, HSN grouping).
- [tax_india/schemas.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/tax_india/schemas.py) — Pydantic v2 DTOs for GSTIN validation, tax slabs, and HSN/SAC lookup/create endpoints.
- [tax_india/service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/tax_india/service.py) — CRUD and validation helpers for `/api/v1/tax/india/*`.
- [tax_india/router.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/tax_india/router.py) — FastAPI routes under `/api/v1/tax/india`.
- [inventory/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/inventory/__init__.py) — Exports `inventory_router`.
- [inventory/exceptions.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/inventory/exceptions.py) — Domain errors (`InsufficientStockError` HTTP 422, `LotAlreadyConsumedError` HTTP 409).
- [inventory/schemas.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/inventory/schemas.py) — Pydantic v2 DTOs for UOMs, Godowns, Items, Lots, Stock Movements, and Stock Summary reports.
- [inventory/service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/inventory/service.py) — Perpetual FIFO lot receipt/issue allocation (`FifoLotAllocation`), Weighted Average Cost (WAC) valuation, reversal guards, godown stock breakdown, and overflow-safe Python `Decimal` stock valuation matching `Stock-in-Hand`.
- [inventory/router.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/inventory/router.py) — FastAPI routes under `/api/v1/inventory`.
- [invoicing/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/invoicing/__init__.py) — Exports `invoicing_router`.
- [invoicing/schemas.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/invoicing/schemas.py) — Pydantic v2 invoice create/detail/list/cancel/HSN-summary schemas.
- [invoicing/service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/invoicing/service.py) — Two-phase `DRAFT -> POSTED` voucher & COGS posting engine for Sales, Purchase (normal + RCM), Credit Note, and Debit Note, plus non-destructive cancellation (`409` if FIFO lot already consumed).
- [invoicing/router.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/invoicing/router.py) — FastAPI routes under `/api/v1/invoices`.
- [main.py](file:///home/acacia/projects/ledgerprime/backend/app/main.py) — Mounts `tax_india_router`, `inventory_router`, and `invoicing_router`.
- [dummy_company.py](file:///home/acacia/projects/ledgerprime/backend/app/seed/dummy_company.py) — Extends synthetic company seed (`09AAACT0000A1ZD`, gated cleanly via `include_milestone3` for M2 backward compatibility) with 16 GST/cogs/party ledgers, 5 GST slabs, 5 HSN/SAC codes, 5 UOMs, 2 godowns, 5 items, and 4 posted GST invoices.
- [b0d200d12f4c_milestone_3_gst_invoicing_and_inventory.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/b0d200d12f4c_milestone_3_gst_invoicing_and_inventory.py) — Alembic schema migration for all GST, inventory, and invoicing tables.
- [test_gst_and_inventory.py](file:///home/acacia/projects/ledgerprime/backend/tests/test_gst_and_inventory.py) — 13 async tests covering Mod-36 GSTIN validation, INR words, intra/inter/LUT GST math, FIFO & WAC COGS, negative stock HTTP 422, consumed-lot cancel HTTP 409, Purchase RCM ITC, Credit Note reversals, Draft-then-Post lifecycle, and Balance Sheet `Stock-in-Hand` reconciliation.

### Frontend
- [index.css](file:///home/acacia/projects/ledgerprime/frontend/src/styles/index.css) — `@page { size: A4 portrait; margin: 12mm; }` and `.print-keep-together` rules for crisp A4 Tax Invoice output.
- [api.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/api.ts) — Exports `buildQuery`, `requestJson`, and `ApiError.details` support for structured HTTP 409/422 error banners.
- [gstMath.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/gstMath.ts) — Zero-float `BigInt` (`* 10000n`) live GST preview engine, Indian GST state code lookup, and quantity/rate formatters.
- [gstInventory.ts](file:///home/acacia/projects/ledgerprime/frontend/src/api/gstInventory.ts) — TypeScript API client & TanStack Query v5 hooks for invoices, tax slabs, HSN/SAC codes, items, godowns, FIFO lots, and stock ledgers.
- [InvoiceBuilderPage.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/vouchers/InvoiceBuilderPage.tsx) — Full Sales (`F8`), Purchase (`F9`), Credit Note, and Debit Note builder using React Hook Form + Zod v4 + `BigInt` live tax/round-off calculations, RCM ITC callouts, Draft/Post/Post & Print actions, and inline 422 stock error handling.
- [InvoiceListPage.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/vouchers/InvoiceListPage.tsx) — Invoice Register built with TanStack Table v9 (`useTable` + `tableFeatures` + `<table.FlexRender />`), document/status filters, Credit/Debit Note branching, A4 print launch, and non-destructive Cancel modal.
- [TaxInvoicePrintView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/vouchers/TaxInvoicePrintView.tsx) — Zero-RAM `@media print` A4 Tax Invoice view (Supplier/Recipient GSTIN & POS, line item table, HSN/SAC tax summary, `amount_in_words`, and signatory block).
- [InventoryPage.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/inventory/InventoryPage.tsx) — 4-tab Inventory & Stock Valuation page (Stock Summary, Item Master Drawer, Godowns + Create Modal, FIFO Lots & Movement Ledger) built with semantic design tokens and `DataTable`.
- [AppShell.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/layout/AppShell.tsx) — Adds Invoices, New Sale (`F8`), New Purchase (`F9`), and Inventory navigation items plus `hidePrintLetterhead` support for standalone A4 printing.
- [CommandPalette.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/ui/CommandPalette.tsx) — Registers `Alt+G` quick commands for Invoices, New Sale, New Purchase, and Inventory.
- [App.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/App.tsx) — Wires `pushState`/`popstate` routing (`/invoices`, `/invoices/new`, `/invoices/:id/print`, `/inventory`), `F8`/`Alt+8`, `F9`/`Alt+9`, and `Ctrl+Enter` form submission.

## Plain-English Beginner Architecture Summary (Milestone 3)

- **How GST Invoices Post Both Taxes and Stock:** When you click **Post Invoice** in [InvoiceBuilderPage.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/vouchers/InvoiceBuilderPage.tsx) (using React Hook Form + Zod + `BigInt` preview math from [gstMath.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/gstMath.ts)), the request travels through [gstInventory.ts](file:///home/acacia/projects/ledgerprime/frontend/src/api/gstInventory.ts) to [invoicing/router.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/invoicing/router.py) and [invoicing/service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/invoicing/service.py).
- **Clean Module Separation:** The core ledger ([ledger/service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/service.py)) still knows nothing about India GST. Instead, `invoicing/service.py` asks [gst_calculator.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/tax_india/gst_calculator.py) for exact paise-rounded CGST/SGST or IGST amounts, asks [inventory/service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/inventory/service.py) to add a FIFO batch (`InventoryLot`) on Purchases/Credit Notes or consume oldest lots (`FifoLotAllocation`) + compute COGS on Sales/Debit Notes, and then posts one balanced `DRAFT -> POSTED` double-entry voucher (so `Stock-in-Hand` on the Balance Sheet always matches live inventory valuation to the exact paise).
- **Zero-RAM Printing & Safe Cancellations:** Cancelling a posted invoice writes a balanced reversal voucher (`CANCELLED` status + audit log) and returns an HTTP `409` if any purchased batch has already been sold. Opening an invoice in [TaxInvoicePrintView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/vouchers/TaxInvoicePrintView.tsx) formats the backend DTO (including INR words from [indian_words.py](file:///home/acacia/projects/ledgerprime/backend/app/core/indian_words.py) and HSN summary totals) directly into an A4 sheet rendered by the browser via `@media print` rules in [index.css](file:///home/acacia/projects/ledgerprime/frontend/src/styles/index.css) with zero server PDF bloat.

---

## Previous Milestone Reference (Milestone 2)

- **Last Updated (M2):** 2026-11-28 01:10 IST
- **Previous Status:** Milestone 2 Verified Complete (Round-2 Audit Patch Applied & Verified on `main`)

## Completed Files (Current Milestone)
### Root & Config
- [.gitignore](file:///home/acacia/projects/ledgerprime/.gitignore) (ignores `.db`, `.db-journal`, `.db-wal`, and `.db-shm` SQLite sidecars)

### Backend
- [backend/.env.example](file:///home/acacia/projects/ledgerprime/backend/.env.example)
- [backend/app/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/__init__.py)
- [backend/app/core/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/core/__init__.py)
- [backend/app/core/config.py](file:///home/acacia/projects/ledgerprime/backend/app/core/config.py)
- [backend/app/core/money.py](file:///home/acacia/projects/ledgerprime/backend/app/core/money.py) (`MoneyNumeric18_4` with `asdecimal=True`, `process_literal_param`, `python_type`, and strict `TypeError` guard on non-integer SQLite `float` results)
- [backend/app/core/database.py](file:///home/acacia/projects/ledgerprime/backend/app/core/database.py) (`PRAGMA busy_timeout` first, `DEFERRED` default for concurrent WAL reads, plus `begin_write_transaction(db)` acquiring `BEGIN IMMEDIATE` on write paths)
- [backend/app/models/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/models/__init__.py) (exports `VoucherSequence`)
- [backend/app/models/company.py](file:///home/acacia/projects/ledgerprime/backend/app/models/company.py)
- [backend/app/models/ledger.py](file:///home/acacia/projects/ledgerprime/backend/app/models/ledger.py) (adds `VoucherSequence`, `Ledger` `opening_balance_non_negative` constraint, and `Voucher` partial unique index `uq_vouchers_one_posted_reversal`)
- [backend/alembic.ini](file:///home/acacia/projects/ledgerprime/backend/alembic.ini)
- [backend/alembic/env.py](file:///home/acacia/projects/ledgerprime/backend/alembic/env.py) (with `render_as_batch=True`, `compare_type=True`, and `_render_item` auto-importing `MoneyNumeric18_4`)
- [backend/alembic/script.py.mako](file:///home/acacia/projects/ledgerprime/backend/alembic/script.py.mako)
- [backend/alembic/versions/e0a66c115a4a_milestone_2_double_entry_core.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/e0a66c115a4a_milestone_2_double_entry_core.py)
- [backend/alembic/versions/m2_0007_integrity.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/m2_0007_integrity.py) (`voucher_sequences` table + backfill, `uq_vouchers_one_posted_reversal`, `opening_balance_non_negative`, and SQLite/PostgreSQL balance + immutability triggers)
- [backend/alembic/versions/m2_0008_header_immutability.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/m2_0008_header_immutability.py) (blocks deleting `POSTED`/`CANCELLED` vouchers, mutating `CANCELLED` rows, or modifying `POSTED` header columns except `status -> CANCELLED`)
- [backend/app/modules/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/__init__.py)
- [backend/app/modules/ledger/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/__init__.py)
- [backend/app/modules/ledger/exceptions.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/exceptions.py) (`headers` support on `AccountingError` + `ConcurrencyConflictError` HTTP `409` with `Retry-After: 1`)
- [backend/app/modules/ledger/schemas.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/schemas.py) (`BalanceSheetReportRead.retained_earnings_brought_forward`, `opening_balance_difference`, `VoucherCancelRequest.reversal_date`, and `LedgerCreate.opening_balance >= 0`)
- [backend/app/modules/ledger/service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/service.py) (write-lock ordering before FY/ledger reads, `CANCELLED` creation guard, manual number normalization & CGST 16-char validation, FY-scoped CoA + inactive balance preservation, `to_date`-only anchor resolution, mid-year `from_date` Balance Sheet tie-out, ancestor-aware Schedule III reclassification including `Bank OD A/c`, and unique synthetic/merged `group_id`s)
- [backend/app/modules/ledger/router.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/router.py) (`as_of_date` on CoA endpoints, `from_date` on `/reports/balance-sheet`, and `reversal_date` preservation in `/vouchers/{id}/cancel`)
- [backend/app/main.py](file:///home/acacia/projects/ledgerprime/backend/app/main.py) (`AccountingError` header forwarding + global `OperationalError` HTTP `409` `Retry-After: 1` handler for `database is locked`/`database is busy`)
- [backend/app/seed/__init__.py](file:///home/acacia/projects/ledgerprime/backend/app/seed/__init__.py)
- [backend/app/seed/dummy_company.py](file:///home/acacia/projects/ledgerprime/backend/app/seed/dummy_company.py) (two-phase `DRAFT -> POSTED` voucher seeding + `VoucherSequence` sync)
- [backend/tests/__init__.py](file:///home/acacia/projects/ledgerprime/backend/tests/__init__.py)
- [backend/tests/conftest.py](file:///home/acacia/projects/ledgerprime/backend/tests/conftest.py)
- [backend/tests/test_double_entry.py](file:///home/acacia/projects/ledgerprime/backend/tests/test_double_entry.py)
- [backend/tests/test_m2_review_edge_cases.py](file:///home/acacia/projects/ledgerprime/backend/tests/test_m2_review_edge_cases.py)
- [backend/tests/test_audit_edge_cases.py](file:///home/acacia/projects/ledgerprime/backend/tests/test_audit_edge_cases.py)

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
- **Alembic Migration (`cd backend && source .venv/bin/activate && alembic upgrade head && alembic current`):** Passed (`Running upgrade m2_0007_integrity -> m2_0008_header_immutability`; current head: `m2_0008_header_immutability (head)`).
- **Backend Async Pytest Suite (`pytest -v` after Round-2 Audit Patch):** **`19 passed in 19.39s`** (0 errors, 0 failures, 0 warnings):
  - `tests/test_audit_edge_cases.py` (3 passed):
    1. `test_q1_contra_accounts_and_ancestor_reclassification`
    2. `test_q2_midyear_tieout_to_date_only_and_coa_fy_scoping`
    3. `test_q3_wal_concurrency_validation_and_header_immutability`
  - `tests/test_double_entry.py` (8 passed):
    1. `test_1_balanced_f4_f5_f6_f7_posting_and_auto_numbering`
    2. `test_2_unbalanced_single_line_and_zero_amount_rejections`
    3. `test_3_exact_fixed_point_decimal_zero_float_drift`
    4. `test_4_mutually_exclusive_dr_cr_line_rejection`
    5. `test_5_cancellation_and_mirror_reversal_preserve_equilibrium`
    6. `test_6_seed_idempotency_and_trial_balance_equilibrium`
    7. `test_7_profit_loss_and_balance_sheet_exact_math`
    8. `test_8_ledger_statement_chronological_running_balance`
  - `tests/test_m2_review_edge_cases.py` (8 passed):
    1. `test_fy2_pl_and_bs_split_retained_earnings_vs_current_period`
    2. `test_deactivated_ledger_with_history_keeps_reports_balanced`
    3. `test_concurrent_auto_numbering_is_unique_and_gapless`
    4. `test_reversal_of_locked_prior_year_voucher_lands_in_open_period`
    5. `test_money_type_dialect_parity[dialect0]` (SQLite) & `test_money_type_dialect_parity[dialect1]` (PostgreSQL)
    6. `test_sqlite_triggers_block_direct_posted_and_unbalanced_post`
    7. `test_http_409_retry_after_on_database_is_locked`
- **Seeded Report Equilibrium Check (post-patch against `backend/ledgerprime.db`):**
  - Trial Balance: `Dr=7073700.0000`, `Cr=7073700.0000`, `diff=0.0000`, `balanced=True`, `rows=20`
  - Profit & Loss: `Gross=345000.0000`, `Net=233500.0000`
  - Balance Sheet: `Assets=5850600.0000`, `Liab+Eq=5850600.0000`, `diff=0.0000`, `balanced=True`
- **Frontend Verification (`cd frontend && npx tsc --noEmit && npm run lint && npm run build`):**
  - `npx tsc --noEmit`: Passed (exit 0)
  - `npm run lint`: Passed (`eslint .` exited 0)
  - `npm run build`: Passed (`tsc -b && vite build` transformed 2446 modules and built cleanly in `13.94s`; `dist/index.html` `1.43 kB`, `dist/assets/index-CivyrZZs.css` `40.01 kB`, `dist/assets/vendor-icons-B6nuUULw.js` `16.59 kB`, `dist/assets/vendor-zod-DKUtTCk1.js` `85.09 kB`, `dist/assets/index-kSWPVq6G.js` `130.03 kB`, `dist/assets/vendor-C5FgB-8T.js` `347.94 kB`).

## Known Issues or Blockers
- None blocking Milestone 2. Round-2 audit patch changes (`database.py`, `service.py`, `router.py`, `m2_0008_header_immutability.py`, `test_audit_edge_cases.py`, `TASK_STATE.md`) are currently uncommitted in the local `main` working tree (ahead of `origin/main`).

## Exact Next Step
- **Milestone 3: Perpetual FIFO Inventory, Godowns & India GST Invoicing** (expand `CURRENT_TASK.md` for `modules/inventory/` + `modules/tax_india/` item masters, godowns, FIFO lot consumption & COGS posting hooks, GST HSN/SAC slabs, and A4 GST Tax Invoice print layout).

## Beginner Architecture Summary (Latest Milestone)
- **Exact Money, Async SQLite WAL & Migrations ([config.py](file:///home/acacia/projects/ledgerprime/backend/app/core/config.py), [money.py](file:///home/acacia/projects/ledgerprime/backend/app/core/money.py), [database.py](file:///home/acacia/projects/ledgerprime/backend/app/core/database.py), [env.py](file:///home/acacia/projects/ledgerprime/backend/alembic/env.py), [e0a66c115a4a_milestone_2_double_entry_core.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/e0a66c115a4a_milestone_2_double_entry_core.py), [m2_0007_integrity.py](file:///home/acacia/projects/ledgerprime/backend/alembic/versions/m2_0007_integrity.py)):** Replaces binary floats across Python and SQLite with `MoneyNumeric18_4`, which scales `Decimal("0.0001")` amounts by `10,000` into 64-bit SQLite integers (while targeting native `NUMERIC(18, 4)` on PostgreSQL), fails loudly if SQLite ever returns an unscaled non-integer float, and serializes JSON values as exact 4-decimal strings. `database.py` uses `BEGIN IMMEDIATE` (with `sqlite_begin="DEFERRED"` opt-out), `PRAGMA synchronous=FULL`, and `busy_timeout=5000` so concurrent writers serialize safely without losing issued voucher numbers.
- **Double-Entry ORM, DB Triggers & Lock Handling ([company.py](file:///home/acacia/projects/ledgerprime/backend/app/models/company.py), [ledger.py](file:///home/acacia/projects/ledgerprime/backend/app/models/ledger.py), [exceptions.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/exceptions.py), [main.py](file:///home/acacia/projects/ledgerprime/backend/app/main.py)):** Defines `Company`, `FiscalYear`, `AccountGroup`, `Ledger`, `Voucher`, `VoucherLine`, and gapless `VoucherSequence` with SQL `CHECK` constraints, a partial unique index (`uq_vouchers_one_posted_reversal`) blocking duplicate reversals, SQLite/PostgreSQL triggers enforcing two-phase `DRAFT -> POSTED` balance and immutability of posted lines, and HTTP `409` + `Retry-After: 1` responses on database lock conflicts.
- **FY-Aware Ledger Engine & Synthetic Seed ([schemas.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/schemas.py), [service.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/service.py), [router.py](file:///home/acacia/projects/ledgerprime/backend/app/modules/ledger/router.py), [dummy_company.py](file:///home/acacia/projects/ledgerprime/backend/app/seed/dummy_company.py), [test_double_entry.py](file:///home/acacia/projects/ledgerprime/backend/tests/test_double_entry.py), [test_m2_review_edge_cases.py](file:///home/acacia/projects/ledgerprime/backend/tests/test_m2_review_edge_cases.py)):** Resolves fiscal years by voucher/report date, assigns race-free `VoucherSequence` numbers, posts vouchers via `DRAFT -> POSTED`, isolates current-period P&L from prior-year retained earnings on Balance Sheet and Trial Balance, reclassifies Schedule III opposite balances (e.g., Bank Overdraft) without altering totals, keeps deactivated ledgers with posted history in historical reports, and seeds `Bharat Hardware & Exports Pvt. Ltd.` cleanly through the two-phase trigger path.
- **Typed Frontend API & Live Query Cache ([api.ts](file:///home/acacia/projects/ledgerprime/frontend/src/lib/api.ts), [useAccounting.ts](file:///home/acacia/projects/ledgerprime/frontend/src/hooks/useAccounting.ts), [App.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/App.tsx), [AppShell.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/layout/AppShell.tsx), [CommandPalette.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/components/ui/CommandPalette.tsx)):** Calls FastAPI `/api/v1/*` via Vite's `/api` proxy using typed DTOs and TanStack Query hooks; posting a voucher or creating a ledger invalidates `ACCOUNTING_KEYS.all` so KPIs, registers, and statements update automatically.
- **Live Command Center & Accounting Workspaces ([QuickVoucherDrawer.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/dashboard/QuickVoucherDrawer.tsx), [FinancialCommandPage.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/dashboard/FinancialCommandPage.tsx), [ChartOfAccountsView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/ChartOfAccountsView.tsx), [DayBookView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/DayBookView.tsx), [LedgerStatementView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/LedgerStatementView.tsx), [TrialBalanceView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/TrialBalanceView.tsx), [ProfitLossView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/ProfitLossView.tsx), [BalanceSheetView.tsx](file:///home/acacia/projects/ledgerprime/frontend/src/features/accounting/BalanceSheetView.tsx)):** `QuickVoucherDrawer` enforces scaled `BigInt` (`* 10000n`) equality before submitting to FastAPI; `FinancialCommandPage` and `DayBookView` drill down into voucher lines and trigger cancellations/reversals; `ChartOfAccountsView` adds ledgers across the 28 Tally groups; and `LedgerStatementView`, `TrialBalanceView`, `ProfitLossView`, and `BalanceSheetView` present live, print-ready statements built on `DESIGN_SYSTEM.md` tokens and TanStack Table v9 (`DataTable.tsx`).
