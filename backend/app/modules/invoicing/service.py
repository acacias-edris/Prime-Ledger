from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import begin_write_transaction
from app.core.indian_words import amount_to_indian_words
from app.core.money import MONEY_QUANT, ZERO, quantize_money
from app.models.company import Company, FiscalYear
from app.models.gst import GstTaxSlab
from app.models.inventory import (
    Godown,
    InventoryItem,
    ItemType,
    MovementReason,
    StockDirection,
    StockMovement,
)
from app.models.invoicing import (
    Invoice,
    InvoiceLine,
    InvoiceStatus,
    InvoiceType,
    SupplyType,
)
from app.models.ledger import (
    AccountGroup,
    Ledger,
    Voucher,
    VoucherLine,
    VoucherSequence,
    VoucherStatus,
    VoucherType,
)
from app.modules.inventory import service as inventory_service
from app.modules.invoicing.schemas import (
    InvoiceCancelRequest,
    InvoiceCreate,
    InvoiceDetailRead,
    InvoiceLineRead,
    InvoiceListItem,
    PartySnapshotRead,
    SellerSnapshotRead,
)
from app.modules.ledger.exceptions import (
    AccountingError,
    ConcurrencyConflictError,
    InvalidVoucherError,
    ResourceNotFoundError,
)
from app.modules.ledger.service import (
    _acquire_company_write_lock,
    _assert_period_open,
    _dialect_name,
    _format_fy_code,
    _fy_for_date,
    _get_company,
    _is_sqlite_busy,
    _map_integrity_error,
)
from app.modules.tax_india.gst_calculator import (
    GstLineComputed,
    GstLineInput,
    VALID_POS_CODES,
    build_hsn_summary,
    calculate_gst_invoice,
)
from app.modules.tax_india.schemas import HsnSummaryRowRead

SYSTEM_LEDGER_NAMES: tuple[str, ...] = (
    "Sales Account",
    "Sales Returns",
    "Purchase Account",
    "Cost of Goods Sold",
    "Stock-in-Hand",
    "Output CGST",
    "Output SGST",
    "Output IGST",
    "Input CGST",
    "Input SGST",
    "Input IGST",
    "RCM Output Tax Payable",
    "Round Off",
)

INVOICE_SEQUENCE_CONFIG: dict[InvoiceType, tuple[str, str]] = {
    InvoiceType.SALES: ("INVOICE_SALES", "INV"),
    InvoiceType.PURCHASE: ("PURCHASE", "PUR"),
    InvoiceType.CREDIT_NOTE: ("CREDIT_NOTE", "CN"),
    InvoiceType.DEBIT_NOTE: ("DEBIT_NOTE", "DN"),
}


class InvoiceAlreadyCancelledError(AccountingError):
    status_code = 409
    error_code = "INVOICE_ALREADY_CANCELLED"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def _next_invoice_number(
    db: AsyncSession,
    company_id: int,
    fy: FiscalYear,
    invoice_type: InvoiceType,
) -> str:
    seq_key, prefix = INVOICE_SEQUENCE_CONFIG[invoice_type]
    insert_fn = pg_insert if _dialect_name(db) == "postgresql" else sqlite_insert
    stmt = (
        insert_fn(VoucherSequence)
        .values(
            company_id=company_id,
            fiscal_year_id=fy.id,
            voucher_type=seq_key,
            last_value=1,
        )
        .on_conflict_do_update(
            index_elements=["company_id", "fiscal_year_id", "voucher_type"],
            set_={"last_value": VoucherSequence.last_value + 1},
        )
        .returning(VoucherSequence.last_value)
    )
    seq = int((await db.execute(stmt)).scalar_one())
    return f"{prefix}/{_format_fy_code(fy)}/{seq:04d}"


async def _resolve_system_ledgers(
    db: AsyncSession, company_id: int
) -> dict[str, Ledger]:
    stmt = select(Ledger).where(
        Ledger.company_id == company_id,
        Ledger.name.in_(SYSTEM_LEDGER_NAMES),
    )
    rows = list((await db.execute(stmt)).scalars().all())
    by_name = {l.name: l for l in rows}
    missing = [name for name in SYSTEM_LEDGER_NAMES if name not in by_name]
    if missing:
        raise ResourceNotFoundError(
            f"Required system ledgers missing for company id={company_id}: {', '.join(missing)}. "
            "Run `python -m app.seed.dummy_company` first."
        )
    return by_name


