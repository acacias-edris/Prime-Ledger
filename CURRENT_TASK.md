# CURRENT_TASK.md — Milestone 2: Basic Domestic Double-Entry FastAPI Backend & Live Financial Statements

> **Agent Execution Contract (Google Antigravity · Gemini 4 Hydrogen):**
> 1. Read `AGENTS.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, `DOCS_REFERENCE.md`, and `TASK_STATE.md` before writing code.
> 
> 
> 2. Implement ONLY Milestone 2 files listed in the manifest below. Do not modify unrelated Milestone 1 design tokens or invent raw hex colors.
> 
> 
> 3. Follow the **2-Strike Error Cap**: if any migration, `pytest`, `tsc`, or `npm run build` fails, make at most 2 targeted fixes; if still failing, stop and record the full traceback in `ERROR_LOG.md`.
> 
> 
> 4. Keep total RAM usage light for an 8 GB Linux Mint machine: run migration/tests first, stop test processes before launching `uvicorn` + `vite`, and never install Docker, Postgres, or pandas.
> 
> 
> 
> 

---

## 1. Milestone 2 Scope & Runtime Guardrails

* **Pinned Late-2026 Backend Stack (`backend/requirements.txt`):**
* `fastapi==0.165.0` + `pydantic==2.14.4` + `pydantic-settings==2.16.3` (zero `pydantic.v1` imports; `ConfigDict(from_attributes=True)`; exact 4-dp `Decimal` string serialization in JSON; clean `Query` defaults per FastAPI $\ge 0.148$).


* `SQLAlchemy==2.1.9` (`AsyncAttrs`, `DeclarativeBase`, `async_sessionmaker(..., expire_on_commit=False)`, `selectinload` on all relationships to eliminate `MissingGreenlet`) + `greenlet==3.5.6`.


* `aiosqlite==0.22.1` with `connect_args={"autocommit": False}` and `engine.sync_engine` `connect` listener setting `PRAGMA journal_mode=WAL;`, `PRAGMA synchronous=NORMAL;`, `PRAGMA busy_timeout=5000;`, `PRAGMA foreign_keys=ON;`.


* `alembic==1.20.1` async `env.py` with `render_as_batch=True`, explicit `NAMING_CONVENTION` on `Base.metadata`, and explicitly named `CheckConstraint(..., name="...")` on every table.




* **Zero-Float Accounting Invariant:**
* Dialect-aware `MoneyNumeric18_4(TypeDecorator[Decimal])`: stores 64-bit scaled `BigInteger` (`value * 10_000`) on SQLite and native `Numeric(18, 4)` on PostgreSQL.


* Rejects Python `float` at both Pydantic validation and SQLAlchemy bind boundaries; quantizes strictly with `ROUND_HALF_UP` to `Decimal("0.0001")`.




* **Four-Layer Double-Entry Enforcement:**
* Frontend Zod 4 + scaled `BigInt` (`* 10000n`) $\rightarrow$ FastAPI/Pydantic v2.14 validation $\rightarrow$ Service-level validator + SQLAlchemy `before_flush` listener (returns HTTP `422` with exact rupee difference) $\rightarrow$ Named SQLite/PostgreSQL `CHECK` constraints.


* Posted vouchers are **never hard-deleted**: `POST /api/v1/vouchers/{id}/cancel` either marks `status = 'CANCELLED'` (excluded from Trial Balance, preserved for audit numbering) or, when `create_reversal=true`, leaves the original `POSTED` and posts a linked mirror reversing `JOURNAL` voucher (`reversed_voucher_id`) so net balances zero out while preserving full audit continuity.



---

## 2. Complete Milestone 2 File Manifest

### Part 1 — Backend Core, Models, Migrations, Accounting Engine & API (Included Below)

1. `backend/.env.example`
2. `backend/pyproject.toml`
3. `backend/app/__init__.py`
4. `backend/app/core/__init__.py`
5. `backend/app/core/config.py`
6. `backend/app/core/money.py`
7. `backend/app/core/database.py`
8. `backend/app/models/__init__.py`
9. `backend/app/models/company.py`
10. `backend/app/models/ledger.py`
11. `backend/alembic.ini`
12. `backend/alembic/env.py`
13. `backend/alembic/script.py.mako`
14. `backend/alembic/versions/20261127_0001_initial_double_entry_schema.py`
15. `backend/app/modules/__init__.py`
16. `backend/app/modules/ledger/__init__.py`
17. `backend/app/modules/ledger/exceptions.py`
18. `backend/app/modules/ledger/schemas.py`
19. `backend/app/modules/ledger/service.py`
20. `backend/app/modules/ledger/router.py`
21. `backend/app/main.py`

### Part 2 — Seed Script, Async Pytest Suite, Live Frontend Wiring, Financial Views & Verification *(Reply `"Continue"` after Part 1)*

22. `backend/app/seed/__init__.py` & `backend/app/seed/dummy_company.py`
23. `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_double_entry.py`
24. `frontend/src/lib/api.ts` & `frontend/src/hooks/useAccounting.ts`
25. Updated live-wired `FinancialCommandPage.tsx`, `QuickVoucherDrawer.tsx`, `AppShell.tsx`, `CommandPalette.tsx`, `App.tsx`
26. New Financial Views: `ChartOfAccountsView.tsx` (with `+ New Ledger` drawer), `DayBookView.tsx`, `LedgerStatementView.tsx`, `TrialBalanceView.tsx`, `ProfitLossView.tsx`, `BalanceSheetView.tsx`
27. Exact Verification Commands, Browser Smoke-Test Steps & Plain-English Beginner Architecture Summary

---

## 3. Phase A — Backend Config, Dialect-Aware Money Type & Async DB

### File: `backend/.env.example`

```dotenv
# Copy to backend/.env for local overrides (never commit backend/.env)
DATABASE_URL=sqlite+aiosqlite:///./ledgerprime.db
FRONTEND_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
APP_ENV=development
SQL_ECHO=false

```

---

### File: `backend/pyproject.toml`

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
testpaths = ["tests"]
pythonpath = ["."]

```

---

### File: `backend/app/__init__.py`

```python
"""LedgerPrime FastAPI backend package."""

```

---

### File: `backend/app/core/__init__.py`

```python
"""Core configuration, exact fixed-point money types, and async database primitives."""

```

---

### File: `backend/app/core/config.py`

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "LedgerPrime API"
    app_version: str = "0.2.0"
    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./ledgerprime.db"
    frontend_origin: str = "http://localhost:5173,http://127.0.0.1:5173"
    sql_echo: bool = False

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.frontend_origin.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()

```

---

### File: `backend/app/core/money.py`

```python
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Annotated, Any

from pydantic import BeforeValidator, PlainSerializer
from sqlalchemy import BigInteger, Numeric, TypeDecorator
from sqlalchemy.engine import Dialect

MONEY_SCALE = Decimal("10000")
MONEY_QUANT = Decimal("0.0001")
ZERO = Decimal("0.0000")
MAX_ABS_MONEY = Decimal("99999999999999.9999")  # NUMERIC(18, 4) ceiling


def quantize_money(value: Decimal | str | int) -> Decimal:
    """
    Converts str | int | Decimal into exact NUMERIC(18, 4) using ROUND_HALF_UP.
    Strictly forbids Python float to eliminate IEEE-754 drift.
    """
    if isinstance(value, float):
        raise TypeError(
            "Python float is strictly forbidden for monetary amounts; pass Decimal, int, or str."
        )
    if isinstance(value, bool):
        raise TypeError("Boolean value is not valid for monetary amounts.")
    try:
        dec = value if isinstance(value, Decimal) else Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Invalid monetary value: {value!r}") from exc

    if not dec.is_finite():
        raise ValueError(f"Monetary value must be finite: {value!r}")

    quantized = dec.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    if abs(quantized) > MAX_ABS_MONEY:
        raise ValueError(f"Monetary value exceeds NUMERIC(18, 4) bounds: {quantized}")
    return quantized


def format_money_str(value: Decimal) -> str:
    """Formats a Decimal strictly as a fixed 4-decimal string (e.g. '14500.2500')."""
    return f"{quantize_money(value):.4f}"


