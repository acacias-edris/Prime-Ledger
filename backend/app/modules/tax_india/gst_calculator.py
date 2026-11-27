from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from app.core.money import MONEY_QUANT, ZERO, quantize_money
from app.modules.ledger.exceptions import AccountingError

PAISE_QUANT = Decimal("0.01")
HUNDRED = Decimal("100")

MOD36_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
VALID_GST_STATE_CODES: frozenset[str] = frozenset(
    {f"{i:02d}" for i in range(1, 39)} | {"97", "99"}
)
VALID_POS_CODES: frozenset[str] = VALID_GST_STATE_CODES | {"96"}
_GSTIN_REGEX = re.compile(
    r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
)


class InvalidGstError(AccountingError):
    status_code = 422
    error_code = "INVALID_GST_INPUT"


def quantize_paise(value: Decimal) -> Decimal:
    """Rounds intermediate money/tax amounts to paise (0.01) and normalizes to NUMERIC(18,4)."""
    if isinstance(value, float):
        raise TypeError("Python float is strictly forbidden in GST calculations.")
    return value.quantize(PAISE_QUANT, rounding=ROUND_HALF_UP).quantize(MONEY_QUANT)


def compute_gstin_check_digit(prefix_14: str) -> str:
    """Computes the 15th Mod-36 checksum character per GSTN specification."""
    normalized = prefix_14.strip().upper()
    if len(normalized) != 14:
        raise InvalidGstError("GSTIN prefix must be exactly 14 characters.")
    total = 0
    for idx, ch in enumerate(normalized):
        if ch not in MOD36_ALPHABET:
            raise InvalidGstError(f"Invalid GSTIN character '{ch}'.")
        code_point = MOD36_ALPHABET.index(ch)
        factor = 1 if idx % 2 == 0 else 2
        q, r = divmod(code_point * factor, 36)
        total += q + r
    return MOD36_ALPHABET[(36 - (total % 36)) % 36]


@dataclass(frozen=True)
class GstinValidationResult:
    is_valid: bool
    normalized: str
    state_code: str | None
    pan: str | None
    error: str | None


def validate_gstin(gstin: str) -> GstinValidationResult:
    """Validates 15-character Indian GSTIN structure, state/UT code, and Mod-36 check digit."""
    normalized = (gstin or "").strip().upper()
    if len(normalized) != 15:
        return GstinValidationResult(
            is_valid=False,
            normalized=normalized,
            state_code=None,
            pan=None,
            error="GSTIN must be exactly 15 characters.",
        )

    if not _GSTIN_REGEX.match(normalized):
        return GstinValidationResult(
            is_valid=False,
            normalized=normalized,
            state_code=None,
            pan=None,
            error="GSTIN format must match 2-digit state + 10-char PAN + entity code + Z + check digit.",
        )

    state_code = normalized[:2]
    if state_code not in VALID_GST_STATE_CODES:
        return GstinValidationResult(
            is_valid=False,
            normalized=normalized,
            state_code=None,
            pan=None,
            error=f"Invalid GST state/UT code '{state_code}'.",
        )

    expected = compute_gstin_check_digit(normalized[:14])
    if normalized[14] != expected:
        return GstinValidationResult(
            is_valid=False,
            normalized=normalized,
            state_code=None,
            pan=None,
            error=f"GSTIN check digit mismatch: expected '{expected}', got '{normalized[14]}'.",
        )

    return GstinValidationResult(
        is_valid=True,
        normalized=normalized,
        state_code=state_code,
        pan=normalized[2:12],
        error=None,
    )


@dataclass(frozen=True)
class GstLineInput:
    quantity: Decimal
    unit_price: Decimal
    discount_pct: Decimal = ZERO
    discount_amount: Decimal = ZERO
    slab_cgst_rate: Decimal = ZERO
    slab_sgst_rate: Decimal = ZERO
    slab_igst_rate: Decimal = ZERO
    slab_cess_rate: Decimal = ZERO
    hsn_sac_code: str | None = None


@dataclass(frozen=True)
class GstLineComputed:
    hsn_sac_code: str | None
    quantity: Decimal
    unit_price: Decimal
    gross_amount: Decimal
    discount_pct: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    is_inter_state: bool
    cgst_rate: Decimal
    sgst_rate: Decimal
    igst_rate: Decimal
    cess_rate: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    tax_amount: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class HsnSummaryItem:
    hsn_sac_code: str
    taxable_amount: Decimal
    cgst_rate: Decimal
    cgst_amount: Decimal
    sgst_rate: Decimal
    sgst_amount: Decimal
    igst_rate: Decimal
    igst_amount: Decimal
    cess_rate: Decimal
    cess_amount: Decimal
    total_tax: Decimal


