from __future__ import annotations

import importlib.util
from collections.abc import AsyncGenerator
from decimal import Decimal
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import Base, build_async_engine, get_db
from app.core.indian_words import amount_to_indian_words
from app.main import app
from app.models.inventory import FifoLotAllocation, InventoryLot, StockMovement
from app.models.invoicing import Invoice
from app.models.ledger import Ledger, Voucher
from app.modules.tax_india.gst_calculator import validate_gstin
from app.seed.dummy_company import seed_dummy_company


def _load_migration(filename: str):
    mig_path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / filename
    spec = importlib.util.spec_from_file_location(filename.removesuffix(".py"), mig_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest_asyncio.fixture
async def m3_session(tmp_path: Path) -> AsyncGenerator[AsyncSession, None]:
    """Isolated SQLite WAL DB with M2 integrity triggers and M3 synthetic seed."""
    db_file = tmp_path / "test_m3.db"
    engine = build_async_engine(f"sqlite+aiosqlite:///{db_file}", echo=False)
    m7 = _load_migration("m2_0007_integrity.py")
    m8 = _load_migration("m2_0008_header_immutability.py")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in m7.SQLITE_TRIGGERS + m8.SQLITE_HEADER_TRIGGERS:
            await conn.execute(text(stmt))

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    async with session_factory() as session:
        await seed_dummy_company(session, include_milestone3=True)
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def m3_client(m3_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield m3_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _lookup_masters(client: AsyncClient) -> dict:
    ledgers = {l["name"]: l for l in (await client.get("/api/v1/ledgers")).json()}
    slabs = {s["code"]: s for s in (await client.get("/api/v1/tax/india/slabs")).json()}
    units = {u["symbol"]: u for u in (await client.get("/api/v1/inventory/units")).json()}
    godowns = {g["code"]: g for g in (await client.get("/api/v1/inventory/godowns")).json()}
    hsn = {h["code"]: h for h in (await client.get("/api/v1/tax/india/hsn-sac")).json()}
    items = {i["sku"]: i for i in (await client.get("/api/v1/inventory/items")).json()}
    return {
        "ledgers": ledgers,
        "slabs": slabs,
        "units": units,
        "godowns": godowns,
        "hsn": hsn,
        "items": items,
    }


async def _create_test_item(
    client: AsyncClient,
    masters: dict,
    *,
    sku: str,
    name: str,
    item_type: str = "GOODS",
    valuation_method: str = "FIFO",
    slab_code: str = "GST-18",
) -> dict:
    resp = await client.post(
        "/api/v1/inventory/items",
        json={
            "sku": sku,
            "name": name,
            "item_type": item_type,
            "valuation_method": valuation_method,
            "unit_id": masters["units"]["Svc" if item_type == "SERVICE" else "Nos"]["id"],
            "hsn_sac_id": masters["hsn"]["998314" if item_type == "SERVICE" else "8544"]["id"],
            "default_tax_slab_id": masters["slabs"][slab_code]["id"],
            "standard_selling_price": "200.0000",
            "standard_purchase_cost": "100.0000",
            "reorder_level": "5.0000",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Tests 1–13 per CURRENT_TASK.md Section 8
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gstin_mod36_validator(m3_client: AsyncClient) -> None:
    for valid_id, expected_state, expected_pan in (
        ("09AAACT0000A1ZD", "09", "AAACT0000A"),
        ("09AAACT0001A1ZC", "09", "AAACT0001A"),
        ("27AAACT0002B1ZB", "27", "AAACT0002B"),
        ("09aaact0000a1zd", "09", "AAACT0000A"),
    ):
        res = validate_gstin(valid_id)
        assert res.is_valid is True
        assert res.normalized == valid_id.upper()
        assert res.state_code == expected_state
        assert res.pan == expected_pan
        assert res.error is None

    # API endpoint parity + tampered check digit + invalid state 98 + bad length
    tampered = (await m3_client.get("/api/v1/tax/india/validate-gstin/09AAACT0001A1ZA")).json()
    assert tampered["is_valid"] is False
    assert "mismatch" in tampered["error"].lower()

    bad_state = validate_gstin("98AAACT0000A1Z0")
    assert bad_state.is_valid is False
    assert "state" in (bad_state.error or "").lower()

    bad_len = validate_gstin("09AAACT0000")
    assert bad_len.is_valid is False


@pytest.mark.asyncio
async def test_intra_state_sales_cgst_sgst(m3_client: AsyncClient) -> None:
    m = await _lookup_masters(m3_client)
    item = await _create_test_item(m3_client, m, sku="INTRA-01", name="Intra Cable")
    wh_id = m["godowns"]["MAIN-WH"]["id"]

    pur = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-01",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "lines": [
                {
                    "item_id": item["id"],
                    "godown_id": wh_id,
                    "quantity": "15.0000",
                    "unit_price": "700.0000",
                }
            ],
        },
    )
    assert pur.status_code == 201, pur.text

    sale = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "SALES",
            "invoice_date": "2026-05-05",
            "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
            "place_of_supply": "09",
            "enable_round_off": True,
            "lines": [
                {
                    "item_id": item["id"],
                    "godown_id": wh_id,
                    "quantity": "10.0000",
                    "unit_price": "1000.0000",
                }
            ],
        },
    )
    assert sale.status_code == 201, sale.text
    body = sale.json()
    assert body["is_inter_state"] is False
    assert body["cgst_total"] == "900.0000"
    assert body["sgst_total"] == "900.0000"
    assert body["igst_total"] == "0.0000"
    assert body["grand_total"] == "11800.0000"

    voucher = (await m3_client.get(f"/api/v1/vouchers/{body['voucher_id']}")).json()
    assert voucher["status"] == "POSTED"
    assert voucher["total_debit"] == voucher["total_credit"]


