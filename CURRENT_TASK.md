# CURRENT_TASK.md — Milestone 3: Domestic GST Billing, Perpetual Inventory (FIFO & Weighted Average) & A4 Print Tax Invoice

**Project:** LedgerPrime
**Milestone:** 3 (Phase 2 — Domestic India GST & Perpetual Inventory)
**Target Executor:** Local Coding Agent (`Gemini 4 Hydrogen` in Google Antigravity)
**Prerequisite State:** Milestone 1 (Masters, Auth, Seed, App Shell) and Milestone 2 (Atomic Double-Entry Vouchers, `VoucherSequence`, Trial Balance, P&L, Balance Sheet) are green.

---

## 0. Non-Negotiable Engineering Guardrails

Enforce every constraint below across all new and modified files:

1. **Backend Stack:** FastAPI `0.165.0`, Pydantic `v2.14+` (`model_config = ConfigDict(from_attributes=True)`), SQLAlchemy `2.1+` Async (`selectinload`, `expire_on_commit=False`), Alembic `1.20.1` (`render_as_batch=True`), SQLite WAL (`aiosqlite`).
2. **Exact Monetary Storage & Serialization:**
   - Reuse `Base`, `begin_write_transaction`, and `get_db` from `backend/app/core/database.py`.
   - Reuse `MoneyNumeric18_4`, `MoneyInput`, `MoneyStr`, `ZERO`, `MONEY_QUANT`, and `quantize_money` from `backend/app/core/money.py`.
   - Never pass Python `float` into any monetary, quantity, rate, or tax calculation. All API responses serialize `Decimal` as fixed 4-decimal strings (`"1600.0000"`) via `MoneyStr`.
3. **Named Constraints & Scaled-Integer SQLite Safety:**
   - Every `CheckConstraint` MUST have an explicit `name="..."` (auto-prefixed by `NAMING_CONVENTION` in `database.py`).
   - **CRITICAL SQLite Scaled-Int Rule:** On SQLite, `MoneyNumeric18_4` stores `INTEGER * 10_000`. Inside SQL `CheckConstraint(...)` on any `MoneyNumeric18_4` column, ONLY compare against `0` (`>= 0`, `> 0`, `= 0`) or against another `MoneyNumeric18_4` column (e.g., `cgst_rate + sgst_rate = igst_rate`, `qty_available <= qty_in`). **NEVER** compare a `MoneyNumeric18_4` column to a non-zero literal like `100` or `0.5` in a SQL `CheckConstraint` (e.g., `18.0000` is stored as `180000` on SQLite and would violate `<= 100`). Enforce upper bounds (`rate <= 100`, `abs(round_off) <= 0.5000`) in Pydantic and service-layer validators.
4. **Overflow Guard (Mandatory):**
   - **NEVER** compute `SUM(qty_available * unit_cost)` inside SQL on SQLite (multiplying two $10^4$-scaled integers scales to $10^8$ and risks 64-bit signed integer overflow / silent `REAL` conversion).
   - Always fetch open lot rows and compute multi-lot closing stock valuation in Python using `Decimal` with `ROUND_HALF_UP` to `Decimal("0.0001")`.
5. **SQLite Write Concurrency:** Every mutating service entry point MUST call `await begin_write_transaction(db)` before executing its first `SELECT` statement.
6. **Frontend Stack:**
   - Vite `6.4`, React `19.3` (pass `ref` as a regular prop; **zero** `React.forwardRef`), Tailwind CSS `v4.3.5`.
   - **Semantic CSS Tokens Only:** Use ONLY CSS variables defined in `DESIGN_SYSTEM.md` (`frontend/src/styles/tokens.css`). **Zero raw hex colors** in `.tsx` or component `.css`.
   - **TanStack Table v9:** Use `useTable` + static `tableFeatures({...})` + `<table.FlexRender />`. **NEVER** use v8 `useReactTable`.
   - **Forms & Client Preview Math:** `react-hook-form` + `zod` v4 with scaled `BigInt` (`* 10000n`) preview math.
7. **Zero-RAM A4 Tax Invoice PDF:** Implement strictly via CSS `@media print` + Tailwind `print:` classes (`window.print()`) with `print:hidden` on app chrome and Light Mode tokens forced in print. **Do NOT install WeasyPrint, ReportLab, or Playwright.**
8. **Synthetic Data Rule:** Reuse the existing synthetic company (*Bharat Hardware & Exports Pvt. Ltd.*, FY 2026–27) in `backend/app/seed/dummy_company.py`. Use only clearly placeholder 15-character synthetic test GSTINs (checksum-valid via `compute_gstin_check_digit`). Never use real business GSTINs or real personal data.

---

## 1. Database Models & Alembic Migration

Create three new ORM model files and register all models in `backend/app/models/__init__.py`.

### 1.1 `backend/app/models/gst.py`

#### Enum: `HsnSacType(StrEnum)`
- `HSN = "HSN"`, `SAC = "SAC"`

#### Model: `GstTaxSlab` (`__tablename__ = "gst_tax_slabs"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `code` | `Mapped[str]` | `String(32), nullable=False` (e.g., `GST-18`) |
| `name` | `Mapped[str]` | `String(80), nullable=False` (e.g., `GST 18%`) |
| `cgst_rate` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `sgst_rate` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `igst_rate` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `cess_rate` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `is_active` | `Mapped[bool]` | `Boolean, nullable=False, default=True` |
| `created_at` | `Mapped[datetime]` | `DateTime(timezone=True), nullable=False, default=_utc_now` |

**`__table_args__` (all explicitly named):**
- `UniqueConstraint("company_id", "code", name="uq_gst_tax_slabs_company_code")`
- `UniqueConstraint("company_id", "name", name="uq_gst_tax_slabs_company_name")`
- `CheckConstraint("cgst_rate >= 0 AND sgst_rate >= 0 AND igst_rate >= 0 AND cess_rate >= 0", name="non_negative_gst_rates")`
- `CheckConstraint("cgst_rate + sgst_rate = igst_rate", name="cgst_plus_sgst_equals_igst")`

#### Model: `HsnSacCode` (`__tablename__ = "hsn_sac_codes"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `code` | `Mapped[str]` | `String(8), nullable=False` |
| `code_type` | `Mapped[str]` | `String(3), nullable=False` (`HSN` \| `SAC`) |
| `description` | `Mapped[str]` | `String(255), nullable=False` |
| `default_tax_slab_id` | `Mapped[int \| None]` | `ForeignKey("gst_tax_slabs.id", ondelete="RESTRICT"), nullable=True` |
| `default_uqc` | `Mapped[str]` | `String(16), nullable=False, default="NOS"` |
| `is_active` | `Mapped[bool]` | `Boolean, nullable=False, default=True` |

**`__table_args__`:**
- `UniqueConstraint("company_id", "code", name="uq_hsn_sac_codes_company_code")`
- `CheckConstraint("code_type IN ('HSN', 'SAC')", name="valid_hsn_sac_type")`
- `CheckConstraint("code_type != 'SAC' OR default_uqc = 'NA'", name="sac_requires_na_uqc")`

---

### 1.2 `backend/app/models/inventory.py`

#### Enums
- `ItemType(StrEnum)`: `GOODS = "GOODS"`, `SERVICE = "SERVICE"`
- `ValuationMethod(StrEnum)`: `FIFO = "FIFO"`, `WEIGHTED_AVG = "WEIGHTED_AVG"`
- `StockDirection(StrEnum)`: `IN = "IN"`, `OUT = "OUT"`
- `MovementReason(StrEnum)`: `PURCHASE = "PURCHASE"`, `SALE = "SALE"`, `SALES_RETURN = "SALES_RETURN"`, `PURCHASE_RETURN = "PURCHASE_RETURN"`, `CANCELLATION_REVERSAL = "CANCELLATION_REVERSAL"`, `OPENING_STOCK = "OPENING_STOCK"`, `ADJUSTMENT = "ADJUSTMENT"`

#### Model: `UnitOfMeasure` (`__tablename__ = "units_of_measure"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `symbol` | `Mapped[str]` | `String(16), nullable=False` (`Nos`, `kg`, `m`, `Box`, `Svc`) |
| `formal_name` | `Mapped[str]` | `String(64), nullable=False` |
| `uqc_code` | `Mapped[str]` | `String(16), nullable=False, default="NOS"` |
| `decimal_places` | `Mapped[int]` | `SmallInteger, nullable=False, default=0` |
| `is_active` | `Mapped[bool]` | `Boolean, nullable=False, default=True` |

**`__table_args__`:**
- `UniqueConstraint("company_id", "symbol", name="uq_uom_company_symbol")`
- `CheckConstraint("decimal_places >= 0 AND decimal_places <= 4", name="valid_uom_decimal_places")`

#### Model: `Godown` (`__tablename__ = "godowns"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `code` | `Mapped[str]` | `String(32), nullable=False` |
| `name` | `Mapped[str]` | `String(120), nullable=False` |
| `address` | `Mapped[str \| None]` | `String(255), nullable=True` |
| `state_code` | `Mapped[str \| None]` | `String(8), nullable=True` |
| `is_default` | `Mapped[bool]` | `Boolean, nullable=False, default=False` |
| `is_active` | `Mapped[bool]` | `Boolean, nullable=False, default=True` |

**`__table_args__`:**
- `UniqueConstraint("company_id", "code", name="uq_godowns_company_code")`
- `UniqueConstraint("company_id", "name", name="uq_godowns_company_name")`

