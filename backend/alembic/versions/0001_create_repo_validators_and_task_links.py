"""create repo_validators and task links

Revision ID: 0001_repo_val
Revises: 
Create Date: 2026-09-07 23:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001_repo_val"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # 1. Create repo_validators table if not exists
    if "repo_validators" not in existing_tables:
        op.create_table(
            "repo_validators",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("repo_url", sa.String(length=512), nullable=False),
            sa.Column("repo_name", sa.String(length=255), nullable=False),
            sa.Column("default_branch", sa.String(length=100), nullable=False, server_default="main"),
            sa.Column("github_token", sa.String(length=512), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_repo_validators_id", "repo_validators", ["id"])
        op.create_index("ix_repo_validators_repo_url", "repo_validators", ["repo_url"])
        op.create_index("ix_repo_validators_user_id", "repo_validators", ["user_id"])
        op.create_index("ix_repo_validators_project_id", "repo_validators", ["project_id"])

    # 2. Add columns to prompt_tasks if not exist
    if "prompt_tasks" in existing_tables:
        columns = [c["name"] for c in inspector.get_columns("prompt_tasks")]
        if "repo_validator_id" not in columns:
            op.add_column("prompt_tasks", sa.Column("repo_validator_id", sa.Integer(), nullable=True))
            op.create_foreign_key(
                "fk_prompt_tasks_repo_validator",
                "prompt_tasks", "repo_validators",
                ["repo_validator_id"], ["id"],
                ondelete="SET NULL"
            )

        if "assigned_validator_id" not in columns:
            op.add_column("prompt_tasks", sa.Column("assigned_validator_id", sa.Integer(), nullable=True))
            op.create_foreign_key(
                "fk_prompt_tasks_assigned_validator",
                "prompt_tasks", "users",
                ["assigned_validator_id"], ["id"],
                ondelete="SET NULL"
            )

    # 3. Clean legacy global validator roles to standard user role
    if "users" in existing_tables:
        op.execute("UPDATE users SET role = 'user' WHERE role = 'validator'")

def downgrade() -> None:
    try:
        op.drop_constraint("fk_prompt_tasks_assigned_validator", "prompt_tasks", type_="foreignkey")
        op.drop_column("prompt_tasks", "assigned_validator_id")
    except Exception:
        pass

    try:
        op.drop_constraint("fk_prompt_tasks_repo_validator", "prompt_tasks", type_="foreignkey")
        op.drop_column("prompt_tasks", "repo_validator_id")
    except Exception:
        pass

    try:
        op.drop_index("ix_repo_validators_project_id", table_name="repo_validators")
        op.drop_index("ix_repo_validators_user_id", table_name="repo_validators")
        op.drop_index("ix_repo_validators_repo_url", table_name="repo_validators")
        op.drop_index("ix_repo_validators_id", table_name="repo_validators")
        op.drop_table("repo_validators")
    except Exception:
        pass
