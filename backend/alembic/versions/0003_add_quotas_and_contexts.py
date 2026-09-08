"""add quotas and contexts

Revision ID: 0003_quotas_ctx
Revises: 0002_plan_fb
Create Date: 2026-09-08 11:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003_quotas_ctx"
down_revision: Union[str, None] = "0002_plan_fb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # 1. Add quota columns to users table
    if "users" in existing_tables:
        user_cols = [c["name"] for c in inspector.get_columns("users")]
        if "token_quota_limit" not in user_cols:
            op.add_column("users", sa.Column("token_quota_limit", sa.Integer(), nullable=False, server_default="100000"))
        if "tokens_used_in_window" not in user_cols:
            op.add_column("users", sa.Column("tokens_used_in_window", sa.Integer(), nullable=False, server_default="0"))
        if "quota_window_start" not in user_cols:
            op.add_column("users", sa.Column("quota_window_start", sa.DateTime(), nullable=False, server_default=sa.func.now()))
        if "quota_window_hours" not in user_cols:
            op.add_column("users", sa.Column("quota_window_hours", sa.Integer(), nullable=False, server_default="5"))

    # 2. Create user_contexts table if not exists
    if "user_contexts" not in existing_tables:
        op.create_table(
            "user_contexts",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("identifier", sa.String(length=100), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("context_text", sa.Text(), nullable=False),
            sa.Column("character_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("estimated_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("gemini_cache_name", sa.String(length=255), nullable=True),
            sa.Column("gemini_cache_expire_time", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_user_contexts_id", "user_contexts", ["id"])
        op.create_index("ix_user_contexts_user_id", "user_contexts", ["user_id"])
        op.create_index("ix_user_contexts_identifier", "user_contexts", ["identifier"])

    # 3. Create user_token_logs table if not exists
    if "user_token_logs" not in existing_tables:
        op.create_table(
            "user_token_logs",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("prompt_tasks.id", ondelete="SET NULL"), nullable=True),
            sa.Column("context_id", sa.Integer(), sa.ForeignKey("user_contexts.id", ondelete="SET NULL"), nullable=True),
            sa.Column("tokens_prompt", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("tokens_completion", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("tokens_total", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("tokens_cached", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_user_token_logs_id", "user_token_logs", ["id"])
        op.create_index("ix_user_token_logs_user_id", "user_token_logs", ["user_id"])
        op.create_index("ix_user_token_logs_task_id", "user_token_logs", ["task_id"])
        op.create_index("ix_user_token_logs_context_id", "user_token_logs", ["context_id"])
        op.create_index("ix_user_token_logs_created_at", "user_token_logs", ["created_at"])

    # 4. Add context_id and tokens_used to prompt_tasks
    if "prompt_tasks" in existing_tables:
        task_cols = [c["name"] for c in inspector.get_columns("prompt_tasks")]
        if "context_id" not in task_cols:
            op.add_column("prompt_tasks", sa.Column("context_id", sa.Integer(), sa.ForeignKey("user_contexts.id", ondelete="SET NULL"), nullable=True))
        if "tokens_used" not in task_cols:
            op.add_column("prompt_tasks", sa.Column("tokens_used", sa.Integer(), nullable=False, server_default="0"))

def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "prompt_tasks" in existing_tables:
        task_cols = [c["name"] for c in inspector.get_columns("prompt_tasks")]
        if "tokens_used" in task_cols:
            op.drop_column("prompt_tasks", "tokens_used")
        if "context_id" in task_cols:
            op.drop_column("prompt_tasks", "context_id")

    if "user_token_logs" in existing_tables:
        op.drop_table("user_token_logs")

    if "user_contexts" in existing_tables:
        op.drop_table("user_contexts")

    if "users" in existing_tables:
        user_cols = [c["name"] for c in inspector.get_columns("users")]
        for col in ["quota_window_hours", "quota_window_start", "tokens_used_in_window", "token_quota_limit"]:
            if col in user_cols:
                op.drop_column("users", col)
