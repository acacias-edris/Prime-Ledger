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
