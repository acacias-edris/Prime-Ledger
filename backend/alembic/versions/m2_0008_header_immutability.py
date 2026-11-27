"""M2 header immutability & delete-protection triggers for SQLite and PostgreSQL.

Revision ID: m2_0008_header_immutability
Revises: m2_0007_integrity
"""

from __future__ import annotations

from alembic import op

revision = "m2_0008_header_immutability"
down_revision = "m2_0007_integrity"
branch_labels = None
depends_on = None

SQLITE_HEADER_TRIGGERS = [
    """CREATE TRIGGER trg_vouchers_no_delete_posted BEFORE DELETE ON vouchers
       WHEN OLD.status IN ('POSTED', 'CANCELLED')
       BEGIN SELECT RAISE(ABORT, 'Cannot delete POSTED or CANCELLED voucher'); END""",
    """CREATE TRIGGER trg_vouchers_cancelled_immutable BEFORE UPDATE ON vouchers
       WHEN OLD.status = 'CANCELLED'
       BEGIN SELECT RAISE(ABORT, 'CANCELLED voucher is immutable'); END""",
    """CREATE TRIGGER trg_vouchers_posted_header_immutable BEFORE UPDATE ON vouchers
       WHEN OLD.status = 'POSTED' AND (
         NEW.status <> 'CANCELLED'
         OR NEW.company_id <> OLD.company_id
         OR NEW.fiscal_year_id <> OLD.fiscal_year_id
         OR NEW.voucher_number <> OLD.voucher_number
         OR NEW.voucher_type <> OLD.voucher_type
         OR NEW.voucher_date <> OLD.voucher_date
         OR COALESCE(NEW.reversed_voucher_id, -1) <> COALESCE(OLD.reversed_voucher_id, -1)
       )
       BEGIN SELECT RAISE(ABORT, 'POSTED voucher header is immutable except status->CANCELLED'); END""",
]

PG_HEADER_SQL = [
    """CREATE OR REPLACE FUNCTION lp_vouchers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE n int; dr numeric(18,4); cr numeric(18,4);
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'POSTED' THEN
          RAISE EXCEPTION 'ck_vouchers_posted_balanced: insert as DRAFT then post'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END IF;
      IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('POSTED', 'CANCELLED') THEN
          RAISE EXCEPTION 'Cannot delete POSTED or CANCELLED voucher'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'CANCELLED voucher is immutable'
          USING ERRCODE = 'check_violation';
      END IF;
      IF OLD.status = 'POSTED' THEN
        IF NEW.status <> 'CANCELLED'
           OR NEW.company_id <> OLD.company_id
           OR NEW.fiscal_year_id <> OLD.fiscal_year_id
           OR NEW.voucher_number <> OLD.voucher_number
           OR NEW.voucher_type <> OLD.voucher_type
           OR NEW.voucher_date <> OLD.voucher_date
           OR NEW.reversed_voucher_id IS DISTINCT FROM OLD.reversed_voucher_id THEN
          RAISE EXCEPTION 'POSTED voucher header is immutable except status->CANCELLED'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
      IF NEW.status = 'POSTED' AND OLD.status <> 'POSTED' THEN
        SELECT COUNT(*), COALESCE(SUM(debit_amount),0), COALESCE(SUM(credit_amount),0)
          INTO n, dr, cr FROM voucher_lines WHERE voucher_id = NEW.id;
        IF n < 2 OR dr <= 0 OR dr <> cr THEN
          RAISE EXCEPTION 'ck_vouchers_posted_balanced: SUM(Dr)=% SUM(Cr)=%', dr, cr
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
      RETURN NEW;
    END $$""",
    "DROP TRIGGER IF EXISTS trg_vouchers_guard ON vouchers",
    """CREATE TRIGGER trg_vouchers_guard BEFORE INSERT OR UPDATE OR DELETE ON vouchers
       FOR EACH ROW EXECUTE FUNCTION lp_vouchers_guard()""",
]


def upgrade() -> None:
    bind = op.get_bind()
    stmts = SQLITE_HEADER_TRIGGERS if bind.dialect.name == "sqlite" else PG_HEADER_SQL
    for stmt in stmts:
        op.execute(stmt)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        for name in (
            "trg_vouchers_no_delete_posted",
            "trg_vouchers_cancelled_immutable",
            "trg_vouchers_posted_header_immutable",
        ):
            op.execute(f"DROP TRIGGER IF EXISTS {name}")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_vouchers_guard ON vouchers")
        op.execute(
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
            END $$"""
        )
        op.execute(
            """CREATE TRIGGER trg_vouchers_guard BEFORE INSERT OR UPDATE OF status ON vouchers
               FOR EACH ROW EXECUTE FUNCTION lp_vouchers_guard()"""
        )
