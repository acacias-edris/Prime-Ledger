"""M2 integrity hardening: gapless voucher sequences, DB-level balance + immutability guards.

Revision ID: m2_0007_integrity
Revises: e0a66c115a4a

Verified in review on SQLite 3.40 (raw sqlite3): direct POSTED insert blocked, unbalanced
post blocked, balanced post allowed, UPDATE/DELETE of posted lines blocked, CANCEL allowed.
"""

from __future__ import annotations

import re

import sqlalchemy as sa
from alembic import op

revision = "m2_0007_integrity"
down_revision = "e0a66c115a4a"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# SQLite triggers (no deferred constraints -> two-phase post DRAFT -> POSTED)
# ---------------------------------------------------------------------------
_BAL = """(
  (SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = NEW.id) < 2 OR
  (SELECT COALESCE(SUM(debit_amount),0) FROM voucher_lines WHERE voucher_id = NEW.id) <= 0 OR
  (SELECT COALESCE(SUM(debit_amount),0) FROM voucher_lines WHERE voucher_id = NEW.id) <>
  (SELECT COALESCE(SUM(credit_amount),0) FROM voucher_lines WHERE voucher_id = NEW.id))"""

SQLITE_TRIGGERS = [
    """CREATE TRIGGER trg_vouchers_no_direct_posted BEFORE INSERT ON vouchers
       WHEN NEW.status = 'POSTED'
       BEGIN SELECT RAISE(ABORT, 'ck_vouchers_posted_balanced: insert as DRAFT then post'); END""",
    f"""CREATE TRIGGER trg_vouchers_post_balanced BEFORE UPDATE OF status ON vouchers
       WHEN NEW.status = 'POSTED' AND OLD.status <> 'POSTED' AND {_BAL}
       BEGIN SELECT RAISE(ABORT, 'ck_vouchers_posted_balanced: SUM(Dr) <> SUM(Cr)'); END""",
    """CREATE TRIGGER trg_vouchers_no_unpost BEFORE UPDATE OF status ON vouchers
       WHEN OLD.status = 'POSTED' AND NEW.status NOT IN ('POSTED','CANCELLED')
       BEGIN SELECT RAISE(ABORT, 'posted voucher may only move to CANCELLED'); END""",
] + [
    f"""CREATE TRIGGER trg_voucher_lines_immutable_{ev.lower()} BEFORE {ev} ON voucher_lines
        WHEN (SELECT status FROM vouchers WHERE id = {ref}.voucher_id) IN ('POSTED','CANCELLED')
        BEGIN SELECT RAISE(ABORT, 'voucher_lines immutable once posted'); END"""
    for ev, ref in (("INSERT", "NEW"), ("UPDATE", "OLD"), ("DELETE", "OLD"))
]

