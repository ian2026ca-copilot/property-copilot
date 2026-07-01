"""payment status and type enhancements

Revision ID: j0e1f2g3h4i5
Revises: i9d0e1f2g3h4
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "j0e1f2g3h4i5"
down_revision = "i9d0e1f2g3h4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Phase 1: add enum values — must be in their own transaction
    op.execute("COMMIT")
    op.execute("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'PENDING'")
    op.execute("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'OVERDUE'")
    op.execute("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'VOIDED'")
    op.execute("ALTER TYPE paymenttype ADD VALUE IF NOT EXISTS 'MAINTENANCE_CHARGE'")
    op.execute("ALTER TYPE paymenttype ADD VALUE IF NOT EXISTS 'SECURITY_DEPOSIT'")
    op.execute("BEGIN")

    # Phase 2: data migration + new column
    op.add_column("payments", sa.Column("tenant_user_id", UUID(as_uuid=True), nullable=True))
    op.execute("""
        UPDATE payments p
        SET tenant_user_id = l.tenant_user_id
        FROM leases l
        WHERE p.lease_id = l.id
    """)
    op.execute("UPDATE payments SET status = 'PENDING' WHERE status = 'DUE'")


def downgrade() -> None:
    op.drop_column("payments", "tenant_user_id")
