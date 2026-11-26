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
