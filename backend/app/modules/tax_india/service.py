from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import begin_write_transaction
from app.core.indian_words import amount_to_indian_words
from app.models.gst import GstTaxSlab, HsnSacCode, HsnSacType
from app.modules.ledger.exceptions import DuplicateResourceError, ResourceNotFoundError
from app.modules.ledger.service import _acquire_company_write_lock, _get_company
from app.modules.tax_india.gst_calculator import (
    InvalidGstError,
    VALID_POS_CODES,
    calculate_gst_invoice,
    GstLineInput,
)
from app.modules.tax_india.schemas import (
    GstPreviewLineRead,
    GstPreviewRequest,
    GstPreviewResponse,
    GstTaxSlabCreate,
    GstTaxSlabRead,
    HsnSacCodeCreate,
    HsnSacCodeRead,
    HsnSummaryRowRead,
)


async def list_tax_slabs(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    active_only: bool = True,
) -> list[GstTaxSlabRead]:
    company = await _get_company(db, company_id)
    stmt = (
        select(GstTaxSlab)
        .where(GstTaxSlab.company_id == company.id)
        .order_by(GstTaxSlab.igst_rate.asc(), GstTaxSlab.code.asc())
    )
    if active_only:
        stmt = stmt.where(GstTaxSlab.is_active.is_(True))
    rows = list((await db.execute(stmt)).scalars().all())
    return [GstTaxSlabRead.model_validate(r) for r in rows]


async def create_tax_slab(
    db: AsyncSession,
    payload: GstTaxSlabCreate,
    *,
    company_id: int | None = None,
) -> GstTaxSlabRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    slab = GstTaxSlab(
        company_id=company.id,
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        cgst_rate=payload.cgst_rate,
        sgst_rate=payload.sgst_rate,
        igst_rate=payload.igst_rate,
        cess_rate=payload.cess_rate,
        is_active=True,
    )
    db.add(slab)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateResourceError(
            f"GST tax slab code '{slab.code}' or name '{slab.name}' already exists."
        ) from exc
    await db.refresh(slab)
    return GstTaxSlabRead.model_validate(slab)


def _serialize_hsn(row: HsnSacCode) -> HsnSacCodeRead:
    return HsnSacCodeRead(
        id=row.id,
        company_id=row.company_id,
        code=row.code,
        code_type=HsnSacType(row.code_type),
        description=row.description,
        default_tax_slab_id=row.default_tax_slab_id,
        default_tax_slab_code=row.default_tax_slab.code if row.default_tax_slab else None,
        default_uqc=row.default_uqc,
        is_active=row.is_active,
    )


async def list_hsn_sac_codes(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    q: str | None = None,
    code_type: HsnSacType | None = None,
) -> list[HsnSacCodeRead]:
    company = await _get_company(db, company_id)
    stmt = (
        select(HsnSacCode)
        .options(selectinload(HsnSacCode.default_tax_slab))
        .where(HsnSacCode.company_id == company.id, HsnSacCode.is_active.is_(True))
        .order_by(HsnSacCode.code.asc())
    )
    if code_type is not None:
        stmt = stmt.where(HsnSacCode.code_type == code_type.value)
    if q and q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(or_(HsnSacCode.code.ilike(pat), HsnSacCode.description.ilike(pat)))
    rows = list((await db.execute(stmt)).scalars().all())
    return [_serialize_hsn(r) for r in rows]


async def create_hsn_sac_code(
    db: AsyncSession,
    payload: HsnSacCodeCreate,
    *,
    company_id: int | None = None,
) -> HsnSacCodeRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    if payload.default_tax_slab_id is not None:
        slab = await db.get(GstTaxSlab, payload.default_tax_slab_id)
        if slab is None or slab.company_id != company.id:
            raise ResourceNotFoundError(
                f"GST tax slab id={payload.default_tax_slab_id} not found."
            )

    entry = HsnSacCode(
        company_id=company.id,
        code=payload.code.strip().upper(),
        code_type=payload.code_type.value,
        description=payload.description.strip(),
        default_tax_slab_id=payload.default_tax_slab_id,
        default_uqc=payload.default_uqc.strip().upper(),
        is_active=True,
    )
    db.add(entry)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateResourceError(
            f"HSN/SAC code '{entry.code}' already exists for this company."
        ) from exc
    await db.refresh(entry, attribute_names=["default_tax_slab"])
    return _serialize_hsn(entry)