def _validate_money_input(value: Any) -> Decimal:
    if value is None or value == "":
        return ZERO
    if isinstance(value, float):
        raise ValueError(
            "Floating-point numbers are not allowed for money; provide an exact decimal string."
        )
    if isinstance(value, bool):
        raise ValueError("Boolean values are not valid monetary amounts.")
    try:
        return quantize_money(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(str(exc)) from exc


# Pydantic v2.14 annotated types: exact Decimal internally, exact "0.0000" string in JSON
MoneyInput = Annotated[Decimal, BeforeValidator(_validate_money_input)]
MoneyStr = Annotated[
    Decimal,
    PlainSerializer(format_money_str, return_type=str, when_used="json"),
]


class MoneyNumeric18_4(TypeDecorator[Decimal]):
    """
    Dialect-aware exact NUMERIC(18, 4) storage type:
    - SQLite: 64-bit signed BigInteger scaled by 10_000 (eliminates IEEE-754 float drift
      while keeping native SQL SUM(), <, >, and ORDER BY exact).
    - PostgreSQL (Neon cloud): native NUMERIC(18, 4).
    """

    impl = Numeric(18, 4)
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect):
        if dialect.name == "sqlite":
            return dialect.type_descriptor(BigInteger())
        return dialect.type_descriptor(Numeric(18, 4))

    def process_bind_param(
        self, value: Decimal | str | int | None, dialect: Dialect
    ) -> int | Decimal | None:
        if value is None:
            return None
        dec = quantize_money(value)
        if dialect.name == "sqlite":
            return int(dec * MONEY_SCALE)
        return dec

    def process_result_value(
        self, value: int | Decimal | str | None, dialect: Dialect
    ) -> Decimal | None:
        if value is None:
            return None
        if dialect.name == "sqlite":
            return (Decimal(int(value)) / MONEY_SCALE).quantize(
                MONEY_QUANT, rounding=ROUND_HALF_UP
            )
        return Decimal(str(value)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

```

---

### File: `backend/app/core/database.py`

```python
from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import MetaData, event
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

# Explicit naming convention required for Alembic 1.20+ SQLite render_as_batch=True
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(AsyncAttrs, DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def build_async_engine(database_url: str, *, echo: bool = False) -> AsyncEngine:
    is_sqlite = database_url.startswith("sqlite")
    kwargs: dict[str, Any] = {"echo": echo}

    if is_sqlite:
        # Disable Python sqlite3 legacy implicit transactions per SQLAlchemy 2.1 docs
        kwargs["connect_args"] = {"autocommit": False}
    else:
        kwargs["pool_size"] = 5
        kwargs["max_overflow"] = 10
        kwargs["pool_pre_ping"] = True

    async_engine = create_async_engine(database_url, **kwargs)

    if is_sqlite:
        @event.listens_for(async_engine.sync_engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _connection_record) -> None:
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA busy_timeout=5000;")
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

    return async_engine


settings = get_settings()
engine = build_async_engine(settings.database_url, echo=settings.sql_echo)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session

```

---

## 4. Phase B — ORM Models & Alembic 1.20.1 Async Migration

### File: `backend/app/models/__init__.py`

```python
from app.models.company import Company, FiscalYear
from app.models.ledger import (
    AccountGroup,
    AccountNature,
    DrCr,
    Ledger,
    Voucher,
    VoucherLine,
    VoucherStatus,
    VoucherType,
)

__all__ = [
    "Company",
    "FiscalYear",
    "AccountGroup",
    "AccountNature",
    "DrCr",
    "Ledger",
    "Voucher",
    "VoucherLine",
    "VoucherStatus",
    "VoucherType",
]

```

---

### File: `backend/app/models/company.py`

```python
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.ledger import AccountGroup, Ledger, Voucher


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint(
            "number_format IN ('INDIAN_LAKH', 'INTERNATIONAL')",
            name="valid_number_format",
        ),
        CheckConstraint(
            "fy_start_month >= 1 AND fy_start_month <= 12",
            name="valid_fy_start_month",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(160), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, default="IN")
    state_code: Mapped[str] = mapped_column(String(8), nullable=False, default="09")
    gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    number_format: Mapped[str] = mapped_column(
        String(24), nullable=False, default="INDIAN_LAKH"
    )
    fy_start_month: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now
    )

    fiscal_years: Mapped[list["FiscalYear"]] = relationship(
        back_populates="company",
        lazy="selectin",
    )
    account_groups: Mapped[list["AccountGroup"]] = relationship(
        back_populates="company",
        lazy="selectin",
    )
    ledgers: Mapped[list["Ledger"]] = relationship(
        back_populates="company",
        lazy="selectin",
    )
    vouchers: Mapped[list["Voucher"]] = relationship(
        back_populates="company",
        lazy="selectin",
    )


class FiscalYear(Base):
    __tablename__ = "fiscal_years"
    __table_args__ = (
        UniqueConstraint("company_id", "label", name="uq_fiscal_years_company_label"),
        CheckConstraint("end_date > start_date", name="valid_fy_date_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    company: Mapped["Company"] = relationship(
        back_populates="fiscal_years",
        lazy="selectin",
    )
    vouchers: Mapped[list["Voucher"]] = relationship(
        back_populates="fiscal_year",
        lazy="selectin",
    )

```

---

### File: `backend/app/models/ledger.py`

```python
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    event,
    inspect as sa_inspect,
)
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship
from sqlalchemy.orm.base import NO_VALUE

from app.core.database import Base
from app.core.money import ZERO, MoneyNumeric18_4, quantize_money
from app.modules.ledger.exceptions import InvalidVoucherError, UnbalancedVoucherError

if TYPE_CHECKING:
    from app.models.company import Company, FiscalYear


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AccountNature(StrEnum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    EQUITY = "EQUITY"
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"


class DrCr(StrEnum):
    DR = "DR"
    CR = "CR"


class VoucherType(StrEnum):
    CONTRA = "CONTRA"
    PAYMENT = "PAYMENT"
    RECEIPT = "RECEIPT"
    JOURNAL = "JOURNAL"
    SALES = "SALES"
    PURCHASE = "PURCHASE"
    CREDIT_NOTE = "CREDIT_NOTE"
    DEBIT_NOTE = "DEBIT_NOTE"


class VoucherStatus(StrEnum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    CANCELLED = "CANCELLED"


class AccountGroup(Base):
    __tablename__ = "account_groups"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_account_groups_company_code"),
        UniqueConstraint("company_id", "name", name="uq_account_groups_company_name"),
        CheckConstraint(
            "nature IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')",
            name="valid_account_nature",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("account_groups.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    nature: Mapped[str] = mapped_column(String(16), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    affects_gross_profit: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)

    company: Mapped["Company"] = relationship(
        back_populates="account_groups",
        lazy="selectin",
    )
    parent: Mapped["AccountGroup | None"] = relationship(
        remote_side=[id],
        lazy="selectin",
    )
    ledgers: Mapped[list["Ledger"]] = relationship(
        back_populates="group",
        lazy="selectin",
    )


class Ledger(Base):
    __tablename__ = "ledgers"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_ledgers_company_code"),
        UniqueConstraint("company_id", "name", name="uq_ledgers_company_name"),
        CheckConstraint("opening_balance >= 0", name="non_negative_opening_balance"),
        CheckConstraint("opening_dr_cr IN ('DR', 'CR')", name="valid_opening_dr_cr"),
        CheckConstraint("credit_days >= 0", name="non_negative_credit_days"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("account_groups.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    opening_balance: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    opening_dr_cr: Mapped[str] = mapped_column(String(2), nullable=False, default="DR")
    party_gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    party_state_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    credit_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_system_ledger: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    company: Mapped["Company"] = relationship(
        back_populates="ledgers",
        lazy="selectin",
    )
    group: Mapped["AccountGroup"] = relationship(
        back_populates="ledgers",
        lazy="selectin",
    )
    voucher_lines: Mapped[list["VoucherLine"]] = relationship(
        back_populates="ledger",
        lazy="raise_on_sql",
    )


class Voucher(Base):
    __tablename__ = "vouchers"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "fiscal_year_id",
            "voucher_number",
            name="uq_vouchers_company_fy_number",
        ),
        CheckConstraint(
            "voucher_type IN ('CONTRA', 'PAYMENT', 'RECEIPT', 'JOURNAL', "
            "'SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE')",
            name="valid_voucher_type",
        ),
        CheckConstraint(
            "status IN ('DRAFT', 'POSTED', 'CANCELLED')",
            name="valid_voucher_status",
        ),
        Index(
            "ix_vouchers_company_date_status",
            "company_id",
            "voucher_date",
            "status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    voucher_number: Mapped[str] = mapped_column(String(40), nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(24), nullable=False)
    voucher_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reference_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    narration: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=VoucherStatus.POSTED.value
    )
    reversed_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now
    )

    company: Mapped["Company"] = relationship(
        back_populates="vouchers",
        lazy="selectin",
    )
    fiscal_year: Mapped["FiscalYear"] = relationship(
        back_populates="vouchers",
        lazy="selectin",
    )
    reversed_voucher: Mapped["Voucher | None"] = relationship(
        remote_side=[id],
        lazy="selectin",
    )
    lines: Mapped[list["VoucherLine"]] = relationship(
        back_populates="voucher",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="VoucherLine.id",
    )


class VoucherLine(Base):
    __tablename__ = "voucher_lines"
    __table_args__ = (
        CheckConstraint(
            "debit_amount >= 0 AND credit_amount >= 0",
            name="non_negative_line_amounts",
        ),
        CheckConstraint(
            "(debit_amount > 0 AND credit_amount = 0) OR "
            "(credit_amount > 0 AND debit_amount = 0)",
            name="mutually_exclusive_dr_cr",
        ),
        Index("ix_voucher_lines_ledger_voucher", "ledger_id", "voucher_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    voucher_id: Mapped[int] = mapped_column(
        ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ledger_id: Mapped[int] = mapped_column(
        ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    debit_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    credit_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    line_narration: Mapped[str | None] = mapped_column(String(255), nullable=True)

    voucher: Mapped["Voucher"] = relationship(
        back_populates="lines",
        lazy="selectin",
    )
    ledger: Mapped["Ledger"] = relationship(
        back_populates="voucher_lines",
        lazy="selectin",
    )


@event.listens_for(Session, "before_flush")
def _enforce_double_entry_before_flush(
    session: Session, _flush_context, _instances
) -> None:
    """
    Synchronous ORM safety net (Layer 3 invariant gate).
    Strictly blocks flushing any POSTED voucher with:
      - fewer than 2 active lines
      - any line not strictly single-sided (debit > 0 XOR credit > 0)
      - total_debit <= 0 OR SUM(debit_amount) != SUM(credit_amount)
    Never triggers lazy SQL inside async sessions.
    """
    candidate_vouchers: set[Voucher] = set()

    for obj in session.new.union(session.dirty).union(session.deleted):
        if isinstance(obj, Voucher):
            candidate_vouchers.add(obj)
        elif isinstance(obj, VoucherLine):
            line_state = sa_inspect(obj)
            loaded_voucher = line_state.attrs.voucher.loaded_value
            if loaded_voucher is not NO_VALUE and loaded_voucher is not None:
                candidate_vouchers.add(loaded_voucher)

    for voucher in candidate_vouchers:
        if voucher in session.deleted:
            continue
        if voucher.status != VoucherStatus.POSTED.value:
            continue

        voucher_state = sa_inspect(voucher)
        loaded_lines = voucher_state.attrs.lines.loaded_value
        if loaded_lines is NO_VALUE:
            if voucher in session.new:
                raise InvalidVoucherError(
                    f"Posted voucher {voucher.voucher_number} must contain at least 2 lines."
                )
            # Existing posted voucher whose lines were not loaded or mutated (e.g. narration edit)
            continue

        active_lines = [ln for ln in loaded_lines if ln not in session.deleted]
        if len(active_lines) < 2:
            raise InvalidVoucherError(
                f"Posted voucher {voucher.voucher_number} requires at least 2 ledger lines "
                f"(received {len(active_lines)})."
            )

        total_dr = ZERO
        total_cr = ZERO
        for idx, line in enumerate(active_lines, start=1):
            dr = quantize_money(line.debit_amount)
            cr = quantize_money(line.credit_amount)
            if (dr > ZERO and cr > ZERO) or (dr == ZERO and cr == ZERO):
                raise InvalidVoucherError(
                    f"Voucher {voucher.voucher_number} line #{idx} must have strictly "
                    "either debit_amount > 0 OR credit_amount > 0 (mutually exclusive)."
                )
            total_dr += dr
            total_cr += cr

        if total_dr <= ZERO:
            raise InvalidVoucherError(
                f"Posted voucher {voucher.voucher_number} total must be greater than 0.0000."
            )

        if total_dr != total_cr:
            raise UnbalancedVoucherError(
                total_debit=total_dr,
                total_credit=total_cr,
                voucher_number=voucher.voucher_number,
            )

```

---

### File: `backend/alembic.ini`

```ini
[alembic]
script_location = alembic
prepend_sys_path = .
version_path_separator = os

[post_write_hooks]

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S

```

---

### File: `backend/alembic/env.py`

```python
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.core.database import Base
import app.models  # noqa: F401 - register all SQLAlchemy models on Base.metadata

config = context.config
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    db_url = config.get_main_option("sqlalchemy.url") or settings.database_url
    engine_kwargs = {"poolclass": pool.NullPool}
    if db_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"autocommit": False}

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        **engine_kwargs,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

```

---

### File: `backend/alembic/script.py.mako`

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: Union[str, Sequence[str], None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}

```

---

### File: `backend/alembic/versions/20261127_0001_initial_double_entry_schema.py`

```python
"""initial double entry schema

Revision ID: 20261127_0001
Revises:
Create Date: 2026-11-27 00:01:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.core.money import MoneyNumeric18_4

revision: str = "20261127_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("legal_name", sa.String(length=160), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("state_code", sa.String(length=8), nullable=False),
        sa.Column("gstin", sa.String(length=32), nullable=True),
        sa.Column("base_currency", sa.String(length=3), nullable=False),
        sa.Column("number_format", sa.String(length=24), nullable=False),
        sa.Column("fy_start_month", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "number_format IN ('INDIAN_LAKH', 'INTERNATIONAL')",
            name=op.f("ck_companies_valid_number_format"),
        ),
        sa.CheckConstraint(
            "fy_start_month >= 1 AND fy_start_month <= 12",
            name=op.f("ck_companies_valid_fy_start_month"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_companies")),
    )

    op.create_table(
        "fiscal_years",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=32), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("is_locked", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "end_date > start_date",
            name=op.f("ck_fiscal_years_valid_fy_date_range"),
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_fiscal_years_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fiscal_years")),
        sa.UniqueConstraint("company_id", "label", name="uq_fiscal_years_company_label"),
    )
    op.create_index(
        op.f("ix_fiscal_years_company_id"), "fiscal_years", ["company_id"], unique=False
    )

    op.create_table(
        "account_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("nature", sa.String(length=16), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("affects_gross_profit", sa.Boolean(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "nature IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')",
            name=op.f("ck_account_groups_valid_account_nature"),
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_account_groups_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["account_groups.id"],
            name=op.f("fk_account_groups_parent_id_account_groups"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_account_groups")),
        sa.UniqueConstraint("company_id", "code", name="uq_account_groups_company_code"),
        sa.UniqueConstraint("company_id", "name", name="uq_account_groups_company_name"),
    )
    op.create_index(
        op.f("ix_account_groups_company_id"),
        "account_groups",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_account_groups_parent_id"),
        "account_groups",
        ["parent_id"],
        unique=False,
    )

    op.create_table(
        "ledgers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("opening_balance", MoneyNumeric18_4(), nullable=False),
        sa.Column("opening_dr_cr", sa.String(length=2), nullable=False),
        sa.Column("party_gstin", sa.String(length=32), nullable=True),
        sa.Column("party_state_code", sa.String(length=8), nullable=True),
        sa.Column("credit_days", sa.Integer(), nullable=False),
        sa.Column("is_system_ledger", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "opening_balance >= 0",
            name=op.f("ck_ledgers_non_negative_opening_balance"),
        ),
        sa.CheckConstraint(
            "opening_dr_cr IN ('DR', 'CR')",
            name=op.f("ck_ledgers_valid_opening_dr_cr"),
        ),
        sa.CheckConstraint(
            "credit_days >= 0",
            name=op.f("ck_ledgers_non_negative_credit_days"),
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_ledgers_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["account_groups.id"],
            name=op.f("fk_ledgers_group_id_account_groups"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ledgers")),
        sa.UniqueConstraint("company_id", "code", name="uq_ledgers_company_code"),
        sa.UniqueConstraint("company_id", "name", name="uq_ledgers_company_name"),
    )
    op.create_index(
        op.f("ix_ledgers_company_id"), "ledgers", ["company_id"], unique=False
    )
    op.create_index(op.f("ix_ledgers_group_id"), "ledgers", ["group_id"], unique=False)

    op.create_table(
        "vouchers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("fiscal_year_id", sa.Integer(), nullable=False),
        sa.Column("voucher_number", sa.String(length=40), nullable=False),
        sa.Column("voucher_type", sa.String(length=24), nullable=False),
        sa.Column("voucher_date", sa.Date(), nullable=False),
        sa.Column("reference_no", sa.String(length=64), nullable=True),
        sa.Column("narration", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reversed_voucher_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "voucher_type IN ('CONTRA', 'PAYMENT', 'RECEIPT', 'JOURNAL', "
            "'SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE')",
            name=op.f("ck_vouchers_valid_voucher_type"),
        ),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'POSTED', 'CANCELLED')",
            name=op.f("ck_vouchers_valid_voucher_status"),
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_vouchers_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["fiscal_year_id"],
            ["fiscal_years.id"],
            name=op.f("fk_vouchers_fiscal_year_id_fiscal_years"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reversed_voucher_id"],
            ["vouchers.id"],
            name=op.f("fk_vouchers_reversed_voucher_id_vouchers"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vouchers")),
        sa.UniqueConstraint(
            "company_id",
            "fiscal_year_id",
            "voucher_number",
            name="uq_vouchers_company_fy_number",
        ),
    )
    op.create_index(
        op.f("ix_vouchers_company_id"), "vouchers", ["company_id"], unique=False
    )
    op.create_index(
        op.f("ix_vouchers_fiscal_year_id"), "vouchers", ["fiscal_year_id"], unique=False
    )
    op.create_index(
        op.f("ix_vouchers_voucher_date"), "vouchers", ["voucher_date"], unique=False
    )
    op.create_index(
        op.f("ix_vouchers_reversed_voucher_id"),
        "vouchers",
        ["reversed_voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_vouchers_company_date_status",
        "vouchers",
        ["company_id", "voucher_date", "status"],
        unique=False,
    )

    op.create_table(
        "voucher_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("voucher_id", sa.Integer(), nullable=False),
        sa.Column("ledger_id", sa.Integer(), nullable=False),
        sa.Column("debit_amount", MoneyNumeric18_4(), nullable=False),
        sa.Column("credit_amount", MoneyNumeric18_4(), nullable=False),
        sa.Column("line_narration", sa.String(length=255), nullable=True),
        sa.CheckConstraint(
            "debit_amount >= 0 AND credit_amount >= 0",
            name=op.f("ck_voucher_lines_non_negative_line_amounts"),
        ),
        sa.CheckConstraint(
            "(debit_amount > 0 AND credit_amount = 0) OR "
            "(credit_amount > 0 AND debit_amount = 0)",
            name=op.f("ck_voucher_lines_mutually_exclusive_dr_cr"),
        ),
        sa.ForeignKeyConstraint(
            ["ledger_id"],
            ["ledgers.id"],
            name=op.f("fk_voucher_lines_ledger_id_ledgers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["voucher_id"],
            ["vouchers.id"],
            name=op.f("fk_voucher_lines_voucher_id_vouchers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_voucher_lines")),
    )
    op.create_index(
        op.f("ix_voucher_lines_voucher_id"),
        "voucher_lines",
        ["voucher_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_voucher_lines_ledger_id"),
        "voucher_lines",
        ["ledger_id"],
        unique=False,
    )
    op.create_index(
        "ix_voucher_lines_ledger_voucher",
        "voucher_lines",
        ["ledger_id", "voucher_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_voucher_lines_ledger_voucher", table_name="voucher_lines")
    op.drop_index(op.f("ix_voucher_lines_ledger_id"), table_name="voucher_lines")
    op.drop_index(op.f("ix_voucher_lines_voucher_id"), table_name="voucher_lines")
    op.drop_table("voucher_lines")

    op.drop_index("ix_vouchers_company_date_status", table_name="vouchers")
    op.drop_index(op.f("ix_vouchers_reversed_voucher_id"), table_name="vouchers")
    op.drop_index(op.f("ix_vouchers_voucher_date"), table_name="vouchers")
    op.drop_index(op.f("ix_vouchers_fiscal_year_id"), table_name="vouchers")
    op.drop_index(op.f("ix_vouchers_company_id"), table_name="vouchers")
    op.drop_table("vouchers")

    op.drop_index(op.f("ix_ledgers_group_id"), table_name="ledgers")
    op.drop_index(op.f("ix_ledgers_company_id"), table_name="ledgers")
    op.drop_table("ledgers")

    op.drop_index(op.f("ix_account_groups_parent_id"), table_name="account_groups")
    op.drop_index(op.f("ix_account_groups_company_id"), table_name="account_groups")
    op.drop_table("account_groups")

    op.drop_index(op.f("ix_fiscal_years_company_id"), table_name="fiscal_years")
    op.drop_table("fiscal_years")

    op.drop_table("companies")

```

---

## 5. Phase C — Core Accounting Module (Exceptions, Schemas, Service, Router) & FastAPI App

### File: `backend/app/modules/__init__.py`

```python
"""Modular monolith domain modules."""

```

---

### File: `backend/app/modules/ledger/__init__.py`

```python
"""Jurisdiction-agnostic double-entry ledger engine and financial report module."""

```

---

### File: `backend/app/modules/ledger/exceptions.py`

```python
from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.core.money import format_money_str


class AccountingError(ValueError):
    """Base domain exception mapped cleanly to HTTP error responses."""

    status_code: int = 422
    error_code: str = "ACCOUNTING_ERROR"

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if error_code is not None:
            self.error_code = error_code
        self.details = details or {}


class UnbalancedVoucherError(AccountingError):
    status_code = 422
    error_code = "UNBALANCED_VOUCHER"

    def __init__(
        self,
        *,
        total_debit: Decimal,
        total_credit: Decimal,
        voucher_number: str | None = None,
    ) -> None:
        difference = abs(total_debit - total_credit)
        prefix = f"Voucher {voucher_number}: " if voucher_number else ""
        message = (
            f"{prefix}Debit and Credit must balance: difference "
            f"₹{format_money_str(difference)} "
            f"(Dr={format_money_str(total_debit)}, Cr={format_money_str(total_credit)})."
        )
        super().__init__(
            message,
            details={
                "total_debit": format_money_str(total_debit),
                "total_credit": format_money_str(total_credit),
                "difference": format_money_str(difference),
            },
        )


class InvalidVoucherError(AccountingError):
    status_code = 422
    error_code = "INVALID_VOUCHER"


class FiscalYearLockedError(AccountingError):
    status_code = 422
    error_code = "FISCAL_YEAR_LOCKED"


class ResourceNotFoundError(AccountingError):
    status_code = 404
    error_code = "NOT_FOUND"


class DuplicateResourceError(AccountingError):
    status_code = 409
    error_code = "DUPLICATE_RESOURCE"

```

---

### File: `backend/app/modules/ledger/schemas.py`

```python
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.money import ZERO, MoneyInput, MoneyStr
from app.models.ledger import AccountNature, DrCr, VoucherStatus, VoucherType


# ---------------------------------------------------------------------------
# Company & Fiscal Year Context
# ---------------------------------------------------------------------------


class FiscalYearRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    label: str
    start_date: date
    end_date: date
    is_locked: bool


class CompanyContextRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    legal_name: str
    country_code: str
    state_code: str
    gstin: str | None
    base_currency: str
    number_format: str
    fy_start_month: int
    active_fiscal_year: FiscalYearRead


# ---------------------------------------------------------------------------
# Account Groups & Ledgers (Chart of Accounts)
# ---------------------------------------------------------------------------


class AccountGroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    code: str
    name: str
    parent_id: int | None
    nature: AccountNature
    is_primary: bool
    affects_gross_profit: bool
    display_order: int
    ledger_count: int = 0
    closing_balance: MoneyStr = ZERO
    closing_dr_cr: DrCr = DrCr.DR


class LedgerCreate(BaseModel):
    group_id: int
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=160)
    opening_balance: MoneyInput = ZERO
    opening_dr_cr: DrCr = DrCr.DR
    party_gstin: str | None = Field(default=None, max_length=32)
    party_state_code: str | None = Field(default=None, max_length=8)
    credit_days: int = Field(default=0, ge=0, le=3650)

    @model_validator(mode="after")
    def _validate_non_negative_opening(self) -> "LedgerCreate":
        if self.opening_balance < ZERO:
            raise ValueError("opening_balance cannot be negative.")
        return self


class LedgerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    group_id: int
    group_name: str
    group_nature: AccountNature
    code: str
    name: str
    opening_balance: MoneyStr
    opening_dr_cr: DrCr
    closing_balance: MoneyStr
    closing_dr_cr: DrCr
    party_gstin: str | None
    party_state_code: str | None
    credit_days: int
    is_system_ledger: bool
    is_active: bool


# ---------------------------------------------------------------------------
# Vouchers & Double-Entry Lines
# ---------------------------------------------------------------------------


class VoucherLineCreate(BaseModel):
    """Accepts either ledger_id OR account_code per DOCS_REFERENCE.md API mapping."""

    ledger_id: int | None = None
    account_code: str | None = Field(default=None, min_length=1, max_length=32)
    debit_amount: MoneyInput = ZERO
    credit_amount: MoneyInput = ZERO
    line_narration: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _validate_line(self) -> "VoucherLineCreate":
        if self.ledger_id is None and not (self.account_code and self.account_code.strip()):
            raise ValueError("Each line must specify either ledger_id or account_code.")
        if self.debit_amount < ZERO or self.credit_amount < ZERO:
            raise ValueError("debit_amount and credit_amount must be non-negative.")
        if not (
            (self.debit_amount > ZERO and self.credit_amount == ZERO)
            or (self.credit_amount > ZERO and self.debit_amount == ZERO)
        ):
            raise ValueError(
                "Each line must have strictly either debit_amount > 0 OR credit_amount > 0."
            )
        return self


class VoucherCreate(BaseModel):
    voucher_type: VoucherType
    voucher_date: date
    voucher_number: str | None = Field(default=None, max_length=40)
    reference_no: str | None = Field(default=None, max_length=64)
    narration: str = Field(default="", max_length=500)
    status: VoucherStatus = VoucherStatus.POSTED
    lines: list[VoucherLineCreate]

    @model_validator(mode="after")
    def _validate_voucher(self) -> "VoucherCreate":
        if self.status == VoucherStatus.CANCELLED:
            raise ValueError("Cannot create a new voucher directly in CANCELLED status.")
        if len(self.lines) < 2:
            raise ValueError("Double-entry vouchers require at least 2 ledger lines.")
        if self.status == VoucherStatus.POSTED:
            total_dr = sum((ln.debit_amount for ln in self.lines), ZERO)
            total_cr = sum((ln.credit_amount for ln in self.lines), ZERO)
            if total_dr <= ZERO:
                raise ValueError("Total voucher amount must be greater than 0.0000.")
            if total_dr != total_cr:
                diff = abs(total_dr - total_cr)
                raise ValueError(
                    f"Debit and Credit must balance: difference {diff:.4f} "
                    f"(Dr={total_dr:.4f}, Cr={total_cr:.4f})."
                )
        return self


class VoucherCancelRequest(BaseModel):
    create_reversal: bool = False
    reason: str | None = Field(default=None, max_length=255)


class VoucherLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ledger_id: int
    ledger_code: str
    ledger_name: str
    debit_amount: MoneyStr
    credit_amount: MoneyStr
    line_narration: str | None


class VoucherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    fiscal_year_id: int
    voucher_number: str
    voucher_type: VoucherType
    voucher_date: date
    reference_no: str | None
    narration: str
    status: VoucherStatus
    reversed_voucher_id: int | None
    particulars: str
    total_debit: MoneyStr
    total_credit: MoneyStr
    created_at: datetime
    updated_at: datetime
    lines: list[VoucherLineRead]


class VoucherCancelResponse(BaseModel):
    original_voucher: VoucherRead
    reversal_voucher: VoucherRead | None = None
    action: Literal["CANCELLED", "REVERSED"]


# ---------------------------------------------------------------------------
# Financial Reports
# ---------------------------------------------------------------------------


class DashboardKPIsRead(BaseModel):
    company_name: str
    fiscal_year_label: str
    cash_and_bank_balance: MoneyStr
    cash_and_bank_dr_cr: DrCr
    sundry_debtors: MoneyStr
    sundry_debtors_dr_cr: DrCr
    sundry_creditors: MoneyStr
    sundry_creditors_dr_cr: DrCr
    net_gst_position: MoneyStr
    net_gst_dr_cr: DrCr
    total_vouchers: int
    posted_vouchers: int
    draft_vouchers: int
    cancelled_vouchers: int
    trial_balance_balanced: bool


class DayBookReportRead(BaseModel):
    from_date: date | None
    to_date: date | None
    total_count: int
    posted_count: int
    excluded_count: int
    posted_total_debit: MoneyStr
    posted_total_credit: MoneyStr
    vouchers: list[VoucherRead]


class LedgerStatementRow(BaseModel):
    voucher_id: int
    voucher_date: date
    voucher_number: str
    voucher_type: VoucherType
    particulars: str
    reference_no: str | None
    narration: str
    debit_amount: MoneyStr
    credit_amount: MoneyStr
    running_balance: MoneyStr
    running_dr_cr: DrCr


class LedgerStatementRead(BaseModel):
    ledger_id: int
    ledger_code: str
    ledger_name: str
    group_name: str
    group_nature: AccountNature
    from_date: date
    to_date: date
    opening_balance: MoneyStr
    opening_dr_cr: DrCr
    period_debit: MoneyStr
    period_credit: MoneyStr
    closing_balance: MoneyStr
    closing_dr_cr: DrCr
    entries: list[LedgerStatementRow]


class TrialBalanceRow(BaseModel):
    ledger_id: int
    ledger_code: str
    ledger_name: str
    group_id: int
    group_name: str
    nature: AccountNature
    opening_debit: MoneyStr
    opening_credit: MoneyStr
    period_debit: MoneyStr
    period_credit: MoneyStr
    closing_debit: MoneyStr
    closing_credit: MoneyStr


class TrialBalanceGroupSummary(BaseModel):
    group_id: int
    group_name: str
    nature: AccountNature
    opening_debit: MoneyStr
    opening_credit: MoneyStr
    period_debit: MoneyStr
    period_credit: MoneyStr
    closing_debit: MoneyStr
    closing_credit: MoneyStr


class TrialBalanceReportRead(BaseModel):
    from_date: date
    to_date: date
    rows: list[TrialBalanceRow]
    groups: list[TrialBalanceGroupSummary]
    total_opening_debit: MoneyStr
    total_opening_credit: MoneyStr
    total_period_debit: MoneyStr
    total_period_credit: MoneyStr
    total_debit: MoneyStr
    total_credit: MoneyStr
    difference: MoneyStr
    is_balanced: bool


class StatementLineItem(BaseModel):
    ledger_id: int
    ledger_code: str
    ledger_name: str
    group_name: str
    amount: MoneyStr


class ProfitLossReportRead(BaseModel):
    from_date: date
    to_date: date
    direct_income: list[StatementLineItem]
    direct_expenses: list[StatementLineItem]
    total_direct_income: MoneyStr
    total_direct_expenses: MoneyStr
    gross_profit: MoneyStr
    indirect_income: list[StatementLineItem]
    indirect_expenses: list[StatementLineItem]
    total_indirect_income: MoneyStr
    total_indirect_expenses: MoneyStr
    net_profit: MoneyStr


class BalanceSheetSectionGroup(BaseModel):
    group_id: int
    group_name: str
    nature: AccountNature
    total: MoneyStr
    ledgers: list[StatementLineItem]


class BalanceSheetReportRead(BaseModel):
    as_of_date: date
    assets: list[BalanceSheetSectionGroup]
    liabilities: list[BalanceSheetSectionGroup]
    equity: list[BalanceSheetSectionGroup]
    current_period_net_profit: MoneyStr
    total_assets: MoneyStr
    total_liabilities: MoneyStr
    total_equity: MoneyStr
    total_liabilities_and_equity: MoneyStr
    difference: MoneyStr
    is_balanced: bool

```

---

### File: `backend/app/modules/ledger/service.py`

```python
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.money import ZERO, MoneyNumeric18_4, quantize_money
from app.models.company import Company, FiscalYear
from app.models.ledger import (
    AccountGroup,
    AccountNature,
    DrCr,
    Ledger,
    Voucher,
    VoucherLine,
    VoucherStatus,
    VoucherType,
)
from app.modules.ledger.exceptions import (
    DuplicateResourceError,
    FiscalYearLockedError,
    InvalidVoucherError,
    ResourceNotFoundError,
    UnbalancedVoucherError,
)
from app.modules.ledger.schemas import (
    AccountGroupRead,
    BalanceSheetReportRead,
    BalanceSheetSectionGroup,
    CompanyContextRead,
    DashboardKPIsRead,
    DayBookReportRead,
    FiscalYearRead,
    LedgerCreate,
    LedgerRead,
    LedgerStatementRead,
    LedgerStatementRow,
    ProfitLossReportRead,
    StatementLineItem,
    TrialBalanceGroupSummary,
    TrialBalanceReportRead,
    TrialBalanceRow,
    VoucherCancelRequest,
    VoucherCancelResponse,
    VoucherCreate,
    VoucherLineRead,
    VoucherRead,
)

VOUCHER_TYPE_PREFIX: dict[VoucherType, str] = {
    VoucherType.CONTRA: "CON",
    VoucherType.PAYMENT: "PAY",
    VoucherType.RECEIPT: "RCP",
    VoucherType.JOURNAL: "JRN",
    VoucherType.SALES: "SAL",
    VoucherType.PURCHASE: "PUR",
    VoucherType.CREDIT_NOTE: "CN",
    VoucherType.DEBIT_NOTE: "DN",
}


# ---------------------------------------------------------------------------
# Internal Helpers (Exact Decimal Sign Conventions)
# ---------------------------------------------------------------------------


def _opening_signed(ledger: Ledger) -> Decimal:
    """Debit-positive signed opening balance."""
    bal = quantize_money(ledger.opening_balance)
    return bal if ledger.opening_dr_cr == DrCr.DR.value else -bal


def _split_signed_balance(signed: Decimal) -> tuple[Decimal, DrCr]:
    """Converts Debit-positive signed balance into unsigned amount + DR/CR side."""
    q = quantize_money(signed)
    if q >= ZERO:
        return q, DrCr.DR
    return abs(q), DrCr.CR


def _to_dr_cr_columns(signed: Decimal) -> tuple[Decimal, Decimal]:
    """Converts Debit-positive signed balance into (debit_col, credit_col)."""
    q = quantize_money(signed)
    if q >= ZERO:
        return q, ZERO
    return ZERO, abs(q)


def _format_fy_code(fy: FiscalYear) -> str:
    return f"{fy.start_date.year % 100:02d}-{fy.end_date.year % 100:02d}"


def _serialize_voucher(voucher: Voucher) -> VoucherRead:
    lines_out: list[VoucherLineRead] = []
    total_dr = ZERO
    total_cr = ZERO
    for ln in voucher.lines:
        dr = quantize_money(ln.debit_amount)
        cr = quantize_money(ln.credit_amount)
        total_dr += dr
        total_cr += cr
        lines_out.append(
            VoucherLineRead(
                id=ln.id,
                ledger_id=ln.ledger_id,
                ledger_code=ln.ledger.code,
                ledger_name=ln.ledger.name,
                debit_amount=dr,
                credit_amount=cr,
                line_narration=ln.line_narration,
            )
        )

    particulars = lines_out[0].ledger_name if lines_out else "Journal Entry"
    if voucher.voucher_type in (VoucherType.PURCHASE.value, VoucherType.PAYMENT.value):
        cr_line = next((ln for ln in lines_out if ln.credit_amount > ZERO), None)
        if cr_line is not None and voucher.voucher_type == VoucherType.PURCHASE.value:
            particulars = cr_line.ledger_name
    elif voucher.voucher_type == VoucherType.RECEIPT.value:
        cr_line = next((ln for ln in lines_out if ln.credit_amount > ZERO), None)
        if cr_line is not None:
            particulars = cr_line.ledger_name

    return VoucherRead(
        id=voucher.id,
        company_id=voucher.company_id,
        fiscal_year_id=voucher.fiscal_year_id,
        voucher_number=voucher.voucher_number,
        voucher_type=VoucherType(voucher.voucher_type),
        voucher_date=voucher.voucher_date,
        reference_no=voucher.reference_no,
        narration=voucher.narration,
        status=VoucherStatus(voucher.status),
        reversed_voucher_id=voucher.reversed_voucher_id,
        particulars=particulars,
        total_debit=total_dr,
        total_credit=total_cr,
        created_at=voucher.created_at,
        updated_at=voucher.updated_at,
        lines=lines_out,
    )


async def get_active_company_and_fy(
    db: AsyncSession,
    company_id: int | None = None,
) -> tuple[Company, FiscalYear]:
    if company_id is not None:
        company = await db.get(Company, company_id)
    else:
        stmt = (
            select(Company)
            .where(Company.is_active.is_(True))
            .order_by(Company.id.asc())
            .limit(1)
        )
        company = (await db.execute(stmt)).scalar_one_or_none()

    if company is None:
        raise ResourceNotFoundError(
            "No active company found. Run `python -m app.seed.dummy_company` first."
        )

    fy_stmt = (
        select(FiscalYear)
        .where(FiscalYear.company_id == company.id)
        .order_by(FiscalYear.start_date.desc())
        .limit(1)
    )
    fy = (await db.execute(fy_stmt)).scalar_one_or_none()
    if fy is None:
        raise ResourceNotFoundError(
            f"No fiscal year configured for company '{company.name}'."
        )
    return company, fy


async def get_company_context(
    db: AsyncSession, company_id: int | None = None
) -> CompanyContextRead:
    company, fy = await get_active_company_and_fy(db, company_id)
    return CompanyContextRead(
        id=company.id,
        name=company.name,
        legal_name=company.legal_name,
        country_code=company.country_code,
        state_code=company.state_code,
        gstin=company.gstin,
        base_currency=company.base_currency,
        number_format=company.number_format,
        fy_start_month=company.fy_start_month,
        active_fiscal_year=FiscalYearRead.model_validate(fy),
    )


async def _fetch_posted_sums_by_ledger(
    db: AsyncSession,
    company_id: int,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    before_date: date | None = None,
) -> dict[int, tuple[Decimal, Decimal]]:
    """
    Aggregates exact SUM(debit_amount) and SUM(credit_amount) per ledger_id
    strictly over POSTED vouchers using dialect-aware MoneyNumeric18_4.
    """
    conditions = [
        Voucher.company_id == company_id,
        Voucher.status == VoucherStatus.POSTED.value,
    ]
    if before_date is not None:
        conditions.append(Voucher.voucher_date < before_date)
    if from_date is not None:
        conditions.append(Voucher.voucher_date >= from_date)
    if to_date is not None:
        conditions.append(Voucher.voucher_date <= to_date)

    stmt = (
        select(
            VoucherLine.ledger_id,
            func.coalesce(
                func.sum(VoucherLine.debit_amount), ZERO, type_=MoneyNumeric18_4()
            ),
            func.coalesce(
                func.sum(VoucherLine.credit_amount), ZERO, type_=MoneyNumeric18_4()
            ),
        )
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(*conditions)
        .group_by(VoucherLine.ledger_id)
    )
    rows = (await db.execute(stmt)).all()
    return {
        int(ledger_id): (quantize_money(dr), quantize_money(cr))
        for ledger_id, dr, cr in rows
    }


async def _generate_next_voucher_number(
    db: AsyncSession,
    company_id: int,
    fy: FiscalYear,
    voucher_type: VoucherType,
) -> str:
    prefix = f"{VOUCHER_TYPE_PREFIX[voucher_type]}/{_format_fy_code(fy)}/"
    stmt = select(Voucher.voucher_number).where(
        Voucher.company_id == company_id,
        Voucher.fiscal_year_id == fy.id,
        Voucher.voucher_type == voucher_type.value,
        Voucher.voucher_number.like(f"{prefix}%"),
    )
    existing_numbers = list((await db.execute(stmt)).scalars().all())
    max_seq = 0
    for vno in existing_numbers:
        suffix = vno[len(prefix) :]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:04d}"


# ---------------------------------------------------------------------------
# Chart of Accounts: Account Groups & Ledgers
# ---------------------------------------------------------------------------


async def list_account_groups(
    db: AsyncSession, company_id: int | None = None
) -> list[AccountGroupRead]:
    company, _fy = await get_active_company_and_fy(db, company_id)

    groups_stmt = (
        select(AccountGroup)
        .where(AccountGroup.company_id == company.id)
        .order_by(AccountGroup.display_order.asc(), AccountGroup.code.asc())
    )
    groups = list((await db.execute(groups_stmt)).scalars().all())

    ledgers_stmt = select(Ledger).where(
        Ledger.company_id == company.id, Ledger.is_active.is_(True)
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())
    posted_sums = await _fetch_posted_sums_by_ledger(db, company.id)

    direct_group_signed: dict[int, Decimal] = defaultdict(lambda: ZERO)
    direct_ledger_counts: dict[int, int] = defaultdict(int)
    for ledger in ledgers:
        dr, cr = posted_sums.get(ledger.id, (ZERO, ZERO))
        closing_signed = _opening_signed(ledger) + dr - cr
        direct_group_signed[ledger.group_id] += closing_signed
        direct_ledger_counts[ledger.group_id] += 1

    # Roll up child groups into parents recursively
    children_map: dict[int | None, list[int]] = defaultdict(list)
    for grp in groups:
        children_map[grp.parent_id].append(grp.id)

    memo_signed: dict[int, Decimal] = {}
    memo_counts: dict[int, int] = {}

    def _rollup(gid: int) -> tuple[Decimal, int]:
        if gid in memo_signed:
            return memo_signed[gid], memo_counts[gid]
        total_s = direct_group_signed[gid]
        total_c = direct_ledger_counts[gid]
        for child_id in children_map.get(gid, []):
            cs, cc = _rollup(child_id)
            total_s += cs
            total_c += cc
        memo_signed[gid] = total_s
        memo_counts[gid] = total_c
        return total_s, total_c

    output: list[AccountGroupRead] = []
    for grp in groups:
        signed_bal, count = _rollup(grp.id)
        abs_bal, side = _split_signed_balance(signed_bal)
        output.append(
            AccountGroupRead(
                id=grp.id,
                company_id=grp.company_id,
                code=grp.code,
                name=grp.name,
                parent_id=grp.parent_id,
                nature=AccountNature(grp.nature),
                is_primary=grp.is_primary,
                affects_gross_profit=grp.affects_gross_profit,
                display_order=grp.display_order,
                ledger_count=count,
                closing_balance=abs_bal,
                closing_dr_cr=side,
            )
        )
    return output


async def list_ledgers(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    group_id: int | None = None,
    nature: AccountNature | None = None,
    search: str | None = None,
) -> list[LedgerRead]:
    company, _fy = await get_active_company_and_fy(db, company_id)

    stmt = (
        select(Ledger)
        .join(AccountGroup, Ledger.group_id == AccountGroup.id)
        .options(selectinload(Ledger.group))
        .where(Ledger.company_id == company.id, Ledger.is_active.is_(True))
        .order_by(Ledger.code.asc())
    )
    if group_id is not None:
        stmt = stmt.where(Ledger.group_id == group_id)
    if nature is not None:
        stmt = stmt.where(AccountGroup.nature == nature.value)
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Ledger.name.ilike(q),
                Ledger.code.ilike(q),
                AccountGroup.name.ilike(q),
            )
        )

    ledgers = list((await db.execute(stmt)).scalars().all())
    posted_sums = await _fetch_posted_sums_by_ledger(db, company.id)

    result: list[LedgerRead] = []
    for ledger in ledgers:
        dr, cr = posted_sums.get(ledger.id, (ZERO, ZERO))
        closing_signed = _opening_signed(ledger) + dr - cr
        abs_bal, side = _split_signed_balance(closing_signed)
        result.append(
            LedgerRead(
                id=ledger.id,
                company_id=ledger.company_id,
                group_id=ledger.group_id,
                group_name=ledger.group.name,
                group_nature=AccountNature(ledger.group.nature),
                code=ledger.code,
                name=ledger.name,
                opening_balance=quantize_money(ledger.opening_balance),
                opening_dr_cr=DrCr(ledger.opening_dr_cr),
                closing_balance=abs_bal,
                closing_dr_cr=side,
                party_gstin=ledger.party_gstin,
                party_state_code=ledger.party_state_code,
                credit_days=ledger.credit_days,
                is_system_ledger=ledger.is_system_ledger,
                is_active=ledger.is_active,
            )
        )
    return result


async def create_ledger(
    db: AsyncSession,
    payload: LedgerCreate,
    company_id: int | None = None,
) -> LedgerRead:
    company, _fy = await get_active_company_and_fy(db, company_id)

    group = await db.get(AccountGroup, payload.group_id)
    if group is None or group.company_id != company.id:
        raise ResourceNotFoundError(
            f"AccountGroup id={payload.group_id} not found for company."
        )

    ledger = Ledger(
        company_id=company.id,
        group_id=group.id,
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        opening_balance=quantize_money(payload.opening_balance),
        opening_dr_cr=payload.opening_dr_cr.value,
        party_gstin=payload.party_gstin.strip().upper() if payload.party_gstin else None,
        party_state_code=payload.party_state_code.strip()
        if payload.party_state_code
        else None,
        credit_days=payload.credit_days,
        is_system_ledger=False,
        is_active=True,
    )
    db.add(ledger)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateResourceError(
            f"A ledger with code '{ledger.code}' or name '{ledger.name}' already exists."
        ) from exc

    await db.refresh(ledger, attribute_names=["group"])
    abs_bal, side = _split_signed_balance(_opening_signed(ledger))
    return LedgerRead(
        id=ledger.id,
        company_id=ledger.company_id,
        group_id=ledger.group_id,
        group_name=ledger.group.name,
        group_nature=AccountNature(ledger.group.nature),
        code=ledger.code,
        name=ledger.name,
        opening_balance=quantize_money(ledger.opening_balance),
        opening_dr_cr=DrCr(ledger.opening_dr_cr),
        closing_balance=abs_bal,
        closing_dr_cr=side,
        party_gstin=ledger.party_gstin,
        party_state_code=ledger.party_state_code,
        credit_days=ledger.credit_days,
        is_system_ledger=ledger.is_system_ledger,
        is_active=ledger.is_active,
    )


# ---------------------------------------------------------------------------
# Voucher Creation, Retrieval & Immutable Cancellation / Reversal
# ---------------------------------------------------------------------------


async def create_voucher(
    db: AsyncSession,
    payload: VoucherCreate,
    company_id: int | None = None,
) -> VoucherRead:
    company, fy = await get_active_company_and_fy(db, company_id)

    if fy.is_locked:
        raise FiscalYearLockedError(
            f"Fiscal year {fy.label} is locked; no new vouchers may be posted."
        )
    if not (fy.start_date <= payload.voucher_date <= fy.end_date):
        raise InvalidVoucherError(
            f"Voucher date {payload.voucher_date.isoformat()} falls outside active "
            f"fiscal year {fy.label} ({fy.start_date.isoformat()} to {fy.end_date.isoformat()})."
        )

    if len(payload.lines) < 2:
        raise InvalidVoucherError("A double-entry voucher requires at least 2 lines.")

    # Resolve all ledger_id / account_code references in a single query
    requested_ids = {ln.ledger_id for ln in payload.lines if ln.ledger_id is not None}
    requested_codes = {
        ln.account_code.strip().upper()
        for ln in payload.lines
        if ln.ledger_id is None and ln.account_code
    }

    filters = []
    if requested_ids:
        filters.append(Ledger.id.in_(requested_ids))
    if requested_codes:
        filters.append(Ledger.code.in_(requested_codes))

    ledgers_stmt = select(Ledger).where(
        Ledger.company_id == company.id,
        Ledger.is_active.is_(True),
        or_(*filters),
    )
    resolved_ledgers = list((await db.execute(ledgers_stmt)).scalars().all())
    by_id = {l.id: l for l in resolved_ledgers}
    by_code = {l.code.upper(): l for l in resolved_ledgers}

    total_dr = ZERO
    total_cr = ZERO
    orm_lines: list[VoucherLine] = []

    for idx, line_in in enumerate(payload.lines, start=1):
        ledger: Ledger | None = None
        if line_in.ledger_id is not None:
            ledger = by_id.get(line_in.ledger_id)
            if ledger is None:
                raise ResourceNotFoundError(
                    f"Line #{idx}: Ledger id={line_in.ledger_id} not found or inactive."
                )
        else:
            code_key = (line_in.account_code or "").strip().upper()
            ledger = by_code.get(code_key)
            if ledger is None:
                raise ResourceNotFoundError(
                    f"Line #{idx}: Ledger account_code='{code_key}' not found or inactive."
                )

        dr = quantize_money(line_in.debit_amount)
        cr = quantize_money(line_in.credit_amount)
        if not ((dr > ZERO and cr == ZERO) or (cr > ZERO and dr == ZERO)):
            raise InvalidVoucherError(
                f"Line #{idx} ({ledger.code}): must have strictly either debit > 0 OR credit > 0."
            )
        total_dr += dr
        total_cr += cr
        orm_lines.append(
            VoucherLine(
                ledger_id=ledger.id,
                debit_amount=dr,
                credit_amount=cr,
                line_narration=line_in.line_narration.strip()
                if line_in.line_narration
                else None,
            )
        )

    if payload.status == VoucherStatus.POSTED:
        if total_dr <= ZERO:
            raise InvalidVoucherError("Total voucher amount must exceed 0.0000.")
        if total_dr != total_cr:
            raise UnbalancedVoucherError(total_debit=total_dr, total_credit=total_cr)

    voucher_number = (
        payload.voucher_number.strip()
        if payload.voucher_number and payload.voucher_number.strip()
        else await _generate_next_voucher_number(
            db, company.id, fy, payload.voucher_type
        )
    )

    voucher = Voucher(
        company_id=company.id,
        fiscal_year_id=fy.id,
        voucher_number=voucher_number,
        voucher_type=payload.voucher_type.value,
        voucher_date=payload.voucher_date,
        reference_no=payload.reference_no.strip() if payload.reference_no else None,
        narration=payload.narration.strip(),
        status=payload.status.value,
        lines=orm_lines,
    )
    db.add(voucher)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateResourceError(
            f"Voucher number '{voucher_number}' already exists in {fy.label}."
        ) from exc

    return await get_voucher(db, voucher.id, company_id=company.id)


async def get_voucher(
    db: AsyncSession, voucher_id: int, company_id: int | None = None
) -> VoucherRead:
    company, _fy = await get_active_company_and_fy(db, company_id)
    stmt = (
        select(Voucher)
        .options(selectinload(Voucher.lines).selectinload(VoucherLine.ledger))
        .where(Voucher.id == voucher_id, Voucher.company_id == company.id)
    )
    voucher = (await db.execute(stmt)).scalar_one_or_none()
    if voucher is None:
        raise ResourceNotFoundError(f"Voucher id={voucher_id} not found.")
    return _serialize_voucher(voucher)


async def cancel_voucher(
    db: AsyncSession,
    voucher_id: int,
    payload: VoucherCancelRequest,
    company_id: int | None = None,
) -> VoucherCancelResponse:
    """
    Never hard-deletes posted vouchers:
    - create_reversal=False: transitions voucher status to CANCELLED (excluded from Trial Balance,
      retained in register for audit & numbering continuity).
    - create_reversal=True: keeps original POSTED and posts an atomic mirror reversing JOURNAL
      entry (swapping every debit_amount <-> credit_amount) with reversed_voucher_id set so
      the combined net effect across every ledger is exact 0.0000.
    """
    company, fy = await get_active_company_and_fy(db, company_id)
    if fy.is_locked:
        raise FiscalYearLockedError(f"Fiscal year {fy.label} is locked.")

    stmt = (
        select(Voucher)
        .options(selectinload(Voucher.lines).selectinload(VoucherLine.ledger))
        .where(Voucher.id == voucher_id, Voucher.company_id == company.id)
    )
    voucher = (await db.execute(stmt)).scalar_one_or_none()
    if voucher is None:
        raise ResourceNotFoundError(f"Voucher id={voucher_id} not found.")

    if voucher.status == VoucherStatus.CANCELLED.value:
        raise InvalidVoucherError(
            f"Voucher {voucher.voucher_number} is already CANCELLED."
        )

    existing_rev_stmt = select(Voucher.id).where(
        Voucher.company_id == company.id,
        Voucher.reversed_voucher_id == voucher.id,
        Voucher.status == VoucherStatus.POSTED.value,
    )
    if (await db.execute(existing_rev_stmt)).scalar_one_or_none() is not None:
        raise DuplicateResourceError(
            f"Voucher {voucher.voucher_number} has already been reversed."
        )

    reason_note = (
        f" | Reason: {payload.reason.strip()}"
        if payload.reason and payload.reason.strip()
        else ""
    )

    if not payload.create_reversal:
        voucher.status = VoucherStatus.CANCELLED.value
        if reason_note:
            voucher.narration = f"{voucher.narration}{reason_note}"[:500]
        await db.commit()
        updated = await get_voucher(db, voucher.id, company_id=company.id)
        return VoucherCancelResponse(
            original_voucher=updated,
            reversal_voucher=None,
            action="CANCELLED",
        )

    if voucher.status != VoucherStatus.POSTED.value:
        raise InvalidVoucherError(
            "Only POSTED vouchers can be reversed with a mirror journal entry."
        )

    rev_number = await _generate_next_voucher_number(
        db, company.id, fy, VoucherType.JOURNAL
    )
    mirror_lines = [
        VoucherLine(
            ledger_id=ln.ledger_id,
            debit_amount=quantize_money(ln.credit_amount),
            credit_amount=quantize_money(ln.debit_amount),
            line_narration=f"Reversal of {voucher.voucher_number}",
        )
        for ln in voucher.lines
    ]
    reversal = Voucher(
        company_id=company.id,
        fiscal_year_id=voucher.fiscal_year_id,
        voucher_number=rev_number,
        voucher_type=VoucherType.JOURNAL.value,
        voucher_date=voucher.voucher_date,
        reference_no=voucher.voucher_number,
        narration=f"Reversal of {voucher.voucher_number}{reason_note}"[:500],
        status=VoucherStatus.POSTED.value,
        reversed_voucher_id=voucher.id,
        lines=mirror_lines,
    )
    db.add(reversal)
    await db.commit()

    original_read = await get_voucher(db, voucher.id, company_id=company.id)
    reversal_read = await get_voucher(db, reversal.id, company_id=company.id)
    return VoucherCancelResponse(
        original_voucher=original_read,
        reversal_voucher=reversal_read,
        action="REVERSED",
    )


# ---------------------------------------------------------------------------
# Live Financial Reports (Dashboard KPIs, Day Book, Ledger, TB, P&L, BS)
# ---------------------------------------------------------------------------


async def get_day_book(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    voucher_type: VoucherType | None = None,
    status: VoucherStatus | None = None,
    search: str | None = None,
) -> DayBookReportRead:
    company, _fy = await get_active_company_and_fy(db, company_id)

    stmt = (
        select(Voucher)
        .options(selectinload(Voucher.lines).selectinload(VoucherLine.ledger))
        .where(Voucher.company_id == company.id)
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    )
    if from_date is not None:
        stmt = stmt.where(Voucher.voucher_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Voucher.voucher_date <= to_date)
    if voucher_type is not None:
        stmt = stmt.where(Voucher.voucher_type == voucher_type.value)
    if status is not None:
        stmt = stmt.where(Voucher.status == status.value)

    vouchers = list((await db.execute(stmt)).scalars().all())
    serialized = [_serialize_voucher(v) for v in vouchers]

    if search and search.strip():
        q = search.strip().lower()
        serialized = [
            v
            for v in serialized
            if q in v.voucher_number.lower()
            or q in v.narration.lower()
            or q in v.particulars.lower()
            or (v.reference_no and q in v.reference_no.lower())
            or any(
                q in ln.ledger_name.lower() or q in ln.ledger_code.lower()
                for ln in v.lines
            )
        ]

    posted_dr = ZERO
    posted_cr = ZERO
    posted_count = 0
    for v in serialized:
        if v.status == VoucherStatus.POSTED:
            posted_count += 1
            posted_dr += v.total_debit
            posted_cr += v.total_credit

    return DayBookReportRead(
        from_date=from_date,
        to_date=to_date,
        total_count=len(serialized),
        posted_count=posted_count,
        excluded_count=len(serialized) - posted_count,
        posted_total_debit=posted_dr,
        posted_total_credit=posted_cr,
        vouchers=serialized,
    )


async def get_ledger_statement(
    db: AsyncSession,
    ledger_id: int,
    *,
    company_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> LedgerStatementRead:
    company, fy = await get_active_company_and_fy(db, company_id)
    eff_from = from_date or fy.start_date
    eff_to = to_date or fy.end_date

    ledger_stmt = (
        select(Ledger)
        .options(selectinload(Ledger.group))
        .where(Ledger.id == ledger_id, Ledger.company_id == company.id)
    )
    ledger = (await db.execute(ledger_stmt)).scalar_one_or_none()
    if ledger is None:
        raise ResourceNotFoundError(f"Ledger id={ledger_id} not found.")

    # Pre-period posted lines roll into opening balance as of eff_from
    pre_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, before_date=eff_from
    )
    pre_dr, pre_cr = pre_sums.get(ledger.id, (ZERO, ZERO))
    opening_signed = _opening_signed(ledger) + pre_dr - pre_cr
    open_abs, open_side = _split_signed_balance(opening_signed)

    # Fetch chronological posted lines in [eff_from, eff_to] with sibling lines for particulars
    lines_stmt = (
        select(VoucherLine)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .options(
            selectinload(VoucherLine.voucher)
            .selectinload(Voucher.lines)
            .selectinload(VoucherLine.ledger)
        )
        .where(
            Voucher.company_id == company.id,
            Voucher.status == VoucherStatus.POSTED.value,
            VoucherLine.ledger_id == ledger.id,
            Voucher.voucher_date >= eff_from,
            Voucher.voucher_date <= eff_to,
        )
        .order_by(Voucher.voucher_date.asc(), Voucher.id.asc(), VoucherLine.id.asc())
    )
    period_lines = list((await db.execute(lines_stmt)).scalars().all())

    running_signed = opening_signed
    period_dr = ZERO
    period_cr = ZERO
    entries: list[LedgerStatementRow] = []

    for ln in period_lines:
        dr = quantize_money(ln.debit_amount)
        cr = quantize_money(ln.credit_amount)
        period_dr += dr
        period_cr += cr
        running_signed += dr - cr
        run_abs, run_side = _split_signed_balance(running_signed)

        # Counterparty ledger name for Tally-style Particulars column
        counterparts = [
            sib.ledger.name
            for sib in ln.voucher.lines
            if sib.ledger_id != ledger.id
            and (
                (dr > ZERO and quantize_money(sib.credit_amount) > ZERO)
                or (cr > ZERO and quantize_money(sib.debit_amount) > ZERO)
            )
        ]
        particulars = (
            counterparts[0]
            if len(counterparts) == 1
            else (
                f"{counterparts[0]} (+{len(counterparts) - 1} others)"
                if len(counterparts) > 1
                else ln.voucher.narration or "Journal Entry"
            )
        )

        entries.append(
            LedgerStatementRow(
                voucher_id=ln.voucher.id,
                voucher_date=ln.voucher.voucher_date,
                voucher_number=ln.voucher.voucher_number,
                voucher_type=VoucherType(ln.voucher.voucher_type),
                particulars=particulars,
                reference_no=ln.voucher.reference_no,
                narration=ln.line_narration or ln.voucher.narration,
                debit_amount=dr,
                credit_amount=cr,
                running_balance=run_abs,
                running_dr_cr=run_side,
            )
        )

    close_abs, close_side = _split_signed_balance(running_signed)
    return LedgerStatementRead(
        ledger_id=ledger.id,
        ledger_code=ledger.code,
        ledger_name=ledger.name,
        group_name=ledger.group.name,
        group_nature=AccountNature(ledger.group.nature),
        from_date=eff_from,
        to_date=eff_to,
        opening_balance=open_abs,
        opening_dr_cr=open_side,
        period_debit=period_dr,
        period_credit=period_cr,
        closing_balance=close_abs,
        closing_dr_cr=close_side,
        entries=entries,
    )


async def get_trial_balance(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    include_zero: bool = False,
) -> TrialBalanceReportRead:
    company, fy = await get_active_company_and_fy(db, company_id)
    eff_from = from_date or fy.start_date
    eff_to = to_date or fy.end_date

    ledgers_stmt = (
        select(Ledger)
        .join(AccountGroup, Ledger.group_id == AccountGroup.id)
        .options(selectinload(Ledger.group))
        .where(Ledger.company_id == company.id, Ledger.is_active.is_(True))
        .order_by(AccountGroup.display_order.asc(), Ledger.code.asc())
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())

    pre_sums = await _fetch_posted_sums_by_ledger(db, company.id, before_date=eff_from)
    period_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, from_date=eff_from, to_date=eff_to
    )

    rows: list[TrialBalanceRow] = []
    group_acc: dict[int, dict] = {}

    tot_open_dr = ZERO
    tot_open_cr = ZERO
    tot_period_dr = ZERO
    tot_period_cr = ZERO
    tot_close_dr = ZERO
    tot_close_cr = ZERO

    for ledger in ledgers:
        pre_dr, pre_cr = pre_sums.get(ledger.id, (ZERO, ZERO))
        p_dr, p_cr = period_sums.get(ledger.id, (ZERO, ZERO))

        open_signed = _opening_signed(ledger) + pre_dr - pre_cr
        close_signed = open_signed + p_dr - p_cr

        o_dr, o_cr = _to_dr_cr_columns(open_signed)
        c_dr, c_cr = _to_dr_cr_columns(close_signed)

        if not include_zero and (
            o_dr == ZERO
            and o_cr == ZERO
            and p_dr == ZERO
            and p_cr == ZERO
            and c_dr == ZERO
            and c_cr == ZERO
        ):
            continue

        tot_open_dr += o_dr
        tot_open_cr += o_cr
        tot_period_dr += p_dr
        tot_period_cr += p_cr
        tot_close_dr += c_dr
        tot_close_cr += c_cr

        rows.append(
            TrialBalanceRow(
                ledger_id=ledger.id,
                ledger_code=ledger.code,
                ledger_name=ledger.name,
                group_id=ledger.group_id,
                group_name=ledger.group.name,
                nature=AccountNature(ledger.group.nature),
                opening_debit=o_dr,
                opening_credit=o_cr,
                period_debit=p_dr,
                period_credit=p_cr,
                closing_debit=c_dr,
                closing_credit=c_cr,
            )
        )

        g_entry = group_acc.setdefault(
            ledger.group_id,
            {
                "group_id": ledger.group_id,
                "group_name": ledger.group.name,
                "nature": AccountNature(ledger.group.nature),
                "opening_debit": ZERO,
                "opening_credit": ZERO,
                "period_debit": ZERO,
                "period_credit": ZERO,
                "closing_debit": ZERO,
                "closing_credit": ZERO,
            },
        )
        g_entry["opening_debit"] += o_dr
        g_entry["opening_credit"] += o_cr
        g_entry["period_debit"] += p_dr
        g_entry["period_credit"] += p_cr
        g_entry["closing_debit"] += c_dr
        g_entry["closing_credit"] += c_cr

    groups = [TrialBalanceGroupSummary(**val) for val in group_acc.values()]
    difference = abs(tot_close_dr - tot_close_cr)

    return TrialBalanceReportRead(
        from_date=eff_from,
        to_date=eff_to,
        rows=rows,
        groups=groups,
        total_opening_debit=tot_open_dr,
        total_opening_credit=tot_open_cr,
        total_period_debit=tot_period_dr,
        total_period_credit=tot_period_cr,
        total_debit=tot_close_dr,
        total_credit=tot_close_cr,
        difference=difference,
        is_balanced=difference == ZERO,
    )


async def get_profit_loss(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> ProfitLossReportRead:
    company, fy = await get_active_company_and_fy(db, company_id)
    eff_from = from_date or fy.start_date
    eff_to = to_date or fy.end_date

    ledgers_stmt = (
        select(Ledger)
        .join(AccountGroup, Ledger.group_id == AccountGroup.id)
        .options(selectinload(Ledger.group))
        .where(
            Ledger.company_id == company.id,
            Ledger.is_active.is_(True),
            AccountGroup.nature.in_(
                [AccountNature.INCOME.value, AccountNature.EXPENSE.value]
            ),
        )
        .order_by(AccountGroup.display_order.asc(), Ledger.code.asc())
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())
    period_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, from_date=eff_from, to_date=eff_to
    )

    direct_income: list[StatementLineItem] = []
    direct_expenses: list[StatementLineItem] = []
    indirect_income: list[StatementLineItem] = []
    indirect_expenses: list[StatementLineItem] = []

    tot_direct_inc = ZERO
    tot_direct_exp = ZERO
    tot_indirect_inc = ZERO
    tot_indirect_exp = ZERO

    for ledger in ledgers:
        dr, cr = period_sums.get(ledger.id, (ZERO, ZERO))
        # Include opening balance only when report starts at FY start
        open_s = _opening_signed(ledger) if eff_from == fy.start_date else ZERO
        closing_signed = open_s + dr - cr

        if ledger.group.nature == AccountNature.INCOME.value:
            # Credit-normal income
            amt = -closing_signed
            if amt == ZERO:
                continue
            item = StatementLineItem(
                ledger_id=ledger.id,
                ledger_code=ledger.code,
                ledger_name=ledger.name,
                group_name=ledger.group.name,
                amount=amt,
            )
            if ledger.group.affects_gross_profit:
                direct_income.append(item)
                tot_direct_inc += amt
            else:
                indirect_income.append(item)
                tot_indirect_inc += amt
        else:
            # Debit-normal expense
            amt = closing_signed
            if amt == ZERO:
                continue
            item = StatementLineItem(
                ledger_id=ledger.id,
                ledger_code=ledger.code,
                ledger_name=ledger.name,
                group_name=ledger.group.name,
                amount=amt,
            )
            if ledger.group.affects_gross_profit:
                direct_expenses.append(item)
                tot_direct_exp += amt
            else:
                indirect_expenses.append(item)
                tot_indirect_exp += amt

    gross_profit = tot_direct_inc - tot_direct_exp
    net_profit = gross_profit + tot_indirect_inc - tot_indirect_exp

    return ProfitLossReportRead(
        from_date=eff_from,
        to_date=eff_to,
        direct_income=direct_income,
        direct_expenses=direct_expenses,
        total_direct_income=tot_direct_inc,
        total_direct_expenses=tot_direct_exp,
        gross_profit=gross_profit,
        indirect_income=indirect_income,
        indirect_expenses=indirect_expenses,
        total_indirect_income=tot_indirect_inc,
        total_indirect_expenses=tot_indirect_exp,
        net_profit=net_profit,
    )


async def get_balance_sheet(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    as_of_date: date | None = None,
) -> BalanceSheetReportRead:
    company, fy = await get_active_company_and_fy(db, company_id)
    eff_as_of = as_of_date or fy.end_date

    ledgers_stmt = (
        select(Ledger)
        .join(AccountGroup, Ledger.group_id == AccountGroup.id)
        .options(selectinload(Ledger.group))
        .where(Ledger.company_id == company.id, Ledger.is_active.is_(True))
        .order_by(AccountGroup.display_order.asc(), Ledger.code.asc())
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())
    posted_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, to_date=eff_as_of
    )

    asset_groups: dict[int, BalanceSheetSectionGroup] = {}
    liability_groups: dict[int, BalanceSheetSectionGroup] = {}
    equity_groups: dict[int, BalanceSheetSectionGroup] = {}

    total_assets = ZERO
    total_liabilities = ZERO
    total_equity = ZERO
    net_profit = ZERO

    for ledger in ledgers:
        dr, cr = posted_sums.get(ledger.id, (ZERO, ZERO))
        closing_signed = _opening_signed(ledger) + dr - cr
        nature = AccountNature(ledger.group.nature)

        # Accumulate exact Income - Expense into Current Period Net Profit/Loss
        if nature == AccountNature.INCOME:
            net_profit += -closing_signed
            continue
        if nature == AccountNature.EXPENSE:
            net_profit -= closing_signed
            continue

        if closing_signed == ZERO:
            continue

        if nature == AccountNature.ASSET:
            # Debit-normal Asset
            amt = closing_signed
            total_assets += amt
            target = asset_groups
        elif nature == AccountNature.LIABILITY:
            # Credit-normal Liability
            amt = -closing_signed
            total_liabilities += amt
            target = liability_groups
        else:
            # Credit-normal Equity
            amt = -closing_signed
            total_equity += amt
            target = equity_groups

        grp = target.get(ledger.group_id)
        if grp is None:
            grp = BalanceSheetSectionGroup(
                group_id=ledger.group_id,
                group_name=ledger.group.name,
                nature=nature,
                total=ZERO,
                ledgers=[],
            )
            target[ledger.group_id] = grp

        grp.total += amt
        grp.ledgers.append(
            StatementLineItem(
                ledger_id=ledger.id,
                ledger_code=ledger.code,
                ledger_name=ledger.name,
                group_name=ledger.group.name,
                amount=amt,
            )
        )

    total_liab_and_eq = total_liabilities + total_equity + net_profit
    difference = abs(total_assets - total_liab_and_eq)

    return BalanceSheetReportRead(
        as_of_date=eff_as_of,
        assets=list(asset_groups.values()),
        liabilities=list(liability_groups.values()),
        equity=list(equity_groups.values()),
        current_period_net_profit=net_profit,
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        total_equity=total_equity,
        total_liabilities_and_equity=total_liab_and_eq,
        difference=difference,
        is_balanced=difference == ZERO,
    )


async def get_dashboard_kpis(
    db: AsyncSession, company_id: int | None = None
) -> DashboardKPIsRead:
    company, fy = await get_active_company_and_fy(db, company_id)

    ledgers_stmt = (
        select(Ledger)
        .options(selectinload(Ledger.group))
        .where(Ledger.company_id == company.id, Ledger.is_active.is_(True))
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())
    posted_sums = await _fetch_posted_sums_by_ledger(db, company.id)

    cash_bank_signed = ZERO
    debtors_signed = ZERO
    creditors_signed = ZERO
    duties_signed = ZERO
    tb_dr = ZERO
    tb_cr = ZERO

    for ledger in ledgers:
        dr, cr = posted_sums.get(ledger.id, (ZERO, ZERO))
        closing_signed = _opening_signed(ledger) + dr - cr
        c_dr, c_cr = _to_dr_cr_columns(closing_signed)
        tb_dr += c_dr
        tb_cr += c_cr

        gname = ledger.group.name
        if gname in ("Cash-in-Hand", "Bank Accounts", "Bank OD A/c"):
            cash_bank_signed += closing_signed
        elif gname == "Sundry Debtors":
            debtors_signed += closing_signed
        elif gname == "Sundry Creditors":
            creditors_signed += closing_signed
        elif gname == "Duties & Taxes":
            duties_signed += closing_signed

    # Count vouchers by status
    count_stmt = (
        select(Voucher.status, func.count(Voucher.id))
        .where(Voucher.company_id == company.id)
        .group_by(Voucher.status)
    )
    status_counts = {
        str(status): int(cnt) for status, cnt in (await db.execute(count_stmt)).all()
    }
    posted_v = status_counts.get(VoucherStatus.POSTED.value, 0)
    draft_v = status_counts.get(VoucherStatus.DRAFT.value, 0)
    cancelled_v = status_counts.get(VoucherStatus.CANCELLED.value, 0)

    cb_amt, cb_side = _split_signed_balance(cash_bank_signed)
    dr_amt, dr_side = _split_signed_balance(debtors_signed)
    cr_amt, cr_side = _split_signed_balance(creditors_signed)
    gst_amt, gst_side = _split_signed_balance(duties_signed)

    return DashboardKPIsRead(
        company_name=company.legal_name,
        fiscal_year_label=fy.label,
        cash_and_bank_balance=cb_amt,
        cash_and_bank_dr_cr=cb_side,
        sundry_debtors=dr_amt,
        sundry_debtors_dr_cr=dr_side,
        sundry_creditors=cr_amt,
        sundry_creditors_dr_cr=cr_side,
        net_gst_position=gst_amt,
        net_gst_dr_cr=gst_side,
        total_vouchers=posted_v + draft_v + cancelled_v,
        posted_vouchers=posted_v,
        draft_vouchers=draft_v,
        cancelled_vouchers=cancelled_v,
        trial_balance_balanced=(tb_dr == tb_cr),
    )

```

---

### File: `backend/app/modules/ledger/router.py`

```python
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.ledger import AccountNature, VoucherStatus, VoucherType
from app.modules.ledger import service
from app.modules.ledger.schemas import (
    AccountGroupRead,
    BalanceSheetReportRead,
    CompanyContextRead,
    DashboardKPIsRead,
    DayBookReportRead,
    LedgerCreate,
    LedgerRead,
    LedgerStatementRead,
    ProfitLossReportRead,
    TrialBalanceReportRead,
    VoucherCancelRequest,
    VoucherCancelResponse,
    VoucherCreate,
    VoucherRead,
)

router = APIRouter(prefix="/api/v1", tags=["accounting"])


@router.get("/company", response_model=CompanyContextRead)
async def read_active_company(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> CompanyContextRead:
    return await service.get_company_context(db, company_id=company_id)


@router.get("/account-groups", response_model=list[AccountGroupRead])
async def read_account_groups(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[AccountGroupRead]:
    return await service.list_account_groups(db, company_id=company_id)


@router.get("/ledgers", response_model=list[LedgerRead])
async def read_ledgers(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    group_id: Annotated[int | None, Query(ge=1)] = None,
    nature: Annotated[AccountNature | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
) -> list[LedgerRead]:
    return await service.list_ledgers(
        db,
        company_id=company_id,
        group_id=group_id,
        nature=nature,
        search=search,
    )


@router.post("/ledgers", response_model=LedgerRead, status_code=status.HTTP_201_CREATED)
async def create_ledger_endpoint(
    payload: LedgerCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> LedgerRead:
    return await service.create_ledger(db, payload, company_id=company_id)


@router.get("/vouchers", response_model=DayBookReportRead)
async def list_vouchers_endpoint(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
    voucher_type: Annotated[VoucherType | None, Query()] = None,
    voucher_status: Annotated[VoucherStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
) -> DayBookReportRead:
    return await service.get_day_book(
        db,
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        voucher_type=voucher_type,
        status=voucher_status,
        search=search,
    )


@router.post("/vouchers", response_model=VoucherRead, status_code=status.HTTP_201_CREATED)
async def create_voucher_endpoint(
    payload: VoucherCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> VoucherRead:
    return await service.create_voucher(db, payload, company_id=company_id)


@router.get("/vouchers/{voucher_id}", response_model=VoucherRead)
async def get_voucher_endpoint(
    voucher_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> VoucherRead:
    return await service.get_voucher(db, voucher_id, company_id=company_id)


@router.post("/vouchers/{voucher_id}/cancel", response_model=VoucherCancelResponse)
async def cancel_voucher_endpoint(
    voucher_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: VoucherCancelRequest | None = None,
    create_reversal: Annotated[bool | None, Query()] = None,
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> VoucherCancelResponse:
    req = payload or VoucherCancelRequest()
    if create_reversal is not None:
        req = VoucherCancelRequest(
            create_reversal=create_reversal,
            reason=req.reason,
        )
    return await service.cancel_voucher(db, voucher_id, req, company_id=company_id)


@router.get("/reports/dashboard-kpis", response_model=DashboardKPIsRead)
async def read_dashboard_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> DashboardKPIsRead:
    return await service.get_dashboard_kpis(db, company_id=company_id)


@router.get("/reports/day-book", response_model=DayBookReportRead)
async def read_day_book(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
    voucher_type: Annotated[VoucherType | None, Query()] = None,
    voucher_status: Annotated[VoucherStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
) -> DayBookReportRead:
    return await service.get_day_book(
        db,
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        voucher_type=voucher_type,
        status=voucher_status,
        search=search,
    )


@router.get("/reports/ledger/{ledger_id}", response_model=LedgerStatementRead)
async def read_ledger_statement(
    ledger_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
) -> LedgerStatementRead:
    return await service.get_ledger_statement(
        db,
        ledger_id,
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/reports/trial-balance", response_model=TrialBalanceReportRead)
async def read_trial_balance(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
    include_zero: Annotated[bool, Query()] = False,
) -> TrialBalanceReportRead:
    return await service.get_trial_balance(
        db,
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        include_zero=include_zero,
    )


@router.get("/reports/profit-loss", response_model=ProfitLossReportRead)
async def read_profit_loss(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
) -> ProfitLossReportRead:
    return await service.get_profit_loss(
        db,
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/reports/balance-sheet", response_model=BalanceSheetReportRead)
async def read_balance_sheet(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    as_of_date: Annotated[date | None, Query()] = None,
) -> BalanceSheetReportRead:
    return await service.get_balance_sheet(
        db,
        company_id=company_id,
        as_of_date=as_of_date,
    )

```

---

### File: `backend/app/main.py`

```python
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import engine
from app.modules.ledger.exceptions import AccountingError
from app.modules.ledger.router import router as ledger_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AccountingError)
async def _handle_accounting_error(
    _request: Request, exc: AccountingError
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )


@app.get("/api/v1/health", tags=["system"])
async def health_check() -> dict[str, str]:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "version": settings.app_version,
        "dialect": engine.dialect.name,
    }


app.include_router(ledger_router)

```

---

**[PART 1 COMPLETE — CLEAN FILE BOUNDARY AFTER `backend/app/main.py`]**

# CURRENT_TASK.md — Milestone 2 (Part 2: Seed Script, Async Pytest Suite & Typed Frontend API Layer)

---

## 6. Phase D — Idempotent Synthetic Seed Script

### File: `backend/app/seed/__init__.py`

```python
"""Synthetic development and testing seed data (zero real PII)."""

```

---

### File: `backend/app/seed/dummy_company.py`

```python
from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.money import ZERO, quantize_money
from app.models.company import Company, FiscalYear
from app.models.ledger import (
    AccountGroup,
    AccountNature,
    DrCr,
    Ledger,
    Voucher,
    VoucherLine,
    VoucherStatus,
    VoucherType,
)

# Synthetic-only company profile (zero real PII)
SEED_COMPANY_NAME = "Bharat Hardware & Exports Pvt. Ltd."
SEED_COMPANY_GSTIN = "09AABCU9603R1ZM"
SEED_FY_LABEL = "FY 2026-27"

# All 28 Standard Tally Prime Account Groups (15 Primary + 13 Sub-Groups)
# Tuple: (code, name, parent_code, nature, is_primary, affects_gross_profit, display_order)
TALLY_28_GROUPS: list[
    tuple[str, str, str | None, AccountNature, bool, bool, int]
] = [
    # 15 Primary Groups
    ("GRP-CAP", "Capital Account", None, AccountNature.EQUITY, True, False, 10),
    ("GRP-LOAN", "Loans (Liability)", None, AccountNature.LIABILITY, True, False, 20),
    ("GRP-CLIA", "Current Liabilities", None, AccountNature.LIABILITY, True, False, 30),
    ("GRP-FA", "Fixed Assets", None, AccountNature.ASSET, True, False, 40),
    ("GRP-INV", "Investments", None, AccountNature.ASSET, True, False, 50),
    ("GRP-CASS", "Current Assets", None, AccountNature.ASSET, True, False, 60),
    ("GRP-BRCH", "Branch / Divisions", None, AccountNature.ASSET, True, False, 70),
    ("GRP-MISC", "Misc. Expenses (ASSET)", None, AccountNature.ASSET, True, False, 80),
    ("GRP-SUSP", "Suspense A/c", None, AccountNature.LIABILITY, True, False, 90),
    ("GRP-SALE", "Sales Accounts", None, AccountNature.INCOME, True, True, 100),
    ("GRP-PURC", "Purchase Accounts", None, AccountNature.EXPENSE, True, True, 110),
    ("GRP-DINC", "Direct Incomes", None, AccountNature.INCOME, True, True, 120),
    ("GRP-DEXP", "Direct Expenses", None, AccountNature.EXPENSE, True, True, 130),
    ("GRP-IINC", "Indirect Incomes", None, AccountNature.INCOME, True, False, 140),
    ("GRP-IEXP", "Indirect Expenses", None, AccountNature.EXPENSE, True, False, 150),
    # 13 Sub-Groups
    ("GRP-RES", "Reserves & Surplus", "GRP-CAP", AccountNature.EQUITY, False, False, 15),
    ("GRP-BOD", "Bank OD A/c", "GRP-LOAN", AccountNature.LIABILITY, False, False, 22),
    ("GRP-SLON", "Secured Loans", "GRP-LOAN", AccountNature.LIABILITY, False, False, 24),
    ("GRP-ULON", "Unsecured Loans", "GRP-LOAN", AccountNature.LIABILITY, False, False, 26),
    ("GRP-DUTY", "Duties & Taxes", "GRP-CLIA", AccountNature.LIABILITY, False, False, 32),
    ("GRP-PROV", "Provisions", "GRP-CLIA", AccountNature.LIABILITY, False, False, 34),
    ("GRP-CRED", "Sundry Creditors", "GRP-CLIA", AccountNature.LIABILITY, False, False, 36),
    ("GRP-STCK", "Stock-in-Hand", "GRP-CASS", AccountNature.ASSET, False, False, 62),
    ("GRP-DEP", "Deposits (Asset)", "GRP-CASS", AccountNature.ASSET, False, False, 63),
    ("GRP-LADV", "Loans & Advances (Asset)", "GRP-CASS", AccountNature.ASSET, False, False, 64),
    ("GRP-DEBT", "Sundry Debtors", "GRP-CASS", AccountNature.ASSET, False, False, 65),
    ("GRP-CASH", "Cash-in-Hand", "GRP-CASS", AccountNature.ASSET, False, False, 66),
    ("GRP-BANK", "Bank Accounts", "GRP-CASS", AccountNature.ASSET, False, False, 67),
]

# 20 Realistic Ledgers with STRICTLY BALANCED Opening Balances:
# Sum(Opening DR) = 5,600,000.0000 == Sum(Opening CR) = 5,600,000.0000
# Tuple: (code, name, group_code, opening_bal, dr_cr, party_gstin, party_state, credit_days, is_sys)
SEED_20_LEDGERS: list[
    tuple[str, str, str, str, DrCr, str | None, str | None, int, bool]
] = [
    # Assets & Input Tax Credits (Opening DR = 5,600,000.0000)
    ("1001", "Cash-in-Hand (Head Office)", "GRP-CASH", "150000.0000", DrCr.DR, None, None, 0, True),
    ("1010", "HDFC Bank Current A/c", "GRP-BANK", "1350000.0000", DrCr.DR, None, None, 0, True),
    ("1101", "Apex Industrial Electricals Pvt. Ltd.", "GRP-DEBT", "640000.0000", DrCr.DR, "09AAACA1111A1Z1", "09", 30, False),
    ("1102", "Western Valves & Fittings LLP", "GRP-DEBT", "420000.0000", DrCr.DR, "27AAACW2222B1Z2", "27", 45, False),
    ("1201", "Stock-in-Hand — Hardware & Copper", "GRP-STCK", "950000.0000", DrCr.DR, None, None, 0, False),
    ("1301", "Plant & Machinery", "GRP-FA", "1640000.0000", DrCr.DR, None, None, 0, False),
    ("2111", "Input CGST 9%", "GRP-DUTY", "120000.0000", DrCr.DR, None, None, 0, True),
    ("2112", "Input SGST 9%", "GRP-DUTY", "120000.0000", DrCr.DR, None, None, 0, True),
    ("2113", "Input IGST 18%", "GRP-DUTY", "210000.0000", DrCr.DR, None, None, 0, True),
    # Equity, Liabilities & Output Tax (Opening CR = 5,600,000.0000)
    ("3001", "Share Capital — Equity", "GRP-CAP", "4600000.0000", DrCr.CR, None, None, 0, True),
    ("2001", "Mahavir Copper Industries", "GRP-CRED", "620000.0000", DrCr.CR, "09AAACM3333C1Z3", "09", 30, False),
    ("2002", "Kalyani Freight & Logistics", "GRP-CRED", "290000.0000", DrCr.CR, "07AAACK4444D1Z4", "07", 15, False),
    ("2101", "Output CGST 9%", "GRP-DUTY", "30000.0000", DrCr.CR, None, None, 0, True),
    ("2102", "Output SGST 9%", "GRP-DUTY", "30000.0000", DrCr.CR, None, None, 0, True),
    ("2103", "Output IGST 18%", "GRP-DUTY", "30000.0000", DrCr.CR, None, None, 0, True),
    # Trading & P&L Ledgers (Opening Balance = 0.0000)
    ("4001", "Sales — Electrical Hardware", "GRP-SALE", "0.0000", DrCr.CR, None, None, 0, False),
    ("4101", "Interest & Discount Received", "GRP-IINC", "0.0000", DrCr.CR, None, None, 0, False),
    ("5001", "Purchases — Copper & Alloys", "GRP-PURC", "0.0000", DrCr.DR, None, None, 0, False),
    ("5101", "Freight & Forwarding Inward", "GRP-DEXP", "0.0000", DrCr.DR, None, None, 0, False),
    ("5201", "Office Rent & Warehouse Utilities", "GRP-IEXP", "0.0000", DrCr.DR, None, None, 0, False),
]

# 15 Balanced Sample Vouchers spanning F4 Contra through F9 Purchase
SEED_15_VOUCHERS: list[dict] = [
    {
        "voucher_number": "CON/26-27/0001",
        "voucher_type": VoucherType.CONTRA,
        "voucher_date": date(2026, 10, 5),
        "reference_no": "SLIP-4011",
        "narration": "Counter cash deposit into HDFC Bank Current A/c",
        "lines": [
            ("1010", "50000.0000", "0.0000", "Cash deposited at branch"),
            ("1001", "0.0000", "50000.0000", "Cash outflow from HO chest"),
        ],
    },
    {
        "voucher_number": "PUR/26-27/0001",
        "voucher_type": VoucherType.PURCHASE,
        "voucher_date": date(2026, 10, 8),
        "reference_no": "MCI/26/9001",
        "narration": "Electrolytic Copper Rod 8mm · Intra-state CGST 9% + SGST 9%",
        "lines": [
            ("5001", "300000.0000", "0.0000", "Taxable purchase value"),
            ("2111", "27000.0000", "0.0000", "Input CGST @ 9%"),
            ("2112", "27000.0000", "0.0000", "Input SGST @ 9%"),
            ("2001", "0.0000", "354000.0000", "Payable to Mahavir Copper"),
        ],
    },
    {
        "voucher_number": "SAL/26-27/0001",
        "voucher_type": VoucherType.SALES,
        "voucher_date": date(2026, 10, 12),
        "reference_no": "PO-APEX-8801",
        "narration": "Copper Wire Coil 2.5mm (240 coils) · Intra-state CGST 9% + SGST 9%",
        "lines": [
            ("1101", "283200.0000", "0.0000", "Invoice receivable from Apex"),
            ("4001", "0.0000", "240000.0000", "Taxable outward supply"),
            ("2101", "0.0000", "21600.0000", "Output CGST @ 9%"),
            ("2102", "0.0000", "21600.0000", "Output SGST @ 9%"),
        ],
    },
    {
        "voucher_number": "PUR/26-27/0002",
        "voucher_type": VoucherType.PURCHASE,
        "voucher_date": date(2026, 10, 15),
        "reference_no": "KFL/26/318",
        "narration": "Inter-state GTA freight inward (Delhi to Hathras) · IGST 18%",
        "lines": [
            ("5101", "45000.0000", "0.0000", "Inward haulage charges"),
            ("2113", "8100.0000", "0.0000", "Input IGST @ 18%"),
            ("2002", "0.0000", "53100.0000", "Payable to Kalyani Freight"),
        ],
    },
    {
        "voucher_number": "PAY/26-27/0001",
        "voucher_type": VoucherType.PAYMENT,
        "voucher_date": date(2026, 10, 18),
        "reference_no": "HDFCN5202610181104",
        "narration": "NEFT part settlement against MCI/26/9001",
        "lines": [
            ("2001", "250000.0000", "0.0000", "Vendor settlement"),
            ("1010", "0.0000", "250000.0000", "HDFC Bank NEFT debit"),
        ],
    },
    {
        "voucher_number": "RCP/26-27/0001",
        "voucher_type": VoucherType.RECEIPT,
        "voucher_date": date(2026, 10, 22),
        "reference_no": "HDFCR5202610220042",
        "narration": "RTGS receipt from Apex Industrial Electricals",
        "lines": [
            ("1010", "220000.0000", "0.0000", "RTGS credit into HDFC Bank"),
            ("1101", "0.0000", "220000.0000", "Part collection against SAL/26-27/0001"),
        ],
    },
    {
        "voucher_number": "SAL/26-27/0002",
        "voucher_type": VoucherType.SALES,
        "voucher_date": date(2026, 10, 26),
        "reference_no": "PO-WVF-409",
        "narration": "Inter-state supply of Brass Terminals to Maharashtra · IGST 18%",
        "lines": [
            ("1102", "354000.0000", "0.0000", "Receivable from Western Valves"),
            ("4001", "0.0000", "300000.0000", "Taxable inter-state sales"),
            ("2103", "0.0000", "54000.0000", "Output IGST @ 18%"),
        ],
    },
    {
        "voucher_number": "JRN/26-27/0001",
        "voucher_type": VoucherType.JOURNAL,
        "voucher_date": date(2026, 10, 31),
        "reference_no": "RENT-OCT-26",
        "narration": "October 2026 warehouse lease & utilities accrual",
        "lines": [
            ("5201", "65000.0000", "0.0000", "Oct rent & power expense"),
            ("2002", "0.0000", "65000.0000", "Accrued payable to logistics depot"),
        ],
    },
    {
        "voucher_number": "PAY/26-27/0002",
        "voucher_type": VoucherType.PAYMENT,
        "voucher_date": date(2026, 11, 4),
        "reference_no": "HDFCN5202611047712",
        "narration": "Settlement of Kalyani Freight & October depot dues",
        "lines": [
            ("2002", "118100.0000", "0.0000", "Freight + Oct rent payout"),
            ("1010", "0.0000", "118100.0000", "HDFC Bank NEFT debit"),
        ],
    },
    {
        "voucher_number": "RCP/26-27/0002",
        "voucher_type": VoucherType.RECEIPT,
        "voucher_date": date(2026, 11, 8),
        "reference_no": "HDFCR5202611080091",
        "narration": "RTGS collection from Western Valves & Fittings LLP",
        "lines": [
            ("1010", "280000.0000", "0.0000", "RTGS credit into HDFC Bank"),
            ("1102", "0.0000", "280000.0000", "Against SAL/26-27/0002"),
        ],
    },
    {
        "voucher_number": "PUR/26-27/0003",
        "voucher_type": VoucherType.PURCHASE,
        "voucher_date": date(2026, 11, 12),
        "reference_no": "MCI/26/9412",
        "narration": "Annealed Copper Strip 1.5mm · Intra-state CGST 9% + SGST 9%",
        "lines": [
            ("5001", "200000.0000", "0.0000", "Taxable purchase value"),
            ("2111", "18000.0000", "0.0000", "Input CGST @ 9%"),
            ("2112", "18000.0000", "0.0000", "Input SGST @ 9%"),
            ("2001", "0.0000", "236000.0000", "Payable to Mahavir Copper"),
        ],
    },
    {
        "voucher_number": "SAL/26-27/0003",
        "voucher_type": VoucherType.SALES,
        "voucher_date": date(2026, 11, 16),
        "reference_no": "PO-APEX-8841",
        "narration": "Heavy-duty Switchgear Busbars · Intra-state CGST 9% + SGST 9%",
        "lines": [
            ("1101", "413000.0000", "0.0000", "Invoice receivable from Apex"),
            ("4001", "0.0000", "350000.0000", "Taxable outward supply"),
            ("2101", "0.0000", "31500.0000", "Output CGST @ 9%"),
            ("2102", "0.0000", "31500.0000", "Output SGST @ 9%"),
        ],
    },
    {
        "voucher_number": "RCP/26-27/0003",
        "voucher_type": VoucherType.RECEIPT,
        "voucher_date": date(2026, 11, 20),
        "reference_no": "INT-Q3-2026",
        "narration": "FD sweep interest & prompt-payment rebate credited",
        "lines": [
            ("1010", "18500.0000", "0.0000", "Bank credit"),
            ("4101", "0.0000", "18500.0000", "Indirect income"),
        ],
    },
    {
        "voucher_number": "CON/26-27/0002",
        "voucher_type": VoucherType.CONTRA,
        "voucher_date": date(2026, 11, 22),
        "reference_no": "CHQ-000490",
        "narration": "Cash withdrawn from HDFC Bank for HO petty cash float",
        "lines": [
            ("1001", "25000.0000", "0.0000", "Petty cash replenishment"),
            ("1010", "0.0000", "25000.0000", "Self cheque withdrawal"),
        ],
    },
    {
        "voucher_number": "JRN/26-27/0002",
        "voucher_type": VoucherType.JOURNAL,
        "voucher_date": date(2026, 11, 26),
        "reference_no": "RENT-NOV-26",
        "narration": "November 2026 warehouse lease & utilities accrual",
        "lines": [
            ("5201", "65000.0000", "0.0000", "Nov rent & power expense"),
            ("2002", "0.0000", "65000.0000", "Accrued payable to logistics depot"),
        ],
    },
]


async def seed_dummy_company(db: AsyncSession) -> dict[str, int]:
    """
    Idempotently seeds Bharat Hardware & Exports Pvt. Ltd. (FY 2026-27),
    all 28 Tally Prime Account Groups, 20 balanced opening ledgers, and 15
    balanced sample vouchers (F4–F9). Safe to re-run without duplicates.
    """
    # 1. Company
    company = (
        await db.execute(
            select(Company).where(Company.legal_name == SEED_COMPANY_NAME)
        )
    ).scalar_one_or_none()
    if company is None:
        company = Company(
            name=SEED_COMPANY_NAME,
            legal_name=SEED_COMPANY_NAME,
            country_code="IN",
            state_code="09",
            gstin=SEED_COMPANY_GSTIN,
            base_currency="INR",
            number_format="INDIAN_LAKH",
            fy_start_month=4,
            is_active=True,
        )
        db.add(company)
        await db.flush()

    # 2. Fiscal Year (FY 2026-27)
    fy = (
        await db.execute(
            select(FiscalYear).where(
                FiscalYear.company_id == company.id,
                FiscalYear.label == SEED_FY_LABEL,
            )
        )
    ).scalar_one_or_none()
    if fy is None:
        fy = FiscalYear(
            company_id=company.id,
            label=SEED_FY_LABEL,
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_locked=False,
        )
        db.add(fy)
        await db.flush()

    # 3. All 28 Standard Tally Prime Account Groups (Primary first, then Sub-Groups)
    existing_groups = {
        g.code: g
        for g in (
            await db.execute(
                select(AccountGroup).where(AccountGroup.company_id == company.id)
            )
        )
        .scalars()
        .all()
    }
    groups_created = 0
    for code, name, parent_code, nature, is_primary, affects_gp, order in TALLY_28_GROUPS:
        if code in existing_groups:
            continue
        parent_id = existing_groups[parent_code].id if parent_code else None
        grp = AccountGroup(
            company_id=company.id,
            code=code,
            name=name,
            parent_id=parent_id,
            nature=nature.value,
            is_primary=is_primary,
            affects_gross_profit=affects_gp,
            display_order=order,
        )
        db.add(grp)
        await db.flush()
        existing_groups[code] = grp
        groups_created += 1

    # 4. Verify opening balance equilibrium before seeding ledgers
    open_dr = sum(
        (quantize_money(bal) for _, _, _, bal, side, *_ in SEED_20_LEDGERS if side == DrCr.DR),
        ZERO,
    )
    open_cr = sum(
        (quantize_money(bal) for _, _, _, bal, side, *_ in SEED_20_LEDGERS if side == DrCr.CR),
        ZERO,
    )
    assert open_dr == open_cr, f"Seed opening balances unbalanced: Dr={open_dr} != Cr={open_cr}"

    existing_ledgers = {
        l.code: l
        for l in (
            await db.execute(select(Ledger).where(Ledger.company_id == company.id))
        )
        .scalars()
        .all()
    }
    ledgers_created = 0
    for (
        code,
        name,
        grp_code,
        open_bal,
        dr_cr,
        party_gstin,
        party_state,
        credit_days,
        is_sys,
    ) in SEED_20_LEDGERS:
        if code in existing_ledgers:
            continue
        ledger = Ledger(
            company_id=company.id,
            group_id=existing_groups[grp_code].id,
            code=code,
            name=name,
            opening_balance=quantize_money(open_bal),
            opening_dr_cr=dr_cr.value,
            party_gstin=party_gstin,
            party_state_code=party_state,
            credit_days=credit_days,
            is_system_ledger=is_sys,
            is_active=True,
        )
        db.add(ledger)
        await db.flush()
        existing_ledgers[code] = ledger
        ledgers_created += 1

    # 5. Seed 15 Balanced Vouchers (F4–F9)
    existing_voucher_nos = set(
        (
            await db.execute(
                select(Voucher.voucher_number).where(
                    Voucher.company_id == company.id,
                    Voucher.fiscal_year_id == fy.id,
                )
            )
        )
        .scalars()
        .all()
    )
    vouchers_created = 0
    for vdef in SEED_15_VOUCHERS:
        if vdef["voucher_number"] in existing_voucher_nos:
            continue
        lines = [
            VoucherLine(
                ledger_id=existing_ledgers[l_code].id,
                debit_amount=Decimal(dr),
                credit_amount=Decimal(cr),
                line_narration=l_narr,
            )
            for l_code, dr, cr, l_narr in vdef["lines"]
        ]
        voucher = Voucher(
            company_id=company.id,
            fiscal_year_id=fy.id,
            voucher_number=vdef["voucher_number"],
            voucher_type=vdef["voucher_type"].value,
            voucher_date=vdef["voucher_date"],
            reference_no=vdef["reference_no"],
            narration=vdef["narration"],
            status=VoucherStatus.POSTED.value,
            lines=lines,
        )
        db.add(voucher)
        vouchers_created += 1

    await db.commit()
    return {
        "company_id": company.id,
        "fiscal_year_id": fy.id,
        "groups_created": groups_created,
        "ledgers_created": ledgers_created,
        "vouchers_created": vouchers_created,
    }


async def _main() -> None:
    async with AsyncSessionLocal() as session:
        summary = await seed_dummy_company(session)
    print(
        f"Seeded {SEED_COMPANY_NAME} ({SEED_FY_LABEL}): "
        f"groups_created={summary['groups_created']}, "
        f"ledgers_created={summary['ledgers_created']}, "
        f"vouchers_created={summary['vouchers_created']}"
    )


if __name__ == "__main__":
    asyncio.run(_main())

```

---

## 7. Phase E — Exhaustive Async Pytest Suite

### File: `backend/tests/__init__.py`

```python
"""LedgerPrime async pytest suite."""

```

---

### File: `backend/tests/conftest.py`

```python
from __future__ import annotations

from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import Base, build_async_engine, get_db
from app.main import app
from app.seed.dummy_company import seed_dummy_company


@pytest_asyncio.fixture
async def db_session(tmp_path: Path) -> AsyncGenerator[AsyncSession, None]:
    """Isolated async SQLite WAL database per test function."""
    db_file = tmp_path / "test_ledgerprime.db"
    test_engine = build_async_engine(f"sqlite+aiosqlite:///{db_file}", echo=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    async with session_factory() as session:
        await seed_dummy_company(session)
        yield session

    await test_engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Async httpx ASGI client wired to the isolated test SQLite session."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

```

---

### File: `backend/tests/test_double_entry.py`

```python
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company, FiscalYear
from app.models.ledger import Ledger, Voucher, VoucherLine, VoucherStatus, VoucherType
from app.modules.ledger.exceptions import UnbalancedVoucherError
from app.seed.dummy_company import seed_dummy_company


@pytest.mark.asyncio
async def test_1_balanced_f4_f5_f6_f7_posting_and_auto_numbering(
    client: AsyncClient,
) -> None:
    """Verifies balanced F4/F5/F6/F7 postings and sequential FY-scoped auto-numbering."""
    cases = [
        ("CONTRA", "CON/26-27/0003", "1010", "1001", "12500.0000"),
        ("PAYMENT", "PAY/26-27/0003", "2001", "1010", "45000.0000"),
        ("RECEIPT", "RCP/26-27/0004", "1010", "1101", "30000.0000"),
        ("JOURNAL", "JRN/26-27/0003", "5201", "2002", "15000.0000"),
    ]

    for vtype, expected_no, dr_code, cr_code, amt in cases:
        resp = await client.post(
            "/api/v1/vouchers",
            json={
                "voucher_type": vtype,
                "voucher_date": "2026-11-27",
                "narration": f"Automated test {vtype} entry",
                "lines": [
                    {"account_code": dr_code, "debit_amount": amt, "credit_amount": "0.0000"},
                    {"account_code": cr_code, "debit_amount": "0.0000", "credit_amount": amt},
                ],
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["voucher_number"] == expected_no
        assert body["status"] == "POSTED"
        assert body["total_debit"] == amt
        assert body["total_credit"] == amt


@pytest.mark.asyncio
async def test_2_unbalanced_single_line_and_zero_amount_rejections(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verifies HTTP 422 rejections for unbalanced, single-line, and zero-amount vouchers + ORM hook."""
    # A. Unbalanced voucher -> HTTP 422
    resp_unbal = await client.post(
        "/api/v1/vouchers",
        json={
            "voucher_type": "JOURNAL",
            "voucher_date": "2026-11-27",
            "narration": "Intentionally unbalanced",
            "lines": [
                {"account_code": "5201", "debit_amount": "10000.0000", "credit_amount": "0.0000"},
                {"account_code": "2002", "debit_amount": "0.0000", "credit_amount": "8750.0000"},
            ],
        },
    )
    assert resp_unbal.status_code == 422
    assert "1250.0000" in resp_unbal.text

    # B. Single-line voucher -> HTTP 422
    resp_single = await client.post(
        "/api/v1/vouchers",
        json={
            "voucher_type": "PAYMENT",
            "voucher_date": "2026-11-27",
            "narration": "Only one line",
            "lines": [
                {"account_code": "2001", "debit_amount": "5000.0000", "credit_amount": "0.0000"},
            ],
        },
    )
    assert resp_single.status_code == 422

    # C. Zero-amount voucher -> HTTP 422
    resp_zero = await client.post(
        "/api/v1/vouchers",
        json={
            "voucher_type": "JOURNAL",
            "voucher_date": "2026-11-27",
            "narration": "Zero amounts",
            "lines": [
                {"account_code": "5201", "debit_amount": "0.0000", "credit_amount": "0.0000"},
                {"account_code": "2002", "debit_amount": "0.0000", "credit_amount": "0.0000"},
            ],
        },
    )
    assert resp_zero.status_code == 422

    # D. Direct ORM flush safety net (Layer 3 before_flush invariant listener)
    company = (await db_session.execute(select(Company))).scalar_one()
    fy = (await db_session.execute(select(FiscalYear))).scalar_one()
    ledgers = {
        l.code: l
        for l in (await db_session.execute(select(Ledger))).scalars().all()
    }
    bad_voucher = Voucher(
        company_id=company.id,
        fiscal_year_id=fy.id,
        voucher_number="JRN/26-27/9999",
        voucher_type=VoucherType.JOURNAL.value,
        voucher_date=date(2026, 11, 27),
        narration="Direct ORM bypass attempt",
        status=VoucherStatus.POSTED.value,
        lines=[
            VoucherLine(
                ledger_id=ledgers["5201"].id,
                debit_amount=Decimal("500.0000"),
                credit_amount=Decimal("0.0000"),
            ),
            VoucherLine(
                ledger_id=ledgers["2002"].id,
                debit_amount=Decimal("0.0000"),
                credit_amount=Decimal("499.9999"),
            ),
        ],
    )
    db_session.add(bad_voucher)
    with pytest.raises(UnbalancedVoucherError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_3_exact_fixed_point_decimal_zero_float_drift(
    client: AsyncClient,
) -> None:
    """Verifies exact Decimal('0.1000') + Decimal('0.2000') == Decimal('0.3000') with zero float drift."""
    resp = await client.post(
        "/api/v1/vouchers",
        json={
            "voucher_type": "JOURNAL",
            "voucher_date": "2026-11-27",
            "narration": "Sub-rupee precision test (0.10 + 0.20 = 0.30)",
            "lines": [
                {"account_code": "5201", "debit_amount": "0.1000", "credit_amount": "0.0000"},
                {"account_code": "5101", "debit_amount": "0.2000", "credit_amount": "0.0000"},
                {"account_code": "1001", "debit_amount": "0.0000", "credit_amount": "0.3000"},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_debit"] == "0.3000"
    assert body["total_credit"] == "0.3000"

    # Reject raw IEEE-754 float in JSON payload
    resp_float = await client.post(
        "/api/v1/vouchers",
        json={
            "voucher_type": "JOURNAL",
            "voucher_date": "2026-11-27",
            "narration": "Float input rejected",
            "lines": [
                {"account_code": "5201", "debit_amount": 0.1, "credit_amount": "0.0000"},
                {"account_code": "1001", "debit_amount": "0.0000", "credit_amount": 0.1},
            ],
        },
    )
    assert resp_float.status_code == 422


@pytest.mark.asyncio
async def test_4_mutually_exclusive_dr_cr_line_rejection(
    client: AsyncClient,
) -> None:
    """Rejects any single voucher line carrying both debit_amount > 0 and credit_amount > 0."""
    resp = await client.post(
        "/api/v1/vouchers",
        json={
            "voucher_type": "JOURNAL",
            "voucher_date": "2026-11-27",
            "narration": "Both Dr and Cr on line 1",
            "lines": [
                {"account_code": "5201", "debit_amount": "1000.0000", "credit_amount": "500.0000"},
                {"account_code": "2002", "debit_amount": "0.0000", "credit_amount": "500.0000"},
            ],
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_5_cancellation_and_mirror_reversal_preserve_equilibrium(
    client: AsyncClient,
) -> None:
    """Verifies direct CANCELLED transition and create_reversal=true mirror journal."""
    # Baseline cash balance
    ledgers_before = {l["code"]: l for l in (await client.get("/api/v1/ledgers")).json()}
    cash_before = Decimal(ledgers_before["1001"]["closing_balance"])

    # Post Voucher A and cancel directly (create_reversal=false)
    v_a = (
        await client.post(
            "/api/v1/vouchers",
            json={
                "voucher_type": "PAYMENT",
                "voucher_date": "2026-11-27",
                "narration": "Test cancel direct",
                "lines": [
                    {"account_code": "5201", "debit_amount": "9000.0000", "credit_amount": "0.0000"},
                    {"account_code": "1001", "debit_amount": "0.0000", "credit_amount": "9000.0000"},
                ],
            },
        )
    ).json()
    cancel_a = await client.post(
        f"/api/v1/vouchers/{v_a['id']}/cancel",
        json={"create_reversal": False, "reason": "Entered by mistake"},
    )
    assert cancel_a.status_code == 200
    assert cancel_a.json()["original_voucher"]["status"] == "CANCELLED"
    assert cancel_a.json()["reversal_voucher"] is None

    # Post Voucher B and reverse with mirror journal (create_reversal=true)
    v_b = (
        await client.post(
            "/api/v1/vouchers",
            json={
                "voucher_type": "PAYMENT",
                "voucher_date": "2026-11-27",
                "narration": "Test mirror reversal",
                "lines": [
                    {"account_code": "5201", "debit_amount": "7500.0000", "credit_amount": "0.0000"},
                    {"account_code": "1001", "debit_amount": "0.0000", "credit_amount": "7500.0000"},
                ],
            },
        )
    ).json()
    rev_b = await client.post(
        f"/api/v1/vouchers/{v_b['id']}/cancel",
        json={"create_reversal": True, "reason": "Duplicate posting"},
    )
    assert rev_b.status_code == 200
    rev_body = rev_b.json()
    assert rev_body["action"] == "REVERSED"
    assert rev_body["original_voucher"]["status"] == "POSTED"
    assert rev_body["reversal_voucher"]["reversed_voucher_id"] == v_b["id"]
    assert rev_body["reversal_voucher"]["total_debit"] == "7500.0000"

    # Cash balance & Trial Balance equilibrium must be strictly restored
    ledgers_after = {l["code"]: l for l in (await client.get("/api/v1/ledgers")).json()}
    assert Decimal(ledgers_after["1001"]["closing_balance"]) == cash_before

    tb = (await client.get("/api/v1/reports/trial-balance")).json()
    assert tb["is_balanced"] is True
    assert tb["difference"] == "0.0000"
    assert tb["total_debit"] == tb["total_credit"]


@pytest.mark.asyncio
async def test_6_seed_idempotency_and_trial_balance_equilibrium(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Verifies re-running seed creates zero duplicates and Trial Balance difference == '0.0000'."""
    rerun = await seed_dummy_company(db_session)
    assert rerun["groups_created"] == 0
    assert rerun["ledgers_created"] == 0
    assert rerun["vouchers_created"] == 0

    groups = (await client.get("/api/v1/account-groups")).json()
    assert len(groups) == 28

    ledgers = (await client.get("/api/v1/ledgers")).json()
    assert len(ledgers) == 20

    tb = (await client.get("/api/v1/reports/trial-balance")).json()
    assert tb["is_balanced"] is True
    assert tb["difference"] == "0.0000"
    assert tb["total_opening_debit"] == "5600000.0000"
    assert tb["total_opening_credit"] == "5600000.0000"
    assert tb["total_debit"] == tb["total_credit"]


@pytest.mark.asyncio
async def test_7_profit_loss_and_balance_sheet_exact_math(
    client: AsyncClient,
) -> None:
    """Verifies Trading Gross Profit, P&L Net Profit, and Balance Sheet Assets == Liabilities + Equity."""
    pl = (await client.get("/api/v1/reports/profit-loss")).json()
    assert pl["total_direct_income"] == "890000.0000"
    assert pl["total_direct_expenses"] == "545000.0000"
    assert pl["gross_profit"] == "345000.0000"
    assert pl["total_indirect_income"] == "18500.0000"
    assert pl["total_indirect_expenses"] == "130000.0000"
    assert pl["net_profit"] == "233500.0000"

    bs = (await client.get("/api/v1/reports/balance-sheet")).json()
    assert bs["current_period_net_profit"] == "233500.0000"
    assert bs["is_balanced"] is True
    assert bs["difference"] == "0.0000"
    assert bs["total_assets"] == bs["total_liabilities_and_equity"]


@pytest.mark.asyncio
async def test_8_ledger_statement_chronological_running_balance(
    client: AsyncClient,
) -> None:
    """Verifies Cash-in-Hand (1001) opening balance, chronological movements, and exact running balance."""
    ledgers = (await client.get("/api/v1/ledgers")).json()
    cash_ledger = next(l for l in ledgers if l["code"] == "1001")

    stmt = (
        await client.get(
            f"/api/v1/reports/ledger/{cash_ledger['id']}",
            params={"from_date": "2026-04-01", "to_date": "2027-03-31"},
        )
    ).json()

    # Opening 150,000 DR -> Oct 5 Cr 50,000 (100,000 DR) -> Nov 22 Dr 25,000 (125,000 DR)
    assert stmt["opening_balance"] == "150000.0000"
    assert stmt["opening_dr_cr"] == "DR"
    assert len(stmt["entries"]) == 2

    assert stmt["entries"][0]["voucher_number"] == "CON/26-27/0001"
    assert stmt["entries"][0]["credit_amount"] == "50000.0000"
    assert stmt["entries"][0]["running_balance"] == "100000.0000"
    assert stmt["entries"][0]["running_dr_cr"] == "DR"

    assert stmt["entries"][1]["voucher_number"] == "CON/26-27/0002"
    assert stmt["entries"][1]["debit_amount"] == "25000.0000"
    assert stmt["entries"][1]["running_balance"] == "125000.0000"
    assert stmt["entries"][1]["running_dr_cr"] == "DR"

    assert stmt["closing_balance"] == "125000.0000"
    assert stmt["closing_dr_cr"] == "DR"

```

---

## 8. Phase F — Frontend Typed API Client & TanStack Query v5 Hooks

### File: `frontend/src/lib/api.ts`

```ts
export type AccountNature = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
export type DrCr = 'DR' | 'CR'
export type ApiVoucherType =
  | 'CONTRA'
  | 'PAYMENT'
  | 'RECEIPT'
  | 'JOURNAL'
  | 'SALES'
  | 'PURCHASE'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
export type ApiVoucherStatus = 'DRAFT' | 'POSTED' | 'CANCELLED'

export interface FiscalYearDTO {
  id: number
  company_id: number
  label: string
  start_date: string
  end_date: string
  is_locked: boolean
}

export interface CompanyContextDTO {
  id: number
  name: string
  legal_name: string
  country_code: string
  state_code: string
  gstin: string | null
  base_currency: string
  number_format: string
  fy_start_month: number
  active_fiscal_year: FiscalYearDTO
}

export interface AccountGroupDTO {
  id: number
  company_id: number
  code: string
  name: string
  parent_id: number | null
  nature: AccountNature
  is_primary: boolean
  affects_gross_profit: boolean
  display_order: number
  ledger_count: number
  closing_balance: string
  closing_dr_cr: DrCr
}

export interface LedgerDTO {
  id: number
  company_id: number
  group_id: number
  group_name: string
  group_nature: AccountNature
  code: string
  name: string
  opening_balance: string
  opening_dr_cr: DrCr
  closing_balance: string
  closing_dr_cr: DrCr
  party_gstin: string | null
  party_state_code: string | null
  credit_days: number
  is_system_ledger: boolean
  is_active: boolean
}

export interface LedgerCreatePayload {
  group_id: number
  code: string
  name: string
  opening_balance: string
  opening_dr_cr: DrCr
  party_gstin?: string | null
  party_state_code?: string | null
  credit_days?: number
}

export interface VoucherLineDTO {
  id: number
  ledger_id: number
  ledger_code: string
  ledger_name: string
  debit_amount: string
  credit_amount: string
  line_narration: string | null
}

export interface VoucherDTO {
  id: number
  company_id: number
  fiscal_year_id: number
  voucher_number: string
  voucher_type: ApiVoucherType
  voucher_date: string
  reference_no: string | null
  narration: string
  status: ApiVoucherStatus
  reversed_voucher_id: number | null
  particulars: string
  total_debit: string
  total_credit: string
  created_at: string
  updated_at: string
  lines: VoucherLineDTO[]
}

export interface VoucherCreatePayload {
  voucher_type: ApiVoucherType
  voucher_date: string
  voucher_number?: string | null
  reference_no?: string | null
  narration: string
  status?: ApiVoucherStatus
  lines: Array<{
    ledger_id?: number
    account_code?: string
    debit_amount: string
    credit_amount: string
    line_narration?: string | null
  }>
}

export interface VoucherCancelResponseDTO {
  original_voucher: VoucherDTO
  reversal_voucher: VoucherDTO | null
  action: 'CANCELLED' | 'REVERSED'
}

export interface DashboardKPIsDTO {
  company_name: string
  fiscal_year_label: string
  cash_and_bank_balance: string
  cash_and_bank_dr_cr: DrCr
  sundry_debtors: string
  sundry_debtors_dr_cr: DrCr
  sundry_creditors: string
  sundry_creditors_dr_cr: DrCr
  net_gst_position: string
  net_gst_dr_cr: DrCr
  total_vouchers: number
  posted_vouchers: number
  draft_vouchers: number
  cancelled_vouchers: number
  trial_balance_balanced: boolean
}

export interface DayBookReportDTO {
  from_date: string | null
  to_date: string | null
  total_count: number
  posted_count: number
  excluded_count: number
  posted_total_debit: string
  posted_total_credit: string
  vouchers: VoucherDTO[]
}

export interface LedgerStatementRowDTO {
  voucher_id: number
  voucher_date: string
  voucher_number: string
  voucher_type: ApiVoucherType
  particulars: string
  reference_no: string | null
  narration: string
  debit_amount: string
  credit_amount: string
  running_balance: string
  running_dr_cr: DrCr
}

export interface LedgerStatementDTO {
  ledger_id: number
  ledger_code: string
  ledger_name: string
  group_name: string
  group_nature: AccountNature
  from_date: string
  to_date: string
  opening_balance: string
  opening_dr_cr: DrCr
  period_debit: string
  period_credit: string
  closing_balance: string
  closing_dr_cr: DrCr
  entries: LedgerStatementRowDTO[]
}

export interface TrialBalanceRowDTO {
  ledger_id: number
  ledger_code: string
  ledger_name: string
  group_id: number
  group_name: string
  nature: AccountNature
  opening_debit: string
  opening_credit: string
  period_debit: string
  period_credit: string
  closing_debit: string
  closing_credit: string
}

export interface TrialBalanceGroupSummaryDTO {
  group_id: number
  group_name: string
  nature: AccountNature
  opening_debit: string
  opening_credit: string
  period_debit: string
  period_credit: string
  closing_debit: string
  closing_credit: string
}

export interface TrialBalanceReportDTO {
  from_date: string
  to_date: string
  rows: TrialBalanceRowDTO[]
  groups: TrialBalanceGroupSummaryDTO[]
  total_opening_debit: string
  total_opening_credit: string
  total_period_debit: string
  total_period_credit: string
  total_debit: string
  total_credit: string
  difference: string
  is_balanced: boolean
}

export interface StatementLineItemDTO {
  ledger_id: number
  ledger_code: string
  ledger_name: string
  group_name: string
  amount: string
}

export interface ProfitLossReportDTO {
  from_date: string
  to_date: string
  direct_income: StatementLineItemDTO[]
  direct_expenses: StatementLineItemDTO[]
  total_direct_income: string
  total_direct_expenses: string
  gross_profit: string
  indirect_income: StatementLineItemDTO[]
  indirect_expenses: StatementLineItemDTO[]
  total_indirect_income: string
  total_indirect_expenses: string
  net_profit: string
}

export interface BalanceSheetSectionGroupDTO {
  group_id: number
  group_name: string
  nature: AccountNature
  total: string
  ledgers: StatementLineItemDTO[]
}

export interface BalanceSheetReportDTO {
  as_of_date: string
  assets: BalanceSheetSectionGroupDTO[]
  liabilities: BalanceSheetSectionGroupDTO[]
  equity: BalanceSheetSectionGroupDTO[]
  current_period_net_profit: string
  total_assets: string
  total_liabilities: string
  total_equity: string
  total_liabilities_and_equity: string
  difference: string
  is_balanced: boolean
}

export class ApiError extends Error {
  readonly status: number
  readonly errorCode?: string

  constructor(message: string, status: number, errorCode?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errorCode = errorCode
  }
}

const API_BASE = '/api/v1'

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      qs.set(k, String(v))
    }
  }
  const encoded = qs.toString()
  return encoded ? `?${encoded}` : ''
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    let errorCode: string | undefined
    try {
      const payload = (await res.json()) as {
        message?: string
        error_code?: string
        detail?: string | Array<{ msg?: string; loc?: Array<string | number> }>
      }
      if (payload.message) {
        message = payload.message
        errorCode = payload.error_code
      } else if (typeof payload.detail === 'string') {
        message = payload.detail
      } else if (Array.isArray(payload.detail) && payload.detail.length > 0) {
        message = payload.detail.map((d) => d.msg ?? 'Validation error').join('; ')
      }
    } catch {
      // Fall back to HTTP status text
    }
    throw new ApiError(message, res.status, errorCode)
  }

  return (await res.json()) as T
}

export const accountingApi = {
  getCompanyContext: () => requestJson<CompanyContextDTO>('/company'),

  getDashboardKPIs: () => requestJson<DashboardKPIsDTO>('/reports/dashboard-kpis'),

  getAccountGroups: () => requestJson<AccountGroupDTO[]>('/account-groups'),

  getLedgers: (params?: { group_id?: number; nature?: AccountNature; search?: string }) =>
    requestJson<LedgerDTO[]>(`/ledgers${buildQuery(params ?? {})}`),

  createLedger: (payload: LedgerCreatePayload) =>
    requestJson<LedgerDTO>('/ledgers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDayBook: (params?: {
    from_date?: string
    to_date?: string
    voucher_type?: ApiVoucherType
    status?: ApiVoucherStatus
    search?: string
  }) => requestJson<DayBookReportDTO>(`/reports/day-book${buildQuery(params ?? {})}`),

  createVoucher: (payload: VoucherCreatePayload) =>
    requestJson<VoucherDTO>('/vouchers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelVoucher: (
    voucherId: number,
    options: { create_reversal?: boolean; reason?: string } = {},
  ) =>
    requestJson<VoucherCancelResponseDTO>(`/vouchers/${voucherId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        create_reversal: options.create_reversal ?? false,
        reason: options.reason ?? null,
      }),
    }),

  getLedgerStatement: (
    ledgerId: number,
    params?: { from_date?: string; to_date?: string },
  ) =>
    requestJson<LedgerStatementDTO>(
      `/reports/ledger/${ledgerId}${buildQuery(params ?? {})}`,
    ),

  getTrialBalance: (params?: {
    from_date?: string
    to_date?: string
    include_zero?: boolean
  }) =>
    requestJson<TrialBalanceReportDTO>(
      `/reports/trial-balance${buildQuery(params ?? {})}`,
    ),

  getProfitLoss: (params?: { from_date?: string; to_date?: string }) =>
    requestJson<ProfitLossReportDTO>(
      `/reports/profit-loss${buildQuery(params ?? {})}`,
    ),

  getBalanceSheet: (params?: { as_of_date?: string }) =>
    requestJson<BalanceSheetReportDTO>(
      `/reports/balance-sheet${buildQuery(params ?? {})}`,
    ),
}

```

---

### File: `frontend/src/hooks/useAccounting.ts`

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  accountingApi,
  type AccountNature,
  type ApiVoucherStatus,
  type ApiVoucherType,
  type LedgerCreatePayload,
  type VoucherCreatePayload,
} from '../lib/api'

export const ACCOUNTING_KEYS = {
  all: ['accounting'] as const,
  company: () => [...ACCOUNTING_KEYS.all, 'company'] as const,
  kpis: () => [...ACCOUNTING_KEYS.all, 'kpis'] as const,
  groups: () => [...ACCOUNTING_KEYS.all, 'groups'] as const,
  ledgers: (params?: { group_id?: number; nature?: AccountNature; search?: string }) =>
    [...ACCOUNTING_KEYS.all, 'ledgers', params ?? {}] as const,
  dayBook: (params?: {
    from_date?: string
    to_date?: string
    voucher_type?: ApiVoucherType
    status?: ApiVoucherStatus
    search?: string
  }) => [...ACCOUNTING_KEYS.all, 'dayBook', params ?? {}] as const,
  ledgerStatement: (ledgerId: number | null, params?: { from_date?: string; to_date?: string }) =>
    [...ACCOUNTING_KEYS.all, 'ledgerStatement', ledgerId, params ?? {}] as const,
  trialBalance: (params?: { from_date?: string; to_date?: string; include_zero?: boolean }) =>
    [...ACCOUNTING_KEYS.all, 'trialBalance', params ?? {}] as const,
  profitLoss: (params?: { from_date?: string; to_date?: string }) =>
    [...ACCOUNTING_KEYS.all, 'profitLoss', params ?? {}] as const,
  balanceSheet: (params?: { as_of_date?: string }) =>
    [...ACCOUNTING_KEYS.all, 'balanceSheet', params ?? {}] as const,
}

export function useCompanyContext() {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.company(),
    queryFn: accountingApi.getCompanyContext,
  })
}

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.kpis(),
    queryFn: accountingApi.getDashboardKPIs,
  })
}

export function useAccountGroups() {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.groups(),
    queryFn: accountingApi.getAccountGroups,
  })
}

export function useLedgers(params?: {
  group_id?: number
  nature?: AccountNature
  search?: string
}) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.ledgers(params),
    queryFn: () => accountingApi.getLedgers(params),
  })
}

export function useDayBook(params?: {
  from_date?: string
  to_date?: string
  voucher_type?: ApiVoucherType
  status?: ApiVoucherStatus
  search?: string
}) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.dayBook(params),
    queryFn: () => accountingApi.getDayBook(params),
  })
}

export function useLedgerStatement(
  ledgerId: number | null,
  params?: { from_date?: string; to_date?: string },
) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.ledgerStatement(ledgerId, params),
    queryFn: () => accountingApi.getLedgerStatement(ledgerId!, params),
    enabled: ledgerId !== null,
  })
}

export function useTrialBalance(params?: {
  from_date?: string
  to_date?: string
  include_zero?: boolean
}) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.trialBalance(params),
    queryFn: () => accountingApi.getTrialBalance(params),
  })
}

export function useProfitLoss(params?: { from_date?: string; to_date?: string }) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.profitLoss(params),
    queryFn: () => accountingApi.getProfitLoss(params),
  })
}

export function useBalanceSheet(params?: { as_of_date?: string }) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.balanceSheet(params),
    queryFn: () => accountingApi.getBalanceSheet(params),
  })
}

export function useCreateLedger() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: LedgerCreatePayload) => accountingApi.createLedger(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}

export function useCreateVoucher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VoucherCreatePayload) => accountingApi.createVoucher(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}

export function useCancelVoucher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      voucherId,
      createReversal,
      reason,
    }: {
      voucherId: number
      createReversal?: boolean
      reason?: string
    }) =>
      accountingApi.cancelVoucher(voucherId, {
        create_reversal: createReversal,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}

```

---

**[PART 2 COMPLETE — CLEAN FILE BOUNDARY AFTER `frontend/src/hooks/useAccounting.ts`]**

# CURRENT_TASK.md — Milestone 2 (Part 3: Live Frontend Wiring, Chart of Accounts & Day Book)

---

## 9. Phase G — Live-Wired Shell, Command Palette, Quick Voucher Drawer & Dashboard

### File: `frontend/src/components/layout/AppShell.tsx`

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  ChevronDown,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  ListTree,
  Menu,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Scale,
  Search,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { CompanyContextDTO } from '../../lib/api'
import {
  COMPANY_PROFILE,
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type VoucherType,
} from '../../lib/dummyData'
import type { ThemeMode } from '../../hooks/useTheme'
import { Kbd } from '../ui/Kbd'

export interface NavItem {
  id: string
  label: string
  section: 'core' | 'upcoming'
  milestoneTag?: string
  icon: ReactNode
}

export const APP_NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    section: 'core',
    icon: <LayoutDashboard className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'coa',
    label: 'Chart of Accounts',
    section: 'core',
    icon: <ListTree className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'daybook',
    label: 'Day Book',
    section: 'core',
    icon: <FileText className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'ledger-statement',
    label: 'Ledger Statement',
    section: 'core',
    icon: <BookOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'trial-balance',
    label: 'Trial Balance',
    section: 'core',
    icon: <Scale className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'profit-loss',
    label: 'Profit & Loss',
    section: 'core',
    icon: <TrendingUp className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'balance-sheet',
    label: 'Balance Sheet',
    section: 'core',
    icon: <FileSpreadsheet className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    section: 'upcoming',
    milestoneTag: 'M3',
    icon: <Package className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'banking',
    label: 'Banking & BRS',
    section: 'upcoming',
    milestoneTag: 'M4',
    icon: <Landmark className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'tax',
    label: 'GST & Tax',
    section: 'upcoming',
    milestoneTag: 'M5',
    icon: <FileCheck2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    id: 'automation',
    label: 'Automation',
    section: 'upcoming',
    milestoneTag: 'M7',
    icon: <Bot className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  },
]

export interface AppShellProps {
  activeNav: string
  onSelectNav: (id: string) => void
  company?: CompanyContextDTO
  theme: ThemeMode
  onToggleTheme: () => void
  onOpenCommandPalette: () => void
  onOpenVoucher: (type: VoucherType) => void
  onOpenShortcutSheet: () => void
  mobileNavOpen: boolean
  onSetMobileNavOpen: (open: boolean) => void
  children: ReactNode
}

export function AppShell({
  activeNav,
  onSelectNav,
  company,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenVoucher,
  onOpenShortcutSheet,
  mobileNavOpen,
  onSetMobileNavOpen,
  children,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [splitMenuOpen, setSplitMenuOpen] = useState(false)
  const splitMenuRef = useRef<HTMLDivElement>(null)

  const companyName = company?.legal_name ?? COMPANY_PROFILE.legalName
  const fyLabel = company?.active_fiscal_year.label ?? COMPANY_PROFILE.fiscalYear
  const gstin = company?.gstin ?? COMPANY_PROFILE.gstin
  const stateLabel = company
    ? `${company.state_code} · ${company.country_code} (${company.base_currency})`
    : COMPANY_PROFILE.stateLabel

  useEffect(() => {
    if (!splitMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(event.target as Node)) {
        setSplitMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [splitMenuOpen])

  const coreNav = APP_NAV_ITEMS.filter((i) => i.section === 'core')
  const upcomingNav = APP_NAV_ITEMS.filter((i) => i.section === 'upcoming')

  const renderNavButton = (item: NavItem, isMobile: boolean) => {
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
          showLabel ? 'justify-between gap-2' : 'justify-center',
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
          <span className="code-mono text-[10px] font-semibold uppercase text-disabled-text">
            {item.milestoneTag}
          </span>
        ) : null}
      </button>
    )
  }

  const renderNavList = (isMobile: boolean) => (
    <nav aria-label="Primary Workspace Navigation" className="flex-1 overflow-y-auto px-2.5 py-3">
      <div className="space-y-1">{coreNav.map((item) => renderNavButton(item, isMobile))}</div>
      <div className="my-3 border-t border-border-subtle" />
      {(isMobile || !sidebarCollapsed) ? (
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-disabled-text">
          Upcoming Modules
        </p>
      ) : null}
      <div className="space-y-1">
        {upcomingNav.map((item) => renderNavButton(item, isMobile))}
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-canvas text-primary-text flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex lg:flex-col lg:shrink-0 border-r border-border-subtle bg-chrome transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)] print:hidden',
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
                <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-primary-text">
                  LedgerPrime
                </p>
                <p className="truncate font-mono text-[11px] text-muted-text">
                  v0.2 · Live Books
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
            <div className="rounded-md border border-border-subtle bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="type-xs uppercase text-muted-text">GSTIN · Synthetic</p>
                <BarChart3 className="h-3.5 w-3.5 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <p className="mt-0.5 code-mono text-[12px] font-medium text-primary-text">
                {gstin}
              </p>
              <p className="mt-1 text-[11px] text-muted-text">{stateLabel}</p>
            </div>
          </div>
        ) : null}
      </aside>

      {/* Mobile Slide-Over Sidebar Drawer */}
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
          <aside className="relative z-10 flex h-full w-[264px] max-w-[82vw] flex-col border-r border-border-strong bg-raised shadow-md">
            <div className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground font-mono text-[13px] font-bold">
                  LP
                </div>
                <span className="text-[15px] font-bold text-primary-text">
                  LedgerPrime
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSetMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-text hover:bg-muted hover:text-primary-text cursor-pointer"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>

            {renderNavList(true)}

            <div className="border-t border-border-subtle p-4 space-y-3">
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex h-11 w-full items-center justify-between rounded-md border border-border-input bg-surface px-3 text-[13px] font-medium text-primary-text hover:bg-muted cursor-pointer"
              >
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-muted-text" strokeWidth={1.75} />
                ) : (
                  <Moon className="h-4 w-4 text-muted-text" strokeWidth={1.75} />
                )}
              </button>

              <div>
                <p className="text-[12px] font-semibold text-primary-text">{companyName}</p>
                <p className="mt-0.5 code-mono text-[11px] text-muted-text">
                  {fyLabel} · {gstin}
                </p>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky 56px Topbar */}
        <header className="sticky top-0 z-[var(--z-topbar)] flex h-14 items-center justify-between gap-2 border-b border-border-subtle bg-chrome px-4 lg:px-6 print:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => onSetMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border-input bg-surface text-primary-text hover:bg-muted lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <div className="flex min-w-0 min-h-[40px] items-center gap-2 rounded-md border border-border-input bg-surface px-2.5 py-1.5">
              <Building2
                className="hidden sm:block h-4 w-4 shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <span className="truncate text-[15px] sm:text-[14px] font-semibold leading-tight text-primary-text max-w-[160px] sm:max-w-[260px] md:max-w-none">
                  {companyName}
                </span>
                <span className="shrink-0 code-mono text-[11px] font-semibold text-muted-text sm:rounded-sm sm:border sm:border-border-subtle sm:bg-muted sm:px-1.5 sm:py-0.5">
                  {fyLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="Open Go-To command palette (Alt+G)"
              className="flex h-11 w-11 md:h-[var(--control-h)] md:w-auto items-center justify-center md:justify-start gap-2 rounded-md border border-border-input bg-surface md:px-3 text-[13px] text-muted-text hover:bg-muted hover:text-primary-text transition-colors duration-[var(--dur-fast)] cursor-pointer"
            >
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden md:inline">Go To ledger, voucher...</span>
              <Kbd className="hidden md:inline-flex">Alt+G</Kbd>
            </button>

            <button
              type="button"
              onClick={onOpenShortcutSheet}
              aria-label="Keyboard shortcuts (?)"
              title="Tally Keyboard Shortcuts (?)"
              className="hidden md:flex h-[var(--control-h)] w-[var(--control-h)] shrink-0 items-center justify-center rounded-md border border-border-input bg-surface text-muted-text hover:bg-muted hover:text-primary-text transition-colors duration-[var(--dur-fast)] cursor-pointer"
            >
              <HelpCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="hidden lg:flex h-[var(--control-h)] w-[var(--control-h)] shrink-0 items-center justify-center rounded-md border border-border-input bg-surface text-primary-text hover:bg-muted transition-colors duration-[var(--dur-fast)] cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenVoucher('SALES')}
              aria-label="New Voucher"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground hover:bg-accent-hover sm:hidden cursor-pointer"
            >
              <Plus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </button>

            <div ref={splitMenuRef} className="relative hidden sm:inline-flex">
              <button
                type="button"
                onClick={() => onOpenVoucher('SALES')}
                className="inline-flex h-[var(--control-h)] items-center gap-2 rounded-l-md bg-accent px-3.5 text-[14px] font-medium text-accent-foreground hover:bg-accent-hover transition-colors duration-[var(--dur-fast)] cursor-pointer"
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                <span>New Voucher</span>
                <Kbd variant="on-accent">F8</Kbd>
              </button>
              <button
                type="button"
                aria-label="Choose voucher type"
                aria-expanded={splitMenuOpen}
                aria-haspopup="menu"
                onClick={() => setSplitMenuOpen((prev) => !prev)}
                className="inline-flex h-[var(--control-h)] w-9 items-center justify-center rounded-r-md border-l border-[var(--kbd-on-primary-border)] bg-accent text-accent-foreground hover:bg-accent-hover transition-colors duration-[var(--dur-fast)] cursor-pointer"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>

              {splitMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Voucher types"
                  className="absolute right-0 top-[calc(100%+6px)] z-[var(--z-modal)] w-56 rounded-md border border-border-strong bg-raised p-1.5 shadow-md"
                >
                  {VOUCHER_TYPE_ORDER.map((type) => {
                    const meta = VOUCHER_TYPE_META[type]
                    return (
                      <button
                        key={type}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSplitMenuOpen(false)
                          onOpenVoucher(type)
                        }}
                        className="flex h-9 w-full items-center justify-between rounded-sm px-2.5 text-left text-[13px] font-medium text-primary-text hover:bg-row-hover cursor-pointer"
                      >
                        <span>{meta.label}</span>
                        <Kbd>{meta.shortKey}</Kbd>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Print-Only Statutory Letterhead */}
        <div className="hidden print:block border-b-2 border-border-strong px-2 pb-3 mb-4">
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="text-[18px] font-bold text-primary-text">{companyName}</h1>
              <p className="code-mono text-[12px] text-muted-text">
                GSTIN: {gstin} · {stateLabel}
              </p>
            </div>
            <div className="text-right code-mono text-[12px] text-muted-text">
              <p>{fyLabel}</p>
              <p>Generated from LedgerPrime</p>
            </div>
          </div>
        </div>

        {/* Workspace Canvas */}
        <main className="w-full max-w-[1360px] flex-1 px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-6">
          {children}
        </main>

        {/* Mobile Sticky Bottom Action Bar */}
        <div className="fixed inset-x-0 bottom-0 z-[var(--z-topbar)] flex items-center gap-2 border-t border-border-subtle bg-chrome px-4 py-2 pb-[calc(8px+env(safe-area-inset-bottom))] md:hidden print:hidden">
          <button
            type="button"
            onClick={() => onOpenVoucher('PAYMENT')}
            className="flex h-12 flex-1 items-center justify-center rounded-md border border-border-input bg-surface text-[14px] font-medium text-primary-text active:bg-row-hover cursor-pointer"
          >
            Payment
          </button>
          <button
            type="button"
            onClick={() => onOpenVoucher('RECEIPT')}
            className="flex h-12 flex-1 items-center justify-center rounded-md border border-border-input bg-surface text-[14px] font-medium text-primary-text active:bg-row-hover cursor-pointer"
          >
            Receipt
          </button>
          <button
            type="button"
            onClick={() => onOpenVoucher('SALES')}
            className="flex h-12 flex-[1.4] items-center justify-center gap-1.5 rounded-md bg-accent text-[14px] font-medium text-accent-foreground active:brightness-95 cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span>New Voucher</span>
          </button>
        </div>
      </div>
    </div>
  )
}

```

---

### File: `frontend/src/components/ui/CommandPalette.tsx`

```tsx
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  Landmark,
  Receipt,
  Search,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ApiVoucherType, LedgerDTO, VoucherDTO } from '../../lib/api'
