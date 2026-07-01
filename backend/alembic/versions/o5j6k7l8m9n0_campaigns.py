"""campaigns table

Revision ID: o5j6k7l8m9n0
Revises: n4i5j6k7l8m9
Create Date: 2026-06-20
"""
from alembic import op

revision = "o5j6k7l8m9n0"
down_revision = "n4i5j6k7l8m9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum outside a transaction (required by PostgreSQL)
    op.execute("COMMIT")
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaignstatus') THEN
                CREATE TYPE campaignstatus AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
            END IF;
        END $$;
    """)
    op.execute("BEGIN")

    # Create campaigns table using raw SQL so SQLAlchemy doesn't try to re-create the enum
    op.execute("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            contact_name VARCHAR(255),
            contact_phone VARCHAR(50),
            contact_email VARCHAR(255),
            available_from DATE,
            monthly_rent FLOAT,
            status campaignstatus NOT NULL DEFAULT 'DRAFT',
            photos JSONB NOT NULL DEFAULT '[]',
            fb_post_id VARCHAR(255),
            fb_posted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_campaigns_organization_id ON campaigns(organization_id)")

    # Add FB credentials to organizations
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS fb_page_token TEXT")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS fb_page_id VARCHAR(100)")


def downgrade() -> None:
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS fb_page_id")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS fb_page_token")
    op.execute("DROP TABLE IF EXISTS campaigns")
    op.execute("COMMIT")
    op.execute("DROP TYPE IF EXISTS campaignstatus")
    op.execute("BEGIN")