# ---------------------------------------------------------------------------
# PostgreSQL equivalents (same semantics; SQLSTATE 23514 -> IntegrityError)
# ---------------------------------------------------------------------------
PG_SQL = [
    """CREATE OR REPLACE FUNCTION lp_vouchers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE n int; dr numeric(18,4); cr numeric(18,4);
    BEGIN
      IF TG_OP = 'INSERT' AND NEW.status = 'POSTED' THEN
        RAISE EXCEPTION 'ck_vouchers_posted_balanced: insert as DRAFT then post' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' AND NEW.status NOT IN ('POSTED','CANCELLED') THEN
        RAISE EXCEPTION 'posted voucher may only move to CANCELLED' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.status = 'POSTED' AND OLD.status <> 'POSTED' THEN
        SELECT COUNT(*), COALESCE(SUM(debit_amount),0), COALESCE(SUM(credit_amount),0)
          INTO n, dr, cr FROM voucher_lines WHERE voucher_id = NEW.id;
        IF n < 2 OR dr <= 0 OR dr <> cr THEN
          RAISE EXCEPTION 'ck_vouchers_posted_balanced: SUM(Dr)=% SUM(Cr)=%', dr, cr USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END $$""",
    """CREATE TRIGGER trg_vouchers_guard BEFORE INSERT OR UPDATE OF status ON vouchers
       FOR EACH ROW EXECUTE FUNCTION lp_vouchers_guard()""",
    """CREATE OR REPLACE FUNCTION lp_voucher_lines_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE vid bigint := COALESCE(NEW.voucher_id, OLD.voucher_id); st text;
    BEGIN
      SELECT status INTO st FROM vouchers WHERE id = vid FOR SHARE;
      IF st IN ('POSTED','CANCELLED') THEN
        RAISE EXCEPTION 'voucher_lines immutable once posted' USING ERRCODE = '23514';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END $$""",
    """CREATE TRIGGER trg_voucher_lines_immutable BEFORE INSERT OR UPDATE OR DELETE ON voucher_lines
       FOR EACH ROW EXECUTE FUNCTION lp_voucher_lines_immutable()""",
]


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    op.create_table(
        "voucher_sequences",
        sa.Column("company_id", sa.BigInteger(), sa.ForeignKey("companies.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("fiscal_year_id", sa.BigInteger(), sa.ForeignKey("fiscal_years.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("voucher_type", sa.String(24), primary_key=True),
        sa.Column("last_value", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("last_value >= 1", name="last_value_positive"),
    )

    # Backfill counters from existing auto-numbered vouchers (ASCII digits only).
    rows = bind.execute(
        sa.text("SELECT company_id, fiscal_year_id, voucher_type, voucher_number FROM vouchers")
    ).all()
    best: dict[tuple[int, int, str], int] = {}
    pat = re.compile(r"^[A-Z]+/\d{2}-\d{2}/([0-9]+)$")
    for cid, fyid, vtype, vno in rows:
        m = pat.match(vno or "")
        if m:
            k = (cid, fyid, vtype)
            best[k] = max(best.get(k, 0), int(m.group(1)))
    if best:
        op.bulk_insert(
            sa.table("voucher_sequences", sa.column("company_id"), sa.column("fiscal_year_id"),
                     sa.column("voucher_type"), sa.column("last_value")),
            [{"company_id": c, "fiscal_year_id": f, "voucher_type": t, "last_value": v}
             for (c, f, t), v in best.items()],
        )

    # One POSTED reversal per original (closes the concurrent double-reversal race at DB level).
    op.create_index(
        "uq_vouchers_one_posted_reversal", "vouchers", ["company_id", "reversed_voucher_id"], unique=True,
        sqlite_where=sa.text("status = 'POSTED' AND reversed_voucher_id IS NOT NULL"),
        postgresql_where=sa.text("status = 'POSTED' AND reversed_voucher_id IS NOT NULL"),
    )

    with op.batch_alter_table("ledgers") as b:
        b.create_check_constraint("opening_balance_non_negative", "opening_balance >= 0")

    for stmt in (SQLITE_TRIGGERS if dialect == "sqlite" else PG_SQL):
        op.execute(stmt)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        for name in ("trg_vouchers_no_direct_posted", "trg_vouchers_post_balanced", "trg_vouchers_no_unpost",
                     "trg_voucher_lines_immutable_insert", "trg_voucher_lines_immutable_update",
                     "trg_voucher_lines_immutable_delete"):
            op.execute(f"DROP TRIGGER IF EXISTS {name}")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_vouchers_guard ON vouchers")
        op.execute("DROP TRIGGER IF EXISTS trg_voucher_lines_immutable ON voucher_lines")
        op.execute("DROP FUNCTION IF EXISTS lp_vouchers_guard()")
        op.execute("DROP FUNCTION IF EXISTS lp_voucher_lines_immutable()")
    with op.batch_alter_table("ledgers") as b:
        b.drop_constraint("ck_ledgers_opening_balance_non_negative", type_="check")
    op.drop_index("uq_vouchers_one_posted_reversal", table_name="vouchers")
    op.drop_table("voucher_sequences")
