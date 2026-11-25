# ARCHITECTURE.md — LedgerPrime System Architecture

**Version:** 1.0.0

**Scope:** Phases 1–5 (Basic $\rightarrow$ Advanced · Domestic India Tally/GST $\rightarrow$ Global QuickBooks Multi-Currency/Tax · Manual $\rightarrow$ Automated)

**Target Environment:** Local Dev on 8 GB RAM Linux Mint (`SQLite WAL` + `Vite 6.4` + `FastAPI 0.165.0`) $\rightarrow$ Production Cloud (`Cloudflare Pages` + `Render/Fly.io` + `Neon PostgreSQL`)

---

## 1. High-Level System Architecture & Module Boundaries

LedgerPrime is designed as a **modular monolith** with strict unidirectional domain boundaries so it runs comfortably within an 8 GB RAM local workstation (no Docker clusters, no local Redis/Postgres daemons, no headless browser PDF engines) while scaling cleanly to cloud PostgreSQL in production.

### 1.1 Architectural Layers & Dependency Rules

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Vite 6.4 + React 19.3 + TS)                    │
│  Tailwind v4 (tokens.css) · TanStack Table v9 · TanStack Query v5 · Zod 4    │
│  Tally Keyboard Engine (F4–F9 / Alt+4–9 / Alt+G) · CSS @media print A4 PDF   │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │ HTTPS / JSON (Exact Decimal Strings)
                                        │ Headers: Authorization, X-Company-Id,
                                        │          Idempotency-Key
┌───────────────────────────────────────▼──────────────────────────────────────┐
│                   BACKEND API GATEWAY (FastAPI 0.165.0)                      │
│  Auth & Tenant Context · Pydantic v2.14 Validation · Redacted Error Handler  │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │
┌───────────────────────────────────────▼──────────────────────────────────────┐
│                         DOMAIN MODULES (Modular Monolith)                    │
│                                                                              │
│  ┌──────────────────────┐   Voucher Hooks    ┌────────────────────────────┐  │
│  │  modules/core/       │◄───────────────────│  modules/tax_india/        │  │
│  │  Tenancy, FY, Audit  │                    │  GST, GSTR-1/2B/3B, IMS,   │  │
│  └──────────┬───────────┘                    │  E-Invoice INV-01, TDS     │  │
│             │                                └─────────────▲──────────────┘  │
│  ┌──────────▼───────────┐   Plugin Protocol  ┌─────────────┴──────────────┐  │
│  │  modules/ledger/     │◄───────────────────│  modules/tax_global/       │  │
│  │  Jurisdiction-Free   │                    │  US 1099-NEC (IRIS),       │  │
│  │  Double-Entry Engine │                    │  UK MTD VAT 9-Box          │  │
│  └─▲────────▲────────▲──┘                    └────────────────────────────┘  │
│    │        │        │                                                       │
│  ┌─┴──────┐ ┌┴───────┴────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │modules/│ │modules/     │  │modules/             │  │modules/           │  │
│  │invent- │ │banking/     │  │multicurrency/       │  │automation/        │  │
│  │ory/    │ │CSV, Recon,  │  │FX Rates, Realized & │  │Rules, Recurring,  │  │
│  │FIFO/WAC│ │Setu/Plaid   │  │Unrealized Reval     │  │OCR Draft Pipeline │  │
│  └────────┘ └─────────────┘  └─────────────────────┘  └───────────────────┘  │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │ SQLAlchemy 2.1 Async + Alembic 1.20.1
┌───────────────────────────────────────▼──────────────────────────────────────┐
│  PERSISTENCE LAYER: Dialect-Aware MonetaryNumeric18_4 TypeDecorator          │
│  Local: SQLite (aiosqlite WAL, Scaled 64-bit INT * 10_000)                   │
│  Prod:  Neon PostgreSQL (Native NUMERIC(18,4) + RLS + Append-Only Audit)     │
└──────────────────────────────────────────────────────────────────────────────┘

```

### 1.2 Strict Dependency & Isolation Rules

* **Jurisdiction-Agnostic Core:** `modules/ledger/` MUST NEVER import from `modules/tax_india/` or `modules/tax_global/`. Instead, `modules/ledger/hooks.py` defines an abstract `TaxJurisdictionPlugin` protocol (`compute_voucher_tax`, `validate_before_post`, `on_voucher_posted`, `on_voucher_cancelled`) registered at app startup based on `companies.tax_regime`.


* **Zero Floating-Point Money:** Every backend service accepts and returns `decimal.Decimal` (quantized `ROUND_HALF_UP` to `0.0001`), every FastAPI schema serializes monetary fields as exact decimal strings (e.g., `"14500.2500"`), and frontend forms validate Dr/Cr equality via scaled `BigInt` (`* 10000n`).


* **Theme & Print Standardization:** `frontend/src/styles/tokens.css` uses `[data-theme="dark"]` (from `DESIGN_SYSTEM.md`) mapped in `src/styles/index.css` via `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` and `@theme inline`. Invoice and report PDFs are exported at 0 MB extra RAM via CSS `@media print` forcing Light Mode tokens.



### 1.3 Canonical Repository Layout

```text
ledgerprime/
├── backend/
│   ├── alembic/                      # Async migrations (render_as_batch=True)
│   ├── app/
│   │   ├── main.py                   # FastAPI 0.165.0 entrypoint & router mounting
│   │   ├── config.py                 # Pydantic-settings reading .env (never committed)
│   │   ├── db/
│   │   │   ├── session.py            # AsyncEngine, SQLite WAL PRAGMAs, Neon SSL pool
│   │   │   ├── types.py              # MonetaryNumeric18_4 (SQLite INT*10^4 / PG NUMERIC)
│   │   │   └── base.py               # DeclarativeBase + explicit NAMING_CONVENTION
│   │   ├── security/
│   │   │   ├── auth.py               # JWT/Session auth, password hashing (Argon2/bcrypt)
│   │   │   ├── tenant.py             # X-Company-Id context + RLS session binder
│   │   │   └── crypto.py             # Fernet encryption for bank feed/API secrets
│   │   ├── modules/
│   │   │   ├── core/                 # companies, fiscal_years, audit_logs, global search
│   │   │   ├── ledger/               # account_groups, ledgers, vouchers, voucher_lines, reports
│   │   │   ├── inventory/            # units, godowns, items, stock_batches, stock_movements
│   │   │   ├── banking/              # bank_accounts, CSV parser, recon engine, Setu/Plaid adapters
│   │   │   ├── tax_india/            # GST calc, HSN/SAC, GSTR-1/2B/3B, IMS, E-Invoice, TDS
│   │   │   ├── tax_global/           # US 1099-NEC (IRIS), UK HMRC MTD VAT 9-Box
│   │   │   ├── multicurrency/        # currencies, exchange_rates, realized/unrealized forex
│   │   │   └── automation/           # categorization_rules, recurring_templates, ocr_documents
│   │   └── seed/
│   │       └── dummy_company.py      # Synthetic Bharat Hardware & Exports Pvt. Ltd. (FY 2026-27)
│   └── tests/                        # Pytest async accounting invariant & API test suites
└── frontend/
    ├── vite.config.ts                # Vite 6.4 + @vitejs/plugin-react 5.2 + @tailwindcss/vite 4.3
    └── src/
        ├── styles/                   # tokens.css (locked), index.css (@theme inline + @media print)
        ├── hooks/                    # useKeymap.ts (F4-F9, Alt+4-9, Alt+G), useDensity.ts
        ├── lib/                      # decimal.ts (BigInt math), formatters.ts (INR vs ISO grouping)
        ├── components/               # CommandPalette.tsx, VoucherDrawer.tsx, AccountingTable.tsx
        └── features/                 # dashboard, vouchers, reports, inventory, banking, tax, automation

```

---

## 2. Complete Normalized Database Schema Design

### 2.1 Global Column & Precision Conventions

* **Primary Keys:** `BIGINT` (`INTEGER PRIMARY KEY` on SQLite, `BIGINT GENERATED BY DEFAULT AS IDENTITY` on PostgreSQL) for compact joins and deterministic FIFO ordering (`received_date ASC, id ASC`), with `UUID` (`CHAR(36)` / PG `UUID`) exposed externally on `audit_logs` and webhook/idempotency records.


* **Monetary & Quantity Precision (`NUMERIC(18, 4)`):** All monetary amounts, quantities, unit costs, tax rates, and exchange rates use `MonetaryNumeric18_4`, a dialect-aware SQLAlchemy `TypeDecorator`:


* **PostgreSQL:** Compiles natively to `NUMERIC(18, 4)` (exact fixed-point arithmetic).
* **SQLite:** Compiles to 64-bit signed `INTEGER` scaled by $10^4$ (`value * 10_000`), guaranteeing exact `SUM()`, `<`, `>`, and `ORDER BY` with zero IEEE-754 float drift up to $\pm 922,337,203,685,477.5807$.


* **Overflow Guardrail:** Whenever two scaled columns are multiplied (e.g., `qty_available * unit_cost` in stock valuation, which scales by $10^8$), multiplication MUST execute in Python `Decimal` on SQLite (or native `NUMERIC` cast on PostgreSQL) to prevent 64-bit integer overflow converting silently to `REAL`.




* **Alembic Naming Convention:** All constraints (`pk`, `fk`, `uq`, `ck`, `ix`) MUST be explicitly named on `Base.metadata` so SQLite `render_as_batch=True` migrations succeed without Alembic 1.20+ warnings.


* **Timestamps:** All system timestamps are stored in UTC (`TIMESTAMP WITH TIME ZONE` on Postgres / ISO-8601 UTC `TEXT` on SQLite); accounting dates use timezone-naive `DATE`.

---

### 2.2 Core Ledger & Governance Schema (Phase 1)

#### 1. `companies`

Top-level tenant root; isolates every accounting book, tax regime, and base currency.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Tenant identifier |
| `legal_name` | `VARCHAR(160)` | `NOT NULL` | Registered entity name (e.g., *Bharat Hardware & Exports Pvt. Ltd.*) |
| `trade_name` | `VARCHAR(160)` | `NULL` | Brand/trading name printed on invoices |
| `country_code` | `CHAR(2)` | `NOT NULL DEFAULT 'IN'` | ISO 3166-1 alpha-2 (`IN`, `US`, `GB`, etc.) |
| `base_currency_code` | `CHAR(3)` | `FK -> currencies.code NOT NULL` | Single functional/reporting currency (`INR`, `USD`, `GBP`) |
| `tax_regime` | `VARCHAR(24)` | `NOT NULL CHECK IN ('INDIA_GST','US_FEDERAL','UK_VAT','NONE')` | Active tax hook plugin selector |
| `tax_registration_no` | `VARCHAR(32)` | `NULL` | 15-char GSTIN (India), EIN (US), or VRN (UK) |
| `pan_or_tin` | `VARCHAR(20)` | `NULL` | 10-char PAN (India) / Federal TIN |
| `state_code` | `VARCHAR(8)` | `NULL` | 2-digit Indian GST state code (`09`, `27`) or US state code |
| `address_json` | `JSONB / TEXT` | `NOT NULL DEFAULT '{}'` | Structured street, city, state, postal_code, country |
| `inventory_valuation_method` | `VARCHAR(16)` | `NOT NULL DEFAULT 'FIFO' CHECK IN ('FIFO','WEIGHTED_AVG')` | Perpetual COGS valuation method |
| `books_beginning_from` | `DATE` | `NOT NULL` | Earliest allowable voucher effective date |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Soft-disable tenant without deleting statutory data |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | UTC last update timestamp |

* **Indexes:** `uq_companies_tax_reg (country_code, tax_registration_no) WHERE tax_registration_no IS NOT NULL`.

#### 2. `fiscal_years`

Enforces Tally/statutory FY boundaries (`FY 2026–27`), voucher numbering resets, and period closing locks.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Fiscal year PK |
| `company_id` | `BIGINT` | `FK -> companies.id ON DELETE RESTRICT NOT NULL` | Tenant boundary |
| `label` | `VARCHAR(32)` | `NOT NULL` | Display label (e.g., `FY 2026–27`, `CY 2026`) |
| `start_date` | `DATE` | `NOT NULL` | Inclusive FY start (e.g., `2026-04-01`) |
| `end_date` | `DATE` | `NOT NULL CHECK (end_date > start_date)` | Inclusive FY end (e.g., `2027-03-31`) |
| `lock_date` | `DATE` | `NULL` | Back-dating hard lock; rejects edits/posts on `voucher_date <= lock_date` |
| `is_closed` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Full year-end closure flag |
| `is_current` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Default active FY in Top Bar selector |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | UTC creation timestamp |

* **Constraints & Indexes:** `uq_fiscal_years_company_label (company_id, label)`, `ix_fiscal_years_company_dates (company_id, start_date, end_date)`. Application service validates non-overlapping FY date ranges per `company_id`.

#### 3. `account_groups`

Hierarchical Chart of Accounts tree (Tally Primary Groups $\rightarrow$ Sub-Groups up to 4 UI levels, supporting Schedule III / GAAP rollups).

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Group PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `parent_group_id` | `BIGINT` | `FK -> account_groups.id ON DELETE RESTRICT NULL` | Self-referencing hierarchy root (`NULL` for primary groups) |
| `code` | `VARCHAR(32)` | `NOT NULL` | Group code (e.g., `1000`, `1100`) |
| `name` | `VARCHAR(120)` | `NOT NULL` | e.g., `Current Assets`, `Sundry Debtors`, `Duties & Taxes` |
| `nature` | `VARCHAR(16)` | `NOT NULL CHECK IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')` | Core accounting equation classification |
| `report_section` | `VARCHAR(24)` | `NOT NULL CHECK IN ('BALANCE_SHEET','PROFIT_LOSS')` | Financial statement placement |
| `affects_gross_profit` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Distinguishes Direct Income/Expense (Trading A/c) vs Indirect |
| `is_system_reserved` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Prevents deleting Tally core groups (Cash-in-Hand, Bank Accounts, etc.) |
| `display_order` | `INTEGER` | `NOT NULL DEFAULT 100` | Deterministic statement ordering |

