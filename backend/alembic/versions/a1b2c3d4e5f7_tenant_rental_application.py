"""tenant rental application fields and tables

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a1b2c3d4e5f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_profiles", sa.Column("middle_name", sa.String(150), nullable=True))
    op.add_column("tenant_profiles", sa.Column("ssn_sin", sa.String(50), nullable=True))
    op.add_column("tenant_profiles", sa.Column("drivers_licence", sa.String(50), nullable=True))
    op.add_column("tenant_profiles", sa.Column("personal_income_annual", sa.Float, nullable=True))
    op.add_column("tenant_profiles", sa.Column("household_income_annual", sa.Float, nullable=True))
    op.add_column("tenant_profiles", sa.Column("personal_message", sa.Text, nullable=True))
    op.add_column("tenant_profiles", sa.Column("smoke_vape", sa.Boolean, nullable=True))
    op.add_column("tenant_profiles", sa.Column("given_notice_to_landlord", sa.Boolean, nullable=True))
    op.add_column("tenant_profiles", sa.Column("refused_rent", sa.Boolean, nullable=True))
    op.add_column("tenant_profiles", sa.Column("evicted", sa.Boolean, nullable=True))
    op.add_column("tenant_profiles", sa.Column("criminal_record", sa.Boolean, nullable=True))
    op.add_column("tenant_profiles", sa.Column("screening_notes", sa.Text, nullable=True))

    op.create_table(
        "tenant_address_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("is_current", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("residential_status", sa.String(50), nullable=True),
        sa.Column("street_address", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("province", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("move_in_date", sa.Date, nullable=True),
        sa.Column("move_out_date", sa.Date, nullable=True),
        sa.Column("monthly_rent", sa.Float, nullable=True),
        sa.Column("reason_for_moving", sa.String(255), nullable=True),
        sa.Column("landlord_name", sa.String(255), nullable=True),
        sa.Column("landlord_phone", sa.String(30), nullable=True),
        sa.Column("landlord_email", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "tenant_employment",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("is_current", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("employment_type", sa.String(50), nullable=True),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("position", sa.String(255), nullable=True),
        sa.Column("employment_length", sa.String(100), nullable=True),
        sa.Column("company_website", sa.String(255), nullable=True),
        sa.Column("company_linkedin_url", sa.String(255), nullable=True),
        sa.Column("additional_notes", sa.Text, nullable=True),
        sa.Column("employer_reference_name", sa.String(255), nullable=True),
        sa.Column("employer_reference_phone", sa.String(30), nullable=True),
        sa.Column("employer_reference_email", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "tenant_income_sources",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("source_name", sa.String(255), nullable=False),
        sa.Column("amount_annual", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "tenant_occupants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("relationship_label", sa.String(100), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("share_of_rent", sa.Float, nullable=True),
        sa.Column("is_dependent", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "tenant_cosigners",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("relationship_label", sa.String(100), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "tenant_pets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("animal_type", sa.String(100), nullable=False),
        sa.Column("breed", sa.String(100), nullable=True),
        sa.Column("weight_lbs", sa.Float, nullable=True),
        sa.Column("sex", sa.String(10), nullable=True),
        sa.Column("age", sa.Integer, nullable=True),
        sa.Column("is_fixed", sa.Boolean, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "tenant_vehicles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("make", sa.String(100), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("year", sa.Integer, nullable=True),
        sa.Column("license_plate", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("tenant_vehicles")
    op.drop_table("tenant_pets")
    op.drop_table("tenant_cosigners")
    op.drop_table("tenant_occupants")
    op.drop_table("tenant_income_sources")
    op.drop_table("tenant_employment")
    op.drop_table("tenant_address_history")

    op.drop_column("tenant_profiles", "screening_notes")
    op.drop_column("tenant_profiles", "criminal_record")
    op.drop_column("tenant_profiles", "evicted")
    op.drop_column("tenant_profiles", "refused_rent")
    op.drop_column("tenant_profiles", "given_notice_to_landlord")
    op.drop_column("tenant_profiles", "smoke_vape")
    op.drop_column("tenant_profiles", "personal_message")
    op.drop_column("tenant_profiles", "household_income_annual")
    op.drop_column("tenant_profiles", "personal_income_annual")
    op.drop_column("tenant_profiles", "drivers_licence")
    op.drop_column("tenant_profiles", "ssn_sin")
    op.drop_column("tenant_profiles", "middle_name")