@pytest.mark.asyncio
async def test_inter_state_sales_igst(m3_client: AsyncClient) -> None:
    m = await _lookup_masters(m3_client)
    item = await _create_test_item(m3_client, m, sku="INTER-01", name="Inter Cable")
    wh_id = m["godowns"]["MAIN-WH"]["id"]

    await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-01",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "lines": [
                {"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "700.0000"}
            ],
        },
    )

    sale = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "SALES",
            "invoice_date": "2026-05-06",
            "party_ledger_id": m["ledgers"]["Deccan Infra Projects Mumbai"]["id"],
            "place_of_supply": "27",
            "lines": [
                {"item_id": item["id"], "godown_id": wh_id, "quantity": "5.0000", "unit_price": "1000.0000"}
            ],
        },
    )
    assert sale.status_code == 201, sale.text
    body = sale.json()
    assert body["is_inter_state"] is True
    assert body["cgst_total"] == "0.0000"
    assert body["sgst_total"] == "0.0000"
    assert body["igst_total"] == "900.0000"
    assert body["grand_total"] == "5900.0000"


@pytest.mark.asyncio
async def test_pre_tax_discount_and_round_off(m3_client: AsyncClient) -> None:
    m = await _lookup_masters(m3_client)
    svc_item = await _create_test_item(
        m3_client, m, sku="RO-SVC", name="Calibration Service", item_type="SERVICE"
    )

    # Positive round-off: +0.0100 -> Round Off credited
    pos_resp = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "SALES",
            "invoice_date": "2026-05-08",
            "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
            "place_of_supply": "09",
            "enable_round_off": True,
            "lines": [
                {
                    "item_id": svc_item["id"],
                    "quantity": "3.0000",
                    "unit_price": "333.3300",
                    "discount_pct": "10.0000",
                }
            ],
        },
    )
    assert pos_resp.status_code == 201, pos_resp.text
    pos_body = pos_resp.json()
    assert pos_body["subtotal"] == "999.9900"
    assert pos_body["total_discount"] == "100.0000"
    assert pos_body["taxable_total"] == "899.9900"
    assert pos_body["cgst_total"] == "81.0000"
    assert pos_body["sgst_total"] == "81.0000"
    assert pos_body["round_off"] == "0.0100"
    assert pos_body["grand_total"] == "1062.0000"
    assert abs(Decimal(pos_body["round_off"])) <= Decimal("0.5000")

    pos_voucher = (await m3_client.get(f"/api/v1/vouchers/{pos_body['voucher_id']}")).json()
    ro_line_pos = next(ln for ln in pos_voucher["lines"] if ln["ledger_name"] == "Round Off")
    assert ro_line_pos["credit_amount"] == "0.0100"
    assert ro_line_pos["debit_amount"] == "0.0000"

    # Negative round-off: 130.00 * 1.18 = 153.40 -> round_off = -0.4000 -> Round Off debited
    neg_resp = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "SALES",
            "invoice_date": "2026-05-09",
            "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
            "place_of_supply": "09",
            "enable_round_off": True,
            "lines": [
                {
                    "item_id": svc_item["id"],
                    "quantity": "1.0000",
                    "unit_price": "130.0000",
                }
            ],
        },
    )
    assert neg_resp.status_code == 201, neg_resp.text
    neg_body = neg_resp.json()
    assert neg_body["round_off"] == "-0.4000"
    assert neg_body["grand_total"] == "153.0000"
    neg_voucher = (await m3_client.get(f"/api/v1/vouchers/{neg_body['voucher_id']}")).json()
    ro_line_neg = next(ln for ln in neg_voucher["lines"] if ln["ledger_name"] == "Round Off")
    assert ro_line_neg["debit_amount"] == "0.4000"
    assert ro_line_neg["credit_amount"] == "0.0000"


