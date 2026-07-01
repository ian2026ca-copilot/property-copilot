"""maintenance vendor system

Revision ID: m3h4i5j6k7l8
Revises: l2g3h4i5j6k7
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "m3h4i5j6k7l8"
down_revision = "l2g3h4i5j6k7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add VENDOR to userrole enum ───────────────────────────────────────
    op.execute("COMMIT")
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'VENDOR'
                  AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'userrole')
            ) THEN
                ALTER TYPE userrole ADD VALUE 'VENDOR';
            END IF;
        END $$;
    """)
    op.execute("BEGIN")

    # ── 2. New maintenancestatus enum ────────────────────────────────────────
    op.execute("COMMIT")
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenancestatus_new') THEN
                CREATE TYPE maintenancestatus_new AS ENUM (
                    'SUBMITTED','UNDER_REVIEW','SCHEDULED','IN_PROGRESS','COMPLETED','CLOSED'
                );
            END IF;
        END $$;
    """)
    op.execute("BEGIN")

    # Migrate existing status column
    op.execute("""
        ALTER TABLE maintenance_requests
            ALTER COLUMN status DROP DEFAULT,
            ALTER COLUMN status TYPE maintenancestatus_new
                USING CASE status::text
                    WHEN 'OPEN'        THEN 'SUBMITTED'::maintenancestatus_new
                    WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::maintenancestatus_new
                    WHEN 'RESOLVED'    THEN 'COMPLETED'::maintenancestatus_new
                    WHEN 'CLOSED'      THEN 'CLOSED'::maintenancestatus_new
                    ELSE 'SUBMITTED'::maintenancestatus_new
                END,
            ALTER COLUMN status SET DEFAULT 'SUBMITTED'::maintenancestatus_new;
    """)

    op.execute("COMMIT")
    op.execute("DROP TYPE IF EXISTS maintenancestatus;")
    op.execute("ALTER TYPE maintenancestatus_new RENAME TO maintenancestatus;")
    op.execute("BEGIN")

    # ── 3. Add new columns to maintenance_requests ───────────────────────────
    op.add_column("maintenance_requests", sa.Column("preferred_time_start", sa.DateTime(timezone=True), nullable=True))
    op.add_column("maintenance_requests", sa.Column("preferred_time_end",   sa.DateTime(timezone=True), nullable=True))
    op.add_column("maintenance_requests", sa.Column("est_hours_min",  sa.Float, nullable=True))
    op.add_column("maintenance_requests", sa.Column("est_hours_max",  sa.Float, nullable=True))
    op.add_column("maintenance_requests", sa.Column("est_cost_min",   sa.Float, nullable=True))
    op.add_column("maintenance_requests", sa.Column("est_cost_max",   sa.Float, nullable=True))
    op.add_column("maintenance_requests", sa.Column("scheduled_start", sa.DateTime(timezone=True), nullable=True))
    op.add_column("maintenance_requests", sa.Column("scheduled_end",   sa.DateTime(timezone=True), nullable=True))
    op.add_column("maintenance_requests", sa.Column("vendor_id",       UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("maintenance_requests", sa.Column("resolution_notes", sa.Text, nullable=True))

    # ── 4. maintenance_attachments table ─────────────────────────────────────
    op.create_table(
        "maintenance_attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", UUID(as_uuid=True), sa.ForeignKey("maintenance_requests.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("filename",      sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("created_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── 5. vendors table ──────────────────────────────────────────────────────
    op.create_table(
        "vendors",
        sa.Column("id",            UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",       UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("business_name", sa.String(255), nullable=False),
        sa.Column("service_categories", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("created_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── 6. vendor_organization join ───────────────────────────────────────────
    op.create_table(
        "vendor_organizations",
        sa.Column("id",              UUID(as_uuid=True), primary_key=True),
        sa.Column("vendor_id",       UUID(as_uuid=True), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
    )

    # ── 7. vendor_availability table ─────────────────────────────────────────
    op.create_table(
        "vendor_availability",
        sa.Column("id",         UUID(as_uuid=True), primary_key=True),
        sa.Column("vendor_id",  UUID(as_uuid=True), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("date",       sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time",   sa.Time, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("vendor_availability")
    op.drop_table("vendor_organizations")
    op.drop_table("vendors")
    op.drop_table("maintenance_attachments")
    op.drop_column("maintenance_requests", "resolution_notes")
    op.drop_column("maintenance_requests", "vendor_id")
    op.drop_column("maintenance_requests", "scheduled_end")
    op.drop_column("maintenance_requests", "scheduled_start")
    op.drop_column("maintenance_requests", "est_cost_max")
    op.drop_column("maintenance_requests", "est_cost_min")
    op.drop_column("maintenance_requests", "est_hours_max")
    op.drop_column("maintenance_requests", "est_hours_min")
    op.drop_column("maintenance_requests", "preferred_time_end")
    op.drop_column("maintenance_requests", "preferred_time_start")