async def _resolve_or_create_cess_ledger(
    db: AsyncSession, company_id: int, *, is_input: bool
) -> Ledger:
    target_name = "Input Cess" if is_input else "Output Cess"
    existing = (
        await db.execute(
            select(Ledger).where(
                Ledger.company_id == company_id, Ledger.name == target_name
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    group_name = "Current Assets" if is_input else "Duties & Taxes"
    grp = (
        await db.execute(
            select(AccountGroup).where(
                AccountGroup.company_id == company_id, AccountGroup.name == group_name
            )
        )
    ).scalar_one_or_none()
    if grp is None:
        raise ResourceNotFoundError(f"Account group '{group_name}' not found.")

    ledger = Ledger(
        company_id=company_id,
        group_id=grp.id,
        code="2124" if is_input else "2135",
        name=target_name,
        opening_balance=ZERO,
        opening_dr_cr="DR" if is_input else "CR",
        is_system_ledger=True,
        is_active=True,
    )
    db.add(ledger)
    await db.flush()
    return ledger


async def _load_invoice_detail(
    db: AsyncSession, company_id: int, invoice_id: int
) -> tuple[Invoice, Company, Ledger]:
    company = await _get_company(db, company_id)
    stmt = (
        select(Invoice)
        .options(
            selectinload(Invoice.voucher),
            selectinload(Invoice.lines).selectinload(InvoiceLine.item),
            selectinload(Invoice.lines).selectinload(InvoiceLine.godown),
            selectinload(Invoice.lines).selectinload(InvoiceLine.tax_slab),
        )
        .where(Invoice.id == invoice_id, Invoice.company_id == company.id)
    )
    invoice = (await db.execute(stmt)).scalar_one_or_none()
    if invoice is None:
        raise ResourceNotFoundError(f"Invoice id={invoice_id} not found.")
    party = await db.get(Ledger, invoice.party_ledger_id)
    if party is None:
        raise ResourceNotFoundError(f"Party ledger id={invoice.party_ledger_id} not found.")
    return invoice, company, party


def _serialize_invoice_detail(
    invoice: Invoice, company: Company, party: Ledger
) -> InvoiceDetailRead:
    line_reads: list[InvoiceLineRead] = []
    calc_lines_for_hsn: list[GstLineComputed] = []

    for ln in invoice.lines:
        cgst_r = quantize_money(ln.cgst_rate)
        sgst_r = quantize_money(ln.sgst_rate)
        igst_r = quantize_money(ln.igst_rate)
        cess_r = quantize_money(ln.cess_rate)
        cgst_a = quantize_money(ln.cgst_amount)
        sgst_a = quantize_money(ln.sgst_amount)
        igst_a = quantize_money(ln.igst_amount)
        cess_a = quantize_money(ln.cess_amount)
        taxable_a = quantize_money(ln.taxable_amount)
        tax_a = quantize_money(cgst_a + sgst_a + igst_a + cess_a)

        calc_lines_for_hsn.append(
            GstLineComputed(
                hsn_sac_code=ln.hsn_sac_code,
                quantity=quantize_money(ln.quantity),
                unit_price=quantize_money(ln.unit_price),
                gross_amount=quantize_money(taxable_a + quantize_money(ln.discount_amount)),
                discount_pct=quantize_money(ln.discount_pct),
                discount_amount=quantize_money(ln.discount_amount),
                taxable_amount=taxable_a,
                is_inter_state=invoice.is_inter_state,
                cgst_rate=cgst_r,
                sgst_rate=sgst_r,
                igst_rate=igst_r,
                cess_rate=cess_r,
                cgst_amount=cgst_a,
                sgst_amount=sgst_a,
                igst_amount=igst_a,
                cess_amount=cess_a,
                tax_amount=tax_a,
                line_total=quantize_money(ln.line_total),
            )
        )

        line_reads.append(
            InvoiceLineRead(
                id=ln.id,
                line_no=ln.line_no,
                item_id=ln.item_id,
                item_sku=ln.item.sku if ln.item else None,
                item_type=ItemType(ln.item.item_type) if ln.item else None,
                godown_id=ln.godown_id,
                godown_code=ln.godown.code if ln.godown else None,
                godown_name=ln.godown.name if ln.godown else None,
                account_ledger_id=ln.account_ledger_id,
                description=ln.description,
                hsn_sac_code=ln.hsn_sac_code,
                uqc_code=ln.uqc_code,
                quantity=quantize_money(ln.quantity),
                unit_price=quantize_money(ln.unit_price),
                discount_pct=quantize_money(ln.discount_pct),
                discount_amount=quantize_money(ln.discount_amount),
                taxable_amount=taxable_a,
                tax_slab_id=ln.tax_slab_id,
                tax_slab_code=ln.tax_slab.code if ln.tax_slab else None,
                tax_slab_name=ln.tax_slab.name if ln.tax_slab else None,
                cgst_rate=cgst_r,
                sgst_rate=sgst_r,
                igst_rate=igst_r,
                cess_rate=cess_r,
                cgst_amount=cgst_a,
                sgst_amount=sgst_a,
                igst_amount=igst_a,
                cess_amount=cess_a,
                line_total=quantize_money(ln.line_total),
                line_cogs=quantize_money(ln.line_cogs),
                batch_ref=ln.batch_ref,
                expiry_date=ln.expiry_date,
            )
        )

    hsn_rows = [
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
        for h in build_hsn_summary(calc_lines_for_hsn)
    ]

    return InvoiceDetailRead(
        id=invoice.id,
        company_id=invoice.company_id,
        fiscal_year_id=invoice.fiscal_year_id,
        voucher_id=invoice.voucher_id,
        voucher_number=invoice.voucher.voucher_number if invoice.voucher else None,
        invoice_number=invoice.invoice_number,
        invoice_type=InvoiceType(invoice.invoice_type),
        supply_type=SupplyType(invoice.supply_type),
        invoice_date=invoice.invoice_date,
        due_date=invoice.due_date,
        party_ledger_id=invoice.party_ledger_id,
        party_name_snapshot=invoice.party_name_snapshot,
        party_gstin_snapshot=invoice.party_gstin_snapshot,
        party_state_code_snapshot=invoice.party_state_code_snapshot,
        origin_state_code=invoice.origin_state_code,
        place_of_supply=invoice.place_of_supply,
        is_inter_state=invoice.is_inter_state,
        is_rcm=invoice.is_rcm,
        original_invoice_id=invoice.original_invoice_id,
        supplier_invoice_no=invoice.supplier_invoice_no,
        supplier_invoice_date=invoice.supplier_invoice_date,
        subtotal=quantize_money(invoice.subtotal),
        total_discount=quantize_money(invoice.total_discount),
        taxable_total=quantize_money(invoice.taxable_total),
        cgst_total=quantize_money(invoice.cgst_total),
        sgst_total=quantize_money(invoice.sgst_total),
        igst_total=quantize_money(invoice.igst_total),
        cess_total=quantize_money(invoice.cess_total),
        tax_total=quantize_money(invoice.tax_total),
        round_off=quantize_money(invoice.round_off),
        grand_total=quantize_money(invoice.grand_total),
        total_cogs=quantize_money(invoice.total_cogs),
        status=InvoiceStatus(invoice.status),
        narration=invoice.narration,
        cancelled_at=invoice.cancelled_at,
        cancellation_reason=invoice.cancellation_reason,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        lines=line_reads,
        hsn_summary=hsn_rows,
        amount_in_words=amount_to_indian_words(quantize_money(invoice.grand_total)),
        seller_snapshot=SellerSnapshotRead(
            legal_name=company.legal_name,
            name=company.name,
            gstin=company.gstin,
            state_code=company.state_code,
            country_code=company.country_code,
            base_currency=company.base_currency,
        ),
        party_snapshot=PartySnapshotRead(
            ledger_id=party.id,
            ledger_code=party.code,
            name=invoice.party_name_snapshot,
            gstin=invoice.party_gstin_snapshot,
            state_code=invoice.party_state_code_snapshot,
        ),
    )


async def _post_invoice_internal(
    db: AsyncSession,
    *,
    company: Company,
    fy: FiscalYear,
    invoice: Invoice,
) -> None:
    """
    Executes stock receipts/issues and creates + posts the 1-to-1 balanced Double-Entry
    Voucher inside the caller's active write transaction.
    """
    _assert_period_open(fy, invoice.invoice_date)
    if quantize_money(invoice.grand_total) <= ZERO:
        raise InvalidVoucherError(
            "Posted invoice grand_total must be greater than 0.0000."
        )

    sys_ledgers = await _resolve_system_ledgers(db, company.id)

    # Pre-load referenced items for all lines
    item_ids = {ln.item_id for ln in invoice.lines if ln.item_id is not None}
    items_by_id: dict[int, InventoryItem] = {}
    if item_ids:
        item_rows = (
            await db.execute(
                select(InventoryItem)
                .options(selectinload(InventoryItem.unit))
                .where(
                    InventoryItem.company_id == company.id,
                    InventoryItem.id.in_(item_ids),
                )
            )
        ).scalars().all()
        items_by_id = {i.id: i for i in item_rows}

    # Aggregate double-entry legs by (ledger_id, side) -> (Decimal, list[str])
    gl_legs: dict[tuple[int, str], tuple[Decimal, list[str]]] = {}

    def _add_leg(ledger_id: int, side: str, amount: Decimal, note: str) -> None:
        q = quantize_money(amount)
        if q <= ZERO:
            return
        key = (ledger_id, side)
        prev_amt, notes = gl_legs.get(key, (ZERO, []))
        if note and note not in notes:
            notes.append(note)
        gl_legs[key] = (quantize_money(prev_amt + q), notes)

    inv_type = InvoiceType(invoice.invoice_type)
    total_cogs = ZERO

    if inv_type == InvoiceType.SALES:
        _add_leg(
            invoice.party_ledger_id,
            "DR",
            quantize_money(invoice.grand_total),
            f"Receivable against {invoice.invoice_number}",
        )
        for ln in invoice.lines:
            item = items_by_id.get(ln.item_id) if ln.item_id is not None else None
            sales_lid = (
                ln.account_ledger_id
                or (item.sales_ledger_id if item else None)
                or sys_ledgers["Sales Account"].id
            )
            _add_leg(
                sales_lid,
                "CR",
                quantize_money(ln.taxable_amount),
                f"Sales ({ln.description[:40]})",
            )
            if item is not None and item.item_type == ItemType.GOODS.value:
                if ln.godown_id is None:
                    raise InvalidVoucherError(
                        f"Line #{ln.line_no} ({item.sku}): godown_id is required for GOODS."
                    )
                _mov, cogs = await inventory_service.issue_stock(
                    db,
                    company_id=company.id,
                    item=item,
                    godown_id=ln.godown_id,
                    qty=quantize_money(ln.quantity),
                    movement_date=invoice.invoice_date,
                    reason=MovementReason.SALE,
                    invoice_id=invoice.id,
                    invoice_line_id=ln.id,
                )
                ln.line_cogs = cogs
                total_cogs = quantize_money(total_cogs + cogs)
                if cogs > ZERO:
                    cogs_lid = item.cogs_ledger_id or sys_ledgers["Cost of Goods Sold"].id
                    inv_lid = item.inventory_ledger_id or sys_ledgers["Stock-in-Hand"].id
                    _add_leg(cogs_lid, "DR", cogs, f"COGS ({item.sku})")
                    _add_leg(inv_lid, "CR", cogs, f"Stock outward ({item.sku})")

        _add_leg(
            sys_ledgers["Output CGST"].id, "CR", quantize_money(invoice.cgst_total), "Output CGST"
        )
        _add_leg(
            sys_ledgers["Output SGST"].id, "CR", quantize_money(invoice.sgst_total), "Output SGST"
        )
        _add_leg(
            sys_ledgers["Output IGST"].id, "CR", quantize_money(invoice.igst_total), "Output IGST"
        )
        if quantize_money(invoice.cess_total) > ZERO:
            cess_ledger = await _resolve_or_create_cess_ledger(
                db, company.id, is_input=False
            )
            _add_leg(cess_ledger.id, "CR", quantize_money(invoice.cess_total), "Output Cess")

        ro = quantize_money(invoice.round_off)
        if ro > ZERO:
            _add_leg(sys_ledgers["Round Off"].id, "CR", ro, "Invoice round-off (+)")
        elif ro < ZERO:
            _add_leg(sys_ledgers["Round Off"].id, "DR", abs(ro), "Invoice round-off (-)")

    elif inv_type == InvoiceType.PURCHASE:
        for ln in invoice.lines:
            item = items_by_id.get(ln.item_id) if ln.item_id is not None else None
            taxable = quantize_money(ln.taxable_amount)
            qty = quantize_money(ln.quantity)
            if item is not None and item.item_type == ItemType.GOODS.value:
                if ln.godown_id is None:
                    raise InvalidVoucherError(
                        f"Line #{ln.line_no} ({item.sku}): godown_id is required for GOODS."
                    )
                landed_unit_cost = (taxable / qty).quantize(
                    MONEY_QUANT, rounding=ROUND_HALF_UP
                )
                _lot, mov = await inventory_service.receive_stock(
                    db,
                    company_id=company.id,
                    item=item,
                    godown_id=ln.godown_id,
                    qty=qty,
                    unit_cost=landed_unit_cost,
                    received_date=invoice.invoice_date,
                    reason=MovementReason.PURCHASE,
                    source_invoice_id=invoice.id,
                    source_invoice_line_id=ln.id,
                    batch_ref=ln.batch_ref,
                    expiry_date=ln.expiry_date,
                    line_no=ln.line_no,
                )
                in_cost = quantize_money(mov.total_cost) if mov else taxable
                inv_lid = (
                    ln.account_ledger_id
                    or item.inventory_ledger_id
                    or sys_ledgers["Stock-in-Hand"].id
                )
                _add_leg(inv_lid, "DR", in_cost, f"Stock inward ({item.sku})")
                cost_diff = quantize_money(taxable - in_cost)
                pur_lid = item.purchase_ledger_id or sys_ledgers["Purchase Account"].id
                if cost_diff > ZERO:
                    _add_leg(pur_lid, "DR", cost_diff, "Purchase rounding variance")
                elif cost_diff < ZERO:
                    _add_leg(pur_lid, "CR", abs(cost_diff), "Purchase rounding variance")
            else:
                pur_lid = (
                    ln.account_ledger_id
                    or (item.purchase_ledger_id if item else None)
                    or sys_ledgers["Purchase Account"].id
                )
                _add_leg(pur_lid, "DR", taxable, f"Purchase ({ln.description[:40]})")

        _add_leg(
            sys_ledgers["Input CGST"].id, "DR", quantize_money(invoice.cgst_total), "Input CGST"
        )
        _add_leg(
            sys_ledgers["Input SGST"].id, "DR", quantize_money(invoice.sgst_total), "Input SGST"
        )
        _add_leg(
            sys_ledgers["Input IGST"].id, "DR", quantize_money(invoice.igst_total), "Input IGST"
        )
        if quantize_money(invoice.cess_total) > ZERO:
            cess_in = await _resolve_or_create_cess_ledger(
                db, company.id, is_input=True
            )
            _add_leg(cess_in.id, "DR", quantize_money(invoice.cess_total), "Input Cess")

        ro = quantize_money(invoice.round_off)
        if ro > ZERO:
            _add_leg(sys_ledgers["Round Off"].id, "DR", ro, "Invoice round-off (+)")
        elif ro < ZERO:
            _add_leg(sys_ledgers["Round Off"].id, "CR", abs(ro), "Invoice round-off (-)")

        _add_leg(
            invoice.party_ledger_id,
            "CR",
            quantize_money(invoice.grand_total),
            f"Payable against {invoice.invoice_number}",
        )
        if invoice.is_rcm and quantize_money(invoice.tax_total) > ZERO:
            _add_leg(
                sys_ledgers["RCM Output Tax Payable"].id,
                "CR",
                quantize_money(invoice.tax_total),
                "Self-assessed RCM tax payable",
            )

    elif inv_type == InvoiceType.CREDIT_NOTE:
        for ln in invoice.lines:
            item = items_by_id.get(ln.item_id) if ln.item_id is not None else None
            ret_lid = ln.account_ledger_id or sys_ledgers["Sales Returns"].id
            _add_leg(
                ret_lid,
                "DR",
                quantize_money(ln.taxable_amount),
                f"Sales Return ({ln.description[:40]})",
            )
            if item is not None and item.item_type == ItemType.GOODS.value:
                if ln.godown_id is None:
                    raise InvalidVoucherError(
                        f"Line #{ln.line_no} ({item.sku}): godown_id is required for GOODS."
                    )
                orig_unit_cost: Decimal | None = None
                if invoice.original_invoice_id is not None:
                    orig_movs = list(
                        (
                            await db.execute(
                                select(StockMovement)
                                .where(
                                    StockMovement.company_id == company.id,
                                    StockMovement.invoice_id == invoice.original_invoice_id,
                                    StockMovement.item_id == item.id,
                                    StockMovement.direction == StockDirection.OUT.value,
                                )
                                .order_by(StockMovement.id.asc())
                            )
                        )
                        .scalars()
                        .all()
                    )
                    if len(orig_movs) == 1:
                        orig_unit_cost = quantize_money(orig_movs[0].unit_cost)
                    elif len(orig_movs) > 1:
                        tot_q = sum((quantize_money(m.quantity) for m in orig_movs), ZERO)
                        tot_c = sum((quantize_money(m.total_cost) for m in orig_movs), ZERO)
                        if tot_q > ZERO:
                            orig_unit_cost = (tot_c / tot_q).quantize(
                                MONEY_QUANT, rounding=ROUND_HALF_UP
                            )
                if orig_unit_cost is None:
                    _prev_q, prev_avg = await inventory_service._get_latest_running_state(
                        db, company.id, item.id, ln.godown_id
                    )
                    orig_unit_cost = (
                        prev_avg
                        if prev_avg > ZERO
                        else quantize_money(item.standard_purchase_cost)
                    )

                _lot, mov = await inventory_service.receive_stock(
                    db,
                    company_id=company.id,
                    item=item,
                    godown_id=ln.godown_id,
                    qty=quantize_money(ln.quantity),
                    unit_cost=orig_unit_cost,
                    received_date=invoice.invoice_date,
                    reason=MovementReason.SALES_RETURN,
                    source_invoice_id=invoice.id,
                    source_invoice_line_id=ln.id,
                    batch_ref=f"RET-{invoice.invoice_number}",
                    expiry_date=ln.expiry_date,
                    line_no=ln.line_no,
                )
                ret_cost = quantize_money(mov.total_cost) if mov else ZERO
                ln.line_cogs = ret_cost
                total_cogs = quantize_money(total_cogs + ret_cost)
                if ret_cost > ZERO:
                    inv_lid = item.inventory_ledger_id or sys_ledgers["Stock-in-Hand"].id
                    cogs_lid = item.cogs_ledger_id or sys_ledgers["Cost of Goods Sold"].id
                    _add_leg(inv_lid, "DR", ret_cost, f"Sales return stock ({item.sku})")
                    _add_leg(cogs_lid, "CR", ret_cost, f"COGS reversal ({item.sku})")

        _add_leg(
            sys_ledgers["Output CGST"].id, "DR", quantize_money(invoice.cgst_total), "Output CGST reversal"
        )
        _add_leg(
            sys_ledgers["Output SGST"].id, "DR", quantize_money(invoice.sgst_total), "Output SGST reversal"
        )
        _add_leg(
            sys_ledgers["Output IGST"].id, "DR", quantize_money(invoice.igst_total), "Output IGST reversal"
        )
        if quantize_money(invoice.cess_total) > ZERO:
            cess_out = await _resolve_or_create_cess_ledger(
                db, company.id, is_input=False
            )
            _add_leg(cess_out.id, "DR", quantize_money(invoice.cess_total), "Output Cess reversal")

        ro = quantize_money(invoice.round_off)
        if ro > ZERO:
            _add_leg(sys_ledgers["Round Off"].id, "DR", ro, "Credit note round-off (+)")
        elif ro < ZERO:
            _add_leg(sys_ledgers["Round Off"].id, "CR", abs(ro), "Credit note round-off (-)")

        _add_leg(
            invoice.party_ledger_id,
            "CR",
            quantize_money(invoice.grand_total),
            f"Customer credit {invoice.invoice_number}",
        )

    elif inv_type == InvoiceType.DEBIT_NOTE:
        _add_leg(
            invoice.party_ledger_id,
            "DR",
            quantize_money(invoice.grand_total),
            f"Vendor debit {invoice.invoice_number}",
        )
        for ln in invoice.lines:
            item = items_by_id.get(ln.item_id) if ln.item_id is not None else None
            taxable = quantize_money(ln.taxable_amount)
            if item is not None and item.item_type == ItemType.GOODS.value:
                if ln.godown_id is None:
                    raise InvalidVoucherError(
                        f"Line #{ln.line_no} ({item.sku}): godown_id is required for GOODS."
                    )
                _mov, depleted_cost = await inventory_service.issue_stock(
                    db,
                    company_id=company.id,
                    item=item,
                    godown_id=ln.godown_id,
                    qty=quantize_money(ln.quantity),
                    movement_date=invoice.invoice_date,
                    reason=MovementReason.PURCHASE_RETURN,
                    invoice_id=invoice.id,
                    invoice_line_id=ln.id,
                    preferred_source_invoice_id=invoice.original_invoice_id,
                )
                ln.line_cogs = depleted_cost
                total_cogs = quantize_money(total_cogs + depleted_cost)
                inv_lid = item.inventory_ledger_id or sys_ledgers["Stock-in-Hand"].id
                _add_leg(inv_lid, "CR", depleted_cost, f"Purchase return stock ({item.sku})")
                diff = quantize_money(taxable - depleted_cost)
                pur_lid = (
                    ln.account_ledger_id
                    or item.purchase_ledger_id
                    or sys_ledgers["Purchase Account"].id
                )
                if diff > ZERO:
                    _add_leg(pur_lid, "CR", diff, "Purchase return price variance")
                elif diff < ZERO:
                    _add_leg(pur_lid, "DR", abs(diff), "Purchase return price variance")
            else:
                pur_lid = (
                    ln.account_ledger_id
                    or (item.purchase_ledger_id if item else None)
                    or sys_ledgers["Purchase Account"].id
                )
                _add_leg(pur_lid, "CR", taxable, f"Purchase Return ({ln.description[:40]})")

        if invoice.is_rcm and quantize_money(invoice.tax_total) > ZERO:
            _add_leg(
                sys_ledgers["RCM Output Tax Payable"].id,
                "DR",
                quantize_money(invoice.tax_total),
                "RCM liability reversal",
            )
        _add_leg(
            sys_ledgers["Input CGST"].id, "CR", quantize_money(invoice.cgst_total), "Input CGST reversal"
        )
        _add_leg(
            sys_ledgers["Input SGST"].id, "CR", quantize_money(invoice.sgst_total), "Input SGST reversal"
        )
        _add_leg(
            sys_ledgers["Input IGST"].id, "CR", quantize_money(invoice.igst_total), "Input IGST reversal"
        )
        if quantize_money(invoice.cess_total) > ZERO:
            cess_in = await _resolve_or_create_cess_ledger(
                db, company.id, is_input=True
            )
            _add_leg(cess_in.id, "CR", quantize_money(invoice.cess_total), "Input Cess reversal")

        ro = quantize_money(invoice.round_off)
        if ro > ZERO:
            _add_leg(sys_ledgers["Round Off"].id, "CR", ro, "Debit note round-off (+)")
        elif ro < ZERO:
            _add_leg(sys_ledgers["Round Off"].id, "DR", abs(ro), "Debit note round-off (-)")

    voucher_lines: list[VoucherLine] = []
    for (ledger_id, side), (amt, notes) in gl_legs.items():
        if amt <= ZERO:
            continue
        voucher_lines.append(
            VoucherLine(
                ledger_id=ledger_id,
                debit_amount=amt if side == "DR" else ZERO,
                credit_amount=amt if side == "CR" else ZERO,
                line_narration="; ".join(notes)[:255] if notes else None,
            )
        )

    voucher = Voucher(
        company_id=company.id,
        fiscal_year_id=fy.id,
        voucher_number=invoice.invoice_number,
        voucher_type=VoucherType(invoice.invoice_type).value,
        voucher_date=invoice.invoice_date,
        reference_no=invoice.supplier_invoice_no or invoice.invoice_number,
        narration=(
            invoice.narration.strip()
            or f"{invoice.invoice_type} {invoice.invoice_number} · {invoice.party_name_snapshot}"
        )[:500],
        status=VoucherStatus.DRAFT.value,
        lines=voucher_lines,
    )
    db.add(voucher)
    await db.flush()

    voucher.status = VoucherStatus.POSTED.value
    await db.flush()

    await db.execute(
        update(StockMovement)
        .where(
            StockMovement.company_id == company.id,
            StockMovement.invoice_id == invoice.id,
        )
        .values(voucher_id=voucher.id)
    )

    invoice.voucher_id = voucher.id
    invoice.total_cogs = quantize_money(total_cogs)
    invoice.status = InvoiceStatus.POSTED.value
    await db.flush()


async def create_invoice(
    db: AsyncSession,
    payload: InvoiceCreate,
    *,
    company_id: int | None = None,
) -> InvoiceDetailRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    fy = await _fy_for_date(db, company.id, payload.invoice_date)
    if fy is None:
        raise InvalidVoucherError(
            f"Invoice date {payload.invoice_date.isoformat()} does not fall within any configured Fiscal Year."
        )
    _assert_period_open(fy, payload.invoice_date)

    party = await db.get(Ledger, payload.party_ledger_id)
    if party is None or party.company_id != company.id or not party.is_active:
        raise ResourceNotFoundError(
            f"Party ledger id={payload.party_ledger_id} not found or inactive."
        )

    if payload.original_invoice_id is not None:
        orig = await db.get(Invoice, payload.original_invoice_id)
        if orig is None or orig.company_id != company.id:
            raise ResourceNotFoundError(
                f"Original invoice id={payload.original_invoice_id} not found."
            )
        if orig.status != InvoiceStatus.POSTED.value:
            raise InvalidVoucherError(
                "Original invoice referenced by Credit/Debit Note must be POSTED."
            )
        if payload.invoice_type == InvoiceType.CREDIT_NOTE and orig.invoice_type != InvoiceType.SALES.value:
            raise InvalidVoucherError(
                "Credit Note original_invoice_id must reference a POSTED SALES invoice."
            )
        if payload.invoice_type == InvoiceType.DEBIT_NOTE and orig.invoice_type != InvoiceType.PURCHASE.value:
            raise InvalidVoucherError(
                "Debit Note original_invoice_id must reference a POSTED PURCHASE invoice."
            )

    pos = (
        payload.place_of_supply.strip()
        if payload.place_of_supply and payload.place_of_supply.strip()
        else (
            "96"
            if payload.supply_type in (SupplyType.EXPORT_LUT, SupplyType.EXPORT_WPAY)
            else (party.party_state_code or company.state_code)
        )
    )
    if pos not in VALID_POS_CODES:
        raise InvalidVoucherError(f"Invalid place_of_supply '{pos}'.")

    due_date = payload.due_date
    if due_date is None and party.credit_days > 0:
        due_date = payload.invoice_date + timedelta(days=party.credit_days)

    # Pre-fetch items, godowns, slabs, override ledgers
    default_godown = (
        await db.execute(
            select(Godown)
            .where(Godown.company_id == company.id, Godown.is_active.is_(True))
            .order_by(Godown.is_default.desc(), Godown.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()

    item_ids = {ln.item_id for ln in payload.lines if ln.item_id is not None}
    items_by_id: dict[int, InventoryItem] = {}
    if item_ids:
        item_rows = (
            await db.execute(
                select(InventoryItem)
                .options(
                    selectinload(InventoryItem.unit),
                    selectinload(InventoryItem.hsn_sac),
                    selectinload(InventoryItem.default_tax_slab),
                )
                .where(
                    InventoryItem.company_id == company.id,
                    InventoryItem.is_active.is_(True),
                    InventoryItem.id.in_(item_ids),
                )
            )
        ).scalars().all()
        items_by_id = {i.id: i for i in item_rows}

    godown_ids = {ln.godown_id for ln in payload.lines if ln.godown_id is not None}
    godowns_by_id: dict[int, Godown] = {}
    if godown_ids:
        g_rows = (
            await db.execute(
                select(Godown).where(
                    Godown.company_id == company.id,
                    Godown.is_active.is_(True),
                    Godown.id.in_(godown_ids),
                )
            )
        ).scalars().all()
        godowns_by_id = {g.id: g for g in g_rows}

    slab_ids = {ln.tax_slab_id for ln in payload.lines if ln.tax_slab_id is not None}
    slabs_by_id: dict[int, GstTaxSlab] = {}
    if slab_ids:
        s_rows = (
            await db.execute(
                select(GstTaxSlab).where(
                    GstTaxSlab.company_id == company.id,
                    GstTaxSlab.id.in_(slab_ids),
                )
            )
        ).scalars().all()
        slabs_by_id = {s.id: s for s in s_rows}

    acct_ledger_ids = {
        ln.account_ledger_id for ln in payload.lines if ln.account_ledger_id is not None
    }
    if acct_ledger_ids:
        found_lids = set(
            (
                await db.execute(
                    select(Ledger.id).where(
                        Ledger.company_id == company.id,
                        Ledger.is_active.is_(True),
                        Ledger.id.in_(acct_ledger_ids),
                    )
                )
            )
            .scalars()
            .all()
        )
        missing_lids = acct_ledger_ids - found_lids
        if missing_lids:
            raise ResourceNotFoundError(
                f"Account ledger(s) not found or inactive: {sorted(missing_lids)}"
            )

    calc_inputs: list[GstLineInput] = []
    resolved_meta: list[dict] = []

    for idx, ln_in in enumerate(payload.lines, start=1):
        item: InventoryItem | None = None
        if ln_in.item_id is not None:
            item = items_by_id.get(ln_in.item_id)
            if item is None:
                raise ResourceNotFoundError(
                    f"Line #{idx}: InventoryItem id={ln_in.item_id} not found or inactive."
                )

        eff_godown_id: int | None = None
        if item is not None and item.item_type == ItemType.GOODS.value:
            if ln_in.godown_id is not None:
                gd = godowns_by_id.get(ln_in.godown_id)
                if gd is None:
                    raise ResourceNotFoundError(
                        f"Line #{idx}: Godown id={ln_in.godown_id} not found or inactive."
                    )
                eff_godown_id = gd.id
            elif default_godown is not None:
                eff_godown_id = default_godown.id
            else:
                raise InvalidVoucherError(
                    f"Line #{idx}: godown_id is required for GOODS item '{item.sku}'."
                )

        slab: GstTaxSlab | None = None
        if ln_in.tax_slab_id is not None:
            slab = slabs_by_id.get(ln_in.tax_slab_id)
            if slab is None:
                raise ResourceNotFoundError(
                    f"Line #{idx}: GstTaxSlab id={ln_in.tax_slab_id} not found."
                )
        elif item is not None and item.default_tax_slab is not None:
            slab = item.default_tax_slab

        desc = (
            ln_in.description.strip()
            if ln_in.description and ln_in.description.strip()
            else (item.name if item else "")
        )
        if not desc:
            raise InvalidVoucherError(f"Line #{idx}: description is required.")

        hsn_code = (
            ln_in.hsn_sac_code.strip().upper()
            if ln_in.hsn_sac_code and ln_in.hsn_sac_code.strip()
            else (item.hsn_sac.code if item and item.hsn_sac else None)
        )
        uqc = (
            ln_in.uqc_code.strip().upper()
            if ln_in.uqc_code and ln_in.uqc_code.strip()
            else (item.unit.uqc_code if item else "NOS")
        )

        calc_inputs.append(
            GstLineInput(
                quantity=ln_in.quantity,
                unit_price=ln_in.unit_price,
                discount_pct=ln_in.discount_pct,
                discount_amount=ln_in.discount_amount,
                slab_cgst_rate=slab.cgst_rate if slab else ZERO,
                slab_sgst_rate=slab.sgst_rate if slab else ZERO,
                slab_igst_rate=slab.igst_rate if slab else ZERO,
                slab_cess_rate=slab.cess_rate if slab else ZERO,
                hsn_sac_code=hsn_code,
            )
        )
        resolved_meta.append(
            {
                "line_no": idx,
                "item_id": item.id if item else None,
                "godown_id": eff_godown_id,
                "account_ledger_id": ln_in.account_ledger_id,
                "description": desc,
                "hsn_sac_code": hsn_code,
                "uqc_code": uqc,
                "tax_slab_id": slab.id if slab else None,
                "batch_ref": ln_in.batch_ref.strip() if ln_in.batch_ref else None,
                "expiry_date": ln_in.expiry_date,
            }
        )

    gst_res = calculate_gst_invoice(
        lines=calc_inputs,
        origin_state_code=company.state_code,
        place_of_supply=pos,
        supply_type=payload.supply_type.value,
        is_rcm=payload.is_rcm,
        enable_round_off=payload.enable_round_off,
    )

    invoice_number = await _next_invoice_number(
        db, company.id, fy, payload.invoice_type
    )

    orm_lines = [
        InvoiceLine(
            line_no=meta["line_no"],
            item_id=meta["item_id"],
            godown_id=meta["godown_id"],
            account_ledger_id=meta["account_ledger_id"],
            description=meta["description"],
            hsn_sac_code=meta["hsn_sac_code"],
            uqc_code=meta["uqc_code"],
            quantity=calc.quantity,
            unit_price=calc.unit_price,
            discount_pct=calc.discount_pct,
            discount_amount=calc.discount_amount,
            taxable_amount=calc.taxable_amount,
            tax_slab_id=meta["tax_slab_id"],
            cgst_rate=calc.cgst_rate,
            sgst_rate=calc.sgst_rate,
            igst_rate=calc.igst_rate,
            cess_rate=calc.cess_rate,
            cgst_amount=calc.cgst_amount,
            sgst_amount=calc.sgst_amount,
            igst_amount=calc.igst_amount,
            cess_amount=calc.cess_amount,
            line_total=calc.line_total,
            line_cogs=ZERO,
            batch_ref=meta["batch_ref"],
            expiry_date=meta["expiry_date"],
        )
        for meta, calc in zip(resolved_meta, gst_res.lines, strict=True)
    ]

    invoice = Invoice(
        company_id=company.id,
        fiscal_year_id=fy.id,
        voucher_id=None,
        invoice_number=invoice_number,
        invoice_type=payload.invoice_type.value,
        supply_type=payload.supply_type.value,
        invoice_date=payload.invoice_date,
        due_date=due_date,
        party_ledger_id=party.id,
        party_name_snapshot=party.name,
        party_gstin_snapshot=party.party_gstin,
        party_state_code_snapshot=party.party_state_code,
        origin_state_code=company.state_code,
        place_of_supply=pos,
        is_inter_state=gst_res.is_inter_state,
        is_rcm=payload.is_rcm,
        original_invoice_id=payload.original_invoice_id,
        supplier_invoice_no=(
            payload.supplier_invoice_no.strip()
            if payload.supplier_invoice_no and payload.supplier_invoice_no.strip()
            else None
        ),
        supplier_invoice_date=payload.supplier_invoice_date,
        subtotal=gst_res.subtotal,
        total_discount=gst_res.total_discount,
        taxable_total=gst_res.taxable_total,
        cgst_total=gst_res.cgst_total,
        sgst_total=gst_res.sgst_total,
        igst_total=gst_res.igst_total,
        cess_total=gst_res.cess_total,
        tax_total=gst_res.tax_total,
        round_off=gst_res.round_off,
        grand_total=gst_res.grand_total,
        total_cogs=ZERO,
        status=InvoiceStatus.DRAFT.value,
        narration=payload.narration.strip(),
        lines=orm_lines,
    )
    db.add(invoice)

    try:
        await db.flush()
        if payload.status == InvoiceStatus.POSTED:
            await _post_invoice_internal(db, company=company, fy=fy, invoice=invoice)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _map_integrity_error(exc, invoice_number, fy) from exc
    except OperationalError as exc:
        await db.rollback()
        if _is_sqlite_busy(exc):
            raise ConcurrencyConflictError(
                "Ledger is busy with another posting; please retry."
            ) from exc
        raise
    except Exception:
        await db.rollback()
        raise

    loaded, comp, prt = await _load_invoice_detail(db, company.id, invoice.id)
    return _serialize_invoice_detail(loaded, comp, prt)


async def list_invoices(
    db: AsyncSession,
    *,
    company_id: int | None = None,
    invoice_type: InvoiceType | None = None,
    status: InvoiceStatus | None = None,
    party_ledger_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    q: str | None = None,
) -> list[InvoiceListItem]:
    company = await _get_company(db, company_id)
    stmt = (
        select(Invoice)
        .options(selectinload(Invoice.voucher))
        .where(Invoice.company_id == company.id)
        .order_by(Invoice.invoice_date.desc(), Invoice.id.desc())
    )
    if invoice_type is not None:
        stmt = stmt.where(Invoice.invoice_type == invoice_type.value)
    if status is not None:
        stmt = stmt.where(Invoice.status == status.value)
    if party_ledger_id is not None:
        stmt = stmt.where(Invoice.party_ledger_id == party_ledger_id)
    if from_date is not None:
        stmt = stmt.where(Invoice.invoice_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Invoice.invoice_date <= to_date)
    if q and q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Invoice.invoice_number.ilike(pat),
                Invoice.party_name_snapshot.ilike(pat),
                Invoice.party_gstin_snapshot.ilike(pat),
                Invoice.supplier_invoice_no.ilike(pat),
                Invoice.narration.ilike(pat),
            )
        )
    rows = list((await db.execute(stmt)).scalars().all())
    return [
        InvoiceListItem(
            id=inv.id,
            company_id=inv.company_id,
            fiscal_year_id=inv.fiscal_year_id,
            voucher_id=inv.voucher_id,
            voucher_number=inv.voucher.voucher_number if inv.voucher else None,
            invoice_number=inv.invoice_number,
            invoice_type=InvoiceType(inv.invoice_type),
            supply_type=SupplyType(inv.supply_type),
            invoice_date=inv.invoice_date,
            due_date=inv.due_date,
            party_ledger_id=inv.party_ledger_id,
            party_name_snapshot=inv.party_name_snapshot,
            party_gstin_snapshot=inv.party_gstin_snapshot,
            origin_state_code=inv.origin_state_code,
            place_of_supply=inv.place_of_supply,
            is_inter_state=inv.is_inter_state,
            is_rcm=inv.is_rcm,
            taxable_total=quantize_money(inv.taxable_total),
            tax_total=quantize_money(inv.tax_total),
            round_off=quantize_money(inv.round_off),
            grand_total=quantize_money(inv.grand_total),
            total_cogs=quantize_money(inv.total_cogs),
            status=InvoiceStatus(inv.status),
            created_at=inv.created_at,
        )
        for inv in rows
    ]


async def get_invoice_detail(
    db: AsyncSession, invoice_id: int, *, company_id: int | None = None
) -> InvoiceDetailRead:
    company = await _get_company(db, company_id)
    invoice, comp, party = await _load_invoice_detail(db, company.id, invoice_id)
    return _serialize_invoice_detail(invoice, comp, party)


async def post_draft_invoice(
    db: AsyncSession, invoice_id: int, *, company_id: int | None = None
) -> InvoiceDetailRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    invoice, comp, party = await _load_invoice_detail(db, company.id, invoice_id)
    if invoice.status == InvoiceStatus.POSTED.value:
        raise InvalidVoucherError(f"Invoice {invoice.invoice_number} is already POSTED.")
    if invoice.status == InvoiceStatus.CANCELLED.value:
        raise InvoiceAlreadyCancelledError(
            f"Invoice {invoice.invoice_number} is CANCELLED and cannot be posted."
        )

    fy = await db.get(FiscalYear, invoice.fiscal_year_id)
    if fy is None:
        raise ResourceNotFoundError(f"FiscalYear id={invoice.fiscal_year_id} not found.")

    try:
        await _post_invoice_internal(db, company=comp, fy=fy, invoice=invoice)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _map_integrity_error(exc, invoice.invoice_number, fy) from exc
    except OperationalError as exc:
        await db.rollback()
        if _is_sqlite_busy(exc):
            raise ConcurrencyConflictError(
                "Ledger is busy with another posting; please retry."
            ) from exc
        raise
    except Exception:
        await db.rollback()
        raise

    loaded, comp, prt = await _load_invoice_detail(db, company.id, invoice.id)
    return _serialize_invoice_detail(loaded, comp, prt)


async def cancel_invoice(
    db: AsyncSession,
    invoice_id: int,
    payload: InvoiceCancelRequest,
    *,
    company_id: int | None = None,
) -> InvoiceDetailRead:
    await begin_write_transaction(db)
    company = await _get_company(db, company_id)
    await _acquire_company_write_lock(db, company.id)

    invoice, comp, party = await _load_invoice_detail(db, company.id, invoice_id)
    if invoice.status == InvoiceStatus.CANCELLED.value:
        raise InvoiceAlreadyCancelledError(
            f"Invoice {invoice.invoice_number} is already CANCELLED."
        )

    fy = await db.get(FiscalYear, invoice.fiscal_year_id)
    if fy is None:
        raise ResourceNotFoundError(f"FiscalYear id={invoice.fiscal_year_id} not found.")
    _assert_period_open(fy, invoice.invoice_date)

    reason_clean = payload.reason.strip()
    if invoice.status == InvoiceStatus.DRAFT.value:
        invoice.status = InvoiceStatus.CANCELLED.value
        invoice.cancelled_at = _utc_now()
        invoice.cancellation_reason = reason_clean
        await db.commit()
        loaded, comp, prt = await _load_invoice_detail(db, company.id, invoice.id)
        return _serialize_invoice_detail(loaded, comp, prt)

    try:
        if invoice.invoice_type in (
            InvoiceType.PURCHASE.value,
            InvoiceType.CREDIT_NOTE.value,
        ):
            await inventory_service.reverse_inward_invoice_lots(
                db,
                company_id=company.id,
                invoice_id=invoice.id,
                reversal_date=invoice.invoice_date,
                voucher_id=invoice.voucher_id,
            )
        else:
            await inventory_service.reverse_outward_invoice_movements(
                db,
                company_id=company.id,
                invoice_id=invoice.id,
                reversal_date=invoice.invoice_date,
                voucher_id=invoice.voucher_id,
            )

        if invoice.voucher is not None:
            invoice.voucher.status = VoucherStatus.CANCELLED.value

        invoice.status = InvoiceStatus.CANCELLED.value
        invoice.cancelled_at = _utc_now()
        invoice.cancellation_reason = reason_clean
        await db.commit()
    except OperationalError as exc:
        await db.rollback()
        if _is_sqlite_busy(exc):
            raise ConcurrencyConflictError(
                "Ledger is busy with another posting; please retry."
            ) from exc
        raise
    except Exception:
        await db.rollback()
        raise

    loaded, comp, prt = await _load_invoice_detail(db, company.id, invoice.id)
    return _serialize_invoice_detail(loaded, comp, prt)
