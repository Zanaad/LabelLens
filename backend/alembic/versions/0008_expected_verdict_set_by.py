"""who set a validation label's expected verdict, and when

Revision ID: 0008
Revises: 0007
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("annotations", sa.Column("expected_verdict_by_id", sa.Uuid(), nullable=True))
    op.add_column("annotations", sa.Column("expected_verdict_at", sa.DateTime(timezone=True)))
    op.create_foreign_key(
        op.f("fk_annotations_expected_verdict_by_id_users"),
        "annotations",
        "users",
        ["expected_verdict_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_annotations_expected_verdict_by_id_users"), "annotations", type_="foreignkey"
    )
    op.drop_column("annotations", "expected_verdict_at")
    op.drop_column("annotations", "expected_verdict_by_id")