#### Model: `InventoryItem` (`__tablename__ = "inventory_items"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `sku` | `Mapped[str]` | `String(64), nullable=False` |
| `name` | `Mapped[str]` | `String(160), nullable=False` |
| `item_type` | `Mapped[str]` | `String(16), nullable=False, default="GOODS"` (`GOODS` \| `SERVICE`) |
| `valuation_method` | `Mapped[str]` | `String(16), nullable=False, default="FIFO"` (`FIFO` \| `WEIGHTED_AVG`) |
| `unit_id` | `Mapped[int]` | `ForeignKey("units_of_measure.id", ondelete="RESTRICT"), nullable=False` |
| `hsn_sac_id` | `Mapped[int \| None]` | `ForeignKey("hsn_sac_codes.id", ondelete="RESTRICT"), nullable=True` |
| `default_tax_slab_id` | `Mapped[int \| None]` | `ForeignKey("gst_tax_slabs.id", ondelete="RESTRICT"), nullable=True` |
| `sales_ledger_id` | `Mapped[int \| None]` | `ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True` |
| `purchase_ledger_id` | `Mapped[int \| None]` | `ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True` |
| `cogs_ledger_id` | `Mapped[int \| None]` | `ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True` |
| `inventory_ledger_id` | `Mapped[int \| None]` | `ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True` |
| `standard_selling_price` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `standard_purchase_cost` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `reorder_level` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `is_active` | `Mapped[bool]` | `Boolean, nullable=False, default=True` |
| `created_at` | `Mapped[datetime]` | `DateTime(timezone=True), nullable=False, default=_utc_now` |

**`__table_args__`:**
- `UniqueConstraint("company_id", "sku", name="uq_inventory_items_company_sku")`
- `CheckConstraint("item_type IN ('GOODS', 'SERVICE')", name="valid_item_type")`
- `CheckConstraint("valuation_method IN ('FIFO', 'WEIGHTED_AVG')", name="valid_valuation_method")`
- `CheckConstraint("standard_selling_price >= 0 AND standard_purchase_cost >= 0 AND reorder_level >= 0", name="non_negative_item_prices_and_reorder")`

#### Model: `InventoryLot` (`__tablename__ = "inventory_lots"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `item_id` | `Mapped[int]` | `ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `godown_id` | `Mapped[int]` | `ForeignKey("godowns.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `source_invoice_id` | `Mapped[int \| None]` | `ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True` |
| `source_invoice_line_id` | `Mapped[int \| None]` | `ForeignKey("invoice_lines.id", ondelete="RESTRICT"), nullable=True` |
| `batch_ref` | `Mapped[str]` | `String(64), nullable=False` |
| `received_date` | `Mapped[date]` | `Date, nullable=False` |
| `expiry_date` | `Mapped[date \| None]` | `Date, nullable=True` |
| `qty_in` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `qty_available` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `unit_cost` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `created_at` | `Mapped[datetime]` | `DateTime(timezone=True), nullable=False, default=_utc_now` |

**`__table_args__`:**
- `CheckConstraint("qty_in > 0", name="lot_qty_in_positive")`
- `CheckConstraint("qty_available >= 0 AND qty_available <= qty_in", name="lot_qty_available_bounds")`
- `CheckConstraint("unit_cost >= 0", name="lot_unit_cost_non_negative")`
- `Index("ix_inventory_lots_fifo_queue", "company_id", "item_id", "godown_id", "received_date", "id")`

#### Model: `StockMovement` (`__tablename__ = "stock_movements"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `item_id` | `Mapped[int]` | `ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False` |
| `godown_id` | `Mapped[int]` | `ForeignKey("godowns.id", ondelete="RESTRICT"), nullable=False` |
| `invoice_id` | `Mapped[int \| None]` | `ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True` |
| `invoice_line_id` | `Mapped[int \| None]` | `ForeignKey("invoice_lines.id", ondelete="RESTRICT"), nullable=True` |
| `voucher_id` | `Mapped[int \| None]` | `ForeignKey("vouchers.id", ondelete="RESTRICT"), nullable=True` |
| `movement_date` | `Mapped[date]` | `Date, nullable=False` |
| `direction` | `Mapped[str]` | `String(3), nullable=False` (`IN` \| `OUT`) |
| `movement_reason` | `Mapped[str]` | `String(24), nullable=False` |
| `quantity` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `unit_cost` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `total_cost` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `running_qty` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `running_avg_cost` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `created_at` | `Mapped[datetime]` | `DateTime(timezone=True), nullable=False, default=_utc_now` |

**`__table_args__`:**
- `CheckConstraint("direction IN ('IN', 'OUT')", name="valid_stock_direction")`
- `CheckConstraint("quantity > 0", name="movement_qty_positive")`
- `CheckConstraint("unit_cost >= 0 AND total_cost >= 0 AND running_qty >= 0 AND running_avg_cost >= 0", name="non_negative_movement_costs_and_running")`
- `Index("ix_stock_movements_item_godown_date", "company_id", "item_id", "godown_id", "movement_date", "id")`

#### Model: `FifoLotAllocation` (`__tablename__ = "fifo_lot_allocations"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `stock_movement_id` | `Mapped[int]` | `ForeignKey("stock_movements.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `inventory_lot_id` | `Mapped[int]` | `ForeignKey("inventory_lots.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `qty_allocated` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `unit_cost` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `total_cost` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `is_reversed` | `Mapped[bool]` | `Boolean, nullable=False, default=False` |
| `created_at` | `Mapped[datetime]` | `DateTime(timezone=True), nullable=False, default=_utc_now` |

**`__table_args__`:**
- `CheckConstraint("qty_allocated > 0", name="allocation_qty_positive")`
- `CheckConstraint("unit_cost >= 0 AND total_cost >= 0", name="allocation_costs_non_negative")`

---

### 1.3 `backend/app/models/invoicing.py`

#### Enums
- `InvoiceType(StrEnum)`: `SALES = "SALES"`, `PURCHASE = "PURCHASE"`, `CREDIT_NOTE = "CREDIT_NOTE"`, `DEBIT_NOTE = "DEBIT_NOTE"`
- `SupplyType(StrEnum)`: `REGULAR = "REGULAR"`, `EXPORT_LUT = "EXPORT_LUT"`, `EXPORT_WPAY = "EXPORT_WPAY"`, `SEZ_LUT = "SEZ_LUT"`, `SEZ_WPAY = "SEZ_WPAY"`
- `InvoiceStatus(StrEnum)`: `DRAFT = "DRAFT"`, `POSTED = "POSTED"`, `CANCELLED = "CANCELLED"`

#### Model: `Invoice` (`__tablename__ = "invoices"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `company_id` | `Mapped[int]` | `ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `fiscal_year_id` | `Mapped[int]` | `ForeignKey("fiscal_years.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `voucher_id` | `Mapped[int \| None]` | `ForeignKey("vouchers.id", ondelete="RESTRICT"), unique=True, nullable=True` (1-to-1 FK; strictly non-null when `POSTED`) |
| `invoice_number` | `Mapped[str]` | `String(40), nullable=False` |
| `invoice_type` | `Mapped[str]` | `String(16), nullable=False` (`SALES` \| `PURCHASE` \| `CREDIT_NOTE` \| `DEBIT_NOTE`) |
| `supply_type` | `Mapped[str]` | `String(16), nullable=False, default="REGULAR"` (`REGULAR` \| `EXPORT_LUT` \| `EXPORT_WPAY` \| `SEZ_LUT` \| `SEZ_WPAY`) |
| `invoice_date` | `Mapped[date]` | `Date, nullable=False, index=True` |
| `due_date` | `Mapped[date \| None]` | `Date, nullable=True` |
| `party_ledger_id` | `Mapped[int]` | `ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=False, index=True` |
| `party_name_snapshot` | `Mapped[str]` | `String(160), nullable=False` |
| `party_gstin_snapshot` | `Mapped[str \| None]` | `String(32), nullable=True` |
| `party_state_code_snapshot` | `Mapped[str \| None]` | `String(8), nullable=True` |
| `origin_state_code` | `Mapped[str]` | `String(8), nullable=False` |
| `place_of_supply` | `Mapped[str]` | `String(8), nullable=False` |
| `is_inter_state` | `Mapped[bool]` | `Boolean, nullable=False, default=False` |
| `is_rcm` | `Mapped[bool]` | `Boolean, nullable=False, default=False` |
| `original_invoice_id` | `Mapped[int \| None]` | `ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True` |
| `supplier_invoice_no` | `Mapped[str \| None]` | `String(64), nullable=True` |
| `supplier_invoice_date` | `Mapped[date \| None]` | `Date, nullable=True` |
| `subtotal` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `total_discount` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `taxable_total` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `cgst_total` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `sgst_total` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `igst_total` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `cess_total` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `tax_total` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `round_off` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` (signed; `abs <= 0.5000` enforced in service/schema) |
| `grand_total` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `total_cogs` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `status` | `Mapped[str]` | `String(16), nullable=False, default="DRAFT"` (`DRAFT` \| `POSTED` \| `CANCELLED`) |
| `narration` | `Mapped[str]` | `String(500), nullable=False, default=""` |
| `cancelled_at` | `Mapped[datetime \| None]` | `DateTime(timezone=True), nullable=True` |
| `cancellation_reason` | `Mapped[str \| None]` | `String(255), nullable=True` |
| `created_at` | `Mapped[datetime]` | `DateTime(timezone=True), nullable=False, default=_utc_now` |
| `updated_at` | `Mapped[datetime]` | `DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now` |

**`__table_args__`:**
- `UniqueConstraint("company_id", "fiscal_year_id", "invoice_number", name="uq_invoices_company_fy_number")`
- `CheckConstraint("invoice_type IN ('SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE')", name="valid_invoice_type")`
- `CheckConstraint("supply_type IN ('REGULAR', 'EXPORT_LUT', 'EXPORT_WPAY', 'SEZ_LUT', 'SEZ_WPAY')", name="valid_supply_type")`
- `CheckConstraint("status IN ('DRAFT', 'POSTED', 'CANCELLED')", name="valid_invoice_status")`
- `CheckConstraint("status != 'POSTED' OR voucher_id IS NOT NULL", name="posted_invoice_requires_voucher")`
- `CheckConstraint("subtotal >= 0 AND total_discount >= 0 AND taxable_total >= 0 AND cgst_total >= 0 AND sgst_total >= 0 AND igst_total >= 0 AND cess_total >= 0 AND tax_total >= 0 AND grand_total >= 0 AND total_cogs >= 0", name="non_negative_invoice_totals")`
- `Index("ix_invoices_company_date_type_status", "company_id", "invoice_date", "invoice_type", "status")`

#### Model: `InvoiceLine` (`__tablename__ = "invoice_lines"`)
| Column | SQLAlchemy Type | Constraints / Defaults |
| :--- | :--- | :--- |
| `id` | `Mapped[int]` | `primary_key=True` |
| `invoice_id` | `Mapped[int]` | `ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True` |
| `line_no` | `Mapped[int]` | `Integer, nullable=False` |
| `item_id` | `Mapped[int \| None]` | `ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=True` |
| `godown_id` | `Mapped[int \| None]` | `ForeignKey("godowns.id", ondelete="RESTRICT"), nullable=True` |
| `account_ledger_id` | `Mapped[int \| None]` | `ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True` |
| `description` | `Mapped[str]` | `String(255), nullable=False` |
| `hsn_sac_code` | `Mapped[str \| None]` | `String(8), nullable=True` |
| `uqc_code` | `Mapped[str]` | `String(16), nullable=False, default="NOS"` |
| `quantity` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `unit_price` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `discount_pct` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `discount_amount` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `taxable_amount` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `tax_slab_id` | `Mapped[int \| None]` | `ForeignKey("gst_tax_slabs.id", ondelete="RESTRICT"), nullable=True` |
| `cgst_rate` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `sgst_rate` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `igst_rate` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `cess_rate` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `cgst_amount` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `sgst_amount` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `igst_amount` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `cess_amount` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `line_total` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False` |
| `line_cogs` | `Mapped[Decimal]` | `MoneyNumeric18_4, nullable=False, default=ZERO` |
| `batch_ref` | `Mapped[str \| None]` | `String(64), nullable=True` |
| `expiry_date` | `Mapped[date \| None]` | `Date, nullable=True` |

