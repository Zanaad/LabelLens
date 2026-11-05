"""password reset links, session cut-off, annotations with photo or text

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-04 21:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("sessions_valid_from", sa.DateTime(timezone=True)))
    op.create_table(
        "password_resets",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_password_resets_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_password_resets")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_password_resets_token_hash")),
    )
    op.create_index(
        op.f("ix_password_resets_user_id"), "password_resets", ["user_id"], unique=False
    )

    # Annotations were never written before this revision.
    op.add_column(
        "annotations", sa.Column("title", sa.String(length=200), nullable=False, server_default="")
    )
    op.alter_column("annotations", "title", server_default=None)
    op.add_column("annotations", sa.Column("label_text", sa.Text()))
    op.add_column("annotations", sa.Column("notes", sa.Text()))
    op.alter_column("annotations", "label_ref", nullable=True)
    op.drop_index(op.f("ix_annotations_image_sha256"), table_name="annotations")
    op.alter_column("annotations", "image_sha256", nullable=False)
    op.create_unique_constraint(
        op.f("uq_annotations_image_sha256"), "annotations", ["image_sha256"]
    )


def downgrade() -> None:
    op.drop_constraint(op.f("uq_annotations_image_sha256"), "annotations", type_="unique")
    op.alter_column("annotations", "image_sha256", nullable=True)
    op.create_index(
        op.f("ix_annotations_image_sha256"), "annotations", ["image_sha256"], unique=False
    )
    op.alter_column("annotations", "label_ref", nullable=False)
    op.drop_column("annotations", "notes")
    op.drop_column("annotations", "label_text")
    op.drop_column("annotations", "title")
    op.drop_index(op.f("ix_password_resets_user_id"), table_name="password_resets")
    op.drop_table("password_resets")
    op.drop_column("users", "sessions_valid_from")
