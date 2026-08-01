"""tenant screening redesign for canada: drop ssn_sin, add application
status/interested unit tracking, org-level screening toggles

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c6d7e8f9a0b1"
down_revision = "b5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("tenant_profiles", "ssn_sin")
    op.add_column("tenant_profiles", sa.Column("application_status", sa.String(30), nullable=False, server_default="NOT_STARTED"))
    op.add_column("tenant_profiles", sa.Column("interested_unit_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_tenant_profiles_interested_unit_id_units",
        "tenant_profiles", "units",
        ["interested_unit_id"], ["id"],
        ondelete="SET NULL",
    )

    op.add_column("organizations", sa.Column("screening_criminal_record_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("organizations", sa.Column("screening_rental_history_enabled", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("organizations", "screening_rental_history_enabled")
    op.drop_column("organizations", "screening_criminal_record_enabled")

    op.drop_constraint("fk_tenant_profiles_interested_unit_id_units", "tenant_profiles", type_="foreignkey")
    op.drop_column("tenant_profiles", "interested_unit_id")
    op.drop_column("tenant_profiles", "application_status")
    op.add_column("tenant_profiles", sa.Column("ssn_sin", sa.String(50), nullable=True))
