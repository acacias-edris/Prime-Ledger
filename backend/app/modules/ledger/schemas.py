from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.money import ZERO, MoneyInput, MoneyStr
from app.models.ledger import AccountNature, DrCr, VoucherStatus, VoucherType


# ---------------------------------------------------------------------------
# Company & Fiscal Year Context
# ---------------------------------------------------------------------------


class FiscalYearRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    label: str
    start_date: date
    end_date: date
    is_locked: bool


class CompanyContextRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    legal_name: str
    country_code: str
    state_code: str
    gstin: str | None
    base_currency: str
    number_format: str
    fy_start_month: int
    active_fiscal_year: FiscalYearRead


# ---------------------------------------------------------------------------
# Account Groups & Ledgers (Chart of Accounts)
# ---------------------------------------------------------------------------


class AccountGroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    code: str
    name: str
    parent_id: int | None
    nature: AccountNature
    is_primary: bool
    affects_gross_profit: bool
    display_order: int
    ledger_count: int = 0
    closing_balance: MoneyStr = ZERO
    closing_dr_cr: DrCr = DrCr.DR


class LedgerCreate(BaseModel):
    group_id: int
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=160)
    opening_balance: MoneyInput = ZERO
    opening_dr_cr: DrCr = DrCr.DR
    party_gstin: str | None = Field(default=None, max_length=32)
    party_state_code: str | None = Field(default=None, max_length=8)
    credit_days: int = Field(default=0, ge=0, le=3650)

    @model_validator(mode="after")
    def _validate_non_negative_opening(self) -> "LedgerCreate":
        if self.opening_balance < ZERO:
            raise ValueError("opening_balance cannot be negative.")
        return self


class LedgerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    group_id: int
    group_name: str
    group_nature: AccountNature
    code: str
    name: str
    opening_balance: MoneyStr
    opening_dr_cr: DrCr
    closing_balance: MoneyStr
    closing_dr_cr: DrCr
    party_gstin: str | None
    party_state_code: str | None
    credit_days: int
    is_system_ledger: bool
    is_active: bool


# ---------------------------------------------------------------------------
# Vouchers & Double-Entry Lines
# ---------------------------------------------------------------------------


class VoucherLineCreate(BaseModel):
    """Accepts either ledger_id OR account_code per DOCS_REFERENCE.md API mapping."""

    ledger_id: int | None = None
    account_code: str | None = Field(default=None, min_length=1, max_length=32)
    debit_amount: MoneyInput = ZERO
    credit_amount: MoneyInput = ZERO
    line_narration: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _validate_line(self) -> "VoucherLineCreate":
        if self.ledger_id is None and not (self.account_code and self.account_code.strip()):
            raise ValueError("Each line must specify either ledger_id or account_code.")
        if self.debit_amount < ZERO or self.credit_amount < ZERO:
            raise ValueError("debit_amount and credit_amount must be non-negative.")
        if not (
            (self.debit_amount > ZERO and self.credit_amount == ZERO)
            or (self.credit_amount > ZERO and self.debit_amount == ZERO)
        ):
            raise ValueError(
                "Each line must have strictly either debit_amount > 0 OR credit_amount > 0."
            )
        return self


class VoucherCreate(BaseModel):
    voucher_type: VoucherType
    voucher_date: date
    voucher_number: str | None = Field(default=None, max_length=40)
    reference_no: str | None = Field(default=None, max_length=64)
    narration: str = Field(default="", max_length=500)
    status: VoucherStatus = VoucherStatus.POSTED
    lines: list[VoucherLineCreate]

    @model_validator(mode="after")
    def _validate_voucher(self) -> "VoucherCreate":
        if self.status == VoucherStatus.CANCELLED:
            raise ValueError("Cannot create a new voucher directly in CANCELLED status.")
        if len(self.lines) < 2:
            raise ValueError("Double-entry vouchers require at least 2 ledger lines.")
        if self.status == VoucherStatus.POSTED:
            total_dr = sum((ln.debit_amount for ln in self.lines), ZERO)
            total_cr = sum((ln.credit_amount for ln in self.lines), ZERO)
            if total_dr <= ZERO:
                raise ValueError("Total voucher amount must be greater than 0.0000.")
            if total_dr != total_cr:
                diff = abs(total_dr - total_cr)
                raise ValueError(
                    f"Debit and Credit must balance: difference {diff:.4f} "
                    f"(Dr={total_dr:.4f}, Cr={total_cr:.4f})."
                )
        return self


class VoucherCancelRequest(BaseModel):
    create_reversal: bool = False
    reason: str | None = Field(default=None, max_length=255)


class VoucherLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ledger_id: int
    ledger_code: str
    ledger_name: str
    debit_amount: MoneyStr
    credit_amount: MoneyStr
    line_narration: str | None


class VoucherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    fiscal_year_id: int
    voucher_number: str
    voucher_type: VoucherType
    voucher_date: date
    reference_no: str | None
    narration: str
    status: VoucherStatus
    reversed_voucher_id: int | None
    particulars: str
    total_debit: MoneyStr
    total_credit: MoneyStr
    created_at: datetime
    updated_at: datetime
    lines: list[VoucherLineRead]


class VoucherCancelResponse(BaseModel):
    original_voucher: VoucherRead
    reversal_voucher: VoucherRead | None = None
    action: Literal["CANCELLED", "REVERSED"]


# ---------------------------------------------------------------------------
# Financial Reports
# ---------------------------------------------------------------------------


class DashboardKPIsRead(BaseModel):
    company_name: str
    fiscal_year_label: str
    cash_and_bank_balance: MoneyStr
    cash_and_bank_dr_cr: DrCr
    sundry_debtors: MoneyStr
    sundry_debtors_dr_cr: DrCr
    sundry_creditors: MoneyStr
    sundry_creditors_dr_cr: DrCr
    net_gst_position: MoneyStr
    net_gst_dr_cr: DrCr
    total_vouchers: int
    posted_vouchers: int
    draft_vouchers: int
    cancelled_vouchers: int
    trial_balance_balanced: bool


class DayBookReportRead(BaseModel):
    from_date: date | None
    to_date: date | None
    total_count: int
    posted_count: int
    excluded_count: int
    posted_total_debit: MoneyStr
    posted_total_credit: MoneyStr
    vouchers: list[VoucherRead]


class LedgerStatementRow(BaseModel):
    voucher_id: int
    voucher_date: date
    voucher_number: str
    voucher_type: VoucherType
    particulars: str
    reference_no: str | None
    narration: str
    debit_amount: MoneyStr
    credit_amount: MoneyStr
    running_balance: MoneyStr
    running_dr_cr: DrCr


class LedgerStatementRead(BaseModel):
    ledger_id: int
    ledger_code: str
    ledger_name: str
    group_name: str
    group_nature: AccountNature
    from_date: date
    to_date: date
    opening_balance: MoneyStr
    opening_dr_cr: DrCr
    period_debit: MoneyStr
    period_credit: MoneyStr
    closing_balance: MoneyStr
    closing_dr_cr: DrCr
    entries: list[LedgerStatementRow]


class TrialBalanceRow(BaseModel):
    ledger_id: int
    ledger_code: str
    ledger_name: str
    group_id: int
    group_name: str
    nature: AccountNature
    opening_debit: MoneyStr
    opening_credit: MoneyStr
    period_debit: MoneyStr
    period_credit: MoneyStr
    closing_debit: MoneyStr
    closing_credit: MoneyStr


class TrialBalanceGroupSummary(BaseModel):
    group_id: int
    group_name: str
    nature: AccountNature
    opening_debit: MoneyStr
    opening_credit: MoneyStr
    period_debit: MoneyStr
    period_credit: MoneyStr
    closing_debit: MoneyStr
    closing_credit: MoneyStr


class TrialBalanceReportRead(BaseModel):
    from_date: date
    to_date: date
    rows: list[TrialBalanceRow]
    groups: list[TrialBalanceGroupSummary]
    total_opening_debit: MoneyStr
    total_opening_credit: MoneyStr
    total_period_debit: MoneyStr
    total_period_credit: MoneyStr
    total_debit: MoneyStr
    total_credit: MoneyStr
    difference: MoneyStr
    is_balanced: bool


class StatementLineItem(BaseModel):
    ledger_id: int
    ledger_code: str
    ledger_name: str
    group_name: str
    amount: MoneyStr


class ProfitLossReportRead(BaseModel):
    from_date: date
    to_date: date
    direct_income: list[StatementLineItem]
    direct_expenses: list[StatementLineItem]
    total_direct_income: MoneyStr
    total_direct_expenses: MoneyStr
    gross_profit: MoneyStr
    indirect_income: list[StatementLineItem]
    indirect_expenses: list[StatementLineItem]
    total_indirect_income: MoneyStr
    total_indirect_expenses: MoneyStr
    net_profit: MoneyStr


class BalanceSheetSectionGroup(BaseModel):
    group_id: int
    group_name: str
    nature: AccountNature
    total: MoneyStr
    ledgers: list[StatementLineItem]


class BalanceSheetReportRead(BaseModel):
    as_of_date: date
    assets: list[BalanceSheetSectionGroup]
    liabilities: list[BalanceSheetSectionGroup]
    equity: list[BalanceSheetSectionGroup]
    current_period_net_profit: MoneyStr
    total_assets: MoneyStr
    total_liabilities: MoneyStr
    total_equity: MoneyStr
    total_liabilities_and_equity: MoneyStr
    difference: MoneyStr
    is_balanced: bool
