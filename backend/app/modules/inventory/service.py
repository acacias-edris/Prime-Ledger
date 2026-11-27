from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import begin_write_transaction
from app.core.money import MONEY_QUANT, ZERO, quantize_money
from app.models.gst import GstTaxSlab, HsnSacCode
from app.models.inventory import (
    FifoLotAllocation,
    Godown,
    InventoryItem,
    InventoryLot,
    ItemType,
    MovementReason,
    StockDirection,
    StockMovement,
    UnitOfMeasure,
    ValuationMethod,
)
from app.models.ledger import Ledger
from app.modules.inventory.exceptions import (
    InsufficientStockError,
    LotAlreadyConsumedError,
)
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
    StockSummaryRow,
    UnitOfMeasureCreate,
    UnitOfMeasureRead,
)
from app.modules.ledger.exceptions import (
    DuplicateResourceError,
    InvalidVoucherError,
    ResourceNotFoundError,
)
from app.modules.ledger.service import _acquire_company_write_lock, _get_company


def _serialize_item(item: InventoryItem) -> InventoryItemRead:
    return InventoryItemRead(
        id=item.id,
        company_id=item.company_id,
        sku=item.sku,
        name=item.name,
        item_type=ItemType(item.item_type),
        valuation_method=ValuationMethod(item.valuation_method),
        unit_id=item.unit_id,
        unit_symbol=item.unit.symbol,
        unit_uqc=item.unit.uqc_code,
        unit_decimal_places=item.unit.decimal_places,
        hsn_sac_id=item.hsn_sac_id,
        hsn_sac_code=item.hsn_sac.code if item.hsn_sac else None,
        default_tax_slab_id=item.default_tax_slab_id,
        default_tax_slab_code=item.default_tax_slab.code if item.default_tax_slab else None,
        default_tax_slab_name=item.default_tax_slab.name if item.default_tax_slab else None,
        sales_ledger_id=item.sales_ledger_id,
        purchase_ledger_id=item.purchase_ledger_id,
        cogs_ledger_id=item.cogs_ledger_id,
        inventory_ledger_id=item.inventory_ledger_id,
        standard_selling_price=quantize_money(item.standard_selling_price),
        standard_purchase_cost=quantize_money(item.standard_purchase_cost),
        reorder_level=quantize_money(item.reorder_level),
        is_active=item.is_active,
        created_at=item.created_at,
    )