* **Constraints & Indexes:** `uq_account_groups_company_code (company_id, code)`, `uq_account_groups_company_name (company_id, name)`, `ix_account_groups_parent (company_id, parent_group_id)`.

#### 4. `ledgers`

Individual general ledger and sub-ledger accounts (Parties, Banks, Taxes, Income, Expense, Assets, Equity).

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Ledger PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `group_id` | `BIGINT` | `FK -> account_groups.id ON DELETE RESTRICT NOT NULL` | Parent account group |
| `code` | `VARCHAR(32)` | `NOT NULL` | Account code (maps cleanly to `accountCode` in UI forms) |
| `name` | `VARCHAR(160)` | `NOT NULL` | Ledger name (e.g., `HDFC Bank Current A/c`, `Output CGST 9%`) |
| `ledger_sub_type` | `VARCHAR(24)` | `NOT NULL DEFAULT 'GENERAL' CHECK IN ('GENERAL','CUSTOMER','VENDOR','BANK','CASH','TAX','INVENTORY','COGS','ROUND_OFF','FOREX_GAIN_LOSS','RETAINED_EARNINGS')` | Drives automated posting hooks & validation |
| `currency_code` | `CHAR(3)` | `FK -> currencies.code NOT NULL` | Native ledger currency (defaults to company `base_currency_code`) |
| `opening_balance` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (opening_balance >= 0)` | Unsigned opening balance in base currency |
| `opening_balance_side` | `CHAR(2)` | `NOT NULL DEFAULT 'DR' CHECK IN ('DR','CR')` | Normal opening polarity |
| `maintain_bill_by_bill` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Enables Tally invoice-wise AR/AP aging & forex settlement |
| `credit_limit` | `NUMERIC(18, 4)` | `NULL CHECK (credit_limit >= 0)` | Optional customer credit ceiling |
| `credit_days` | `INTEGER` | `NOT NULL DEFAULT 0 CHECK (credit_days >= 0)` | Default invoice payment terms |
| `party_gstin` | `VARCHAR(32)` | `NULL` | Counterparty GSTIN / VAT number |
| `party_pan_or_tin` | `VARCHAR(20)` | `NULL` | Counterparty PAN (TDS 206AA check) or US TIN (1099-NEC) |
| `party_state_code` | `VARCHAR(8)` | `NULL` | Default Place-of-Supply state code for counterparty |
| `party_country_code` | `CHAR(2)` | `NULL` | Counterparty ISO country (`IN`, `US`, `GB`) |
| `is_1099_eligible` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Marks US nonemployee contractor for TY 2026 1099-NEC tracking |
| `default_tds_section_id` | `BIGINT` | `FK -> tds_sections.id NULL` | Default TDS deduction section for vendor |
| `default_tax_rate_id` | `BIGINT` | `FK -> tax_rates.id NULL` | Default GST/VAT rate for tax or expense ledgers |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Soft archive (never hard-delete ledgers with posted lines) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | UTC creation timestamp |

* **Constraints & Indexes:** `uq_ledgers_company_code (company_id, code)`, `uq_ledgers_company_name (company_id, name)`, `ix_ledgers_company_group (company_id, group_id)`, `ix_ledgers_company_gstin (company_id, party_gstin)`.

#### 5. `vouchers`

Unified atomic header for all accounting transactions (`F4` Contra through `F9` Purchase, Credit/Debit Notes, Forex Revaluations, Stock Journals, Tax Set-Offs).

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Voucher PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `fiscal_year_id` | `BIGINT` | `FK -> fiscal_years.id ON DELETE RESTRICT NOT NULL` | Enforces FY partition |
| `voucher_type` | `VARCHAR(24)` | `NOT NULL CHECK IN ('CONTRA','PAYMENT','RECEIPT','JOURNAL','SALES','PURCHASE','CREDIT_NOTE','DEBIT_NOTE','STOCK_JOURNAL','FOREX_REVAL','TAX_SETOFF')` | Maps to `F4`–`F9` and specialized journals |
| `voucher_no` | `VARCHAR(40)` | `NOT NULL` | Sequential FY-scoped number (e.g., `INV/26-27/0042`) |
| `voucher_date` | `DATE` | `NOT NULL` | Effective accounting date |
| `due_date` | `DATE` | `NULL` | Payment due date for AR/AP aging |
| `status` | `VARCHAR(16)` | `NOT NULL DEFAULT 'POSTED' CHECK IN ('DRAFT','POSTED','OPTIONAL','POST_DATED','CANCELLED')` | Controls trial balance inclusion per `DESIGN_SYSTEM.md` §8.8 |
| `party_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | Counterparty customer/vendor ledger (invoices/notes) |
| `reference_no` | `VARCHAR(64)` | `NULL` | Supplier invoice no., cheque no., or UTR/RRN |
| `reference_date` | `DATE` | `NULL` | Original supplier invoice date or instrument date |
| `original_voucher_id` | `BIGINT` | `FK -> vouchers.id NULL` | Links Credit/Debit Note or Reversal to source voucher |
| `currency_code` | `CHAR(3)` | `FK -> currencies.code NOT NULL` | Transaction currency (`INR`, `USD`, `GBP`) |
| `exchange_rate` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 1.0000 CHECK (exchange_rate > 0)` | Conversion multiplier `1 txn_currency = rate * base_currency` |
| `total_debit_base` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (total_debit_base >= 0)` | Cached base-currency Dr total (validated == Cr total) |
| `total_credit_base` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (total_credit_base >= 0)` | Cached base-currency Cr total |
| `place_of_supply` | `VARCHAR(8)` | `NULL` | 2-digit Indian state code (`09`, `27`, `96` export) or US state |
| `supply_type` | `VARCHAR(16)` | `NULL CHECK IN ('B2B','B2CL','B2CS','EXPWP','EXPWOP','SEZWP','SEZWOP','DEEMED_EXP','EXEMPT','NIL')` | India GSTR-1 / E-Invoice classification |
| `is_reverse_charge` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Flags GST/VAT Reverse Charge Mechanism (RCM) |
| `irn` | `CHAR(64)` | `NULL` | NIC E-Invoice 64-char SHA-256 IRN (if generated) |
| `ack_no` | `VARCHAR(32)` | `NULL` | NIC E-Invoice Acknowledgement Number |
| `ack_date` | `TIMESTAMPTZ` | `NULL` | NIC E-Invoice Acknowledgement UTC timestamp |
| `signed_qr_code` | `TEXT` | `NULL` | Signed JWT string for printed A4 QR code |
| `narration` | `VARCHAR(500)` | `NOT NULL DEFAULT ''` | Accounting narration / memo |
| `idempotency_key` | `VARCHAR(64)` | `NULL` | Prevents duplicate POST on network retry |
| `version_seq` | `INTEGER` | `NOT NULL DEFAULT 1` | Optimistic lock & MCA edit-log version counter |
| `source_ocr_doc_id` | `BIGINT` | `FK -> ocr_documents.id NULL` | Links draft/posted voucher to source OCR file |
| `source_recurring_id` | `BIGINT` | `FK -> recurring_templates.id NULL` | Links auto-generated voucher to recurring template |
| `created_by` | `BIGINT` | `NOT NULL` | Actor user ID |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Immutable system creation UTC timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last modification UTC timestamp |

* **Constraints & Indexes:**
* `ck_vouchers_posted_balanced`: `status != 'POSTED' OR (total_debit_base > 0 AND total_debit_base = total_credit_base)`
* `uq_vouchers_company_fy_type_no (company_id, fiscal_year_id, voucher_type, voucher_no)`
* `uq_vouchers_company_idempotency (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL`
* `ix_vouchers_company_date_status (company_id, voucher_date, status)`
* `ix_vouchers_company_party (company_id, party_ledger_id, voucher_date)`
* `ix_vouchers_irn (company_id, irn) WHERE irn IS NOT NULL`



#### 6. `voucher_lines`

Atomic double-entry debit/credit legs belonging to a `vouchers` header.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Line PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Denormalized tenant FK for fast RLS & single-table scans |
| `voucher_id` | `BIGINT` | `FK -> vouchers.id ON DELETE RESTRICT NOT NULL` | Parent voucher (no cascade delete on posted vouchers) |
| `line_no` | `INTEGER` | `NOT NULL CHECK (line_no >= 1)` | Deterministic display & print line sequence |
| `ledger_id` | `BIGINT` | `FK -> ledgers.id ON DELETE RESTRICT NOT NULL` | Target ledger account |
| `line_role` | `VARCHAR(24)` | `NOT NULL DEFAULT 'STANDARD' CHECK IN ('STANDARD','PARTY','TAX_CGST','TAX_SGST','TAX_IGST','TAX_CESS','TAX_VAT','TDS_PAYABLE','COGS','INVENTORY','ROUND_OFF','FOREX_DIFF','BANK_CHARGE')` | Semantic tag for report & tax extractors |
| `debit_txn` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (debit_txn >= 0)` | Debit amount in transaction currency |
| `credit_txn` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (credit_txn >= 0)` | Credit amount in transaction currency |
| `debit_base` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (debit_base >= 0)` | Debit amount in company base currency (`debit_txn * rate`) |
| `credit_base` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (credit_base >= 0)` | Credit amount in company base currency (`credit_txn * rate`) |
| `tax_rate_id` | `BIGINT` | `FK -> tax_rates.id NULL` | Associated GST/VAT tax slab (for tax return bucketing) |
| `hsn_sac_id` | `BIGINT` | `FK -> hsn_sac_codes.id NULL` | HSN/SAC classification for service/non-inventory lines |
| `tds_section_id` | `BIGINT` | `FK -> tds_sections.id NULL` | TDS section tag when `line_role = 'TDS_PAYABLE'` |
| `is_itc_eligible` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | False for Sec 17(5) blocked credit / exempt inward supplies |
| `cost_center` | `VARCHAR(64)` | `NULL` | Optional department/project tagging |
| `line_narration` | `VARCHAR(255)` | `NULL` | Line-level memo or bill reference |

* **Constraints & Indexes:**
* `ck_voucher_lines_mutually_exclusive_base`: `(debit_base > 0 AND credit_base = 0) OR (credit_base > 0 AND debit_base = 0)`
* `ck_voucher_lines_mutually_exclusive_txn`: `(debit_txn > 0 AND credit_txn = 0) OR (credit_txn > 0 AND debit_txn = 0)`
* `uq_voucher_lines_order (voucher_id, line_no)`
* `ix_voucher_lines_company_ledger (company_id, ledger_id, voucher_id)` (primary index for Trial Balance & Ledger Statements)
* `ix_voucher_lines_voucher (voucher_id)`



#### 7. `audit_logs` (MCA Rule 3(1) & Rule 11(g) Tamper-Evident Edit Log)

Strictly append-only cryptographic hash-chained log capturing every create, update, cancellation, and master reclassification across books of account.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Monotonic sequence per database |
| `audit_uuid` | `CHAR(36) / UUID` | `UNIQUE NOT NULL` | Externally verifiable audit record UUID |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `entity_type` | `VARCHAR(40)` | `NOT NULL` | e.g., `VOUCHER`, `LEDGER`, `ACCOUNT_GROUP`, `ITEM`, `FISCAL_YEAR`, `RECON_MATCH` |
| `entity_id` | `BIGINT` | `NOT NULL` | PK of mutated record |
| `entity_ref` | `VARCHAR(64)` | `NOT NULL` | Human-readable voucher number or ledger code |
| `version_seq` | `INTEGER` | `NOT NULL CHECK (version_seq >= 1)` | Monotonically increasing version per `(entity_type, entity_id)` |
| `action_type` | `VARCHAR(16)` | `NOT NULL CHECK IN ('CREATE','UPDATE','CANCEL','LOCK','RECLASSIFY')` | Never `HARD_DELETE` for posted vouchers |
| `actor_user_id` | `BIGINT` | `NOT NULL` | Authenticated user / system worker ID |
| `actor_email` | `VARCHAR(160)` | `NOT NULL` | Denormalized actor identity for 8-year standalone auditability |
| `actor_ip` | `VARCHAR(45)` | `NULL` | IPv4/IPv6 request address |
| `effective_date` | `DATE` | `NULL` | Accounting period date (separates back-dating from system clock) |
| `logged_at_utc` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Server-generated immutable UTC timestamp |
| `before_json` | `JSONB / TEXT` | `NULL` | Full canonical JSON snapshot prior to mutation (`NULL` on `CREATE`) |
| `after_json` | `JSONB / TEXT` | `NOT NULL` | Full canonical JSON snapshot post mutation |
| `field_diffs_json` | `JSONB / TEXT` | `NOT NULL DEFAULT '[]'` | Structured array of `{"field","old","new"}` changes |
| `prev_record_hash` | `CHAR(64)` | `NOT NULL` | SHA-256 `record_hash` of preceding `audit_logs` row for this `company_id` (`'0'*64` for genesis) |
| `record_hash` | `CHAR(64)` | `NOT NULL` | `SHA256(prev_record_hash |

* **Constraints & Indexes:** `uq_audit_logs_entity_ver (company_id, entity_type, entity_id, version_seq)`, `ix_audit_logs_company_time (company_id, logged_at_utc DESC)`, `ix_audit_logs_entity (company_id, entity_type, entity_id)`.
* **Engine-Level Immutability:** SQLite installs `BEFORE UPDATE` and `BEFORE DELETE` triggers calling `RAISE(ABORT, 'MCA Rule 3(1): audit_logs is strictly append-only')`; PostgreSQL executes `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM PUBLIC, app_readwrite_role;`.



> **Auxiliary Core Tables (Tenancy & Bill-by-Bill AR/AP):**
> * `users` (`id`, `email` UNIQUE, `full_name`, `password_hash`, `is_active`, `created_at`) and `company_memberships` (`id`, `company_id`, `user_id`, `role CHECK IN ('OWNER','ACCOUNTANT','DATA_ENTRY','AUDITOR_READONLY')`, `UNIQUE(company_id, user_id)`).
> * `bill_allocations` (`id`, `company_id`, `voucher_line_id` FK, `ledger_id` FK, `bill_ref` VARCHAR(64), `allocation_type CHECK IN ('NEW_REF','AGST_REF','ADVANCE','ON_ACCOUNT')`, `amount_txn NUMERIC(18,4)`, `amount_base NUMERIC(18,4)`, `booking_exchange_rate NUMERIC(18,4)`, `due_date DATE`) — enables Tally-style invoice-wise aging and exact **Realized Forex Gain/Loss** calculation upon foreign currency receipt/payment settlement.
> 
> 

---

### 2.3 Inventory & Costing Schema (Phase 2)

#### 8. `units`

Units of Measurement aligned with Indian GST UQC standards (`NOS`, `KGS`, `MTR`, `BOX`, `NA`) and display decimal precision.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Unit PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `symbol` | `VARCHAR(16)` | `NOT NULL` | Short label (`Nos`, `kg`, `m`) |
| `formal_name` | `VARCHAR(64)` | `NOT NULL` | Full name (`Numbers`, `Kilograms`, `Meters`) |
| `uqc_code` | `VARCHAR(16)` | `NOT NULL DEFAULT 'NOS'` | GSTN UQC code (`NOS`, `KGS`, `MTR`, `NA` for services) |
| `decimal_places` | `SMALLINT` | `NOT NULL DEFAULT 0 CHECK (decimal_places BETWEEN 0 AND 4)` | UI & rounding precision (`Nos`=0, `kg`=3, `m`=2) |
| `base_unit_id` | `BIGINT` | `FK -> units.id NULL` | Optional compound unit conversion (e.g., `1 BOX = 12 NOS`) |
| `conversion_factor` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 1.0000 CHECK (conversion_factor > 0)` | Multiplier to base unit |

* **Constraints & Indexes:** `uq_units_company_symbol (company_id, symbol)`.

#### 9. `godowns`

Physical warehouses, retail counters, or third-party consignment locations.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Godown PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `parent_godown_id` | `BIGINT` | `FK -> godowns.id NULL` | Supports warehouse $\rightarrow$ bin hierarchy |
| `code` | `VARCHAR(32)` | `NOT NULL` | Short code (e.g., `MAIN-WH`, `SHOP-01`) |
| `name` | `VARCHAR(120)` | `NOT NULL` | Display name |
| `address_json` | `JSONB / TEXT` | `NULL` | Location address (used for E-Invoice `ShipDtls` / E-Way Bill) |
| `state_code` | `VARCHAR(8)` | `NULL` | 2-digit GST state code |
| `is_default` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Default dispatch/receipt godown |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Soft disable |

* **Constraints & Indexes:** `uq_godowns_company_code (company_id, code)`, `uq_godowns_company_name (company_id, name)`.

#### 10. `items`

Goods and Services catalog linking SKUs to HSN/SAC codes, tax slabs, units, and GL posting accounts.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Item PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `sku` | `VARCHAR(64)` | `NOT NULL` | Stock Keeping Unit / Barcode |
| `name` | `VARCHAR(160)` | `NOT NULL` | Item description (e.g., *Copper Wire Coil 2.5mm*) |
| `item_type` | `VARCHAR(16)` | `NOT NULL DEFAULT 'GOODS' CHECK IN ('GOODS','SERVICE','NON_INVENTORY')` | Only `GOODS` creates `stock_batches` & perpetual COGS |
| `unit_id` | `BIGINT` | `FK -> units.id ON DELETE RESTRICT NOT NULL` | Primary stock unit |
| `hsn_sac_id` | `BIGINT` | `FK -> hsn_sac_codes.id NULL` | Statutory HSN (goods) or SAC (services) |
| `default_tax_rate_id` | `BIGINT` | `FK -> tax_rates.id NULL` | Default GST/VAT slab |
| `inventory_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | Balance Sheet Asset ledger (mandatory when `item_type='GOODS'`) |
| `cogs_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | P&L Direct Expense COGS ledger |
| `sales_ledger_id` | `BIGINT` | `FK -> ledgers.id NOT NULL` | Default Revenue ledger |
| `purchase_ledger_id` | `BIGINT` | `FK -> ledgers.id NOT NULL` | Default Purchase/Clearing ledger |
| `standard_selling_price` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (standard_selling_price >= 0)` | Default invoice rate |
| `standard_purchase_cost` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (standard_purchase_cost >= 0)` | Reference purchase cost |
| `reorder_level` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (reorder_level >= 0)` | Low-stock alert threshold |
| `track_batches` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Enables explicit lot/expiry tracking (FIFO lots always tracked internally) |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Soft archive |

* **Constraints & Indexes:** `uq_items_company_sku (company_id, sku)`, `ix_items_company_hsn (company_id, hsn_sac_id)`.

#### 11. `stock_batches`

Inbound inventory cost layers (FIFO lots) partitioned by `(company_id, item_id, godown_id)`.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Batch PK (tie-breaker in FIFO `received_date ASC, id ASC`) |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `item_id` | `BIGINT` | `FK -> items.id ON DELETE RESTRICT NOT NULL` | Stock item |
| `godown_id` | `BIGINT` | `FK -> godowns.id ON DELETE RESTRICT NOT NULL` | Warehouse holding this lot |
| `batch_no` | `VARCHAR(64)` | `NOT NULL` | Lot/Batch code or auto-generated `LOT-YYYYMMDD-NNNN` |
| `source_voucher_id` | `BIGINT` | `FK -> vouchers.id NULL` | Originating Purchase Invoice / Opening Stock / Transfer voucher |
| `received_date` | `DATE` | `NOT NULL` | FIFO queue ordering date |
| `mfg_date` | `DATE` | `NULL` | Optional manufacturing date |
| `expiry_date` | `DATE` | `NULL` | Optional expiry date (FEFO/pharma support) |
| `qty_in` | `NUMERIC(18, 4)` | `NOT NULL CHECK (qty_in > 0)` | Original lot quantity received |
| `qty_available` | `NUMERIC(18, 4)` | `NOT NULL CHECK (qty_available >= 0 AND qty_available <= qty_in)` | Remaining unconsumed quantity |
| `unit_cost_base` | `NUMERIC(18, 4)` | `NOT NULL CHECK (unit_cost_base >= 0)` | Landed unit cost in company base currency (net of recoverable ITC) |

* **Constraints & Indexes:** `ix_stock_batches_fifo_lookup (company_id, item_id, godown_id, received_date, id) WHERE qty_available > 0`, `ix_stock_batches_expiry (company_id, expiry_date) WHERE expiry_date IS NOT NULL`.

#### 12. `stock_movements`

Immutable inventory sub-ledger recording every physical IN/OUT/TRANSFER/ADJUSTMENT and linking each outbound sale directly to the exact `stock_batches` consumed for COGS auditability.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Movement PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `voucher_id` | `BIGINT` | `FK -> vouchers.id ON DELETE RESTRICT NOT NULL` | Owning invoice, credit note, or stock journal |
| `voucher_line_id` | `BIGINT` | `FK -> voucher_lines.id NULL` | Corresponding revenue/inventory GL line |
| `item_id` | `BIGINT` | `FK -> items.id ON DELETE RESTRICT NOT NULL` | Stock item |
| `godown_id` | `BIGINT` | `FK -> godowns.id ON DELETE RESTRICT NOT NULL` | Affected warehouse |
| `batch_id` | `BIGINT` | `FK -> stock_batches.id ON DELETE RESTRICT NOT NULL` | Exact FIFO lot added or consumed |
| `movement_date` | `DATE` | `NOT NULL` | Effective stock date |
| `direction` | `VARCHAR(16)` | `NOT NULL CHECK IN ('IN','OUT','TRANSFER_IN','TRANSFER_OUT','ADJUST_IN','ADJUST_OUT')` | Physical stock direction |
| `quantity` | `NUMERIC(18, 4)` | `NOT NULL CHECK (quantity > 0)` | Unsigned quantity moved |
| `unit_rate_txn` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (unit_rate_txn >= 0)` | Invoice selling/purchase rate per unit in txn currency |
| `unit_cost_base` | `NUMERIC(18, 4)` | `NOT NULL CHECK (unit_cost_base >= 0)` | Exact FIFO/WAC cost per unit in base currency |
| `total_cost_base` | `NUMERIC(18, 4)` | `NOT NULL CHECK (total_cost_base >= 0)` | Exact COGS or inventory valuation impact (`quantity * unit_cost_base`) |
| `is_reversed` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | True if parent voucher was cancelled and lot restored |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | UTC creation timestamp |

* **Constraints & Indexes:** `ix_stock_movements_item_date (company_id, item_id, movement_date, id)`, `ix_stock_movements_voucher (voucher_id)`, `ix_stock_movements_batch (batch_id)`.

---

### 2.4 Banking & Reconciliation Schema (Phase 3)

#### 13. `bank_accounts`

Maps each real-world bank/credit-card/payment-gateway account 1-to-1 to a `ledgers` account (`ledger_sub_type = 'BANK'`), supporting both CSV imports and Setu AA / Plaid feeds.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Bank Account PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `ledger_id` | `BIGINT` | `FK -> ledgers.id ON DELETE RESTRICT UNIQUE NOT NULL` | 1:1 link to Asset/Credit-Card ledger |
| `bank_name` | `VARCHAR(80)` | `NOT NULL` | e.g., `HDFC Bank`, `SBI`, `ICICI`, `Mercury` |
| `account_holder_name` | `VARCHAR(160)` | `NOT NULL` | Registered account title |
| `account_number_masked` | `VARCHAR(32)` | `NOT NULL` | Masked digits only (e.g., `XXXXXX4821`) — never store raw full account numbers unless encrypted |
| `ifsc_or_routing_code` | `VARCHAR(20)` | `NULL` | 11-char Indian IFSC or ABA/SWIFT/Sort Code |
| `currency_code` | `CHAR(3)` | `FK -> currencies.code NOT NULL` | Bank account currency |
| `default_csv_preset` | `VARCHAR(24)` | `NOT NULL DEFAULT 'AUTO' CHECK IN ('AUTO','HDFC','SBI','ICICI','AXIS','GENERIC_CSV','OFX')` | Parser profile |
| `feed_provider` | `VARCHAR(24)` | `NOT NULL DEFAULT 'MANUAL' CHECK IN ('MANUAL','SETU_AA','PLAID')` | Automated live feed provider (Phase 5) |
| `feed_consent_or_item_id` | `VARCHAR(128)` | `NULL` | Setu `consentId` or Plaid `item_id` |
| `feed_token_encrypted` | `TEXT` | `NULL` | Fernet-encrypted Plaid `access_token` or AA secret |
| `feed_sync_cursor` | `TEXT` | `NULL` | Plaid `/transactions/sync` cursor or AA last fetch timestamp |
| `last_synced_at` | `TIMESTAMPTZ` | `NULL` | Latest successful sync UTC timestamp |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Soft archive |

* **Constraints & Indexes:** `uq_bank_accounts_company_ledger (company_id, ledger_id)`.

#### 14. `bank_statement_lines`

Idempotent imported bank statement transactions (from Indian CSVs, OFX, Setu AA, or Plaid).

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Statement line PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `bank_account_id` | `BIGINT` | `FK -> bank_accounts.id ON DELETE RESTRICT NOT NULL` | Owning bank account |
| `txn_date` | `DATE` | `NOT NULL` | Transaction posting date on bank statement |
| `value_date` | `DATE` | `NULL` | Bank value/clearing date |
| `narration` | `VARCHAR(500)` | `NOT NULL` | Raw bank description |
| `raw_ref_no` | `VARCHAR(120)` | `NOT NULL DEFAULT ''` | Raw Cheque/Ref column |
| `extracted_ref` | `VARCHAR(64)` | `NULL` | Normalized UTR / 12-digit UPI or IMPS RRN / stripped Cheque no. |
| `payment_mode` | `VARCHAR(24)` | `NULL` | `UPI`, `NEFT`, `RTGS`, `IMPS`, `CHEQUE`, `ACH`, `CARD` |
| `withdrawal` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (withdrawal >= 0)` | Money OUT on bank statement (matches Ledger **Credit**) |
| `deposit` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (deposit >= 0)` | Money IN on bank statement (matches Ledger **Debit**) |
| `closing_balance` | `NUMERIC(18, 4)` | `NULL` | Running bank balance from statement |
| `allocated_amount` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (allocated_amount >= 0)` | Sum of matched amounts in `reconciliation_matches` |
| `status` | `VARCHAR(16)` | `NOT NULL DEFAULT 'UNRECONCILED' CHECK IN ('UNRECONCILED','PARTIAL','RECONCILED','IGNORED')` | Reconciliation state |
| `source_type` | `VARCHAR(16)` | `NOT NULL DEFAULT 'CSV' CHECK IN ('CSV','OFX','SETU_AA','PLAID')` | Ingestion origin |
| `external_txn_id` | `VARCHAR(128)` | `NULL` | Provider `txnId` / `transaction_id` for live feeds |
| `row_hash` | `CHAR(64)` | `NOT NULL` | Deterministic SHA-256 fingerprint preventing duplicate re-imports |
| `imported_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Ingestion UTC timestamp |

* **Constraints & Indexes:**
* `ck_bank_stmt_single_sided`: `(withdrawal > 0 AND deposit = 0) OR (deposit > 0 AND withdrawal = 0)`
* `ck_bank_stmt_not_over_allocated`: `allocated_amount <= (withdrawal + deposit)`
* `uq_bank_stmt_company_hash (company_id, row_hash)`
* `ix_bank_stmt_lookup (company_id, bank_account_id, status, txn_date)`
* `ix_bank_stmt_ref (company_id, bank_account_id, extracted_ref) WHERE extracted_ref IS NOT NULL`



#### 15. `reconciliation_matches`

Many-to-many allocation bridge supporting 1:1 exact matches, 1:N batch/net-of-fee settlements, and N:1 split gateway tranches.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Match PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `statement_line_id` | `BIGINT` | `FK -> bank_statement_lines.id ON DELETE CASCADE NOT NULL` | Bank side |
| `voucher_line_id` | `BIGINT` | `FK -> voucher_lines.id ON DELETE RESTRICT NOT NULL` | Book side (MUST belong to `bank_accounts.ledger_id`) |
| `matched_amount` | `NUMERIC(18, 4)` | `NOT NULL CHECK (matched_amount > 0)` | Allocated amount in bank account currency |
| `match_method` | `VARCHAR(20)` | `NOT NULL CHECK IN ('AUTO_REF','AUTO_RULE','MANUAL','SPLIT')` | Audit classification of match |
| `confidence_score` | `SMALLINT` | `NOT NULL DEFAULT 100 CHECK (confidence_score BETWEEN 0 AND 100)` | Scoring engine output (`60 + 25 + 15 = 100`) |
| `matched_by` | `BIGINT` | `NULL` | User ID (`NULL` for automated system matches) |
| `matched_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Reconciliation UTC timestamp |

* **Constraints & Indexes:** `uq_recon_stmt_vline (statement_line_id, voucher_line_id)`, `ix_recon_vline (company_id, voucher_line_id)`, `ix_recon_stmt (company_id, statement_line_id)`.

---

### 2.5 Tax & Statutory Compliance Schema (Phases 2–4)

#### 16. `tax_jurisdictions`

Decouples domestic India GST/TDS from global tax regimes (US Sales Tax / 1099-NEC, UK MTD VAT, EU VAT).

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Jurisdiction PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `code` | `VARCHAR(24)` | `NOT NULL` | e.g., `IN-GST`, `IN-TDS`, `US-FED`, `US-CA`, `GB-HMRC` |
| `name` | `VARCHAR(120)` | `NOT NULL` | Display name (e.g., `India GST (CGST/SGST/IGST)`) |
| `country_code` | `CHAR(2)` | `NOT NULL` | ISO alpha-2 country |
| `region_code` | `VARCHAR(16)` | `NULL` | State/Province code (`09`, `CA`, `GB`) |
| `tax_authority` | `VARCHAR(80)` | `NOT NULL` | `GSTN / CBIC`, `CBDT`, `IRS`, `HMRC` |
| `regime_type` | `VARCHAR(24)` | `NOT NULL CHECK IN ('GST_IN','TDS_IN','VAT_UK','SALES_TAX_US','WITHHOLDING_US','OTHER')` | Plugin routing discriminator |
| `filing_frequency` | `VARCHAR(16)` | `NOT NULL DEFAULT 'MONTHLY' CHECK IN ('MONTHLY','QUARTERLY','ANNUAL')` | Compliance calendar cadence |
| `registration_id` | `VARCHAR(40)` | `NULL` | Jurisdiction-specific GSTIN / VRN / TAN / EIN |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Active toggle |

* **Constraints & Indexes:** `uq_tax_jurisdictions_company_code (company_id, code)`.

#### 17. `tax_rates`

Effective-dated statutory tax slabs with explicit component splits and GL output/input ledger mappings.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Tax rate PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `jurisdiction_id` | `BIGINT` | `FK -> tax_jurisdictions.id ON DELETE RESTRICT NOT NULL` | Owning jurisdiction |
| `code` | `VARCHAR(32)` | `NOT NULL` | e.g., `GST-18`, `GST-5`, `UK-VAT-20`, `UK-VAT-ZERO` |
| `name` | `VARCHAR(80)` | `NOT NULL` | Human label (`GST 18%`, `UK Standard VAT 20%`) |
| `total_rate` | `NUMERIC(18, 4)` | `NOT NULL CHECK (total_rate >= 0 AND total_rate <= 100)` | Combined rate (e.g., `18.0000`, `20.0000`) |
| `cgst_rate` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (cgst_rate >= 0)` | India Central GST component (`9.0000`) |
| `sgst_rate` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (sgst_rate >= 0)` | India State/UT GST component (`9.0000`) |
| `igst_rate` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (igst_rate >= 0)` | India Integrated GST component (`18.0000`) |
| `cess_rate` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (cess_rate >= 0)` | India Compensation Cess (`0.0000` or ad-valorem %) |
| `output_tax_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | Default Output Tax liability ledger (or IGST/VAT output) |
| `input_tax_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | Default Input Tax Credit asset ledger |
| `cgst_output_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | India Output CGST ledger |
| `sgst_output_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | India Output SGST ledger |
| `cgst_input_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | India Input CGST ledger |
| `sgst_input_ledger_id` | `BIGINT` | `FK -> ledgers.id NULL` | India Input SGST ledger |
| `effective_from` | `DATE` | `NOT NULL` | Rate start date |
| `effective_to` | `DATE` | `NULL` | Rate sunset date (`NULL` = currently active) |
| `is_reverse_charge_applicable` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Flags RCM-eligible slabs |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Soft toggle |

* **Constraints & Indexes:**
* `ck_tax_rates_gst_split`: `igst_rate = 0 OR (cgst_rate + sgst_rate = igst_rate)`


* `uq_tax_rates_company_code_eff (company_id, jurisdiction_id, code, effective_from)`



#### 18. `hsn_sac_codes`

Harmonized System of Nomenclature (4/6/8-digit goods) and Services Accounting Codes (`99xxxx`) validated for GSTR-1 Table 12A (`hsn_b2b`) and Table 12B (`hsn_b2c`).

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | HSN/SAC PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `code` | `VARCHAR(8)` | `NOT NULL` | 4, 6, or 8 digits (HSN) or 6 digits starting with `99` (SAC) |
| `classification` | `VARCHAR(3)` | `NOT NULL CHECK IN ('HSN','SAC')` | Goods vs Services discriminator |
| `description` | `VARCHAR(255)` | `NOT NULL` | Official GSTN description |
| `default_tax_rate_id` | `BIGINT` | `FK -> tax_rates.id NULL` | Linked GST slab |
| `default_uqc` | `VARCHAR(16)` | `NOT NULL DEFAULT 'NOS'` | Mandatory `'NA'` when `classification = 'SAC'` |

* **Constraints & Indexes:**
* `ck_hsn_sac_uqc`: `classification != 'SAC' OR default_uqc = 'NA'`
* `uq_hsn_sac_company_code (company_id, code)`



#### 19. `gstr2b_records`

Stores downloaded GSTN GSTR-2B JSON invoices/credit notes, recipient **IMS actions (`A`/`R`/`P`/`NAT`)**, and 3-way reconciliation status against Purchase Register vouchers.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Record PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `return_period` | `CHAR(6)` | `NOT NULL` | GSTN `rtnprd` format `MMYYYY` (e.g., `102026`) |
| `doc_category` | `VARCHAR(16)` | `NOT NULL CHECK IN ('B2B','B2BA','CDNR','CDNRA','ISD','IMPG','IMPGSEZ')` | GSTR-2B section |
| `supplier_gstin` | `VARCHAR(15)` | `NOT NULL` | Counterparty `ctin` |
| `supplier_name` | `VARCHAR(160)` | `NOT NULL DEFAULT ''` | Counterparty `trdnm` |
| `supplier_filing_date` | `DATE` | `NULL` | `supfildt` |
| `invoice_no` | `VARCHAR(40)` | `NOT NULL` | Supplier `inum` |
| `invoice_date` | `DATE` | `NOT NULL` | Supplier `dt` |
| `invoice_type` | `VARCHAR(8)` | `NOT NULL DEFAULT 'R'` | `R` (Regular), `SEWP`, `SEWOP`, `CBW`, `DE` |
| `place_of_supply` | `VARCHAR(8)` | `NOT NULL` | 2-digit state code (`pos`) |
| `is_reverse_charge` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | `rev == 'Y'` (bypasses IMS) |
| `taxable_value` | `NUMERIC(18, 4)` | `NOT NULL` | `txval` |
| `igst_amount` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000` | `iamt` |
| `cgst_amount` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000` | `camt` |
| `sgst_amount` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000` | `samt` |
| `cess_amount` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000` | `csamt` |
| `invoice_value` | `NUMERIC(18, 4)` | `NOT NULL` | Total `val` |
| `itc_availability` | `CHAR(1)` | `NOT NULL DEFAULT 'Y' CHECK IN ('Y','N')` | GSTN `itcavl` flag |
| `itc_reason` | `VARCHAR(120)` | `NULL` | `rsn` (e.g., POS rule, Sec 16(4) time-barred) |
| `ims_action` | `VARCHAR(4)` | `NOT NULL DEFAULT 'NAT' CHECK IN ('A','R','P','NAT')` | IMS action: Accept, Reject, Pending, Deemed Accepted |
| `ims_pending_periods` | `SMALLINT` | `NOT NULL DEFAULT 0` | Tracks Oct 2025 cap: inward Credit Notes max 1 period pending |
| `source_type` | `VARCHAR(24)` | `NULL` | `E-Invoice` vs `GSTR-1` (`srctyp`) |
| `irn` | `CHAR(64)` | `NULL` | Supplier E-Invoice IRN |
| `matched_voucher_id` | `BIGINT` | `FK -> vouchers.id NULL` | Linked Purchase / Debit Note voucher in LedgerPrime |
| `recon_status` | `VARCHAR(24)` | `NOT NULL DEFAULT 'MISSING_IN_BOOKS' CHECK IN ('EXACT_MATCH','VALUE_MISMATCH','MISSING_IN_BOOKS','MISSING_IN_2B','REJECTED_IMS','PENDING_IMS')` | 2B vs Books reconciliation bucket |
| `variance_amount` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000` | Tax difference (`2B tax - Books tax`) |
| `raw_payload_json` | `JSONB / TEXT` | `NULL` | Original GSTN JSON object for audit traceability |

* **Constraints & Indexes:**
* `uq_gstr2b_doc (company_id, return_period, doc_category, supplier_gstin, invoice_no)`
* `ix_gstr2b_recon (company_id, return_period, recon_status, ims_action)`
* `ix_gstr2b_voucher (matched_voucher_id) WHERE matched_voucher_id IS NOT NULL`



#### 20. `tds_sections`

India Income Tax TDS master (Sections 194C, 194J, 194I, 194H, 194Q, 195) enforcing single-invoice and annual aggregate threshold triggers and Section 206AA higher rate when PAN is missing.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | TDS section PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `section_code` | `VARCHAR(16)` | `NOT NULL` | e.g., `194C`, `194J(a)`, `194J(b)`, `194I(b)`, `194Q` |
| `description` | `VARCHAR(160)` | `NOT NULL` | Statutory nature of payment |
| `rate_individual_huf` | `NUMERIC(18, 4)` | `NOT NULL CHECK (rate_individual_huf >= 0 AND rate_individual_huf <= 100)` | Rate for Individual/HUF deductees (e.g., `1.0000` for 194C) |
| `rate_company_other` | `NUMERIC(18, 4)` | `NOT NULL CHECK (rate_company_other >= 0 AND rate_company_other <= 100)` | Rate for Company/Firm deductees (e.g., `2.0000` for 194C) |
| `rate_no_pan` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 20.0000` | Sec 206AA penalty rate when `party_pan_or_tin IS NULL` |
| `single_txn_threshold` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (single_txn_threshold >= 0)` | e.g., `30000.0000` for 194C |
| `annual_agg_threshold` | `NUMERIC(18, 4)` | `NOT NULL DEFAULT 0.0000 CHECK (annual_agg_threshold >= 0)` | e.g., `100000.0000` for 194C, `5000000.0000` for 194Q |
| `tds_payable_ledger_id` | `BIGINT` | `FK -> ledgers.id NOT NULL` | Statutory liability ledger (`TDS Payable - 194C`) |
| `effective_from` | `DATE` | `NOT NULL` | Effective FY start |
| `effective_to` | `DATE` | `NULL` | Sunset date |

* **Constraints & Indexes:** `uq_tds_sections_company_code_eff (company_id, section_code, effective_from)`.

---

### 2.6 Global Multi-Currency & Automation Schema (Phases 4–5)

#### 21. `currencies`

ISO 4217 currency registry driving display grouping (`IN` lakhs/crores vs international thousands) and precision.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `code` | `CHAR(3)` | `PK` | ISO 4217 code (`INR`, `USD`, `GBP`, `EUR`, `AED`, `SGD`) |
| `name` | `VARCHAR(64)` | `NOT NULL` | Currency name (`Indian Rupee`, `US Dollar`) |
| `symbol` | `VARCHAR(8)` | `NOT NULL` | Display glyph (`₹`, `$`, `£`, `€`) |
| `minor_units` | `SMALLINT` | `NOT NULL DEFAULT 2 CHECK (minor_units BETWEEN 0 AND 4)` | Standard display decimals (`2` for INR/USD, `0` for JPY) |
| `grouping_style` | `VARCHAR(16)` | `NOT NULL DEFAULT 'INTERNATIONAL' CHECK IN ('INDIAN','INTERNATIONAL')` | Drives `12,45,000.00` vs `124,500.00` per `DESIGN_SYSTEM.md` §8.7 |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Global currency availability |

#### 22. `exchange_rates`

Historical daily spot, RBI reference, customs, and period-end closing exchange rates.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Rate PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary (allows company-specific RBI/bank contract rates) |
| `from_currency` | `CHAR(3)` | `FK -> currencies.code NOT NULL` | Foreign transaction currency (e.g., `USD`) |
| `to_currency` | `CHAR(3)` | `FK -> currencies.code NOT NULL` | Target base currency (e.g., `INR`) |
| `rate_date` | `DATE` | `NOT NULL` | Effective date |
| `rate_type` | `VARCHAR(16)` | `NOT NULL DEFAULT 'SPOT' CHECK IN ('SPOT','RBI_REF','CBIC_CUSTOMS','CLOSING_REVAL')` | Statutory rate classification |
| `rate` | `NUMERIC(18, 4)` | `NOT NULL CHECK (rate > 0)` | Conversion rate (`1 from_currency = rate to_currency`) |
| `source` | `VARCHAR(40)` | `NOT NULL DEFAULT 'MANUAL'` | `MANUAL`, `FBIL_RBI`, `ECB`, `OPEN_EXCHANGE` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Audit timestamp |

* **Constraints & Indexes:** `ck_exchange_rates_diff_curr (from_currency != to_currency)`, `uq_exchange_rates_key (company_id, from_currency, to_currency, rate_date, rate_type)`, `ix_exchange_rates_latest (company_id, from_currency, to_currency, rate_date DESC)`.

#### 23. `categorization_rules`

QuickBooks-style deterministic rules engine auto-classifying bank feed lines and suggesting 1-click voucher creation.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Rule PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `name` | `VARCHAR(120)` | `NOT NULL` | Rule label (e.g., `AWS Cloud Charges`, `JioFiber Monthly`) |
| `bank_account_id` | `BIGINT` | `FK -> bank_accounts.id NULL` | Optional scope to specific bank (`NULL` = all banks) |
| `direction` | `VARCHAR(12)` | `NOT NULL CHECK IN ('WITHDRAWAL','DEPOSIT','BOTH')` | Applies to money out, money in, or both |
| `priority` | `INTEGER` | `NOT NULL DEFAULT 100` | Lower number executes first |
| `match_field` | `VARCHAR(24)` | `NOT NULL DEFAULT 'NARRATION' CHECK IN ('NARRATION','EXTRACTED_REF','AMOUNT_EXACT','COMBINED')` | Target column on `bank_statement_lines` |
| `match_operator` | `VARCHAR(16)` | `NOT NULL CHECK IN ('CONTAINS','REGEX','STARTS_WITH','EQUALS')` | Matcher strategy |
| `match_pattern` | `VARCHAR(255)` | `NOT NULL` | Case-insensitive keyword or regex pattern |
| `min_amount` | `NUMERIC(18, 4)` | `NULL CHECK (min_amount >= 0)` | Optional amount floor |
| `max_amount` | `NUMERIC(18, 4)` | `NULL CHECK (max_amount >= 0)` | Optional amount ceiling |
| `target_voucher_type` | `VARCHAR(16)` | `NOT NULL DEFAULT 'PAYMENT' CHECK IN ('PAYMENT','RECEIPT','CONTRA','JOURNAL')` | Generated voucher type |
| `target_ledger_id` | `BIGINT` | `FK -> ledgers.id ON DELETE RESTRICT NOT NULL` | Offset Expense/Income/Party ledger |
| `target_tax_rate_id` | `BIGINT` | `FK -> tax_rates.id NULL` | Optional GST/VAT extraction on bank charge/expense |
| `auto_post` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | `FALSE` = create `DRAFT` for review; `TRUE` = auto-post & reconcile |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Enable/disable rule |
| `hit_count` | `INTEGER` | `NOT NULL DEFAULT 0` | Usage telemetry |

* **Constraints & Indexes:** `ix_cat_rules_exec (company_id, is_active, priority ASC)`.

#### 24. `recurring_templates`

Scheduled automated voucher generator (monthly rent, SaaS subscriptions, depreciation journals, retainer invoices).

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Template PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `name` | `VARCHAR(120)` | `NOT NULL` | e.g., `Office Rent - Monthly`, `Straight-Line Depreciation` |
| `voucher_type` | `VARCHAR(24)` | `NOT NULL` | Target voucher type (`JOURNAL`, `SALES`, `PURCHASE`, `PAYMENT`) |
| `frequency` | `VARCHAR(16)` | `NOT NULL CHECK IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY','ANNUAL')` | Recurrence interval |
| `interval_count` | `SMALLINT` | `NOT NULL DEFAULT 1 CHECK (interval_count >= 1)` | Every `N` intervals |
| `day_of_month` | `SMALLINT` | `NULL CHECK (day_of_month BETWEEN 1 AND 31)` | Clamped to month end for Feb/30-day months |
| `start_date` | `DATE` | `NOT NULL` | First scheduled execution date |
| `end_date` | `DATE` | `NULL` | Optional termination date |
| `next_run_date` | `DATE` | `NOT NULL` | Next scheduled run date |
| `last_run_date` | `DATE` | `NULL` | Most recent execution date |
| `auto_post` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | `FALSE` generates `DRAFT`; `TRUE` posts immediately |
| `template_payload_json` | `JSONB / TEXT` | `NOT NULL` | Validated voucher lines & tax metadata (exact decimal strings) |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Pause/resume toggle |
| `created_by` | `BIGINT` | `NOT NULL` | Creator user ID |

* **Constraints & Indexes:** `ix_recurring_due (is_active, next_run_date, company_id)`.

#### 25. `ocr_documents`

Ingests vendor bills, receipts, and PDF invoices for automated field extraction into reviewable `DRAFT` vouchers.

| Column | Type | Constraints / Default | Purpose |
| --- | --- | --- | --- |
| `id` | `BIGINT` | `PK` | Document PK |
| `company_id` | `BIGINT` | `FK -> companies.id NOT NULL` | Tenant boundary |
| `file_name` | `VARCHAR(255)` | `NOT NULL` | Original uploaded filename |
| `mime_type` | `VARCHAR(64)` | `NOT NULL CHECK IN ('application/pdf','image/jpeg','image/png','image/webp')` | Allowed document formats |
| `file_size_bytes` | `INTEGER` | `NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)` | Strict 10 MB ceiling |
| `file_sha256` | `CHAR(64)` | `NOT NULL` | Duplicate upload detector |
| `storage_path` | `VARCHAR(512)` | `NOT NULL` | Local sandboxed path or S3/R2 object key |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'UPLOADED' CHECK IN ('UPLOADED','EXTRACTING','NEEDS_REVIEW','CONVERTED','FAILED','ARCHIVED')` | Pipeline state |
| `ocr_provider` | `VARCHAR(32)` | `NOT NULL DEFAULT 'GEMINI_VISION'` | Pluggable extraction backend (Gemini Flash/Vision, local Tesseract, AWS Textract) |
| `extracted_json` | `JSONB / TEXT` | `NULL` | Normalized JSON: supplier GSTIN, invoice no/date, line items, HSN, taxable value, tax breakup, currency |
| `confidence_score` | `NUMERIC(18, 4)` | `NULL CHECK (confidence_score >= 0 AND confidence_score <= 1)` | Overall extraction confidence (`0.0000`–`1.0000`) |
| `error_message` | `TEXT` | `NULL` | Extraction failure diagnostic |
| `linked_voucher_id` | `BIGINT` | `FK -> vouchers.id NULL` | Resulting `DRAFT` or `POSTED` voucher |
| `uploaded_by` | `BIGINT` | `NOT NULL` | Actor user ID |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Upload UTC timestamp |

* **Constraints & Indexes:** `uq_ocr_company_sha256 (company_id, file_sha256)`, `ix_ocr_company_status (company_id, status, created_at DESC)`.

---

## 3. Double-Entry Transaction Lifecycle & Invariants

### 3.1 Four-Layer Double-Entry Defense-in-Depth

Every financial transaction passes through four independent balance and integrity gates before committing:

1. **Layer 1 — Frontend (`Zod 4` + `BigInt`):** `VoucherDrawer` scales all debit/credit inputs by `10000n` (`BigInt`), recomputes `Difference = |Dr - Cr|` live on every keystroke, displays the `✓ Balanced` / `✕ Out of balance` pill, and disables `Save Voucher (Ctrl+Enter)` whenever `Dr != Cr` or `Dr == 0n`.


2. **Layer 2 — API Contract (`FastAPI 0.165.0` + `Pydantic v2.14`):** Parses incoming monetary strings directly into `decimal.Decimal` (rejecting raw floats), verifies `len(lines) >= 2`, checks fiscal-year bounds (`start_date <= voucher_date <= end_date`), checks period lock (`voucher_date > fiscal_years.lock_date` and `not is_closed`), and returns **HTTP `422 Unprocessable Entity**` on any invariant failure.


3. **Layer 3 — ORM Flush Hook (`SQLAlchemy before_flush`):** Before SQL executes, inspects every dirty/new `Voucher` with `status == 'POSTED'`: asserts $\sum \text{debit\_base} = \sum \text{credit\_base} > 0$, asserts every line is strictly single-sided, and enforces atomic creation of an `audit_logs` hash-chained entry in the exact same transaction.


4. **Layer 4 — Database Engine Constraints:** Named `CHECK` constraints (`ck_vouchers_posted_balanced`, `ck_voucher_lines_mutually_exclusive_base`, `ck_stock_batches_qty_available`, `ck_bank_stmt_not_over_allocated`) and append-only `audit_logs` triggers/permissions guarantee integrity even against direct SQL bugs.



### 3.2 Voucher State Machine & Edit/Cancel Semantics

```text
                ┌──────────────┐
    ┌──────────►│    DRAFT     │──────────┐ (Editable freely; excluded from TB/Reports)
    │           └──────┬───────┘          │
    │                  │ Post (Dr==Cr)    │ Convert
    │                  ▼                  ▼
┌───┴──────────┐  ┌──────────┐    ┌───────────────┐
│  OPTIONAL    │  │  POSTED  │◄───│  POST_DATED   │ (Auto-promotes or manual post on date)
│ (Memorandum) │  └────┬─────┘    └───────────────┘
└──────────────┘       │
                       ├──► Update (Creates version_seq+1 + full before/after audit_logs row;
                       │            blocked if voucher_date <= lock_date or IRN generated)
                       │
                       └──► Cancel (status='CANCELLED', preserves voucher_no for GSTR-1 Table 13,
                                    reverses stock_batches & bill_allocations, logs CANCEL in audit_logs,
                                    zeroes Trial Balance impact; NEVER hard-deleted)

```

* **Statutory E-Invoice Lock:** Once `vouchers.irn IS NOT NULL`, direct modification of taxable values, GSTIN, or line items is blocked; corrections MUST occur via a linked `CREDIT_NOTE` or `DEBIT_NOTE` (`original_voucher_id`) or IRN cancellation within 24 hours.
* **Post-Lock Corrections:** After `fiscal_years.lock_date` is set or `is_closed = TRUE`, no mutation or cancellation is allowed on locked-period vouchers; accountants must post an adjusting `JOURNAL` or `CREDIT_NOTE` in the current open period.

---

### 3.3 Canonical Double-Entry Posting Blueprints

Every operational flow executes inside a **single `AsyncSession` transaction**. All base-currency figures are quantized `ROUND_HALF_UP` to `0.0001` (4 dp storage, 2 dp invoice presentation with explicit `Round Off` line for sub-rupee/sub-dollar invoice rounding).

#### A. Sales Invoice (`F8` — Domestic India GST + Perpetual FIFO Inventory + Round-Off)

*Scenario:* Intra-State sale (`origin_state='09'`, `place_of_supply='09'`) of 10 `Nos` *Copper Wire Coil 2.5mm* @ ₹1,000.00 = ₹10,000.00 taxable, GST 18% (9% CGST + 9% SGST = ₹1,800.00), invoice round-off `+₹0.40` (illustrative), FIFO lot cost = 6 units @ ₹700 + 4 units @ ₹725 = ₹7,100.00 COGS.

**Transaction Steps:**

1. `modules/tax_india` inspects `company.state_code == voucher.place_of_supply` $\rightarrow$ computes Intra-State CGST 9% + SGST 9% (if different states $\rightarrow$ IGST 18%; if Export LUT `EXPWOP` $\rightarrow$ 0% GST).


2. `modules/inventory` locks open `stock_batches` (`received_date ASC, id ASC`), deducts `qty_available` across 2 lots (`6` + `4`), inserts 2 `stock_movements` (`direction='OUT'`) summing to `total_cost_base = 7100.0000`.


3. `modules/ledger` posts all lines atomically under one `vouchers` header (`voucher_type='SALES'`):

| Line | Ledger (`line_role`) | Debit Base (₹) | Credit Base (₹) |
| --- | --- | --- | --- |
| 1 | Customer A/c (`PARTY`) + `bill_allocations(NEW_REF)` | `11,800.4000` | `0.0000` |
| 2 | Sales — Electrical Goods (`STANDARD`) | `0.0000` | `10,000.0000` |
| 3 | Output CGST 9% (`TAX_CGST`) | `0.0000` | `900.0000` |
| 4 | Output SGST 9% (`TAX_SGST`) | `0.0000` | `900.0000` |
| 5 | Round Off (`ROUND_OFF`) | `0.0000` | `0.4000` |
| 6 | Cost of Goods Sold (`COGS`) | `7,100.0000` | `0.0000` |
| 7 | Inventory — Finished Goods (`INVENTORY`) | `0.0000` | `7,100.0000` |
| **Total** | **$\sum \text{Dr} = \sum \text{Cr}$** | **`18,900.4000`** | **`18,900.4000`** |

*(For `SERVICE` items or periodic non-inventory bills, lines 6–7 are omitted. For Inter-State sales, lines 3–4 collapse into one `Output IGST 18%` line.)*

#### B. Purchase Invoice (`F9` — Inventory Inward, Eligible vs. Blocked ITC, RCM & TDS)

*Scenario 1 (Standard Inventory Purchase with Eligible ITC & TDS 194Q / 194C):* Purchase of taxable goods ₹1,00,000.00 + IGST 18% (₹18,000.00) with TDS @ 2% on taxable value (₹2,000.00).

* `modules/inventory` inserts a new `stock_batches` lot (`qty_in`, `unit_cost_base` = landed cost net of recoverable ITC) and `stock_movements` (`direction='IN'`).

| Line | Ledger (`line_role`) | Debit Base (₹) | Credit Base (₹) |
| --- | --- | --- | --- |
| 1 | Inventory Asset / Expense (`INVENTORY` / `STANDARD`) | `1,00,000.0000` | `0.0000` |
| 2 | Input IGST 18% (`TAX_IGST`, `is_itc_eligible=TRUE`) | `18,000.0000` | `0.0000` |
| 3 | Vendor A/c (`PARTY`) + `bill_allocations(NEW_REF)` | `0.0000` | `1,16,000.0000` |
| 4 | TDS Payable — Sec 194C (`TDS_PAYABLE`) | `0.0000` | `2,000.0000` |
| **Total** | **Balanced** | **`1,18,000.0000`** | **`1,18,000.0000`** |

*Scenario 2 (Blocked Credit Sec 17(5) e.g., staff catering/motor vehicle):* `is_itc_eligible = FALSE` rolls the tax directly into the Expense/Asset debit (`Dr Expense 1,18,000`, `Cr Vendor 1,18,000`), keeping the Input Tax Credit ledger untouched.
*Scenario 3 (Reverse Charge Mechanism — `is_reverse_charge = TRUE`, e.g., GTA freight 5% on ₹20,000 = ₹1,000):*

* `Dr Freight Inward 20,000.0000` | `Dr Input IGST (RCM) 1,000.0000` | `Cr Vendor 20,000.0000` | `Cr Output IGST Payable (RCM Cash) 1,000.0000`. (RCM output must be paid in cash before claiming RCM input credit.)

#### C. Credit Note & Debit Note (Sales Return / Purchase Return)

*Sales Credit Note (`voucher_type='CREDIT_NOTE'`, linked to `original_voucher_id`):*

1. Reverses revenue and tax proportionally (`Dr Sales Return`, `Dr Output CGST/SGST/IGST`, `Cr Customer A/c` against original bill ref).
2. If physical goods are returned (`return_stock = TRUE`), restores stock by creating a return `stock_batches` lot at the **exact original outbound FIFO `unit_cost_base**` from `stock_movements` (never at selling price!) and posts `Dr Inventory Asset` / `Cr COGS` in the same atomic voucher.

*Purchase Debit Note (`voucher_type='DEBIT_NOTE'`):*

1. `Dr Vendor A/c` (`Agst Ref`), `Cr Purchase Return / Inventory Asset`, `Cr Input CGST/SGST/IGST` (reversing ITC for GSTR-3B Table 4B).
2. Deducts returned units from the originating `stock_batches` lot (`direction='OUT'`).

#### D. Inventory Transfers & Shrinkage (`STOCK_JOURNAL`)

* **Godown-to-Godown Transfer:** Deducts FIFO lots from Source Godown (`TRANSFER_OUT`), creates mirror lots in Destination Godown preserving original `received_date` and `unit_cost_base` (`TRANSFER_IN`). Net GL impact = ₹0.00 (balanced memo or optional sub-godown asset transfer if godowns have distinct GLs).
* **Stock Write-Off / Shrinkage:** Consumes FIFO lots (`ADJUST_OUT`) and posts `Dr Inventory Shrinkage / Loss (EXPENSE)` / `Cr Inventory Asset (INVENTORY)` at exact FIFO cost.

#### E. Multi-Currency & Realized / Unrealized Forex Gain & Loss (Phase 4)

*Step 1 — Booking Export Sales Invoice (USD `1,000.00` on `2026-10-01` @ `exchange_rate = 84.0000` INR/USD):*

| Ledger | Dr Txn (USD) | Cr Txn (USD) | Dr Base (INR) | Cr Base (INR) |
| --- | --- | --- | --- | --- |
| Global Client LLC (`PARTY`, `NEW_REF`) | `1,000.0000` | `0.0000` | `84,000.0000` | `0.0000` |
| Export Sales (`STANDARD`) | `0.0000` | `1,000.0000` | `0.0000` | `84,000.0000` |

*Step 2 — Receipt Settlement on `2026-10-25` @ `exchange_rate = 85.2000` INR/USD (`AGST_REF` against Step 1):*

* Customer settles USD `1,000.00` into INR Bank (`₹85,200.00`).
* `bill_allocations` reads original `booking_exchange_rate = 84.0000` $\rightarrow$ clears AR in base currency at `₹84,000.00` so AR closes cleanly to `0.00` in **both** USD and INR.
* Realized Forex Gain = `(85.2000 - 84.0000) * 1000 = ₹1,200.0000` (if rate fell to `83.5000`, posts `Dr Realized Forex Loss ₹500.0000`):

| Ledger (`line_role`) | Dr Txn (USD) | Cr Txn (USD) | Dr Base (INR) | Cr Base (INR) |
| --- | --- | --- | --- | --- |
| HDFC Bank EEFC / INR A/c (`STANDARD`) | `1,000.0000` | `0.0000` | `85,200.0000` | `0.0000` |
| Global Client LLC (`PARTY`, `AGST_REF`) | `0.0000` | `1,000.0000` | `0.0000` | `84,000.0000` |
| Realized Forex Gain (`FOREX_DIFF`) | `0.0000` | `0.0000` | `0.0000` | `1,200.0000` |
| **Total (Base Currency Balanced)** |  |  | **`85,200.0000`** | **`85,200.0000`** |

*Note on `voucher_lines` single-sided check for Forex-only lines:* Because `Realized Forex Gain` exists strictly in base currency (`INR`), `ck_voucher_lines_mutually_exclusive_txn` is relaxed specifically when `line_role = 'FOREX_DIFF'` (`(debit_txn = 0 AND credit_txn = 0)`) while `ck_voucher_lines_mutually_exclusive_base` remains strictly enforced.

*Step 3 — Period-End Unrealized Forex Revaluation (`voucher_type='FOREX_REVAL'`):*

* On FY/month close, scans all open foreign-currency `bill_allocations` (AR/AP) and foreign-currency `bank_accounts` using `exchange_rates(rate_type='CLOSING_REVAL')`.
* Posts net mark-to-market delta (`Dr/Cr AR/AP/Bank Revaluation Adjustment` $\leftrightarrow$ `Cr/Dr Unrealized Forex Gain/Loss`) on period-end date and automatically schedules an exact mirror **auto-reversal journal** on Day 1 of the next period (Ind AS 21 / IAS 21 / ASC 830 compliance).

#### F. Bank Reconciliation & Net-of-Fee Settlements

* **Polarity Mirror Rule:** Every match verifies that a Bank Statement `deposit > 0` matches ONLY a `voucher_lines.debit_txn > 0` on the linked bank ledger, and a Bank Statement `withdrawal > 0` matches ONLY a `voucher_lines.credit_txn > 0`.


* **Deterministic Match-Scoring Engine (`modules/banking/scoring.py`):** Evaluates unreconciled statement lines against unreconciled book lines on `bank_accounts.ledger_id`:


* Exact amount match: **`+60`**
* Voucher date within `±3` days of `txn_date`: **`+25`** (linear decay `+15` for `±4..7` days)
* Normalized `extracted_ref` (UTR / 12-digit UPI/IMPS RRN / Cheque No.) exact or substring match in `voucher.reference_no` / `voucher.voucher_no` / `voucher.narration`: **`+15`**
* Auto-reconcile executes automatically only for unambiguous 1-to-1 hits scoring **`100`**; scores `60–99` surface as ranked suggestions in the QuickBooks-style split-screen drawer.




* **Net Settlement Minus Gateway/Bank Charges (1:N Split Posting):** When ₹9,882.00 hits the bank for a ₹10,000.00 customer invoice after ₹100.00 gateway fee + ₹18.00 GST, clicking **"Match with Fee Adjustment"** posts one balanced Receipt voucher (`Dr Bank 9,882.00`, `Dr Bank/Gateway Charges 100.00`, `Dr Input IGST 18.00` / `Cr Customer 10,000.00`) and links the `9,882.00` bank ledger line to the `9,882.00` statement line in `reconciliation_matches`.

#### G. GSTR-3B Monthly ITC Set-Off Voucher (`voucher_type='TAX_SETOFF'`)

Executes the statutory **Rule 88A / Sections 49A & 49B** offset matrix (exhausting Input IGST first against Output IGST, then optimally across Output CGST/SGST; thereafter CGST $\rightarrow$ CGST/IGST and SGST $\rightarrow$ SGST/IGST with zero CGST$\leftrightarrow$SGST cross-utilization, enforcing the Rule 86B 99% cap where taxable monthly turnover exceeds ₹50 Lakh):

* `Dr Output IGST / Output CGST / Output SGST` (clears output tax liabilities)
* `Cr Input IGST / Input CGST / Input SGST` (consumes Electronic Credit Ledger balances)
* `Cr GST Electronic Cash Ledger Payable` (net residual tax payable in cash, later settled via `F5` Payment voucher on challan PMT-06 payment).

---

## 4. Clean REST API Contract (`/api/v1/...`)

### 4.1 Global API Conventions

* **Base Prefix:** `/api/v1` (proxied locally from Vite `:5173/api` $\rightarrow$ FastAPI `:8000/api`).


* **Tenant & Idempotency Headers:**
* `Authorization: Bearer <jwt>` (mandatory on all routes except `/api/v1/auth/*` and `/api/v1/health`).
* `X-Company-Id: <bigint>` (mandatory on all company-scoped routes; validated against `company_memberships`).
* `Idempotency-Key: <uuid>` (supported on all `POST` voucher creation, import, and batch endpoints).


* **Decimal & Date Wire Format:** Monetary/qty/rate fields serialize strictly as decimal strings (`"11800.4000"`). Dates use `YYYY-MM-DD`; timestamps use UTC ISO-8601 (`2026-11-26T04:30:00Z`).
* **FastAPI 0.165.0 Parameter Hygiene:** Any `Query`/`Header` parameter whose default value requires Pydantic transformation explicitly sets `validate_default=True`; request body limits cap JSON at `2 MB`, CSV uploads at `5 MB`, and OCR uploads at `10 MB` (returning HTTP `413` on breach).


* **Standard Error Payload:**
```json
{
  "error_code": "UNBALANCED_VOUCHER",
  "message": "Debit and Credit must balance: difference 1250.0000",
  "details": { "total_debit_base": "11250.0000", "total_credit_base": "10000.0000" }
}

```


Status codes: `400` malformed file/CSV, `401` unauthenticated, `403` tenant/role violation, `404` resource not found in tenant, `409` duplicate voucher no/hash/optimistic version mismatch, `413` payload too large, `422` double-entry imbalance / locked period / insufficient FIFO stock / Rule 88A violation.

---

### 4.2 Endpoints Grouped by Module

#### Module 1: Core, Auth, Tenancy & Audit (`modules/core/`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Liveness + DB dialect (`sqlite`/`postgresql`) + schema migration head |
| `POST` | `/api/v1/auth/register` | Register user account |
| `POST` | `/api/v1/auth/login` | Issue access + refresh tokens |
| `GET` | `/api/v1/companies` | List companies accessible to authenticated user |
| `POST` | `/api/v1/companies` | Create company + seed default Chart of Accounts & tax regime |
| `PATCH` | `/api/v1/companies/{id}` | Update company profile, GSTIN/TIN, valuation method |
| `GET` | `/api/v1/fiscal-years` | List fiscal years for active company |
| `POST` | `/api/v1/fiscal-years` | Create new fiscal year & carry forward opening balances |
| `POST` | `/api/v1/fiscal-years/{id}/lock` | Set `lock_date` or close FY (`is_closed=true`) |
| `GET` | `/api/v1/audit-logs` | Paginated MCA Edit Log viewer (filter by entity, voucher no, actor, date) |
| `GET` | `/api/v1/audit-logs/verify-chain` | Recomputes SHA-256 hash chain across tenant logs; flags any tampering |
| `GET` | `/api/v1/search/goto` | Powers `Alt+G` Command Palette (instant search across ledgers, vouchers, items, reports) |

#### Module 2: Double-Entry Ledger & Financial Reports (`modules/ledger/`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/account-groups` | Full Chart of Accounts group tree (`nested=true|false`) |
| `POST` | `/api/v1/account-groups` | Create custom sub-group |
| `PATCH` | `/api/v1/account-groups/{id}` | Rename/reclassify group (logged to `audit_logs`) |
| `GET` | `/api/v1/ledgers` | Search/list ledgers with live closing balances (`group_id`, `sub_type`, `q`) |
| `POST` | `/api/v1/ledgers` | Create ledger with opening balance, GSTIN/PAN, TDS/1099 flags |
| `PATCH` | `/api/v1/ledgers/{id}` | Update ledger master (audited) |
| `GET` | `/api/v1/ledgers/{id}/statement` | Date-sorted Ledger Account Statement with running Dr/Cr balance & opening/closing rows |
| `GET` | `/api/v1/ledgers/{id}/open-bills` | Unsettled `bill_allocations` for Tally `Agst Ref` dropdown |
| `GET` | `/api/v1/vouchers` | Filterable Day Book / Voucher Register (`type`, `status`, `from`, `to`, `party_id`, `page`) |
| `POST` | `/api/v1/vouchers` | Atomic create (`DRAFT`/`POSTED`/`OPTIONAL`/`POST_DATED`) invoking tax & inventory hooks |
| `GET` | `/api/v1/vouchers/{id}` | Full voucher detail with `voucher_lines`, `stock_movements`, `bill_allocations`, E-Invoice metadata |
| `PUT` | `/api/v1/vouchers/{id}` | Optimistic-locked edit (`version_seq`), recomputing tax/inventory & appending `audit_logs` |
| `POST` | `/api/v1/vouchers/{id}/post` | Promote `DRAFT` or `POST_DATED` voucher to `POSTED` |
| `POST` | `/api/v1/vouchers/{id}/cancel` | Immutable void (`status='CANCELLED'`), restoring FIFO lots & clearing bill allocations |
| `GET` | `/api/v1/reports/trial-balance` | Hierarchical Trial Balance (`from`, `to`, `fy_id`, `include_zero`) |
| `GET` | `/api/v1/reports/profit-and-loss` | Trading & P&L statement (Gross Profit + Net Profit, period comparison) |
| `GET` | `/api/v1/reports/balance-sheet` | Balance Sheet as of date (Assets == Liabilities + Equity + Current P&L) |
| `GET` | `/api/v1/reports/aging` | AR/AP Bill-by-Bill Aging (`0-30`, `31-60`, `61-90`, `90+` buckets) |
| `GET` | `/api/v1/reports/cash-flow` | Indirect/Direct Cash Flow summary for period |

#### Module 3: Perpetual Inventory & Costing (`modules/inventory/`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/api/v1/inventory/units` | List or create UOM / GST UQC units |
| `GET` / `POST` | `/api/v1/inventory/godowns` | List or create warehouses/locations |
| `GET` / `POST` | `/api/v1/inventory/items` | List or create stock/service items |
| `PATCH` | `/api/v1/inventory/items/{id}` | Update SKU rates, reorder levels, HSN/SAC, or GL links |
| `GET` | `/api/v1/inventory/items/{id}/batches` | Open & historical FIFO `stock_batches` per godown |
| `GET` | `/api/v1/inventory/items/{id}/movements` | Stock Item Ledger (chronological IN/OUT with running qty & valuation) |
| `POST` | `/api/v1/inventory/transfers` | Atomic Godown-to-Godown `STOCK_JOURNAL` transfer preserving FIFO costs |
| `POST` | `/api/v1/inventory/adjustments` | Physical stock count variance adjustment posting GL shrinkage/gain |
| `GET` | `/api/v1/inventory/valuation` | Closing Stock Valuation Summary by item/godown (exact Python `Decimal` product sum) |

#### Module 4: Banking & Reconciliation (`modules/banking/`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/api/v1/banking/accounts` | List or register bank accounts linked to Bank Ledgers |
| `POST` | `/api/v1/banking/accounts/{id}/import-csv` | Multipart streaming Indian/Global CSV upload (max 5 MB, SHA-256 idempotent) + optional auto-match |
| `GET` | `/api/v1/banking/accounts/{id}/statement-lines` | Paginated bank feed lines (`status=UNRECONCILED|PARTIAL|RECONCILED`) |
| `GET` | `/api/v1/banking/accounts/{id}/suggestions` | Deterministic match-scoring candidates (`+60/+25/+15`) & rule suggestions for split-screen drawer |
| `POST` | `/api/v1/banking/accounts/{id}/auto-reconcile` | Runs unambiguous 100-score 1:1 auto-matching (`date_window_days=3`) |
| `POST` | `/api/v1/banking/matches` | Manual 1:1 or 1:N / N:1 split allocation (`statement_line_id`, `allocations[]`) |
| `POST` | `/api/v1/banking/statement-lines/{id}/quick-add` | 1-click create & post voucher (optional fee/tax split or new categorization rule) + reconcile |
| `DELETE` | `/api/v1/banking/matches/{id}` | Unmatch allocation (audited; restores statement line to `PARTIAL`/`UNRECONCILED`) |
| `GET` | `/api/v1/banking/accounts/{id}/brs` | Bank Reconciliation Statement (Balance as per Books $\pm$ Uncleared Cheques/Deposits = Balance as per Bank) |
| `POST` | `/api/v1/banking/accounts/{id}/feeds/connect` | Initiate Setu AA v2 consent or Plaid Link token (Phase 5) |
| `POST` | `/api/v1/banking/accounts/{id}/feeds/sync` | Trigger Setu AA FI session or Plaid `/transactions/sync` cursor pull |
| `POST` | `/api/v1/banking/webhooks/{provider}` | Signed webhook receiver (`setu_aa`, `plaid`) |

#### Module 5: India Tax & Statutory Compliance (`modules/tax_india/`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/api/v1/tax/jurisdictions` | Manage tax jurisdictions (`IN-GST`, `IN-TDS`, `US-FED`, `GB-HMRC`) |
| `GET` / `POST` | `/api/v1/tax/rates` | Effective-dated tax slabs (GST/VAT/Sales Tax) |
| `GET` / `POST` | `/api/v1/tax/india/hsn-sac` | Search/create HSN/SAC master codes |
| `POST` | `/api/v1/tax/india/gst/preview` | Stateless Place-of-Supply CGST/SGST/IGST/Cess preview calculator |
| `GET` | `/api/v1/tax/india/gstr1/{period}/summary` | GSTR-1 table-wise summary (`b2b`, `b2cl` > ₹1L, `b2cs`, `cdnr`, `hsn_b2b`, `hsn_b2c`, `doc_issue`) |
| `GET` | `/api/v1/tax/india/gstr1/{period}/export-json` | Download GSTN Offline Tool v3.2.4 compliant JSON |
| `POST` | `/api/v1/tax/india/gstr2b/{period}/import-json` | Upload GSTN GSTR-2B JSON & run automated 3-way reconciliation against Purchase Register |
| `GET` | `/api/v1/tax/india/gstr2b/{period}/reconciliation` | View Exact Match, Value Mismatch, Missing in Books, Missing in 2B, IMS buckets |
| `PATCH` | `/api/v1/tax/india/gstr2b/records/{id}/ims-action` | Set recipient IMS action (`A`, `R`, `P`, `NAT`) with 1-period Credit Note pending guard |
| `GET` | `/api/v1/tax/india/gstr3b/{period}/compute` | Computes GSTR-3B 3.1/4A/4B + optimal **Rule 88A / Rule 86B** ITC offset matrix |
| `POST` | `/api/v1/tax/india/gstr3b/{period}/post-setoff` | Posts balanced `TAX_SETOFF` voucher transferring Input ITC to Output Liabilities |
| `GET` | `/api/v1/tax/india/einvoice/{voucher_id}/payload` | Generates NIC **INV-01 Version 1.1** JSON + validates 30-day reporting window & `ShipDtls` |
| `POST` | `/api/v1/tax/india/einvoice/{voucher_id}/record-irn` | Stores IRP response (`irn`, `ack_no`, `ack_date`, `signed_qr_code`) and locks invoice |
| `GET` / `POST` | `/api/v1/tax/india/tds/sections` | Manage TDS sections & thresholds |
| `GET` | `/api/v1/tax/india/tds/summary` | Monthly challan ITNS 281 liability & quarterly Form 26Q deductee schedule |

#### Module 6: Global Tax Compliance (`modules/tax_global/`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/tax/global/us/1099-nec/{tax_year}` | Aggregates payments to `is_1099_eligible` vendors flagging the TY 2026 **$2,000** OBBBA threshold & Boxes `1a–1d, 2–7` |
| `GET` | `/api/v1/tax/global/us/1099-nec/{tax_year}/export-iris` | Generates IRS **IRIS** schema-compliant CSV/XML payload (post-FIRE retirement) |
| `GET` | `/api/v1/tax/global/uk/mtd-vat/obligations` | Fetches open VAT return `periodKey` obligations from HMRC sandbox/prod |
| `GET` | `/api/v1/tax/global/uk/mtd-vat/{period_key}/compute` | Computes exact HMRC **9-Box** VAT return (`vatDueSales`..`totalAcquisitionsExVAT`) |
| `POST` | `/api/v1/tax/global/uk/mtd-vat/{period_key}/submit` | Submits finalized 9-box payload with OAuth2 Bearer & `Gov-Client-*` Fraud Prevention Headers |

#### Module 7: Multi-Currency & Forex (`modules/multicurrency/`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/currencies` | List ISO 4217 currencies & grouping rules |
| `GET` / `POST` | `/api/v1/exchange-rates` | Query historical rates or insert Spot / RBI / Closing rates |
| `POST` | `/api/v1/forex/revaluation/preview` | Dry-run calculation of unrealized FX gain/loss on open AR/AP/Bank foreign balances |
| `POST` | `/api/v1/forex/revaluation/post` | Atomically posts `FOREX_REVAL` voucher + Day-1 auto-reversing journal |

#### Module 8: Automation, Rules, Recurring & OCR (`modules/automation/`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/api/v1/automation/rules` | List or create bank categorization rules |
| `PATCH` / `DELETE` | `/api/v1/automation/rules/{id}` | Update priority/pattern or disable rule |
| `POST` | `/api/v1/automation/rules/dry-run` | Test rule pattern against unreconciled bank lines before saving |
| `GET` / `POST` | `/api/v1/automation/recurring` | List or create recurring voucher templates |
| `POST` | `/api/v1/automation/recurring/run-due` | Executes all templates with `next_run_date <= today` (idempotent per run date) |
| `POST` | `/api/v1/automation/ocr/upload` | Multipart upload (PDF/JPG/PNG/WebP $\le$ 10 MB) $\rightarrow$ queues extraction |
| `GET` | `/api/v1/automation/ocr/documents` | List OCR inbox (`NEEDS_REVIEW`, `CONVERTED`, `FAILED`) |
| `POST` | `/api/v1/automation/ocr/documents/{id}/create-draft` | Converts reviewed OCR JSON into a balanced `DRAFT` Purchase/Expense voucher |

---

## 5. Security, Tenancy & Privacy Boundaries

### 5.1 Seamless Local SQLite $\rightarrow$ Production Neon PostgreSQL Upgrade Path

LedgerPrime runs identical application and Alembic migration code across both engines with zero business-logic branching:

| Concern | Local Dev (`SQLite WAL`) | Production (`Neon PostgreSQL`) | Abstraction Mechanism |
| --- | --- | --- | --- |
| **Driver & URL** | `sqlite+aiosqlite:///./ledgerprime.db` | `postgresql+asyncpg://.../?ssl=require` | `DATABASE_URL` in `.env` |
| **Connection & Locking** | `connect_args={"autocommit": False}`, `PRAGMA journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON` | Async connection pool (`pool_size=5`, `max_overflow=10`, `pool_pre_ping=True`) tuned for Neon serverless scale-to-zero | `app/db/session.py` inspects `engine.dialect.name` |
| **Exact `NUMERIC(18,4)**` | 64-bit scaled `INTEGER` (`* 10_000`) | Native `NUMERIC(18, 4)` | `MonetaryNumeric18_4(TypeDecorator)` implements `load_dialect_impl()` switching between `BigInteger` (SQLite) and `Numeric(18, 4)` (Postgres) |
| **JSON Columns** | `TEXT` (serialized JSON) | Native `JSONB` (indexed) | `JSON().with_variant(JSONB(), "postgresql")` |
| **Schema Migrations** | `render_as_batch=True` table recreation + named `CHECK`s | Standard `ALTER TABLE` DDL | Single Alembic revision history with explicit `NAMING_CONVENTION` |
| **Append-Only `audit_logs**` | `BEFORE UPDATE` & `BEFORE DELETE` triggers calling `RAISE(ABORT, ...)` | `REVOKE UPDATE, DELETE, TRUNCATE` from app DB role | Alembic migration installs dialect-appropriate guard |
| **Tenant Isolation** | Strict service-layer `company_id` predicate enforcement | Service-layer enforcement **PLUS** PostgreSQL Row-Level Security (RLS) | `TenantContext` sets `SET LOCAL app.current_company_id = :cid` on Postgres transactions |

### 5.2 Multi-Tenant Isolation Architecture

1. **Mandatory Tenant Context Dependency:** Every company-scoped endpoint injects `ctx: TenantContext = Depends(require_company_context(min_role=...))`, which:
* Extracts `user_id` from verified JWT.
* Reads `X-Company-Id` header and confirms an active `company_memberships` row with sufficient RBAC role (`OWNER` > `ACCOUNTANT` > `DATA_ENTRY` > `AUDITOR_READONLY`).
* On PostgreSQL, executes `SELECT set_config('app.current_company_id', :company_id, true)` at transaction start so every RLS policy (`USING (company_id = current_setting('app.current_company_id')::bigint)`) enforces hard database-level isolation against accidental cross-tenant joins.


2. **Cross-Tenant Foreign Key Defense:** Before inserting any voucher, stock movement, or reconciliation match, the service verifies that every referenced `ledger_id`, `item_id`, `godown_id`, `tax_rate_id`, and `bank_account_id` belongs to `ctx.company_id`.

### 5.3 Zero Secret Leakage & Privacy Hygiene

* **Environment & Git Hygiene:** `.env`, `*.db`, `*.db-wal`, `*.db-shm`, `qa-screenshots/`, and any local CSV/JSON/PDF uploads are strictly `.gitignore`d. Only `.env.example` (containing empty placeholder variable names) is tracked in Git.


* **Encryption at Rest for External Credentials:** Live bank feed tokens (`bank_accounts.feed_token_encrypted`), HMRC OAuth tokens, and Setu AA credentials are encrypted at the application layer using `cryptography.fernet.Fernet` keyed from `LEDGERPRIME_FIELD_ENCRYPTION_KEY` in environment secrets (never stored in plaintext or returned in API responses).
* **PII & Financial Redaction Middleware:** Structured backend logs automatically scrub `Authorization`, `Cookie`, `GSTIN`, `PAN`, `TIN`, `account_number`, and raw bank `narration` fields so production logs never leak private business data.
* **Synthetic Test Data Only:** Local previews, automated Pytest suites, and Visual QA screenshots strictly load `backend/app/seed/dummy_company.py` (*Bharat Hardware & Exports Pvt. Ltd.*, FY 2026–27) and never touch real business records.


* **India Statutory Backup & Retention (MCA Rule 3(5) & Sec 128(5)):** Production PostgreSQL is hosted in or replicated daily to an India region (`ap-south-1` Mumbai) via automated encrypted daily `pg_dump` snapshots retained alongside `audit_logs` for a minimum of **8 financial years**.


* **Edge & Upload Security:** Strict CORS allowlist (Cloudflare Pages domain only), Content Security Policy (CSP), rate limiting on `/auth/*` and `/import-csv`, magic-byte MIME validation on OCR uploads, and `MAX_CSV_BYTES = 5 MB` / `MAX_OCR_BYTES = 10 MB` streaming read guards.



---

## 6. Exact 8-Milestone Execution Roadmap (Phases 1–5)

Each milestone is sized for single-focus execution inside `CURRENT_TASK.md` under the 8 GB RAM constraint, ending with deterministic automated tests and a plain-English architecture summary in `TASK_STATE.md`.

| Phase | Milestone | Core Focus & Deliverables | Tables Introduced | Mandatory Exit Criteria & Verification |
| --- | --- | --- | --- | --- |
| **Phase 1**<br>*Basic Core* | **Milestone 1**<br>Visual North Star, Keyboard Engine & Masters | • `backend/app/db/` (`MonetaryNumeric18_4`, SQLite WAL, Alembic async)<br>• `modules/core/` & `modules/ledger/` masters (Companies, FY, Account Groups, Ledgers, Auth)<br>• Synthetic seed (`dummy_company.py`: Bharat Hardware & Exports Pvt. Ltd.)<br>• Frontend App Shell (`tokens.css` Light/Dark, TanStack Table v9, `useKeymap.ts` with `F4–F9` + `Alt+4–9` chords, `CommandPalette.tsx` `Alt+G`)<br>• **Visual QA Loop #1** (Desktop 1440px + Mobile 390px) | `users`, `company_memberships`, `companies`, `fiscal_years`, `account_groups`, `ledgers`, `currencies` (seed INR/USD/GBP), `audit_logs` | • `alembic upgrade head` passes cleanly on SQLite<br>• `pytest tests/test_masters.py` passes<br>• `npm run build` zero TS/CSS errors<br>• Brave Linux Mint test confirms `F4–F9`, `Alt+4–9`, and `Alt+G` intercept without page reload |
| **Phase 1**<br>*Basic Core* | **Milestone 2**<br>Atomic Double-Entry Vouchers, Edit Log & Core Reports | • Full `VoucherService` with 4-layer Dr==Cr balance enforcement, FY/lock-date guards, `bill_allocations`, and SHA-256 hash-chained `audit_logs` + SQLite append-only triggers<br>• Unified `VoucherDrawer.tsx` (React Hook Form + Zod 4 `BigInt` balance check)<br>• Core Reports: Trial Balance, P&L, Balance Sheet, Ledger Statement (running balance), Day Book, AR/AP Aging<br>• `@media print` A4 Light Mode export | `vouchers`, `voucher_lines`, `bill_allocations` | • Unbalanced voucher strictly returns HTTP `422`<br>• Direct `UPDATE`/`DELETE` on `audit_logs` fails at SQLite trigger level<br>• `verify-chain` returns `valid: true`<br>• Seed Trial Balance asserts `SUM(Dr) == SUM(Cr)` to 4 decimal places |
| **Phase 2**<br>*Inventory & India Billing* | **Milestone 3**<br>Perpetual Inventory (FIFO/WAC), Godowns & India GST Invoicing | • `modules/inventory/` (`units`, `godowns`, `items`, `stock_batches`, `stock_movements`, FIFO & WAC engines, Godown Transfer)<br>• `modules/tax_india/` Place-of-Supply GST hook (Intra CGST+SGST vs Inter IGST, Cess, Sec 17(5) blocked credit, RCM, Round-Off)<br>• Sales/Purchase Item Invoices & Credit/Debit Notes with automatic atomic COGS posting & stock reversal<br>• A4 GST Tax Invoice print layout with HSN summary table | `units`, `godowns`, `items`, `stock_batches`, `stock_movements`, `tax_jurisdictions`, `tax_rates`, `hsn_sac_codes` | • Multi-lot FIFO sale consumes oldest lots first and posts balanced Revenue + GST + COGS + Inventory lines<br>• Credit Note restores stock at original FIFO cost<br>• Zero float drift across 100-item GST invoice test |
| **Phase 3**<br>*Banking & India Compliance* | **Milestone 4**<br>Indian Bank CSV Parser, Split-Screen Recon Workbench & BRS | • Zero-pandas streaming `IndianBankCsvParser` (HDFC, SBI, ICICI, Axis; lakh/crore comma parsing; UTR/IMPS/UPI/Cheque regex; SHA-256 `row_hash` idempotency)<br>• Deterministic scoring engine (`+60` amount, `+25` ±3d date, `+15` ref)<br>• 1:1 Auto-recon + 1:N / N:1 Split allocation + Net-of-fee quick-add<br>• `BankingReconWorkbench.tsx` split-screen drawer & Bank Reconciliation Statement (BRS)<br>• **Visual QA Loop #2** | `bank_accounts`, `bank_statement_lines`, `reconciliation_matches` | • Re-uploading overlapping HDFC/SBI CSV inserts 0 duplicates<br>• Mirror polarity violation raises HTTP `422`<br>• Split allocation sum exceeding statement line blocked by ORM & CHECK constraint<br>• BRS reconciles `Books ± Timing Items == Bank Closing` |
| **Phase 3**<br>*Banking & India Compliance* | **Milestone 5**<br>India GST Return Suite (GSTR-1/2B/3B/IMS), E-Invoice & TDS | • GSTR-1 Offline JSON v3.2.4 generator (`b2b`, `b2cl` > ₹1L, `b2cs`, `cdnr`, split `hsn_b2b`/`hsn_b2c`, `doc_issue`)<br>• GSTR-2B JSON importer, 3-way Books-vs-2B reconciliation workbench, and IMS action manager (`A`/`R`/`P`/`NAT` + 1-period CN cap)<br>• GSTR-3B **Rule 88A / Rule 86B** optimal ITC set-off engine & `TAX_SETOFF` voucher posting<br>• NIC E-Invoice **INV-01 v1.1** JSON generator (30-day window & `ShipDtls` validator)<br>• TDS engine (`194C/J/I/H/Q`, Sec 206AA no-PAN 20%, Form 26Q summary) | `gstr2b_records`, `tds_sections` | • Exported GSTR-1 JSON passes strict GSTN v3.2.4 schema validation<br>• Rule 88A unit tests prove IGST ITC exhausts to `0.00` before CGST/SGST utilization and blocks CGST$\leftrightarrow$SGST cross-use<br>• TDS threshold test triggers cumulative deduction on crossing annual aggregate limit |
| **Phase 4**<br>*Global Multi-Currency & Tax* | **Milestone 6**<br>Multi-Currency Engine, Forex Gain/Loss & Global Tax Plugins | • `modules/multicurrency/` (`exchange_rates`, foreign currency invoicing, automatic **Realized Forex Gain/Loss** on bill settlement, period-end **Unrealized Revaluation** + Day-1 auto-reversal)<br>• `modules/tax_global/`:<br>- US Form 1099-NEC TY 2026 ($2,000 OBBBA threshold, Boxes `1a–1d`, IRS **IRIS** export)<br>- UK HMRC **MTD VAT 9-Box** computation & OAuth2/Fraud-Header adapter<br>• Multi-currency table UI (`ISO` column + original & base columns + FX tooltip) | `exchange_rates` | • USD invoice @ `84.00` settled @ `85.20` zeroes AR in both USD & INR and credits `Realized Forex Gain ₹1,200.00`<br>• US 1099-NEC accurately excludes `$1,999.99` and includes `$2,000.00` contractors<br>• UK MTD VAT validates `Box 3 == Box 1 + Box 2` and `Box 5 == abs(Box 3 - Box 4)` |
| **Phase 5**<br>*Automation* | **Milestone 7**<br>Categorization Rules, Recurring Engine, Live Bank Feeds & OCR | • `modules/automation/`:<br>- Priority-ordered `categorization_rules` engine with dry-run preview<br>- Idempotent `recurring_templates` scheduler<br>- Pluggable `ocr_documents` extraction pipeline $\rightarrow$ reviewable `DRAFT` voucher inbox<br>• Unified `BankFeedAdapter` implementing **Setu AA v2 (ReBIT)** and **Plaid Sandbox** (`/transactions/sync` + sign inversion + webhook handlers) | `categorization_rules`, `recurring_templates`, `ocr_documents` | • Plaid sign-inversion test maps positive outflow to `withdrawal` and negative inflow to `deposit`<br>• Recurring runner executes idempotently without double-posting on retry<br>• OCR upload rejects files > 10 MB (`413`) and produces balanced `DRAFT` voucher |
| **Phase 5**<br>*Cloud Production* | **Milestone 8**<br>Neon PostgreSQL Cutover, RLS Hardening & Cloud Launch | • Full Alembic migration & data parity verification on **Neon PostgreSQL** (`NUMERIC(18,4)` + `JSONB` + RLS policies + `REVOKE` on `audit_logs`)<br>• `Fernet` credential encryption, PII log redaction middleware, CORS/CSP/rate limits<br>• Automated daily India-region backup script (MCA Rule 3(5) compliance)<br>• Deployment manifests for **Cloudflare Pages** (frontend) + **Render/Fly.io** (backend)<br>• Full end-to-end invariant regression suite & **Final Visual QA Audit** | *(No new tables; Postgres RLS policies & production indexes)* | • Cross-tenant query test proves RLS blocks reading Company B from Company A session<br>• Full pytest accounting suite passes 100% against both SQLite and Neon Postgres<br>• Production healthcheck, A4 print, and dark/light accessibility checks pass |
