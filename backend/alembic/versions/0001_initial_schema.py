"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-01 20:46:16.876317
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:

    op.create_table(
        "plant_names",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("language", sa.String(length=8), nullable=False),
        sa.Column("latin_name", sa.String(length=200), nullable=False),
        sa.Column("verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_plant_names")),
        sa.UniqueConstraint("name", "language", name="uq_plant_names_name_language"),
    )
    op.create_index(op.f("ix_plant_names_latin_name"), "plant_names", ["latin_name"], unique=False)
    op.create_table(
        "users",
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("organisation", sa.String(length=200), nullable=True),
        sa.Column(
            "role",
            sa.Enum(
                "pharmacist",
                "expert",
                "admin",
                name="role",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("locale", sa.String(length=8), server_default="en", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("consent_privacy_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consent_terms_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("onboarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "annotations",
        sa.Column("label_ref", sa.String(length=300), nullable=False),
        sa.Column("image_sha256", sa.String(length=64), nullable=True),
        sa.Column(
            "fields_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "expected_verdict",
            sa.Enum(
                "matches",
                "partly_matches",
                "cannot_say",
                "not_covered",
                "differs",
                name="expected_verdict_code",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "in_review",
                "final",
                name="annotation_status",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("annotator_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["annotator_id"],
            ["users.id"],
            name=op.f("fk_annotations_annotator_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_annotations")),
        sa.UniqueConstraint("label_ref", name=op.f("uq_annotations_label_ref")),
    )
    op.create_index(
        op.f("ix_annotations_image_sha256"), "annotations", ["image_sha256"], unique=False
    )
    op.create_table(
        "audit_log",
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column(
            "details_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_audit_log_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_log")),
    )
    op.create_index(op.f("ix_audit_log_action"), "audit_log", ["action"], unique=False)
    op.create_index(op.f("ix_audit_log_user_id"), "audit_log", ["user_id"], unique=False)
    op.create_table(
        "invitations",
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "pharmacist",
                "expert",
                "admin",
                name="invitation_role",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_user_id", sa.Uuid(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["accepted_user_id"],
            ["users.id"],
            name=op.f("fk_invitations_accepted_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["invited_by_id"],
            ["users.id"],
            name=op.f("fk_invitations_invited_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invitations")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_invitations_token_hash")),
    )
    op.create_index(op.f("ix_invitations_email"), "invitations", ["email"], unique=False)
    op.create_table(
        "reference_preparations",
        sa.Column("herb_latin", sa.String(length=200), nullable=False),
        sa.Column("plant_part", sa.String(length=100), nullable=False),
        sa.Column("preparation_type", sa.String(length=100), nullable=False),
        sa.Column("extract_ratio_min", sa.Float(), nullable=True),
        sa.Column("extract_ratio_max", sa.Float(), nullable=True),
        sa.Column("solvent_type", sa.String(length=100), nullable=True),
        sa.Column("solvent_strength", sa.String(length=100), nullable=True),
        sa.Column("evidence_level", sa.String(length=64), nullable=True),
        sa.Column("source_doc", sa.String(length=300), nullable=True),
        sa.Column("source_section", sa.String(length=100), nullable=True),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_by_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"],
            ["users.id"],
            name=op.f("fk_reference_preparations_updated_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reference_preparations")),
    )
    op.create_index(
        op.f("ix_reference_preparations_herb_latin"),
        "reference_preparations",
        ["herb_latin"],
        unique=False,
    )
    op.create_table(
        "scans",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("image_path", sa.String(length=500), nullable=True),
        sa.Column("image_sha256", sa.String(length=64), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=64), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("label_text", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "uploaded",
                "extracting",
                "extracted",
                "unreadable",
                "out_of_scope",
                "checked",
                "failed",
                name="scan_status",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_scans_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scans")),
    )
    op.create_index(op.f("ix_scans_image_sha256"), "scans", ["image_sha256"], unique=False)
    op.create_index(op.f("ix_scans_user_id"), "scans", ["user_id"], unique=False)
    op.create_table(
        "validation_runs",
        sa.Column("rules_version", sa.String(length=32), nullable=False),
        sa.Column("prompt_version", sa.String(length=32), nullable=True),
        sa.Column("dataset_size", sa.Integer(), nullable=False),
        sa.Column(
            "metrics_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("git_commit", sa.String(length=40), nullable=True),
        sa.Column("started_by_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["started_by_id"],
            ["users.id"],
            name=op.f("fk_validation_runs_started_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_validation_runs")),
    )
    op.create_table(
        "extractions",
        sa.Column("scan_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("prompt_version", sa.String(length=32), nullable=False),
        sa.Column("cache_key", sa.String(length=64), nullable=True),
        sa.Column(
            "raw_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "fields_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["scan_id"], ["scans.id"], name=op.f("fk_extractions_scan_id_scans"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_extractions")),
    )
    op.create_index(op.f("ix_extractions_cache_key"), "extractions", ["cache_key"], unique=False)
    op.create_index(op.f("ix_extractions_scan_id"), "extractions", ["scan_id"], unique=False)
    op.create_table(
        "reference_history",
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column(
            "before_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column(
            "after_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["reference_id"],
            ["reference_preparations.id"],
            name=op.f("fk_reference_history_reference_id_reference_preparations"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_reference_history_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reference_history")),
    )
    op.create_index(
        op.f("ix_reference_history_reference_id"),
        "reference_history",
        ["reference_id"],
        unique=False,
    )
    op.create_table(
        "corrections",
        sa.Column("extraction_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("field", sa.String(length=64), nullable=False),
        sa.Column(
            "old_value",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column(
            "new_value",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["extraction_id"],
            ["extractions.id"],
            name=op.f("fk_corrections_extraction_id_extractions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_corrections_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_corrections")),
    )
    op.create_index(
        op.f("ix_corrections_extraction_id"), "corrections", ["extraction_id"], unique=False
    )
    op.create_table(
        "verdicts",
        sa.Column("scan_id", sa.Uuid(), nullable=False),
        sa.Column("extraction_id", sa.Uuid(), nullable=True),
        sa.Column("rules_version", sa.String(length=32), nullable=False),
        sa.Column(
            "verdict",
            sa.Enum(
                "matches",
                "partly_matches",
                "cannot_say",
                "not_covered",
                "differs",
                name="verdict_code",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "reasoning_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "comparison_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "missing_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "sources_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["extraction_id"],
            ["extractions.id"],
            name=op.f("fk_verdicts_extraction_id_extractions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["scan_id"], ["scans.id"], name=op.f("fk_verdicts_scan_id_scans"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_verdicts")),
    )
    op.create_index(op.f("ix_verdicts_scan_id"), "verdicts", ["scan_id"], unique=False)
    op.create_table(
        "expert_ratings",
        sa.Column("verdict_id", sa.Uuid(), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), nullable=True),
        sa.Column(
            "rating",
            sa.Enum(
                "agree",
                "disagree",
                "unsure",
                name="rating",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "correct_verdict",
            sa.Enum(
                "matches",
                "partly_matches",
                "cannot_say",
                "not_covered",
                "differs",
                name="correct_verdict_code",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"],
            ["users.id"],
            name=op.f("fk_expert_ratings_reviewer_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["verdict_id"],
            ["verdicts.id"],
            name=op.f("fk_expert_ratings_verdict_id_verdicts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_expert_ratings")),
        sa.UniqueConstraint("verdict_id", "reviewer_id", name="uq_expert_ratings_verdict_reviewer"),
    )
    op.create_index(
        op.f("ix_expert_ratings_verdict_id"), "expert_ratings", ["verdict_id"], unique=False
    )
    op.create_table(
        "share_links",
        sa.Column("verdict_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_share_links_created_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["verdict_id"],
            ["verdicts.id"],
            name=op.f("fk_share_links_verdict_id_verdicts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_share_links")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_share_links_token_hash")),
    )
    op.create_index(op.f("ix_share_links_verdict_id"), "share_links", ["verdict_id"], unique=False)


def downgrade() -> None:

    op.drop_index(op.f("ix_share_links_verdict_id"), table_name="share_links")
    op.drop_table("share_links")
    op.drop_index(op.f("ix_expert_ratings_verdict_id"), table_name="expert_ratings")
    op.drop_table("expert_ratings")
    op.drop_index(op.f("ix_verdicts_scan_id"), table_name="verdicts")
    op.drop_table("verdicts")
    op.drop_index(op.f("ix_corrections_extraction_id"), table_name="corrections")
    op.drop_table("corrections")
    op.drop_index(op.f("ix_reference_history_reference_id"), table_name="reference_history")
    op.drop_table("reference_history")
    op.drop_index(op.f("ix_extractions_scan_id"), table_name="extractions")
    op.drop_index(op.f("ix_extractions_cache_key"), table_name="extractions")
    op.drop_table("extractions")
    op.drop_table("validation_runs")
    op.drop_index(op.f("ix_scans_user_id"), table_name="scans")
    op.drop_index(op.f("ix_scans_image_sha256"), table_name="scans")
    op.drop_table("scans")
    op.drop_index(op.f("ix_reference_preparations_herb_latin"), table_name="reference_preparations")
    op.drop_table("reference_preparations")
    op.drop_index(op.f("ix_invitations_email"), table_name="invitations")
    op.drop_table("invitations")
    op.drop_index(op.f("ix_audit_log_user_id"), table_name="audit_log")
    op.drop_index(op.f("ix_audit_log_action"), table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_index(op.f("ix_annotations_image_sha256"), table_name="annotations")
    op.drop_table("annotations")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_plant_names_latin_name"), table_name="plant_names")
    op.drop_table("plant_names")