**`__table_args__`:**
- `UniqueConstraint("invoice_id", "line_no", name="uq_invoice_lines_order")`
- `CheckConstraint("line_no >= 1", name="invoice_line_no_positive")`
- `CheckConstraint("quantity > 0", name="invoice_line_qty_positive")`
- `CheckConstraint("unit_price >= 0 AND discount_pct >= 0 AND discount_amount >= 0 AND taxable_amount >= 0 AND cgst_rate >= 0 AND sgst_rate >= 0 AND igst_rate >= 0 AND cess_rate >= 0 AND cgst_amount >= 0 AND sgst_amount >= 0 AND igst_amount >= 0 AND cess_amount >= 0 AND line_total >= 0 AND line_cogs >= 0", name="non_negative_invoice_line_amounts")`

### 1.4 Model Exports & Alembic Migration
- Update `backend/app/models/__init__.py` to import and export `GstTaxSlab`, `HsnSacCode`, `UnitOfMeasure`, `Godown`, `InventoryItem`, `InventoryLot`, `StockMovement`, `FifoLotAllocation`, `Invoice`, `InvoiceLine`.
- Generate migration with `alembic revision --autogenerate -m "milestone_3_gst_inventory_invoicing"`. Verify `render_as_batch=True` is active in `backend/alembic/env.py` and verify `downgrade()` cleanly drops all 10 tables in reverse FK order.

---

## 2. Tax Calculation Service (`backend/app/modules/tax_india/gst_calculator.py`)

Implement as pure, stateless functions using `decimal.Decimal` (`ROUND_HALF_UP`). All intermediate currency/tax amounts are quantized to paise (`Decimal("0.01")`) and normalized via `quantize_money(...)` to `Decimal("0.0001")` so backend totals match printed rupee-paise invoices and frontend `BigInt` math identically.

### 2.1 Line Calculation Rules
Given `quantity`, `unit_price`, `discount_pct`, `discount_amount`, `slab_cgst_rate`, `slab_sgst_rate`, `slab_igst_rate`, `slab_cess_rate`, `origin_state_code`, `place_of_supply`, `supply_type`, and `is_rcm`:

1. **Gross Amount:** `gross = quantize_paise(quantity * unit_price)` (where `quantize_paise(x) = x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP).quantize(MONEY_QUANT)`).
2. **Pre-Tax Discount Precedence:**
   - Reject if `discount_pct > 100` or `discount_pct < 0` or `discount_amount < 0` (HTTP `422`).
   - If `discount_amount > ZERO`: validate `discount_amount <= gross` (else HTTP `422`); `eff_discount_amount = quantize_paise(discount_amount)`; `eff_discount_pct = ((eff_discount_amount / gross) * Decimal("100")).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)` if `gross > ZERO` else `ZERO`.
   - Else if `discount_pct > ZERO`: `eff_discount_pct = quantize_money(discount_pct)`; `eff_discount_amount = quantize_paise(gross * eff_discount_pct / Decimal("100"))`.
   - Else: both `ZERO`.
   - `taxable_amount = quantize_money(gross - eff_discount_amount)`.
3. **Place of Supply & Supply Type Split:**
   - If `supply_type in ("EXPORT_LUT", "SEZ_LUT")`:
     - `is_inter_state = True`; effective `cgst_rate = sgst_rate = igst_rate = cess_rate = ZERO` (zero-rated supply regardless of slab).
   - Else if `supply_type in ("EXPORT_WPAY", "SEZ_WPAY")`:
     - `is_inter_state = True`; `cgst_rate = sgst_rate = ZERO`, `igst_rate = slab_igst_rate`, `cess_rate = slab_cess_rate`.
   - Else (`supply_type == "REGULAR"`):
     - If `origin_state_code.strip() == place_of_supply.strip()`:
       - `is_inter_state = False`; `cgst_rate = slab_cgst_rate`, `sgst_rate = slab_sgst_rate`, `igst_rate = ZERO`, `cess_rate = slab_cess_rate`.
     - Else:
       - `is_inter_state = True`; `cgst_rate = ZERO`, `sgst_rate = ZERO`, `igst_rate = slab_igst_rate`, `cess_rate = slab_cess_rate`.
4. **Line Tax & Total:**
   - `cgst_amount = quantize_paise(taxable_amount * cgst_rate / Decimal("100"))`
   - `sgst_amount = quantize_paise(taxable_amount * sgst_rate / Decimal("100"))`
   - `igst_amount = quantize_paise(taxable_amount * igst_rate / Decimal("100"))`
   - `cess_amount = quantize_paise(taxable_amount * cess_rate / Decimal("100"))`
   - `line_tax = cgst_amount + sgst_amount + igst_amount + cess_amount`
   - `line_total = taxable_amount` if `is_rcm` else `taxable_amount + line_tax` (for RCM, tax is self-assessed separately and excluded from supplier payable).
5. **Invoice Totals & Optional Nearest-Rupee Round Off:**
   - Sum `subtotal` ($\sum \text{gross}$), `total_discount`, `taxable_total`, `cgst_total`, `sgst_total`, `igst_total`, `cess_total`, `tax_total`.
   - `raw_payable = taxable_total` if `is_rcm` else `taxable_total + tax_total`.
   - If `enable_round_off` is `True`:
     - `rounded = raw_payable.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(MONEY_QUANT)`
     - `round_off = quantize_money(rounded - raw_payable)` (mathematically guaranteed within $[-0.5000, +0.5000]$)
     - `grand_total = rounded`
   - Else: `round_off = ZERO`, `grand_total = raw_payable`.
6. **HSN/SAC Summary Grouping:** Helper `build_hsn_summary(lines)` groups lines by `(hsn_sac_code or "N/A", cgst_rate, sgst_rate, igst_rate, cess_rate)` returning exact summed `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `cess_amount`, and `total_tax` for A4 print output.

### 2.2 Pure Structural + Mod-36 Tax ID Validator
Implement `compute_gstin_check_digit(prefix_14: str) -> str` and `validate_gstin(gstin: str) -> GstinValidationResult`:
- Alphabet: `MOD36_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"` (indices `0..35`).
- Valid Indian GST State/UT codes: `{"01".."38", "97", "99"}` (38 states/UTs + Other Territory `97` + Centre Jurisdiction `99`).
- Structural regex (after `.strip().upper()`): `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`.
- Mod-36 checksum on `gstin[:14]`:
  - For index `i, ch` in `enumerate(prefix_14)`:
    - `code_point = MOD36_ALPHABET.index(ch)`
    - `factor = 1 if i % 2 == 0 else 2`
    - `q, r = divmod(code_point * factor, 36)`
    - `total += q + r`
  - `expected_char = MOD36_ALPHABET[(36 - (total % 36)) % 36]`
  - Valid iff `gstin[14] == expected_char`.
- Return dataclass/Pydantic model `{is_valid: bool, normalized: str, state_code: str | None, pan: str | None, error: str | None}`.

---

## 3. Perpetual Inventory Costing Engine (`backend/app/modules/inventory/service.py`)

