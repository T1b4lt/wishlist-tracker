"""initial schema

Revision ID: e4c87bf1c218
Revises:
Create Date: 2026-09-27 14:04:57.961964

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4c87bf1c218"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "category",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("color", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("category", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_category_name"), ["name"], unique=False)

    op.create_table(
        "config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("value", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("config", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_config_key"), ["key"], unique=True)

    op.create_table(
        "dailycheckrun",
        sa.Column("day_start", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.Integer(), nullable=False),
        sa.Column("total_offers", sa.Integer(), nullable=False),
        sa.Column("limit_reached_at", sa.Integer(), nullable=True),
        sa.Column("pending_at_limit", sa.Integer(), nullable=True),
        sa.Column("report_sent", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("day_start"),
    )
    op.create_table(
        "store",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("domain", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("favicon", sa.LargeBinary(), nullable=True),
        sa.Column("favicon_mime", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("store", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_store_domain"), ["domain"], unique=True)

    op.create_table(
        "product",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("priority", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["category.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("product", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_product_name"), ["name"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_product_priority"), ["priority"], unique=False
        )

    op.create_table(
        "offer",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("url", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("store_id", sa.Integer(), nullable=True),
        sa.Column("currency", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["store_id"],
            ["store.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("offer", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_offer_product_id"), ["product_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_offer_store_id"), ["store_id"], unique=False
        )

    op.create_table(
        "offerhist",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("offer_id", sa.Integer(), nullable=True),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("is_in_stock", sa.Boolean(), nullable=False),
        sa.Column("timestamp", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["offer_id"], ["offer.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("offerhist", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_offerhist_offer_id"), ["offer_id"], unique=False
        )

    op.create_table(
        "pendingstatusretry",
        sa.Column("offer_id", sa.Integer(), nullable=False),
        sa.Column("day_start", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["offer_id"], ["offer.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("offer_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("pendingstatusretry")
    with op.batch_alter_table("offerhist", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_offerhist_offer_id"))

    op.drop_table("offerhist")
    with op.batch_alter_table("offer", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_offer_store_id"))
        batch_op.drop_index(batch_op.f("ix_offer_product_id"))

    op.drop_table("offer")
    with op.batch_alter_table("product", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_product_priority"))
        batch_op.drop_index(batch_op.f("ix_product_name"))

    op.drop_table("product")
    with op.batch_alter_table("store", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_store_domain"))

    op.drop_table("store")
    op.drop_table("dailycheckrun")
    with op.batch_alter_table("config", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_config_key"))

    op.drop_table("config")
    with op.batch_alter_table("category", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_category_name"))

    op.drop_table("category")
