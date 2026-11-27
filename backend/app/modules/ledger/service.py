from __future__ import annotations

# =============================================================================
# LedgerPrime -- modules/ledger/service.py  (Milestone 2 -- PATCHED, independent review)
#
# Every behavioural change is tagged  PATCH(Qn)  where n maps to the review question:
#   Q1 sign conventions / contra / negative balances
#   Q2 P&L -> Balance Sheet tie-out, retained earnings vs current period, any date range
#   Q3 concurrency, numbering, DB constraints, money-type parity
# Requires: models.ledger.VoucherSequence, exceptions.ConcurrencyConflictError,
#           Alembic revision m2_0007_integrity (see migration file in this patch set).
# =============================================================================

from collections import defaultdict
from datetime import date
from decimal import Decimal
from enum import Enum
import re

from sqlalchemy import func, literal, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import begin_write_transaction
from app.core.money import ZERO, MoneyNumeric18_4, quantize_money
from app.models.company import Company, FiscalYear
from app.models.ledger import (
    AccountGroup,
    AccountNature,
    DrCr,
    Ledger,
    Voucher,
    VoucherLine,
    VoucherSequence,
    VoucherStatus,
    VoucherType,
)
from app.modules.ledger.exceptions import (
    ConcurrencyConflictError,
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

# CGST Rule 46(b): max 16 chars, alphanumeric plus '-' and '/'
_GST_VOUCHER_NO_MAX_LEN = 16
_VOUCHER_NO_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9/-]{0,15}$")

# PATCH(Q1/Q2): nominal (temporary) accounts reset at every FY start; real accounts carry forward.
NOMINAL_NATURES: frozenset[str] = frozenset(
    {AccountNature.INCOME.value, AccountNature.EXPENSE.value}
)
CREDIT_NORMAL_NATURES: frozenset[str] = frozenset(
    {AccountNature.LIABILITY.value, AccountNature.EQUITY.value, AccountNature.INCOME.value}
)

# PATCH(Q3): typed literal so the COALESCE fallback is bound THROUGH MoneyNumeric18_4
# (scaled int on SQLite) instead of as a bare float 0.0 Numeric literal.
_MONEY_ZERO = literal(ZERO, MoneyNumeric18_4())

# PATCH(Q2): synthetic row/line used for prior-years' accumulated P&L (Tally "Profit & Loss A/c").
RETAINED_EARNINGS_LABEL = "Profit & Loss A/c (Retained Earnings b/f)"
RETAINED_EARNINGS_CODE = "P&L-BF"

# PATCH(Q1): Ancestor-aware Schedule III / Ind AS 1 opposite-balance reclassification map.
# True contra accounts (Accumulated Depreciation, Drawings) are intentionally omitted.
RECLASSIFY_OPPOSITE_BALANCE_GROUPS: dict[str, str] = {
    "Bank Accounts": "Bank Overdraft (reclassified)",
    "Bank OD A/c": "Bank Balances - OD Surplus (reclassified)",
    "Sundry Debtors": "Advances from Customers (reclassified)",
    "Sundry Creditors": "Advances to Suppliers (reclassified)",
}


# ---------------------------------------------------------------------------
# Internal Helpers (Exact Decimal Sign Conventions)
# ---------------------------------------------------------------------------


def _enum_value(value: object) -> str:
    """PATCH(Q1): normalise str-or-Enum column values (Enum() column vs String column)."""
    return value.value if isinstance(value, Enum) else str(value)


def _is_nominal(ledger: Ledger) -> bool:
    return _enum_value(ledger.group.nature) in NOMINAL_NATURES


def _opening_signed(ledger: Ledger) -> Decimal:
    """Debit-positive signed opening balance (as at books-beginning date)."""
    bal = quantize_money(ledger.opening_balance)
    side = DrCr(_enum_value(ledger.opening_dr_cr))
    return bal if side is DrCr.DR else -bal


def _split_signed_balance(
    signed: Decimal, *, normal_nature: AccountNature | str | None = None
) -> tuple[Decimal, DrCr]:
    """Converts Debit-positive signed balance into unsigned amount + DR/CR side."""
    q = quantize_money(signed)
    if q == ZERO:
        if normal_nature is not None and _enum_value(normal_nature) in CREDIT_NORMAL_NATURES:
            return ZERO, DrCr.CR
        return ZERO, DrCr.DR
    if q > ZERO:
        return q, DrCr.DR
    return abs(q), DrCr.CR


def _group_ancestor_names(
    group_id: int, groups_by_id: dict[int, AccountGroup]
) -> list[str]:
    """Walks self -> root parent chain so child groups inherit parent classification rules."""
    names: list[str] = []
    seen: set[int] = set()
    curr_id: int | None = group_id
    while curr_id is not None and curr_id not in seen:
        seen.add(curr_id)
        grp = groups_by_id.get(curr_id)
        if grp is None:
            break
        names.append(grp.name)
        curr_id = grp.parent_id
    return names


