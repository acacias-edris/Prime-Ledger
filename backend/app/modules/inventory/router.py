from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.inventory import ItemType
from app.modules.inventory import service
from app.modules.inventory.schemas import (
    GodownCreate,
    GodownRead,
    GodownStockRow,
    InventoryItemCreate,
    InventoryItemRead,
    InventoryItemUpdate,
    InventoryLotRead,
    StockMovementRead,
    StockSummaryResponse,
    UnitOfMeasureCreate,
    UnitOfMeasureRead,
)

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


@router.get("/units", response_model=list[UnitOfMeasureRead])
async def read_units(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[UnitOfMeasureRead]:
    return await service.list_units(db, company_id=company_id)


@router.post(
    "/units", response_model=UnitOfMeasureRead, status_code=status.HTTP_201_CREATED
)
async def create_unit_endpoint(
    payload: UnitOfMeasureCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> UnitOfMeasureRead:
    return await service.create_unit(db, payload, company_id=company_id)


@router.get("/godowns", response_model=list[GodownRead])
async def read_godowns(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[GodownRead]:
    return await service.list_godowns(db, company_id=company_id)


@router.post(
    "/godowns", response_model=GodownRead, status_code=status.HTTP_201_CREATED
)
async def create_godown_endpoint(
    payload: GodownCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> GodownRead:
    return await service.create_godown(db, payload, company_id=company_id)


@router.get("/items", response_model=list[InventoryItemRead])
async def read_items(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    item_type: Annotated[ItemType | None, Query()] = None,
) -> list[InventoryItemRead]:
    return await service.list_items(db, company_id=company_id, q=q, item_type=item_type)


@router.post(
    "/items", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED
)
async def create_item_endpoint(
    payload: InventoryItemCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> InventoryItemRead:
    return await service.create_item(db, payload, company_id=company_id)


@router.patch("/items/{item_id}", response_model=InventoryItemRead)
async def update_item_endpoint(
    item_id: int,
    payload: InventoryItemUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> InventoryItemRead:
    return await service.update_item(db, item_id, payload, company_id=company_id)


@router.get("/stock-summary", response_model=StockSummaryResponse)
async def read_stock_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    low_stock_only: Annotated[bool, Query()] = False,
) -> StockSummaryResponse:
    return await service.get_stock_summary(
        db, company_id=company_id, low_stock_only=low_stock_only
    )


@router.get("/godown-stock", response_model=list[GodownStockRow])
async def read_godown_stock(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    godown_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[GodownStockRow]:
    return await service.get_godown_stock(
        db, company_id=company_id, godown_id=godown_id
    )


@router.get("/items/{item_id}/ledger", response_model=list[StockMovementRead])
async def read_item_ledger(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    godown_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[StockMovementRead]:
    return await service.get_item_stock_ledger(
        db, item_id, company_id=company_id, godown_id=godown_id
    )


@router.get("/items/{item_id}/lots", response_model=list[InventoryLotRead])
async def read_item_lots(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    godown_id: Annotated[int | None, Query(ge=1)] = None,
    include_exhausted: Annotated[bool, Query()] = False,
) -> list[InventoryLotRead]:
    return await service.get_item_lots(
        db,
        item_id,
        company_id=company_id,
        godown_id=godown_id,
        include_exhausted=include_exhausted,
    )
