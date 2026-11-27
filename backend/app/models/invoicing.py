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
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.money import ZERO, MoneyNumeric18_4

if TYPE_CHECKING:
    from app.models.gst import GstTaxSlab
    from app.models.inventory import Godown, InventoryItem
    from app.models.ledger import Voucher


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class InvoiceType(StrEnum):
    SALES = "SALES"
    PURCHASE = "PURCHASE"
    CREDIT_NOTE = "CREDIT_NOTE"
    DEBIT_NOTE = "DEBIT_NOTE"


class SupplyType(StrEnum):
    REGULAR = "REGULAR"
    EXPORT_LUT = "EXPORT_LUT"
    EXPORT_WPAY = "EXPORT_WPAY"
    SEZ_LUT = "SEZ_LUT"
    SEZ_WPAY = "SEZ_WPAY"


class InvoiceStatus(StrEnum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    CANCELLED = "CANCELLED"


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "fiscal_year_id",
            "invoice_number",
            name="uq_invoices_company_fy_number",
        ),
        CheckConstraint(
            "invoice_type IN ('SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE')",
            name="valid_invoice_type",
        ),
        CheckConstraint(
            "supply_type IN ('REGULAR', 'EXPORT_LUT', 'EXPORT_WPAY', 'SEZ_LUT', 'SEZ_WPAY')",
            name="valid_supply_type",
        ),
        CheckConstraint(
            "status IN ('DRAFT', 'POSTED', 'CANCELLED')",
            name="valid_invoice_status",
        ),
        CheckConstraint(
            "status != 'POSTED' OR voucher_id IS NOT NULL",
            name="posted_invoice_requires_voucher",
        ),
        CheckConstraint(
            "subtotal >= 0 AND total_discount >= 0 AND taxable_total >= 0 "
            "AND cgst_total >= 0 AND sgst_total >= 0 AND igst_total >= 0 "
            "AND cess_total >= 0 AND tax_total >= 0 AND grand_total >= 0 AND total_cogs >= 0",
            name="non_negative_invoice_totals",
        ),
        Index(
            "ix_invoices_company_date_type_status",
            "company_id",
            "invoice_date",
            "invoice_type",
            "status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="RESTRICT"), unique=True, nullable=True
    )
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False)
    invoice_type: Mapped[str] = mapped_column(String(16), nullable=False)
    supply_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default=SupplyType.REGULAR.value
    )
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    party_ledger_id: Mapped[int] = mapped_column(
        ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    party_name_snapshot: Mapped[str] = mapped_column(String(160), nullable=False)
    party_gstin_snapshot: Mapped[str | None] = mapped_column(String(32), nullable=True)
    party_state_code_snapshot: Mapped[str | None] = mapped_column(
        String(8), nullable=True
    )
    origin_state_code: Mapped[str] = mapped_column(String(8), nullable=False)
    place_of_supply: Mapped[str] = mapped_column(String(8), nullable=False)
    is_inter_state: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_rcm: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    original_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    supplier_invoice_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    supplier_invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    total_discount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    taxable_total: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    cgst_total: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    sgst_total: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    igst_total: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    cess_total: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    tax_total: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    round_off: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    grand_total: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    total_cogs: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=InvoiceStatus.DRAFT.value
    )
    narration: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancellation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now
    )

    voucher: Mapped["Voucher | None"] = relationship(lazy="selectin")
    lines: Mapped[list["InvoiceLine"]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="InvoiceLine.line_no",
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    __table_args__ = (
        UniqueConstraint("invoice_id", "line_no", name="uq_invoice_lines_order"),
        CheckConstraint("line_no >= 1", name="invoice_line_no_positive"),
        CheckConstraint("quantity > 0", name="invoice_line_qty_positive"),
        CheckConstraint(
            "unit_price >= 0 AND discount_pct >= 0 AND discount_amount >= 0 "
            "AND taxable_amount >= 0 AND cgst_rate >= 0 AND sgst_rate >= 0 "
            "AND igst_rate >= 0 AND cess_rate >= 0 AND cgst_amount >= 0 "
            "AND sgst_amount >= 0 AND igst_amount >= 0 AND cess_amount >= 0 "
            "AND line_total >= 0 AND line_cogs >= 0",
            name="non_negative_invoice_line_amounts",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=True
    )
    godown_id: Mapped[int | None] = mapped_column(
        ForeignKey("godowns.id", ondelete="RESTRICT"), nullable=True
    )
    account_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=True
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    hsn_sac_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    uqc_code: Mapped[str] = mapped_column(String(16), nullable=False, default="NOS")
    quantity: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    discount_pct: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    discount_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    taxable_amount: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    tax_slab_id: Mapped[int | None] = mapped_column(
        ForeignKey("gst_tax_slabs.id", ondelete="RESTRICT"), nullable=True
    )
    cgst_rate: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    sgst_rate: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    igst_rate: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    cess_rate: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    cgst_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    sgst_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    igst_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    cess_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    line_total: Mapped[Decimal] = mapped_column(MoneyNumeric18_4, nullable=False)
    line_cogs: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    batch_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    invoice: Mapped["Invoice"] = relationship(back_populates="lines")
    item: Mapped["InventoryItem | None"] = relationship(lazy="selectin")
    godown: Mapped["Godown | None"] = relationship(lazy="selectin")
    tax_slab: Mapped["GstTaxSlab | None"] = relationship(lazy="selectin")
