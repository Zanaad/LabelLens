"""record human checks for validation labels

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("annotations", sa.Column("checked_by_id", sa.Uuid(), nullable=True))
    op.add_column("annotations", sa.Column("checked_at", sa.DateTime(timezone=True)))
    op.create_foreign_key(
        op.f("fk_annotations_checked_by_id_users"),
        "annotations",
        "users",
        ["checked_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_annotations_checked_by_id_users"), "annotations", type_="foreignkey"
    )
    op.drop_column("annotations", "checked_at")
    op.drop_column("annotations", "checked_by_id")
