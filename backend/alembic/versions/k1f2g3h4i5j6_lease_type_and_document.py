"""lease type and document path

Revision ID: k1f2g3h4i5j6
Revises: j0e1f2g3h4i5
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "k1f2g3h4i5j6"
down_revision = "j0e1f2g3h4i5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add lease_type enum outside transaction (IF NOT EXISTS not valid for CREATE TYPE)
    op.execute("COMMIT")
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leasetype') THEN
                CREATE TYPE leasetype AS ENUM ('FIXED', 'MONTH_TO_MONTH');
            END IF;
        END $$;
    """)
    op.execute("BEGIN")

    op.add_column("leases", sa.Column(
        "lease_type",
        sa.Enum("FIXED", "MONTH_TO_MONTH", name="leasetype"),
        nullable=False,
        server_default="FIXED",
    ))
    op.add_column("leases", sa.Column("document_path", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("leases", "document_path")
    op.drop_column("leases", "lease_type")
    op.execute("DROP TYPE IF EXISTS leasetype")
