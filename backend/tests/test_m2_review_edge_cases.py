"""LedgerPrime M2 -- edge-case regression tests from the independent review.

Covers FY rollover/retained earnings split, deactivated ledgers with history,
concurrent gapless numbering under BEGIN IMMEDIATE, reversal in an open FY when
prior FY is locked, MoneyNumeric18_4 dialect parity, SQLite trigger enforcement,
and HTTP 409 Retry-After handling for database lock conflicts.
"""

from __future__ import annotations

import asyncio
import importlib.util
from datetime import date
from decimal import Decimal as D
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core.database import Base, build_async_engine
from app.core.money import MoneyNumeric18_4
from app.main import app as fastapi_app
from app.models.company import Company, FiscalYear
from app.models.ledger import AccountGroup, Ledger
from app.modules.ledger import service as svc
from app.modules.ledger.exceptions import ConcurrencyConflictError, FiscalYearLockedError
from app.modules.ledger.schemas import VoucherCancelRequest, VoucherCreate

FY1 = (date(2026, 4, 1), date(2027, 3, 31))
FY2 = (date(2027, 4, 1), date(2028, 3, 31))


def _load_m2_migration():
    mig_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "m2_0007_integrity.py"
    )
    spec = importlib.util.spec_from_file_location("m2_0007_integrity", mig_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# --------------------------------------------------------------------------- fixtures
@pytest.fixture
async def sessionmaker_(tmp_path):
    # FILE database (not :memory:) so several connections really contend for the WAL lock.
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    engine = build_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'lp.db'}")
    mig = _load_m2_migration()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in mig.SQLITE_TRIGGERS:
            await conn.execute(text(stmt))
    yield async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    await engine.dispose()


async def _seed(db):
    co = Company(
        name="Bharat Hardware",
        legal_name="Bharat Hardware & Exports Pvt. Ltd.",
        country_code="IN",
        state_code="09",
        base_currency="INR",
        number_format="INDIAN_LAKH",
        fy_start_month=4,
        is_active=True,
    )
    db.add(co)
    await db.flush()
    fy1 = FiscalYear(
        company_id=co.id,
        label="FY 2026-27",
        start_date=FY1[0],
        end_date=FY1[1],
        is_locked=False,
    )
    fy2 = FiscalYear(
        company_id=co.id,
        label="FY 2027-28",
        start_date=FY2[0],
        end_date=FY2[1],
        is_locked=False,
    )
    db.add_all([fy1, fy2])
    groups = {}
    for i, (code, name, nature, gp) in enumerate(
        [
            ("CA", "Cash-in-Hand", "ASSET", False),
            ("BA", "Bank Accounts", "ASSET", False),
            ("FA", "Fixed Assets", "ASSET", False),
            ("CAP", "Capital Account", "EQUITY", False),
            ("SC", "Sundry Creditors", "LIABILITY", False),
            ("SAL", "Sales Accounts", "INCOME", True),
            ("PUR", "Purchase Accounts", "EXPENSE", True),
            ("IE", "Indirect Expenses", "EXPENSE", False),
        ]
    ):
        g = AccountGroup(
            company_id=co.id,
            code=code,
            name=name,
            parent_id=None,
            nature=nature,
            is_primary=True,
            affects_gross_profit=gp,
            display_order=i,
        )
        db.add(g)
        groups[code] = g
    await db.flush()
    ledgers_map = {}
    for code, grp, ob, side in [
        ("CASH", "CA", "50000", "DR"),
        ("BANK", "BA", "0", "DR"),
        ("FA", "FA", "40000", "DR"),
        ("ACCDEP", "FA", "8000", "CR"),  # contra-asset inside Fixed Assets
        ("CAPITAL", "CAP", "60000", "CR"),
        ("CRED", "SC", "0", "CR"),
        ("SALES", "SAL", "30000", "CR"),  # nominal opening (books begin mid-year style)
        ("PURCH", "PUR", "8000", "DR"),
        ("PRET", "PUR", "0", "DR"),  # purchase returns (contra)
        ("DEP", "IE", "0", "DR"),
        ("RENT", "IE", "0", "DR"),
    ]:
        led = Ledger(
            company_id=co.id,
            group_id=groups[grp].id,
            code=code,
            name=code,
            opening_balance=D(ob),
            opening_dr_cr=side,
            is_system_ledger=False,
            is_active=True,
        )
        db.add(led)
        ledgers_map[code] = led
    await db.commit()
    return co, fy1, fy2, ledgers_map


async def _post(db, co, when, legs, vtype="JOURNAL"):
    return await svc.create_voucher(
        db,
        VoucherCreate(
            voucher_type=vtype,
            voucher_date=when,
            narration="t",
            status="POSTED",
            lines=[
                {"account_code": c, "debit_amount": str(dr), "credit_amount": str(cr)}
                for c, dr, cr in legs
            ],
        ),
        company_id=co.id,
    )