import {
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type VoucherType,
} from '../../lib/dummyData'
import { formatCurrency } from '../../lib/format'
import { Kbd } from './Kbd'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  vouchers: VoucherDTO[]
  ledgers: LedgerDTO[]
  onOpenVoucher: (type: VoucherType) => void
  onSelectNav: (navId: string) => void
  onSelectLedger: (ledgerId: number) => void
  onSelectVoucher: (voucher: VoucherDTO) => void
}

interface PaletteItem {
  id: string
  group: 'Quick Vouchers' | 'Reports & Workspaces' | 'Ledgers' | 'Recent Vouchers'
  icon: ReactNode
  label: string
  meta: string
  shortcut?: string
  onExecute: () => void
}

const WORKSPACE_COMMANDS = [
  { id: 'dashboard', label: 'Financial Command Center', meta: 'Dashboard' },
  { id: 'coa', label: 'Chart of Accounts (28 Tally Groups)', meta: 'Masters · Live' },
  { id: 'daybook', label: 'Day Book & Voucher Register', meta: 'Register · Live' },
  { id: 'ledger-statement', label: 'Ledger Account Statement', meta: 'Running Balance' },
  { id: 'trial-balance', label: 'Trial Balance', meta: 'Dr == Cr Proof' },
  { id: 'profit-loss', label: 'Profit & Loss Statement', meta: 'Trading + P&L' },
  { id: 'balance-sheet', label: 'Balance Sheet', meta: 'Assets == Liab + Eq' },
]

