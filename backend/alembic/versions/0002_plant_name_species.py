"""plant names: one common name can map to several species

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-03 21:30:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_plant_names_name_language", "plant_names", type_="unique")
    op.create_unique_constraint(
        "uq_plant_names_name_language_latin", "plant_names", ["name", "language", "latin_name"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_plant_names_name_language_latin", "plant_names", type_="unique")
    op.create_unique_constraint("uq_plant_names_name_language", "plant_names", ["name", "language"])