@pytest.mark.asyncio
async def test_purchase_rcm_double_entry_split(m3_client: AsyncClient) -> None:
    m = await _lookup_masters(m3_client)
    svc_item = await _create_test_item(
        m3_client, m, sku="RCM-SVC", name="Legal & Freight Advisory", item_type="SERVICE"
    )

    resp = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-10",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "is_rcm": True,
            "lines": [
                {
                    "item_id": svc_item["id"],
                    "quantity": "1.0000",
                    "unit_price": "10000.0000",
                }
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["tax_total"] == "1800.0000"
    assert body["grand_total"] == "10000.0000"

    voucher = (await m3_client.get(f"/api/v1/vouchers/{body['voucher_id']}")).json()
    assert voucher["total_debit"] == "11800.0000"
    assert voucher["total_credit"] == "11800.0000"

    by_name = {ln["ledger_name"]: ln for ln in voucher["lines"]}
    assert by_name["Sharda Metals & Cables"]["credit_amount"] == "10000.0000"
    assert by_name["Purchase Account"]["debit_amount"] == "10000.0000"
    assert by_name["Input CGST"]["debit_amount"] == "900.0000"
    assert by_name["Input SGST"]["debit_amount"] == "900.0000"
    assert by_name["RCM Output Tax Payable"]["credit_amount"] == "1800.0000"


@pytest.mark.asyncio
async def test_export_lut_zero_rated(m3_client: AsyncClient) -> None:
    m = await _lookup_masters(m3_client)
    svc_item = await _create_test_item(
        m3_client, m, sku="EXP-SVC", name="Export Design Services", item_type="SERVICE"
    )

    resp = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "SALES",
            "supply_type": "EXPORT_LUT",
            "invoice_date": "2026-05-11",
            "party_ledger_id": m["ledgers"]["Deccan Infra Projects Mumbai"]["id"],
            "place_of_supply": "96",
            "lines": [
                {
                    "item_id": svc_item["id"],
                    "quantity": "1.0000",
                    "unit_price": "25000.0000",
                }
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["cgst_total"] == "0.0000"
    assert body["sgst_total"] == "0.0000"
    assert body["igst_total"] == "0.0000"
    assert body["tax_total"] == "0.0000"
    assert body["grand_total"] == "25000.0000"

    voucher = (await m3_client.get(f"/api/v1/vouchers/{body['voucher_id']}")).json()
    assert not any("GST" in ln["ledger_name"] for ln in voucher["lines"])


@pytest.mark.asyncio
async def test_fifo_multi_batch_costing(
    m3_client: AsyncClient, m3_session: AsyncSession
) -> None:
    m = await _lookup_masters(m3_client)
    item = await _create_test_item(
        m3_client, m, sku="FIFO-T7", name="FIFO Copper Busbar", valuation_method="FIFO"
    )
    wh_id = m["godowns"]["MAIN-WH"]["id"]

    # Purchase #1: 10 @ 100
    p1 = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-01",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "100.0000"}],
        },
    )
    assert p1.status_code == 201, p1.text

    # Purchase #2: 10 @ 120
    p2 = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-05",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "120.0000"}],
        },
    )
    assert p2.status_code == 201, p2.text

    # Sale: 15 @ 200
    sale = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "SALES",
            "invoice_date": "2026-05-10",
            "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "15.0000", "unit_price": "200.0000"}],
        },
    )
    assert sale.status_code == 201, sale.text
    sale_body = sale.json()
    assert sale_body["total_cogs"] == "1600.0000"

    allocs = (
        await m3_session.execute(
            select(FifoLotAllocation)
            .join(StockMovement, FifoLotAllocation.stock_movement_id == StockMovement.id)
            .where(StockMovement.invoice_id == sale_body["id"])
            .order_by(FifoLotAllocation.id.asc())
        )
    ).scalars().all()
    assert len(allocs) == 2
    assert allocs[0].qty_allocated == Decimal("10.0000")
    assert allocs[0].unit_cost == Decimal("100.0000")
    assert allocs[0].total_cost == Decimal("1000.0000")
    assert allocs[1].qty_allocated == Decimal("5.0000")
    assert allocs[1].unit_cost == Decimal("120.0000")
    assert allocs[1].total_cost == Decimal("600.0000")

    lots = (
        await m3_client.get(
            f"/api/v1/inventory/items/{item['id']}/lots",
            params={"include_exhausted": True},
        )
    ).json()
    assert lots[0]["qty_available"] == "0.0000"
    assert lots[1]["qty_available"] == "5.0000"

    summary = (await m3_client.get("/api/v1/inventory/stock-summary")).json()
    row = next(r for r in summary["items"] if r["item_id"] == item["id"])
    assert row["closing_value"] == "600.0000"

    voucher = (await m3_client.get(f"/api/v1/vouchers/{sale_body['voucher_id']}")).json()
    by_name = {ln["ledger_name"]: ln for ln in voucher["lines"]}
    assert by_name["Cost of Goods Sold"]["debit_amount"] == "1600.0000"
    assert by_name["Stock-in-Hand"]["credit_amount"] == "1600.0000"