All inventory write functions execute inside the caller's active transaction (`begin_write_transaction(db)` already invoked).

### 3.1 Helper: Latest Running State
`_get_latest_running_state(db, company_id, item_id, godown_id) -> tuple[Decimal, Decimal]`
- Query `StockMovement` filtered by `(company_id, item_id, godown_id)` ordered by `StockMovement.id.desc()` with `.limit(1)`.
- Returns `(movement.running_qty, movement.running_avg_cost)` or `(ZERO, ZERO)` if no prior movement exists.

### 3.2 Inward Receipt (`receive_stock(...)`)
Used by `PURCHASE`, `CREDIT_NOTE` (sales return), `OPENING_STOCK`, and cancellation reversals of outward issues:
1. Validate `item.item_type == "GOODS"` (no-op for `SERVICE`).
2. Create `InventoryLot(company_id, item_id, godown_id, source_invoice_id, source_invoice_line_id, batch_ref, received_date, expiry_date, qty_in=qty, qty_available=qty, unit_cost=unit_cost)` (auto-generate `batch_ref = f"LOT-{received_date.strftime('%Y%m%d')}-{line_no:02d}"` if omitted).
3. Fetch `(prev_qty, prev_avg)` via `_get_latest_running_state(...)`.
4. Compute exact Moving Weighted Average in Python `Decimal`:
   - `in_total_cost = (qty * unit_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)`
   - `prev_total_value = prev_qty * prev_avg` (keep exact product before dividing)
   - `new_qty = quantize_money(prev_qty + qty)`
   - `new_avg_cost = ((prev_total_value + in_total_cost) / new_qty).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)` if `new_qty > ZERO` else `ZERO`
5. Insert `StockMovement(direction="IN", movement_reason=reason, quantity=qty, unit_cost=unit_cost, total_cost=in_total_cost, running_qty=new_qty, running_avg_cost=new_avg_cost, ...)`.
6. Return `(lot, movement)`.

### 3.3 Outward Issue (`issue_stock(...)`)
Used by `SALES` and `DEBIT_NOTE` (purchase return):
1. Validate `item.item_type == "GOODS"` (return `ZERO` COGS for `SERVICE`).
2. Fetch open lots for `(company_id, item_id, godown_id)` with `InventoryLot.qty_available > ZERO`, ordered strictly by:
   - Default FIFO queue: `InventoryLot.received_date.asc(), InventoryLot.id.asc()`.
   - Optional `preferred_source_invoice_id` (used for `DEBIT_NOTE` linked to a specific `PURCHASE`): prioritize lots where `source_invoice_id == preferred_source_invoice_id` first, then FIFO order.
3. Compute `total_available = sum((lot.qty_available for lot in open_lots), ZERO)` in Python `Decimal`.
   - If `total_available < qty`: raise `InsufficientStockError` mapped to **HTTP `422 Unprocessable Entity`** (`error_code="INSUFFICIENT_STOCK"`, `details={"item_id": item.id, "sku": item.sku, "godown_id": godown_id, "requested_qty": format_money_str(qty), "available_qty": format_money_str(total_available)}`).
4. Fetch `(prev_qty, prev_avg)` via `_get_latest_running_state(...)`.
5. Deplete open lots greedily until `remaining == ZERO`:
   - `take = min(lot.qty_available, remaining)`
   - `lot.qty_available = quantize_money(lot.qty_available - take)`
   - Collect `(lot, take)`.
6. **Branch by `item.valuation_method`:**
   - **`FIFO`:**
     - For each `(lot, take)`: `alloc_cost = (take * lot.unit_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)`.
     - `total_cogs = quantize_money(sum(alloc_cost))`.
     - `movement_unit_cost = (total_cogs / qty).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)`.
     - Recompute remaining FIFO inventory value in Python `Decimal` across remaining open lots: `rem_qty = quantize_money(prev_qty - qty)`; `rem_value = sum(((l.qty_available * l.unit_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP) for l in open_lots if l.qty_available > ZERO), ZERO)`; `new_avg_cost = (rem_value / rem_qty).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)` if `rem_qty > ZERO` else `ZERO`.
   - **`WEIGHTED_AVG`:**
     - `movement_unit_cost = prev_avg`.
     - `total_cogs = (qty * prev_avg).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)`.
     - `rem_qty = quantize_money(prev_qty - qty)`.
     - `new_avg_cost = prev_avg` if `rem_qty > ZERO` else `ZERO` (outward issue NEVER mutates the moving weighted average rate while stock remains).
     - Each lot allocation stores `unit_cost = prev_avg` and `total_cost = (take * prev_avg).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)` so audit & cancellation links remain exact.
7. Insert `StockMovement(direction="OUT", movement_reason=reason, quantity=qty, unit_cost=movement_unit_cost, total_cost=total_cogs, running_qty=rem_qty, running_avg_cost=new_avg_cost, ...)`, flush to get `movement.id`, then insert all `FifoLotAllocation` rows.
8. Return `(movement, total_cogs)`.

### 3.4 Closing Stock Valuation & Reporting (Overflow-Safe)
- **`get_stock_summary(db, company_id)`:**
  - Load all active `GOODS` items with `selectinload(unit, hsn_sac, default_tax_slab)`.
  - For `FIFO` items: load open `InventoryLot` rows (`qty_available > ZERO`) and compute in Python:
    - `total_qty = sum(lot.qty_available)`
    - `closing_value = sum((lot.qty_available * lot.unit_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP))`
    - `avg_rate = (closing_value / total_qty).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)` if `total_qty > ZERO` else `ZERO`
  - For `WEIGHTED_AVG` items: for each godown where the item has movements, take the latest `StockMovement` (`running_qty`, `running_avg_cost`) and sum in Python:
    - `godown_value = (m.running_qty * m.running_avg_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)`
    - `total_qty = sum(m.running_qty)`, `closing_value = sum(godown_value)`, `avg_rate = (closing_value / total_qty).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)` if `total_qty > ZERO` else `ZERO`.
  - Compute `is_low_stock = total_qty <= item.reorder_level`.
- **`get_godown_stock(db, company_id, godown_id=None)`:** Same Python `Decimal` valuation grouped by `(godown_id, item_id)`.
- **`get_item_stock_ledger(db, company_id, item_id, godown_id=None)`:** Chronological `StockMovement` list ordered by `(movement_date ASC, id ASC)` joined with optional `invoice_number` & `godown_name`.
- **`get_item_lots(db, company_id, item_id, godown_id=None, include_exhausted=False)`:** `InventoryLot` list ordered by `(received_date ASC, id ASC)` with Python-computed `lot_value = (lot.qty_available * lot.unit_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)`.

---

## 4. Atomic Invoicing, Double-Entry Posting & Amount-in-Words

### 4.1 Indian Lakh/Crore Amount-in-Words (`backend/app/core/indian_words.py`)
Implement `amount_to_indian_words(amount: Decimal, currency_major: str = "Rupees", currency_minor: str = "Paise") -> str`:
- Quantize `abs(amount)` to `Decimal("0.01")` (`ROUND_HALF_UP`), split into `rupees: int` and `paise: int`.
- Indian grouping:
  - `crores = n // 10_000_000` (if `crores >= 100`, recurse `_int_to_indian_words(crores)` + `" Crore"`)
  - `lakhs = (n % 10_000_000) // 100_000`
  - `thousands = (n % 100_000) // 1_000`
  - `hundreds = (n % 1_000) // 100`
  - `remainder = n % 100`
- Exact canonical outputs:
  - `Decimal("0.00")` $\rightarrow$ `"Zero Rupees Only"`
  - `Decimal("1000.00")` $\rightarrow$ `"Rupees One Thousand Only"`
  - `Decimal("123456.78")` $\rightarrow$ `"Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only"`
  - `Decimal("10000000.50")` $\rightarrow$ `"Rupees One Crore and Fifty Paise Only"`

### 4.2 Atomic Double-Entry Posting Matrix (`backend/app/modules/invoicing/service.py`)

System ledgers are resolved by exact canonical name (with company scope) via a helper `_resolve_system_ledgers(db, company_id)`:
`Sales Account`, `Sales Returns`, `Purchase Account`, `Cost of Goods Sold`, `Stock-in-Hand`, `Output CGST`, `Output SGST`, `Output IGST`, `Input CGST`, `Input SGST`, `Input IGST`, `RCM Output Tax Payable`, `Round Off`. (Line-level overrides on `item.*_ledger_id` or `line.account_ledger_id` take precedence over default `Sales Account` / `Purchase Account` / `Cost of Goods Sold` / `Stock-in-Hand`.)

Voucher & invoice numbers are allocated atomically via the existing `VoucherSequence` table (`INV/26-27/0001`, `PUR/26-27/0001`, `CN/26-27/0001`, `DN/26-27/0001`) so `Invoice.invoice_number == Voucher.voucher_number`. Zero-amount ledger legs MUST be omitted before creating `VoucherLine` rows (preserving `ck_voucher_lines_mutually_exclusive_dr_cr`).

#### (a) Sales Invoice (`invoice_type="SALES"`, `voucher_type="SALES"`)
1. Run `gst_calculator` for every line.
2. For each `GOODS` line: call `inventory_service.issue_stock(...)` $\rightarrow$ record `line.line_cogs = total_cogs`; sum `invoice.total_cogs`.
3. Create balanced `Voucher(status="POSTED")` with lines:

