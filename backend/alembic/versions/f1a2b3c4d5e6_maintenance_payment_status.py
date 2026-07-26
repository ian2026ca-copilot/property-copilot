"""add payment_status to maintenance_requests

Revision ID: f1a2b3c4d5e6
Revises: e9f0a1b2c3d4
Create Date: 2026-07-25
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "e9f0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_payment_status') THEN
                CREATE TYPE maintenance_payment_status AS ENUM ('UNPAID', 'PAID');
            END IF;
        END $$;
    """)
    op.execute("BEGIN")

    op.add_column("maintenance_requests", sa.Column(
        "payment_status",
        sa.Enum("UNPAID", "PAID", name="maintenance_payment_status"),
        nullable=False,
        server_default="UNPAID",
    ))


def downgrade() -> None:
    op.drop_column("maintenance_requests", "payment_status")
    op.execute("DROP TYPE IF EXISTS maintenance_payment_status")
