from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.money import ZERO, MoneyInput, MoneyStr
from app.models.inventory import ItemType
from app.models.invoicing import InvoiceStatus, InvoiceType, SupplyType
from app.modules.tax_india.schemas import HsnSummaryRowRead


class InvoiceLineCreate(BaseModel):
    item_id: int | None = None
    godown_id: int | None = None
    account_ledger_id: int | None = None
    description: str | None = Field(default=None, max_length=255)
    hsn_sac_code: str | None = Field(default=None, max_length=8)
    uqc_code: str | None = Field(default=None, max_length=16)
    quantity: MoneyInput
    unit_price: MoneyInput
    discount_pct: MoneyInput = ZERO
    discount_amount: MoneyInput = ZERO
    tax_slab_id: int | None = None
    batch_ref: str | None = Field(default=None, max_length=64)
    expiry_date: date | None = None

    @model_validator(mode="after")
    def _validate_line(self) -> "InvoiceLineCreate":
        if self.quantity <= ZERO:
            raise ValueError("Line quantity must be > 0.")
        if self.unit_price < ZERO:
            raise ValueError("unit_price must be >= 0.")
        if self.discount_pct < ZERO or self.discount_pct > Decimal("100"):
            raise ValueError("discount_pct must be between 0 and 100.")
        if self.discount_amount < ZERO:
            raise ValueError("discount_amount must be >= 0.")
        if self.item_id is None and not (self.description and self.description.strip()):
            raise ValueError("Either item_id or description is required.")
        return self


class InvoiceCreate(BaseModel):
    status: InvoiceStatus = InvoiceStatus.POSTED
    invoice_type: InvoiceType
    supply_type: SupplyType = SupplyType.REGULAR
    invoice_date: date
    due_date: date | None = None
    party_ledger_id: int
    place_of_supply: str | None = Field(default=None, max_length=8)
    is_rcm: bool = False
    enable_round_off: bool = True
    original_invoice_id: int | None = None
    supplier_invoice_no: str | None = Field(default=None, max_length=64)
    supplier_invoice_date: date | None = None
    narration: str = Field(default="", max_length=500)
    lines: list[InvoiceLineCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def _validate_invoice(self) -> "InvoiceCreate":
        if self.status == InvoiceStatus.CANCELLED:
            raise ValueError("Cannot create an invoice directly in CANCELLED status.")
        if self.is_rcm and self.invoice_type not in (
            InvoiceType.PURCHASE,
            InvoiceType.DEBIT_NOTE,
        ):
            raise ValueError(
                "Reverse Charge Mechanism (is_rcm) is only applicable on PURCHASE or DEBIT_NOTE."
            )
        return self


class InvoiceCancelRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


class InvoiceListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    fiscal_year_id: int
    voucher_id: int | None
    voucher_number: str | None
    invoice_number: str
    invoice_type: InvoiceType
    supply_type: SupplyType
    invoice_date: date
    due_date: date | None
    party_ledger_id: int
    party_name_snapshot: str
    party_gstin_snapshot: str | None
    origin_state_code: str
    place_of_supply: str
    is_inter_state: bool
    is_rcm: bool
    taxable_total: MoneyStr
    tax_total: MoneyStr
    round_off: MoneyStr
    grand_total: MoneyStr
    total_cogs: MoneyStr
    status: InvoiceStatus
    created_at: datetime


class InvoiceLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    line_no: int
    item_id: int | None
    item_sku: str | None
    item_type: ItemType | None
    godown_id: int | None
    godown_code: str | None
    godown_name: str | None
    account_ledger_id: int | None
    description: str
    hsn_sac_code: str | None
    uqc_code: str
    quantity: MoneyStr
    unit_price: MoneyStr
    discount_pct: MoneyStr
    discount_amount: MoneyStr
    taxable_amount: MoneyStr
    tax_slab_id: int | None
    tax_slab_code: str | None
    tax_slab_name: str | None
    cgst_rate: MoneyStr
    sgst_rate: MoneyStr
    igst_rate: MoneyStr
    cess_rate: MoneyStr
    cgst_amount: MoneyStr
    sgst_amount: MoneyStr
    igst_amount: MoneyStr
    cess_amount: MoneyStr
    line_total: MoneyStr
    line_cogs: MoneyStr
    batch_ref: str | None
    expiry_date: date | None


class SellerSnapshotRead(BaseModel):
    legal_name: str
    name: str
    gstin: str | None
    state_code: str
    country_code: str
    base_currency: str


class PartySnapshotRead(BaseModel):
    ledger_id: int
    ledger_code: str
    name: str
    gstin: str | None
    state_code: str | None


class InvoiceDetailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    fiscal_year_id: int
    voucher_id: int | None
    voucher_number: str | None
    invoice_number: str
    invoice_type: InvoiceType
    supply_type: SupplyType
    invoice_date: date
    due_date: date | None
    party_ledger_id: int
    party_name_snapshot: str
    party_gstin_snapshot: str | None
    party_state_code_snapshot: str | None
    origin_state_code: str
    place_of_supply: str
    is_inter_state: bool
    is_rcm: bool
    original_invoice_id: int | None
    supplier_invoice_no: str | None
    supplier_invoice_date: date | None
    subtotal: MoneyStr
    total_discount: MoneyStr
    taxable_total: MoneyStr
    cgst_total: MoneyStr
    sgst_total: MoneyStr
    igst_total: MoneyStr
    cess_total: MoneyStr
    tax_total: MoneyStr
    round_off: MoneyStr
    grand_total: MoneyStr
    total_cogs: MoneyStr
    status: InvoiceStatus
    narration: str
    cancelled_at: datetime | None
    cancellation_reason: str | None
    created_at: datetime
    updated_at: datetime
    lines: list[InvoiceLineRead]
    hsn_summary: list[HsnSummaryRowRead]
    amount_in_words: str
    seller_snapshot: SellerSnapshotRead
    party_snapshot: PartySnapshotRead