| Ledger | Side | Amount | Condition |
| :--- | :--- | :--- | :--- |
| Party Ledger (Customer) | **Dr** | `grand_total` | Always (`> 0`) |
| Sales Ledger (per line / `Sales Account`) | **Cr** | $\sum \text{line.taxable\_amount}$ | Always (`> 0`) |
| `Output CGST` | **Cr** | `cgst_total` | If `cgst_total > 0` |
| `Output SGST` | **Cr** | `sgst_total` | If `sgst_total > 0` |
| `Output IGST` | **Cr** | `igst_total` | If `igst_total > 0` |
| `Round Off` | **Cr** / **Dr** | `round_off` (Cr if `> 0`) / `abs(round_off)` (Dr if `< 0`) | If `round_off != 0` |
| COGS Ledger (`Cost of Goods Sold`) | **Dr** | `total_cogs` (grouped by item COGS ledger) | If `total_cogs > 0` |
| Inventory Ledger (`Stock-in-Hand`) | **Cr** | `total_cogs` (grouped by item Inventory ledger) | If `total_cogs > 0` |

#### (b) Purchase Invoice (`invoice_type="PURCHASE"`, `voucher_type="PURCHASE"`)
1. Run `gst_calculator` (passing `is_rcm=payload.is_rcm`).
2. For each `GOODS` line: compute `landed_unit_cost = (line.taxable_amount / line.quantity).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)` and call `inventory_service.receive_stock(..., reason="PURCHASE")`.
3. **Normal Purchase (`is_rcm = False`):**
   - **Dr** `Stock-in-Hand` (or item `inventory_ledger_id`) = $\sum \text{taxable\_amount}$ of `GOODS` lines
   - **Dr** `Purchase Account` (or line/item `purchase_ledger_id`) = $\sum \text{taxable\_amount}$ of `SERVICE` / non-inventory lines
   - **Dr** `Input CGST` = `cgst_total` (if `> 0`), **Dr** `Input SGST` = `sgst_total` (if `> 0`), **Dr** `Input IGST` = `igst_total` (if `> 0`)
   - **Dr** `Round Off` = `round_off` (if `> 0`) OR **Cr** `Round Off` = `abs(round_off)` (if `< 0`)
   - **Cr** Party Ledger (Vendor) = `grand_total` (`taxable_total + tax_total + round_off`)
4. **Reverse Charge Purchase (`is_rcm = True`):**
   - **Dr** `Stock-in-Hand` (`GOODS`) / `Purchase Account` (`SERVICE`) = `taxable_total`
   - **Dr** `Round Off` = `round_off` (if `> 0`) OR **Cr** `Round Off` = `abs(round_off)` (if `< 0`)
   - **Cr** Party Ledger (Vendor) = `grand_total` (which equals `taxable_total + round_off` ONLY — vendor is never credited tax!)
   - **Dr** `Input CGST` = `cgst_total` (if `> 0`), **Dr** `Input SGST` = `sgst_total` (if `> 0`), **Dr** `Input IGST` = `igst_total` (if `> 0`)
   - **Cr** `RCM Output Tax Payable` = `tax_total` (`cgst_total + sgst_total + igst_total + cess_total`, if `> 0`)

#### (c) Credit Note (`invoice_type="CREDIT_NOTE"`, `voucher_type="CREDIT_NOTE"` — Sales Return)
1. Validate `original_invoice_id` (if supplied, must belong to same company and be a `POSTED` `SALES` invoice).
2. For each `GOODS` line:
   - Resolve original COGS unit rate: query `StockMovement` where `invoice_id == original_invoice_id AND item_id == line.item_id AND direction == "OUT"` and take `orig_unit_cost = orig_movement.unit_cost` (NEVER use selling price!). If standalone Credit Note without original invoice, use `_get_latest_running_state` avg cost, falling back to `item.standard_purchase_cost`.
   - Call `inventory_service.receive_stock(..., unit_cost=orig_unit_cost, reason="SALES_RETURN", batch_ref=f"RET-{invoice_number}")` $\rightarrow$ `line.line_cogs = movement.total_cost`.
3. Post balanced `Voucher`:
   - **Dr** `Sales Returns` = `taxable_total`
   - **Dr** `Output CGST` / `Output SGST` / `Output IGST` = respective tax totals (if `> 0`)
   - **Dr** `Round Off` (if `round_off > 0`) / **Cr** `Round Off` (if `round_off < 0`)
   - **Cr** Party Ledger (Customer) = `grand_total`
   - If `total_cogs > 0`: **Dr** `Stock-in-Hand` = `total_cogs`, **Cr** `Cost of Goods Sold` = `total_cogs`.

#### (d) Debit Note (`invoice_type="DEBIT_NOTE"`, `voucher_type="DEBIT_NOTE"` — Purchase Return)
1. Validate `original_invoice_id` (if supplied, must belong to same company and be a `POSTED` `PURCHASE` invoice).
2. For each `GOODS` line: call `inventory_service.issue_stock(..., reason="PURCHASE_RETURN", preferred_source_invoice_id=original_invoice_id)` (raises HTTP `422` on insufficient stock) $\rightarrow$ `line.line_cogs = depleted_cost`.
3. Post balanced `Voucher`:
   - **Dr** Party Ledger (Vendor) = `grand_total`
   - For `GOODS` lines: **Cr** `Stock-in-Hand` = `depleted_cost`; if `line.taxable_amount != depleted_cost`, post variance `diff = line.taxable_amount - depleted_cost` to `Purchase Account` (**Cr** if `diff > 0`, **Dr** if `diff < 0`).
   - For `SERVICE` lines: **Cr** `Purchase Account` = `line.taxable_amount`.
   - If `is_rcm = False`: **Cr** `Input CGST` / `Input SGST` / `Input IGST` = respective tax totals (if `> 0`).
   - If `is_rcm = True`: **Dr** `RCM Output Tax Payable` = `tax_total`, **Cr** `Input CGST` / `Input SGST` / `Input IGST` = respective tax totals.
   - **Cr** `Round Off` (if `round_off > 0`) / **Dr** `Round Off` (if `round_off < 0`).

#### (e) Non-Destructive Invoice Cancellation (`cancel_invoice(db, company_id, invoice_id, reason)`)
1. Call `await begin_write_transaction(db)`. Load `Invoice` with `lines` and `voucher`.
2. Guards:
   - If `invoice.status == "CANCELLED"` $\rightarrow$ HTTP `409 Conflict` (`error_code="INVOICE_ALREADY_CANCELLED"`).
   - Verify fiscal year is open and `invoice.invoice_date > lock_date` (else HTTP `422`).
   - If `invoice.status == "DRAFT"` $\rightarrow$ set `status = "CANCELLED"`, `cancelled_at = _utc_now()`, `cancellation_reason = reason`, commit, return.
3. **Stock Reversal for `POSTED` Invoices:**
   - **Inward Invoices (`PURCHASE` or `CREDIT_NOTE`):**
     - Query all `InventoryLot` where `source_invoice_id == invoice.id`.
     - **Consumed-Lot Conflict Check:** If ANY lot has `lot.qty_available < lot.qty_in`, **ABORT immediately with HTTP `409 Conflict`** (`error_code="LOT_ALREADY_CONSUMED"`, `details={"lot_id": lot.id, "batch_ref": lot.batch_ref, "qty_in": format_money_str(lot.qty_in), "qty_available": format_money_str(lot.qty_available)}`).
     - Otherwise, for each lot: deduct full `lot.qty_in` (`lot.qty_available = ZERO`), fetch `(prev_qty, prev_avg)` via `_get_latest_running_state`, compute `new_qty = quantize_money(prev_qty - lot.qty_in)`, recompute `new_avg_cost` from remaining open lots (for `FIFO`) or exact remaining value `(prev_qty * prev_avg - lot.qty_in * lot.unit_cost) / new_qty` (for `WEIGHTED_AVG`, clamped to `ZERO` if `new_qty == ZERO`), and insert `StockMovement(direction="OUT", movement_reason="CANCELLATION_REVERSAL", ...)`.
   - **Outward Invoices (`SALES` or `DEBIT_NOTE`):**
     - Query all `StockMovement` rows for `invoice_id == invoice.id` with `selectinload` of their `FifoLotAllocation` rows (`is_reversed == False`).
     - For each allocation: restore `lot.qty_available = quantize_money(lot.qty_available + alloc.qty_allocated)`, set `alloc.is_reversed = True`.
     - For each outward movement: compute restored `new_qty = quantize_money(prev_qty + mov.quantity)` and exact restored `new_avg_cost` (`((prev_qty * prev_avg) + mov.total_cost) / new_qty`), and insert compensating `StockMovement(direction="IN", movement_reason="CANCELLATION_REVERSAL", quantity=mov.quantity, unit_cost=mov.unit_cost, total_cost=mov.total_cost, running_qty=new_qty, running_avg_cost=new_avg_cost)`.
4. **Voucher & Invoice Status Update:**
   - Set `voucher.status = VoucherStatus.CANCELLED.value` (zeroes its Trial Balance, P&L, and Balance Sheet contribution while preserving `voucher_number`).
   - Set `invoice.status = InvoiceStatus.CANCELLED.value`, `invoice.cancelled_at = _utc_now()`, `invoice.cancellation_reason = reason`.
   - Commit atomically.

---

## 5. REST API Contracts & Pydantic v2.14 Schemas

Mount all new routers under `/api/v1` in `backend/app/main.py`. Every schema uses `model_config = ConfigDict(from_attributes=True)`, `MoneyInput` for inbound monetary/qty/rate fields, and `MoneyStr` for outbound fields.

