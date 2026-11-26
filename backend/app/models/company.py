from __future__ import annotations

from datetime import date, datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.ledger import AccountGroup, Ledger, Voucher


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint(
            "number_format IN ('INDIAN_LAKH', 'INTERNATIONAL')",
            name="valid_number_format",
        ),
        CheckConstraint(
            "fy_start_month >= 1 AND fy_start_month <= 12",
            name="valid_fy_start_month",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(160), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, default="IN")
    state_code: Mapped[str] = mapped_column(String(8), nullable=False, default="09")
    gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    number_format: Mapped[str] = mapped_column(
        String(24), nullable=False, default="INDIAN_LAKH"
    )
    fy_start_month: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now
    )

    fiscal_years: Mapped[list["FiscalYear"]] = relationship(
        back_populates="company",
        lazy="selectin",
    )
    account_groups: Mapped[list["AccountGroup"]] = relationship(
        back_populates="company",
        lazy="selectin",
    )
    ledgers: Mapped[list["Ledger"]] = relationship(
        back_populates="company",
        lazy="selectin",
    )
    vouchers: Mapped[list["Voucher"]] = relationship(
        back_populates="company",
        lazy="selectin",
    )


class FiscalYear(Base):
    __tablename__ = "fiscal_years"
    __table_args__ = (
        UniqueConstraint("company_id", "label", name="uq_fiscal_years_company_label"),
        CheckConstraint("end_date > start_date", name="valid_fy_date_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    company: Mapped["Company"] = relationship(
        back_populates="fiscal_years",
        lazy="selectin",
    )
    vouchers: Mapped[list["Voucher"]] = relationship(
        back_populates="fiscal_year",
        lazy="selectin",
    )
