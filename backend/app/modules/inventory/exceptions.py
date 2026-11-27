from __future__ import annotations

from decimal import Decimal

from app.core.money import format_money_str
from app.modules.ledger.exceptions import AccountingError


class InsufficientStockError(AccountingError):
    status_code = 422
    error_code = "INSUFFICIENT_STOCK"

    def __init__(
        self,
        *,
        item_id: int,
        sku: str,
        godown_id: int,
        requested_qty: Decimal,
        available_qty: Decimal,
    ) -> None:
        msg = (
            f"Insufficient stock for {sku} in godown id={godown_id}: "
            f"requested {format_money_str(requested_qty)}, "
            f"available {format_money_str(available_qty)}."
        )
        super().__init__(
            msg,
            details={
                "item_id": item_id,
                "sku": sku,
                "godown_id": godown_id,
                "requested_qty": format_money_str(requested_qty),
                "available_qty": format_money_str(available_qty),
            },
        )


class LotAlreadyConsumedError(AccountingError):
    status_code = 409
    error_code = "LOT_ALREADY_CONSUMED"

    def __init__(
        self,
        *,
        lot_id: int,
        batch_ref: str,
        qty_in: Decimal,
        qty_available: Decimal,
    ) -> None:
        msg = (
            f"Cannot cancel inward invoice: lot '{batch_ref}' (id={lot_id}) has already been partially "
            f"or fully consumed (qty_in={format_money_str(qty_in)}, "
            f"qty_available={format_money_str(qty_available)})."
        )
        super().__init__(
            msg,
            details={
                "lot_id": lot_id,
                "batch_ref": batch_ref,
                "qty_in": format_money_str(qty_in),
                "qty_available": format_money_str(qty_available),
            },
        )
