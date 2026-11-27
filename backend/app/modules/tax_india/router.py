from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.gst import HsnSacType
from app.modules.tax_india import gst_calculator, service
from app.modules.tax_india.schemas import (
    GstPreviewRequest,
    GstPreviewResponse,
    GstTaxSlabCreate,
    GstTaxSlabRead,
    GstinValidationResponse,
    HsnSacCodeCreate,
    HsnSacCodeRead,
)

router = APIRouter(prefix="/api/v1/tax/india", tags=["tax-india"])


@router.get("/slabs", response_model=list[GstTaxSlabRead])
async def read_tax_slabs(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    active_only: Annotated[bool, Query()] = True,
) -> list[GstTaxSlabRead]:
    return await service.list_tax_slabs(
        db, company_id=company_id, active_only=active_only
    )


@router.post(
    "/slabs",
    response_model=GstTaxSlabRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_tax_slab_endpoint(
    payload: GstTaxSlabCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> GstTaxSlabRead:
    return await service.create_tax_slab(db, payload, company_id=company_id)


@router.get("/hsn-sac", response_model=list[HsnSacCodeRead])
async def read_hsn_sac_codes(
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    code_type: Annotated[HsnSacType | None, Query()] = None,
) -> list[HsnSacCodeRead]:
    return await service.list_hsn_sac_codes(
        db, company_id=company_id, q=q, code_type=code_type
    )


@router.post(
    "/hsn-sac",
    response_model=HsnSacCodeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_hsn_sac_endpoint(
    payload: HsnSacCodeCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> HsnSacCodeRead:
    return await service.create_hsn_sac_code(db, payload, company_id=company_id)


@router.post("/gst/preview", response_model=GstPreviewResponse)
async def preview_gst_endpoint(
    payload: GstPreviewRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: Annotated[int | None, Query(ge=1)] = None,
) -> GstPreviewResponse:
    return await service.preview_gst(db, payload, company_id=company_id)


@router.get("/validate-gstin/{gstin}", response_model=GstinValidationResponse)
async def validate_gstin_endpoint(gstin: str) -> GstinValidationResponse:
    res = gst_calculator.validate_gstin(gstin)
    return GstinValidationResponse(
        is_valid=res.is_valid,
        normalized=res.normalized,
        state_code=res.state_code,
        pan=res.pan,
        error=res.error,
    )