async def list_units(
    db: AsyncSession, *, company_id: int | None = None
) -> list[UnitOfMeasureRead]:
    company = await _get_company(db, company_id)
    stmt = (
        select(UnitOfMeasure)
        .where(UnitOfMeasure.company_id == company.id, UnitOfMeasure.is_active.is_(True))
        .order_by(UnitOfMeasure.symbol.asc())
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return [UnitOfMeasureRead.model_validate(r) for r in rows]


async def create_unit(
    db: AsyncSession,
    payload: UnitOfMeasureCreate,
    *,
    company_id: int | None = None,
) -> UnitOfMeasureRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    uom = UnitOfMeasure(
        company_id=company.id,
        symbol=payload.symbol.strip(),
        formal_name=payload.formal_name.strip(),
        uqc_code=payload.uqc_code.strip().upper(),
        decimal_places=payload.decimal_places,
        is_active=True,
    )
    db.add(uom)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateResourceError(
            f"Unit of measure '{uom.symbol}' already exists for this company."
        ) from exc
    await db.refresh(uom)
    return UnitOfMeasureRead.model_validate(uom)


async def list_godowns(
    db: AsyncSession, *, company_id: int | None = None
) -> list[GodownRead]:
    company = await _get_company(db, company_id)
    stmt = (
        select(Godown)
        .where(Godown.company_id == company.id, Godown.is_active.is_(True))
        .order_by(Godown.is_default.desc(), Godown.code.asc())
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return [GodownRead.model_validate(r) for r in rows]


async def create_godown(
    db: AsyncSession,
    payload: GodownCreate,
    *,
    company_id: int | None = None,
) -> GodownRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    if payload.is_default:
        await db.execute(
            update(Godown)
            .where(Godown.company_id == company.id)
            .values(is_default=False)
        )

    godown = Godown(
        company_id=company.id,
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        address=payload.address.strip() if payload.address else None,
        state_code=payload.state_code.strip() if payload.state_code else None,
        is_default=payload.is_default,
        is_active=True,
    )
    db.add(godown)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateResourceError(
            f"Godown code '{godown.code}' or name '{godown.name}' already exists."
        ) from exc
    await db.refresh(godown)
    return GodownRead.model_validate(godown)


async def _validate_item_fks(
    db: AsyncSession,
    company_id: int,
    *,
    unit_id: int | None,
    hsn_sac_id: int | None,
    default_tax_slab_id: int | None,
    ledger_ids: list[int | None],
) -> None:
    if unit_id is not None:
        unit = await db.get(UnitOfMeasure, unit_id)
        if unit is None or unit.company_id != company_id:
            raise ResourceNotFoundError(f"Unit id={unit_id} not found.")
    if hsn_sac_id is not None:
        hsn = await db.get(HsnSacCode, hsn_sac_id)
        if hsn is None or hsn.company_id != company_id:
            raise ResourceNotFoundError(f"HSN/SAC id={hsn_sac_id} not found.")
    if default_tax_slab_id is not None:
        slab = await db.get(GstTaxSlab, default_tax_slab_id)
        if slab is None or slab.company_id != company_id:
            raise ResourceNotFoundError(f"Tax slab id={default_tax_slab_id} not found.")
    for lid in ledger_ids:
        if lid is not None:
            ledger = await db.get(Ledger, lid)
            if ledger is None or ledger.company_id != company_id:
                raise ResourceNotFoundError(f"Ledger id={lid} not found.")


async def list_items(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    q: str | None = None,
    item_type: ItemType | None = None,
) -> list[InventoryItemRead]:
    company = await _get_company(db, company_id)
    stmt = (
        select(InventoryItem)
        .options(
            selectinload(InventoryItem.unit),
            selectinload(InventoryItem.hsn_sac),
            selectinload(InventoryItem.default_tax_slab),
        )
        .where(InventoryItem.company_id == company.id, InventoryItem.is_active.is_(True))
        .order_by(InventoryItem.sku.asc())
    )
    if item_type is not None:
        stmt = stmt.where(InventoryItem.item_type == item_type.value)
    if q and q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(InventoryItem.sku.ilike(pat), InventoryItem.name.ilike(pat))
        )
    rows = list((await db.execute(stmt)).scalars().all())
    return [_serialize_item(r) for r in rows]


async def create_item(
    db: AsyncSession,
    payload: InventoryItemCreate,
    *,
    company_id: int | None = None,
) -> InventoryItemRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    await _validate_item_fks(
        db,
        company.id,
        unit_id=payload.unit_id,
        hsn_sac_id=payload.hsn_sac_id,
        default_tax_slab_id=payload.default_tax_slab_id,
        ledger_ids=[
            payload.sales_ledger_id,
            payload.purchase_ledger_id,
            payload.cogs_ledger_id,
            payload.inventory_ledger_id,
        ],
    )

    item = InventoryItem(
        company_id=company.id,
        sku=payload.sku.strip().upper(),
        name=payload.name.strip(),
        item_type=payload.item_type.value,
        valuation_method=payload.valuation_method.value,
        unit_id=payload.unit_id,
        hsn_sac_id=payload.hsn_sac_id,
        default_tax_slab_id=payload.default_tax_slab_id,
        sales_ledger_id=payload.sales_ledger_id,
        purchase_ledger_id=payload.purchase_ledger_id,
        cogs_ledger_id=payload.cogs_ledger_id,
        inventory_ledger_id=payload.inventory_ledger_id,
        standard_selling_price=payload.standard_selling_price,
        standard_purchase_cost=payload.standard_purchase_cost,
        reorder_level=payload.reorder_level,
        is_active=True,
    )
    db.add(item)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateResourceError(
            f"Inventory item with SKU '{item.sku}' already exists."
        ) from exc

    stmt = (
        select(InventoryItem)
        .options(
            selectinload(InventoryItem.unit),
            selectinload(InventoryItem.hsn_sac),
            selectinload(InventoryItem.default_tax_slab),
        )
        .where(InventoryItem.id == item.id)
    )
    loaded = (await db.execute(stmt)).scalar_one()
    return _serialize_item(loaded)


async def update_item(
    db: AsyncSession,
    item_id: int,
    payload: InventoryItemUpdate,
    *,
    company_id: int | None = None,
) -> InventoryItemRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    stmt = (
        select(InventoryItem)
        .options(
            selectinload(InventoryItem.unit),
            selectinload(InventoryItem.hsn_sac),
            selectinload(InventoryItem.default_tax_slab),
        )
        .where(InventoryItem.id == item_id, InventoryItem.company_id == company.id)
    )
    item = (await db.execute(stmt)).scalar_one_or_none()
    if item is None:
        raise ResourceNotFoundError(f"InventoryItem id={item_id} not found.")

    await _validate_item_fks(
        db,
        company.id,
        unit_id=payload.unit_id,
        hsn_sac_id=payload.hsn_sac_id,
        default_tax_slab_id=payload.default_tax_slab_id,
        ledger_ids=[
            payload.sales_ledger_id,
            payload.purchase_ledger_id,
            payload.cogs_ledger_id,
            payload.inventory_ledger_id,
        ],
    )

    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        if key == "name" and val is not None:
            setattr(item, key, val.strip())
        elif key == "valuation_method" and val is not None:
            setattr(item, key, val.value if isinstance(val, ValuationMethod) else str(val))
        else:
            setattr(item, key, val)

    await db.commit()
    await db.refresh(item, attribute_names=["unit", "hsn_sac", "default_tax_slab"])
    return _serialize_item(item)


# ---------------------------------------------------------------------------
# Perpetual Inventory Costing Engine (FIFO + Moving Weighted Average)
# ---------------------------------------------------------------------------


async def _get_latest_running_state(
    db: AsyncSession, company_id: int, item_id: int, godown_id: int
) -> tuple[Decimal, Decimal]:
    stmt = (
        select(StockMovement)
        .where(
            StockMovement.company_id == company_id,
            StockMovement.item_id == item_id,
            StockMovement.godown_id == godown_id,
        )
        .order_by(StockMovement.id.desc())
        .limit(1)
    )
    last = (await db.execute(stmt)).scalar_one_or_none()
    if last is None:
        return ZERO, ZERO
    return quantize_money(last.running_qty), quantize_money(last.running_avg_cost)


async def receive_stock(
    db: AsyncSession,
    *,
    company_id: int,
    item: InventoryItem,
    godown_id: int,
    qty: Decimal,
    unit_cost: Decimal,
    received_date: date,
    reason: MovementReason,
    source_invoice_id: int | None = None,
    source_invoice_line_id: int | None = None,
    voucher_id: int | None = None,
    batch_ref: str | None = None,
    expiry_date: date | None = None,
    line_no: int = 1,
) -> tuple[InventoryLot | None, StockMovement | None]:
    """Creates a new FIFO/cost lot and appends an IN StockMovement inside the caller's txn."""
    if item.item_type != ItemType.GOODS.value:
        return None, None

    q_qty = quantize_money(qty)
    q_cost = quantize_money(unit_cost)
    if q_qty <= ZERO:
        raise InvalidVoucherError("Stock receipt quantity must be > 0.")
    if q_cost < ZERO:
        raise InvalidVoucherError("Stock receipt unit_cost cannot be negative.")

    eff_batch = (
        batch_ref.strip()
        if batch_ref and batch_ref.strip()
        else f"LOT-{received_date.strftime('%Y%m%d')}-{line_no:02d}"
    )

    lot = InventoryLot(
        company_id=company_id,
        item_id=item.id,
        godown_id=godown_id,
        source_invoice_id=source_invoice_id,
        source_invoice_line_id=source_invoice_line_id,
        batch_ref=eff_batch,
        received_date=received_date,
        expiry_date=expiry_date,
        qty_in=q_qty,
        qty_available=q_qty,
        unit_cost=q_cost,
    )
    db.add(lot)

    prev_qty, prev_avg = await _get_latest_running_state(
        db, company_id, item.id, godown_id
    )
    in_total_cost = (q_qty * q_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    prev_total_value = prev_qty * prev_avg
    new_qty = quantize_money(prev_qty + q_qty)
    new_avg_cost = (
        ((prev_total_value + in_total_cost) / new_qty).quantize(
            MONEY_QUANT, rounding=ROUND_HALF_UP
        )
        if new_qty > ZERO
        else ZERO
    )

    movement = StockMovement(
        company_id=company_id,
        item_id=item.id,
        godown_id=godown_id,
        invoice_id=source_invoice_id,
        invoice_line_id=source_invoice_line_id,
        voucher_id=voucher_id,
        movement_date=received_date,
        direction=StockDirection.IN.value,
        movement_reason=reason.value,
        quantity=q_qty,
        unit_cost=q_cost,
        total_cost=in_total_cost,
        running_qty=new_qty,
        running_avg_cost=new_avg_cost,
    )
    db.add(movement)
    await db.flush()
    return lot, movement


async def issue_stock(
    db: AsyncSession,
    *,
    company_id: int,
    item: InventoryItem,
    godown_id: int,
    qty: Decimal,
    movement_date: date,
    reason: MovementReason,
    invoice_id: int | None = None,
    invoice_line_id: int | None = None,
    voucher_id: int | None = None,
    preferred_source_invoice_id: int | None = None,
) -> tuple[StockMovement | None, Decimal]:
    """
    Depletes open lots in FIFO order (or preferred source invoice first for Debit Notes),
    computes exact FIFO or Moving Weighted Average COGS, and persists StockMovement +
    FifoLotAllocation rows inside the caller's active transaction.
    """
    if item.item_type != ItemType.GOODS.value:
        return None, ZERO

    q_qty = quantize_money(qty)
    if q_qty <= ZERO:
        raise InvalidVoucherError("Stock issue quantity must be > 0.")

    lots_stmt = (
        select(InventoryLot)
        .where(
            InventoryLot.company_id == company_id,
            InventoryLot.item_id == item.id,
            InventoryLot.godown_id == godown_id,
            InventoryLot.qty_available > ZERO,
        )
        .order_by(InventoryLot.received_date.asc(), InventoryLot.id.asc())
    )
    open_lots = list((await db.execute(lots_stmt)).scalars().all())

    if preferred_source_invoice_id is not None:
        open_lots.sort(
            key=lambda lot: 0
            if lot.source_invoice_id == preferred_source_invoice_id
            else 1
        )

    total_available = quantize_money(
        sum((quantize_money(lot.qty_available) for lot in open_lots), ZERO)
    )
    if total_available < q_qty:
        raise InsufficientStockError(
            item_id=item.id,
            sku=item.sku,
            godown_id=godown_id,
            requested_qty=q_qty,
            available_qty=total_available,
        )

    prev_qty, prev_avg = await _get_latest_running_state(
        db, company_id, item.id, godown_id
    )

    remaining = q_qty
    consumed: list[tuple[InventoryLot, Decimal]] = []
    for lot in open_lots:
        if remaining <= ZERO:
            break
        avail = quantize_money(lot.qty_available)
        if avail <= ZERO:
            continue
        take = min(avail, remaining)
        lot.qty_available = quantize_money(avail - take)
        consumed.append((lot, take))
        remaining = quantize_money(remaining - take)

    rem_qty = quantize_money(prev_qty - q_qty)
    if rem_qty < ZERO:
        rem_qty = ZERO

    alloc_rows: list[FifoLotAllocation] = []
    if item.valuation_method == ValuationMethod.FIFO.value:
        total_cogs = ZERO
        for lot, take in consumed:
            alloc_cost = (take * quantize_money(lot.unit_cost)).quantize(
                MONEY_QUANT, rounding=ROUND_HALF_UP
            )
            total_cogs += alloc_cost
            alloc_rows.append(
                FifoLotAllocation(
                    company_id=company_id,
                    inventory_lot_id=lot.id,
                    qty_allocated=take,
                    unit_cost=quantize_money(lot.unit_cost),
                    total_cost=alloc_cost,
                    is_reversed=False,
                )
            )
        total_cogs = quantize_money(total_cogs)
        movement_unit_cost = (total_cogs / q_qty).quantize(
            MONEY_QUANT, rounding=ROUND_HALF_UP
        )
        rem_value = sum(
            (
                (quantize_money(l.qty_available) * quantize_money(l.unit_cost)).quantize(
                    MONEY_QUANT, rounding=ROUND_HALF_UP
                )
                for l in open_lots
                if quantize_money(l.qty_available) > ZERO
            ),
            ZERO,
        )
        new_avg_cost = (
            (rem_value / rem_qty).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
            if rem_qty > ZERO
            else ZERO
        )
    else:
        movement_unit_cost = prev_avg
        total_cogs = (q_qty * prev_avg).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        new_avg_cost = prev_avg if rem_qty > ZERO else ZERO
        for lot, take in consumed:
            alloc_cost = (take * prev_avg).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
            alloc_rows.append(
                FifoLotAllocation(
                    company_id=company_id,
                    inventory_lot_id=lot.id,
                    qty_allocated=take,
                    unit_cost=prev_avg,
                    total_cost=alloc_cost,
                    is_reversed=False,
                )
            )

    movement = StockMovement(
        company_id=company_id,
        item_id=item.id,
        godown_id=godown_id,
        invoice_id=invoice_id,
        invoice_line_id=invoice_line_id,
        voucher_id=voucher_id,
        movement_date=movement_date,
        direction=StockDirection.OUT.value,
        movement_reason=reason.value,
        quantity=q_qty,
        unit_cost=movement_unit_cost,
        total_cost=total_cogs,
        running_qty=rem_qty,
        running_avg_cost=new_avg_cost,
    )
    db.add(movement)
    await db.flush()

    for alloc in alloc_rows:
        alloc.stock_movement_id = movement.id
        db.add(alloc)

    await db.flush()
    return movement, total_cogs


async def reverse_inward_invoice_lots(
    db: AsyncSession,
    *,
    company_id: int,
    invoice_id: int,
    reversal_date: date,
    voucher_id: int | None,
) -> None:
    """
    Aborts with 409 LOT_ALREADY_CONSUMED if any lot created by this Purchase/Credit Note
    has already been consumed; otherwise zeroes the lots and appends OUT reversal movements.
    """
    lots_stmt = (
        select(InventoryLot)
        .options(selectinload(InventoryLot.item))
        .where(
            InventoryLot.company_id == company_id,
            InventoryLot.source_invoice_id == invoice_id,
        )
        .order_by(InventoryLot.id.asc())
    )
    lots = list((await db.execute(lots_stmt)).scalars().all())
    for lot in lots:
        if quantize_money(lot.qty_available) < quantize_money(lot.qty_in):
            raise LotAlreadyConsumedError(
                lot_id=lot.id,
                batch_ref=lot.batch_ref,
                qty_in=quantize_money(lot.qty_in),
                qty_available=quantize_money(lot.qty_available),
            )

    for lot in lots:
        prev_qty, prev_avg = await _get_latest_running_state(
            db, company_id, lot.item_id, lot.godown_id
        )
        q_in = quantize_money(lot.qty_in)
        u_cost = quantize_money(lot.unit_cost)
        rev_total_cost = (q_in * u_cost).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

        lot.qty_available = ZERO
        await db.flush()

        new_qty = max(ZERO, quantize_money(prev_qty - q_in))
        if new_qty == ZERO:
            new_avg_cost = ZERO
        elif lot.item.valuation_method == ValuationMethod.FIFO.value:
            open_stmt = select(InventoryLot).where(
                InventoryLot.company_id == company_id,
                InventoryLot.item_id == lot.item_id,
                InventoryLot.godown_id == lot.godown_id,
                InventoryLot.qty_available > ZERO,
            )
            rem_lots = list((await db.execute(open_stmt)).scalars().all())
            rem_value = sum(
                (
                    (quantize_money(l.qty_available) * quantize_money(l.unit_cost)).quantize(
                        MONEY_QUANT, rounding=ROUND_HALF_UP
                    )
                    for l in rem_lots
                ),
                ZERO,
            )
            new_avg_cost = (rem_value / new_qty).quantize(
                MONEY_QUANT, rounding=ROUND_HALF_UP
            )
        else:
            rem_value = max(ZERO, (prev_qty * prev_avg) - (q_in * u_cost))
            new_avg_cost = (rem_value / new_qty).quantize(
                MONEY_QUANT, rounding=ROUND_HALF_UP
            )

        db.add(
            StockMovement(
                company_id=company_id,
                item_id=lot.item_id,
                godown_id=lot.godown_id,
                invoice_id=invoice_id,
                invoice_line_id=lot.source_invoice_line_id,
                voucher_id=voucher_id,
                movement_date=reversal_date,
                direction=StockDirection.OUT.value,
                movement_reason=MovementReason.CANCELLATION_REVERSAL.value,
                quantity=q_in,
                unit_cost=u_cost,
                total_cost=rev_total_cost,
                running_qty=new_qty,
                running_avg_cost=new_avg_cost,
            )
        )
        await db.flush()


async def reverse_outward_invoice_movements(
    db: AsyncSession,
    *,
    company_id: int,
    invoice_id: int,
    reversal_date: date,
    voucher_id: int | None,
) -> None:
    """Restores exact FIFO lot allocations for a cancelled Sales or Debit Note invoice."""
    mov_stmt = (
        select(StockMovement)
        .options(
            selectinload(StockMovement.allocations).selectinload(
                FifoLotAllocation.inventory_lot
            )
        )
        .where(
            StockMovement.company_id == company_id,
            StockMovement.invoice_id == invoice_id,
            StockMovement.direction == StockDirection.OUT.value,
        )
        .order_by(StockMovement.id.asc())
    )
    movements = list((await db.execute(mov_stmt)).scalars().all())

    for mov in movements:
        for alloc in mov.allocations:
            if alloc.is_reversed:
                continue
            alloc.inventory_lot.qty_available = quantize_money(
                quantize_money(alloc.inventory_lot.qty_available)
                + quantize_money(alloc.qty_allocated)
            )
            alloc.is_reversed = True

        prev_qty, prev_avg = await _get_latest_running_state(
            db, company_id, mov.item_id, mov.godown_id
        )
        mov_qty = quantize_money(mov.quantity)
        mov_total = quantize_money(mov.total_cost)
        new_qty = quantize_money(prev_qty + mov_qty)
        new_avg_cost = (
            (((prev_qty * prev_avg) + mov_total) / new_qty).quantize(
                MONEY_QUANT, rounding=ROUND_HALF_UP
            )
            if new_qty > ZERO
            else ZERO
        )

        db.add(
            StockMovement(
                company_id=company_id,
                item_id=mov.item_id,
                godown_id=mov.godown_id,
                invoice_id=invoice_id,
                invoice_line_id=mov.invoice_line_id,
                voucher_id=voucher_id,
                movement_date=reversal_date,
                direction=StockDirection.IN.value,
                movement_reason=MovementReason.CANCELLATION_REVERSAL.value,
                quantity=mov_qty,
                unit_cost=quantize_money(mov.unit_cost),
                total_cost=mov_total,
                running_qty=new_qty,
                running_avg_cost=new_avg_cost,
            )
        )
        await db.flush()


# ---------------------------------------------------------------------------
# Overflow-Safe Stock Valuation & Reporting (Python Decimal Multiplication)
# ---------------------------------------------------------------------------


async def get_stock_summary(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    low_stock_only: bool = False,
) -> StockSummaryResponse:
    company = await _get_company(db, company_id)

    items_stmt = (
        select(InventoryItem)
        .options(
            selectinload(InventoryItem.unit),
            selectinload(InventoryItem.hsn_sac),
        )
        .where(
            InventoryItem.company_id == company.id,
            InventoryItem.is_active.is_(True),
            InventoryItem.item_type == ItemType.GOODS.value,
        )
        .order_by(InventoryItem.sku.asc())
    )
    goods_items = list((await db.execute(items_stmt)).scalars().all())

    open_lots = list(
        (
            await db.execute(
                select(InventoryLot).where(
                    InventoryLot.company_id == company.id,
                    InventoryLot.qty_available > ZERO,
                )
            )
        )
        .scalars()
        .all()
    )
    lots_by_item: dict[int, list[InventoryLot]] = {}
    for lot in open_lots:
        lots_by_item.setdefault(lot.item_id, []).append(lot)

    # Latest movement per (item_id, godown_id) for WEIGHTED_AVG valuation
    all_movs = list(
        (
            await db.execute(
                select(StockMovement)
                .where(StockMovement.company_id == company.id)
                .order_by(StockMovement.id.asc())
            )
        )
        .scalars()
        .all()
    )
    latest_by_item_godown: dict[tuple[int, int], StockMovement] = {}
    for mov in all_movs:
        latest_by_item_godown[(mov.item_id, mov.godown_id)] = mov

    rows: list[StockSummaryRow] = []
    grand_total = ZERO
    low_stock_count = 0

    for item in goods_items:
        if item.valuation_method == ValuationMethod.FIFO.value:
            item_lots = lots_by_item.get(item.id, [])
            total_qty = quantize_money(
                sum((quantize_money(l.qty_available) for l in item_lots), ZERO)
            )
            closing_value = quantize_money(
                sum(
                    (
                        (
                            quantize_money(l.qty_available)
                            * quantize_money(l.unit_cost)
                        ).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
                        for l in item_lots
                    ),
                    ZERO,
                )
            )
        else:
            item_movs = [
                m
                for (iid, _gid), m in latest_by_item_godown.items()
                if iid == item.id and quantize_money(m.running_qty) > ZERO
            ]
            total_qty = quantize_money(
                sum((quantize_money(m.running_qty) for m in item_movs), ZERO)
            )
            closing_value = quantize_money(
                sum(
                    (
                        (
                            quantize_money(m.running_qty)
                            * quantize_money(m.running_avg_cost)
                        ).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
                        for m in item_movs
                    ),
                    ZERO,
                )
            )

        avg_rate = (
            (closing_value / total_qty).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
            if total_qty > ZERO
            else ZERO
        )
        reorder = quantize_money(item.reorder_level)
        is_low = total_qty <= reorder
        if is_low:
            low_stock_count += 1
        grand_total = quantize_money(grand_total + closing_value)

        if low_stock_only and not is_low:
            continue

        rows.append(
            StockSummaryRow(
                item_id=item.id,
                sku=item.sku,
                name=item.name,
                item_type=ItemType(item.item_type),
                valuation_method=ValuationMethod(item.valuation_method),
                unit_symbol=item.unit.symbol,
                unit_uqc=item.unit.uqc_code,
                unit_decimal_places=item.unit.decimal_places,
                hsn_sac_code=item.hsn_sac.code if item.hsn_sac else None,
                total_qty=total_qty,
                avg_rate=avg_rate,
                closing_value=closing_value,
                reorder_level=reorder,
                is_low_stock=is_low,
            )
        )

    return StockSummaryResponse(
        items=rows,
        grand_total_value=grand_total,
        low_stock_count=low_stock_count,
    )


async def get_godown_stock(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    godown_id: int | None = None,
) -> list[GodownStockRow]:
    company = await _get_company(db, company_id)

    godown_stmt = select(Godown).where(
        Godown.company_id == company.id, Godown.is_active.is_(True)
    )
    if godown_id is not None:
        godown_stmt = godown_stmt.where(Godown.id == godown_id)
    godowns = {
        g.id: g
        for g in (await db.execute(godown_stmt.order_by(Godown.code.asc())))
        .scalars()
        .all()
    }

    items = {
        i.id: i
        for i in (
            await db.execute(
                select(InventoryItem)
                .options(selectinload(InventoryItem.unit))
                .where(
                    InventoryItem.company_id == company.id,
                    InventoryItem.is_active.is_(True),
                    InventoryItem.item_type == ItemType.GOODS.value,
                )
            )
        )
        .scalars()
        .all()
    }

    open_lots = list(
        (
            await db.execute(
                select(InventoryLot).where(
                    InventoryLot.company_id == company.id,
                    InventoryLot.qty_available > ZERO,
                )
            )
        )
        .scalars()
        .all()
    )
    lots_by_pair: dict[tuple[int, int], list[InventoryLot]] = {}
    for lot in open_lots:
        if lot.godown_id in godowns and lot.item_id in items:
            lots_by_pair.setdefault((lot.godown_id, lot.item_id), []).append(lot)

    movs_stmt = select(StockMovement).where(StockMovement.company_id == company.id)
    if godown_id is not None:
        movs_stmt = movs_stmt.where(StockMovement.godown_id == godown_id)
    movs_stmt = movs_stmt.order_by(StockMovement.id.asc())
    latest_by_pair: dict[tuple[int, int], StockMovement] = {}
    for mov in (await db.execute(movs_stmt)).scalars().all():
        if mov.godown_id in godowns and mov.item_id in items:
            latest_by_pair[(mov.godown_id, mov.item_id)] = mov

    all_pairs = sorted(
        set(lots_by_pair.keys()) | set(latest_by_pair.keys()),
        key=lambda p: (godowns[p[0]].code, items[p[1]].sku),
    )

    rows: list[GodownStockRow] = []
    for gid, iid in all_pairs:
        godown = godowns[gid]
        item = items[iid]
        if item.valuation_method == ValuationMethod.FIFO.value:
            pair_lots = lots_by_pair.get((gid, iid), [])
            total_qty = quantize_money(
                sum((quantize_money(l.qty_available) for l in pair_lots), ZERO)
            )
            closing_value = quantize_money(
                sum(
                    (
                        (
                            quantize_money(l.qty_available)
                            * quantize_money(l.unit_cost)
                        ).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
                        for l in pair_lots
                    ),
                    ZERO,
                )
            )
        else:
            mov = latest_by_pair.get((gid, iid))
            if mov is None:
                continue
            total_qty = quantize_money(mov.running_qty)
            closing_value = (total_qty * quantize_money(mov.running_avg_cost)).quantize(
                MONEY_QUANT, rounding=ROUND_HALF_UP
            )

        if total_qty <= ZERO:
            continue

        avg_rate = (closing_value / total_qty).quantize(
            MONEY_QUANT, rounding=ROUND_HALF_UP
        )
        rows.append(
            GodownStockRow(
                godown_id=gid,
                godown_code=godown.code,
                godown_name=godown.name,
                item_id=iid,
                sku=item.sku,
                item_name=item.name,
                valuation_method=ValuationMethod(item.valuation_method),
                unit_symbol=item.unit.symbol,
                unit_decimal_places=item.unit.decimal_places,
                total_qty=total_qty,
                avg_rate=avg_rate,
                closing_value=closing_value,
            )
        )
    return rows


async def get_item_stock_ledger(
    db: AsyncSession,
    item_id: int,
    *,
    company_id: int | None = None,
    godown_id: int | None = None,
) -> list[StockMovementRead]:
    company = await _get_company(db, company_id)
    item = await db.get(InventoryItem, item_id)
    if item is None or item.company_id != company.id:
        raise ResourceNotFoundError(f"InventoryItem id={item_id} not found.")

    stmt = (
        select(StockMovement)
        .options(
            selectinload(StockMovement.item),
            selectinload(StockMovement.godown),
            selectinload(StockMovement.invoice),
        )
        .where(
            StockMovement.company_id == company.id,
            StockMovement.item_id == item_id,
        )
        .order_by(StockMovement.movement_date.asc(), StockMovement.id.asc())
    )
    if godown_id is not None:
        stmt = stmt.where(StockMovement.godown_id == godown_id)
    rows = list((await db.execute(stmt)).scalars().all())
    return [
        StockMovementRead(
            id=m.id,
            company_id=m.company_id,
            item_id=m.item_id,
            item_sku=m.item.sku,
            item_name=m.item.name,
            godown_id=m.godown_id,
            godown_code=m.godown.code,
            godown_name=m.godown.name,
            invoice_id=m.invoice_id,
            invoice_number=m.invoice.invoice_number if m.invoice else None,
            invoice_line_id=m.invoice_line_id,
            voucher_id=m.voucher_id,
            movement_date=m.movement_date,
            direction=StockDirection(m.direction),
            movement_reason=MovementReason(m.movement_reason),
            quantity=quantize_money(m.quantity),
            unit_cost=quantize_money(m.unit_cost),
            total_cost=quantize_money(m.total_cost),
            running_qty=quantize_money(m.running_qty),
            running_avg_cost=quantize_money(m.running_avg_cost),
            created_at=m.created_at,
        )
        for m in rows
    ]


async def get_item_lots(
    db: AsyncSession,
    item_id: int,
    *,
    company_id: int | None = None,
    godown_id: int | None = None,
    include_exhausted: bool = False,
) -> list[InventoryLotRead]:
    company = await _get_company(db, company_id)
    item = await db.get(InventoryItem, item_id)
    if item is None or item.company_id != company.id:
        raise ResourceNotFoundError(f"InventoryItem id={item_id} not found.")

    stmt = (
        select(InventoryLot)
        .options(
            selectinload(InventoryLot.item),
            selectinload(InventoryLot.godown),
        )
        .where(
            InventoryLot.company_id == company.id,
            InventoryLot.item_id == item_id,
        )
        .order_by(InventoryLot.received_date.asc(), InventoryLot.id.asc())
    )
    if godown_id is not None:
        stmt = stmt.where(InventoryLot.godown_id == godown_id)
    if not include_exhausted:
        stmt = stmt.where(InventoryLot.qty_available > ZERO)

    rows = list((await db.execute(stmt)).scalars().all())
    return [
        InventoryLotRead(
            id=l.id,
            company_id=l.company_id,
            item_id=l.item_id,
            item_sku=l.item.sku,
            item_name=l.item.name,
            godown_id=l.godown_id,
            godown_code=l.godown.code,
            godown_name=l.godown.name,
            source_invoice_id=l.source_invoice_id,
            source_invoice_line_id=l.source_invoice_line_id,
            batch_ref=l.batch_ref,
            received_date=l.received_date,
            expiry_date=l.expiry_date,
            qty_in=quantize_money(l.qty_in),
            qty_available=quantize_money(l.qty_available),
            unit_cost=quantize_money(l.unit_cost),
            lot_value=(
                quantize_money(l.qty_available) * quantize_money(l.unit_cost)
            ).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP),
            created_at=l.created_at,
        )
        for l in rows
    ]
