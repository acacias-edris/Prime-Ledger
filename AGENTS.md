# AGENTS.md - LedgerPrime Project Rules & Accounting Engineering Contract

## Project Identity
- Project Name: LedgerPrime
- Core Purpose: Hybrid Tally Prime + QuickBooks double-entry bookkeeping, billing, inventory, banking reconciliation, and domestic-to-global tax compliance application.
- Stack (Pinned Lightweight Versions):
  - Frontend: Vite 6 + React 19 + TypeScript + Tailwind CSS v4 + `src/styles/tokens.css` + Lucide React + TanStack Table
  - Backend: Python 3.12 + FastAPI + SQLAlchemy 2.0 (Async) + Alembic + Pydantic v2
  - Database: SQLite (`aiosqlite` WAL mode) locally -> Neon PostgreSQL in production
  - Hosting Target: Cloudflare Pages (Frontend) + Render/Fly.io (Backend) + Neon Postgres (DB)

## Non-Negotiable Accounting Engineering Invariants
1. **ZERO FLOATING-POINT MONEY:** Never use Python `float` or JS binary float math for money, quantities, exchange rates, or tax rates. Backend MUST use `decimal.Decimal` (`NUMERIC(18, 4)` in SQL); API JSON serializes monetary amounts as exact decimal strings (e.g., `"14500.25"`).
2. **DOUBLE-ENTRY ATOMICITY:** Every posted voucher MUST satisfy `SUM(debit_base) == SUM(credit_base)` strictly inside a single database transaction. Reject unbalanced postings with HTTP `422`.
3. **IMMUTABLE AUDIT TRAIL (MCA EDIT LOG):** Never hard-delete posted financial vouchers or silently overwrite them; record every create, edit, and cancellation in `audit_logs` with `before_json`, `after_json`, `actor`, and UTC timestamp.
4. **MULTI-JURISDICTION ISOLATION:** Never hardcode India GST rules into the core double-entry ledger engine. Keep `modules/ledger/` jurisdiction-agnostic and plug `modules/tax_india/` and `modules/tax_global/` cleanly into voucher hooks.

## Hardware Constraints (8 GB RAM Linux Mint)
- Keep dependencies minimal; never install Docker clusters, local Postgres/Redis daemons, or heavy browser automation tools.
- Run only one dev server or build command at a time unless explicitly verifying full-stack endpoints.
- Never run Google Antigravity and VS Code simultaneously.
- Keep total repository size well under 5,000 files and 100 MB (keep `qa-screenshots/` and `.db` files gitignored).

## Privacy and Secret Hygiene
- NEVER read, print, hardcode, or commit real `.env` files, API keys, passwords, real GSTINs, real bank statements, or private business data.
- Reference environment variables strictly from `.env.example`.
- Use ONLY synthetic dummy seed data (`backend/app/seed/dummy_company.py`) for local previews, tests, and Visual QA screenshots.

## Design System Lock (Mandatory)
- Always read `DESIGN_SYSTEM.md` before creating or modifying any UI component, page, or stylesheet.
- Use ONLY the semantic CSS variables, typography scale (`tabular-nums` for all figures), spacing scale, border radii, motion curves, and component recipes defined in `DESIGN_SYSTEM.md`.
- NEVER invent arbitrary hex colors, unmapped spacing values, mixed icon packs, or generic "AI-slop" gradients outside `DESIGN_SYSTEM.md`.

## Execution and Verification Rules
1. Always read `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, `TASK_STATE.md`, `DOCS_REFERENCE.md`, `REA_SPEC.md`, and `CURRENT_TASK.md` before modifying files.
2. Implement ONLY the active milestone in `CURRENT_TASK.md`. Do not refactor unrelated files.
3. Run the exact verification build/test command listed in `CURRENT_TASK.md` after every edit.
4. **2-Strike Error Cap:** If a build or test fails, attempt at most 2 targeted fixes. If still failing after 2 attempts, STOP immediately and write the full terminal output, failing command, and involved file paths into `ERROR_LOG.md`.
5. On success, update `TASK_STATE.md` with completed files, test output summary, and the exact next milestone.

## Beginner Architecture Summary Rule
- At the end of every completed milestone, include a short plain-English summary in `TASK_STATE.md` explaining what each new or modified file does and how accounting/UI data flows between them.