function getVoucherIcon(type: ApiVoucherType): ReactNode {
  switch (type) {
    case 'CONTRA':
      return <ArrowLeftRight className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'PAYMENT':
      return <Wallet className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'RECEIPT':
      return <Receipt className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'SALES':
    case 'CREDIT_NOTE':
      return <ArrowUpRight className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    case 'PURCHASE':
    case 'DEBIT_NOTE':
      return <ShoppingBag className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
    default:
      return <FileText className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
  }
}

export function CommandPalette(props: CommandPaletteProps) {
  if (!props.open) return null
  return <CommandPaletteDialog {...props} />
}

function CommandPaletteDialog({
  onClose,
  vouchers,
  ledgers,
  onOpenVoucher,
  onSelectNav,
  onSelectLedger,
  onSelectVoucher,
}: Omit<CommandPaletteProps, 'open'>) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const navMethodRef = useRef<'keyboard' | 'mouse'>('keyboard')

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(rafId)
  }, [])

  useEffect(() => {
    if (navMethodRef.current !== 'keyboard') return
    const container = scrollContainerRef.current
    if (!container) return
    if (activeIndex === 0) {
      container.scrollTop = 0
      return
    }
    const activeOption = container.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex]
    activeOption?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const allItems = useMemo<PaletteItem[]>(() => {
    const voucherActions: PaletteItem[] = VOUCHER_TYPE_ORDER.map((type) => {
      const meta = VOUCHER_TYPE_META[type]
      return {
        id: `action-${type}`,
        group: 'Quick Vouchers',
        icon: getVoucherIcon(type),
        label: `New ${meta.label} Voucher`,
        meta: 'Auto-numbered',
        shortcut: meta.shortKey,
        onExecute: () => {
          onClose()
          onOpenVoucher(type)
        },
      }
    })

    const navItems: PaletteItem[] = WORKSPACE_COMMANDS.map((ws) => ({
      id: `nav-${ws.id}`,
      group: 'Reports & Workspaces',
      icon: <Landmark className="h-4 w-4 text-muted-text" strokeWidth={1.75} aria-hidden="true" />,
      label: ws.label,
      meta: ws.meta,
      onExecute: () => {
        onClose()
        onSelectNav(ws.id)
      },
    }))

    const ledgerItems: PaletteItem[] = ledgers.map((l) => ({
      id: `ledger-${l.id}`,
      group: 'Ledgers',
      icon: <BookOpen className="h-4 w-4 text-muted-text" strokeWidth={1.75} aria-hidden="true" />,
      label: `${l.code} · ${l.name}`,
      meta: `${formatCurrency(l.closing_balance)} ${l.closing_dr_cr === 'DR' ? 'Dr' : 'Cr'}`,
      onExecute: () => {
        onClose()
        onSelectLedger(l.id)
      },
    }))

    const recentVoucherItems: PaletteItem[] = vouchers.slice(0, 8).map((v) => ({
      id: `voucher-${v.id}`,
      group: 'Recent Vouchers',
      icon: getVoucherIcon(v.voucher_type),
      label: v.particulars,
      meta: `${v.voucher_number} · ${formatCurrency(v.total_debit)}`,
      onExecute: () => {
        onClose()
        onSelectVoucher(v)
      },
    }))

    return [...voucherActions, ...navItems, ...ledgerItems, ...recentVoucherItems]
  }, [vouchers, ledgers, onClose, onOpenVoucher, onSelectNav, onSelectLedger, onSelectVoucher])

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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      navMethodRef.current = 'keyboard'
      setActiveIndex((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      navMethodRef.current = 'keyboard'
      setActiveIndex((prev) =>
        filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length,
      )
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault()
      filtered[activeIndex].onExecute()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-palette)] flex items-start justify-center px-4 pt-[15vh] print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Go-To Command Palette"
    >
      <div className="fixed inset-0 bg-backdrop" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-lg border border-border-strong bg-raised shadow-md">
        <div className="flex h-[52px] items-center gap-3 border-b border-border-subtle px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-text" strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              navMethodRef.current = 'keyboard'
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Go To voucher, ledger, Trial Balance, P&L, Balance Sheet..."
            aria-label="Go-To command search"
            className="w-full bg-transparent text-[15px] font-normal text-primary-text placeholder:text-disabled-text focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={scrollContainerRef} className="max-h-[420px] overflow-y-auto p-1.5">
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
                      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                        {item.group}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => {
                        navMethodRef.current = 'mouse'
                        setActiveIndex(idx)
                      }}
                      onClick={item.onExecute}
                      className={cn(
                        'flex h-10 w-full items-center justify-between gap-3 rounded-md px-3 text-left transition-colors duration-[var(--dur-fast)] cursor-pointer',
                        isActive
                          ? 'bg-row-selected text-primary-text shadow-[inset_2px_0_0_0_var(--accent-primary)]'
                          : 'text-primary-text hover:bg-row-hover',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {item.icon}
                        <span className="truncate text-[14px] font-medium">{item.label}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="code-mono text-[12.5px] text-muted-text">
                          {item.meta}
                        </span>
                        {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
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
          <span>Tally Go-To Engine · Live FastAPI</span>
        </div>
      </div>
    </div>
  )
}

```

---

### File: `frontend/src/features/dashboard/QuickVoucherDrawer.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  absBigInt,
  DECIMAL_INPUT_REGEX,
  fromScaledInt,
  toScaledInt,
} from '../../lib/decimal'
import { formatCurrency } from '../../lib/format'
import type { VoucherDTO } from '../../lib/api'
import {
  VOUCHER_TYPE_META,
  VOUCHER_TYPE_ORDER,
  type VoucherType,
} from '../../lib/dummyData'
import { useCreateVoucher, useLedgers } from '../../hooks/useAccounting'
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
    voucherNo: z.string().trim().max(40).optional(),
    referenceNo: z.string().trim().max(64).optional(),
    narration: z.string().trim().min(1, 'Narration is required').max(500),
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
  onChangeVoucherType: (type: VoucherType) => void
  onClose: () => void
  onVoucherPosted: (voucher: VoucherDTO) => void
}

