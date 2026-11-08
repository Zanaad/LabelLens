"""pharmacists can ask an expert to look at a result

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("verdicts", sa.Column("review_requested_at", sa.DateTime(timezone=True)))
    op.add_column("verdicts", sa.Column("review_question", sa.Text()))


def downgrade() -> None:
    op.drop_column("verdicts", "review_question")
    op.drop_column("verdicts", "review_requested_at")