@pytest.mark.asyncio
async def test_weighted_average_costing(m3_client: AsyncClient) -> None:
    m = await _lookup_masters(m3_client)
    item = await _create_test_item(
        m3_client, m, sku="WAC-T8", name="WAC Brass Coupling", valuation_method="WEIGHTED_AVG"
    )
    wh_id = m["godowns"]["MAIN-WH"]["id"]

    await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-01",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "100.0000"}],
        },
    )
    await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-05",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "120.0000"}],
        },
    )
    ledger_before = (await m3_client.get(f"/api/v1/inventory/items/{item['id']}/ledger")).json()
    assert ledger_before[-1]["running_qty"] == "20.0000"
    assert ledger_before[-1]["running_avg_cost"] == "110.0000"

    sale = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "SALES",
            "invoice_date": "2026-05-10",
            "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "15.0000", "unit_price": "200.0000"}],
        },
    )
    assert sale.status_code == 201, sale.text
    sale_body = sale.json()
    assert sale_body["total_cogs"] == "1650.0000"

    ledger_after = (await m3_client.get(f"/api/v1/inventory/items/{item['id']}/ledger")).json()
    assert ledger_after[-1]["running_qty"] == "5.0000"
    assert ledger_after[-1]["running_avg_cost"] == "110.0000"

    summary = (await m3_client.get("/api/v1/inventory/stock-summary")).json()
    row = next(r for r in summary["items"] if r["item_id"] == item["id"])
    assert row["closing_value"] == "550.0000"

    voucher = (await m3_client.get(f"/api/v1/vouchers/{sale_body['voucher_id']}")).json()
    by_name = {ln["ledger_name"]: ln for ln in voucher["lines"]}
    assert by_name["Cost of Goods Sold"]["debit_amount"] == "1650.0000"
    assert by_name["Stock-in-Hand"]["credit_amount"] == "1650.0000"


