"""Round-2 independent audit edge-case tests for LedgerPrime M2.

Verifies:
  1. Schedule III contra accounts + ancestor-aware opposite-balance reclassification
     (Bank overdrawn, Bank OD DR surplus, child Export Debtors CR advance) with unique group_ids.
  2. Arbitrary mid-year and multi-FY P&L -> Balance Sheet tie-out (from_date support) and
     to_date-only queries targeting prior fiscal years across P&L, TB, and Ledger Statement.
  3. CoA (list_account_groups / list_ledgers) FY scoping for nominal accounts + inactive ledger
     balance preservation in group roll-ups + Credit-normal zero-balance DR/CR defaults.
  4. File-backed SQLite WAL concurrent readers + writers under DEFERRED reads / IMMEDIATE writes,
     direct CANCELLED creation rejection (no burned sequence), manual voucher normalization &
     CGST Rule 46(b) 16-char validation, and _serialize_voucher particulars.
  5. m2_0008 header immutability & delete-protection SQLite triggers.
"""

from __future__ import annotations

import asyncio
import importlib.util
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import Base, build_async_engine
from app.models.company import Company, FiscalYear
from app.models.ledger import (
    AccountGroup,
    AccountNature,
    DrCr,
    Ledger,
    VoucherStatus,
    VoucherType,
)
from app.modules.ledger.exceptions import InvalidVoucherError
from app.modules.ledger.schemas import VoucherCreate, VoucherLineCreate
from app.modules.ledger.service import (
    create_voucher,
    get_balance_sheet,
    get_ledger_statement,
    get_profit_loss,
    get_trial_balance,
    list_account_groups,
    list_ledgers,
)


