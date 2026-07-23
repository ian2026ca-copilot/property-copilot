"""remove AGENT role (merged into OWNER)

Revision ID: x2y3z4a5b6c7
Revises: w1x2y3z4a5b6
Create Date: 2026-07-22

"""
from alembic import op

revision = "x2y3z4a5b6c7"
down_revision = "w1x2y3z4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Reassign any existing Leasing Agents to Owner before the enum value is removed.
    op.execute("UPDATE organization_members SET role = 'OWNER' WHERE role = 'AGENT'")

    # Postgres has no ALTER TYPE ... DROP VALUE, so rebuild the enum type without AGENT.
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("CREATE TYPE userrole AS ENUM ('OWNER', 'TENANT', 'VENDOR')")
    op.execute("ALTER TABLE organization_members ALTER COLUMN role TYPE userrole USING role::text::userrole")
    op.execute("DROP TYPE userrole_old")


def downgrade() -> None:
    op.execute("ALTER TYPE userrole RENAME TO userrole_new")
    op.execute("CREATE TYPE userrole AS ENUM ('OWNER', 'AGENT', 'TENANT', 'VENDOR')")
    op.execute("ALTER TABLE organization_members ALTER COLUMN role TYPE userrole USING role::text::userrole")
    op.execute("DROP TYPE userrole_new")