@pytest.mark.asyncio
async def test_insufficient_stock_returns_422(
    m3_client: AsyncClient, m3_session: AsyncSession
) -> None:
    m = await _lookup_masters(m3_client)
    item = await _create_test_item(m3_client, m, sku="LOW-T9", name="Shortage Item")
    wh_id = m["godowns"]["MAIN-WH"]["id"]

    await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-01",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "5.0000", "unit_price": "100.0000"}],
        },
    )

    inv_count_before = len((await m3_session.execute(select(Invoice))).scalars().all())
    v_count_before = len((await m3_session.execute(select(Voucher))).scalars().all())
    mov_count_before = len((await m3_session.execute(select(StockMovement))).scalars().all())

    fail = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "SALES",
            "invoice_date": "2026-05-05",
            "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "200.0000"}],
        },
    )
    assert fail.status_code == 422
    err = fail.json()
    assert err["error_code"] == "INSUFFICIENT_STOCK"
    assert err["details"]["available_qty"] == "5.0000"
    assert err["details"]["requested_qty"] == "10.0000"

    assert len((await m3_session.execute(select(Invoice))).scalars().all()) == inv_count_before
    assert len((await m3_session.execute(select(Voucher))).scalars().all()) == v_count_before
    assert len((await m3_session.execute(select(StockMovement))).scalars().all()) == mov_count_before


