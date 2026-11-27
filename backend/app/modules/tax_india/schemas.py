from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.money import ZERO, MoneyInput, MoneyStr
from app.models.gst import HsnSacType
from app.models.invoicing import SupplyType


class GstTaxSlabCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=80)
    cgst_rate: MoneyInput = ZERO
    sgst_rate: MoneyInput = ZERO
    igst_rate: MoneyInput = ZERO
    cess_rate: MoneyInput = ZERO

    @model_validator(mode="after")
    def _validate_rates(self) -> "GstTaxSlabCreate":
        hundred = Decimal("100")
        for label, val in (
            ("cgst_rate", self.cgst_rate),
            ("sgst_rate", self.sgst_rate),
            ("igst_rate", self.igst_rate),
            ("cess_rate", self.cess_rate),
        ):
            if val < ZERO or val > hundred:
                raise ValueError(f"{label} must be between 0.0000 and 100.0000.")
        if self.cgst_rate + self.sgst_rate != self.igst_rate:
            raise ValueError("cgst_rate + sgst_rate must equal igst_rate.")
        return self


class GstTaxSlabRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    code: str
    name: str
    cgst_rate: MoneyStr
    sgst_rate: MoneyStr
    igst_rate: MoneyStr
    cess_rate: MoneyStr
    is_active: bool
    created_at: datetime


class HsnSacCodeCreate(BaseModel):
    code: str = Field(min_length=4, max_length=8)
    code_type: HsnSacType
    description: str = Field(min_length=1, max_length=255)
    default_tax_slab_id: int | None = None
    default_uqc: str = Field(default="NOS", min_length=1, max_length=16)

    @model_validator(mode="after")
    def _validate_hsn_sac(self) -> "HsnSacCodeCreate":
        clean_code = self.code.strip().upper()
        if not clean_code.isdigit():
            raise ValueError("HSN/SAC code must contain digits only (4-8 digits).")
        if self.code_type == HsnSacType.SAC and self.default_uqc.strip().upper() != "NA":
            raise ValueError("SAC (Service) codes must use default_uqc='NA'.")
        return self


class HsnSacCodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    code: str
    code_type: HsnSacType
    description: str
    default_tax_slab_id: int | None
    default_tax_slab_code: str | None = None
    default_uqc: str
    is_active: bool


class GstPreviewLineRequest(BaseModel):
    hsn_sac_code: str | None = Field(default=None, max_length=8)
    tax_slab_id: int | None = None
    cgst_rate: MoneyInput = ZERO
    sgst_rate: MoneyInput = ZERO
    igst_rate: MoneyInput = ZERO
    cess_rate: MoneyInput = ZERO
    quantity: MoneyInput
    unit_price: MoneyInput
    discount_pct: MoneyInput = ZERO
    discount_amount: MoneyInput = ZERO

    @model_validator(mode="after")
    def _validate_line(self) -> "GstPreviewLineRequest":
        if self.quantity <= ZERO:
            raise ValueError("quantity must be > 0.")
        if self.unit_price < ZERO:
            raise ValueError("unit_price must be >= 0.")
        if self.discount_pct < ZERO or self.discount_pct > Decimal("100"):
            raise ValueError("discount_pct must be between 0 and 100.")
        if self.discount_amount < ZERO:
            raise ValueError("discount_amount must be >= 0.")
        return self


class GstPreviewRequest(BaseModel):
    origin_state_code: str = Field(min_length=2, max_length=8)
    place_of_supply: str = Field(min_length=2, max_length=8)
    supply_type: SupplyType = SupplyType.REGULAR
    is_rcm: bool = False
    enable_round_off: bool = True
    lines: list[GstPreviewLineRequest] = Field(min_length=1)


class GstPreviewLineRead(BaseModel):
    hsn_sac_code: str | None
    quantity: MoneyStr
    unit_price: MoneyStr
    gross_amount: MoneyStr
    discount_pct: MoneyStr
    discount_amount: MoneyStr
    taxable_amount: MoneyStr
    is_inter_state: bool
    cgst_rate: MoneyStr
    sgst_rate: MoneyStr
    igst_rate: MoneyStr
    cess_rate: MoneyStr
    cgst_amount: MoneyStr
    sgst_amount: MoneyStr
    igst_amount: MoneyStr
    cess_amount: MoneyStr
    tax_amount: MoneyStr
    line_total: MoneyStr


class HsnSummaryRowRead(BaseModel):
    hsn_sac_code: str
    taxable_amount: MoneyStr
    cgst_rate: MoneyStr
    cgst_amount: MoneyStr
    sgst_rate: MoneyStr
    sgst_amount: MoneyStr
    igst_rate: MoneyStr
    igst_amount: MoneyStr
    cess_rate: MoneyStr
    cess_amount: MoneyStr
    total_tax: MoneyStr


class GstPreviewResponse(BaseModel):
    is_inter_state: bool
    lines: list[GstPreviewLineRead]
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
    hsn_summary: list[HsnSummaryRowRead]
    amount_in_words: str


class GstinValidationResponse(BaseModel):
    is_valid: bool
    normalized: str
    state_code: str | None
    pan: str | None
    error: str | None
