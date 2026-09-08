"""add plan_feedback to prompt_tasks

Revision ID: 0002_plan_fb
Revises: 0001_repo_val
Create Date: 2026-09-08 11:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_plan_fb"
down_revision: Union[str, None] = "0001_repo_val"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "prompt_tasks" in existing_tables:
        columns = [c["name"] for c in inspector.get_columns("prompt_tasks")]
        if "plan_feedback" not in columns:
            op.add_column("prompt_tasks", sa.Column("plan_feedback", sa.Text(), nullable=True))

def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "prompt_tasks" in existing_tables:
        columns = [c["name"] for c in inspector.get_columns("prompt_tasks")]
        if "plan_feedback" in columns:
            op.drop_column("prompt_tasks", "plan_feedback")
