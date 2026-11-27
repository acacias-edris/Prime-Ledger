from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

_ONES = (
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
)

_TENS = (
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
)

PAISE_QUANT = Decimal("0.01")


def _two_digits(n: int) -> str:
    if n <= 0:
        return ""
    if n < 20:
        return _ONES[n]
    tens = _TENS[n // 10]
    ones = _ONES[n % 10]
    return f"{tens}-{ones}" if ones else tens


def _int_to_indian_words(n: int) -> str:
    if n == 0:
        return "Zero"

    parts: list[str] = []
    crores = n // 10_000_000
    lakhs = (n % 10_000_000) // 100_000
    thousands = (n % 100_000) // 1_000
    hundreds = (n % 1_000) // 100
    remainder = n % 100

    if crores > 0:
        parts.append(f"{_int_to_indian_words(crores)} Crore")
    if lakhs > 0:
        parts.append(f"{_two_digits(lakhs)} Lakh")
    if thousands > 0:
        parts.append(f"{_two_digits(thousands)} Thousand")
    if hundreds > 0:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if remainder > 0:
        parts.append(_two_digits(remainder))

    return " ".join(parts)


def amount_to_indian_words(
    amount: Decimal | str | int,
    currency_major: str = "Rupees",
    currency_minor: str = "Paise",
) -> str:
    """
    Converts an exact monetary Decimal into canonical Indian Lakh/Crore words.
    Strictly rejects Python float to prevent binary rounding drift.
    """
    if isinstance(amount, float):
        raise TypeError("Python float is forbidden in amount_to_indian_words; pass Decimal.")
    if isinstance(amount, bool):
        raise TypeError("Boolean is invalid for amount_to_indian_words.")

    dec = amount if isinstance(amount, Decimal) else Decimal(str(amount).strip())
    quantized = abs(dec).quantize(PAISE_QUANT, rounding=ROUND_HALF_UP)

    total_paise = int(quantized * 100)
    rupees, paise = divmod(total_paise, 100)

    if rupees == 0 and paise == 0:
        return f"Zero {currency_major} Only"
    if rupees == 0:
        return f"{_int_to_indian_words(paise)} {currency_minor} Only"
    if paise == 0:
        return f"{currency_major} {_int_to_indian_words(rupees)} Only"
    return (
        f"{currency_major} {_int_to_indian_words(rupees)} "
        f"and {_int_to_indian_words(paise)} {currency_minor} Only"
    )