### 5.1 Tax & GST Routes (`backend/app/modules/tax_india/router.py`)
| Method | Endpoint | Request / Query | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tax/india/slabs` | `active_only: bool = True` | `list[GstTaxSlabRead]` |
| `POST` | `/api/v1/tax/india/slabs` | `GstTaxSlabCreate` (validates `cgst + sgst == igst` & `<= 100`) | `201 GstTaxSlabRead` |
| `GET` | `/api/v1/tax/india/hsn-sac` | `q: str \| None`, `code_type: HSN\|SAC \| None` | `list[HsnSacCodeRead]` |
| `POST` | `/api/v1/tax/india/hsn-sac` | `HsnSacCodeCreate` | `201 HsnSacCodeRead` |
| `POST` | `/api/v1/tax/india/gst/preview` | `GstPreviewRequest` (`origin_state_code`, `place_of_supply`, `supply_type`, `is_rcm`, `enable_round_off`, `lines[]`) | `GstPreviewResponse` (line breakups, totals, `round_off`, `grand_total`, `hsn_summary[]`, `amount_in_words`) |
| `GET` | `/api/v1/tax/india/validate-gstin/{gstin}` | Path `gstin` | `GstinValidationResponse` |

### 5.2 Inventory Routes (`backend/app/modules/inventory/router.py`)
| Method | Endpoint | Request / Query | Response |
| :--- | :--- | :--- | :--- |
| `GET` / `POST` | `/api/v1/inventory/units` | `UnitOfMeasureCreate` | `list[UnitOfMeasureRead]` / `201 UnitOfMeasureRead` |
| `GET` / `POST` | `/api/v1/inventory/godowns` | `GodownCreate` | `list[GodownRead]` / `201 GodownRead` |
| `GET` / `POST` | `/api/v1/inventory/items` | `q`, `item_type` / `InventoryItemCreate` | `list[InventoryItemRead]` / `201 InventoryItemRead` |
| `PATCH` | `/api/v1/inventory/items/{item_id}` | `InventoryItemUpdate` | `InventoryItemRead` |
| `GET` | `/api/v1/inventory/stock-summary` | `low_stock_only: bool = False` | `StockSummaryResponse` (`items: list[StockSummaryRow]`, `grand_total_value: MoneyStr`) |
| `GET` | `/api/v1/inventory/godown-stock` | `godown_id: int \| None` | `list[GodownStockRow]` |
| `GET` | `/api/v1/inventory/items/{item_id}/ledger` | `godown_id: int \| None` | `list[StockMovementRead]` |
| `GET` | `/api/v1/inventory/items/{item_id}/lots` | `godown_id: int \| None`, `include_exhausted: bool = False` | `list[InventoryLotRead]` (includes Python-computed `lot_value: MoneyStr`) |

### 5.3 Invoicing Routes (`backend/app/modules/invoicing/router.py`)
| Method | Endpoint | Request / Query | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/invoices` | `invoice_type`, `status`, `party_ledger_id`, `from_date`, `to_date`, `q` | `list[InvoiceListItem]` |
| `POST` | `/api/v1/invoices` | `InvoiceCreate` (`status: DRAFT\|POSTED`, `invoice_type`, `supply_type`, `invoice_date`, `due_date`, `party_ledger_id`, `place_of_supply`, `is_rcm`, `enable_round_off`, `original_invoice_id`, `supplier_invoice_no`, `supplier_invoice_date`, `narration`, `lines: list[InvoiceLineCreate]`) | `201 InvoiceDetailRead` |
| `GET` | `/api/v1/invoices/{invoice_id}` | Path `invoice_id` | `InvoiceDetailRead` (includes `lines[]`, `hsn_summary[]`, `amount_in_words`, `voucher_number`, `seller_snapshot`, `party_snapshot`) |
| `POST` | `/api/v1/invoices/{invoice_id}/post` | Empty body (promotes `DRAFT` $\rightarrow$ `POSTED` atomically) | `200 InvoiceDetailRead` |
| `POST` | `/api/v1/invoices/{invoice_id}/cancel` | `InvoiceCancelRequest` (`reason: str = Field(min_length=3, max_length=255)`) | `200 InvoiceDetailRead` (or `409 Conflict` if purchase lot already consumed) |

---

## 6. Idempotent Seed Extension (`backend/app/seed/dummy_company.py`)

Extend `backend/app/seed/dummy_company.py` idempotently (lookup-or-create on every entity so re-running produces zero duplicates). Reuse the existing synthetic company (*Bharat Hardware & Exports Pvt. Ltd.*, FY 2026–27, state code `09`). Ensure the company's synthetic test GSTIN is set to `09AAACT0000A1ZD` (checksum-valid synthetic placeholder).

1. **System Ledgers (`is_system_ledger=True`):**
   - Under `Sales Accounts` (`INCOME`): `Sales Account`, `Sales Returns`
   - Under `Purchase Accounts` (`EXPENSE`): `Purchase Account`
   - Under `Direct Expenses` (`EXPENSE`, `affects_gross_profit=True`): `Cost of Goods Sold`
   - Under `Current Assets` (`ASSET`): `Stock-in-Hand`, `Input CGST`, `Input SGST`, `Input IGST`
   - Under `Duties & Taxes` (`LIABILITY`): `Output CGST`, `Output SGST`, `Output IGST`, `RCM Output Tax Payable`
   - Under `Indirect Expenses` (`EXPENSE`): `Round Off`
2. **Party Ledgers (Synthetic Test GSTINs — all verified Mod-36 valid):**
   - Intra-state UP Customer: `Apex Electricals Noida` (state `09`, `party_gstin="09AAACT0001A1ZC"`, `credit_days=30`)
   - Inter-state MH Customer: `Deccan Infra Projects Mumbai` (state `27`, `party_gstin="27AAACT0002B1ZB"`, `credit_days=45`)
   - Intra-state UP Vendor: `Sharda Metals & Cables` (state `09`, `party_gstin="09AAACT0003C1Z6"`, `credit_days=30`)
3. **GST Tax Slabs:** `GST-0` (`0/0/0`), `GST-5` (`2.5/2.5/5`), `GST-12` (`6/6/12`), `GST-18` (`9/9/18`), `GST-28` (`14/14/28`).
4. **HSN/SAC Codes:** `8544` (`HSN`, Insulated Wire & Cables, `NOS`, `GST-18`), `7318` (`HSN`, Screws & Bolts, `KGS`, `GST-18`), `8481` (`HSN`, Brass Taps & Valves, `NOS`, `GST-18`), `8205` (`HSN`, Hand Tools, `NOS`, `GST-12`), `998314` (`SAC`, Engineering & Installation Services, `NA`, `GST-18`).
5. **Units of Measure:** `Nos` (`NOS`, 0 dp), `kg` (`KGS`, 3 dp), `m` (`MTR`, 2 dp), `Box` (`BOX`, 0 dp), `Svc` (`NA`, 0 dp).
6. **Godowns (2):**
   - `MAIN-WH` — *Main Warehouse (Noida)*, state `09`, `is_default=True`
   - `SHOWROOM` — *Retail Counter (Hathras)*, state `09`, `is_default=False`
7. **Inventory Items (5 — covering FIFO, Weighted Average & Service):**
   - `CWC-25`: *Copper Wire Coil 2.5mm* (`GOODS`, `FIFO`, `Nos`, HSN `8544`, `GST-18`, Sell `1450.0000`, Buy `1000.0000`, Reorder `20.0000`)
   - `SSB-10`: *Stainless Steel Bolt M10* (`GOODS`, `FIFO`, `kg`, HSN `7318`, `GST-18`, Sell `320.0000`, Buy `210.0000`, Reorder `50.0000`)
   - `BRV-15`: *Brass Gate Valve 15mm* (`GOODS`, `WEIGHTED_AVG`, `Nos`, HSN `8481`, `GST-18`, Sell `650.0000`, Buy `420.0000`, Reorder `15.0000`)
   - `HMT-01`: *Industrial Claw Hammer* (`GOODS`, `WEIGHTED_AVG`, `Nos`, HSN `8205`, `GST-12`, Sell `480.0000`, Buy `300.0000`, Reorder `10.0000`)
   - `SRV-INST`: *Site Electrical Inspection Service* (`SERVICE`, `FIFO`, `Svc`, SAC `998314`, `GST-18`, Sell `5000.0000`, Buy `0.0000`, Reorder `0.0000`)
8. **Sample Posted Invoices (created via `InvoicingService` only if zero invoices exist for company):**
   - 2 Purchase Invoices from `Sharda Metals & Cables` on `2026-04-05` and `2026-04-12` establishing two distinct cost batches for `CWC-25` (FIFO) and `BRV-15` (Weighted Avg) plus stock for `SSB-10` and `HMT-01`.
   - 1 Intra-State Sales Invoice (`09 -> 09`) to `Apex Electricals Noida` (`CGST + SGST + FIFO COGS + Round Off`).
   - 1 Inter-State Sales Invoice (`09 -> 27`) to `Deccan Infra Projects Mumbai` (`IGST + Weighted Avg COGS + Service line`).

---

## 7. Frontend Views, Shortcuts & A4 Print Layout

Follow `DESIGN_SYSTEM.md` strictly (semantic CSS tokens only, zero raw hex, tabular numerals right-aligned, `--font-mono` for codes/GSTIN/HSN/invoice numbers, `lucide-react` icons paired with every status pill, React 19.3 without `forwardRef`, TanStack Table v9 `useTable` + static `tableFeatures({...})` + `<table.FlexRender />`).

