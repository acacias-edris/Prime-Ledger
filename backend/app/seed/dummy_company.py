from __future__ import annotations

import asyncio
import re
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.money import ZERO, quantize_money
from app.models.company import Company, FiscalYear
from app.models.ledger import (
    AccountGroup,
    AccountNature,
    DrCr,
    Ledger,
    Voucher,
    VoucherLine,
    VoucherSequence,
    VoucherStatus,
    VoucherType,
)

# Synthetic-only company profile (zero real PII)
SEED_COMPANY_NAME = "Bharat Hardware & Exports Pvt. Ltd."
SEED_COMPANY_GSTIN = "09AABCU9603R1ZM"
SEED_FY_LABEL = "FY 2026-27"

# All 28 Standard Tally Prime Account Groups (15 Primary + 13 Sub-Groups)
# Tuple: (code, name, parent_code, nature, is_primary, affects_gross_profit, display_order)
TALLY_28_GROUPS: list[
    tuple[str, str, str | None, AccountNature, bool, bool, int]
] = [
    # 15 Primary Groups
    ("GRP-CAP", "Capital Account", None, AccountNature.EQUITY, True, False, 10),
    ("GRP-LOAN", "Loans (Liability)", None, AccountNature.LIABILITY, True, False, 20),
    ("GRP-CLIA", "Current Liabilities", None, AccountNature.LIABILITY, True, False, 30),
    ("GRP-FA", "Fixed Assets", None, AccountNature.ASSET, True, False, 40),
    ("GRP-INV", "Investments", None, AccountNature.ASSET, True, False, 50),
    ("GRP-CASS", "Current Assets", None, AccountNature.ASSET, True, False, 60),
    ("GRP-BRCH", "Branch / Divisions", None, AccountNature.ASSET, True, False, 70),
    ("GRP-MISC", "Misc. Expenses (ASSET)", None, AccountNature.ASSET, True, False, 80),
    ("GRP-SUSP", "Suspense A/c", None, AccountNature.LIABILITY, True, False, 90),
    ("GRP-SALE", "Sales Accounts", None, AccountNature.INCOME, True, True, 100),
    ("GRP-PURC", "Purchase Accounts", None, AccountNature.EXPENSE, True, True, 110),
    ("GRP-DINC", "Direct Incomes", None, AccountNature.INCOME, True, True, 120),
    ("GRP-DEXP", "Direct Expenses", None, AccountNature.EXPENSE, True, True, 130),
    ("GRP-IINC", "Indirect Incomes", None, AccountNature.INCOME, True, False, 140),
    ("GRP-IEXP", "Indirect Expenses", None, AccountNature.EXPENSE, True, False, 150),
    # 13 Sub-Groups
    ("GRP-RES", "Reserves & Surplus", "GRP-CAP", AccountNature.EQUITY, False, False, 15),
    ("GRP-BOD", "Bank OD A/c", "GRP-LOAN", AccountNature.LIABILITY, False, False, 22),
    ("GRP-SLON", "Secured Loans", "GRP-LOAN", AccountNature.LIABILITY, False, False, 24),
    ("GRP-ULON", "Unsecured Loans", "GRP-LOAN", AccountNature.LIABILITY, False, False, 26),
    ("GRP-DUTY", "Duties & Taxes", "GRP-CLIA", AccountNature.LIABILITY, False, False, 32),
    ("GRP-PROV", "Provisions", "GRP-CLIA", AccountNature.LIABILITY, False, False, 34),
    ("GRP-CRED", "Sundry Creditors", "GRP-CLIA", AccountNature.LIABILITY, False, False, 36),
    ("GRP-STCK", "Stock-in-Hand", "GRP-CASS", AccountNature.ASSET, False, False, 62),
    ("GRP-DEP", "Deposits (Asset)", "GRP-CASS", AccountNature.ASSET, False, False, 63),
    ("GRP-LADV", "Loans & Advances (Asset)", "GRP-CASS", AccountNature.ASSET, False, False, 64),
    ("GRP-DEBT", "Sundry Debtors", "GRP-CASS", AccountNature.ASSET, False, False, 65),
    ("GRP-CASH", "Cash-in-Hand", "GRP-CASS", AccountNature.ASSET, False, False, 66),
    ("GRP-BANK", "Bank Accounts", "GRP-CASS", AccountNature.ASSET, False, False, 67),
]