export function QuickVoucherDrawer({
  open,
  voucherType,
  onChangeVoucherType,
  onClose,
  onVoucherPosted,
}: QuickVoucherDrawerProps) {
  const meta = VOUCHER_TYPE_META[voucherType]
  const ledgersQuery = useLedgers()
  const createVoucher = useCreateVoucher()
  const [serverError, setServerError] = useState<string | null>(null)

  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<QuickVoucherInput, unknown, QuickVoucherOutput>({
    resolver: zodResolver(quickVoucherSchema),
    mode: 'onChange',
    defaultValues: {
      voucherDate: '2026-11-27',
      voucherNo: '',
      referenceNo: '',
      narration: '',
      lines: [
        { accountCode: meta.defaultDebitCode, debit: '', credit: '' },
        { accountCode: meta.defaultCreditCode, debit: '', credit: '' },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const rawWatchedLines = useWatch({ control, name: 'lines' })
  const watchedLines = useMemo(() => rawWatchedLines ?? [], [rawWatchedLines])

  useEffect(() => {
    if (!open) return
    setServerError(null)
    const typeMeta = VOUCHER_TYPE_META[voucherType]
    const hasCode = (code: string) => ledgers.some((l) => l.code === code)
    const drCode = hasCode(typeMeta.defaultDebitCode)
      ? typeMeta.defaultDebitCode
      : ledgers[0]?.code ?? ''
    const crCode = hasCode(typeMeta.defaultCreditCode)
      ? typeMeta.defaultCreditCode
      : ledgers[1]?.code ?? ''

    const hasAnyAmounts = watchedLines.some(
      (l) => toScaledInt(l?.debit) > 0n || toScaledInt(l?.credit) > 0n,
    )
    if (!hasAnyAmounts) {
      reset({
        voucherDate: '2026-11-27',
        voucherNo: '',
        referenceNo: '',
        narration: '',
        lines: [
          { accountCode: drCode, debit: '', credit: '' },
          { accountCode: crCode, debit: '', credit: '' },
        ],
      })
    }
    // Intentionally triggers on drawer open, voucherType switch, or initial ledgers load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voucherType, ledgers.length])

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

  const onSubmit = async (data: QuickVoucherOutput) => {
    setServerError(null)
    try {
      const created = await createVoucher.mutateAsync({
        voucher_type: voucherType,
        voucher_date: data.voucherDate,
        voucher_number: data.voucherNo?.trim() || null,
        reference_no: data.referenceNo?.trim() || null,
        narration: data.narration,
        status: 'POSTED',
        lines: data.lines.map((ln) => ({
          account_code: ln.accountCode,
          debit_amount: fromScaledInt(toScaledInt(ln.debit), 4),
          credit_amount: fromScaledInt(toScaledInt(ln.credit), 4),
        })),
      })
      reset({
        voucherDate: '2026-11-27',
        voucherNo: '',
        referenceNo: '',
        narration: '',
        lines: [
          { accountCode: meta.defaultDebitCode, debit: '', credit: '' },
          { accountCode: meta.defaultCreditCode, debit: '', credit: '' },
        ],
      })
      onVoucherPosted(created)
      onClose()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to post voucher.')
    }
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
      subtitle="Live FastAPI double-entry posting · Switch type with F4–F9 or Alt+4–9"
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
                <Kbd variant={active ? 'on-accent' : 'default'} revealOnHover>
                  {item.shortKey}
                </Kbd>
              </button>
            )
          })}
        </div>
      }
      footer={
        <div className="space-y-3">
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={QUICK_VOUCHER_FORM_ID}
              variant="primary"
              loading={createVoucher.isPending}
              disabled={!isBalanced || ledgersQuery.isLoading}
              title={saveDisabledReason}
              shortcut="Ctrl+Enter"
              revealShortcutOnHover
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
        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3.5 py-2.5 text-[13px] font-medium text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Input
            label="Voucher Date"
            type="date"
            error={errors.voucherDate?.message}
            {...register('voucherDate')}
          />
          <Input
            label="Voucher # (Optional)"
            placeholder="Auto-generated"
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

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="type-h3">Ledger Entries (Dr / Cr)</h3>
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
                      disabled={ledgersQuery.isLoading}
                      aria-invalid={lineErr?.accountCode ? true : undefined}
                      {...register(`lines.${index}.accountCode`)}
                      className={cn(
                        'h-[var(--control-h)] w-full rounded-sm border bg-surface px-2.5 text-[13px] text-primary-text',
                        lineErr?.accountCode ? 'border-danger' : 'border-border-input',
                      )}
                    >
                      <option value="">
                        {ledgersQuery.isLoading ? 'Loading ledgers...' : 'Select ledger...'}
                      </option>
                      {ledgers.map((ledger) => (
                        <option key={ledger.id} value={ledger.code}>
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
              className="flex items-center gap-1.5 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3 py-2 text-[12px] font-medium text-danger"
            >
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{errors.lines.root.message}</span>
            </p>
          ) : null}
        </div>

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

### File: `frontend/src/features/dashboard/FinancialCommandPage.tsx`

```tsx
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Info,
  Landmark,
  Printer,
  RefreshCw,
  RotateCcw,
  Rows3,
  Rows4,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ApiVoucherStatus, ApiVoucherType, DrCr, VoucherDTO } from '../../lib/api'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
  formatShortDate,
  parseDateBlock,
  splitCurrencyParts,
} from '../../lib/format'
import { COMPLIANCE_SNAPSHOT, type VoucherType } from '../../lib/dummyData'
import {
  useCancelVoucher,
  useDashboardKPIs,
  useDayBook,
} from '../../hooks/useAccounting'
import { Badge, StatusIndicator, type BadgeVariant } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
  type TableDensity,
} from '../../components/ui/DataTable'

export interface FinancialCommandPageProps {
  selectedVoucherId: number | null
  onSelectVoucher: (voucher: VoucherDTO | null) => void
  onOpenVoucher: (type: VoucherType) => void
  onOpenLedgerStatement: (ledgerId: number) => void
  onNavigateReport: (navId: string) => void
  onNotify: (message: string) => void
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

function getStatusVariant(status: ApiVoucherStatus): BadgeVariant {
  if (status === 'POSTED') return 'success'
  if (status === 'DRAFT') return 'warning'
  return 'neutral'
}

function getRegisterDisplaySides(v: VoucherDTO): { debit: string; credit: string } {
  if (v.voucher_type === 'PURCHASE' || v.voucher_type === 'PAYMENT') {
    return { debit: '0.0000', credit: v.total_credit }
  }
  if (v.voucher_type === 'SALES' || v.voucher_type === 'RECEIPT') {
    return { debit: v.total_debit, credit: '0.0000' }
  }
  return { debit: v.total_debit, credit: v.total_credit }
}

function KpiHeroAmount({ value, side }: { value: string; side: DrCr }) {
  const parts = splitCurrencyParts(value, 'INR')
  const sideLabel = side === 'DR' ? 'Dr' : 'Cr'
  return (
    <p className="mt-2 type-kpi leading-[1.15]">
      {parts.isNegative ? <span className="mr-0.5">&#x2212;</span> : null}
      <span className="text-[0.6em] font-medium text-muted-text">{parts.symbol}</span>
      <span>{parts.integer}</span>
      <span className="text-[0.6em] font-medium text-muted-text">{parts.fraction}</span>
      <span className="ml-1 text-[12.5px] font-medium tracking-normal text-muted-text">
        {sideLabel}
      </span>
    </p>
  )
}

export function FinancialCommandPage({
  selectedVoucherId,
  onSelectVoucher,
  onOpenVoucher,
  onOpenLedgerStatement,
  onNavigateReport,
  onNotify,
}: FinancialCommandPageProps) {
  const [activeFilter, setActiveFilter] = useState<VoucherFilter>('ALL')
  const [density, setDensity] = useState<TableDensity>('comfortable')

  const kpisQuery = useDashboardKPIs()
  const dayBookQuery = useDayBook()
  const cancelVoucher = useCancelVoucher()

  const allVouchers = useMemo(
    () => dayBookQuery.data?.vouchers ?? [],
    [dayBookQuery.data],
  )

  const filteredVouchers = useMemo(() => {
    if (activeFilter === 'ALL') return allVouchers
    return allVouchers.filter((v) => v.voucher_type === (activeFilter as ApiVoucherType))
  }, [allVouchers, activeFilter])

  const selectedVoucher = useMemo(
    () => allVouchers.find((v) => v.id === selectedVoucherId) ?? null,
    [allVouchers, selectedVoucherId],
  )

  const handleVoucherAction = async (voucher: VoucherDTO, createReversal: boolean) => {
    try {
      const res = await cancelVoucher.mutateAsync({
        voucherId: voucher.id,
        createReversal,
        reason: createReversal
          ? 'Mirror reversal posted from Financial Command Center'
          : 'Cancelled from Financial Command Center',
      })
      if (res.action === 'REVERSED' && res.reversal_voucher) {
        onNotify(
          `Posted reversal ${res.reversal_voucher.voucher_number} for ${voucher.voucher_number}`,
        )
      } else {
        onNotify(`Cancelled ${voucher.voucher_number} (preserved for audit trail)`)
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update voucher status')
    }
  }

  const columns = useMemo<DataTableColumnDef<VoucherDTO>[]>(
    () => [
      {
        accessorKey: 'voucher_date',
        header: 'Date',
        meta: { align: 'left', width: '76px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              title={formatDisplayDate(row.original.voucher_date)}
              className={cn(
                'code-mono text-[13px] text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatShortDate(row.original.voucher_date)}
            </span>
          )
        },
      },
      {
        accessorKey: 'voucher_number',
        header: 'Voucher No.',
        meta: { align: 'left', mono: true, width: '148px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 code-mono text-[13px] font-medium text-muted-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-text/60" aria-hidden="true" />
              <span>{row.original.voucher_number}</span>
            </span>
          )
        },
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const v = row.original
          const cancelled = v.status === 'CANCELLED'
          return (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p
                  title={v.particulars}
                  className={cn(
                    'truncate text-[14px] font-medium leading-snug text-primary-text',
                    cancelled && 'line-through text-disabled-text',
                  )}
                >
                  {v.particulars}
                </p>
                {v.status !== 'POSTED' ? (
                  <StatusIndicator variant={getStatusVariant(v.status)} className="shrink-0">
                    {v.status === 'CANCELLED' ? 'Cancelled' : 'Draft'}
                  </StatusIndicator>
                ) : v.reversed_voucher_id ? (
                  <StatusIndicator variant="accent" className="shrink-0">
                    Reversal
                  </StatusIndicator>
                ) : null}
              </div>
              {density === 'comfortable' ? (
                <p
                  title={v.narration}
                  className="mt-0.5 truncate text-[12.5px] font-normal leading-tight text-muted-text"
                >
                  {v.narration}
                </p>
              ) : null}
            </div>
          )
        },
      },
      {
        id: 'register_debit',
        header: 'Debit (₹)',
        accessorFn: (row) => getRegisterDisplaySides(row).debit,
        meta: { align: 'right', mono: true, width: '124px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          const formatted = formatBookAmountCell(
            getRegisterDisplaySides(row.original).debit,
            'INR',
          )
          return (
            <span
              aria-label={formatted.isNil ? 'nil' : `${formatted.text} rupees debit`}
              className={cn(
                'code-mono text-[14px] font-medium',
                formatted.isNil ? 'text-muted-text' : 'text-primary-text',
                cancelled && !formatted.isNil && 'line-through text-disabled-text',
              )}
            >
              {formatted.text}
            </span>
          )
        },
      },
      {
        id: 'register_credit',
        header: 'Credit (₹)',
        accessorFn: (row) => getRegisterDisplaySides(row).credit,
        meta: {
          align: 'right',
          mono: true,
          width: '124px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          const formatted = formatBookAmountCell(
            getRegisterDisplaySides(row.original).credit,
            'INR',
          )
          return (
            <span
              aria-label={formatted.isNil ? 'nil' : `${formatted.text} rupees credit`}
              className={cn(
                'code-mono text-[14px] font-medium',
                formatted.isNil ? 'text-muted-text' : 'text-primary-text',
                cancelled && !formatted.isNil && 'line-through text-disabled-text',
              )}
            >
              {formatted.text}
            </span>
          )
        },
      },
    ],
    [density],
  )

  const kpis = kpisQuery.data
  const postedFilteredCount = filteredVouchers.filter((v) => v.status === 'POSTED').length
  const excludedCount = filteredVouchers.length - postedFilteredCount

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-text">
            <span>{kpis?.fiscal_year_label ?? 'FY 2026-27'}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  kpis?.trial_balance_balanced === false ? 'bg-danger' : 'bg-success',
                )}
                aria-hidden="true"
              />
              <span>
                {kpis
                  ? kpis.trial_balance_balanced
                    ? 'Books Balanced · SQLite WAL'
                    : 'Trial Balance Variance'
                  : 'Connecting to FastAPI...'}
              </span>
            </span>
          </div>
          <h1 className="mt-1 type-h1">Financial Command Center</h1>
        </div>

        <div className="hidden md:flex items-center gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={() => onNavigateReport('trial-balance')}>
            Trial Balance
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigateReport('profit-loss')}>
            P&amp;L
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigateReport('balance-sheet')}>
            Balance Sheet
          </Button>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print A4"
            title="Print A4 Statement"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border-input bg-surface text-muted-text hover:bg-muted hover:text-primary-text transition-colors duration-[var(--dur-fast)] cursor-pointer"
          >
            <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* KPI Error Banner */}
      {kpisQuery.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>
              Could not load live KPIs from FastAPI ({kpisQuery.error.message}). Ensure{' '}
              <code className="code-mono">uvicorn app.main:app --reload</code> is running on port 8000.
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => kpisQuery.refetch()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {/* Mobile KPI Card */}
      <section aria-label="Key Financial Position" className="md:hidden">
        <Card padding="sm" loading={kpisQuery.isLoading}>
          {kpis ? (
            <>
              <div className="pb-3">
                <p className="type-xs uppercase text-muted-text">Cash &amp; Bank Balance</p>
                <KpiHeroAmount
                  value={kpis.cash_and_bank_balance}
                  side={kpis.cash_and_bank_dr_cr}
                />
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-success">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  <span>{kpis.posted_vouchers} posted vouchers active</span>
                </p>
              </div>
              <div className="divide-y divide-border-row border-t border-border-row">
                <div className="flex h-11 items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-muted-text">Sundry Debtors</span>
                  <span className="code-mono text-[16px] font-semibold text-primary-text">
                    {formatCurrency(kpis.sundry_debtors)}
                    <span className="ml-1 text-[11px] font-medium text-muted-text">
                      {kpis.sundry_debtors_dr_cr === 'DR' ? 'Dr' : 'Cr'}
                    </span>
                  </span>
                </div>
                <div className="flex h-11 items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-muted-text">Sundry Creditors</span>
                  <span className="code-mono text-[16px] font-semibold text-primary-text">
                    {formatCurrency(kpis.sundry_creditors)}
                    <span className="ml-1 text-[11px] font-medium text-muted-text">
                      {kpis.sundry_creditors_dr_cr === 'DR' ? 'Dr' : 'Cr'}
                    </span>
                  </span>
                </div>
                <div className="flex h-11 items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-muted-text">Net GST / Duties</span>
                  <span className="code-mono text-[16px] font-semibold text-primary-text">
                    {formatCurrency(kpis.net_gst_position)}
                    <span className="ml-1 text-[11px] font-medium text-muted-text">
                      {kpis.net_gst_dr_cr === 'DR' ? 'Dr' : 'Cr'}
                    </span>
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      </section>

      {/* Desktop Unified 4-Cell Live KPI Strip */}
      <section aria-label="Key Financial Balances" className="hidden md:block">
        {kpisQuery.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={`kpi-skel-${i}`} loading />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 rounded-md border border-border-subtle bg-surface shadow-[var(--shadow-card)]">
            <div className="px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                Cash &amp; Bank Balance
              </p>
              <KpiHeroAmount
                value={kpis.cash_and_bank_balance}
                side={kpis.cash_and_bank_dr_cr}
              />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-success">
                <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                <span>Live from Cash + Bank ledgers</span>
              </p>
            </div>

            <div className="border-l border-border-subtle px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                Sundry Debtors (Receivables)
              </p>
              <KpiHeroAmount value={kpis.sundry_debtors} side={kpis.sundry_debtors_dr_cr} />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-muted-text">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>Customer balances outstanding</span>
              </p>
            </div>

            <div className="border-t border-border-subtle lg:border-t-0 lg:border-l px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                Sundry Creditors (Payables)
              </p>
              <KpiHeroAmount value={kpis.sundry_creditors} side={kpis.sundry_creditors_dr_cr} />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-muted-text">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {kpis.posted_vouchers} posted · {kpis.cancelled_vouchers} cancelled
                </span>
              </p>
            </div>

            <div className="border-t border-l border-border-subtle lg:border-t-0 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                Duties &amp; Taxes / Net GST
              </p>
              <KpiHeroAmount value={kpis.net_gst_position} side={kpis.net_gst_dr_cr} />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {kpis.net_gst_dr_cr === 'DR' ? 'Net ITC Credit Surplus' : 'Net GST Payable'}
                </span>
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* Main Split: Day Book + Compliance Rail */}
      <section className="grid grid-cols-1 gap-4 md:gap-6 min-[1400px]:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="space-y-4 min-w-0">
          <Card padding="none">
            <CardHeader>
              <div>
                <CardTitle>Recent Vouchers &amp; Day Book</CardTitle>
                <p className="mt-0.5 text-[12.5px] font-medium text-muted-text">
                  <span className="desktop-only-hint">
                    Click any row or use ↑ ↓ + Enter to inspect double-entry legs.
                  </span>
                  <span className="touch-only-hint">Tap a voucher to see its entries.</span>
                </p>
              </div>

              <div className="desktop-only-hint hidden md:inline-flex items-center gap-0.5 rounded-md border border-border-input bg-muted p-[3px] print:hidden">
                <button
                  type="button"
                  onClick={() => setDensity('comfortable')}
                  aria-pressed={density === 'comfortable'}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                    density === 'comfortable'
                      ? 'bg-surface font-semibold text-primary-text shadow-sm'
                      : 'font-medium text-muted-text hover:text-primary-text',
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
                    'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                    density === 'compact'
                      ? 'bg-surface font-semibold text-primary-text shadow-sm'
                      : 'font-medium text-muted-text hover:text-primary-text',
                  )}
                >
                  <Rows4 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Tally</span>
                </button>
              </div>
            </CardHeader>

            {/* Filter Pills */}
            <div className="px-4 py-2.5 md:px-5 md:py-3 print:hidden">
              <div className="no-scrollbar flex flex-nowrap md:inline-flex items-center gap-1 overflow-x-auto snap-x rounded-md border border-border-input bg-muted p-[3px]">
                {FILTER_PILLS.map((pill) => {
                  const active = pill.id === activeFilter
                  const count =
                    pill.id === 'ALL'
                      ? allVouchers.length
                      : allVouchers.filter((v) => v.voucher_type === pill.id).length

                  return (
                    <button
                      key={pill.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setActiveFilter(pill.id)}
                      className={cn(
                        'inline-flex h-9 md:h-8 shrink-0 snap-start items-center gap-1.5 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                        active
                          ? 'bg-surface font-semibold text-primary-text shadow-sm'
                          : 'font-medium text-muted-text hover:text-primary-text',
                      )}
                    >
                      <span>{pill.label}</span>
                      <span className="code-mono text-[11px] font-medium text-muted-text">
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Mobile Card-List Day Book */}
            <div className="md:hidden border-t border-border-row">
              {dayBookQuery.isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`mob-skel-${i}`} className="h-14 rounded-sm bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredVouchers.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[14px] font-semibold text-primary-text">No matching vouchers</p>
                  <p className="mt-1 text-[13px] text-muted-text">
                    Clear your filter or post a balanced voucher.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border-row">
                  {filteredVouchers.map((v) => {
                    const cancelled = v.status === 'CANCELLED'
                    const isSelected = v.id === selectedVoucherId
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => onSelectVoucher(isSelected ? null : v)}
                          className={cn(
                            'flex min-h-[64px] w-full flex-col justify-center gap-1 px-4 py-3 text-left transition-colors duration-[var(--dur-fast)] cursor-pointer',
                            isSelected
                              ? 'bg-row-selected shadow-[inset_2px_0_0_0_var(--accent-primary)]'
                              : 'bg-surface active:bg-row-hover',
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span
                              className={cn(
                                'truncate text-[15px] font-medium text-primary-text',
                                cancelled && 'line-through text-disabled-text',
                              )}
                            >
                              {v.particulars}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 code-mono text-[15px] font-semibold text-primary-text',
                                cancelled && 'line-through text-disabled-text',
                              )}
                            >
                              {formatCurrency(v.total_debit, { currency: 'INR', showSymbol: false })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="code-mono text-[12.5px] text-muted-text">
                              {v.voucher_number} · {formatShortDate(v.voucher_date)}
                            </span>
                            <StatusIndicator variant={getStatusVariant(v.status)}>
                              {v.status}
                            </StatusIndicator>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Desktop 5-Column Live Table */}
            <div className="hidden md:block">
              <DataTable
                ariaLabel="Recent Vouchers and Day Book"
                data={filteredVouchers}
                columns={columns}
                density={density}
                loading={dayBookQuery.isLoading}
                error={dayBookQuery.isError ? dayBookQuery.error.message : null}
                onRetry={() => dayBookQuery.refetch()}
                selectedRowId={selectedVoucherId !== null ? String(selectedVoucherId) : null}
                getRowId={(row) => String(row.id)}
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
                      colSpan={3}
                      className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-semibold text-primary-text"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span>Posted Register ({postedFilteredCount} active)</span>
                        {excludedCount > 0 ? (
                          <span
                            title={`${excludedCount} cancelled or draft vouchers excluded from posted totals`}
                            className="inline-flex items-center text-muted-text cursor-help"
                          >
                            <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="grand-total-num-cell px-3 py-2.5 text-right code-mono text-[14px] font-semibold text-primary-text pr-4">
                      {formatCurrency(dayBookQuery.data?.posted_total_debit ?? '0.0000', {
                        currency: 'INR',
                        showSymbol: false,
                      })}
                    </td>
                    <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 text-right code-mono text-[14px] font-semibold text-primary-text pr-4">
                      {formatCurrency(dayBookQuery.data?.posted_total_credit ?? '0.0000', {
                        currency: 'INR',
                        showSymbol: false,
                      })}
                    </td>
                  </tr>
                }
              />
            </div>
          </Card>

          {/* Inline Double-Entry Leg Inspector with Cancel / Reversal Controls */}
          {selectedVoucher ? (
            <Card padding="none">
              <CardHeader className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <h3 className="type-h3">
                    Voucher Drill-Down:{' '}
                    <span className="code-mono">{selectedVoucher.voucher_number}</span>
                  </h3>
                  <StatusIndicator variant={getStatusVariant(selectedVoucher.status)}>
                    {selectedVoucher.status}
                  </StatusIndicator>
                </div>

                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  {selectedVoucher.status === 'POSTED' && !selectedVoucher.reversed_voucher_id ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={cancelVoucher.isPending}
                        leftIcon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                        onClick={() => handleVoucherAction(selectedVoucher, true)}
                      >
                        Post Reversal
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={cancelVoucher.isPending}
                        leftIcon={<Ban className="h-3.5 w-3.5" strokeWidth={1.75} />}
                        onClick={() => handleVoucherAction(selectedVoucher, false)}
                      >
                        Cancel Voucher
                      </Button>
                    </>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => onSelectVoucher(null)}>
                    Close
                  </Button>
                </div>
              </CardHeader>

              <div className="px-4 py-3.5 md:px-5 space-y-3">
                <p className="text-[13px] text-muted-text">
                  <span className="font-semibold text-primary-text">Narration: </span>
                  {selectedVoucher.narration || '—'}
                </p>

                <div className="table-scroll rounded-md border border-border-subtle">
                  <table className="w-full min-w-[460px] border-collapse text-[13px]">
                    <thead className="bg-table-header">
                      <tr className="h-9 border-b border-border-row text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Ledger Account (Click for Statement)</th>
                        <th className="px-3 py-2 pr-4 text-right">Debit (₹)</th>
                        <th className="border-l border-border-row px-3 py-2 pr-4 text-right">
                          Credit (₹)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVoucher.lines.map((line) => {
                        const dr = formatBookAmountCell(line.debit_amount, 'INR')
                        const cr = formatBookAmountCell(line.credit_amount, 'INR')
                        return (
                          <tr
                            key={line.id}
                            className="border-b border-border-row last:border-b-0 hover:bg-row-hover"
                          >
                            <td className="px-3 py-2 code-mono text-muted-text">
                              {line.ledger_code}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => onOpenLedgerStatement(line.ledger_id)}
                                className="font-medium text-accent hover:underline text-left cursor-pointer"
                              >
                                {line.ledger_name}
                              </button>
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 pr-4 text-right code-mono',
                                dr.isNil ? 'text-muted-text' : 'text-primary-text',
                              )}
                            >
                              {dr.text}
                            </td>
                            <td
                              className={cn(
                                'border-l border-border-row px-3 py-2 pr-4 text-right code-mono',
                                cr.isNil ? 'text-muted-text' : 'text-primary-text',
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

        {/* Right Rail: Compliance & Reconciliation Preview (Wired in M4/M5) */}
        <aside className="space-y-4 min-w-0">
          <Card>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-row">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="type-h3">Bank Reconciliation (BRS)</h2>
              </div>
              <Badge variant="warning">M4 Preview</Badge>
            </div>
            <div className="divide-y divide-border-row">
              <div className="flex items-baseline justify-between gap-2 py-2.5">
                <span className="text-[14px] font-semibold text-primary-text">
                  {COMPLIANCE_SNAPSHOT.unreconciledBankLines} unreconciled
                </span>
                <span className="code-mono text-[14px] font-medium text-primary-text">
                  {formatCurrency(COMPLIANCE_SNAPSHOT.unreconciledNetVariance, {
                    currency: 'INR',
                    negativeStyle: 'parens',
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2.5 text-[12.5px]">
                <span className="text-muted-text">Account</span>
                <span className="font-medium text-primary-text truncate">
                  {COMPLIANCE_SNAPSHOT.bankAccountLabel}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-success" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="type-h3">GSTR-2B &amp; IMS Match</h2>
              </div>
              <span className="code-mono text-[14px] font-bold text-success">
                {COMPLIANCE_SNAPSHOT.gstr2bMatchPercent.toFixed(1)}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="GSTR-2B ITC Reconciliation Match Percentage"
              aria-valuenow={COMPLIANCE_SNAPSHOT.gstr2bMatchPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${COMPLIANCE_SNAPSHOT.gstr2bMatchPercent}%` }}
              />
            </div>
            <p className="mt-3 text-[12.5px] font-medium text-muted-text">
              <span className="code-mono font-semibold text-primary-text">
                {COMPLIANCE_SNAPSHOT.gstr2bMatchedCount}/{COMPLIANCE_SNAPSHOT.gstr2bTotalCount}
              </span>{' '}
              matched · Scheduled for M5 GST Suite
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 pb-2 border-b border-border-row">
              <CalendarClock className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden="true" />
              <h2 className="type-h3">Statutory Compliance Calendar</h2>
            </div>
            <ul className="divide-y divide-border-row">
              {COMPLIANCE_SNAPSHOT.dueDates.map((item) => {
                const block = parseDateBlock(item.dueDate)
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex w-10 shrink-0 flex-col items-center justify-center rounded-sm bg-muted py-1">
                        <span className="code-mono text-[15px] font-bold leading-none text-primary-text">
                          {block.day}
                        </span>
                        <span className="mt-0.5 text-[11px] font-semibold leading-none tracking-[0.04em] text-muted-text">
                          {block.month}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-primary-text">
                          {item.filing}
                        </p>
                        <p className="text-[11.5px] text-muted-text">{item.period}</p>
                      </div>
                    </div>
                    {item.urgentPill ? (
                      <Badge variant={item.status} icon={false}>
                        {item.statusText}
                      </Badge>
                    ) : (
                      <StatusIndicator variant={item.status}>{item.statusText}</StatusIndicator>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        </aside>
      </section>
    </div>
  )
}

```

---

## 10. Phase H — Live Accounting Views (Chart of Accounts & Day Book)

### File: `frontend/src/features/accounting/ChartOfAccountsView.tsx`

```tsx
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Plus, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { DECIMAL_INPUT_REGEX, fromScaledInt, toScaledInt } from '../../lib/decimal'
import { formatCurrency } from '../../lib/format'
import type { AccountNature, DrCr, LedgerDTO } from '../../lib/api'
import {
  useAccountGroups,
  useCreateLedger,
  useLedgers,
} from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { Input } from '../../components/ui/Input'

const newLedgerSchema = z.object({
  group_id: z.string().min(1, 'Select an account group'),
  code: z.string().trim().min(1, 'Ledger code is required').max(32),
  name: z.string().trim().min(1, 'Ledger name is required').max(160),
  opening_balance: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || DECIMAL_INPUT_REGEX.test(v),
      'Enter valid non-negative amount (max 4 decimals)',
    ),
  opening_dr_cr: z.enum(['DR', 'CR']),
  party_gstin: z.string().trim().max(32).optional(),
  party_state_code: z.string().trim().max(8).optional(),
  credit_days: z.string().trim().optional(),
})

type NewLedgerFormInput = z.input<typeof newLedgerSchema>
type NewLedgerFormOutput = z.output<typeof newLedgerSchema>

const NATURE_TABS: Array<{ id: 'ALL' | AccountNature; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'ASSET', label: 'Assets' },
  { id: 'LIABILITY', label: 'Liabilities' },
  { id: 'EQUITY', label: 'Equity' },
  { id: 'INCOME', label: 'Income' },
  { id: 'EXPENSE', label: 'Expenses' },
]

export interface ChartOfAccountsViewProps {
  onOpenLedgerStatement: (ledgerId: number) => void
  onNotify: (message: string) => void
}

export function ChartOfAccountsView({
  onOpenLedgerStatement,
  onNotify,
}: ChartOfAccountsViewProps) {
  const [natureFilter, setNatureFilter] = useState<'ALL' | AccountNature>('ALL')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [searchText, setSearchText] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const groupsQuery = useAccountGroups()
  const ledgersQuery = useLedgers({
    nature: natureFilter === 'ALL' ? undefined : natureFilter,
    group_id: groupFilter ? Number(groupFilter) : undefined,
    search: searchText.trim() || undefined,
  })
  const createLedger = useCreateLedger()

  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data])
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewLedgerFormInput, unknown, NewLedgerFormOutput>({
    resolver: zodResolver(newLedgerSchema),
    defaultValues: {
      group_id: '',
      code: '',
      name: '',
      opening_balance: '0.00',
      opening_dr_cr: 'DR',
      party_gstin: '',
      party_state_code: '',
      credit_days: '0',
    },
  })

  const onSubmitNewLedger = async (data: NewLedgerFormOutput) => {
    setServerError(null)
    try {
      const created = await createLedger.mutateAsync({
        group_id: Number(data.group_id),
        code: data.code,
        name: data.name,
        opening_balance: fromScaledInt(toScaledInt(data.opening_balance), 4),
        opening_dr_cr: data.opening_dr_cr as DrCr,
        party_gstin: data.party_gstin || null,
        party_state_code: data.party_state_code || null,
        credit_days: Math.max(0, Number.parseInt(data.credit_days || '0', 10) || 0),
      })
      onNotify(`Created ledger ${created.code} · ${created.name}`)
      reset()
      setDrawerOpen(false)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create ledger.')
    }
  }

  const columns = useMemo<DataTableColumnDef<LedgerDTO>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        meta: { align: 'left', mono: true, width: '96px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-medium text-muted-text">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Ledger Name',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-accent">
              {row.original.name}
            </p>
            {row.original.party_gstin ? (
              <p className="mt-0.5 code-mono text-[11.5px] text-muted-text">
                GSTIN: {row.original.party_gstin}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'group_name',
        header: 'Account Group',
        meta: { align: 'left', width: '180px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="text-[13px] text-primary-text">{row.original.group_name}</span>
        ),
      },
      {
        accessorKey: 'group_nature',
        header: 'Nature',
        meta: { align: 'left', width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <Badge variant="neutral" icon={false}>
            {row.original.group_nature}
          </Badge>
        ),
      },
      {
        accessorKey: 'opening_balance',
        header: 'Opening (₹)',
        meta: { align: 'right', mono: true, width: '148px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const isZero = toScaledInt(row.original.opening_balance) === 0n
          return isZero ? (
            <span className="code-mono text-disabled-text">—</span>
          ) : (
            <span className="code-mono text-[13.5px] text-primary-text">
              {formatCurrency(row.original.opening_balance, { showSymbol: false })}
              <span className="ml-1 text-[11px] text-muted-text">
                {row.original.opening_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </span>
          )
        },
      },
      {
        accessorKey: 'closing_balance',
        header: 'Closing (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '156px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const isZero = toScaledInt(row.original.closing_balance) === 0n
          return isZero ? (
            <span className="code-mono text-disabled-text">0.00</span>
          ) : (
            <span className="code-mono text-[14px] font-semibold text-primary-text">
              {formatCurrency(row.original.closing_balance, { showSymbol: false })}
              <span className="ml-1 text-[11px] font-medium text-muted-text">
                {row.original.closing_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </span>
          )
        },
      },
    ],
    [],
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            {groups.length} Tally Account Groups · {ledgers.length} Active Ledgers
          </p>
          <h1 className="mt-1 type-h1">Chart of Accounts</h1>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" strokeWidth={2} />}
          onClick={() => {
            setServerError(null)
            setDrawerOpen(true)
          }}
        >
          New Ledger
        </Button>
      </div>

      <Card padding="none">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-md border border-border-input bg-muted p-[3px]">
              {NATURE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={natureFilter === tab.id}
                  onClick={() => setNatureFilter(tab.id)}
                  className={cn(
                    'h-8 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                    natureFilter === tab.id
                      ? 'bg-surface font-semibold text-primary-text shadow-sm'
                      : 'font-medium text-muted-text hover:text-primary-text',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by account group"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 text-[13px] text-primary-text"
            >
              <option value="">All 28 Account Groups</option>
              {groups.map((grp) => (
                <option key={grp.id} value={grp.id}>
                  {grp.name} ({grp.ledger_count})
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-text"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search code, ledger, group..."
              aria-label="Search ledgers"
              className="h-9 w-full rounded-sm border border-border-input bg-surface pl-9 pr-3 text-[13px] text-primary-text placeholder:text-disabled-text"
            />
          </div>
        </CardHeader>

        <DataTable
          ariaLabel="Chart of Accounts Ledgers"
          data={ledgers}
          columns={columns}
          loading={ledgersQuery.isLoading}
          error={ledgersQuery.isError ? ledgersQuery.error.message : null}
          onRetry={() => ledgersQuery.refetch()}
          getRowId={(r) => String(r.id)}
          onRowActivate={(r) => onOpenLedgerStatement(r.id)}
          emptyTitle="No matching ledgers"
          emptyDescription="Adjust your group/nature filter or add a new ledger account."
          emptyAction={
            <Button variant="primary" onClick={() => setDrawerOpen(true)}>
              New Ledger
            </Button>
          }
        />
      </Card>

      {/* + New Ledger Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create Ledger Account"
        subtitle="Assign to one of the 28 standard Tally Account Groups"
        widthClassName="w-full sm:max-w-[540px]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-ledger-form"
              variant="primary"
              loading={createLedger.isPending}
            >
              Create Ledger
            </Button>
          </div>
        }
      >
        <form
          id="new-ledger-form"
          onSubmit={handleSubmit(onSubmitNewLedger)}
          className="space-y-4"
          noValidate
        >
          {serverError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3.5 py-2.5 text-[13px] font-medium text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{serverError}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-ledger-group"
              className="text-[13px] font-medium text-primary-text"
            >
              Under Account Group
            </label>
            <select
              id="new-ledger-group"
              {...register('group_id')}
              className={cn(
                'h-[var(--control-h)] w-full rounded-sm border bg-surface px-3 text-[14px] text-primary-text',
                errors.group_id ? 'border-danger' : 'border-border-input',
              )}
            >
              <option value="">Select Account Group...</option>
              {groups.map((grp) => (
                <option key={grp.id} value={grp.id}>
                  {grp.name} ({grp.nature})
                </option>
              ))}
            </select>
            {errors.group_id ? (
              <p className="text-[12px] font-medium text-danger">{errors.group_id.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Input
              label="Account Code"
              placeholder="e.g. 5210"
              className="tabular-mono"
              error={errors.code?.message}
              {...register('code')}
            />
            <Input
              wrapperClassName="sm:col-span-2"
              label="Ledger Name"
              placeholder="e.g. Travelling & Conveyance"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Input
              wrapperClassName="sm:col-span-2"
              label="Opening Balance (₹)"
              placeholder="0.00"
              inputMode="decimal"
              numeric
              error={errors.opening_balance?.message}
              {...register('opening_balance')}
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-ledger-drcr"
                className="text-[13px] font-medium text-primary-text"
              >
                Dr / Cr
              </label>
              <select
                id="new-ledger-drcr"
                {...register('opening_dr_cr')}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[14px] text-primary-text"
              >
                <option value="DR">Dr (Debit)</option>
                <option value="CR">Cr (Credit)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Input
              wrapperClassName="sm:col-span-2"
              label="Party GSTIN (Optional)"
              placeholder="15-char GSTIN"
              className="tabular-mono"
              {...register('party_gstin')}
            />
            <Input
              label="State Code"
              placeholder="09"
              className="tabular-mono"
              {...register('party_state_code')}
            />
          </div>

          <Input
            label="Default Credit Days"
            type="number"
            min={0}
            className="tabular-mono"
            {...register('credit_days')}
          />
        </form>
      </Drawer>
    </div>
  )
}

```

---

### File: `frontend/src/features/accounting/DayBookView.tsx`

```tsx
import { useMemo, useState } from 'react'
import { Ban, FileSpreadsheet, Printer, RotateCcw, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ApiVoucherStatus, ApiVoucherType, VoucherDTO } from '../../lib/api'
import type { VoucherType } from '../../lib/dummyData'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
} from '../../lib/format'
import { useCancelVoucher, useDayBook } from '../../hooks/useAccounting'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'
import { StatusIndicator } from '../../components/ui/Badge'

export interface DayBookViewProps {
  onOpenVoucher: (type: VoucherType) => void
  onOpenLedgerStatement: (ledgerId: number) => void
  onNotify: (message: string) => void
}

export function DayBookView({
  onOpenVoucher,
  onOpenLedgerStatement,
  onNotify,
}: DayBookViewProps) {
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')
  const [voucherType, setVoucherType] = useState<'' | ApiVoucherType>('')
  const [statusFilter, setStatusFilter] = useState<'' | ApiVoucherStatus>('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const dayBookQuery = useDayBook({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    voucher_type: voucherType || undefined,
    status: statusFilter || undefined,
    search: search.trim() || undefined,
  })
  const cancelVoucher = useCancelVoucher()

  const vouchers = useMemo(() => dayBookQuery.data?.vouchers ?? [], [dayBookQuery.data])
  const selectedVoucher = useMemo(
    () => vouchers.find((v) => v.id === selectedId) ?? null,
    [vouchers, selectedId],
  )

  const handleAction = async (voucher: VoucherDTO, createReversal: boolean) => {
    try {
      const res = await cancelVoucher.mutateAsync({
        voucherId: voucher.id,
        createReversal,
      })
      onNotify(
        res.action === 'REVERSED' && res.reversal_voucher
          ? `Posted reversal ${res.reversal_voucher.voucher_number}`
          : `Cancelled ${voucher.voucher_number}`,
      )
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const columns = useMemo<DataTableColumnDef<VoucherDTO>[]>(
    () => [
      {
        accessorKey: 'voucher_date',
        header: 'Date',
        meta: { align: 'left', mono: true, width: '116px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span
            className={cn(
              'code-mono text-[13px] text-muted-text',
              row.original.status === 'CANCELLED' && 'line-through text-disabled-text',
            )}
          >
            {formatDisplayDate(row.original.voucher_date)}
          </span>
        ),
      },
      {
        accessorKey: 'voucher_number',
        header: 'Voucher No.',
        meta: { align: 'left', mono: true, width: '150px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span
            className={cn(
              'code-mono text-[13px] font-medium text-primary-text',
              row.original.status === 'CANCELLED' && 'line-through text-disabled-text',
            )}
          >
            {row.original.voucher_number}
          </span>
        ),
      },
      {
        accessorKey: 'voucher_type',
        header: 'Type',
        meta: { align: 'left', width: '104px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12px] font-medium text-muted-text">
            {row.original.voucher_type}
          </span>
        ),
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars & Narration',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    'truncate text-[14px] font-medium text-primary-text',
                    cancelled && 'line-through text-disabled-text',
                  )}
                >
                  {row.original.particulars}
                </p>
                {row.original.status !== 'POSTED' ? (
                  <StatusIndicator variant="neutral">{row.original.status}</StatusIndicator>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[12px] text-muted-text">
                {row.original.narration}
              </p>
            </div>
          )
        },
      },
      {
        accessorKey: 'total_debit',
        header: 'Debit (₹)',
        meta: { align: 'right', mono: true, width: '132px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-medium text-primary-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatCurrency(row.original.total_debit, { showSymbol: false })}
            </span>
          )
        },
      },
      {
        accessorKey: 'total_credit',
        header: 'Credit (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '132px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cancelled = row.original.status === 'CANCELLED'
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-medium text-primary-text',
                cancelled && 'line-through text-disabled-text',
              )}
            >
              {formatCurrency(row.original.total_credit, { showSymbol: false })}
            </span>
          )
        },
      },
    ],
    [],
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            Chronological Voucher Register · {dayBookQuery.data?.total_count ?? 0} Vouchers
          </p>
          <h1 className="mt-1 type-h1">Day Book</h1>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <Button variant="primary" onClick={() => onOpenVoucher('JOURNAL')} shortcut="F7">
            New Entry
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      </div>

      <Card padding="none">
        <CardHeader className="print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="date"
              aria-label="From date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
            />
            <span className="text-[12px] text-muted-text">to</span>
            <input
              type="date"
              aria-label="To date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
            />
            <select
              aria-label="Filter voucher type"
              value={voucherType}
              onChange={(e) => setVoucherType(e.target.value as '' | ApiVoucherType)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 text-[13px] text-primary-text"
            >
              <option value="">All Types</option>
              <option value="CONTRA">Contra (F4)</option>
              <option value="PAYMENT">Payment (F5)</option>
              <option value="RECEIPT">Receipt (F6)</option>
              <option value="JOURNAL">Journal (F7)</option>
              <option value="SALES">Sales (F8)</option>
              <option value="PURCHASE">Purchase (F9)</option>
              <option value="CREDIT_NOTE">Credit Note</option>
              <option value="DEBIT_NOTE">Debit Note</option>
            </select>
            <select
              aria-label="Filter voucher status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | ApiVoucherStatus)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 text-[13px] text-primary-text"
            >
              <option value="">All Statuses</option>
              <option value="POSTED">Posted</option>
              <option value="DRAFT">Draft</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-text"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voucher #, party, ref..."
              aria-label="Search day book"
              className="h-9 w-full rounded-sm border border-border-input bg-surface pl-9 pr-3 text-[13px] text-primary-text placeholder:text-disabled-text"
            />
          </div>
        </CardHeader>

        <DataTable
          ariaLabel="Full Day Book Register"
          data={vouchers}
          columns={columns}
          loading={dayBookQuery.isLoading}
          error={dayBookQuery.isError ? dayBookQuery.error.message : null}
          onRetry={() => dayBookQuery.refetch()}
          selectedRowId={selectedId !== null ? String(selectedId) : null}
          getRowId={(r) => String(r.id)}
          onRowActivate={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
          emptyTitle="No vouchers in selected range"
          emptyDescription="Adjust date/type filters or post a new balanced voucher."
          footer={
            <tr>
              <td
                colSpan={4}
                className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-semibold text-primary-text"
              >
                Posted Day Book Totals ({dayBookQuery.data?.posted_count ?? 0} posted
                {(dayBookQuery.data?.excluded_count ?? 0) > 0
                  ? ` · ${dayBookQuery.data?.excluded_count} excluded`
                  : ''}
                )
              </td>
              <td className="grand-total-num-cell px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                {formatCurrency(dayBookQuery.data?.posted_total_debit ?? '0.0000', {
                  showSymbol: false,
                })}
              </td>
              <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                {formatCurrency(dayBookQuery.data?.posted_total_credit ?? '0.0000', {
                  showSymbol: false,
                })}
              </td>
            </tr>
          }
        />
      </Card>

      {selectedVoucher ? (
        <Card padding="none">
          <CardHeader className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-accent" strokeWidth={1.75} />
              <CardTitle>
                <span className="code-mono">{selectedVoucher.voucher_number}</span>
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {selectedVoucher.status === 'POSTED' && !selectedVoucher.reversed_voucher_id ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={cancelVoucher.isPending}
                    leftIcon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    onClick={() => handleAction(selectedVoucher, true)}
                  >
                    Mirror Reversal
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={cancelVoucher.isPending}
                    leftIcon={<Ban className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    onClick={() => handleAction(selectedVoucher, false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
          </CardHeader>

          <div className="px-4 py-3.5 md:px-5">
            <div className="table-scroll rounded-md border border-border-subtle">
              <table className="w-full min-w-[460px] border-collapse text-[13px]">
                <thead className="bg-table-header">
                  <tr className="h-9 border-b border-border-row text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Ledger Account</th>
                    <th className="px-3 py-2 pr-4 text-right">Debit (₹)</th>
                    <th className="border-l border-border-row px-3 py-2 pr-4 text-right">
                      Credit (₹)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedVoucher.lines.map((ln) => {
                    const dr = formatBookAmountCell(ln.debit_amount)
                    const cr = formatBookAmountCell(ln.credit_amount)
                    return (
                      <tr key={ln.id} className="border-b border-border-row last:border-b-0">
                        <td className="px-3 py-2 code-mono text-muted-text">{ln.ledger_code}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => onOpenLedgerStatement(ln.ledger_id)}
                            className="font-medium text-accent hover:underline cursor-pointer"
                          >
                            {ln.ledger_name}
                          </button>
                        </td>
                        <td className="px-3 py-2 pr-4 text-right code-mono">{dr.text}</td>
                        <td className="border-l border-border-row px-3 py-2 pr-4 text-right code-mono">
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
  )
}

```

---

**[PART 3 COMPLETE — CLEAN FILE BOUNDARY AFTER `frontend/src/features/accounting/DayBookView.tsx`]**

# CURRENT_TASK.md — Milestone 2 (Part 4 / Final: Financial Statement Views, Live App Wiring, Verification & Architecture Summary)

---

## 11. Phase I — Ledger Statement, Trial Balance, Profit & Loss, and Balance Sheet Views

### File: `frontend/src/features/accounting/LedgerStatementView.tsx`

```tsx
import { useMemo, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { LedgerStatementRowDTO } from '../../lib/api'
import {
  formatBookAmountCell,
  formatCurrency,
  formatDisplayDate,
} from '../../lib/format'
import { useLedgers, useLedgerStatement } from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'

export interface LedgerStatementViewProps {
  selectedLedgerId: number | null
  onSelectLedger: (ledgerId: number) => void
  onBackToCoa: () => void
}

export function LedgerStatementView({
  selectedLedgerId,
  onSelectLedger,
  onBackToCoa,
}: LedgerStatementViewProps) {
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')

  const ledgersQuery = useLedgers()
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])
  const effectiveLedgerId = selectedLedgerId ?? ledgers[0]?.id ?? null

  const statementQuery = useLedgerStatement(effectiveLedgerId, {
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  })

  const stmt = statementQuery.data
  const entries = useMemo(() => stmt?.entries ?? [], [stmt])

  const columns = useMemo<DataTableColumnDef<LedgerStatementRowDTO>[]>(
    () => [
      {
        accessorKey: 'voucher_date',
        header: 'Date',
        meta: { align: 'left', mono: true, width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] text-muted-text">
            {formatDisplayDate(row.original.voucher_date)}
          </span>
        ),
      },
      {
        accessorKey: 'voucher_number',
        header: 'Voucher No.',
        meta: { align: 'left', mono: true, width: '146px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-medium text-primary-text">
            {row.original.voucher_number}
          </span>
        ),
      },
      {
        accessorKey: 'voucher_type',
        header: 'Type',
        meta: { align: 'left', width: '96px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12px] text-muted-text">
            {row.original.voucher_type}
          </span>
        ),
      },
      {
        accessorKey: 'particulars',
        header: 'Particulars',
        meta: { align: 'left', minWidth: '210px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-primary-text">
              {row.original.particulars}
            </p>
            <p
              title={row.original.narration}
              className="mt-0.5 truncate text-[12px] text-muted-text"
            >
              {row.original.narration}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'debit_amount',
        header: 'Debit (₹)',
        meta: { align: 'right', mono: true, width: '126px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const dr = formatBookAmountCell(row.original.debit_amount)
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-medium',
                dr.isNil ? 'text-muted-text' : 'text-primary-text',
              )}
            >
              {dr.text}
            </span>
          )
        },
      },
      {
        accessorKey: 'credit_amount',
        header: 'Credit (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '126px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const cr = formatBookAmountCell(row.original.credit_amount)
          return (
            <span
              className={cn(
                'code-mono text-[13.5px] font-medium',
                cr.isNil ? 'text-muted-text' : 'text-primary-text',
              )}
            >
              {cr.text}
            </span>
          )
        },
      },
      {
        accessorKey: 'running_balance',
        header: 'Running Bal (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '156px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13.5px] font-semibold text-primary-text">
            {formatCurrency(row.original.running_balance, { showSymbol: false })}
            <span className="ml-1 text-[11px] font-medium text-muted-text">
              {row.original.running_dr_cr === 'DR' ? 'Dr' : 'Cr'}
            </span>
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBackToCoa}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-text hover:text-primary-text cursor-pointer print:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>Chart of Accounts</span>
            </button>
            {stmt ? (
              <>
                <span className="text-muted-text" aria-hidden="true">
                  ·
                </span>
                <Badge variant="neutral" icon={false}>
                  {stmt.group_name} ({stmt.group_nature})
                </Badge>
              </>
            ) : null}
          </div>
          <h1 className="mt-1 type-h1">
            {stmt ? (
              <>
                <span className="code-mono text-muted-text mr-2">{stmt.ledger_code}</span>
                {stmt.ledger_name}
              </>
            ) : (
              'Ledger Account Statement'
            )}
          </h1>
        </div>

        <Button
          variant="secondary"
          className="print:hidden"
          leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
          onClick={() => window.print()}
        >
          Print Statement
        </Button>
      </div>

      {/* Opening / Period / Closing Summary Strip */}
      {stmt ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-md border border-border-subtle bg-surface shadow-[var(--shadow-card)]">
          <div className="px-5 py-4">
            <p className="type-xs uppercase text-muted-text">
              Opening ({formatDisplayDate(stmt.from_date)})
            </p>
            <p className="mt-1.5 code-mono text-[18px] font-bold text-primary-text">
              {formatCurrency(stmt.opening_balance)}
              <span className="ml-1 text-[12px] font-medium text-muted-text">
                {stmt.opening_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </p>
          </div>
          <div className="border-l border-border-subtle px-5 py-4">
            <p className="type-xs uppercase text-muted-text">Period Debit</p>
            <p className="mt-1.5 code-mono text-[18px] font-bold text-primary-text">
              {formatCurrency(stmt.period_debit)}
            </p>
          </div>
          <div className="border-t border-border-subtle lg:border-t-0 lg:border-l px-5 py-4">
            <p className="type-xs uppercase text-muted-text">Period Credit</p>
            <p className="mt-1.5 code-mono text-[18px] font-bold text-primary-text">
              {formatCurrency(stmt.period_credit)}
            </p>
          </div>
          <div className="border-t border-l border-border-subtle lg:border-t-0 px-5 py-4">
            <p className="type-xs uppercase text-muted-text">
              Closing ({formatDisplayDate(stmt.to_date)})
            </p>
            <p className="mt-1.5 code-mono text-[18px] font-bold text-primary-text">
              {formatCurrency(stmt.closing_balance)}
              <span className="ml-1 text-[12px] font-medium text-muted-text">
                {stmt.closing_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </p>
          </div>
        </div>
      ) : null}

      <Card padding="none">
        <CardHeader className="print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Select ledger account"
              value={effectiveLedgerId ?? ''}
              onChange={(e) => {
                if (e.target.value) onSelectLedger(Number(e.target.value))
              }}
              className="h-9 min-w-[260px] rounded-sm border border-border-input bg-surface px-2.5 text-[13px] font-medium text-primary-text"
            >
              {ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              aria-label="From date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
            />
            <span className="text-[12px] text-muted-text">to</span>
            <input
              type="date"
              aria-label="To date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
            />
          </div>
        </CardHeader>

        {/* Opening Balance Band */}
        {stmt ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-row bg-row-group px-4 py-2.5 text-[13px]">
            <span className="italic font-medium text-muted-text">
              Opening Balance brought forward as of {formatDisplayDate(stmt.from_date)}
            </span>
            <span className="code-mono font-semibold text-primary-text">
              {formatCurrency(stmt.opening_balance)}
              <span className="ml-1 text-[11px] font-medium text-muted-text">
                {stmt.opening_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </span>
          </div>
        ) : null}

        <DataTable
          ariaLabel="Ledger Account Statement Transactions"
          data={entries}
          columns={columns}
          loading={ledgersQuery.isLoading || statementQuery.isLoading}
          error={statementQuery.isError ? statementQuery.error.message : null}
          onRetry={() => statementQuery.refetch()}
          getRowId={(r) => `${r.voucher_id}-${r.voucher_number}-${r.debit_amount}-${r.credit_amount}`}
          emptyTitle="No posted transactions in this period"
          emptyDescription="Opening balance carries forward unchanged to Closing Balance."
          footer={
            stmt ? (
              <tr>
                <td
                  colSpan={4}
                  className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-semibold text-primary-text"
                >
                  Period Totals &amp; Closing Balance ({entries.length} entries)
                </td>
                <td className="grand-total-num-cell px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                  {formatCurrency(stmt.period_debit, { showSymbol: false })}
                </td>
                <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                  {formatCurrency(stmt.period_credit, { showSymbol: false })}
                </td>
                <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-semibold text-primary-text">
                  {formatCurrency(stmt.closing_balance, { showSymbol: false })}
                  <span className="ml-1 text-[11px] font-medium text-muted-text">
                    {stmt.closing_dr_cr === 'DR' ? 'Dr' : 'Cr'}
                  </span>
                </td>
              </tr>
            ) : undefined
          }
        />
      </Card>
    </div>
  )
}

```

---

### File: `frontend/src/features/accounting/TrialBalanceView.tsx`

```tsx
import { useMemo, useState } from 'react'
import { CheckCircle2, Printer, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { TrialBalanceGroupSummaryDTO, TrialBalanceRowDTO } from '../../lib/api'
import { formatBookAmountCell, formatCurrency, formatDisplayDate } from '../../lib/format'
import { useTrialBalance } from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'

export interface TrialBalanceViewProps {
  onOpenLedgerStatement: (ledgerId: number) => void
}

function renderAmountCell(value: string, bold = false) {
  const formatted = formatBookAmountCell(value)
  return (
    <span
      className={cn(
        'code-mono text-[13.5px]',
        bold ? 'font-semibold' : 'font-medium',
        formatted.isNil ? 'text-muted-text' : 'text-primary-text',
      )}
    >
      {formatted.text}
    </span>
  )
}

export function TrialBalanceView({ onOpenLedgerStatement }: TrialBalanceViewProps) {
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')
  const [includeZero, setIncludeZero] = useState(false)
  const [viewMode, setViewMode] = useState<'ledger' | 'group'>('ledger')

  const tbQuery = useTrialBalance({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    include_zero: includeZero,
  })
  const tb = tbQuery.data

  const ledgerColumns = useMemo<DataTableColumnDef<TrialBalanceRowDTO>[]>(
    () => [
      {
        accessorKey: 'ledger_name',
        header: 'Ledger Account',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-accent">
              {row.original.ledger_name}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-text">
              <span className="code-mono">{row.original.ledger_code}</span> ·{' '}
              {row.original.group_name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'opening_debit',
        header: 'Opening Dr',
        meta: { align: 'right', mono: true, width: '120px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.opening_debit),
      },
      {
        accessorKey: 'opening_credit',
        header: 'Opening Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.opening_credit),
      },
      {
        accessorKey: 'period_debit',
        header: 'Period Dr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.period_debit),
      },
      {
        accessorKey: 'period_credit',
        header: 'Period Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.period_credit),
      },
      {
        accessorKey: 'closing_debit',
        header: 'Closing Dr',
        meta: {
          align: 'right',
          mono: true,
          width: '130px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.closing_debit, true),
      },
      {
        accessorKey: 'closing_credit',
        header: 'Closing Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '130px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.closing_credit, true),
      },
    ],
    [],
  )

  const groupColumns = useMemo<DataTableColumnDef<TrialBalanceGroupSummaryDTO>[]>(
    () => [
      {
        accessorKey: 'group_name',
        header: 'Account Group',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-primary-text">
              {row.original.group_name}
            </span>
            <Badge variant="neutral" icon={false}>
              {row.original.nature}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: 'opening_debit',
        header: 'Opening Dr',
        meta: { align: 'right', mono: true, width: '120px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.opening_debit),
      },
      {
        accessorKey: 'opening_credit',
        header: 'Opening Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.opening_credit),
      },
      {
        accessorKey: 'period_debit',
        header: 'Period Dr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.period_debit),
      },
      {
        accessorKey: 'period_credit',
        header: 'Period Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '120px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.period_credit),
      },
      {
        accessorKey: 'closing_debit',
        header: 'Closing Dr',
        meta: {
          align: 'right',
          mono: true,
          width: '130px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.closing_debit, true),
      },
      {
        accessorKey: 'closing_credit',
        header: 'Closing Cr',
        meta: {
          align: 'right',
          mono: true,
          width: '130px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => renderAmountCell(row.original.closing_credit, true),
      },
    ],
    [],
  )

  const footerRow = tb ? (
    <tr>
      <td className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-bold text-primary-text">
        Grand Totals (INR)
      </td>
      <td className="grand-total-num-cell px-3 py-2.5 pr-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
        {formatCurrency(tb.total_opening_debit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
        {formatCurrency(tb.total_opening_credit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
        {formatCurrency(tb.total_period_debit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[13.5px] font-semibold text-primary-text">
        {formatCurrency(tb.total_period_credit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-bold text-primary-text">
        {formatCurrency(tb.total_debit, { showSymbol: false })}
      </td>
      <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-bold text-primary-text">
        {formatCurrency(tb.total_credit, { showSymbol: false })}
      </td>
    </tr>
  ) : undefined

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            {tb
              ? `${formatDisplayDate(tb.from_date)} to ${formatDisplayDate(tb.to_date)}`
              : 'Exact 4-Decimal Double-Entry Proof'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="type-h1">Trial Balance</h1>
            {tb ? (
              tb.is_balanced ? (
                <Badge
                  variant="success"
                  icon={<CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                >
                  Balanced · Difference ₹0.00
                </Badge>
              ) : (
                <Badge
                  variant="danger"
                  icon={<XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                >
                  Out of Balance: {formatCurrency(tb.difference)}
                </Badge>
              )
            ) : null}
          </div>
        </div>

        <Button
          variant="secondary"
          className="print:hidden"
          leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
          onClick={() => window.print()}
        >
          Print A4
        </Button>
      </div>

      <Card padding="none">
        <CardHeader className="print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-0.5 rounded-md border border-border-input bg-muted p-[3px]">
              <button
                type="button"
                aria-pressed={viewMode === 'ledger'}
                onClick={() => setViewMode('ledger')}
                className={cn(
                  'h-8 rounded-sm px-3 text-[12px] cursor-pointer',
                  viewMode === 'ledger'
                    ? 'bg-surface font-semibold text-primary-text shadow-sm'
                    : 'font-medium text-muted-text hover:text-primary-text',
                )}
              >
                Ledger-wise
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'group'}
                onClick={() => setViewMode('group')}
                className={cn(
                  'h-8 rounded-sm px-3 text-[12px] cursor-pointer',
                  viewMode === 'group'
                    ? 'bg-surface font-semibold text-primary-text shadow-sm'
                    : 'font-medium text-muted-text hover:text-primary-text',
                )}
              >
                Group-wise
              </button>
            </div>

            <input
              type="date"
              aria-label="From date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
            />
            <span className="text-[12px] text-muted-text">to</span>
            <input
              type="date"
              aria-label="To date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-[13px] font-medium text-primary-text cursor-pointer">
            <input
              type="checkbox"
              checked={includeZero}
              onChange={(e) => setIncludeZero(e.target.checked)}
              className="h-4 w-4 rounded-sm border border-border-input accent-[var(--accent-primary)]"
            />
            <span>Show zero-balance ledgers</span>
          </label>
        </CardHeader>

        {viewMode === 'ledger' ? (
          <DataTable
            ariaLabel="Trial Balance Ledger-wise"
            data={tb?.rows ?? []}
            columns={ledgerColumns}
            density="compact"
            loading={tbQuery.isLoading}
            error={tbQuery.isError ? tbQuery.error.message : null}
            onRetry={() => tbQuery.refetch()}
            getRowId={(r) => String(r.ledger_id)}
            onRowActivate={(r) => onOpenLedgerStatement(r.ledger_id)}
            footer={footerRow}
          />
        ) : (
          <DataTable
            ariaLabel="Trial Balance Group-wise"
            data={tb?.groups ?? []}
            columns={groupColumns}
            density="compact"
            loading={tbQuery.isLoading}
            error={tbQuery.isError ? tbQuery.error.message : null}
            onRetry={() => tbQuery.refetch()}
            getRowId={(r) => String(r.group_id)}
            footer={footerRow}
          />
        )}
      </Card>
    </div>
  )
}

```

---

### File: `frontend/src/features/accounting/ProfitLossView.tsx`

```tsx
import { useState } from 'react'
import { AlertTriangle, Printer, RefreshCw } from 'lucide-react'
import type { StatementLineItemDTO } from '../../lib/api'
import { toScaledInt } from '../../lib/decimal'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { useProfitLoss } from '../../hooks/useAccounting'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'

export interface ProfitLossViewProps {
  onOpenLedgerStatement: (ledgerId: number) => void
}

function StatementSideTable({
  title,
  items,
  extraRows,
  totalLabel,
  totalAmount,
  onOpenLedger,
}: {
  title: string
  items: StatementLineItemDTO[]
  extraRows?: Array<{ label: string; amount: string; emphasized?: boolean }>
  totalLabel: string
  totalAmount: string
  onOpenLedger: (ledgerId: number) => void
}) {
  return (
    <div className="flex flex-col justify-between">
      <div className="table-scroll">
        <table className="w-full border-collapse text-[13.5px]">
          <thead className="bg-table-header">
            <tr className="h-9 border-b border-border-row text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-text">
              <th className="px-4 py-2 text-left">{title}</th>
              <th className="px-4 py-2 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (!extraRows || extraRows.length === 0) ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-[13px] text-disabled-text">
                  No posted entries in this section
                </td>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr
                key={item.ledger_id}
                className="border-b border-border-row hover:bg-row-hover"
              >
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenLedger(item.ledger_id)}
                    className="text-left font-medium text-accent hover:underline cursor-pointer"
                  >
                    {item.ledger_name}
                  </button>
                  <p className="text-[11.5px] text-muted-text">
                    <span className="code-mono">{item.ledger_code}</span> · {item.group_name}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-right code-mono font-medium text-primary-text">
                  {formatCurrency(item.amount, { showSymbol: false, negativeStyle: 'parens' })}
                </td>
              </tr>
            ))}
            {extraRows?.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border-row bg-row-group"
              >
                <td
                  className={
                    row.emphasized
                      ? 'px-4 py-2.5 font-semibold text-primary-text'
                      : 'px-4 py-2.5 font-medium text-muted-text'
                  }
                >
                  {row.label}
                </td>
                <td className="px-4 py-2.5 text-right code-mono font-semibold text-primary-text">
                  {formatCurrency(row.amount, { showSymbol: false, negativeStyle: 'parens' })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-row-group">
            <tr>
              <td className="border-t-2 border-border-strong px-4 py-2.5 text-[14px] font-bold text-primary-text">
                {totalLabel}
              </td>
              <td className="grand-total-num-cell px-4 py-2.5 text-right code-mono text-[14px] font-bold text-primary-text">
                {formatCurrency(totalAmount, { showSymbol: false, negativeStyle: 'parens' })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export function ProfitLossView({ onOpenLedgerStatement }: ProfitLossViewProps) {
  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2027-03-31')

  const plQuery = useProfitLoss({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  })
  const pl = plQuery.data

  const grossProfitScaled = toScaledInt(pl?.gross_profit)
  const netProfitScaled = toScaledInt(pl?.net_profit)
  const isGrossLoss = grossProfitScaled < 0n
  const isNetLoss = netProfitScaled < 0n

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            {pl
              ? `Trading & P&L · ${formatDisplayDate(pl.from_date)} to ${formatDisplayDate(pl.to_date)}`
              : 'Trading Account & Profit & Loss Statement'}
          </p>
          <h1 className="mt-1 type-h1">Profit &amp; Loss Statement</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
          />
          <span className="text-[12px] text-muted-text">to</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
          />
          <Button
            variant="secondary"
            leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => window.print()}
          >
            Print A4
          </Button>
        </div>
      </div>

      {plQuery.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {plQuery.error.message}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => plQuery.refetch()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {/* Top Executive Strip */}
      {plQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card loading />
          <Card loading />
          <Card loading />
        </div>
      ) : pl ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 rounded-md border border-border-subtle bg-surface shadow-[var(--shadow-card)]">
            <div className="px-6 py-5">
              <p className="type-xs uppercase text-muted-text">Total Direct Revenue</p>
              <p className="mt-2 type-kpi">
                {formatCurrency(pl.total_direct_income, { negativeStyle: 'parens' })}
              </p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-border-subtle px-6 py-5">
              <p className="type-xs uppercase text-muted-text">
                {isGrossLoss ? 'Gross Loss' : 'Gross Profit'}
              </p>
              <p className="mt-2 type-kpi">
                {formatCurrency(pl.gross_profit, { negativeStyle: 'parens' })}
              </p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-border-subtle px-6 py-5">
              <p className="type-xs uppercase text-muted-text">
                {isNetLoss ? 'Net Loss' : 'Net Profit'}
              </p>
              <p className="mt-2 type-kpi">
                {formatCurrency(pl.net_profit, { negativeStyle: 'parens' })}
              </p>
            </div>
          </div>

          {/* Part 1: Trading Account */}
          <Card padding="none">
            <CardHeader>
              <CardTitle>Part I — Trading Account (Gross Profit / Loss)</CardTitle>
              <span className="code-mono text-[13px] font-semibold text-primary-text">
                {isGrossLoss ? 'Gross Loss: ' : 'Gross Profit: '}
                {formatCurrency(pl.gross_profit, { negativeStyle: 'parens' })}
              </span>
            </CardHeader>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
              <StatementSideTable
                title="Direct Expenses (Dr)"
                items={pl.direct_expenses}
                extraRows={
                  !isGrossLoss
                    ? [{ label: 'Gross Profit c/o', amount: pl.gross_profit, emphasized: true }]
                    : undefined
                }
                totalLabel="Total Direct Expenses + Gross Profit"
                totalAmount={isGrossLoss ? pl.total_direct_expenses : pl.total_direct_income}
                onOpenLedger={onOpenLedgerStatement}
              />
              <StatementSideTable
                title="Direct Income / Sales (Cr)"
                items={pl.direct_income}
                extraRows={
                  isGrossLoss
                    ? [{ label: 'Gross Loss c/o', amount: pl.gross_profit, emphasized: true }]
                    : undefined
                }
                totalLabel="Total Direct Income"
                totalAmount={isGrossLoss ? pl.total_direct_expenses : pl.total_direct_income}
                onOpenLedger={onOpenLedgerStatement}
              />
            </div>
          </Card>

          {/* Part 2: Profit & Loss Account */}
          <Card padding="none">
            <CardHeader>
              <CardTitle>Part II — Profit &amp; Loss Account (Net Profit / Loss)</CardTitle>
              <span className="code-mono text-[13px] font-semibold text-primary-text">
                {isNetLoss ? 'Net Loss: ' : 'Net Profit: '}
                {formatCurrency(pl.net_profit, { negativeStyle: 'parens' })}
              </span>
            </CardHeader>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
              <StatementSideTable
                title="Indirect Expenses (Dr)"
                items={pl.indirect_expenses}
                extraRows={[
                  ...(isGrossLoss
                    ? [{ label: 'Gross Loss b/f', amount: pl.gross_profit }]
                    : []),
                  ...(!isNetLoss
                    ? [{ label: 'Net Profit (Transferred to Balance Sheet)', amount: pl.net_profit, emphasized: true }]
                    : []),
                ]}
                totalLabel="Total Indirect Expenses + Net Profit"
                totalAmount={pl.total_indirect_expenses}
                onOpenLedger={onOpenLedgerStatement}
              />
              <StatementSideTable
                title="Gross Profit & Indirect Income (Cr)"
                items={pl.indirect_income}
                extraRows={[
                  ...(!isGrossLoss
                    ? [{ label: 'Gross Profit b/f', amount: pl.gross_profit, emphasized: true }]
                    : []),
                  ...(isNetLoss
                    ? [{ label: 'Net Loss (Transferred to Balance Sheet)', amount: pl.net_profit, emphasized: true }]
                    : []),
                ]}
                totalLabel="Total Indirect Income"
                totalAmount={pl.total_indirect_income}
                onOpenLedger={onOpenLedgerStatement}
              />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}

```

---

### File: `frontend/src/features/accounting/BalanceSheetView.tsx`

```tsx
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Printer, RefreshCw, XCircle } from 'lucide-react'
import type { BalanceSheetSectionGroupDTO } from '../../lib/api'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { useBalanceSheet } from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'

export interface BalanceSheetViewProps {
  onOpenLedgerStatement: (ledgerId: number) => void
}

function BalanceSheetColumn({
  groups,
  extraLine,
  onOpenLedger,
}: {
  groups: BalanceSheetSectionGroupDTO[]
  extraLine?: { label: string; sublabel: string; amount: string }
  onOpenLedger: (ledgerId: number) => void
}) {
  return (
    <div className="divide-y divide-border-row">
      {groups.map((grp) => (
        <div key={grp.group_id}>
          <div className="flex items-center justify-between gap-2 bg-row-group px-4 py-2.5">
            <span className="text-[13.5px] font-semibold text-primary-text">
              {grp.group_name}
            </span>
            <span className="code-mono text-[13.5px] font-semibold text-primary-text">
              {formatCurrency(grp.total, { showSymbol: false, negativeStyle: 'parens' })}
            </span>
          </div>
          <ul className="divide-y divide-border-row">
            {grp.ledgers.map((item) => (
              <li
                key={item.ledger_id}
                className="flex items-center justify-between gap-3 px-4 py-2 pl-7 hover:bg-row-hover"
              >
                <button
                  type="button"
                  onClick={() => onOpenLedger(item.ledger_id)}
                  className="truncate text-left text-[13.5px] font-medium text-accent hover:underline cursor-pointer"
                >
                  <span className="code-mono mr-2 text-[12px] text-muted-text">
                    {item.ledger_code}
                  </span>
                  {item.ledger_name}
                </button>
                <span className="shrink-0 code-mono text-[13.5px] text-primary-text">
                  {formatCurrency(item.amount, { showSymbol: false, negativeStyle: 'parens' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {extraLine ? (
        <div className="flex items-center justify-between gap-3 bg-row-group px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold text-primary-text">{extraLine.label}</p>
            <p className="text-[11.5px] text-muted-text">{extraLine.sublabel}</p>
          </div>
          <span className="code-mono text-[14px] font-bold text-primary-text">
            {formatCurrency(extraLine.amount, { showSymbol: false, negativeStyle: 'parens' })}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export function BalanceSheetView({ onOpenLedgerStatement }: BalanceSheetViewProps) {
  const [asOfDate, setAsOfDate] = useState('2027-03-31')
  const bsQuery = useBalanceSheet({ as_of_date: asOfDate || undefined })
  const bs = bsQuery.data

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            {bs ? `As of ${formatDisplayDate(bs.as_of_date)}` : 'Statement of Financial Position'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="type-h1">Balance Sheet</h1>
            {bs ? (
              bs.is_balanced ? (
                <Badge
                  variant="success"
                  icon={<CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                >
                  Balanced · Assets = Liabilities + Equity
                </Badge>
              ) : (
                <Badge
                  variant="danger"
                  icon={<XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                >
                  Difference: {formatCurrency(bs.difference)}
                </Badge>
              )
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <label className="text-[12.5px] font-medium text-muted-text" htmlFor="bs-as-of">
            As of
          </label>
          <input
            id="bs-as-of"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="h-9 rounded-sm border border-border-input bg-surface px-2.5 code-mono text-[13px] text-primary-text"
          />
          <Button
            variant="secondary"
            leftIcon={<Printer className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => window.print()}
          >
            Print A4
          </Button>
        </div>
      </div>

      {bsQuery.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {bsQuery.error.message}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => bsQuery.refetch()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {bsQuery.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card loading />
          <Card loading />
        </div>
      ) : bs ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">
          {/* Left Side: Capital, Equity & Liabilities */}
          <Card padding="none">
            <CardHeader>
              <CardTitle>Liabilities &amp; Equity</CardTitle>
              <span className="code-mono text-[13px] font-semibold text-muted-text">INR (₹)</span>
            </CardHeader>
            <BalanceSheetColumn
              groups={[...bs.equity, ...bs.liabilities]}
              extraLine={{
                label: 'Current Period Net Profit / (Loss)',
                sublabel: 'Auto-carried from Profit & Loss Statement',
                amount: bs.current_period_net_profit,
              }}
              onOpenLedger={onOpenLedgerStatement}
            />
            <div className="flex items-center justify-between gap-3 border-t-2 border-border-strong bg-row-group px-4 py-3">
              <span className="text-[14px] font-bold text-primary-text">
                Total Liabilities &amp; Equity
              </span>
              <span className="grand-total-num-cell code-mono text-[15px] font-bold text-primary-text">
                {formatCurrency(bs.total_liabilities_and_equity, { negativeStyle: 'parens' })}
              </span>
            </div>
          </Card>

          {/* Right Side: Assets */}
          <Card padding="none">
            <CardHeader>
              <CardTitle>Assets</CardTitle>
              <span className="code-mono text-[13px] font-semibold text-muted-text">INR (₹)</span>
            </CardHeader>
            <BalanceSheetColumn
              groups={bs.assets}
              onOpenLedger={onOpenLedgerStatement}
            />
            <div className="flex items-center justify-between gap-3 border-t-2 border-border-strong bg-row-group px-4 py-3">
              <span className="text-[14px] font-bold text-primary-text">Total Assets</span>
              <span className="grand-total-num-cell code-mono text-[15px] font-bold text-primary-text">
                {formatCurrency(bs.total_assets, { negativeStyle: 'parens' })}
              </span>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

```

---

### File: `frontend/src/App.tsx`

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Construction } from 'lucide-react'
import type { VoucherDTO } from './lib/api'
import type { VoucherType } from './lib/dummyData'
import { useCompanyContext, useDayBook, useLedgers } from './hooks/useAccounting'
import { useKeymap } from './hooks/useKeymap'
import { useTheme } from './hooks/useTheme'
import { APP_NAV_ITEMS, AppShell } from './components/layout/AppShell'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { CommandPalette } from './components/ui/CommandPalette'
import { EmptyState } from './components/ui/EmptyState'
import { ShortcutSheetModal } from './components/ui/ShortcutSheetModal'
import { FinancialCommandPage } from './features/dashboard/FinancialCommandPage'
import {
  QUICK_VOUCHER_FORM_ID,
  QuickVoucherDrawer,
} from './features/dashboard/QuickVoucherDrawer'
import { ChartOfAccountsView } from './features/accounting/ChartOfAccountsView'
import { DayBookView } from './features/accounting/DayBookView'
import { LedgerStatementView } from './features/accounting/LedgerStatementView'
import { TrialBalanceView } from './features/accounting/TrialBalanceView'
import { ProfitLossView } from './features/accounting/ProfitLossView'
import { BalanceSheetView } from './features/accounting/BalanceSheetView'

export default function App() {
  const { theme, toggleTheme } = useTheme()

  const [activeNav, setActiveNav] = useState<string>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerVoucherType, setDrawerVoucherType] = useState<VoucherType>('SALES')

  const [selectedVoucherId, setSelectedVoucherId] = useState<number | null>(null)
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const companyQuery = useCompanyContext()
  const dayBookQuery = useDayBook()
  const ledgersQuery = useLedgers()

  const vouchers = useMemo(() => dayBookQuery.data?.vouchers ?? [], [dayBookQuery.data])
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => setToastMessage(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const handleOpenVoucher = useCallback((type: VoucherType) => {
    setPaletteOpen(false)
    setShortcutSheetOpen(false)
    setMobileNavOpen(false)
    setDrawerVoucherType(type)
    setDrawerOpen(true)
  }, [])

  const handleTogglePalette = useCallback(() => {
    setMobileNavOpen(false)
    setShortcutSheetOpen(false)
    setPaletteOpen((prev) => !prev)
  }, [])

  const handleToggleShortcutSheet = useCallback(() => {
    setPaletteOpen(false)
    setMobileNavOpen(false)
    setShortcutSheetOpen((prev) => !prev)
  }, [])

  const handleEscape = useCallback(() => {
    if (shortcutSheetOpen) {
      setShortcutSheetOpen(false)
    } else if (paletteOpen) {
      setPaletteOpen(false)
    } else if (drawerOpen) {
      setDrawerOpen(false)
    } else if (mobileNavOpen) {
      setMobileNavOpen(false)
    } else if (selectedVoucherId !== null) {
      setSelectedVoucherId(null)
    }
  }, [shortcutSheetOpen, paletteOpen, drawerOpen, mobileNavOpen, selectedVoucherId])

  const handleSubmitActiveForm = useCallback(() => {
    const form = document.getElementById(QUICK_VOUCHER_FORM_ID) as HTMLFormElement | null
    form?.requestSubmit()
  }, [])

  useKeymap({
    onOpenCommandPalette: handleTogglePalette,
    onOpenVoucher: handleOpenVoucher,
    onEscape: handleEscape,
    onSubmitActiveForm: handleSubmitActiveForm,
    onToggleShortcutSheet: handleToggleShortcutSheet,
    isFormSubmitEnabled: drawerOpen,
  })

  const handleVoucherPosted = useCallback((created: VoucherDTO) => {
    setSelectedVoucherId(created.id)
    setToastMessage(`Posted ${created.voucher_number} (${created.voucher_type})`)
  }, [])

  const handleOpenLedgerStatement = useCallback((ledgerId: number) => {
    setSelectedLedgerId(ledgerId)
    setActiveNav('ledger-statement')
  }, [])

  const activeNavMeta = APP_NAV_ITEMS.find((n) => n.id === activeNav)

  const renderWorkspace = () => {
    switch (activeNav) {
      case 'dashboard':
        return (
          <FinancialCommandPage
            selectedVoucherId={selectedVoucherId}
            onSelectVoucher={(v) => setSelectedVoucherId(v?.id ?? null)}
            onOpenVoucher={handleOpenVoucher}
            onOpenLedgerStatement={handleOpenLedgerStatement}
            onNavigateReport={setActiveNav}
            onNotify={setToastMessage}
          />
        )
      case 'coa':
        return (
          <ChartOfAccountsView
            onOpenLedgerStatement={handleOpenLedgerStatement}
            onNotify={setToastMessage}
          />
        )
      case 'daybook':
        return (
          <DayBookView
            onOpenVoucher={handleOpenVoucher}
            onOpenLedgerStatement={handleOpenLedgerStatement}
            onNotify={setToastMessage}
          />
        )
      case 'ledger-statement':
        return (
          <LedgerStatementView
            selectedLedgerId={selectedLedgerId}
            onSelectLedger={setSelectedLedgerId}
            onBackToCoa={() => setActiveNav('coa')}
          />
        )
      case 'trial-balance':
        return <TrialBalanceView onOpenLedgerStatement={handleOpenLedgerStatement} />
      case 'profit-loss':
        return <ProfitLossView onOpenLedgerStatement={handleOpenLedgerStatement} />
      case 'balance-sheet':
        return <BalanceSheetView onOpenLedgerStatement={handleOpenLedgerStatement} />
      default:
        return (
          <Card className="my-4">
            <EmptyState
              icon={<Construction className="h-5 w-5" strokeWidth={1.75} />}
              title={`${activeNavMeta?.label ?? 'Workspace'} — Scheduled for ${activeNavMeta?.milestoneTag ?? 'Upcoming Milestone'}`}
              description="Milestone 2 completes the live double-entry FastAPI backend, Chart of Accounts, Day Book, Ledger Statements, Trial Balance, P&L, and Balance Sheet."
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
                    New Voucher
                  </Button>
                </div>
              }
            />
          </Card>
        )
    }
  }

  return (
    <>
      <AppShell
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        company={companyQuery.data}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenVoucher={handleOpenVoucher}
        onOpenShortcutSheet={() => setShortcutSheetOpen(true)}
        mobileNavOpen={mobileNavOpen}
        onSetMobileNavOpen={setMobileNavOpen}
      >
        {renderWorkspace()}
      </AppShell>

      <QuickVoucherDrawer
        open={drawerOpen}
        voucherType={drawerVoucherType}
        onChangeVoucherType={setDrawerVoucherType}
        onClose={() => setDrawerOpen(false)}
        onVoucherPosted={handleVoucherPosted}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        vouchers={vouchers}
        ledgers={ledgers}
        onOpenVoucher={handleOpenVoucher}
        onSelectNav={setActiveNav}
        onSelectLedger={handleOpenLedgerStatement}
        onSelectVoucher={(v) => {
          setActiveNav('dashboard')
          setSelectedVoucherId(v.id)
        }}
      />

      <ShortcutSheetModal
        open={shortcutSheetOpen}
        onClose={() => setShortcutSheetOpen(false)}
      />

      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-5 right-5 z-[var(--z-toast)] flex items-center gap-2 rounded-md border border-[var(--status-success-border)] bg-raised px-4 py-3 text-[13px] font-medium text-primary-text shadow-md print:hidden"
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

## 12. Exact Verification Commands & Acceptance Gate

Run these commands sequentially on your Linux Mint workstation (keep RAM low by running backend tests and frontend build before launching both dev servers simultaneously):

### 1. Backend Environment, Alembic Migration & Idempotent Seed

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 1. Run Alembic async migration (creates ledgerprime.db in WAL mode)
alembic upgrade head

# 2. Run seed script TWICE to verify strict idempotency (second run must report 0 created)
python -m app.seed.dummy_company
python -m app.seed.dummy_company

```

### 2. Async Double-Entry Pytest Suite (All 8 Invariant Categories)

```bash
cd backend
source .venv/bin/activate
pytest -v

```

**Expected Pass Gate:** `8 passed` with `0` warnings/errors on SQLAlchemy async greenlet or Alembic naming constraints.

### 3. Frontend Typecheck, Lint, Build & Design-System Guardrails

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build

# Design-system hygiene guardrails (must print PASS for all 3 checks)
! grep -rnE '#[0-9a-fA-F]{3,8}' src --include='*.tsx' && echo "PASS: Zero raw hex values in TSX"
! grep -rn 'text-\[var(--fs-' src --include='*.tsx' && echo "PASS: Zero untyped text-[var(--fs-*)]"
! grep -rnE 'useReactTable|getCoreRowModel|forwardRef|defaultProps' src --include='*.ts' --include='*.tsx' && echo "PASS: Strict React 19.3 + TanStack Table v9"

```

### 4. Full-Stack Live Local Launch & Browser Smoke-Test Checklist

Open two terminals (close unused browser tabs to stay under 8 GB RAM):

```bash
# Terminal 1 — FastAPI backend (:8000)
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Vite frontend (:5173 proxying /api -> :8000)
cd frontend
npm run dev

```

Verify every item in Brave at `http://localhost:5173`:

1. **Health & Live KPIs:** `[http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)` returns `{"status":"ok","version":"0.2.0","dialect":"sqlite"}`. Dashboard KPI strip loads live balances from SQLite (no static dummy numbers) and shows `Books Balanced · SQLite WAL`.
2. **Keyboard Voucher Entry (`F5` / `Alt+5` & `Ctrl+Enter`):** Press `Alt+5` (or `F5`) to open Payment Voucher drawer. Verify ledger dropdown lists all 20 seeded ledgers from `/api/v1/ledgers`. Enter an unbalanced line (`Dr 5000`, `Cr 4000`) and confirm `Post Balanced Voucher` stays disabled with `Out of Balance: ₹1,000.00`. Balance it (`Cr 5000`), add narration, press `Ctrl+Enter`, and confirm the new `PAY/26-27/0003` voucher appears immediately in the Day Book and updates Cash & Bank KPI live.
3. **Chart of Accounts & `+ New Ledger`:** Navigate to **Chart of Accounts**, confirm 28 Tally Account Groups in the dropdown and 20 active ledgers. Click **New Ledger**, create `5210 · Travelling & Conveyance` under `Indirect Expenses` with `0.00` opening balance, and confirm it immediately appears in the table and in Quick Voucher dropdowns.
4. **Clickable Ledger Statement:** Click **Cash-in-Hand (Head Office)** from Chart of Accounts (or any voucher drill-down line) and verify Opening Balance (`₹1,50,000.00 Dr`), chronological transactions with running balance, and Closing Balance (`₹1,25,000.00 Dr`).
5. **Trial Balance, P&L & Balance Sheet:**
* Open **Trial Balance**: confirm `Balanced · Difference ₹0.00`, toggle `Ledger-wise` $\leftrightarrow$ `Group-wise`, and verify Opening Dr == Opening Cr and Closing Dr == Closing Cr.
* Open **Profit & Loss**: confirm Trading Account (`Direct Income`, `Direct Expenses`, `Gross Profit`) and P&L Account (`Indirect Income`, `Indirect Expenses`, `Net Profit`).
* Open **Balance Sheet**: confirm `Balanced · Assets = Liabilities + Equity` and `Current Period Net Profit` matches the P&L Net Profit to the last paisa.


6. **Immutable Cancellation / Reversal:** Click a posted voucher in **Day Book**, click **Post Reversal**, verify a mirror `JRN/26-27/xxxx` voucher is created while Trial Balance remains `Difference ₹0.00`.
7. **Dark Mode & Print:** Toggle Dark Mode and trigger `Ctrl+P` on Trial Balance / Balance Sheet to verify Light Mode print styling and double-underlined totals.


8. **Update `TASK_STATE.md`:** Once all tests and checks pass, update `TASK_STATE.md` with completed files, pytest summary, and next milestone (**Milestone 3: Perpetual FIFO Inventory, Godowns & India GST Invoicing**).



---

## 13. Plain-English Beginner Architecture Summary

Here is the exact lifecycle of a single double-entry voucher in Milestone 2 from your keyboard to the Balance Sheet:

1. **Keyboard & Form Gate (React + Zod 4 + BigInt):** When you press `F5` (or `Alt+5`) and type amounts into `QuickVoucherDrawer.tsx`, JavaScript never uses binary floating-point math. Instead, `decimal.ts` multiplies every rupee string by `10,000n` (`BigInt`), computes `Total Debit - Total Credit` in exact sub-paisa integers, and refuses to submit via `Ctrl+Enter` until `Difference === 0n`.


2. **Vite Proxy to FastAPI (`frontend/src/lib/api.ts` $\rightarrow$ `backend/app/modules/ledger/router.py`):** React sends a JSON `POST /api/v1/vouchers` request containing exact decimal strings (`"12500.0000"`) to Vite on port `5173`, which silently forwards `/api/*` to FastAPI on port `8000` (avoiding browser CORS friction). Pydantic `v2.14` parses those strings directly into Python `Decimal` objects and immediately rejects raw floats, single-line entries, or unbalanced totals with HTTP `422`.


3. **Accounting Service & ORM Safety Net (`service.py` + `models/ledger.py`):** `create_voucher()` resolves either `ledger_id` or `account_code`, checks that the voucher date falls inside the active unlocked `FiscalYear`, auto-generates the next sequential number (e.g., `PAY/26-27/0003`), and stages a `Voucher` plus its `VoucherLine` rows. Right before SQLAlchemy writes to disk, the synchronous `before_flush` listener double-checks that every posted voucher has at least two single-sided lines and `SUM(debit) == SUM(credit)`.


4. **Zero-Float Storage in SQLite WAL (`core/money.py` + `core/database.py`):** Because SQLite's built-in `NUMERIC` type silently converts numbers into floats, `MoneyNumeric18_4` automatically multiplies every `Decimal` by `10,000` and saves it as an exact 64-bit integer in SQLite (and switches automatically to native `NUMERIC(18, 4)` when you later point `DATABASE_URL` to Neon PostgreSQL). Named SQL `CHECK` constraints enforce non-negative, mutually exclusive debit/credit lines inside SQLite WAL mode.


5. **Live Financial Statements (`hooks/useAccounting.ts` $\rightarrow$ Reports):** The moment FastAPI returns `201 Created`, `useCreateVoucher()` invalidates the TanStack Query `['accounting']` cache. React automatically re-fetches `/reports/dashboard-kpis`, `/reports/day-book`, `/reports/trial-balance`, `/reports/profit-loss`, and `/reports/balance-sheet`. On the backend, SQL sums every `POSTED` line (skipping `DRAFT` and `CANCELLED` entries), combines them with each ledger's opening balance, carries `Net Profit` from Income minus Expenses onto the Liabilities & Equity side of the Balance Sheet, and proves `Total Assets == Total Liabilities & Equity` with `0.0000` variance.
