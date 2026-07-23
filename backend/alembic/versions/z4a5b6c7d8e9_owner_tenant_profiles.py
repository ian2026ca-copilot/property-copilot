"""split owner and tenant profile fields out of users

Revision ID: z4a5b6c7d8e9
Revises: y3z4a5b6c7d8
Create Date: 2026-07-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "z4a5b6c7d8e9"
down_revision = "y3z4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("street_address", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("province", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tenant_profiles_user_id", "tenant_profiles", ["user_id"])

    op.create_table(
        "owner_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_owner_profiles_user_id", "owner_profiles", ["user_id"])

    # Migrate any existing tenant-ish data off of users before dropping the columns.
    op.execute("""
        INSERT INTO tenant_profiles (id, user_id, date_of_birth, street_address, city, province, postal_code, country, created_at, updated_at)
        SELECT gen_random_uuid(), id, date_of_birth, street_address, city, province, postal_code, country, now(), now()
        FROM users
        WHERE date_of_birth IS NOT NULL
           OR street_address IS NOT NULL
           OR city IS NOT NULL
           OR province IS NOT NULL
           OR postal_code IS NOT NULL
           OR country IS NOT NULL
    """)

    op.drop_column("users", "date_of_birth")
    op.drop_column("users", "street_address")
    op.drop_column("users", "city")
    op.drop_column("users", "province")
    op.drop_column("users", "postal_code")
    op.drop_column("users", "country")


def downgrade() -> None:
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("street_address", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("province", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("country", sa.String(100), nullable=True))

    op.execute("""
        UPDATE users u SET
            date_of_birth = tp.date_of_birth,
            street_address = tp.street_address,
            city = tp.city,
            province = tp.province,
            postal_code = tp.postal_code,
            country = tp.country
        FROM tenant_profiles tp
        WHERE tp.user_id = u.id
    """)

    op.drop_table("owner_profiles")
    op.drop_table("tenant_profiles")