# 20 Realistic Ledgers with STRICTLY BALANCED Opening Balances:
# Sum(Opening DR) = 5,600,000.0000 == Sum(Opening CR) = 5,600,000.0000
# Tuple: (code, name, group_code, opening_bal, dr_cr, party_gstin, party_state, credit_days, is_sys)
SEED_20_LEDGERS: list[
    tuple[str, str, str, str, DrCr, str | None, str | None, int, bool]
] = [
    # Assets & Input Tax Credits (Opening DR = 5,600,000.0000)
    ("1001", "Cash-in-Hand (Head Office)", "GRP-CASH", "150000.0000", DrCr.DR, None, None, 0, True),
    ("1010", "HDFC Bank Current A/c", "GRP-BANK", "1350000.0000", DrCr.DR, None, None, 0, True),
    ("1101", "Apex Industrial Electricals Pvt. Ltd.", "GRP-DEBT", "640000.0000", DrCr.DR, "09AAACA1111A1Z1", "09", 30, False),
    ("1102", "Western Valves & Fittings LLP", "GRP-DEBT", "420000.0000", DrCr.DR, "27AAACW2222B1Z2", "27", 45, False),
    ("1201", "Stock-in-Hand — Hardware & Copper", "GRP-STCK", "950000.0000", DrCr.DR, None, None, 0, False),
    ("1301", "Plant & Machinery", "GRP-FA", "1640000.0000", DrCr.DR, None, None, 0, False),
    ("2111", "Input CGST 9%", "GRP-DUTY", "120000.0000", DrCr.DR, None, None, 0, True),
    ("2112", "Input SGST 9%", "GRP-DUTY", "120000.0000", DrCr.DR, None, None, 0, True),
    ("2113", "Input IGST 18%", "GRP-DUTY", "210000.0000", DrCr.DR, None, None, 0, True),
    # Equity, Liabilities & Output Tax (Opening CR = 5,600,000.0000)
    ("3001", "Share Capital — Equity", "GRP-CAP", "4600000.0000", DrCr.CR, None, None, 0, True),
    ("2001", "Mahavir Copper Industries", "GRP-CRED", "620000.0000", DrCr.CR, "09AAACM3333C1Z3", "09", 30, False),
    ("2002", "Kalyani Freight & Logistics", "GRP-CRED", "290000.0000", DrCr.CR, "07AAACK4444D1Z4", "07", 15, False),
    ("2101", "Output CGST 9%", "GRP-DUTY", "30000.0000", DrCr.CR, None, None, 0, True),
    ("2102", "Output SGST 9%", "GRP-DUTY", "30000.0000", DrCr.CR, None, None, 0, True),
    ("2103", "Output IGST 18%", "GRP-DUTY", "30000.0000", DrCr.CR, None, None, 0, True),
    # Trading & P&L Ledgers (Opening Balance = 0.0000)
    ("4001", "Sales — Electrical Hardware", "GRP-SALE", "0.0000", DrCr.CR, None, None, 0, False),
    ("4101", "Interest & Discount Received", "GRP-IINC", "0.0000", DrCr.CR, None, None, 0, False),
    ("5001", "Purchases — Copper & Alloys", "GRP-PURC", "0.0000", DrCr.DR, None, None, 0, False),
    ("5101", "Freight & Forwarding Inward", "GRP-DEXP", "0.0000", DrCr.DR, None, None, 0, False),
    ("5201", "Office Rent & Warehouse Utilities", "GRP-IEXP", "0.0000", DrCr.DR, None, None, 0, False),
]

