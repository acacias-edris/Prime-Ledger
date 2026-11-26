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