# ===================================================================== Q2 tie-out
@pytest.mark.asyncio
async def test_fy2_pl_and_bs_split_retained_earnings_vs_current_period(sessionmaker_):
    async with sessionmaker_() as db:
        co, fy1, fy2, _L = await _seed(db)
        await _post(db, co, date(2026, 6, 1), [("CASH", 5000, 0), ("SALES", 0, 5000)])
        await _post(db, co, date(2026, 7, 1), [("PURCH", 2000, 0), ("CRED", 0, 2000)])
        await _post(db, co, date(2026, 7, 9), [("CRED", 500, 0), ("PRET", 0, 500)])
        await _post(db, co, date(2027, 3, 31), [("DEP", 1000, 0), ("ACCDEP", 0, 1000)])
        await _post(db, co, date(2027, 5, 10), [("RENT", 300, 0), ("BANK", 0, 300)])

        pl_fy1 = await svc.get_profit_loss(
            db, company_id=co.id, from_date=FY1[0], to_date=FY1[1]
        )
        pl_fy2_ytd = await svc.get_profit_loss(
            db, company_id=co.id, from_date=FY2[0], to_date=date(2027, 6, 30)
        )
        assert pl_fy1.net_profit == D("24500.0000")
        assert pl_fy2_ytd.net_profit == D("-300.0000")
        assert pl_fy1.total_direct_expenses == D("9500.0000")

        bs = await svc.get_balance_sheet(
            db, company_id=co.id, as_of_date=date(2027, 6, 30)
        )
        assert bs.is_balanced and bs.difference == D("0.0000")
        assert bs.current_period_net_profit == pl_fy2_ytd.net_profit
        assert bs.retained_earnings_brought_forward == pl_fy1.net_profit
        fa = next(g for g in bs.assets if g.group_name == "Fixed Assets")
        assert fa.total == D("31000.0000")
        assert any(
            g.group_name.startswith("Bank Overdraft") and g.total == D("300.0000")
            for g in bs.liabilities
        )

        h1 = await svc.get_profit_loss(
            db, company_id=co.id, from_date=FY1[0], to_date=date(2026, 9, 30)
        )
        h2 = await svc.get_profit_loss(
            db, company_id=co.id, from_date=date(2026, 10, 1), to_date=FY1[1]
        )
        assert h1.net_profit + h2.net_profit == pl_fy1.net_profit

        tb = await svc.get_trial_balance(
            db, company_id=co.id, from_date=FY2[0], to_date=FY2[1]
        )
        assert tb.is_balanced
        sales_row = next((r for r in tb.rows if r.ledger_code == "SALES"), None)
        assert sales_row is None or (
            sales_row.opening_credit == 0 and sales_row.opening_debit == 0
        )
        re_row = next(r for r in tb.rows if r.ledger_code == svc.RETAINED_EARNINGS_CODE)
        assert re_row.opening_credit == D("24500.0000")


@pytest.mark.asyncio
async def test_deactivated_ledger_with_history_keeps_reports_balanced(sessionmaker_):
    async with sessionmaker_() as db:
        co, _fy1, _fy2, L = await _seed(db)
        await _post(db, co, date(2026, 6, 1), [("RENT", 1200, 0), ("CASH", 0, 1200)])
        L["RENT"].is_active = False
        await db.commit()
        tb = await svc.get_trial_balance(
            db, company_id=co.id, from_date=FY1[0], to_date=FY1[1]
        )
        bs = await svc.get_balance_sheet(db, company_id=co.id, as_of_date=FY1[1])
        pl = await svc.get_profit_loss(
            db, company_id=co.id, from_date=FY1[0], to_date=FY1[1]
        )
        assert tb.is_balanced and bs.is_balanced
        assert any(i.ledger_code == "RENT" for i in pl.indirect_expenses)


# ===================================================================== Q3 concurrency
@pytest.mark.asyncio
async def test_concurrent_auto_numbering_is_unique_and_gapless(sessionmaker_):
    async with sessionmaker_() as db:
        co, *_ = await _seed(db)

    async def one(i):
        async with sessionmaker_() as s:
            return await _post(
                s,
                co,
                date(2026, 8, 1),
                [("RENT", 100 + i, 0), ("CASH", 0, 100 + i)],
            )

    results = await asyncio.gather(*(one(i) for i in range(12)))
    nums = sorted(r.voucher_number for r in results)
    assert nums == [f"JRN/26-27/{n:04d}" for n in range(1, 13)]