@pytest.mark.asyncio
async def test_credit_note_and_debit_note_stock_adjustments(m3_client: AsyncClient) -> None:
    m = await _lookup_masters(m3_client)
    item = await _create_test_item(
        m3_client, m, sku="CNDN-T10", name="Returnable Switchgear", valuation_method="FIFO"
    )
    wh_id = m["godowns"]["MAIN-WH"]["id"]

    await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-05-01",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "100.0000"}],
        },
    )
    p2 = (
        await m3_client.post(
            "/api/v1/invoices",
            json={
                "status": "POSTED",
                "invoice_type": "PURCHASE",
                "invoice_date": "2026-05-05",
                "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
                "place_of_supply": "09",
                "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "120.0000"}],
            },
        )
    ).json()
    sale = (
        await m3_client.post(
            "/api/v1/invoices",
            json={
                "status": "POSTED",
                "invoice_type": "SALES",
                "invoice_date": "2026-05-10",
                "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
                "place_of_supply": "09",
                "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "15.0000", "unit_price": "200.0000"}],
            },
        )
    ).json()

    # (a) Credit Note returning 2 units against Sale (original unit_cost = 1600/15 = 106.6667)
    cn = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "CREDIT_NOTE",
            "invoice_date": "2026-05-12",
            "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
            "place_of_supply": "09",
            "original_invoice_id": sale["id"],
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "2.0000", "unit_price": "200.0000"}],
        },
    )
    assert cn.status_code == 201, cn.text
    cn_body = cn.json()
    assert cn_body["total_cogs"] == "213.3334"

    lots_after_cn = (
        await m3_client.get(
            f"/api/v1/inventory/items/{item['id']}/lots",
            params={"include_exhausted": True},
        )
    ).json()
    ret_lot = next(l for l in lots_after_cn if l["source_invoice_id"] == cn_body["id"])
    assert ret_lot["unit_cost"] == "106.6667"
    assert ret_lot["qty_available"] == "2.0000"

    cn_voucher = (await m3_client.get(f"/api/v1/vouchers/{cn_body['voucher_id']}")).json()
    cn_by_name = {ln["ledger_name"]: ln for ln in cn_voucher["lines"]}
    assert cn_by_name["Sales Returns"]["debit_amount"] == "400.0000"
    assert cn_by_name["Output CGST"]["debit_amount"] == "36.0000"
    assert cn_by_name["Output SGST"]["debit_amount"] == "36.0000"
    assert cn_by_name["Stock-in-Hand"]["debit_amount"] == "213.3334"
    assert cn_by_name["Cost of Goods Sold"]["credit_amount"] == "213.3334"

    # (b) Debit Note returning 2 units against Purchase #2 (120.0000)
    dn = await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "DEBIT_NOTE",
            "invoice_date": "2026-05-14",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "original_invoice_id": p2["id"],
            "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "2.0000", "unit_price": "120.0000"}],
        },
    )
    assert dn.status_code == 201, dn.text
    dn_body = dn.json()

    lots_after_dn = (
        await m3_client.get(
            f"/api/v1/inventory/items/{item['id']}/lots",
            params={"include_exhausted": True},
        )
    ).json()
    lot_p2 = next(l for l in lots_after_dn if l["source_invoice_id"] == p2["id"])
    assert lot_p2["qty_available"] == "3.0000"

    dn_voucher = (await m3_client.get(f"/api/v1/vouchers/{dn_body['voucher_id']}")).json()
    dn_by_name = {ln["ledger_name"]: ln for ln in dn_voucher["lines"]}
    assert dn_by_name["Stock-in-Hand"]["credit_amount"] == "240.0000"
    assert dn_by_name["Input CGST"]["credit_amount"] == "21.6000"
    assert dn_by_name["Input SGST"]["credit_amount"] == "21.6000"


