from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.money import ZERO, MoneyNumeric18_4


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class HsnSacType(StrEnum):
    HSN = "HSN"
    SAC = "SAC"


class GstTaxSlab(Base):
    __tablename__ = "gst_tax_slabs"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_gst_tax_slabs_company_code"),
        UniqueConstraint("company_id", "name", name="uq_gst_tax_slabs_company_name"),
        CheckConstraint(
            "cgst_rate >= 0 AND sgst_rate >= 0 AND igst_rate >= 0 AND cess_rate >= 0",
            name="non_negative_gst_rates",
        ),
        CheckConstraint(
            "cgst_rate + sgst_rate = igst_rate",
            name="cgst_plus_sgst_equals_igst",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    cgst_rate: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    sgst_rate: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    igst_rate: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    cess_rate: Mapped[Decimal] = mapped_column(
        MoneyNumeric18_4, nullable=False, default=ZERO
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )


class HsnSacCode(Base):
    __tablename__ = "hsn_sac_codes"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_hsn_sac_codes_company_code"),
        CheckConstraint("code_type IN ('HSN', 'SAC')", name="valid_hsn_sac_type"),
        CheckConstraint(
            "code_type != 'SAC' OR default_uqc = 'NA'", name="sac_requires_na_uqc"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(8), nullable=False)
    code_type: Mapped[str] = mapped_column(String(3), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    default_tax_slab_id: Mapped[int | None] = mapped_column(
        ForeignKey("gst_tax_slabs.id", ondelete="RESTRICT"), nullable=True
    )
    default_uqc: Mapped[str] = mapped_column(String(16), nullable=False, default="NOS")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    default_tax_slab: Mapped["GstTaxSlab | None"] = relationship(lazy="selectin")