# 15 Balanced Sample Vouchers spanning F4 Contra through F9 Purchase
SEED_15_VOUCHERS: list[dict] = [
    {
        "voucher_number": "CON/26-27/0001",
        "voucher_type": VoucherType.CONTRA,
        "voucher_date": date(2026, 10, 5),
        "reference_no": "SLIP-4011",
        "narration": "Counter cash deposit into HDFC Bank Current A/c",
        "lines": [
            ("1010", "50000.0000", "0.0000", "Cash deposited at branch"),
            ("1001", "0.0000", "50000.0000", "Cash outflow from HO chest"),
        ],
    },
    {
        "voucher_number": "PUR/26-27/0001",
        "voucher_type": VoucherType.PURCHASE,
        "voucher_date": date(2026, 10, 8),
        "reference_no": "MCI/26/9001",
        "narration": "Electrolytic Copper Rod 8mm · Intra-state CGST 9% + SGST 9%",
        "lines": [
            ("5001", "300000.0000", "0.0000", "Taxable purchase value"),
            ("2111", "27000.0000", "0.0000", "Input CGST @ 9%"),
            ("2112", "27000.0000", "0.0000", "Input SGST @ 9%"),
            ("2001", "0.0000", "354000.0000", "Payable to Mahavir Copper"),
        ],
    },
    {
        "voucher_number": "SAL/26-27/0001",
        "voucher_type": VoucherType.SALES,
        "voucher_date": date(2026, 10, 12),
        "reference_no": "PO-APEX-8801",
        "narration": "Copper Wire Coil 2.5mm (240 coils) · Intra-state CGST 9% + SGST 9%",
        "lines": [
            ("1101", "283200.0000", "0.0000", "Invoice receivable from Apex"),
            ("4001", "0.0000", "240000.0000", "Taxable outward supply"),
            ("2101", "0.0000", "21600.0000", "Output CGST @ 9%"),
            ("2102", "0.0000", "21600.0000", "Output SGST @ 9%"),
        ],
    },
    {
        "voucher_number": "PUR/26-27/0002",
        "voucher_type": VoucherType.PURCHASE,
        "voucher_date": date(2026, 10, 15),
        "reference_no": "KFL/26/318",
        "narration": "Inter-state GTA freight inward (Delhi to Hathras) · IGST 18%",
        "lines": [
            ("5101", "45000.0000", "0.0000", "Inward haulage charges"),
            ("2113", "8100.0000", "0.0000", "Input IGST @ 18%"),
            ("2002", "0.0000", "53100.0000", "Payable to Kalyani Freight"),
        ],
    },
    {
        "voucher_number": "PAY/26-27/0001",
        "voucher_type": VoucherType.PAYMENT,
        "voucher_date": date(2026, 10, 18),
        "reference_no": "HDFCN5202610181104",
        "narration": "NEFT part settlement against MCI/26/9001",
        "lines": [
            ("2001", "250000.0000", "0.0000", "Vendor settlement"),
            ("1010", "0.0000", "250000.0000", "HDFC Bank NEFT debit"),
        ],
    },
    {
        "voucher_number": "RCP/26-27/0001",
        "voucher_type": VoucherType.RECEIPT,
        "voucher_date": date(2026, 10, 22),
        "reference_no": "HDFCR5202610220042",
        "narration": "RTGS receipt from Apex Industrial Electricals",
        "lines": [
            ("1010", "220000.0000", "0.0000", "RTGS credit into HDFC Bank"),
            ("1101", "0.0000", "220000.0000", "Part collection against SAL/26-27/0001"),
        ],
    },
    {
        "voucher_number": "SAL/26-27/0002",
        "voucher_type": VoucherType.SALES,
        "voucher_date": date(2026, 10, 26),
        "reference_no": "PO-WVF-409",
        "narration": "Inter-state supply of Brass Terminals to Maharashtra · IGST 18%",
        "lines": [
            ("1102", "354000.0000", "0.0000", "Receivable from Western Valves"),
            ("4001", "0.0000", "300000.0000", "Taxable inter-state sales"),
            ("2103", "0.0000", "54000.0000", "Output IGST @ 18%"),
        ],
    },
    {
        "voucher_number": "JRN/26-27/0001",
        "voucher_type": VoucherType.JOURNAL,
        "voucher_date": date(2026, 10, 31),
        "reference_no": "RENT-OCT-26",
        "narration": "October 2026 warehouse lease & utilities accrual",
        "lines": [
            ("5201", "65000.0000", "0.0000", "Oct rent & power expense"),
            ("2002", "0.0000", "65000.0000", "Accrued payable to logistics depot"),
        ],
    },
    {
        "voucher_number": "PAY/26-27/0002",
        "voucher_type": VoucherType.PAYMENT,
        "voucher_date": date(2026, 11, 4),
        "reference_no": "HDFCN5202611047712",
        "narration": "Settlement of Kalyani Freight & October depot dues",
        "lines": [
            ("2002", "118100.0000", "0.0000", "Freight + Oct rent payout"),
            ("1010", "0.0000", "118100.0000", "HDFC Bank NEFT debit"),
        ],
    },
    {
        "voucher_number": "RCP/26-27/0002",
        "voucher_type": VoucherType.RECEIPT,
        "voucher_date": date(2026, 11, 8),
        "reference_no": "HDFCR5202611080091",
        "narration": "RTGS collection from Western Valves & Fittings LLP",
        "lines": [
            ("1010", "280000.0000", "0.0000", "RTGS credit into HDFC Bank"),
            ("1102", "0.0000", "280000.0000", "Against SAL/26-27/0002"),
        ],
    },
    {
        "voucher_number": "PUR/26-27/0003",
        "voucher_type": VoucherType.PURCHASE,
        "voucher_date": date(2026, 11, 12),
        "reference_no": "MCI/26/9412",
        "narration": "Annealed Copper Strip 1.5mm · Intra-state CGST 9% + SGST 9%",
        "lines": [
            ("5001", "200000.0000", "0.0000", "Taxable purchase value"),
            ("2111", "18000.0000", "0.0000", "Input CGST @ 9%"),
            ("2112", "18000.0000", "0.0000", "Input SGST @ 9%"),
            ("2001", "0.0000", "236000.0000", "Payable to Mahavir Copper"),
        ],
    },
    {
        "voucher_number": "SAL/26-27/0003",
        "voucher_type": VoucherType.SALES,
        "voucher_date": date(2026, 11, 16),
        "reference_no": "PO-APEX-8841",
        "narration": "Heavy-duty Switchgear Busbars · Intra-state CGST 9% + SGST 9%",
        "lines": [
            ("1101", "413000.0000", "0.0000", "Invoice receivable from Apex"),
            ("4001", "0.0000", "350000.0000", "Taxable outward supply"),
            ("2101", "0.0000", "31500.0000", "Output CGST @ 9%"),
            ("2102", "0.0000", "31500.0000", "Output SGST @ 9%"),
        ],
    },
    {
        "voucher_number": "RCP/26-27/0003",
        "voucher_type": VoucherType.RECEIPT,
        "voucher_date": date(2026, 11, 20),
        "reference_no": "INT-Q3-2026",
        "narration": "FD sweep interest & prompt-payment rebate credited",
        "lines": [
            ("1010", "18500.0000", "0.0000", "Bank credit"),
            ("4101", "0.0000", "18500.0000", "Indirect income"),
        ],
    },
    {
        "voucher_number": "CON/26-27/0002",
        "voucher_type": VoucherType.CONTRA,
        "voucher_date": date(2026, 11, 22),
        "reference_no": "CHQ-000490",
        "narration": "Cash withdrawn from HDFC Bank for HO petty cash float",
        "lines": [
            ("1001", "25000.0000", "0.0000", "Petty cash replenishment"),
            ("1010", "0.0000", "25000.0000", "Self cheque withdrawal"),
        ],
    },
    {
        "voucher_number": "JRN/26-27/0002",
        "voucher_type": VoucherType.JOURNAL,
        "voucher_date": date(2026, 11, 26),
        "reference_no": "RENT-NOV-26",
        "narration": "November 2026 warehouse lease & utilities accrual",
        "lines": [
            ("5201", "65000.0000", "0.0000", "Nov rent & power expense"),
            ("2002", "0.0000", "65000.0000", "Accrued payable to logistics depot"),
        ],
    },
]