@dataclass(frozen=True)
class GstInvoiceComputed:
    is_inter_state: bool
    lines: list[GstLineComputed]
    subtotal: Decimal
    total_discount: Decimal
    taxable_total: Decimal
    cgst_total: Decimal
    sgst_total: Decimal
    igst_total: Decimal
    cess_total: Decimal
    tax_total: Decimal
    round_off: Decimal
    grand_total: Decimal
    hsn_summary: list[HsnSummaryItem]


def calculate_gst_line(
    *,
    quantity: Decimal,
    unit_price: Decimal,
    discount_pct: Decimal,
    discount_amount: Decimal,
    slab_cgst_rate: Decimal,
    slab_sgst_rate: Decimal,
    slab_igst_rate: Decimal,
    slab_cess_rate: Decimal,
    origin_state_code: str,
    place_of_supply: str,
    supply_type: str,
    is_rcm: bool,
    hsn_sac_code: str | None = None,
) -> GstLineComputed:
    qty = quantize_money(quantity)
    price = quantize_money(unit_price)
    disc_pct_in = quantize_money(discount_pct)
    disc_amt_in = quantize_money(discount_amount)

    if qty <= ZERO:
        raise InvalidGstError("Line quantity must be greater than 0.")
    if price < ZERO:
        raise InvalidGstError("Unit price cannot be negative.")
    if disc_pct_in < ZERO or disc_pct_in > HUNDRED:
        raise InvalidGstError("discount_pct must be between 0 and 100.")
    if disc_amt_in < ZERO:
        raise InvalidGstError("discount_amount cannot be negative.")

    gross = quantize_paise(qty * price)

    if disc_amt_in > ZERO:
        if disc_amt_in > gross:
            raise InvalidGstError(
                f"discount_amount ({disc_amt_in}) cannot exceed gross line value ({gross})."
            )
        eff_discount_amount = quantize_paise(disc_amt_in)
        eff_discount_pct = (
            ((eff_discount_amount / gross) * HUNDRED).quantize(
                MONEY_QUANT, rounding=ROUND_HALF_UP
            )
            if gross > ZERO
            else ZERO
        )
    elif disc_pct_in > ZERO:
        eff_discount_pct = disc_pct_in
        eff_discount_amount = quantize_paise(gross * eff_discount_pct / HUNDRED)
    else:
        eff_discount_pct = ZERO
        eff_discount_amount = ZERO

    taxable_amount = quantize_money(gross - eff_discount_amount)

    norm_supply = supply_type.strip().upper()
    if norm_supply in ("EXPORT_LUT", "SEZ_LUT"):
        is_inter_state = True
        cgst_rate = ZERO
        sgst_rate = ZERO
        igst_rate = ZERO
        cess_rate = ZERO
    elif norm_supply in ("EXPORT_WPAY", "SEZ_WPAY"):
        is_inter_state = True
        cgst_rate = ZERO
        sgst_rate = ZERO
        igst_rate = quantize_money(slab_igst_rate)
        cess_rate = quantize_money(slab_cess_rate)
    elif norm_supply == "REGULAR":
        if origin_state_code.strip() == place_of_supply.strip():
            is_inter_state = False
            cgst_rate = quantize_money(slab_cgst_rate)
            sgst_rate = quantize_money(slab_sgst_rate)
            igst_rate = ZERO
            cess_rate = quantize_money(slab_cess_rate)
        else:
            is_inter_state = True
            cgst_rate = ZERO
            sgst_rate = ZERO
            igst_rate = quantize_money(slab_igst_rate)
            cess_rate = quantize_money(slab_cess_rate)
    else:
        raise InvalidGstError(f"Unsupported supply_type '{supply_type}'.")

    cgst_amount = quantize_paise(taxable_amount * cgst_rate / HUNDRED)
    sgst_amount = quantize_paise(taxable_amount * sgst_rate / HUNDRED)
    igst_amount = quantize_paise(taxable_amount * igst_rate / HUNDRED)
    cess_amount = quantize_paise(taxable_amount * cess_rate / HUNDRED)
    tax_amount = quantize_money(cgst_amount + sgst_amount + igst_amount + cess_amount)
    line_total = (
        taxable_amount if is_rcm else quantize_money(taxable_amount + tax_amount)
    )

    return GstLineComputed(
        hsn_sac_code=hsn_sac_code.strip().upper() if hsn_sac_code else None,
        quantity=qty,
        unit_price=price,
        gross_amount=gross,
        discount_pct=eff_discount_pct,
        discount_amount=eff_discount_amount,
        taxable_amount=taxable_amount,
        is_inter_state=is_inter_state,
        cgst_rate=cgst_rate,
        sgst_rate=sgst_rate,
        igst_rate=igst_rate,
        cess_rate=cess_rate,
        cgst_amount=cgst_amount,
        sgst_amount=sgst_amount,
        igst_amount=igst_amount,
        cess_amount=cess_amount,
        tax_amount=tax_amount,
        line_total=line_total,
    )


