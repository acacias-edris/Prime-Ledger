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
    event,
    inspect as sa_inspect,
)
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship
from sqlalchemy.orm.base import NO_VALUE

from app.core.database import Base
from app.core.money import ZERO, MoneyNumeric18_4, quantize_money
from app.modules.ledger.exceptions import InvalidVoucherError, UnbalancedVoucherError

if TYPE_CHECKING:
    from app.models.company import Company, FiscalYear


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AccountNature(StrEnum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    EQUITY = "EQUITY"
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"


class DrCr(StrEnum):
    DR = "DR"
    CR = "CR"


class VoucherType(StrEnum):
    CONTRA = "CONTRA"
    PAYMENT = "PAYMENT"
    RECEIPT = "RECEIPT"
    JOURNAL = "JOURNAL"
    SALES = "SALES"
    PURCHASE = "PURCHASE"
    CREDIT_NOTE = "CREDIT_NOTE"
    DEBIT_NOTE = "DEBIT_NOTE"


class VoucherStatus(StrEnum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    CANCELLED = "CANCELLED"


class AccountGroup(Base):
    __tablename__ = "account_groups"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_account_groups_company_code"),
        UniqueConstraint("company_id", "name", name="uq_account_groups_company_name"),
        CheckConstraint(
            "nature IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')",
            name="valid_account_nature",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("account_groups.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    nature: Mapped[str] = mapped_column(String(16), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    affects_gross_profit: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)

    company: Mapped["Company"] = relationship(
        back_populates="account_groups",
        lazy="selectin",
    )
    parent: Mapped["AccountGroup | None"] = relationship(
        remote_side=[id],
        lazy="selectin",
    )
    ledgers: Mapped[list["Ledger"]] = relationship(
        back_populates="group",
        lazy="selectin",
    )


class Ledger(Base):
    __tablename__ = "ledgers"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_ledgers_company_code"),
        UniqueConstraint("company_id", "name", name="uq_ledgers_company_name"),
        CheckConstraint("opening_balance >= 0", name="non_negative_opening_balance"),
        CheckConstraint("opening_dr_cr IN ('DR', 'CR')", name="valid_opening_dr_cr"),
        CheckConstraint("credit_days >= 0", name="non_negative_credit_days"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("account_groups.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    opening_balance: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    opening_dr_cr: Mapped[str] = mapped_column(String(2), nullable=False, default="DR")
    party_gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    party_state_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    credit_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_system_ledger: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    company: Mapped["Company"] = relationship(
        back_populates="ledgers",
        lazy="selectin",
    )
    group: Mapped["AccountGroup"] = relationship(
        back_populates="ledgers",
        lazy="selectin",
    )
    voucher_lines: Mapped[list["VoucherLine"]] = relationship(
        back_populates="ledger",
        lazy="raise_on_sql",
    )


class Voucher(Base):
    __tablename__ = "vouchers"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "fiscal_year_id",
            "voucher_number",
            name="uq_vouchers_company_fy_number",
        ),
        CheckConstraint(
            "voucher_type IN ('CONTRA', 'PAYMENT', 'RECEIPT', 'JOURNAL', "
            "'SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE')",
            name="valid_voucher_type",
        ),
        CheckConstraint(
            "status IN ('DRAFT', 'POSTED', 'CANCELLED')",
            name="valid_voucher_status",
        ),
        Index(
            "ix_vouchers_company_date_status",
            "company_id",
            "voucher_date",
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
    voucher_number: Mapped[str] = mapped_column(String(40), nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(24), nullable=False)
    voucher_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reference_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    narration: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=VoucherStatus.POSTED.value
    )
    reversed_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now
    )

    company: Mapped["Company"] = relationship(
        back_populates="vouchers",
        lazy="selectin",
    )
    fiscal_year: Mapped["FiscalYear"] = relationship(
        back_populates="vouchers",
        lazy="selectin",
    )
    reversed_voucher: Mapped["Voucher | None"] = relationship(
        remote_side=[id],
        lazy="selectin",
    )
    lines: Mapped[list["VoucherLine"]] = relationship(
        back_populates="voucher",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="VoucherLine.id",
    )


class VoucherLine(Base):
    __tablename__ = "voucher_lines"
    __table_args__ = (
        CheckConstraint(
            "debit_amount >= 0 AND credit_amount >= 0",
            name="non_negative_line_amounts",
        ),
        CheckConstraint(
            "(debit_amount > 0 AND credit_amount = 0) OR "
            "(credit_amount > 0 AND debit_amount = 0)",
            name="mutually_exclusive_dr_cr",
        ),
        Index("ix_voucher_lines_ledger_voucher", "ledger_id", "voucher_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    voucher_id: Mapped[int] = mapped_column(
        ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ledger_id: Mapped[int] = mapped_column(
        ForeignKey("ledgers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    debit_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    credit_amount: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    line_narration: Mapped[str | None] = mapped_column(String(255), nullable=True)

    voucher: Mapped["Voucher"] = relationship(
        back_populates="lines",
        lazy="selectin",
    )
    ledger: Mapped["Ledger"] = relationship(
        back_populates="voucher_lines",
        lazy="selectin",
    )


@event.listens_for(Session, "before_flush")
def _enforce_double_entry_before_flush(
    session: Session, _flush_context, _instances
) -> None:
    """
    Synchronous ORM safety net (Layer 3 invariant gate).
    Strictly blocks flushing any POSTED voucher with:
      - fewer than 2 active lines
      - any line not strictly single-sided (debit > 0 XOR credit > 0)
      - total_debit <= 0 OR SUM(debit_amount) != SUM(credit_amount)
    Never triggers lazy SQL inside async sessions.
    """
    candidate_vouchers: set[Voucher] = set()

    for obj in session.new.union(session.dirty).union(session.deleted):
        if isinstance(obj, Voucher):
            candidate_vouchers.add(obj)
        elif isinstance(obj, VoucherLine):
            line_state = sa_inspect(obj)
            loaded_voucher = line_state.attrs.voucher.loaded_value
            if loaded_voucher is not NO_VALUE and loaded_voucher is not None:
                candidate_vouchers.add(loaded_voucher)

    for voucher in candidate_vouchers:
        if voucher in session.deleted:
            continue
        if voucher.status != VoucherStatus.POSTED.value:
            continue

        voucher_state = sa_inspect(voucher)
        loaded_lines = voucher_state.attrs.lines.loaded_value
        if loaded_lines is NO_VALUE:
            if voucher in session.new:
                raise InvalidVoucherError(
                    f"Posted voucher {voucher.voucher_number} must contain at least 2 lines."
                )
            # Existing posted voucher whose lines were not loaded or mutated (e.g. narration edit)
            continue

        active_lines = [ln for ln in loaded_lines if ln not in session.deleted]
        if len(active_lines) < 2:
            raise InvalidVoucherError(
                f"Posted voucher {voucher.voucher_number} requires at least 2 ledger lines "
                f"(received {len(active_lines)})."
            )

        total_dr = ZERO
        total_cr = ZERO
        for idx, line in enumerate(active_lines, start=1):
            dr = quantize_money(line.debit_amount)
            cr = quantize_money(line.credit_amount)
            if (dr > ZERO and cr > ZERO) or (dr == ZERO and cr == ZERO):
                raise InvalidVoucherError(
                    f"Voucher {voucher.voucher_number} line #{idx} must have strictly "
                    "either debit_amount > 0 OR credit_amount > 0 (mutually exclusive)."
                )
            total_dr += dr
            total_cr += cr

        if total_dr <= ZERO:
            raise InvalidVoucherError(
                f"Posted voucher {voucher.voucher_number} total must be greater than 0.0000."
            )

        if total_dr != total_cr:
            raise UnbalancedVoucherError(
                total_debit=total_dr,
                total_credit=total_cr,
                voucher_number=voucher.voucher_number,
            )
