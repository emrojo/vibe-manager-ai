"""add temporal contexts and token breakdown

Revision ID: 0005_temporal_ctx
Revises: 0004_context_wf
Create Date: 2026-09-08 12:28:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0005_temporal_ctx'
down_revision: Union[str, None] = '0004_context_wf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'prompt_tasks' in existing_tables:
        cols = [c['name'] for c in inspector.get_columns('prompt_tasks')]
        if 'temporal_context' not in cols:
            op.add_column('prompt_tasks', sa.Column('temporal_context', sa.Text(), nullable=True))
        if 'temporal_context_status' not in cols:
            op.add_column('prompt_tasks', sa.Column('temporal_context_status', sa.String(length=50), nullable=True, server_default='ACTIVE'))
        if 'tokens_fixed_context' not in cols:
            op.add_column('prompt_tasks', sa.Column('tokens_fixed_context', sa.Integer(), nullable=False, server_default='0'))
        if 'tokens_temporal_context' not in cols:
            op.add_column('prompt_tasks', sa.Column('tokens_temporal_context', sa.Integer(), nullable=False, server_default='0'))

    if 'user_token_logs' in existing_tables:
        cols = [c['name'] for c in inspector.get_columns('user_token_logs')]
        if 'tokens_fixed_context' not in cols:
            op.add_column('user_token_logs', sa.Column('tokens_fixed_context', sa.Integer(), nullable=False, server_default='0'))
        if 'tokens_temporal_context' not in cols:
            op.add_column('user_token_logs', sa.Column('tokens_temporal_context', sa.Integer(), nullable=False, server_default='0'))

def downgrade() -> None:
    pass