def build_hsn_summary(lines: Iterable[GstLineComputed]) -> list[HsnSummaryItem]:
    grouped: dict[
        tuple[str, Decimal, Decimal, Decimal, Decimal],
        dict[str, Decimal],
    ] = {}
    for ln in lines:
        key = (
            ln.hsn_sac_code or "N/A",
            ln.cgst_rate,
            ln.sgst_rate,
            ln.igst_rate,
            ln.cess_rate,
        )
        bucket = grouped.setdefault(
            key,
            {
                "taxable": ZERO,
                "cgst": ZERO,
                "sgst": ZERO,
                "igst": ZERO,
                "cess": ZERO,
            },
        )
        bucket["taxable"] += ln.taxable_amount
        bucket["cgst"] += ln.cgst_amount
        bucket["sgst"] += ln.sgst_amount
        bucket["igst"] += ln.igst_amount
        bucket["cess"] += ln.cess_amount

    items: list[HsnSummaryItem] = []
    for (code, cgst_r, sgst_r, igst_r, cess_r), totals in grouped.items():
        cgst_a = quantize_money(totals["cgst"])
        sgst_a = quantize_money(totals["sgst"])
        igst_a = quantize_money(totals["igst"])
        cess_a = quantize_money(totals["cess"])
        items.append(
            HsnSummaryItem(
                hsn_sac_code=code,
                taxable_amount=quantize_money(totals["taxable"]),
                cgst_rate=cgst_r,
                cgst_amount=cgst_a,
                sgst_rate=sgst_r,
                sgst_amount=sgst_a,
                igst_rate=igst_r,
                igst_amount=igst_a,
                cess_rate=cess_r,
                cess_amount=cess_a,
                total_tax=quantize_money(cgst_a + sgst_a + igst_a + cess_a),
            )
        )
    return items


def calculate_gst_invoice(
    *,
    lines: list[GstLineInput],
    origin_state_code: str,
    place_of_supply: str,
    supply_type: str,
    is_rcm: bool,
    enable_round_off: bool,
) -> GstInvoiceComputed:
    if not lines:
        raise InvalidGstError("At least one invoice line is required.")

    computed_lines = [
        calculate_gst_line(
            quantity=ln.quantity,
            unit_price=ln.unit_price,
            discount_pct=ln.discount_pct,
            discount_amount=ln.discount_amount,
            slab_cgst_rate=ln.slab_cgst_rate,
            slab_sgst_rate=ln.slab_sgst_rate,
            slab_igst_rate=ln.slab_igst_rate,
            slab_cess_rate=ln.slab_cess_rate,
            origin_state_code=origin_state_code,
            place_of_supply=place_of_supply,
            supply_type=supply_type,
            is_rcm=is_rcm,
            hsn_sac_code=ln.hsn_sac_code,
        )
        for ln in lines
    ]

    subtotal = quantize_money(sum((ln.gross_amount for ln in computed_lines), ZERO))
    total_discount = quantize_money(
        sum((ln.discount_amount for ln in computed_lines), ZERO)
    )
    taxable_total = quantize_money(
        sum((ln.taxable_amount for ln in computed_lines), ZERO)
    )
    cgst_total = quantize_money(sum((ln.cgst_amount for ln in computed_lines), ZERO))
    sgst_total = quantize_money(sum((ln.sgst_amount for ln in computed_lines), ZERO))
    igst_total = quantize_money(sum((ln.igst_amount for ln in computed_lines), ZERO))
    cess_total = quantize_money(sum((ln.cess_amount for ln in computed_lines), ZERO))
    tax_total = quantize_money(cgst_total + sgst_total + igst_total + cess_total)

    raw_payable = (
        taxable_total if is_rcm else quantize_money(taxable_total + tax_total)
    )
    if enable_round_off:
        rounded = raw_payable.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(
            MONEY_QUANT
        )
        round_off = quantize_money(rounded - raw_payable)
        grand_total = rounded
    else:
        round_off = ZERO
        grand_total = raw_payable

    return GstInvoiceComputed(
        is_inter_state=computed_lines[0].is_inter_state,
        lines=computed_lines,
        subtotal=subtotal,
        total_discount=total_discount,
        taxable_total=taxable_total,
        cgst_total=cgst_total,
        sgst_total=sgst_total,
        igst_total=igst_total,
        cess_total=cess_total,
        tax_total=tax_total,
        round_off=round_off,
        grand_total=grand_total,
        hsn_summary=build_hsn_summary(computed_lines),
    )