async def seed_dummy_company(db: AsyncSession) -> dict[str, int]:
    """
    Idempotently seeds Bharat Hardware & Exports Pvt. Ltd. (FY 2026-27),
    all 28 Tally Prime Account Groups, 20 balanced opening ledgers, and 15
    balanced sample vouchers (F4–F9). Safe to re-run without duplicates.
    """
    # 1. Company
    company = (
        await db.execute(
            select(Company).where(Company.legal_name == SEED_COMPANY_NAME)
        )
    ).scalar_one_or_none()
    if company is None:
        company = Company(
            name=SEED_COMPANY_NAME,
            legal_name=SEED_COMPANY_NAME,
            country_code="IN",
            state_code="09",
            gstin=SEED_COMPANY_GSTIN,
            base_currency="INR",
            number_format="INDIAN_LAKH",
            fy_start_month=4,
            is_active=True,
        )
        db.add(company)
        await db.flush()

    # 2. Fiscal Year (FY 2026-27)
    fy = (
        await db.execute(
            select(FiscalYear).where(
                FiscalYear.company_id == company.id,
                FiscalYear.label == SEED_FY_LABEL,
            )
        )
    ).scalar_one_or_none()
    if fy is None:
        fy = FiscalYear(
            company_id=company.id,
            label=SEED_FY_LABEL,
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_locked=False,
        )
        db.add(fy)
        await db.flush()

    # 3. All 28 Standard Tally Prime Account Groups (Primary first, then Sub-Groups)
    existing_groups = {
        g.code: g
        for g in (
            await db.execute(
                select(AccountGroup).where(AccountGroup.company_id == company.id)
            )
        )
        .scalars()
        .all()
    }
    groups_created = 0
    for code, name, parent_code, nature, is_primary, affects_gp, order in TALLY_28_GROUPS:
        if code in existing_groups:
            continue
        parent_id = existing_groups[parent_code].id if parent_code else None
        grp = AccountGroup(
            company_id=company.id,
            code=code,
            name=name,
            parent_id=parent_id,
            nature=nature.value,
            is_primary=is_primary,
            affects_gross_profit=affects_gp,
            display_order=order,
        )
        db.add(grp)
        await db.flush()
        existing_groups[code] = grp
        groups_created += 1

    # 4. Verify opening balance equilibrium before seeding ledgers
    open_dr = sum(
        (quantize_money(bal) for _, _, _, bal, side, *_ in SEED_20_LEDGERS if side == DrCr.DR),
        ZERO,
    )
    open_cr = sum(
        (quantize_money(bal) for _, _, _, bal, side, *_ in SEED_20_LEDGERS if side == DrCr.CR),
        ZERO,
    )
    assert open_dr == open_cr, f"Seed opening balances unbalanced: Dr={open_dr} != Cr={open_cr}"

    existing_ledgers = {
        l.code: l
        for l in (
            await db.execute(select(Ledger).where(Ledger.company_id == company.id))
        )
        .scalars()
        .all()
    }
    ledgers_created = 0
    for (
        code,
        name,
        grp_code,
        open_bal,
        dr_cr,
        party_gstin,
        party_state,
        credit_days,
        is_sys,
    ) in SEED_20_LEDGERS:
        if code in existing_ledgers:
            continue
        ledger = Ledger(
            company_id=company.id,
            group_id=existing_groups[grp_code].id,
            code=code,
            name=name,
            opening_balance=quantize_money(open_bal),
            opening_dr_cr=dr_cr.value,
            party_gstin=party_gstin,
            party_state_code=party_state,
            credit_days=credit_days,
            is_system_ledger=is_sys,
            is_active=True,
        )
        db.add(ledger)
        await db.flush()
        existing_ledgers[code] = ledger
        ledgers_created += 1

    # 5. Seed 15 Balanced Vouchers (F4–F9)
    existing_voucher_nos = set(
        (
            await db.execute(
                select(Voucher.voucher_number).where(
                    Voucher.company_id == company.id,
                    Voucher.fiscal_year_id == fy.id,
                )
            )
        )
        .scalars()
        .all()
    )
    vouchers_created = 0
    for vdef in SEED_15_VOUCHERS:
        if vdef["voucher_number"] in existing_voucher_nos:
            continue
        lines = [
            VoucherLine(
                ledger_id=existing_ledgers[l_code].id,
                debit_amount=Decimal(dr),
                credit_amount=Decimal(cr),
                line_narration=l_narr,
            )
            for l_code, dr, cr, l_narr in vdef["lines"]
        ]
        # Two-phase post (DRAFT -> flush lines -> POSTED) so DB integrity triggers succeed
        voucher = Voucher(
            company_id=company.id,
            fiscal_year_id=fy.id,
            voucher_number=vdef["voucher_number"],
            voucher_type=vdef["voucher_type"].value,
            voucher_date=vdef["voucher_date"],
            reference_no=vdef["reference_no"],
            narration=vdef["narration"],
            status=VoucherStatus.DRAFT.value,
            lines=lines,
        )
        db.add(voucher)
        await db.flush()
        voucher.status = VoucherStatus.POSTED.value
        await db.flush()
        vouchers_created += 1

    # Sync gapless VoucherSequence counters with all auto-numbered vouchers in this FY
    seq_pat = re.compile(r"^[A-Z]+/\d{2}-\d{2}/([0-9]+)$")
    all_fy_vouchers = (
        await db.execute(
            select(Voucher.voucher_type, Voucher.voucher_number).where(
                Voucher.company_id == company.id,
                Voucher.fiscal_year_id == fy.id,
            )
        )
    ).all()
    max_seq_by_type: dict[str, int] = {}
    for vtype, vno in all_fy_vouchers:
        match = seq_pat.match(vno or "")
        if match:
            seq_num = int(match.group(1))
            if seq_num >= 1:
                max_seq_by_type[vtype] = max(max_seq_by_type.get(vtype, 0), seq_num)

    existing_seqs = {
        row.voucher_type: row
        for row in (
            await db.execute(
                select(VoucherSequence).where(
                    VoucherSequence.company_id == company.id,
                    VoucherSequence.fiscal_year_id == fy.id,
                )
            )
        )
        .scalars()
        .all()
    }
    for vtype, max_val in max_seq_by_type.items():
        seq_row = existing_seqs.get(vtype)
        if seq_row is None:
            db.add(
                VoucherSequence(
                    company_id=company.id,
                    fiscal_year_id=fy.id,
                    voucher_type=vtype,
                    last_value=max_val,
                )
            )
        elif seq_row.last_value < max_val:
            seq_row.last_value = max_val

    await db.commit()
    return {
        "company_id": company.id,
        "fiscal_year_id": fy.id,
        "groups_created": groups_created,
        "ledgers_created": ledgers_created,
        "vouchers_created": vouchers_created,
    }


async def _main() -> None:
    async with AsyncSessionLocal() as session:
        summary = await seed_dummy_company(session)
    print(
        f"Seeded {SEED_COMPANY_NAME} ({SEED_FY_LABEL}): "
        f"groups_created={summary['groups_created']}, "
        f"ledgers_created={summary['ledgers_created']}, "
        f"vouchers_created={summary['vouchers_created']}"
    )


if __name__ == "__main__":
    asyncio.run(_main())