def _resolve_reclass_label(
    group_id: int, groups_by_id: dict[int, AccountGroup]
) -> str | None:
    for name in _group_ancestor_names(group_id, groups_by_id):
        label = RECLASSIFY_OPPOSITE_BALANCE_GROUPS.get(name)
        if label:
            return label
    return None


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
    if voucher.voucher_type in (VoucherType.PURCHASE.value, VoucherType.RECEIPT.value):
        cr_line = next((ln for ln in lines_out if ln.credit_amount > ZERO), None)
        if cr_line is not None:
            particulars = cr_line.ledger_name
    elif voucher.voucher_type in (VoucherType.SALES.value, VoucherType.PAYMENT.value):
        dr_line = next((ln for ln in lines_out if ln.debit_amount > ZERO), None)
        if dr_line is not None:
            particulars = dr_line.ledger_name

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


# ---------------------------------------------------------------------------
# PATCH(Q2/Q3): Company / Fiscal-Year resolution BY DATE (never "latest FY")
# ---------------------------------------------------------------------------


async def _get_company(db: AsyncSession, company_id: int | None) -> Company:
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
    return company


async def _fy_for_date(
    db: AsyncSession, company_id: int, on_date: date
) -> FiscalYear | None:
    stmt = select(FiscalYear).where(
        FiscalYear.company_id == company_id,
        FiscalYear.start_date <= on_date,
        FiscalYear.end_date >= on_date,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _books_beginning_date(db: AsyncSession, company: Company) -> date:
    """Date the scalar ``ledgers.opening_balance`` values are stated at.

    INVARIANT: ``ledgers.opening_balance`` is the balance at the earliest FiscalYear
    start date (books-beginning date) and is NEVER rewritten by FY carry-forward.
    Every report derives later openings from posted history.
    """
    first = (
        await db.execute(
            select(func.min(FiscalYear.start_date)).where(
                FiscalYear.company_id == company.id
            )
        )
    ).scalar_one_or_none()
    if first is None:
        raise ResourceNotFoundError(f"No fiscal year configured for company '{company.name}'.")
    return first


def _assert_period_open(fy: FiscalYear, _on_date: date) -> None:
    """Reject mutations into a locked FiscalYear using the explicit FiscalYear.is_locked column."""
    if fy.is_locked:
        raise FiscalYearLockedError(f"Fiscal year {fy.label} is locked.")


async def get_active_company_and_fy(
    db: AsyncSession,
    company_id: int | None = None,
    on_date: date | None = None,
) -> tuple[Company, FiscalYear]:
    """PATCH(Q2): resolve the FY that CONTAINS ``on_date`` (default: today), falling back to
    the latest FY only for display defaults."""
    company = await _get_company(db, company_id)
    target = on_date or date.today()
    fy = await _fy_for_date(db, company.id, target)
    if fy is None and on_date is None:
        fy = (
            await db.execute(
                select(FiscalYear)
                .where(FiscalYear.company_id == company.id)
                .order_by(FiscalYear.start_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if fy is None:
        raise ResourceNotFoundError(
            f"No fiscal year configured for company '{company.name}' covering {target.isoformat()}."
        )
    return company, fy


# ---------------------------------------------------------------------------
# PATCH(Q3): Write serialisation, gapless numbering, DB-error mapping
# ---------------------------------------------------------------------------


def _dialect_name(db: AsyncSession) -> str:
    return db.get_bind().dialect.name


async def _acquire_company_write_lock(db: AsyncSession, company_id: int) -> None:
    """Serialise ledger writes per tenant for the rest of the transaction."""
    if _dialect_name(db) == "postgresql":
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:k)"),
            {"k": (0x4C50 << 32) | int(company_id)},
        )


def _voucher_prefix(fy: FiscalYear, voucher_type: VoucherType) -> str:
    return f"{VOUCHER_TYPE_PREFIX[voucher_type]}/{_format_fy_code(fy)}/"


async def _next_voucher_number(
    db: AsyncSession,
    company_id: int,
    fy: FiscalYear,
    voucher_type: VoucherType,
) -> str:
    """Gapless, race-free, per (company, FY, type) series."""
    insert_fn = pg_insert if _dialect_name(db) == "postgresql" else sqlite_insert
    stmt = (
        insert_fn(VoucherSequence)
        .values(
            company_id=company_id,
            fiscal_year_id=fy.id,
            voucher_type=voucher_type.value,
            last_value=1,
        )
        .on_conflict_do_update(
            index_elements=["company_id", "fiscal_year_id", "voucher_type"],
            set_={"last_value": VoucherSequence.last_value + 1},
        )
        .returning(VoucherSequence.last_value)
    )
    seq = int((await db.execute(stmt)).scalar_one())
    return f"{_voucher_prefix(fy, voucher_type)}{seq:04d}"


def _is_sqlite_busy(exc: OperationalError) -> bool:
    msg = str(getattr(exc, "orig", exc)).lower()
    return "database is locked" in msg or "database is busy" in msg


def _map_integrity_error(exc: IntegrityError, voucher_number: str, fy: FiscalYear) -> Exception:
    msg = str(getattr(exc, "orig", exc))
    if "uq_vouchers" in msg or "UNIQUE constraint failed: vouchers." in msg:
        if "reversed_voucher_id" in msg or "one_posted_reversal" in msg:
            return DuplicateResourceError("This voucher has already been reversed.")
        return DuplicateResourceError(
            f"Voucher number '{voucher_number}' already exists in {fy.label}."
        )
    if "ck_vouchers_posted_balanced" in msg:
        return InvalidVoucherError("Database rejected a POSTED voucher whose SUM(Dr) != SUM(Cr).")
    if "immutable" in msg or "Cannot delete POSTED" in msg or "posted voucher may only" in msg:
        return InvalidVoucherError("Posted or cancelled vouchers and their lines are immutable.")
    return InvalidVoucherError("Voucher violates a database integrity constraint.")


async def _flush_post_commit(
    db: AsyncSession, voucher: Voucher, target_status: str, voucher_number: str, fy: FiscalYear
) -> None:
    """Two-phase post: INSERT as DRAFT -> flush lines -> UPDATE status='POSTED' -> COMMIT."""
    try:
        await db.flush()
        if target_status == VoucherStatus.POSTED.value:
            voucher.status = VoucherStatus.POSTED.value
            await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _map_integrity_error(exc, voucher_number, fy) from exc
    except OperationalError as exc:
        await db.rollback()
        if _is_sqlite_busy(exc):
            raise ConcurrencyConflictError(
                "Ledger is busy with another posting; please retry."
            ) from exc
        raise


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
                func.sum(VoucherLine.debit_amount), _MONEY_ZERO, type_=MoneyNumeric18_4()
            ),
            func.coalesce(
                func.sum(VoucherLine.credit_amount), _MONEY_ZERO, type_=MoneyNumeric18_4()
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


# ---------------------------------------------------------------------------
# Chart of Accounts: Account Groups & Ledgers
# ---------------------------------------------------------------------------


async def list_account_groups(
    db: AsyncSession,
    company_id: int | None = None,
    as_of_date: date | None = None,
) -> list[AccountGroupRead]:
    company, fy = await get_active_company_and_fy(db, company_id, as_of_date)
    eff_as_of = as_of_date or fy.end_date
    books_start = await _books_beginning_date(db, company)

    groups_stmt = (
        select(AccountGroup)
        .where(AccountGroup.company_id == company.id)
        .order_by(AccountGroup.display_order.asc(), AccountGroup.code.asc())
    )
    groups = list((await db.execute(groups_stmt)).scalars().all())

    # Include inactive ledgers for balance integrity; count only active ledgers for display.
    ledgers_stmt = (
        select(Ledger)
        .options(selectinload(Ledger.group))
        .where(Ledger.company_id == company.id)
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())
    real_sums = await _fetch_posted_sums_by_ledger(db, company.id, to_date=eff_as_of)
    nom_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, from_date=fy.start_date, to_date=eff_as_of
    )

    direct_group_signed: dict[int, Decimal] = defaultdict(lambda: ZERO)
    direct_ledger_counts: dict[int, int] = defaultdict(int)
    for ledger in ledgers:
        if _is_nominal(ledger):
            closing_signed = _nominal_opening_in_fy(ledger, books_start, fy) + _net(
                nom_sums, ledger.id
            )
        else:
            closing_signed = _opening_signed(ledger) + _net(real_sums, ledger.id)
        direct_group_signed[ledger.group_id] += closing_signed
        if ledger.is_active:
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
        abs_bal, side = _split_signed_balance(signed_bal, normal_nature=grp.nature)
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
    as_of_date: date | None = None,
) -> list[LedgerRead]:
    company, fy = await get_active_company_and_fy(db, company_id, as_of_date)
    eff_as_of = as_of_date or fy.end_date
    books_start = await _books_beginning_date(db, company)

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
    real_sums = await _fetch_posted_sums_by_ledger(db, company.id, to_date=eff_as_of)
    nom_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, from_date=fy.start_date, to_date=eff_as_of
    )

    result: list[LedgerRead] = []
    for ledger in ledgers:
        if _is_nominal(ledger):
            closing_signed = _nominal_opening_in_fy(ledger, books_start, fy) + _net(
                nom_sums, ledger.id
            )
        else:
            closing_signed = _opening_signed(ledger) + _net(real_sums, ledger.id)
        abs_bal, side = _split_signed_balance(closing_signed, normal_nature=ledger.group.nature)
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
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    group = await db.get(AccountGroup, payload.group_id)
    if group is None or group.company_id != company.id:
        raise ResourceNotFoundError(
            f"AccountGroup id={payload.group_id} not found for company."
        )

    opening = quantize_money(payload.opening_balance)
    if opening < ZERO:
        raise InvalidVoucherError(
            "opening_balance must be >= 0.0000; express the side via opening_dr_cr (DR/CR)."
        )

    ledger = Ledger(
        company_id=company.id,
        group_id=group.id,
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        opening_balance=opening,
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
    except OperationalError as exc:
        await db.rollback()
        if _is_sqlite_busy(exc):
            raise ConcurrencyConflictError(
                "Ledger master is busy with another write; please retry."
            ) from exc
        raise

    await db.refresh(ledger, attribute_names=["group"])
    abs_bal, side = _split_signed_balance(
        _opening_signed(ledger), normal_nature=ledger.group.nature
    )
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
    if payload.status == VoucherStatus.CANCELLED:
        raise InvalidVoucherError(
            "Vouchers cannot be created directly in CANCELLED status; create as DRAFT or POSTED."
        )
    if len(payload.lines) < 2:
        raise InvalidVoucherError("A double-entry voucher requires at least 2 lines.")

    # Acquire write lock BEFORE reading FiscalYear.is_locked and Ledger.is_active (eliminates TOCTOU).
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    # PATCH(Q3): FY is the one CONTAINING voucher_date (not the latest FY).
    fy = await _fy_for_date(db, company.id, payload.voucher_date)
    if fy is None:
        raise InvalidVoucherError(
            f"Voucher date {payload.voucher_date.isoformat()} is not inside any configured fiscal year."
        )
    _assert_period_open(fy, payload.voucher_date)

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
    if not filters:
        raise InvalidVoucherError("Every line must reference a ledger_id or account_code.")

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

    auto_prefix = _voucher_prefix(fy, payload.voucher_type)
    manual_no = (payload.voucher_number or "").strip().upper()
    if manual_no:
        if manual_no.startswith(auto_prefix.upper()):
            raise InvalidVoucherError(
                f"'{manual_no}' is inside the reserved automatic series '{auto_prefix}####'; "
                "omit voucher_number to auto-assign."
            )
        if not _VOUCHER_NO_PATTERN.match(manual_no):
            raise InvalidVoucherError(
                f"Voucher number '{manual_no}' must be 1-{_GST_VOUCHER_NO_MAX_LEN} chars "
                "(A-Z, 0-9, '-', '/') for CGST Rule 46(b) compliance."
            )

    voucher_number = manual_no or await _next_voucher_number(
        db, company.id, fy, payload.voucher_type
    )
    if len(voucher_number) > _GST_VOUCHER_NO_MAX_LEN:
        raise InvalidVoucherError(
            f"Generated voucher number '{voucher_number}' exceeds the 16-character CGST Rule 46(b) limit."
        )

    target_status = payload.status.value
    voucher = Voucher(
        company_id=company.id,
        fiscal_year_id=fy.id,
        voucher_number=voucher_number,
        voucher_type=payload.voucher_type.value,
        voucher_date=payload.voucher_date,
        reference_no=payload.reference_no.strip() if payload.reference_no else None,
        narration=payload.narration.strip(),
        status=VoucherStatus.DRAFT.value
        if target_status == VoucherStatus.POSTED.value
        else target_status,
        lines=orm_lines,
    )
    db.add(voucher)
    await _flush_post_commit(db, voucher, target_status, voucher_number, fy)

    return await get_voucher(db, voucher.id, company_id=company.id)


async def get_voucher(
    db: AsyncSession, voucher_id: int, company_id: int | None = None
) -> VoucherRead:
    company = await _get_company(db, company_id)
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
    - create_reversal=False: status -> CANCELLED. Allowed only while the ORIGINAL voucher's
      period is open.
    - create_reversal=True: keeps original POSTED and posts a mirror JOURNAL numbered,
      locked-checked and dated in the REVERSAL's fiscal year.
    """
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    stmt = (
        select(Voucher)
        .options(selectinload(Voucher.lines).selectinload(VoucherLine.ledger))
        .where(Voucher.id == voucher_id, Voucher.company_id == company.id)
    )
    voucher = (await db.execute(stmt)).scalar_one_or_none()
    if voucher is None:
        raise ResourceNotFoundError(f"Voucher id={voucher_id} not found.")

    voucher_fy = await db.get(FiscalYear, voucher.fiscal_year_id)
    if voucher_fy is None:
        raise ResourceNotFoundError(f"Fiscal year id={voucher.fiscal_year_id} not found.")

    if voucher.status == VoucherStatus.CANCELLED.value:
        raise InvalidVoucherError(f"Voucher {voucher.voucher_number} is already CANCELLED.")

    existing_rev_stmt = select(Voucher.id).where(
        Voucher.company_id == company.id,
        Voucher.reversed_voucher_id == voucher.id,
        Voucher.status == VoucherStatus.POSTED.value,
    )
    if (await db.execute(existing_rev_stmt)).scalar_one_or_none() is not None:
        raise DuplicateResourceError(f"Voucher {voucher.voucher_number} has already been reversed.")

    reason_note = (
        f" | Reason: {payload.reason.strip()}" if payload.reason and payload.reason.strip() else ""
    )

    if not payload.create_reversal:
        _assert_period_open(voucher_fy, voucher.voucher_date)
        voucher.status = VoucherStatus.CANCELLED.value
        if reason_note:
            voucher.narration = f"{voucher.narration}{reason_note}"[:500]
        await _flush_post_commit(
            db, voucher, VoucherStatus.CANCELLED.value, voucher.voucher_number, voucher_fy
        )
        updated = await get_voucher(db, voucher.id, company_id=company.id)
        return VoucherCancelResponse(original_voucher=updated, reversal_voucher=None, action="CANCELLED")

    if voucher.status != VoucherStatus.POSTED.value:
        raise InvalidVoucherError("Only POSTED vouchers can be reversed with a mirror journal entry.")

    rev_date: date = payload.reversal_date or voucher.voucher_date
    if rev_date < voucher.voucher_date:
        raise InvalidVoucherError("A reversal cannot be dated before the voucher it reverses.")
    rev_fy = (
        voucher_fy
        if voucher_fy.start_date <= rev_date <= voucher_fy.end_date
        else await _fy_for_date(db, company.id, rev_date)
    )
    if rev_fy is None:
        raise InvalidVoucherError(f"No fiscal year covers reversal date {rev_date.isoformat()}.")
    _assert_period_open(rev_fy, rev_date)

    rev_number = await _next_voucher_number(db, company.id, rev_fy, VoucherType.JOURNAL)
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
        fiscal_year_id=rev_fy.id,
        voucher_number=rev_number,
        voucher_type=VoucherType.JOURNAL.value,
        voucher_date=rev_date,
        reference_no=voucher.voucher_number,
        narration=f"Reversal of {voucher.voucher_number}{reason_note}"[:500],
        status=VoucherStatus.DRAFT.value,
        reversed_voucher_id=voucher.id,
        lines=mirror_lines,
    )
    db.add(reversal)
    await _flush_post_commit(db, reversal, VoucherStatus.POSTED.value, rev_number, rev_fy)

    original_read = await get_voucher(db, voucher.id, company_id=company.id)
    reversal_read = await get_voucher(db, reversal.id, company_id=company.id)
    return VoucherCancelResponse(
        original_voucher=original_read, reversal_voucher=reversal_read, action="REVERSED"
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


# ---------------------------------------------------------------------------
# PATCH(Q2): FY-aware balance decomposition shared by Ledger Statement / TB / P&L / BS
# ---------------------------------------------------------------------------


def _net(sums: dict[int, tuple[Decimal, Decimal]], ledger_id: int) -> Decimal:
    dr, cr = sums.get(ledger_id, (ZERO, ZERO))
    return dr - cr


def _nominal_opening_in_fy(ledger: Ledger, books_start: date, fy: FiscalYear) -> Decimal:
    return _opening_signed(ledger) if books_start >= fy.start_date else ZERO


def _nominal_opening_prior(ledger: Ledger, books_start: date, fy: FiscalYear) -> Decimal:
    return _opening_signed(ledger) if books_start < fy.start_date else ZERO


async def get_ledger_statement(
    db: AsyncSession,
    ledger_id: int,
    *,
    company_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> LedgerStatementRead:
    anchor_date = from_date or to_date
    company, default_fy = await get_active_company_and_fy(db, company_id, anchor_date)
    eff_from = from_date or default_fy.start_date
    eff_to = to_date or default_fy.end_date
    if eff_from > eff_to:
        raise InvalidVoucherError("from_date must be on or before to_date.")

    ledger_stmt = (
        select(Ledger)
        .options(selectinload(Ledger.group))
        .where(Ledger.id == ledger_id, Ledger.company_id == company.id)
    )
    ledger = (await db.execute(ledger_stmt)).scalar_one_or_none()
    if ledger is None:
        raise ResourceNotFoundError(f"Ledger id={ledger_id} not found.")

    fy = await _fy_for_date(db, company.id, eff_from) or default_fy
    books_start = await _books_beginning_date(db, company)

    if _is_nominal(ledger):
        pre = await _fetch_posted_sums_by_ledger(
            db, company.id, from_date=fy.start_date, before_date=eff_from
        )
        opening_signed = _nominal_opening_in_fy(ledger, books_start, fy) + _net(pre, ledger.id)
    else:
        pre = await _fetch_posted_sums_by_ledger(db, company.id, before_date=eff_from)
        opening_signed = _opening_signed(ledger) + _net(pre, ledger.id)
    open_abs, open_side = _split_signed_balance(opening_signed)

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
        group_nature=AccountNature(_enum_value(ledger.group.nature)),
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
    anchor_date = from_date or to_date
    company, default_fy = await get_active_company_and_fy(db, company_id, anchor_date)
    eff_from = from_date or default_fy.start_date
    eff_to = to_date or default_fy.end_date
    if eff_from > eff_to:
        raise InvalidVoucherError("from_date must be on or before to_date.")
    fy = await _fy_for_date(db, company.id, eff_from) or default_fy
    books_start = await _books_beginning_date(db, company)

    ledgers_stmt = (
        select(Ledger)
        .join(AccountGroup, Ledger.group_id == AccountGroup.id)
        .options(selectinload(Ledger.group))
        .where(Ledger.company_id == company.id)
        .order_by(AccountGroup.display_order.asc(), Ledger.code.asc())
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())

    pre_all = await _fetch_posted_sums_by_ledger(db, company.id, before_date=eff_from)
    pre_in_fy = await _fetch_posted_sums_by_ledger(
        db, company.id, from_date=fy.start_date, before_date=eff_from
    )
    prior_years = await _fetch_posted_sums_by_ledger(db, company.id, before_date=fy.start_date)
    period_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, from_date=eff_from, to_date=eff_to
    )

    rows: list[TrialBalanceRow] = []
    group_acc: dict[int, dict] = {}
    tot = defaultdict(lambda: ZERO)
    retained_signed = ZERO

    def _accumulate(row: TrialBalanceRow) -> None:
        for k in ("opening_debit", "opening_credit", "period_debit", "period_credit",
                  "closing_debit", "closing_credit"):
            tot[k] += getattr(row, k)
        g = group_acc.setdefault(
            row.group_id,
            {"group_id": row.group_id, "group_name": row.group_name, "nature": row.nature,
             "opening_debit": ZERO, "opening_credit": ZERO, "period_debit": ZERO,
             "period_credit": ZERO, "closing_debit": ZERO, "closing_credit": ZERO},
        )
        for k in ("opening_debit", "opening_credit", "period_debit", "period_credit",
                  "closing_debit", "closing_credit"):
            g[k] += getattr(row, k)

    for ledger in ledgers:
        p_dr, p_cr = period_sums.get(ledger.id, (ZERO, ZERO))
        if _is_nominal(ledger):
            open_signed = _nominal_opening_in_fy(ledger, books_start, fy) + _net(pre_in_fy, ledger.id)
            retained_signed += _nominal_opening_prior(ledger, books_start, fy) + _net(prior_years, ledger.id)
        else:
            open_signed = _opening_signed(ledger) + _net(pre_all, ledger.id)
        close_signed = open_signed + p_dr - p_cr
        o_dr, o_cr = _to_dr_cr_columns(open_signed)
        c_dr, c_cr = _to_dr_cr_columns(close_signed)
        if not include_zero and not any((o_dr, o_cr, p_dr, p_cr, c_dr, c_cr)):
            continue
        row = TrialBalanceRow(
            ledger_id=ledger.id,
            ledger_code=ledger.code,
            ledger_name=ledger.name,
            group_id=ledger.group_id,
            group_name=ledger.group.name,
            nature=AccountNature(_enum_value(ledger.group.nature)),
            opening_debit=o_dr,
            opening_credit=o_cr,
            period_debit=p_dr,
            period_credit=p_cr,
            closing_debit=c_dr,
            closing_credit=c_cr,
        )
        rows.append(row)
        _accumulate(row)

    reserves_group = next(
        (l.group for l in ledgers if l.group.name == "Reserves & Surplus"), None
    )
    re_group_id = reserves_group.id if reserves_group is not None else -1
    re_group_name = reserves_group.name if reserves_group is not None else "Reserves & Surplus"

    if retained_signed != ZERO:
        r_dr, r_cr = _to_dr_cr_columns(retained_signed)
        row = TrialBalanceRow(
            ledger_id=0,
            ledger_code=RETAINED_EARNINGS_CODE,
            ledger_name=RETAINED_EARNINGS_LABEL,
            group_id=re_group_id,
            group_name=re_group_name,
            nature=AccountNature.EQUITY,
            opening_debit=r_dr,
            opening_credit=r_cr,
            period_debit=ZERO,
            period_credit=ZERO,
            closing_debit=r_dr,
            closing_credit=r_cr,
        )
        rows.append(row)
        _accumulate(row)

    difference = abs(tot["closing_debit"] - tot["closing_credit"])
    return TrialBalanceReportRead(
        from_date=eff_from,
        to_date=eff_to,
        rows=rows,
        groups=[TrialBalanceGroupSummary(**v) for v in group_acc.values()],
        total_opening_debit=tot["opening_debit"],
        total_opening_credit=tot["opening_credit"],
        total_period_debit=tot["period_debit"],
        total_period_credit=tot["period_credit"],
        total_debit=tot["closing_debit"],
        total_credit=tot["closing_credit"],
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
    anchor_date = from_date or to_date
    company, default_fy = await get_active_company_and_fy(db, company_id, anchor_date)
    eff_from = from_date or default_fy.start_date
    eff_to = to_date or default_fy.end_date
    if eff_from > eff_to:
        raise InvalidVoucherError("from_date must be on or before to_date.")
    books_start = await _books_beginning_date(db, company)

    include_nominal_opening = eff_from <= books_start <= eff_to

    ledgers_stmt = (
        select(Ledger)
        .join(AccountGroup, Ledger.group_id == AccountGroup.id)
        .options(selectinload(Ledger.group))
        .where(
            Ledger.company_id == company.id,
            AccountGroup.nature.in_([AccountNature.INCOME.value, AccountNature.EXPENSE.value]),
        )
        .order_by(AccountGroup.display_order.asc(), Ledger.code.asc())
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())
    period_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, from_date=eff_from, to_date=eff_to
    )

    buckets: dict[tuple[str, bool], list[StatementLineItem]] = defaultdict(list)
    totals: dict[tuple[str, bool], Decimal] = defaultdict(lambda: ZERO)

    for ledger in ledgers:
        open_s = _opening_signed(ledger) if include_nominal_opening else ZERO
        signed = open_s + _net(period_sums, ledger.id)
        nature = _enum_value(ledger.group.nature)
        amt = -signed if nature == AccountNature.INCOME.value else signed
        if amt == ZERO:
            continue
        key = (nature, bool(ledger.group.affects_gross_profit))
        buckets[key].append(
            StatementLineItem(
                ledger_id=ledger.id, ledger_code=ledger.code, ledger_name=ledger.name,
                group_name=ledger.group.name, amount=amt,
            )
        )
        totals[key] += amt

    inc, exp = AccountNature.INCOME.value, AccountNature.EXPENSE.value
    gross_profit = totals[(inc, True)] - totals[(exp, True)]
    net_profit = gross_profit + totals[(inc, False)] - totals[(exp, False)]

    return ProfitLossReportRead(
        from_date=eff_from,
        to_date=eff_to,
        direct_income=buckets[(inc, True)],
        direct_expenses=buckets[(exp, True)],
        total_direct_income=totals[(inc, True)],
        total_direct_expenses=totals[(exp, True)],
        gross_profit=gross_profit,
        indirect_income=buckets[(inc, False)],
        indirect_expenses=buckets[(exp, False)],
        total_indirect_income=totals[(inc, False)],
        total_indirect_expenses=totals[(exp, False)],
        net_profit=net_profit,
    )


async def get_balance_sheet(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    as_of_date: date | None = None,
    from_date: date | None = None,
) -> BalanceSheetReportRead:
    company = await _get_company(db, company_id)
    books_start = await _books_beginning_date(db, company)

    if as_of_date is not None and as_of_date < books_start:
        raise InvalidVoucherError("as_of_date is before the books-beginning date.")

    _, fy = await get_active_company_and_fy(db, company.id, as_of_date)
    eff_as_of = as_of_date or fy.end_date
    eff_from = from_date or fy.start_date
    if eff_from > eff_as_of:
        raise InvalidVoucherError("from_date must be on or before as_of_date.")

    groups = list(
        (
            await db.execute(
                select(AccountGroup).where(AccountGroup.company_id == company.id)
            )
        )
        .scalars()
        .all()
    )
    groups_by_id = {g.id: g for g in groups}
    reserves_group = next((g for g in groups if g.name == "Reserves & Surplus"), None)

    ledgers_stmt = (
        select(Ledger)
        .join(AccountGroup, Ledger.group_id == AccountGroup.id)
        .options(selectinload(Ledger.group))
        .where(Ledger.company_id == company.id)
        .order_by(AccountGroup.display_order.asc(), Ledger.code.asc())
    )
    ledgers = list((await db.execute(ledgers_stmt)).scalars().all())

    to_date_sums = await _fetch_posted_sums_by_ledger(db, company.id, to_date=eff_as_of)
    # Partition nominal accounts around eff_from so current_period_net_profit ALWAYS
    # ties out to get_profit_loss(from_date=eff_from, to_date=eff_as_of).net_profit.
    current_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, from_date=eff_from, to_date=eff_as_of
    )
    prior_sums = await _fetch_posted_sums_by_ledger(
        db, company.id, before_date=eff_from
    )

    sections: dict[str, dict[int | str, BalanceSheetSectionGroup]] = {
        AccountNature.ASSET.value: {},
        AccountNature.LIABILITY.value: {},
        AccountNature.EQUITY.value: {},
    }
    totals = defaultdict(lambda: ZERO)
    current_np = ZERO
    retained_bf = ZERO
    opening_difference = ZERO
    include_nom_op_in_current = eff_from <= books_start <= eff_as_of
    include_nom_op_in_prior = books_start < eff_from

    def _place(
        section: str,
        gkey: int | str,
        gid: int,
        gname: str,
        item: StatementLineItem,
    ) -> None:
        grp = sections[section].get(gkey)
        if grp is None:
            grp = BalanceSheetSectionGroup(
                group_id=gid,
                group_name=gname,
                nature=AccountNature(section),
                total=ZERO,
                ledgers=[],
            )
            sections[section][gkey] = grp
        grp.total += item.amount
        grp.ledgers.append(item)
        totals[section] += item.amount

    for ledger in ledgers:
        op = _opening_signed(ledger)
        opening_difference += op
        nature = _enum_value(ledger.group.nature)

        if nature in NOMINAL_NATURES:
            cur = (op if include_nom_op_in_current else ZERO) + _net(current_sums, ledger.id)
            prior = (op if include_nom_op_in_prior else ZERO) + _net(prior_sums, ledger.id)
            current_np -= cur
            retained_bf -= prior
            continue

        closing_signed = op + _net(to_date_sums, ledger.id)
        if closing_signed == ZERO:
            continue

        section = nature if nature in sections else AccountNature.EQUITY.value
        amt = closing_signed if section == AccountNature.ASSET.value else -closing_signed
        gkey: int | str = ledger.group_id
        gid = ledger.group_id
        gname = ledger.group.name

        reclass_name = _resolve_reclass_label(ledger.group_id, groups_by_id)
        if (
            reclass_name
            and amt < ZERO
            and section in (AccountNature.ASSET.value, AccountNature.LIABILITY.value)
        ):
            section = (
                AccountNature.LIABILITY.value
                if section == AccountNature.ASSET.value
                else AccountNature.ASSET.value
            )
            amt = -amt
            gkey = f"reclass:{ledger.group_id}"
            gid = -ledger.group_id  # Unique negative synthetic ID prevents key collisions
            gname = reclass_name

        _place(
            section,
            gkey,
            gid,
            gname,
            StatementLineItem(
                ledger_id=ledger.id,
                ledger_code=ledger.code,
                ledger_name=ledger.name,
                group_name=gname,
                amount=amt,
            ),
        )

    if retained_bf != ZERO:
        re_gkey: int | str = reserves_group.id if reserves_group is not None else "retained"
        re_gid = reserves_group.id if reserves_group is not None else -100_000
        re_gname = reserves_group.name if reserves_group is not None else "Reserves & Surplus"
        _place(
            AccountNature.EQUITY.value,
            re_gkey,
            re_gid,
            re_gname,
            StatementLineItem(
                ledger_id=0,
                ledger_code=RETAINED_EARNINGS_CODE,
                ledger_name=RETAINED_EARNINGS_LABEL,
                group_name=re_gname,
                amount=retained_bf,
            ),
        )

    total_assets = totals[AccountNature.ASSET.value]
    total_liabilities = totals[AccountNature.LIABILITY.value]
    total_equity = totals[AccountNature.EQUITY.value]
    total_liab_and_eq = total_liabilities + total_equity + current_np
    difference = abs(total_assets - total_liab_and_eq)

    return BalanceSheetReportRead(
        as_of_date=eff_as_of,
        assets=list(sections[AccountNature.ASSET.value].values()),
        liabilities=list(sections[AccountNature.LIABILITY.value].values()),
        equity=list(sections[AccountNature.EQUITY.value].values()),
        current_period_net_profit=current_np,
        retained_earnings_brought_forward=retained_bf,
        opening_balance_difference=opening_difference,
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
        .where(Ledger.company_id == company.id)
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
