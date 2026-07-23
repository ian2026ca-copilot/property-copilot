"""remove MANAGER role (merged into OWNER)

Revision ID: w1x2y3z4a5b6
Revises: v0w1x2y3z4a5
Create Date: 2026-07-22

"""
from alembic import op

revision = "w1x2y3z4a5b6"
down_revision = "v0w1x2y3z4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Reassign any existing Property Managers to Owner before the enum value is removed.
    op.execute("UPDATE organization_members SET role = 'OWNER' WHERE role = 'MANAGER'")

    # Postgres has no ALTER TYPE ... DROP VALUE, so rebuild the enum type without MANAGER.
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("CREATE TYPE userrole AS ENUM ('OWNER', 'AGENT', 'TENANT', 'VENDOR')")
    op.execute("ALTER TABLE organization_members ALTER COLUMN role TYPE userrole USING role::text::userrole")
    op.execute("DROP TYPE userrole_old")


def downgrade() -> None:
    op.execute("ALTER TYPE userrole RENAME TO userrole_new")
    op.execute("CREATE TYPE userrole AS ENUM ('OWNER', 'MANAGER', 'AGENT', 'TENANT', 'VENDOR')")
    op.execute("ALTER TABLE organization_members ALTER COLUMN role TYPE userrole USING role::text::userrole")
    op.execute("DROP TYPE userrole_new")