async def preview_gst(
    db: AsyncSession,
    payload: GstPreviewRequest,
    *,
    company_id: int | None = None,
) -> GstPreviewResponse:
    company = await _get_company(db, company_id)
    origin = payload.origin_state_code.strip()
    pos = payload.place_of_supply.strip()
    if origin not in VALID_POS_CODES:
        raise InvalidGstError(f"Invalid origin_state_code '{origin}'.")
    if pos not in VALID_POS_CODES:
        raise InvalidGstError(f"Invalid place_of_supply '{pos}'.")

    slab_ids = {ln.tax_slab_id for ln in payload.lines if ln.tax_slab_id is not None}
    slabs_by_id: dict[int, GstTaxSlab] = {}
    if slab_ids:
        rows = (
            await db.execute(
                select(GstTaxSlab).where(
                    GstTaxSlab.company_id == company.id,
                    GstTaxSlab.id.in_(slab_ids),
                )
            )
        ).scalars().all()
        slabs_by_id = {s.id: s for s in rows}

    calc_inputs: list[GstLineInput] = []
    for ln in payload.lines:
        if ln.tax_slab_id is not None:
            slab = slabs_by_id.get(ln.tax_slab_id)
            if slab is None:
                raise ResourceNotFoundError(f"GST tax slab id={ln.tax_slab_id} not found.")
            cgst_r, sgst_r, igst_r, cess_r = (
                slab.cgst_rate,
                slab.sgst_rate,
                slab.igst_rate,
                slab.cess_rate,
            )
        else:
            cgst_r, sgst_r, igst_r, cess_r = (
                ln.cgst_rate,
                ln.sgst_rate,
                ln.igst_rate,
                ln.cess_rate,
            )
        calc_inputs.append(
            GstLineInput(
                quantity=ln.quantity,
                unit_price=ln.unit_price,
                discount_pct=ln.discount_pct,
                discount_amount=ln.discount_amount,
                slab_cgst_rate=cgst_r,
                slab_sgst_rate=sgst_r,
                slab_igst_rate=igst_r,
                slab_cess_rate=cess_r,
                hsn_sac_code=ln.hsn_sac_code,
            )
        )

    res = calculate_gst_invoice(
        lines=calc_inputs,
        origin_state_code=origin,
        place_of_supply=pos,
        supply_type=payload.supply_type.value,
        is_rcm=payload.is_rcm,
        enable_round_off=payload.enable_round_off,
    )

    return GstPreviewResponse(
        is_inter_state=res.is_inter_state,
        lines=[
            GstPreviewLineRead(
                hsn_sac_code=ln.hsn_sac_code,
                quantity=ln.quantity,
                unit_price=ln.unit_price,
                gross_amount=ln.gross_amount,
                discount_pct=ln.discount_pct,
                discount_amount=ln.discount_amount,
                taxable_amount=ln.taxable_amount,
                is_inter_state=ln.is_inter_state,
                cgst_rate=ln.cgst_rate,
                sgst_rate=ln.sgst_rate,
                igst_rate=ln.igst_rate,
                cess_rate=ln.cess_rate,
                cgst_amount=ln.cgst_amount,
                sgst_amount=ln.sgst_amount,
                igst_amount=ln.igst_amount,
                cess_amount=ln.cess_amount,
                tax_amount=ln.tax_amount,
                line_total=ln.line_total,
            )
            for ln in res.lines
        ],
        subtotal=res.subtotal,
        total_discount=res.total_discount,
        taxable_total=res.taxable_total,
        cgst_total=res.cgst_total,
        sgst_total=res.sgst_total,
        igst_total=res.igst_total,
        cess_total=res.cess_total,
        tax_total=res.tax_total,
        round_off=res.round_off,
        grand_total=res.grand_total,
        hsn_summary=[
            HsnSummaryRowRead(
                hsn_sac_code=h.hsn_sac_code,
                taxable_amount=h.taxable_amount,
                cgst_rate=h.cgst_rate,
                cgst_amount=h.cgst_amount,
                sgst_rate=h.sgst_rate,
                sgst_amount=h.sgst_amount,
                igst_rate=h.igst_rate,
                igst_amount=h.igst_amount,
                cess_rate=h.cess_rate,
                cess_amount=h.cess_amount,
                total_tax=h.total_tax,
            )
            for h in res.hsn_summary
        ],
        amount_in_words=amount_to_indian_words(res.grand_total),
    )
