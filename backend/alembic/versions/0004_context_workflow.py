"""add context workflow fields

Revision ID: 0004_context_wf
Revises: 0003_quotas_ctx
Create Date: 2026-09-08 12:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0004_context_wf'
down_revision: Union[str, None] = '0003_quotas_ctx'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    is_sqlite = conn.dialect.name == "sqlite"

    if 'user_contexts' in existing_tables:
        cols = [c['name'] for c in inspector.get_columns('user_contexts')]
        if 'status' not in cols:
            op.add_column('user_contexts', sa.Column('status', sa.String(length=50), nullable=False, server_default='PENDING'))
            try:
                op.create_index('ix_user_contexts_status', 'user_contexts', ['status'])
            except Exception:
                pass
        if 'version' not in cols:
            op.add_column('user_contexts', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
        if 'repo_validator_id' not in cols:
            op.add_column('user_contexts', sa.Column('repo_validator_id', sa.Integer(), nullable=True))
            if not is_sqlite:
                try:
                    op.create_foreign_key('fk_user_contexts_repo_validator', 'user_contexts', 'repo_validators', ['repo_validator_id'], ['id'], ondelete='SET NULL')
                except Exception:
                    pass
        if 'assigned_validator_id' not in cols:
            op.add_column('user_contexts', sa.Column('assigned_validator_id', sa.Integer(), nullable=True))
            if not is_sqlite:
                try:
                    op.create_foreign_key('fk_user_contexts_assigned_validator', 'user_contexts', 'users', ['assigned_validator_id'], ['id'], ondelete='SET NULL')
                except Exception:
                    pass
        if 'edited_text' not in cols:
            op.add_column('user_contexts', sa.Column('edited_text', sa.Text(), nullable=True))
        if 'accepted_text' not in cols:
            op.add_column('user_contexts', sa.Column('accepted_text', sa.Text(), nullable=True))
        if 'validated_by_id' not in cols:
            op.add_column('user_contexts', sa.Column('validated_by_id', sa.Integer(), nullable=True))
            if not is_sqlite:
                try:
                    op.create_foreign_key('fk_user_contexts_validated_by', 'user_contexts', 'users', ['validated_by_id'], ['id'], ondelete='SET NULL')
                except Exception:
                    pass
        if 'validated_at' not in cols:
            op.add_column('user_contexts', sa.Column('validated_at', sa.DateTime(), nullable=True))
        if 'plan_markdown' not in cols:
            op.add_column('user_contexts', sa.Column('plan_markdown', sa.Text(), nullable=True))
        if 'plan_feedback' not in cols:
            op.add_column('user_contexts', sa.Column('plan_feedback', sa.Text(), nullable=True))
        if 'plan_validated_by_id' not in cols:
            op.add_column('user_contexts', sa.Column('plan_validated_by_id', sa.Integer(), nullable=True))
            if not is_sqlite:
                try:
                    op.create_foreign_key('fk_user_contexts_plan_validated_by', 'user_contexts', 'users', ['plan_validated_by_id'], ['id'], ondelete='SET NULL')
                except Exception:
                    pass
        if 'plan_validated_at' not in cols:
            op.add_column('user_contexts', sa.Column('plan_validated_at', sa.DateTime(), nullable=True))
        if 'rejection_reason' not in cols:
            op.add_column('user_contexts', sa.Column('rejection_reason', sa.Text(), nullable=True))

def downgrade() -> None:
    pass