def _load_migration(filename: str):
    mig_path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / filename
    spec = importlib.util.spec_from_file_location(filename.removesuffix(".py"), mig_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
async def audit_sessionmaker(tmp_path: Path):
    db_file = tmp_path / "audit_r2.db"
    engine = build_async_engine(f"sqlite+aiosqlite:///{db_file}")
    m7 = _load_migration("m2_0007_integrity.py")
    m8 = _load_migration("m2_0008_header_immutability.py")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in m7.SQLITE_TRIGGERS + m8.SQLITE_HEADER_TRIGGERS:
            await conn.execute(text(stmt))
    yield async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    await engine.dispose()


async def _seed_rich_company(db: AsyncSession):
    co = Company(
        name="Audit Hardware",
        legal_name="Audit Hardware & Exports Pvt. Ltd.",
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
        label="FY 2025-26",
        start_date=date(2025, 4, 1),
        end_date=date(2026, 3, 31),
        is_locked=False,
    )
    fy2 = FiscalYear(
        company_id=co.id,
        label="FY 2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_locked=False,
    )
    db.add_all([fy1, fy2])
    await db.flush()

    # Primary groups
    g_cash = AccountGroup(
        company_id=co.id, code="CA", name="Cash-in-Hand",
        nature=AccountNature.ASSET.value, is_primary=True, affects_gross_profit=False, display_order=1,
    )
    g_bank = AccountGroup(
        company_id=co.id, code="BA", name="Bank Accounts",
        nature=AccountNature.ASSET.value, is_primary=True, affects_gross_profit=False, display_order=2,
    )
    g_fa = AccountGroup(
        company_id=co.id, code="FA", name="Fixed Assets",
        nature=AccountNature.ASSET.value, is_primary=True, affects_gross_profit=False, display_order=3,
    )
    g_debt = AccountGroup(
        company_id=co.id, code="SD", name="Sundry Debtors",
        nature=AccountNature.ASSET.value, is_primary=True, affects_gross_profit=False, display_order=4,
    )
    g_cap = AccountGroup(
        company_id=co.id, code="CAP", name="Capital Account",
        nature=AccountNature.EQUITY.value, is_primary=True, affects_gross_profit=False, display_order=5,
    )
    g_res = AccountGroup(
        company_id=co.id, code="RES", name="Reserves & Surplus",
        nature=AccountNature.EQUITY.value, is_primary=True, affects_gross_profit=False, display_order=6,
    )
    g_od = AccountGroup(
        company_id=co.id, code="OD", name="Bank OD A/c",
        nature=AccountNature.LIABILITY.value, is_primary=True, affects_gross_profit=False, display_order=7,
    )
    g_cred = AccountGroup(
        company_id=co.id, code="SC", name="Sundry Creditors",
        nature=AccountNature.LIABILITY.value, is_primary=True, affects_gross_profit=False, display_order=8,
    )
    g_sal = AccountGroup(
        company_id=co.id, code="SAL", name="Sales Accounts",
        nature=AccountNature.INCOME.value, is_primary=True, affects_gross_profit=True, display_order=9,
    )
    g_pur = AccountGroup(
        company_id=co.id, code="PUR", name="Purchase Accounts",
        nature=AccountNature.EXPENSE.value, is_primary=True, affects_gross_profit=True, display_order=10,
    )
    g_ie = AccountGroup(
        company_id=co.id, code="IE", name="Indirect Expenses",
        nature=AccountNature.EXPENSE.value, is_primary=True, affects_gross_profit=False, display_order=11,
    )
    db.add_all([g_cash, g_bank, g_fa, g_debt, g_cap, g_res, g_od, g_cred, g_sal, g_pur, g_ie])
    await db.flush()

    # Child group under Sundry Debtors (to verify ancestor-aware reclassification)
    g_export_debt = AccountGroup(
        company_id=co.id, code="ESD", name="Export Debtors",
        parent_id=g_debt.id, nature=AccountNature.ASSET.value,
        is_primary=False, affects_gross_profit=False, display_order=12,
    )
    db.add(g_export_debt)
    await db.flush()

    ledgers_spec = [
        ("CASH", g_cash, "0", "DR"),
        ("HDFC_BANK", g_bank, "0", "DR"),
        ("FIXED_ASSET", g_fa, "0", "DR"),
        ("ACC_DEP", g_fa, "0", "CR"),
        ("CUST_A", g_export_debt, "0", "DR"),
        ("CAPITAL", g_cap, "0", "CR"),
        ("GEN_RES", g_res, "0", "CR"),
        ("SBI_OD", g_od, "0", "CR"),
        ("CRED", g_cred, "0", "CR"),
        ("SALES", g_sal, "0", "CR"),
        ("PURCH", g_pur, "0", "DR"),
        ("PURCH_RET", g_pur, "0", "DR"),
        ("DEP_EXP", g_ie, "0", "DR"),
        ("RENT", g_ie, "0", "DR"),
    ]
    ledgers = {}
    for code, grp, ob, side in ledgers_spec:
        l = Ledger(
            company_id=co.id, group_id=grp.id, code=code, name=code,
            opening_balance=Decimal(ob), opening_dr_cr=side,
            is_system_ledger=False, is_active=True,
        )
        db.add(l)
        ledgers[code] = l
    await db.commit()
    return co, fy1, fy2, ledgers


async def _post_simple(
    db: AsyncSession,
    company_id: int,
    vdate: date,
    dr_code: str,
    cr_code: str,
    amount: str,
    vtype: VoucherType = VoucherType.JOURNAL,
    voucher_number: str | None = None,
):
    amt = Decimal(amount)
    return await create_voucher(
        db,
        VoucherCreate(
            voucher_type=vtype,
            voucher_date=vdate,
            voucher_number=voucher_number,
            narration=f"Test {dr_code} -> {cr_code}",
            status=VoucherStatus.POSTED,
            lines=[
                VoucherLineCreate(account_code=dr_code, debit_amount=amt, credit_amount=Decimal("0")),
                VoucherLineCreate(account_code=cr_code, debit_amount=Decimal("0"), credit_amount=amt),
            ],
        ),
        company_id=company_id,
    )


@pytest.mark.asyncio
async def test_q1_contra_accounts_and_ancestor_reclassification(audit_sessionmaker) -> None:
    async with audit_sessionmaker() as db:
        co, _fy1, fy2, _ledgers = await _seed_rich_company(db)
        d = fy2.start_date

        await _post_simple(db, co.id, d, "FIXED_ASSET", "CAPITAL", "100000.0000")
        await _post_simple(db, co.id, d, "DEP_EXP", "ACC_DEP", "10000.0000")
        await _post_simple(db, co.id, d, "PURCH", "HDFC_BANK", "25000.0000")    # HDFC_BANK -> 25k CR (overdrawn)
        await _post_simple(db, co.id, d, "SBI_OD", "PURCH_RET", "5000.0000")     # SBI_OD -> 5k DR, PURCH_RET -> 5k CR
        await _post_simple(db, co.id, d, "SBI_OD", "CUST_A", "8000.0000")        # CUST_A (child Export Debtors) -> 8k CR

        pl = await get_profit_loss(db, company_id=co.id, from_date=fy2.start_date, to_date=fy2.end_date)
        assert pl.total_direct_expenses == Decimal("20000.0000")
        assert pl.gross_profit == Decimal("-20000.0000")
        assert pl.net_profit == Decimal("-30000.0000")

        bs = await get_balance_sheet(db, company_id=co.id, as_of_date=fy2.end_date)
        assert bs.is_balanced is True
        assert bs.difference == Decimal("0.0000")
        assert bs.current_period_net_profit == pl.net_profit

        assert bs.total_assets == Decimal("103000.0000")
        assert bs.total_liabilities == Decimal("33000.0000")
        assert bs.total_liabilities_and_equity == Decimal("103000.0000")

        # Unique non-colliding group_ids inside each BS section
        liab_ids = [g.group_id for g in bs.liabilities]
        assert len(liab_ids) == len(set(liab_ids))
        assert any(g.group_name == "Advances from Customers (reclassified)" for g in bs.liabilities)
        assert any(g.group_name == "Bank Balances - OD Surplus (reclassified)" for g in bs.assets)


@pytest.mark.asyncio
async def test_q2_midyear_tieout_to_date_only_and_coa_fy_scoping(audit_sessionmaker) -> None:
    async with audit_sessionmaker() as db:
        co, fy1, fy2, ledgers = await _seed_rich_company(db)

        # Prior FY (FY 2025-26): +120,000 NP (and Rs 20,000 General Reserve so Reserves & Surplus group exists)
        await _post_simple(db, co.id, date(2025, 10, 1), "CASH", "GEN_RES", "20000.0000")
        await _post_simple(db, co.id, date(2025, 10, 15), "CASH", "SALES", "200000.0000")
        await _post_simple(db, co.id, date(2025, 11, 15), "RENT", "CASH", "80000.0000")

        # Current FY Q1 (Apr-Jun 2026): +50,000 NP
        await _post_simple(db, co.id, date(2026, 5, 10), "CASH", "SALES", "90000.0000")
        await _post_simple(db, co.id, date(2026, 6, 10), "RENT", "CASH", "40000.0000")

        # Current FY Q2 (Jul-Sep 2026): -15,000 Net Loss
        await _post_simple(db, co.id, date(2026, 8, 10), "CASH", "SALES", "10000.0000")
        await _post_simple(db, co.id, date(2026, 9, 10), "RENT", "CASH", "25000.0000")

        # 1. Arbitrary Q2 mid-year tie-out
        q2_pl = await get_profit_loss(
            db, company_id=co.id, from_date=date(2026, 7, 1), to_date=date(2026, 9, 30)
        )
        q2_bs = await get_balance_sheet(
            db, company_id=co.id, from_date=date(2026, 7, 1), as_of_date=date(2026, 9, 30)
        )
        assert q2_pl.net_profit == Decimal("-15000.0000")
        assert q2_bs.current_period_net_profit == q2_pl.net_profit
        assert q2_bs.retained_earnings_brought_forward == Decimal("170000.0000")
        assert q2_bs.is_balanced is True

        # Reserves & Surplus merged cleanly into single real group (no duplicate group_id=0)
        res_groups = [g for g in q2_bs.equity if g.group_name == "Reserves & Surplus"]
        assert len(res_groups) == 1
        assert res_groups[0].total == Decimal("190000.0000")

        # 2. Prior-FY to_date-only queries must not crash against date.today()
        prior_pl = await get_profit_loss(db, company_id=co.id, to_date=fy1.end_date)
        assert prior_pl.from_date == fy1.start_date
        assert prior_pl.net_profit == Decimal("120000.0000")

        prior_tb = await get_trial_balance(db, company_id=co.id, to_date=fy1.end_date)
        assert prior_tb.from_date == fy1.start_date and prior_tb.is_balanced

        prior_stmt = await get_ledger_statement(
            db, ledgers["CASH"].id, company_id=co.id, to_date=fy1.end_date
        )
        assert prior_stmt.from_date == fy1.start_date
        assert prior_stmt.closing_balance == Decimal("140000.0000")

        # 3. CoA in FY2 must reset nominal balances (Sales = 100,000 not 300,000) & zero Credit-normal shows CR
        coa_ledgers = {l.code: l for l in await list_ledgers(db, company_id=co.id, as_of_date=fy2.end_date)}
        assert coa_ledgers["SALES"].closing_balance == Decimal("100000.0000")
        assert coa_ledgers["SALES"].closing_dr_cr == DrCr.CR
        assert coa_ledgers["CRED"].closing_balance == Decimal("0.0000")
        assert coa_ledgers["CRED"].closing_dr_cr == DrCr.CR

        # 4. Deactivating RENT preserves its historical balance inside Indirect Expenses group roll-up
        ledgers["RENT"].is_active = False
        await db.commit()
        coa_groups = {g.name: g for g in await list_account_groups(db, company_id=co.id, as_of_date=fy2.end_date)}
        assert coa_groups["Indirect Expenses"].closing_balance == Decimal("65000.0000")
        assert coa_groups["Indirect Expenses"].ledger_count == 1  # only DEP_EXP is active


@pytest.mark.asyncio
async def test_q3_wal_concurrency_validation_and_header_immutability(audit_sessionmaker) -> None:
    async with audit_sessionmaker() as db:
        co, _fy1, fy2, _ledgers = await _seed_rich_company(db)
        co_id = co.id

    async def _write_one(idx: int) -> str:
        async with audit_sessionmaker() as s:
            v = await _post_simple(
                s, co_id, date(2026, 5, 1), "CASH", "SALES", f"{100 + idx}.0000",
                vtype=VoucherType.SALES,
            )
            return v.voucher_number

    async def _read_one() -> bool:
        async with audit_sessionmaker() as s:
            tb = await get_trial_balance(s, company_id=co_id, from_date=fy2.start_date, to_date=fy2.end_date)
            return tb.is_balanced

    results = await asyncio.gather(
        *[_write_one(i) for i in range(10)],
        *[_read_one() for _ in range(5)],
    )
    numbers = sorted(r for r in results if isinstance(r, str))
    tb_flags = [r for r in results if isinstance(r, bool)]
    assert numbers == [f"SAL/26-27/{i:04d}" for i in range(1, 11)]
    assert all(tb_flags)

    # Attempt invalid direct CANCELLED creation -> rejected at schema & service layers without consuming 0011
    async with audit_sessionmaker() as s:
        with pytest.raises(ValidationError):
            VoucherCreate(
                voucher_type=VoucherType.SALES,
                voucher_date=date(2026, 5, 2),
                narration="Illegal direct cancel",
                status=VoucherStatus.CANCELLED,
                lines=[
                    VoucherLineCreate(account_code="CASH", debit_amount=Decimal("50"), credit_amount=Decimal("0")),
                    VoucherLineCreate(account_code="SALES", debit_amount=Decimal("0"), credit_amount=Decimal("10")),
                ],
            )
        with pytest.raises(InvalidVoucherError):
            await create_voucher(
                s,
                VoucherCreate.model_construct(
                    voucher_type=VoucherType.SALES,
                    voucher_date=date(2026, 5, 2),
                    voucher_number=None,
                    reference_no=None,
                    narration="Bypassed schema cancel",
                    status=VoucherStatus.CANCELLED,
                    lines=[
                        VoucherLineCreate(account_code="CASH", debit_amount=Decimal("50"), credit_amount=Decimal("0")),
                        VoucherLineCreate(account_code="SALES", debit_amount=Decimal("0"), credit_amount=Decimal("10")),
                    ],
                ),
                company_id=co_id,
            )

        # Reject invalid/over-16-char manual voucher number
        with pytest.raises(InvalidVoucherError):
            await _post_simple(
                s, co_id, date(2026, 5, 2), "CASH", "SALES", "50.0000",
                vtype=VoucherType.SALES, voucher_number="TOO-LONG-INVOICE-17",
            )

        # Lowercase manual number normalizes to uppercase and leaves sequence 0011 intact
        v_manual = await _post_simple(
            s, co_id, date(2026, 5, 2), "CASH", "SALES", "50.0000",
            vtype=VoucherType.PAYMENT, voucher_number="man/001",
        )
        assert v_manual.voucher_number == "MAN/001"
        assert v_manual.particulars == "CASH"

        v11 = await _post_simple(
            s, co_id, date(2026, 5, 2), "CASH", "SALES", "50.0000", vtype=VoucherType.SALES
        )
        assert v11.voucher_number == "SAL/26-27/0011"
        assert v11.particulars == "CASH"

        # Header immutability & delete-protection triggers (m2_0008)
        with pytest.raises(IntegrityError):
            await s.execute(
                text("UPDATE vouchers SET voucher_date = '2026-05-03' WHERE id = :id"),
                {"id": v11.id},
            )
        await s.rollback()

        with pytest.raises(IntegrityError):
            await s.execute(
                text("DELETE FROM vouchers WHERE id = :id"),
                {"id": v11.id},
            )
        await s.rollback()
