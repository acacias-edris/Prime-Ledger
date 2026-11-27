from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.money import ZERO, MoneyInput, MoneyStr
from app.models.inventory import ItemType, MovementReason, StockDirection, ValuationMethod


class UnitOfMeasureCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    formal_name: str = Field(min_length=1, max_length=64)
    uqc_code: str = Field(default="NOS", min_length=1, max_length=16)
    decimal_places: int = Field(default=0, ge=0, le=4)


class UnitOfMeasureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    symbol: str
    formal_name: str
    uqc_code: str
    decimal_places: int
    is_active: bool


class GodownCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    state_code: str | None = Field(default=None, max_length=8)
    is_default: bool = False


class GodownRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    code: str
    name: str
    address: str | None
    state_code: str | None
    is_default: bool
    is_active: bool


class InventoryItemCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=160)
    item_type: ItemType = ItemType.GOODS
    valuation_method: ValuationMethod = ValuationMethod.FIFO
    unit_id: int
    hsn_sac_id: int | None = None
    default_tax_slab_id: int | None = None
    sales_ledger_id: int | None = None
    purchase_ledger_id: int | None = None
    cogs_ledger_id: int | None = None
    inventory_ledger_id: int | None = None
    standard_selling_price: MoneyInput = ZERO
    standard_purchase_cost: MoneyInput = ZERO
    reorder_level: MoneyInput = ZERO

    @model_validator(mode="after")
    def _validate_non_negative(self) -> "InventoryItemCreate":
        if (
            self.standard_selling_price < ZERO
            or self.standard_purchase_cost < ZERO
            or self.reorder_level < ZERO
        ):
            raise ValueError(
                "standard_selling_price, standard_purchase_cost, and reorder_level must be >= 0."
            )
        return self


class InventoryItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    valuation_method: ValuationMethod | None = None
    unit_id: int | None = None
    hsn_sac_id: int | None = None
    default_tax_slab_id: int | None = None
    sales_ledger_id: int | None = None
    purchase_ledger_id: int | None = None
    cogs_ledger_id: int | None = None
    inventory_ledger_id: int | None = None
    standard_selling_price: MoneyInput | None = None
    standard_purchase_cost: MoneyInput | None = None
    reorder_level: MoneyInput | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _validate_non_negative(self) -> "InventoryItemUpdate":
        for field_name in (
            "standard_selling_price",
            "standard_purchase_cost",
            "reorder_level",
        ):
            val = getattr(self, field_name)
            if val is not None and val < ZERO:
                raise ValueError(f"{field_name} must be >= 0.")
        return self


class InventoryItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    sku: str
    name: str
    item_type: ItemType
    valuation_method: ValuationMethod
    unit_id: int
    unit_symbol: str
    unit_uqc: str
    unit_decimal_places: int
    hsn_sac_id: int | None
    hsn_sac_code: str | None
    default_tax_slab_id: int | None
    default_tax_slab_code: str | None
    default_tax_slab_name: str | None
    sales_ledger_id: int | None
    purchase_ledger_id: int | None
    cogs_ledger_id: int | None
    inventory_ledger_id: int | None
    standard_selling_price: MoneyStr
    standard_purchase_cost: MoneyStr
    reorder_level: MoneyStr
    is_active: bool
    created_at: datetime


class InventoryLotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    item_id: int
    item_sku: str
    item_name: str
    godown_id: int
    godown_code: str
    godown_name: str
    source_invoice_id: int | None
    source_invoice_line_id: int | None
    batch_ref: str
    received_date: date
    expiry_date: date | None
    qty_in: MoneyStr
    qty_available: MoneyStr
    unit_cost: MoneyStr
    lot_value: MoneyStr
    created_at: datetime


class StockMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    item_id: int
    item_sku: str
    item_name: str
    godown_id: int
    godown_code: str
    godown_name: str
    invoice_id: int | None
    invoice_number: str | None
    invoice_line_id: int | None
    voucher_id: int | None
    movement_date: date
    direction: StockDirection
    movement_reason: MovementReason
    quantity: MoneyStr
    unit_cost: MoneyStr
    total_cost: MoneyStr
    running_qty: MoneyStr
    running_avg_cost: MoneyStr
    created_at: datetime


class StockSummaryRow(BaseModel):
    item_id: int
    sku: str
    name: str
    item_type: ItemType
    valuation_method: ValuationMethod
    unit_symbol: str
    unit_uqc: str
    unit_decimal_places: int
    hsn_sac_code: str | None
    total_qty: MoneyStr
    avg_rate: MoneyStr
    closing_value: MoneyStr
    reorder_level: MoneyStr
    is_low_stock: bool


class StockSummaryResponse(BaseModel):
    items: list[StockSummaryRow]
    grand_total_value: MoneyStr
    low_stock_count: int


class GodownStockRow(BaseModel):
    godown_id: int
    godown_code: str
    godown_name: str
    item_id: int
    sku: str
    item_name: str
    valuation_method: ValuationMethod
    unit_symbol: str
    unit_decimal_places: int
    total_qty: MoneyStr
    avg_rate: MoneyStr
    closing_value: MoneyStr