@pytest.mark.asyncio
async def test_reversal_of_locked_prior_year_voucher_lands_in_open_period(sessionmaker_):
    async with sessionmaker_() as db:
        co, fy1, fy2, _L = await _seed(db)
        v = await _post(
            db, co, date(2027, 2, 1), [("RENT", 500, 0), ("CASH", 0, 500)]
        )
        fy1.is_locked = True
        await db.commit()

        with pytest.raises(FiscalYearLockedError):
            await svc.cancel_voucher(
                db, v.id, VoucherCancelRequest(create_reversal=False), company_id=co.id
            )
        with pytest.raises(FiscalYearLockedError):
            await svc.cancel_voucher(
                db, v.id, VoucherCancelRequest(create_reversal=True), company_id=co.id
            )

        res = await svc.cancel_voucher(
            db,
            v.id,
            VoucherCancelRequest(create_reversal=True, reversal_date=date(2027, 4, 1)),
            company_id=co.id,
        )
        rev = res.reversal_voucher
        assert rev is not None
        assert rev.fiscal_year_id == fy2.id and rev.voucher_number == "JRN/27-28/0001"


# ===================================================================== Q3 money & DB integrity
@pytest.mark.parametrize("dialect", [sqlite.dialect(), postgresql.dialect()])
def test_money_type_dialect_parity(dialect):
    t = MoneyNumeric18_4()
    v = t.process_bind_param(D("12345.67895"), dialect)
    back = t.process_result_value(v, dialect)
    assert back == D("12345.6790")
    if dialect.name == "sqlite":
        assert v == 123456790 and isinstance(v, int)
    else:
        assert v == D("12345.6790")
    with pytest.raises(ValueError):
        t.process_bind_param(D("100000000000000.0000"), dialect)
    with pytest.raises(TypeError):
        t.process_bind_param(0.1, dialect)
    if dialect.name == "sqlite":
        with pytest.raises(TypeError):
            t.process_result_value(123.45, dialect)


@pytest.mark.asyncio
async def test_sqlite_triggers_block_direct_posted_and_unbalanced_post(sessionmaker_):
    async with sessionmaker_() as db:
        co, fy1, _fy2, ledgers = await _seed(db)
        co_id = co.id
        fy1_id = fy1.id
        rent_id = ledgers["RENT"].id
        cash_id = ledgers["CASH"].id

        with pytest.raises(IntegrityError) as exc1:
            await db.execute(
                text(
                    "INSERT INTO vouchers "
                    "(company_id, fiscal_year_id, voucher_number, voucher_type, voucher_date, "
                    "narration, status, created_at, updated_at) "
                    "VALUES (:c, :f, 'MAN/1', 'JOURNAL', '2026-06-01', 'bad', 'POSTED', "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                ),
                {"c": co_id, "f": fy1_id},
            )
        assert "ck_vouchers_posted_balanced" in str(exc1.value)
        await db.rollback()

        await db.execute(
            text(
                "INSERT INTO vouchers "
                "(company_id, fiscal_year_id, voucher_number, voucher_type, voucher_date, "
                "narration, status, created_at, updated_at) "
                "VALUES (:c, :f, 'MAN/2', 'JOURNAL', '2026-06-01', 'draft', 'DRAFT', "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"c": co_id, "f": fy1_id},
        )
        vid = (
            await db.execute(
                text("SELECT id FROM vouchers WHERE voucher_number = 'MAN/2'")
            )
        ).scalar_one()
        await db.execute(
            text(
                "INSERT INTO voucher_lines (voucher_id, ledger_id, debit_amount, credit_amount) "
                "VALUES (:v, :l1, 1000000, 0), (:v, :l2, 0, 500000)"
            ),
            {"v": vid, "l1": rent_id, "l2": cash_id},
        )
        with pytest.raises(IntegrityError) as exc2:
            await db.execute(
                text("UPDATE vouchers SET status = 'POSTED' WHERE id = :v"),
                {"v": vid},
            )
        assert "ck_vouchers_posted_balanced" in str(exc2.value)
        await db.rollback()


@pytest.mark.asyncio
async def test_http_409_retry_after_on_database_is_locked():
    test_app = FastAPI()
    for exc_cls, handler in fastapi_app.exception_handlers.items():
        test_app.add_exception_handler(exc_cls, handler)

    @test_app.get("/_test/op-lock")
    async def _raise_op_lock():
        raise OperationalError(
            "BEGIN IMMEDIATE",
            {},
            Exception("database is locked"),
        )

    @test_app.get("/_test/conflict-err")
    async def _raise_conflict():
        raise ConcurrencyConflictError("Ledger is busy with another posting; please retry.")

    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://testserver"
    ) as ac:
        resp1 = await ac.get("/_test/op-lock")
        assert resp1.status_code == 409
        assert resp1.headers.get("retry-after") == "1"
        assert resp1.json()["error_code"] == "CONCURRENCY_CONFLICT"

        resp2 = await ac.get("/_test/conflict-err")
        assert resp2.status_code == 409
        assert resp2.headers.get("retry-after") == "1"
        assert resp2.json()["error_code"] == "CONCURRENCY_CONFLICT"