### 7.1 Shared Frontend Modules
- `frontend/src/lib/gstMath.ts`: Pure `BigInt` (`* 10000n`) preview math mirroring Section 2.1 (gross, pre-tax discount `%` or flat `₹`, intra CGST+SGST vs inter IGST vs LUT zero-rated, nearest-rupee round-off `±₹0.50`, HSN summary grouping).
- `frontend/src/api/gstInventory.ts`: Typed TanStack Query v5 hooks (`useInvoices`, `useInvoiceDetail`, `useCreateInvoice`, `useCancelInvoice`, `useTaxSlabs`, `useHsnSacCodes`, `useStockSummary`, `useGodownStock`, `useItemLots`, `useItemStockLedger`, `useUnits`, `useGodowns`, `useInventoryItems`).
- `frontend/src/hooks/useKeymap.ts` & Sidebar Navigation:
  - Wire `F8` / `Alt+8` $\rightarrow$ navigate to `/invoices/new?type=SALES`.
  - Wire `F9` / `Alt+9` $\rightarrow$ navigate to `/invoices/new?type=PURCHASE`.
  - Add sidebar navigation links (with `<Kbd>` chips where appropriate): **Invoices** (`/invoices`), **New Sale** (`F8`), **New Purchase** (`F9`), and **Inventory** (`/inventory`).

### 7.2 `frontend/src/features/vouchers/InvoiceBuilderPage.tsx`
- Route: `/invoices/new` (reads `?type=SALES|PURCHASE|CREDIT_NOTE|DEBIT_NOTE` and optional `?originalId=...` for 1-click Credit/Debit Note creation).
- Form state: `react-hook-form` + `zod` v4 schema validating non-empty lines, positive decimal strings, `0 <= discount_pct <= 100`, and required godown for `GOODS` lines.
- **Header Panel:**
  - Segmented Invoice Type switcher (`Sales`, `Purchase`, `Credit Note`, `Debit Note`), Supply Type select (`REGULAR`, `EXPORT_LUT`, `EXPORT_WPAY`, `SEZ_LUT`, `SEZ_WPAY`), Party Ledger combobox (auto-fills GSTIN badge + Place of Supply state code + Due Date from `credit_days`), Invoice Date, Due Date, Place of Supply state select, Supplier Invoice No/Date (visible on `PURCHASE`), Original Invoice selector (visible on `CREDIT_NOTE`/`DEBIT_NOTE`), Reverse Charge (`is_rcm`) checkbox (visible on `PURCHASE`/`DEBIT_NOTE`), Nearest-Rupee Round Off toggle (default ON).
- **Line Items Grid (`useFieldArray`):**
  - Item combobox (auto-fills description, HSN/SAC, UQC, tax slab, unit price, default godown), Godown select (disabled/`N/A` for `SERVICE`), Qty, Rate, Discount (`%` / `₹`), Tax Slab select, read-only live-computed Taxable, CGST/SGST (or `N/A` on inter-state), IGST (or `N/A` on intra-state), Line Total, Delete row button.
  - Add Row button + keyboard `Enter` flow.
- **Sticky Summary Footer:**
  - Live `BigInt` breakdown: Subtotal, Total Discount, Taxable Value, CGST, SGST, IGST, Cess, Round Off (`+` / `−`), Grand Total (`--fs-h2`, tabular).
  - RCM info banner (`--status-warning-bg` + `AlertTriangle` icon) when `is_rcm` is checked explaining that vendor payable excludes self-assessed RCM tax.
  - Action buttons: `Save as Draft`, `Post Invoice (Ctrl+Enter)`, `Post & Print`.
  - Displays backend HTTP `422` (e.g., `INSUFFICIENT_STOCK` showing available vs requested qty) clearly in an inline `--status-danger` alert banner.

### 7.3 `frontend/src/features/vouchers/InvoiceListPage.tsx`
- Route: `/invoices`.
- Uses **TanStack Table v9** (`useTable` + static `tableFeatures({ columnFilteringFeature, rowSortingFeature })` + `<table.FlexRender />`).
- Filter bar: Invoice Type pills, Status filter (`ALL`, `POSTED`, `DRAFT`, `CANCELLED`), Date range, Search input.
- Columns: Date (`DD-MMM-YYYY`), Invoice No (`--font-mono`, copy-on-click), Type badge, Party Name & GSTIN, POS/Supply, Taxable (`₹`), Tax (`₹`), Grand Total (`₹`), Status pill (icon + label; `CANCELLED` amounts rendered with `line-through` in `--text-disabled` per `DESIGN_SYSTEM.md` §8.8), Row Actions (`Print A4`, `Post Draft`, `Credit/Debit Note`, `Cancel`).
- Cancel modal requires a reason (`>= 3` chars) and renders HTTP `409` (`LOT_ALREADY_CONSUMED`) cleanly without closing the modal.

### 7.4 `frontend/src/features/vouchers/TaxInvoicePrintView.tsx`
- Route: `/invoices/:id/print`.
- **Screen-Only Action Bar (`print:hidden`):** `Back to Invoices`, `Print / Save A4 PDF` (`window.print()`).
- **App Shell Integration:** Ensure Sidebar and TopBar in `AppShell` carry `print:hidden` so only the A4 sheet prints.
- **Print Stylesheet (`frontend/src/styles/index.css`):**
  - `@page { size: A4 portrait; margin: 12mm; }`
  - Inside `@media print`: force Light Mode CSS token values even when `[data-theme="dark"]` is active, set `body { background: #ffffff; }`, `thead { display: table-header-group; }`, `tr { break-inside: avoid; }`, `.print-keep-together { break-inside: avoid; }`.
- **A4 Tax Invoice Sections:**
  1. Document Title (`TAX INVOICE` / `CREDIT NOTE` / `DEBIT NOTE` / `PURCHASE VOUCHER`), copy label (`Original for Recipient`), `Reverse Charge: Yes / No`, `Supply Type` badge.
  2. Two-column Seller & Buyer details grid (Legal Name, Address, GSTIN in `--font-mono`, State Name & Code) + Invoice Metadata (Invoice No., Date, Due Date, Voucher No., Supplier Ref if Purchase).
  3. Line Items Table: `#`, Description & Batch/Expiry, HSN/SAC (`--font-mono`), Qty & UQC, Rate, Discount, Taxable Value, CGST (Rate/Amt) & SGST (Rate/Amt) OR IGST (Rate/Amt), Line Total.
  4. **HSN/SAC Tax Summary Table** (from API `hsn_summary[]`): HSN/SAC, Taxable Value, CGST Rate/Amt, SGST Rate/Amt, IGST Rate/Amt, Total Tax Amount.
  5. **Totals & Amount-in-Words Footer (`.print-keep-together`):** Left side displays `Amount Chargeable (in words)` using `invoice.amount_in_words` + Tax Declaration; Right side displays Taxable Total, CGST, SGST, IGST, Cess, Round Off, Grand Total (bold double-underlined rule), and Authorized Signatory box.

### 7.5 `frontend/src/features/inventory/InventoryPage.tsx`
- Route: `/inventory`.
- Four sub-tabs, all tabular views built with **TanStack Table v9** (`useTable` + static `tableFeatures` + `<table.FlexRender />`):
  1. **Stock Summary:** KPI strip (Total SKUs, Total Closing Valuation `₹`, Low Stock Alerts count) + table (SKU `--font-mono`, Item Name, Valuation `FIFO`/`WAC`, Qty On Hand + UOM, Avg Rate, Closing Value `₹`, Reorder Level, Status pill: `Low Stock` with `AlertTriangle` in `--status-warning` when `is_low_stock`, else `In Stock` with `CheckCircle2` in `--status-success`). Clicking a row opens Tab 4 filtered to that item.
  2. **Item Master:** Table of Goods & Services + `+ New Item` / `Edit` slide-over drawer (SKU, Name, Type, Valuation Method, Unit, HSN/SAC, Default Tax Slab, Standard Selling/Purchase Prices, Reorder Level, optional GL ledger overrides).
  3. **Godowns:** Godown cards + `+ New Godown` modal + Godown-wise Stock breakdown table (`Godown`, `SKU`, `Item`, `Qty`, `Closing Value`).
  4. **FIFO Lot & Stock Ledger Viewer:** Item & Godown selectors showing two panels:
     - **Active Lots (`InventoryLot`):** Batch Ref (`--font-mono`), Godown, Received Date, Expiry Date, Qty In, Qty Available, Unit Cost, Lot Value (`₹`) + toggle `Show Exhausted Lots`.
     - **Stock Movement Ledger (`StockMovement`):** Date, Invoice No., Reason, Direction (`IN`/`OUT`), Qty, Unit Cost, Total Cost, Running Qty, Running Avg Cost.

---

## 8. Async Pytest Specification (`backend/tests/test_gst_and_inventory.py`)

Write a comprehensive async pytest suite (using the existing isolated in-memory/temp-file SQLite async fixture pattern from `backend/tests/`). Every test MUST assert exact `Decimal` / string values to 4 decimal places.