@pytest.mark.asyncio
async def test_cancel_sales_restores_lots_and_consumed_purchase_returns_409(
    m3_client: AsyncClient, m3_session: AsyncSession
) -> None:
    m = await _lookup_masters(m3_client)
    item = await _create_test_item(
        m3_client, m, sku="CAN-T11", name="Cancellable Copper Coil", valuation_method="FIFO"
    )
    wh_id = m["godowns"]["MAIN-WH"]["id"]

    p1 = (
        await m3_client.post(
            "/api/v1/invoices",
            json={
                "status": "POSTED",
                "invoice_type": "PURCHASE",
                "invoice_date": "2026-05-01",
                "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
                "place_of_supply": "09",
                "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "100.0000"}],
            },
        )
    ).json()
    p2 = (
        await m3_client.post(
            "/api/v1/invoices",
            json={
                "status": "POSTED",
                "invoice_type": "PURCHASE",
                "invoice_date": "2026-05-05",
                "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
                "place_of_supply": "09",
                "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "120.0000"}],
            },
        )
    ).json()
    sale = (
        await m3_client.post(
            "/api/v1/invoices",
            json={
                "status": "POSTED",
                "invoice_type": "SALES",
                "invoice_date": "2026-05-10",
                "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
                "place_of_supply": "09",
                "lines": [{"item_id": item["id"], "godown_id": wh_id, "quantity": "15.0000", "unit_price": "200.0000"}],
            },
        )
    ).json()

    # (a) Cancel consumed Purchase #1 -> 409 LOT_ALREADY_CONSUMED
    conflict = await m3_client.post(
        f"/api/v1/invoices/{p1['id']}/cancel",
        json={"reason": "Wrong vendor invoice"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["error_code"] == "LOT_ALREADY_CONSUMED"
    p1_check = (await m3_client.get(f"/api/v1/invoices/{p1['id']}")).json()
    assert p1_check["status"] == "POSTED"

    # (b) Cancel Sale -> 200, restores Lot 1 & Lot 2, reverses allocations
    cancel_sale = await m3_client.post(
        f"/api/v1/invoices/{sale['id']}/cancel",
        json={"reason": "Order cancelled by customer"},
    )
    assert cancel_sale.status_code == 200, cancel_sale.text
    assert cancel_sale.json()["status"] == "CANCELLED"
    sale_voucher = (await m3_client.get(f"/api/v1/vouchers/{sale['voucher_id']}")).json()
    assert sale_voucher["status"] == "CANCELLED"

    lots_restored = (
        await m3_client.get(
            f"/api/v1/inventory/items/{item['id']}/lots",
            params={"include_exhausted": True},
        )
    ).json()
    lot_p1 = next(l for l in lots_restored if l["source_invoice_id"] == p1["id"])
    lot_p2 = next(l for l in lots_restored if l["source_invoice_id"] == p2["id"])
    assert lot_p1["qty_available"] == "10.0000"
    assert lot_p2["qty_available"] == "10.0000"

    allocs = (
        await m3_session.execute(
            select(FifoLotAllocation)
            .join(StockMovement, FifoLotAllocation.stock_movement_id == StockMovement.id)
            .where(StockMovement.invoice_id == sale["id"])
        )
    ).scalars().all()
    assert len(allocs) == 2
    assert all(a.is_reversed for a in allocs)

    # (c) Retry cancelling Purchase #1 -> 200, Lot 1 qty_available == 0.0000
    cancel_p1 = await m3_client.post(
        f"/api/v1/invoices/{p1['id']}/cancel",
        json={"reason": "Now safe to cancel"},
    )
    assert cancel_p1.status_code == 200, cancel_p1.text
    assert cancel_p1.json()["status"] == "CANCELLED"
    lots_after_p1 = (
        await m3_client.get(
            f"/api/v1/inventory/items/{item['id']}/lots",
            params={"include_exhausted": True},
        )
    ).json()
    lot_p1_after = next(l for l in lots_after_p1 if l["source_invoice_id"] == p1["id"])
    assert lot_p1_after["qty_available"] == "0.0000"


@pytest.mark.asyncio
async def test_indian_amount_in_words() -> None:
    assert amount_to_indian_words(Decimal("0.00")) == "Zero Rupees Only"
    assert amount_to_indian_words(Decimal("1000.00")) == "Rupees One Thousand Only"
    assert (
        amount_to_indian_words(Decimal("123456.78"))
        == "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only"
    )
    assert (
        amount_to_indian_words(Decimal("10000000.50"))
        == "Rupees One Crore and Fifty Paise Only"
    )
    assert (
        amount_to_indian_words(Decimal("1050000000.00"))
        == "Rupees One Hundred Five Crore Only"
    )


@pytest.mark.asyncio
async def test_full_trial_balance_and_balance_sheet_tie_out(
    m3_client: AsyncClient, m3_session: AsyncSession
) -> None:
    # Verify idempotent re-run of M3 seed produces zero duplicates
    rerun = await seed_dummy_company(m3_session, include_milestone3=True)
    assert rerun["m3_ledgers_created"] == 0
    assert rerun["slabs_created"] == 0
    assert rerun["hsn_sac_created"] == 0
    assert rerun["units_created"] == 0
    assert rerun["godowns_created"] == 0
    assert rerun["items_created"] == 0
    assert rerun["invoices_created"] == 0

    m = await _lookup_masters(m3_client)
    wh_id = m["godowns"]["MAIN-WH"]["id"]

    # Normal Purchase + RCM Service Purchase
    p_norm = (
        await m3_client.post(
            "/api/v1/invoices",
            json={
                "status": "POSTED",
                "invoice_type": "PURCHASE",
                "invoice_date": "2026-06-01",
                "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
                "place_of_supply": "09",
                "lines": [
                    {"item_id": m["items"]["CWC-25"]["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "1100.0000"},
                    {"item_id": m["items"]["BRV-15"]["id"], "godown_id": wh_id, "quantity": "10.0000", "unit_price": "440.0000"},
                ],
            },
        )
    ).json()
    await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "PURCHASE",
            "invoice_date": "2026-06-02",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "is_rcm": True,
            "lines": [
                {"item_id": m["items"]["SRV-INST"]["id"], "quantity": "1.0000", "unit_price": "4000.0000"},
            ],
        },
    )

    # Intra-state Sale (FIFO + Service) and Inter-state Sale (WAC)
    s_intra = (
        await m3_client.post(
            "/api/v1/invoices",
            json={
                "status": "POSTED",
                "invoice_type": "SALES",
                "invoice_date": "2026-06-05",
                "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
                "place_of_supply": "09",
                "lines": [
                    {"item_id": m["items"]["CWC-25"]["id"], "godown_id": wh_id, "quantity": "8.0000", "unit_price": "1500.0000"},
                    {"item_id": m["items"]["SRV-INST"]["id"], "quantity": "1.0000", "unit_price": "5000.0000"},
                ],
            },
        )
    ).json()
    s_cancel = (
        await m3_client.post(
            "/api/v1/invoices",
            json={
                "status": "POSTED",
                "invoice_type": "SALES",
                "invoice_date": "2026-06-06",
                "party_ledger_id": m["ledgers"]["Deccan Infra Projects Mumbai"]["id"],
                "place_of_supply": "27",
                "lines": [
                    {"item_id": m["items"]["BRV-15"]["id"], "godown_id": wh_id, "quantity": "4.0000", "unit_price": "660.0000"},
                ],
            },
        )
    ).json()

    # Credit Note, Debit Note, and Cancellation
    await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "CREDIT_NOTE",
            "invoice_date": "2026-06-08",
            "party_ledger_id": m["ledgers"]["Apex Electricals Noida"]["id"],
            "place_of_supply": "09",
            "original_invoice_id": s_intra["id"],
            "lines": [
                {"item_id": m["items"]["CWC-25"]["id"], "godown_id": wh_id, "quantity": "2.0000", "unit_price": "1500.0000"},
            ],
        },
    )
    await m3_client.post(
        "/api/v1/invoices",
        json={
            "status": "POSTED",
            "invoice_type": "DEBIT_NOTE",
            "invoice_date": "2026-06-10",
            "party_ledger_id": m["ledgers"]["Sharda Metals & Cables"]["id"],
            "place_of_supply": "09",
            "original_invoice_id": p_norm["id"],
            "lines": [
                {"item_id": m["items"]["CWC-25"]["id"], "godown_id": wh_id, "quantity": "2.0000", "unit_price": "1100.0000"},
            ],
        },
    )
    cancel_res = await m3_client.post(
        f"/api/v1/invoices/{s_cancel['id']}/cancel",
        json={"reason": "Customer cancelled inter-state order"},
    )
    assert cancel_res.status_code == 200

    tb = (await m3_client.get("/api/v1/reports/trial-balance")).json()
    assert tb["is_balanced"] is True
    assert tb["difference"] == "0.0000"
    assert tb["total_debit"] == tb["total_credit"]

    bs = (await m3_client.get("/api/v1/reports/balance-sheet")).json()
    assert bs["is_balanced"] is True
    assert bs["difference"] == "0.0000"
    assert bs["total_assets"] == bs["total_liabilities_and_equity"]

    stock_summary = (await m3_client.get("/api/v1/inventory/stock-summary")).json()
    ledgers_after = {l["name"]: l for l in (await m3_client.get("/api/v1/ledgers")).json()}
    stock_ledger = ledgers_after["Stock-in-Hand"]
    assert stock_ledger["closing_dr_cr"] == "DR"
    assert stock_ledger["closing_balance"] == stock_summary["grand_total_value"]
