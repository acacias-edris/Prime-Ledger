from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.invoicing import InvoiceStatus, InvoiceType
from app.modules.invoicing import service
from app.modules.invoicing.schemas import (
    InvoiceCancelRequest,
    InvoiceCreate,
    InvoiceDetailRead,
    InvoiceListItem,
)

router = APIRouter(prefix="/api/v1/invoices", tags=["invoicing"])


@router.get("", response_model=list[InvoiceListItem])
async def read_invoices(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    invoice_type: Annotated[InvoiceType | None, Query()] = None,
    invoice_status: Annotated[InvoiceStatus | None, Query(alias="status")] = None,
    party_ledger_id: Annotated[int | None, Query(ge=1)] = None,
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> list[InvoiceListItem]:
    return await service.list_invoices(
        db,
        company_id=company_id,
        invoice_type=invoice_type,
        status=invoice_status,
        party_ledger_id=party_ledger_id,
        from_date=from_date,
        to_date=to_date,
        q=q,
    )


@router.post("", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
async def create_invoice_endpoint(
    payload: InvoiceCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> InvoiceDetailRead:
    return await service.create_invoice(db, payload, company_id=company_id)


@router.get("/{invoice_id}", response_model=InvoiceDetailRead)
async def get_invoice_endpoint(
    invoice_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> InvoiceDetailRead:
    return await service.get_invoice_detail(db, invoice_id, company_id=company_id)


@router.post("/{invoice_id}/post", response_model=InvoiceDetailRead)
async def post_draft_invoice_endpoint(
    invoice_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> InvoiceDetailRead:
    return await service.post_draft_invoice(db, invoice_id, company_id=company_id)


@router.post("/{invoice_id}/cancel", response_model=InvoiceDetailRead)
async def cancel_invoice_endpoint(
    invoice_id: int,
    payload: InvoiceCancelRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> InvoiceDetailRead:
    return await service.cancel_invoice(
        db, invoice_id, payload, company_id=company_id
    )