| # | Test Name | Scenario & Exact Required Assertions |
| :--- | :--- | :--- |
| 1 | `test_gstin_mod36_validator` | Valid synthetic IDs (`09AAACT0000A1ZD`, `09AAACT0001A1ZC`, `27AAACT0002B1ZB`) return `is_valid=True` with extracted `state_code` & `pan`; tampered check digit (`09AAACT0001A1ZA`), invalid state `98`, bad length, and lowercase handling return expected results. |
| 2 | `test_intra_state_sales_cgst_sgst` | Purchase stock first, then post Sales Invoice (`origin=09`, `pos=09`, `GST-18`, qty `10`, price `1000.0000`). Assert `is_inter_state=False`, `cgst_total == "900.0000"`, `sgst_total == "900.0000"`, `igst_total == "0.0000"`, `grand_total == "11800.0000"`, linked `Voucher` is `POSTED` and balanced (`Dr == Cr`). |
| 3 | `test_inter_state_sales_igst` | Post Sales Invoice (`origin=09`, `pos=27`, `GST-18`, qty `5`, price `1000.0000`). Assert `is_inter_state=True`, `cgst_total == "0.0000"`, `sgst_total == "0.0000"`, `igst_total == "900.0000"`, `grand_total == "5900.0000"`. |
| 4 | `test_pre_tax_discount_and_round_off` | Post Sales Invoice with qty `3`, unit_price `333.3300` (`gross=999.9900`), `discount_pct="10.0000"` (`discount=100.0000`, `taxable=899.9900`), `GST-18` intra (`cgst=81.0000`, `sgst=81.0000`, `raw=1061.9900`), `enable_round_off=True`. Assert `round_off == "0.0100"`, `grand_total == "1062.0000"`, `abs(Decimal(round_off)) <= Decimal("0.5000")`, and `Round Off` ledger credited `"0.0100"`. Also test negative round-off (`-0.4000` $\rightarrow$ `Round Off` debited `"0.4000"`). |
| 5 | `test_purchase_rcm_double_entry_split` | Post Purchase Invoice (`is_rcm=True`, `origin=09`, `pos=09`, `SERVICE` item, taxable `10000.0000`, `GST-18`). Assert `tax_total == "1800.0000"`, `grand_total == "10000.0000"`. Inspect `Voucher.lines`: Vendor ledger credited `"10000.0000"` ONLY, `Purchase Account` debited `"10000.0000"`, `Input CGST` debited `"900.0000"`, `Input SGST` debited `"900.0000"`, `RCM Output Tax Payable` credited `"1800.0000"`, total `Dr == Cr == "11800.0000"`. |
| 6 | `test_export_lut_zero_rated` | Post Sales Invoice (`supply_type="EXPORT_LUT"`, `pos="96"`, `GST-18` slab on item, taxable `25000.0000`). Assert `cgst_total == sgst_total == igst_total == tax_total == "0.0000"`, `grand_total == "25000.0000"`, and zero Output GST lines on the posted voucher. |
| 7 | `test_fifo_multi_batch_costing` | Create `FIFO` item. Purchase #1 (`2026-05-01`): `10 @ 100.0000`. Purchase #2 (`2026-05-05`): `10 @ 120.0000`. Sell `15` (`2026-05-10`, selling price `200.0000`). Assert: `invoice.total_cogs == "1600.0000"`, `FifoLotAllocation` has 2 rows (`10 @ 100.0000 = 1000.0000` and `5 @ 120.0000 = 600.0000`), Lot 1 `qty_available == "0.0000"`, Lot 2 `qty_available == "5.0000"`, Stock Summary `closing_value == "600.0000"`, Voucher posts `Dr COGS 1600.0000` and `Cr Stock-in-Hand 1600.0000`. |
| 8 | `test_weighted_average_costing` | Create `WEIGHTED_AVG` item. Purchase #1 (`2026-05-01`): `10 @ 100.0000`. Purchase #2 (`2026-05-05`): `10 @ 120.0000` (assert movement `running_qty == "20.0000"`, `running_avg_cost == "110.0000"`). Sell `15` (`2026-05-10`). Assert: `invoice.total_cogs == "1650.0000"`, outward movement `running_qty == "5.0000"`, `running_avg_cost == "110.0000"`, Stock Summary `closing_value == "550.0000"`, Voucher posts `Dr COGS 1650.0000` and `Cr Stock-in-Hand 1650.0000`. |
| 9 | `test_insufficient_stock_returns_422` | With `5.0000` units in godown, POST Sales Invoice for `10.0000` units. Assert HTTP `422`, `error_code == "INSUFFICIENT_STOCK"`, and confirm zero partial `Invoice`, `Voucher`, or `StockMovement` rows were persisted. |
| 10 | `test_credit_note_and_debit_note_stock_adjustments` | (a) Post Credit Note returning `2` units against the FIFO Sale in Test 7 (where sale price was `200.0000`, original movement `unit_cost` was `1600/15 = 106.6667`): assert new return lot created at original COGS rate (not `200.0000`), `Dr Stock-in-Hand / Cr COGS` posted, `Sales Returns` & `Output GST` debited. (b) Post Debit Note returning `2` units against Purchase #2 (`120.0000`): assert Lot 2 `qty_available` decreases by `2.0000`, `Input GST` credited, `Stock-in-Hand` credited `"240.0000"`. |
| 11 | `test_cancel_sales_restores_lots_and_consumed_purchase_returns_409` | From FIFO setup (`Buy 10@100`, `Buy 10@120`, `Sell 15`): (a) Attempt `POST /api/v1/invoices/{purchase_1_id}/cancel` $\rightarrow$ assert HTTP **`409 Conflict`** (`error_code == "LOT_ALREADY_CONSUMED"`), purchase invoice remains `POSTED`. (b) Cancel the Sales Invoice (`POST /api/v1/invoices/{sale_id}/cancel`) $\rightarrow$ assert HTTP `200`, `invoice.status == "CANCELLED"`, `voucher.status == "CANCELLED"`, Lot 1 restored to `10.0000` and Lot 2 restored to `10.0000`, `FifoLotAllocation.is_reversed == True`. (c) Now retry cancelling Purchase #1 $\rightarrow$ assert HTTP `200`, Lot 1 `qty_available == "0.0000"`. |
| 12 | `test_indian_amount_in_words` | Assert exact outputs for `0.00`, `1000.00`, `123456.78`, `10000000.50`, and `1050000000.00`. |
| 13 | `test_full_trial_balance_and_balance_sheet_tie_out` | After running a full sequence of Purchases (normal + RCM), Intra/Inter Sales (FIFO + WAC + Service), Credit Note, Debit Note, and a Cancellation: fetch `/api/v1/reports/trial-balance`, `/api/v1/reports/balance-sheet`, and `/api/v1/inventory/stock-summary`. Assert: (1) Trial Balance `total_debit == total_credit` (difference `"0.0000"`), (2) Balance Sheet `total_assets == total_liabilities_and_equity` (difference `"0.0000"`), and (3) `Stock-in-Hand` ledger closing balance equals `StockSummaryResponse.grand_total_value`. |

---

## 9. Exact CLI Verification Commands & Exit Criteria

Run every command below from the repository root and confirm zero failures before marking Milestone 3 complete:

```bash
# 1. Run Alembic migration cleanly against SQLite WAL (and verify downgrade/upgrade round-trip)
cd backend
alembic upgrade head
alembic downgrade -1
alembic upgrade head

# 2. Verify idempotent dummy company seeding (run twice; second run must create 0 duplicates)
python -m app.seed.dummy_company
python -m app.seed.dummy_company

# 3. Run full backend pytest suite (Milestone 1 + 2 + 3 accounting & inventory invariants)
pytest -v tests/test_gst_and_inventory.py
pytest -v

# 4. Frontend type-check, semantic token audit (zero raw hex), and production bundle build
cd ../frontend
npx tsc --noEmit
npm run build
# Quick audit: confirm zero forwardRef, zero v8 useReactTable, zero raw hex in new feature files
grep -rn "forwardRef\|useReactTable" src/features/vouchers/ src/features/inventory/ || true
grep -rnE "#[0-9a-fA-F]{3,8}" src/features/vouchers/ src/features/inventory/ || true
```

---

## 10. Plain-English Architecture Summary (For `TASK_STATE.md` Handoff)

Upon completion of Milestone 3, LedgerPrime gains a complete **Domestic India GST Billing and Perpetual Inventory Engine** built directly on top of Milestone 2's atomic double-entry ledger:

- **How GST Billing Works:** Every Sales Invoice (`F8`), Purchase Invoice (`F9`), Credit Note, and Debit Note calculates pre-tax line discounts, determines Intra-State (`CGST + SGST`) versus Inter-State (`IGST`) or Zero-Rated Export (`LUT`) splits from the company's origin state and customer Place of Supply, validates 15-character GSTINs via the statutory Mod-36 checksum, and applies optional nearest-rupee Round Off (`±₹0.50`) as an explicit ledger line. Each posted invoice maps 1-to-1 to a balanced double-entry `Voucher`. Reverse Charge (`RCM`) purchases keep vendor payables strictly equal to taxable value plus round-off while self-assessing Input Tax (`Dr`) and RCM Output Liability (`Cr`) separately.
- **How Perpetual Inventory Works:** Physical goods flow through warehouse-partitioned cost layers (`inventory_lots`) and a running sub-ledger (`stock_movements`). `FIFO` items deplete oldest lots first (`received_date ASC, id ASC`) with auditable `fifo_lot_allocations` rows, while `WEIGHTED_AVG` items recalculate moving average unit cost on every receipt and issue COGS at the current average rate. Every stock sale automatically posts `Dr Cost of Goods Sold / Cr Stock-in-Hand` in the same database transaction as the revenue and GST entries, so the `Stock-in-Hand` general ledger account ties out to the exact paisa against the closing Stock Valuation Summary—computed safely in Python `Decimal` to prevent 64-bit integer overflow on SQLite.
- **Non-Destructive Controls & A4 Printing:** Invoices are never hard-deleted. Cancelling a Sale restores its exact FIFO lots and zeroes its ledger impact; attempting to cancel a Purchase whose lot was already consumed by a Sale is strictly blocked with HTTP `409 Conflict` to protect historical COGS integrity. Professional A4 Tax Invoices—complete with HSN/SAC tax summary tables and Indian Lakh/Crore amount-in-words—render directly in the browser via zero-RAM CSS `@media print` rules forcing Light Mode tokens.