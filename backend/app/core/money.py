from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Annotated, Any

from pydantic import BeforeValidator, PlainSerializer
from sqlalchemy import BigInteger, Numeric, TypeDecorator
from sqlalchemy.engine import Dialect

MONEY_SCALE = Decimal("10000")
MONEY_QUANT = Decimal("0.0001")
ZERO = Decimal("0.0000")
MAX_ABS_MONEY = Decimal("99999999999999.9999")  # NUMERIC(18, 4) ceiling


def quantize_money(value: Decimal | str | int) -> Decimal:
    """
    Converts str | int | Decimal into exact NUMERIC(18, 4) using ROUND_HALF_UP.
    Strictly forbids Python float to eliminate IEEE-754 drift.
    """
    if isinstance(value, float):
        raise TypeError(
            "Python float is strictly forbidden for monetary amounts; pass Decimal, int, or str."
        )
    if isinstance(value, bool):
        raise TypeError("Boolean value is not valid for monetary amounts.")
    try:
        dec = value if isinstance(value, Decimal) else Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Invalid monetary value: {value!r}") from exc

    if not dec.is_finite():
        raise ValueError(f"Monetary value must be finite: {value!r}")

    quantized = dec.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    if abs(quantized) > MAX_ABS_MONEY:
        raise ValueError(f"Monetary value exceeds NUMERIC(18, 4) bounds: {quantized}")
    return quantized


def format_money_str(value: Decimal) -> str:
    """Formats a Decimal strictly as a fixed 4-decimal string (e.g. '14500.2500')."""
    return f"{quantize_money(value):.4f}"


def _validate_money_input(value: Any) -> Decimal:
    if value is None or value == "":
        return ZERO
    if isinstance(value, float):
        raise ValueError(
            "Floating-point numbers are not allowed for money; provide an exact decimal string."
        )
    if isinstance(value, bool):
        raise ValueError("Boolean values are not valid monetary amounts.")
    try:
        return quantize_money(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(str(exc)) from exc


# Pydantic v2.14 annotated types: exact Decimal internally, exact "0.0000" string in JSON
MoneyInput = Annotated[Decimal, BeforeValidator(_validate_money_input)]
MoneyStr = Annotated[
    Decimal,
    PlainSerializer(format_money_str, return_type=str, when_used="json"),
]


class MoneyNumeric18_4(TypeDecorator[Decimal]):
    """
    Dialect-aware exact NUMERIC(18, 4) storage type:
    - SQLite: 64-bit signed BigInteger scaled by 10_000 (eliminates IEEE-754 float drift
      while keeping native SQL SUM(), <, >, and ORDER BY exact).
    - PostgreSQL (Neon cloud): native NUMERIC(18, 4).
    """

    impl = Numeric(18, 4, asdecimal=True)
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect):
        if dialect.name == "sqlite":
            return dialect.type_descriptor(BigInteger())
        return dialect.type_descriptor(Numeric(18, 4, asdecimal=True))

    def process_bind_param(
        self, value: Decimal | str | int | None, dialect: Dialect
    ) -> int | Decimal | None:
        if value is None:
            return None
        dec = quantize_money(value)
        if dialect.name == "sqlite":
            return int(dec * MONEY_SCALE)
        return dec

    def process_literal_param(self, value: Any, dialect: Dialect) -> str:
        bound = self.process_bind_param(value, dialect)
        return "NULL" if bound is None else str(bound)

    def process_result_value(
        self, value: int | Decimal | str | float | None, dialect: Dialect
    ) -> Decimal | None:
        if value is None:
            return None
        if dialect.name == "sqlite":
            if isinstance(value, float):
                if not value.is_integer():
                    raise TypeError(
                        f"SQLite returned float {value!r} for a scaled money column "
                        "(AVG/division/unscaled literal?) -- precision lost."
                    )
                value = int(value)
            return (Decimal(int(value)) / MONEY_SCALE).quantize(
                MONEY_QUANT, rounding=ROUND_HALF_UP
            )
        return Decimal(str(value)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

    @property
    def python_type(self) -> type[Decimal]:
        return Decimal
