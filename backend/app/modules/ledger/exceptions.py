from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.core.money import format_money_str


class AccountingError(ValueError):
    """Base domain exception mapped cleanly to HTTP error responses."""

    status_code: int = 422
    error_code: str = "ACCOUNTING_ERROR"

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if error_code is not None:
            self.error_code = error_code
        self.details = details or {}


class UnbalancedVoucherError(AccountingError):
    status_code = 422
    error_code = "UNBALANCED_VOUCHER"

    def __init__(
        self,
        *,
        total_debit: Decimal,
        total_credit: Decimal,
        voucher_number: str | None = None,
    ) -> None:
        difference = abs(total_debit - total_credit)
        prefix = f"Voucher {voucher_number}: " if voucher_number else ""
        message = (
            f"{prefix}Debit and Credit must balance: difference "
            f"₹{format_money_str(difference)} "
            f"(Dr={format_money_str(total_debit)}, Cr={format_money_str(total_credit)})."
        )
        super().__init__(
            message,
            details={
                "total_debit": format_money_str(total_debit),
                "total_credit": format_money_str(total_credit),
                "difference": format_money_str(difference),
            },
        )


class InvalidVoucherError(AccountingError):
    status_code = 422
    error_code = "INVALID_VOUCHER"


class FiscalYearLockedError(AccountingError):
    status_code = 422
    error_code = "FISCAL_YEAR_LOCKED"


class ResourceNotFoundError(AccountingError):
    status_code = 404
    error_code = "NOT_FOUND"


class DuplicateResourceError(AccountingError):
    status_code = 409
    error_code = "DUPLICATE_RESOURCE"
