from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.money import ZERO, MoneyNumeric18_4

if TYPE_CHECKING:
    from app.models.gst import GstTaxSlab, HsnSacCode
    from app.models.invoicing import Invoice


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ItemType(StrEnum):
    GOODS = "GOODS"
    SERVICE = "SERVICE"


class ValuationMethod(StrEnum):
    FIFO = "FIFO"
    WEIGHTED_AVG = "WEIGHTED_AVG"


class StockDirection(StrEnum):
    IN = "IN"
    OUT = "OUT"


class MovementReason(StrEnum):
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    SALES_RETURN = "SALES_RETURN"
    PURCHASE_RETURN = "PURCHASE_RETURN"
    CANCELLATION_REVERSAL = "CANCELLATION_REVERSAL"
    OPENING_STOCK = "OPENING_STOCK"
    ADJUSTMENT = "ADJUSTMENT"


class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"
    __table_args__ = (
        UniqueConstraint("company_id", "symbol", name="uq_uom_company_symbol"),
        CheckConstraint(
            "decimal_places >= 0 AND decimal_places <= 4",
            name="valid_uom_decimal_places",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    formal_name: Mapped[str] = mapped_column(String(64), nullable=False)
    uqc_code: Mapped[str] = mapped_column(String(16), nullable=False, default="NOS")
    decimal_places: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Godown(Base):
    __tablename__ = "godowns"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_godowns_company_code"),
        UniqueConstraint("company_id", "name", name="uq_godowns_company_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("company_id", "sku", name="uq_inventory_items_company_sku"),
        CheckConstraint("item_type IN ('GOODS', 'SERVICE')", name="valid_item_type"),
        CheckConstraint(
            "valuation_method IN ('FIFO', 'WEIGHTED_AVG')",
            name="valid_valuation_method",
        ),
        CheckConstraint(
            "standard_selling_price >= 0 AND standard_purchase_cost >= 0 AND reorder_level >= 0",
            name="non_negative_item_prices_and_reorder",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    item_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ItemType.GOODS.value
    )
    valuation_method: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ValuationMethod.FIFO.value
    )
    unit_id: Mapped[int] = mapped_column(
        ForeignKey("units_of_measure.id", ondelete="RESTRICT"), nullable=False
    )
    hsn_sac_id: Mapped[int | None] = mapped_column(
        ForeignKey("hsn_sac_codes.id", ondelete="RESTRICT"), nullable=True
    )
    default_tax_slab_id: Mapped[int | None] = mapped_column(
        ForeignKey("gst_tax_slabs.id", ondelete="RESTRICT"), nullable=True
    )
    sales_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True
    )
    purchase_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True
    )
    cogs_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True
    )
    inventory_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True
    )
    standard_selling_price: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    standard_purchase_cost: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    reorder_level: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    unit: Mapped["UnitOfMeasure"] = relationship(lazy="selectin")
    hsn_sac: Mapped["HsnSacCode | None"] = relationship(lazy="selectin")
    default_tax_slab: Mapped["GstTaxSlab | None"] = relationship(lazy="selectin")


class InventoryLot(Base):
    __tablename__ = "inventory_lots"
    __table_args__ = (
        CheckConstraint("qty_in > 0", name="lot_qty_in_positive"),
        CheckConstraint(
            "qty_available >= 0 AND qty_available <= qty_in",
            name="lot_qty_available_bounds",
        ),
        CheckConstraint("unit_cost >= 0", name="lot_unit_cost_non_negative"),
        Index(
            "ix_inventory_lots_fifo_queue",
            "company_id",
            "item_id",
            "godown_id",
            "received_date",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    godown_id: Mapped[int] = mapped_column(
        ForeignKey("godowns.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    source_invoice_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoice_lines.id", ondelete="RESTRICT"), nullable=True
    )
    batch_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    received_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    qty_in: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    qty_available: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    item: Mapped["InventoryItem"] = relationship(lazy="selectin")
    godown: Mapped["Godown"] = relationship(lazy="selectin")


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        CheckConstraint("direction IN ('IN', 'OUT')", name="valid_stock_direction"),
        CheckConstraint("quantity > 0", name="movement_qty_positive"),
        CheckConstraint(
            "unit_cost >= 0 AND total_cost >= 0 AND running_qty >= 0 AND running_avg_cost >= 0",
            name="non_negative_movement_costs_and_running",
        ),
        Index(
            "ix_stock_movements_item_godown_date",
            "company_id",
            "item_id",
            "godown_id",
            "movement_date",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False
    )
    godown_id: Mapped[int] = mapped_column(
        ForeignKey("godowns.id", ondelete="RESTRICT"), nullable=False
    )
    invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    invoice_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoice_lines.id", ondelete="RESTRICT"), nullable=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="RESTRICT"), nullable=True
    )
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    direction: Mapped[str] = mapped_column(String(3), nullable=False)
    movement_reason: Mapped[str] = mapped_column(String(24), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    running_qty: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    running_avg_cost: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    item: Mapped["InventoryItem"] = relationship(lazy="selectin")
    godown: Mapped["Godown"] = relationship(lazy="selectin")
    invoice: Mapped["Invoice | None"] = relationship(lazy="selectin")
    allocations: Mapped[list["FifoLotAllocation"]] = relationship(
        back_populates="stock_movement", lazy="selectin"
    )


class FifoLotAllocation(Base):
    __tablename__ = "fifo_lot_allocations"
    __table_args__ = (
        CheckConstraint("qty_allocated > 0", name="allocation_qty_positive"),
        CheckConstraint(
            "unit_cost >= 0 AND total_cost >= 0",
            name="allocation_costs_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    stock_movement_id: Mapped[int] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    inventory_lot_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_lots.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    qty_allocated: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    is_reversed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    stock_movement: Mapped["StockMovement"] = relationship(
        back_populates="allocations"
    )
    inventory_lot: Mapped["InventoryLot"] = relationship(lazy="selectin")
