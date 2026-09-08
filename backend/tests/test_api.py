import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.database import Base, get_db
from app.config import settings

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest_asyncio.fixture(autouse=True)
async def prepare_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_full_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Health check
        res = await ac.get("/api/health")
        assert res.status_code == 200
        assert res.json() == {"status": "healthy"}

        # 2. Register first user (becomes admin)
        admin_payload = {
            "email": "superadmin@vibemanager.ai",
            "name": "Super Admin",
            "password": "Password123!"
        }
        res = await ac.post("/api/auth/register", json=admin_payload)
        assert res.status_code == 200, res.text
        admin_data = res.json()
        admin_token = admin_data["access_token"]
        assert admin_data["user"]["role"] == "admin"

        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 3. Admin creates an invitation code
        inv_payload = {"max_uses": 5, "expires_in_days": 10}
        res = await ac.post("/api/admin/invitations", json=inv_payload, headers=admin_headers)
        assert res.status_code == 200
        inv_data = res.json()
        invite_code = inv_data["code"]
        invite_token = inv_data["token"]
        assert "VIBE-" in invite_code
        assert inv_data["whatsapp_share_url"].startswith("https://wa.me/?text=")

        # 4. Normal user registers using invitation code
        user1_payload = {
            "email": "alice@developer.com",
            "name": "Alice Developer",
            "password": "Password123!",
            "invite_code": invite_code
        }
        res = await ac.post("/api/auth/register", json=user1_payload)
        assert res.status_code == 200
        user1_data = res.json()
        user1_token = user1_data["access_token"]
        user1_id = user1_data["user"]["id"]
        assert user1_data["user"]["role"] == "user"
        user1_headers = {"Authorization": f"Bearer {user1_token}"}

        # 5. Normal user registers using invitation token via URL
        user2_payload = {
            "email": "bob@validator.com",
            "name": "Bob Reviewer",
            "password": "Password123!",
            "invite_token": invite_token
        }
        res = await ac.post("/api/auth/register", json=user2_payload)
        assert res.status_code == 200
        user2_data = res.json()
        user2_id = user2_data["user"]["id"]
        user2_token = user2_data["access_token"]

        # 6. Admin promotes Bob (user2) to validator
        res = await ac.post(f"/api/admin/users/{user2_id}/role", json={"role": "validator"}, headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["role"] == "validator"

        # Re-login Bob to refresh claims
        res = await ac.post("/api/auth/login", json={"email": "bob@validator.com", "password": "Password123!"})
        assert res.status_code == 200
        val_token = res.json()["access_token"]
        val_headers = {"Authorization": f"Bearer {val_token}"}

        # 7. Admin creates a project
        proj_payload = {
            "name": "React Dashboard",
            "description": "Dashboard administrativo",
            "repo_url": "https://github.com/test-org/react-dashboard",
            "default_branch": "main",
            "github_token": "ghp_mocktoken12345"
        }
        res = await ac.post("/api/projects", json=proj_payload, headers=admin_headers)
        assert res.status_code == 200
        proj_id = res.json()["id"]

        # 8. Alice submits a prompt for this project
        prompt_payload = {
            "project_id": proj_id,
            "prompt": "Añade un botón de exportar a PDF en la barra de navegación"
        }
        res = await ac.post("/api/prompts", json=prompt_payload, headers=user1_headers)
        assert res.status_code == 200
        task_data = res.json()
        task_id = task_data["id"]
        assert task_data["status"] == "PENDING"

        # 9. Validator Bob reviews pending tasks
        res = await ac.get("/api/validation/tasks?status_filter=PENDING", headers=val_headers)
        assert res.status_code == 200
        pending_tasks = res.json()
        assert len(pending_tasks) >= 1

        # 10. Validator edits the prompt instructions
        edit_payload = {
            "edited_prompt": "Añade un botón de exportar a PDF en la barra superior usando jsPDF y un icono de descarga."
        }
        res = await ac.put(f"/api/validation/tasks/{task_id}/edit", json=edit_payload, headers=val_headers)
        assert res.status_code == 200
        assert res.json()["edited_prompt"] == edit_payload["edited_prompt"]

        # 11. Validator approves task (enters queue)
        res = await ac.post(f"/api/validation/tasks/{task_id}/approve", headers=val_headers)
        assert res.status_code == 200
        assert res.json()["status"] in ["APPROVED", "RUNNING", "COMPLETED"]

        # 12. Chat between Alice and Admin
        chat_payload = {
            "recipient_id": admin_data["user"]["id"],
            "content": "Hola Admin, acabo de mandar un prompt para el proyecto."
        }
        res = await ac.post("/api/chat/messages", json=chat_payload, headers=user1_headers)
        assert res.status_code == 200
        msg_data = res.json()
        assert msg_data["content"] == chat_payload["content"]

        # Admin checks messages from Alice
        res = await ac.get(f"/api/chat/messages/{user1_id}", headers=admin_headers)
        assert res.status_code == 200
        msgs = res.json()
        assert len(msgs) == 1
        assert msgs[0]["is_read"] == True

        # 13. Admin bans Alice
        res = await ac.post(f"/api/admin/users/{user1_id}/ban", headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["is_banned"] == True

        # Alice tries to login -> 403 Forbidden
        res = await ac.post("/api/auth/login", json={"email": "alice@developer.com", "password": "Password123!"})
        assert res.status_code == 403

        # Admin unbans Alice
        res = await ac.post(f"/api/admin/users/{user1_id}/unban", headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["is_banned"] == False

        # 14. Admin configures and inspects Gemini AI settings
        res = await ac.get("/api/admin/settings/gemini", headers=admin_headers)
        assert res.status_code == 200
        gemini_info = res.json()
        assert "configured" in gemini_info

        res = await ac.post("/api/admin/settings/gemini", json={"api_key": "AIzaSyTestKey12345", "model": "gemini-3.6-flash"}, headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["configured"] == True
        assert res.json()["model"] == "gemini-3.6-flash"

        # 15. User personal Pull Requests endpoint
        # Re-login Alice to get valid token
        res = await ac.post("/api/auth/login", json={"email": "alice@developer.com", "password": "Password123!"})
        assert res.status_code == 200
        alice_token = res.json()["access_token"]
        alice_headers = {"Authorization": f"Bearer {alice_token}"}

        res = await ac.get("/api/prompts/prs", headers=alice_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

        # 16. Monitor active processes endpoint (forbidden for regular user Alice, allowed for Admin)
        res = await ac.get("/api/processes/active", headers=alice_headers)
        assert res.status_code == 403, "Regular user should be forbidden from accessing /api/processes/active"

        res = await ac.get("/api/processes/active", headers=admin_headers)
        assert res.status_code == 200
        proc_data = res.json()
        assert "running_count" in proc_data
        assert "pending_count" in proc_data
        assert "processes" in proc_data
        assert isinstance(proc_data["processes"], list)

        # 17. Process details endpoint (forbidden for regular user Alice, allowed for Admin)
        res = await ac.get(f"/api/processes/{task_id}/details", headers=alice_headers)
        assert res.status_code == 403, "Regular user should be forbidden from accessing /api/processes/{id}/details"

        res = await ac.get(f"/api/processes/{task_id}/details", headers=admin_headers)
        assert res.status_code == 200
        detail_data = res.json()
        assert detail_data["id"] == task_id
        assert "status" in detail_data
        assert "logs" in detail_data

        # 18. Admin modifies existing project (edit parameters and toggle active)
        edit_payload = {
            "name": "Proyecto Tienda Modificado",
            "default_branch": "develop",
            "is_active": False
        }
        res = await ac.put(f"/api/projects/{proj_id}", json=edit_payload, headers=admin_headers)
        assert res.status_code == 200
        edited_proj = res.json()
        assert edited_proj["name"] == "Proyecto Tienda Modificado"
        assert edited_proj["default_branch"] == "develop"
        assert edited_proj["is_active"] == False

        # 19. Stop / cancel a process
        # Reactivate project
        await ac.put(f"/api/projects/{proj_id}", json={"is_active": True}, headers=admin_headers)

        # Create a new prompt task to cancel
        res = await ac.post("/api/prompts", json={"project_id": proj_id, "prompt": "Tarea para probar cancelación"}, headers=alice_headers)
        assert res.status_code == 200
        stop_task_id = res.json()["id"]

        # Call stop process endpoint
        res = await ac.post(f"/api/processes/{stop_task_id}/stop", headers=alice_headers)
        assert res.status_code == 200
        stop_resp = res.json()
        assert stop_resp["success"] == True
        assert stop_resp["status"] == "STOPPED"

        # Verify details show STOPPED (forbidden for Alice, accessible for Admin)
        res = await ac.get(f"/api/processes/{stop_task_id}/details", headers=alice_headers)
        assert res.status_code == 403

        res = await ac.get(f"/api/processes/{stop_task_id}/details", headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "STOPPED"

@pytest.mark.asyncio
async def test_two_stage_plan_validation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Register admin
        admin_res = await ac.post("/api/auth/register", json={
            "email": "planadmin@vibemanager.ai",
            "name": "Plan Admin",
            "password": "Password123!"
        })
        admin_token = admin_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Admin creates invitation code
        inv_res = await ac.post("/api/admin/invitations", json={"max_uses": 5, "expires_in_days": 10}, headers=admin_headers)
        invite_code = inv_res.json()["code"]

        # Create validator user
        val_res = await ac.post("/api/auth/register", json={
            "email": "valuser@vibemanager.ai",
            "name": "Val User",
            "password": "Password123!",
            "invite_code": invite_code
        })
        val_id = val_res.json()["user"]["id"]
        await ac.post(f"/api/admin/users/{val_id}/role", json={"role": "validator"}, headers=admin_headers)

        val_login = await ac.post("/api/auth/login", json={"email": "valuser@vibemanager.ai", "password": "Password123!"})
        val_token = val_login.json()["access_token"]
        val_headers = {"Authorization": f"Bearer {val_token}"}

        # Create project
        proj_res = await ac.post("/api/projects", json={
            "name": "Plan Project",
            "repo_url": "https://github.com/org/repo",
            "default_branch": "main"
        }, headers=admin_headers)
        proj_id = proj_res.json()["id"]

        # Create prompt task
        prompt_res = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Generar pantalla de login con Tailwind"
        }, headers=admin_headers)
        task_id = prompt_res.json()["id"]

        # Update task in DB directly to simulate PLAN_PENDING with generated plan
        async with TestingSessionLocal() as session:
            from app.models.prompt_task import PromptTask
            from sqlalchemy import select
            q = await session.execute(select(PromptTask).where(PromptTask.id == task_id))
            t = q.scalars().first()
            t.status = "PLAN_PENDING"
            t.plan_content = "## Objetivo y Diagnóstico\nCrear pantalla de login.\n\n## Archivos Afectados\n- src/Login.tsx"
            await session.commit()

        # Check list in validation endpoint
        list_res = await ac.get("/api/validation/tasks?status_filter=PLAN_PENDING", headers=val_headers)
        assert list_res.status_code == 200
        plan_tasks = list_res.json()
        assert any(t["id"] == task_id for t in plan_tasks)

        # Test Reject Plan
        reject_res = await ac.post(f"/api/validation/tasks/{task_id}/reject-plan", json={
            "rejection_reason": "El plan modifica un componente obsoleto"
        }, headers=val_headers)
        assert reject_res.status_code == 200
        assert reject_res.json()["status"] == "REJECTED"
        assert reject_res.json()["plan_rejection_reason"] == "El plan modifica un componente obsoleto"

        # Create second task for Approve Plan
        prompt_res2 = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Crear dashboard de analíticas"
        }, headers=admin_headers)
        task_id2 = prompt_res2.json()["id"]

        async with TestingSessionLocal() as session:
            q = await session.execute(select(PromptTask).where(PromptTask.id == task_id2))
            t2 = q.scalars().first()
            t2.status = "PLAN_PENDING"
            t2.plan_content = "## Plan de Analíticas\n- src/Analytics.tsx"
            await session.commit()

        # Test Approve Plan
        approve_plan_res = await ac.post(f"/api/validation/tasks/{task_id2}/approve-plan", headers=val_headers)
        assert approve_plan_res.status_code == 200
        assert approve_plan_res.json()["status"] in ["PLAN_APPROVED", "RUNNING", "COMPLETED"]

@pytest.mark.asyncio
async def test_security_protections():
    from app.schemas.prompt_task import sanitize_prompt_text
    from app.services.run_task import is_safe_repo_path
    from app.services.docker_runner import mask_secrets

    # 1. Test Prompt Sanitization & Length bounds
    # Zero-width spaces and control characters stripped
    dirty_prompt = "Crear\u200B \uFEFFlogin\x00 \x07seguro\x1F ahora"
    cleaned = sanitize_prompt_text(dirty_prompt)
    assert "\u200B" not in cleaned
    assert "\uFEFF" not in cleaned
    assert "\x00" not in cleaned
    assert "\x07" not in cleaned
    assert "\x1F" not in cleaned
    assert cleaned == "Crear login seguro ahora"

    # Too short (< 5 chars)
    with pytest.raises(ValueError, match="al menos 5 caracteres"):
        sanitize_prompt_text("abc")

    # Too long (> 4000 chars)
    with pytest.raises(ValueError, match="no puede exceder los 4000"):
        sanitize_prompt_text("A" * 4001)

    # 2. Test Safe Repo Path & Path Traversal Guard
    workspace = "/runner_workspace/repo"
    assert is_safe_repo_path(workspace, "src/components/Header.tsx") is True
    assert is_safe_repo_path(workspace, "README.md") is True
    assert is_safe_repo_path(workspace, "docs/api/v1.json") is True

    # Path traversal attempts
    assert is_safe_repo_path(workspace, "../etc/passwd") is False
    assert is_safe_repo_path(workspace, "../../secret.txt") is False
    assert is_safe_repo_path(workspace, "foo/../../bar") is False

    # Blocked sensitive paths
    assert is_safe_repo_path(workspace, ".git/config") is False
    assert is_safe_repo_path(workspace, ".git/hooks/pre-commit") is False
    assert is_safe_repo_path(workspace, ".env") is False
    assert is_safe_repo_path(workspace, ".env.production") is False
    assert is_safe_repo_path(workspace, ".github/workflows/deploy.yml") is False

    # 3. Test Secret Masking in Logs and Errors
    test_gh_token = "ghp_SECRET_TOKEN_XYZ_12345"
    test_gemini_key = "AIzaSy_GEMINI_KEY_ABC_98765"
    secrets_to_mask = [test_gh_token, test_gemini_key]

    raw_log = f"Clonando con token {test_gh_token} y llamando a Gemini con {test_gemini_key}..."
    redacted = mask_secrets(raw_log, secrets_to_mask)
    assert test_gh_token not in redacted
    assert test_gemini_key not in redacted
    assert "***REDACTED***" in redacted

@pytest.mark.asyncio
async def test_concurrent_active_quota():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Register user
        user_payload = {
            "email": "rate_limited_user@test.com",
            "name": "Rate Limited",
            "password": "Password123!"
        }
        res = await ac.post("/api/auth/register", json=user_payload)
        assert res.status_code == 200
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create project
        proj_res = await ac.post("/api/projects", json={
            "name": "Project Quota Test",
            "repo_url": "https://github.com/example/quota-repo"
        }, headers=headers)
        assert proj_res.status_code == 200
        proj_id = proj_res.json()["id"]

        # Submit 3 prompts (the allowed maximum concurrent quota)
        for i in range(1, 4):
            resp = await ac.post("/api/prompts", json={
                "project_id": proj_id,
                "prompt": f"Tarea concurrente número {i} para verificar cuota"
            }, headers=headers)
            assert resp.status_code == 200, resp.text

        # 4th prompt must be rejected with 429 Too Many Requests
        resp4 = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Esta es la cuarta tarea concurrente y debe ser rechazada"
        }, headers=headers)
        assert resp4.status_code == 429
        assert "Límite alcanzado" in resp4.json()["detail"]


@pytest.mark.asyncio
async def test_repo_validators_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Register admin
        admin_res = await ac.post("/api/auth/register", json={
            "email": "admin_rv@test.com",
            "name": "Admin RV",
            "password": "Password123!"
        })
        assert admin_res.status_code == 200
        admin_token = admin_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Create invitation for users
        inv_res = await ac.post("/api/admin/invitations", json={"max_uses": 10}, headers=admin_headers)
        assert inv_res.status_code == 200
        invite_code = inv_res.json()["code"]

        # 2. Register User 1 (Validator A)
        u1_res = await ac.post("/api/auth/register", json={
            "email": "validator_a@test.com",
            "name": "Validator Alpha",
            "password": "Password123!",
            "invite_code": invite_code
        })
        assert u1_res.status_code == 200, u1_res.text
        u1_token = u1_res.json()["access_token"]
        u1_id = u1_res.json()["user"]["id"]
        u1_headers = {"Authorization": f"Bearer {u1_token}"}

        # 3. Register User 2 (Validator B)
        u2_res = await ac.post("/api/auth/register", json={
            "email": "validator_b@test.com",
            "name": "Validator Beta",
            "password": "Password123!",
            "invite_code": invite_code
        })
        assert u2_res.status_code == 200, u2_res.text
        u2_token = u2_res.json()["access_token"]
        u2_id = u2_res.json()["user"]["id"]
        u2_headers = {"Authorization": f"Bearer {u2_token}"}

        # 4. Register User 3 (Normal developer)
        u3_res = await ac.post("/api/auth/register", json={
            "email": "developer@test.com",
            "name": "Dev User",
            "password": "Password123!",
            "invite_code": invite_code
        })
        assert u3_res.status_code == 200, u3_res.text
        u3_token = u3_res.json()["access_token"]
        u3_headers = {"Authorization": f"Bearer {u3_token}"}

        # 5. User 1 registers as validator of repo "https://github.com/company/shared-service"
        rv1_res = await ac.post("/api/repo-validators", json={
            "repo_url": "https://github.com/company/shared-service",
            "github_token": "ghp_TOKEN_ALPHA_12345",
            "default_branch": "main",
            "name": "Shared Service"
        }, headers=u1_headers)
        assert rv1_res.status_code == 200, rv1_res.text
        rv1_data = rv1_res.json()
        rv1_id = rv1_data["id"]
        assert rv1_data["repo_url"] == "https://github.com/company/shared-service"
        assert rv1_data["has_github_token"] is True
        assert rv1_data["user_id"] == u1_id

        # Check /api/auth/me for User 1 shows is_project_validator=True and validated_repos_count=1
        me_res = await ac.get("/api/auth/me", headers=u1_headers)
        assert me_res.status_code == 200
        assert me_res.json()["is_project_validator"] is True
        assert me_res.json()["validated_repos_count"] == 1

        # 6. User 2 also registers as validator of the SAME repo with their own token
        rv2_res = await ac.post("/api/repo-validators", json={
            "repo_url": "https://github.com/company/shared-service",
            "github_token": "ghp_TOKEN_BETA_67890",
            "default_branch": "main",
            "name": "Shared Service (Beta)"
        }, headers=u2_headers)
        assert rv2_res.status_code == 200, rv2_res.text
        rv2_data = rv2_res.json()
        rv2_id = rv2_data["id"]
        assert rv2_id != rv1_id
        assert rv2_data["user_id"] == u2_id

        # 7. Check targets endpoint
        targets_res = await ac.get("/api/repo-validators/targets", headers=u3_headers)
        assert targets_res.status_code == 200
        targets = targets_res.json()
        assert len(targets) >= 2
        t1 = next((t for t in targets if t["id"] == rv1_id), None)
        t2 = next((t for t in targets if t["id"] == rv2_id), None)
        assert t1 is not None and t2 is not None
        assert "Validator Alpha" in t1["display_label"]
        assert "Validator Beta" in t2["display_label"]

        # 8. User 3 submits prompt specifically choosing Validator Alpha (rv1_id)
        prompt_res = await ac.post("/api/prompts", json={
            "repo_validator_id": rv1_id,
            "prompt": "Implementar middleware de logging en FastAPI"
        }, headers=u3_headers)
        assert prompt_res.status_code == 200, prompt_res.text
        task_data = prompt_res.json()
        task_id = task_data["id"]
        assert task_data["repo_validator_id"] == rv1_id
        assert task_data["assigned_validator_id"] == u1_id
        assert task_data["assigned_validator_name"] == "Validator Alpha"
        assert task_data["repo_url"] == "https://github.com/company/shared-service"

        # 9. Strict isolation checks:
        # Validator Beta (User 2) must NOT see task in their validation list
        u2_list = await ac.get("/api/validation/tasks", headers=u2_headers)
        assert u2_list.status_code == 200
        u2_task_ids = [t["id"] for t in u2_list.json()]
        assert task_id not in u2_task_ids

        # Validator Beta attempts to approve Validator Alpha's task -> 403 Forbidden
        u2_approve_res = await ac.post(f"/api/validation/tasks/{task_id}/approve", headers=u2_headers)
        assert u2_approve_res.status_code == 403
        assert "No tienes permiso" in u2_approve_res.json()["detail"]

        # Validator Alpha (User 1) DOES see the task
        u1_list = await ac.get("/api/validation/tasks", headers=u1_headers)
        assert u1_list.status_code == 200
        u1_task_ids = [t["id"] for t in u1_list.json()]
        assert task_id in u1_task_ids

        # Validator Alpha approves the prompt
        u1_approve_res = await ac.post(f"/api/validation/tasks/{task_id}/approve", headers=u1_headers)
        assert u1_approve_res.status_code == 200
        assert u1_approve_res.json()["status"] in ["APPROVED", "RUNNING"]

        # Simulate plan generation
        async with TestingSessionLocal() as session:
            from app.models.prompt_task import PromptTask
            from sqlalchemy import select
            q = await session.execute(select(PromptTask).where(PromptTask.id == task_id))
            t = q.scalars().first()
            t.status = "PLAN_PENDING"
            t.plan_content = "## Plan Técnico\n- app/middleware.py"
            await session.commit()

        # Validator Beta attempts to approve the plan -> 403 Forbidden
        u2_plan_approve = await ac.post(f"/api/validation/tasks/{task_id}/approve-plan", headers=u2_headers)
        assert u2_plan_approve.status_code == 403

        # Validator Alpha approves the plan -> 200 OK
        u1_plan_approve = await ac.post(f"/api/validation/tasks/{task_id}/approve-plan", headers=u1_headers)
        assert u1_plan_approve.status_code == 200
        assert u1_plan_approve.json()["status"] in ["PLAN_APPROVED", "RUNNING", "COMPLETED"]

        # 10. Admin has super-access to see and manage all tasks
        admin_list = await ac.get("/api/validation/tasks", headers=admin_headers)
        assert admin_list.status_code == 200
        admin_task_ids = [t["id"] for t in admin_list.json()]
        assert task_id in admin_task_ids

        # 11. User 1 deletes their repo validator registration
        del_res = await ac.delete(f"/api/repo-validators/{rv1_id}", headers=u1_headers)
        assert del_res.status_code == 200

        # User 1's /my list is now empty
        my_repos = await ac.get("/api/repo-validators/my", headers=u1_headers)
        assert my_repos.status_code == 200
        assert len(my_repos.json()) == 0


@pytest.mark.asyncio
async def test_alembic_migration_schema():
    """Verify that Alembic configuration and migration script can load metadata correctly."""
    import os
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from alembic.migration import MigrationContext

    # Check alembic.ini exists
    ini_path = "backend/alembic.ini" if os.path.exists("backend/alembic.ini") else "alembic.ini"
    assert os.path.exists(ini_path)
    cfg = Config(ini_path)
    if "backend" in ini_path:
        cfg.set_main_option("script_location", "backend/alembic")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1
    assert heads[0] == "0005_temporal_ctx"

    # Check migration revision head details
    head_revision = script.get_revision(heads[0])
    assert "add temporal contexts and token breakdown" in head_revision.doc


@pytest.mark.asyncio
async def test_production_security_hardening():
    """Verify security hardening: password length, chat message length, branch validation, token encryption, and RBAC."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Weak password rejection (< 8 characters)
        weak_payload = {
            "email": "weakuser@test.com",
            "name": "Weak User",
            "password": "123"
        }
        res_weak = await ac.post("/api/auth/register", json=weak_payload)
        assert res_weak.status_code == 422, "Should reject password shorter than 8 characters"

        # 2. Valid registration of Admin
        admin_res = await ac.post("/api/auth/register", json={
            "email": "adminsec@test.com",
            "name": "Admin Sec",
            "password": "SecurePassword2026!"
        })
        assert admin_res.status_code == 200
        admin_token = admin_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 3. Create normal user
        inv_res = await ac.post("/api/admin/invitations", json={"max_uses": 10}, headers=admin_headers)
        inv_code = inv_res.json()["code"]

        user_res = await ac.post("/api/auth/register", json={
            "email": "normalsec@test.com",
            "name": "Normal Sec",
            "password": "SecureUserPassword2026!",
            "invite_code": inv_code
        })
        assert user_res.status_code == 200
        user_token = user_res.json()["access_token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}

        # 4. Chat message overflow test (> 4000 characters)
        huge_content = "A" * 4500
        chat_res = await ac.post("/api/chat/messages", json={
            "recipient_id": 1,
            "content": huge_content
        }, headers=user_headers)
        assert chat_res.status_code == 422, "Should reject oversized chat content"

        # 5. Invalid branch validation test (directory traversal attempt)
        bad_branch_res = await ac.post("/api/repo-validators", json={
            "repo_url": "https://github.com/testsec/repo",
            "github_token": "ghp_securetoken123456",
            "default_branch": "../../etc/passwd"
        }, headers=user_headers)
        assert bad_branch_res.status_code == 422, "Should reject unsafe branch names"

        # 6. Token encryption at rest test
        valid_branch_res = await ac.post("/api/repo-validators", json={
            "repo_url": "https://github.com/testsec/repo",
            "github_token": "ghp_super_secret_pat_999",
            "default_branch": "main"
        }, headers=user_headers)
        assert valid_branch_res.status_code == 200
        rv_id = valid_branch_res.json()["id"]

        # Inspect database record directly to verify encryption at rest
        from sqlalchemy import select
        from app.models.repo_validator import RepoValidator
        from app.services.crypto import decrypt_token
        async with TestingSessionLocal() as db:
            db_res = await db.execute(select(RepoValidator).where(RepoValidator.id == rv_id))
            rv_row = db_res.scalars().first()
            assert rv_row.github_token.startswith("enc:"), "Token in DB must be encrypted at rest"
            assert decrypt_token(rv_row.github_token) == "ghp_super_secret_pat_999"

        # 7. RBAC: Normal user denied access to /processes/{id}/details
        p_res = await ac.get("/api/processes/1/details", headers=user_headers)
        assert p_res.status_code == 403, "Non-admin must be forbidden from process details"

@pytest.mark.asyncio
async def test_plan_modification_workflow():
    """Verify that a validator can modify an implementation plan and provide adjustment prompts for Gemini."""
    from sqlalchemy import select
    from app.models.prompt_task import PromptTask
    from app.services.run_task import call_gemini_plan

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_reg = await ac.post("/api/auth/register", json={
            "email": "adminmod@vibemanager.ai",
            "name": "Admin Mod",
            "password": "Password123!"
        })
        if admin_reg.status_code == 200:
            admin_token = admin_reg.json()["access_token"]
        else:
            admin_login = await ac.post("/api/auth/login", json={
                "email": "adminmod@vibemanager.ai",
                "password": "Password123!"
            })
            admin_token = admin_login.json()["access_token"]

        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Create or get project
        proj_res = await ac.get("/api/projects", headers=admin_headers)
        if proj_res.status_code == 200 and len(proj_res.json()) > 0:
            proj_id = proj_res.json()[0]["id"]
        else:
            p_res = await ac.post("/api/projects", json={
                "name": "Proyecto Mod",
                "repo_url": "https://github.com/vibe/mod-repo",
                "default_branch": "main"
            }, headers=admin_headers)
            proj_id = p_res.json()["id"]

        prompt_res = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Implementar módulo de exportación de informes en PDF"
        }, headers=admin_headers)
        task_id = prompt_res.json()["id"]

        # Simulate task in PLAN_PENDING status with an initial plan
        async with TestingSessionLocal() as session:
            q = await session.execute(select(PromptTask).where(PromptTask.id == task_id))
            task_row = q.scalars().first()
            task_row.status = "PLAN_PENDING"
            task_row.plan_content = "# Plan Inicial\n- Crear endpoint /api/export/pdf\n- Modificar schema en PostgreSQL"
            await session.commit()

        # 1. Modify the plan via validator endpoint
        modify_res = await ac.post(f"/api/validation/tasks/{task_id}/modify-plan", json={
            "edited_plan": "# Plan Inicial (Corregido)\n- Crear endpoint /api/export/pdf\n- Usar almacenamiento temporal sin alterar PostgreSQL",
            "modification_prompt": "Por favor no modifiques la base de datos PostgreSQL; genera el PDF en memoria y streamed al cliente."
        }, headers=admin_headers)

        assert modify_res.status_code == 200, f"Error modifying plan: {modify_res.text}"
        data = modify_res.json()
        assert data["plan_feedback"] == "Por favor no modifiques la base de datos PostgreSQL; genera el PDF en memoria y streamed al cliente."
        assert "sin alterar PostgreSQL" in data["plan_content"]
        assert data["status"] in ["APPROVED", "RUNNING", "PLAN_PENDING"]

        # 2. Verify invalid status check: attempting to modify a task not in PLAN_PENDING fails
        async with TestingSessionLocal() as session:
            q = await session.execute(select(PromptTask).where(PromptTask.id == task_id))
            task_row = q.scalars().first()
            task_row.status = "COMPLETED"
            await session.commit()

        bad_status_res = await ac.post(f"/api/validation/tasks/{task_id}/modify-plan", json={
            "edited_plan": "Nuevo plan",
            "modification_prompt": "Ajuste adicional"
        }, headers=admin_headers)
        assert bad_status_res.status_code == 400
        assert "Solo se pueden modificar tareas en estado 'PLAN_PENDING'" in bad_status_res.json()["detail"]

        # 3. Verify runner call_gemini_plan handles previous_plan and modification_feedback
        plan_out = call_gemini_plan(
            prompt="Implementar exportación PDF",
            project_name="test-project",
            api_key="", # automated fallback template
            previous_plan="# Plan V1",
            modification_feedback="Usar almacenamiento temporal"
        )
        assert "test-project" in plan_out["summary"]
        assert "Usar almacenamiento temporal" in plan_out["plan_markdown"]
        assert "Ajustes del validador" in plan_out["plan_markdown"]


@pytest.mark.asyncio
async def test_user_token_quota_and_contexts_workflow():
    """Verify 5-hour quota tracking, personal context management, privacy isolation, and admin controls."""
    from sqlalchemy import select
    from app.models.user import User
    from app.models.prompt_task import PromptTask
    from app.models.user_context import UserContext
    from app.services.run_task import call_gemini_plan, call_gemini
    from app.services.queue_worker import process_prompt_task

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Admin setup
        admin_reg = await ac.post("/api/auth/register", json={
            "email": "adminquota@vibemanager.ai",
            "name": "Admin Quota",
            "password": "Password123!"
        })
        if admin_reg.status_code == 200:
            admin_token = admin_reg.json()["access_token"]
        else:
            admin_login = await ac.post("/api/auth/login", json={
                "email": "adminquota@vibemanager.ai",
                "password": "Password123!"
            })
            admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Create invitation code for user registration
        inv_res = await ac.post("/api/admin/invitations", json={"max_uses": 10, "expires_in_days": 10}, headers=admin_headers)
        assert inv_res.status_code == 200, inv_res.text
        invite_code = inv_res.json()["code"]

        # 2. Register User 1 and User 2
        u1_res = await ac.post("/api/auth/register", json={
            "email": "user1_quota@vibemanager.ai",
            "name": "User One",
            "password": "Password123!",
            "invite_code": invite_code
        })
        assert u1_res.status_code == 200, u1_res.text
        u1_token = u1_res.json()["access_token"]
        u1_headers = {"Authorization": f"Bearer {u1_token}"}

        u2_res = await ac.post("/api/auth/register", json={
            "email": "user2_quota@vibemanager.ai",
            "name": "User Two",
            "password": "Password123!",
            "invite_code": invite_code
        })
        assert u2_res.status_code == 200, u2_res.text
        u2_token = u2_res.json()["access_token"]
        u2_headers = {"Authorization": f"Bearer {u2_token}"}

        # 3. Check Initial Quota for User 1
        q_res = await ac.get("/api/quotas/my-quota", headers=u1_headers)
        assert q_res.status_code == 200
        q_data = q_res.json()
        assert q_data["token_quota_limit"] == 100000
        assert q_data["tokens_used_in_window"] == 0
        assert q_data["tokens_remaining"] == 100000
        assert q_data["percentage_used"] == 0.0
        assert q_data["is_exceeded"] is False

        # 4. User 1 creates a personal context
        ctx_payload = {
            "identifier": "backend-fastapi-rules",
            "name": "Directivas FastAPI",
            "description": "Estilo de código y convenciones backend",
            "context_text": "Utilizar siempre tipos estrictos de Pydantic v2 y async sessions con SQLAlchemy."
        }
        create_ctx_res = await ac.post("/api/contexts", json=ctx_payload, headers=u1_headers)
        assert create_ctx_res.status_code in (200, 201), create_ctx_res.text
        ctx1_data = create_ctx_res.json()
        ctx1_id = ctx1_data["id"]
        assert ctx1_data["identifier"] == "backend-fastapi-rules"
        assert ctx1_data["character_count"] > 0
        assert ctx1_data["estimated_tokens"] > 0

        # Duplicate identifier for same user fails
        dup_res = await ac.post("/api/contexts", json=ctx_payload, headers=u1_headers)
        assert dup_res.status_code == 400
        assert "Ya tienes un contexto con el identificador" in dup_res.json()["detail"]

        # 5. PRIVACY ISOLATION: User 2 CANNOT access or delete User 1's context
        u2_get_res = await ac.get(f"/api/contexts/{ctx1_id}", headers=u2_headers)
        assert u2_get_res.status_code == 404

        u2_del_res = await ac.delete(f"/api/contexts/{ctx1_id}", headers=u2_headers)
        assert u2_del_res.status_code == 404

        u2_list = await ac.get("/api/contexts", headers=u2_headers)
        assert u2_list.status_code == 200
        assert len(u2_list.json()) == 0

        # 6. Live Token Estimation endpoint
        est_res = await ac.post("/api/contexts/estimate", json={
            "prompt": "Crear un nuevo endpoint de estadísticas",
            "context_id": ctx1_id
        }, headers=u1_headers)
        assert est_res.status_code == 200
        est_data = est_res.json()
        assert est_data["prompt_tokens_estimated"] > 0
        assert est_data["context_tokens_estimated"] == ctx1_data["estimated_tokens"]
        assert est_data["total_tokens_estimated"] == est_data["prompt_tokens_estimated"] + est_data["context_tokens_estimated"]
        assert est_data["fits_in_quota"] is True

        # 7. Create Project and Prompt with Context
        proj_res = await ac.post("/api/projects", json={
            "name": "Quota Test Project",
            "repo_url": "https://github.com/vibe/quota-test",
            "default_branch": "main"
        }, headers=admin_headers)
        proj_id = proj_res.json()["id"]

        # 7. Context validation requirement: using context in PENDING status fails
        prompt_fail = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Generar servicios de auditoría",
            "context_id": ctx1_id
        }, headers=u1_headers)
        assert prompt_fail.status_code == 400
        assert "Solo se pueden utilizar contextos completamente aceptados" in prompt_fail.json()["detail"]

        # Validator approves raw context -> status = APPROVED
        app_raw = await ac.post(f"/api/validation/contexts/{ctx1_id}/approve", headers=admin_headers)
        assert app_raw.status_code == 200

        # Simulate context plan generated -> PLAN_PENDING
        async with TestingSessionLocal() as session:
            ctx_db = (await session.execute(select(UserContext).where(UserContext.id == ctx1_id))).scalars().first()
            ctx_db.status = "PLAN_PENDING"
            ctx_db.plan_markdown = "## Plan de Contexto Técnico para Auditoría"
            await session.commit()

        # Validator approves context plan -> status = ACCEPTED
        app_plan = await ac.post(f"/api/validation/contexts/{ctx1_id}/approve-plan", headers=admin_headers)
        assert app_plan.status_code == 200
        assert app_plan.json()["status"] == "ACCEPTED"

        # Now prompt with ACCEPTED context succeeds
        prompt_res = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Generar servicios de auditoría",
            "context_id": ctx1_id
        }, headers=u1_headers)
        assert prompt_res.status_code == 200
        task_data = prompt_res.json()
        task_id = task_data["id"]
        assert task_data["context_id"] == ctx1_id

        # 8. Simulate token deduction and verify runner usage metadata
        gemini_out = call_gemini_plan(
            prompt="Generar servicios de auditoría",
            project_name="quota-test",
            api_key="",
            context_text="Utilizar tipos estrictos"
        )
        assert gemini_out["usage_metadata"]["total_tokens"] > 0

        from app.models.user_token_log import UserTokenLog
        async with TestingSessionLocal() as session:
            q_u = await session.execute(select(User).where(User.email == "user1_quota@vibemanager.ai"))
            u_row = q_u.scalars().first()
            u_row.tokens_used_in_window = 500
            token_log = UserTokenLog(
                user_id=u_row.id,
                task_id=task_id,
                context_id=ctx1_id,
                tokens_prompt=350,
                tokens_completion=150,
                tokens_total=500,
                tokens_cached=0
            )
            session.add(token_log)
            await session.commit()

        # Check that user's quota updated and token log created
        q_after = await ac.get("/api/quotas/my-quota", headers=u1_headers)
        assert q_after.status_code == 200
        q_after_data = q_after.json()
        assert q_after_data["tokens_used_in_window"] == 500
        assert q_after_data["tokens_remaining"] == 99500
        assert len(q_after_data["recent_logs"]) > 0
        assert q_after_data["recent_logs"][0]["task_id"] == task_id
        assert q_after_data["recent_logs"][0]["tokens_total"] == 500

        # 9. Admin Quota Management
        admin_quotas_res = await ac.get("/api/admin/quotas", headers=admin_headers)
        assert admin_quotas_res.status_code == 200
        quotas_list = admin_quotas_res.json()
        u1_quota_entry = next((q for q in quotas_list if q["email"] == "user1_quota@vibemanager.ai"), None)
        assert u1_quota_entry is not None
        assert u1_quota_entry["tokens_used_in_window"] > 0

        # Admin lowers User 1's quota below used amount to trigger HTTP 429
        update_q_res = await ac.put(f"/api/admin/quotas/{u1_quota_entry['user_id']}", json={
            "token_quota_limit": 10,
            "quota_window_hours": 5
        }, headers=admin_headers)
        assert update_q_res.status_code == 200
        assert update_q_res.json()["token_quota_limit"] == 10
        assert update_q_res.json()["is_exceeded"] is True

        # User 1 attempting to send prompt now gets HTTP 429
        rejected_prompt = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Este prompt debe ser bloqueado por cuota"
        }, headers=u1_headers)
        assert rejected_prompt.status_code == 429
        assert "Has agotado tu cuota de tokens" in rejected_prompt.json()["detail"]

        # Admin resets User 1's quota
        reset_res = await ac.post(f"/api/admin/quotas/{u1_quota_entry['user_id']}/reset", headers=admin_headers)
        assert reset_res.status_code == 200

        # Now User 1 quota is 0 used and prompt is accepted again
        q_reset = await ac.get("/api/quotas/my-quota", headers=u1_headers)
        assert q_reset.json()["tokens_used_in_window"] == 0

        # 10. Admin views all contexts and deletes User 1's context
        admin_ctx_res = await ac.get("/api/admin/contexts", headers=admin_headers)
        assert admin_ctx_res.status_code == 200
        all_contexts = admin_ctx_res.json()
        assert any(c["id"] == ctx1_id for c in all_contexts)

        del_admin_res = await ac.delete(f"/api/admin/contexts/{ctx1_id}", headers=admin_headers)
        assert del_admin_res.status_code == 200

        # User 1 no longer has the context
        u1_ctx_res = await ac.get("/api/contexts", headers=u1_headers)
        assert len(u1_ctx_res.json()) == 0


@pytest.mark.asyncio
async def test_context_full_lifecycle_and_iteration():
    """
    Test complete lifecycle of a user context:
    1. Creation by user -> PENDING, version 1
    2. Validator edits raw text and approves -> APPROVED
    3. Gemini Context Plan generated -> PLAN_PENDING
    4. Validator modifies context plan with feedback
    5. Validator approves context plan -> ACCEPTED
    6. Context is available in /api/contexts/accepted and usable in prompt
    7. User iterates on the context (modifies text) -> returns to PENDING, version 2
    8. Context is immediately blocked from new prompts until re-approved
    """
    from sqlalchemy import select
    from app.models.user_context import UserContext

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        admin_reg = await ac.post("/api/auth/register", json={
            "email": "admin_ctx_flow@vibemanager.ai",
            "name": "Admin Ctx",
            "password": "Password123!"
        })
        if admin_reg.status_code == 200:
            admin_token = admin_reg.json()["access_token"]
        else:
            admin_login = await ac.post("/api/auth/login", json={
                "email": "admin_ctx_flow@vibemanager.ai",
                "password": "Password123!"
            })
            admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        inv_res = await ac.post("/api/admin/invitations", json={"max_uses": 10, "expires_in_days": 10}, headers=admin_headers)
        invite_code = inv_res.json()["code"]

        dev_res = await ac.post("/api/auth/register", json={
            "email": "dev_ctx_flow@vibemanager.ai",
            "name": "Dev User",
            "password": "Password123!",
            "invite_code": invite_code
        })
        dev_token = dev_res.json()["access_token"]
        dev_headers = {"Authorization": f"Bearer {dev_token}"}

        val_res_reg = await ac.post("/api/auth/register", json={
            "email": "val_ctx_flow@vibemanager.ai",
            "name": "Validator User",
            "password": "Password123!",
            "invite_code": invite_code
        })
        val_token = val_res_reg.json()["access_token"]
        val_user_id = val_res_reg.json()["user"]["id"]
        val_headers = {"Authorization": f"Bearer {val_token}"}

        # Project & RepoValidator
        proj_res = await ac.post("/api/projects", json={
            "name": "Context Lifecycle Project",
            "repo_url": "https://github.com/vibe/ctx-lifecycle",
            "default_branch": "main"
        }, headers=admin_headers)
        proj_id = proj_res.json()["id"]

        rv_res = await ac.post("/api/repo-validators", json={
            "repo_url": "https://github.com/vibe/ctx-lifecycle",
            "repo_name": "ctx-lifecycle",
            "default_branch": "main",
            "github_token": "ghp_mocktokenforctx12345678901234567890"
        }, headers=val_headers)
        rv_id = rv_res.json()["id"]

        # 1. Dev creates context assigned to this validator
        create_res = await ac.post("/api/contexts", json={
            "identifier": "backend-architecture-guidelines",
            "name": "Guías de Arquitectura Backend",
            "description": "Reglas de arquitectura limpia",
            "context_text": "Todos los endpoints deben retornar Pydantic models estructurados y manejar excepciones.",
            "repo_validator_id": rv_id
        }, headers=dev_headers)
        assert create_res.status_code in (200, 201)
        ctx_data = create_res.json()
        ctx_id = ctx_data["id"]
        assert ctx_data["status"] == "PENDING"
        assert ctx_data["version"] == 1
        assert ctx_data["assigned_validator_id"] == val_user_id

        # Dev's accepted list is empty
        acc_list = await ac.get("/api/contexts/accepted", headers=dev_headers)
        assert len(acc_list.json()) == 0

        # Attempt to use PENDING context in prompt fails with 400
        bad_prompt = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Crear microservicio de facturación",
            "context_id": ctx_id
        }, headers=dev_headers)
        assert bad_prompt.status_code == 400
        assert "Solo se pueden utilizar contextos completamente aceptados" in bad_prompt.json()["detail"]

        # 2. Validator checks pending contexts
        val_ctx_list = await ac.get("/api/validation/contexts", headers=val_headers)
        assert val_ctx_list.status_code == 200
        assert any(c["id"] == ctx_id for c in val_ctx_list.json())

        # Validator edits raw text
        edit_res = await ac.put(f"/api/validation/contexts/{ctx_id}/edit", json={
            "edited_text": "Todos los endpoints deben retornar Pydantic v2 schemas estrictos y loguear con structlog."
        }, headers=val_headers)
        assert edit_res.status_code == 200
        assert edit_res.json()["edited_text"] == "Todos los endpoints deben retornar Pydantic v2 schemas estrictos y loguear con structlog."

        # Validator approves raw text
        app_raw_res = await ac.post(f"/api/validation/contexts/{ctx_id}/approve", headers=val_headers)
        assert app_raw_res.status_code == 200
        assert app_raw_res.json()["status"] in ["APPROVED", "PLAN_PENDING"]

        # Simulate Gemini Context Plan generation (PLAN_PENDING)
        async with TestingSessionLocal() as session:
            c_row = (await session.execute(select(UserContext).where(UserContext.id == ctx_id))).scalars().first()
            c_row.status = "PLAN_PENDING"
            c_row.plan_markdown = "# Plan de Contexto para Arquitectura\n## 1. Reglas\n- Pydantic estricto."
            await session.commit()

        # 3. Validator modifies plan
        mod_plan_res = await ac.post(f"/api/validation/contexts/{ctx_id}/modify-plan", json={
            "plan_markdown": "# Plan de Contexto Técnico Mejorado\n## 1. Reglas\n- Pydantic v2 estricto.\n- Structlog obligatorio."
        }, headers=val_headers)
        assert mod_plan_res.status_code == 200
        assert "Structlog obligatorio" in mod_plan_res.json()["plan_markdown"]

        # 4. Validator approves the context plan -> ACCEPTED
        app_plan_res = await ac.post(f"/api/validation/contexts/{ctx_id}/approve-plan", headers=val_headers)
        assert app_plan_res.status_code == 200
        assert app_plan_res.json()["status"] == "ACCEPTED"
        assert app_plan_res.json()["accepted_text"] is not None

        # 5. Dev sees context in /accepted list
        acc_list2 = await ac.get("/api/contexts/accepted", headers=dev_headers)
        assert len(acc_list2.json()) == 1
        assert acc_list2.json()[0]["id"] == ctx_id

        # Dev can submit prompt with the ACCEPTED context
        good_prompt = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Crear microservicio de facturación",
            "context_id": ctx_id
        }, headers=dev_headers)
        assert good_prompt.status_code == 200
        assert good_prompt.json()["context_id"] == ctx_id

        # 6. Dev iterates on the context (modifies text)
        iter_res = await ac.put(f"/api/contexts/{ctx_id}", json={
            "context_text": "Nueva versión: Todos los endpoints deben usar FastAPI Dependencies y tests con Pytest."
        }, headers=dev_headers)
        assert iter_res.status_code == 200
        iter_data = iter_res.json()
        assert iter_data["version"] == 2
        assert iter_data["status"] == "PENDING"
        assert iter_data["plan_markdown"] is None

        # Immediately blocked from new prompts again!
        blocked_prompt = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Crear segundo microservicio",
            "context_id": ctx_id
        }, headers=dev_headers)
        assert blocked_prompt.status_code == 400
        assert "Solo se pueden utilizar contextos completamente aceptados" in blocked_prompt.json()["detail"]


@pytest.mark.asyncio
async def test_temporal_context_and_cost_breakdown():
    """Verify temporal context generation, token breakdown, chaining, and merge on plan approval."""
    from sqlalchemy import select
    from app.models.user_context import UserContext
    from app.models.prompt_task import PromptTask

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        admin_res = await ac.post("/api/auth/register", json={
            "email": "admin_temp@vibemanager.ai",
            "name": "Admin Temporal",
            "password": "Password123!"
        })
        admin_token = admin_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        inv_res = await ac.post("/api/admin/invitations", json={"max_uses": 5, "expires_in_days": 10}, headers=admin_headers)
        invite_code = inv_res.json()["code"]

        # 1. Register test project
        proj_res = await ac.post("/api/projects", json={
            "name": "Temporal Context Demo",
            "repo_url": "https://github.com/acme/temporal-demo",
            "default_branch": "main",
            "github_token": "ghp_temporal_secret"
        }, headers=admin_headers)
        assert proj_res.status_code == 200
        proj_id = proj_res.json()["id"]

        # 2. Register developer user
        dev_email = "dev_temporal@acme.com"
        reg_res = await ac.post("/api/auth/register", json={
            "email": dev_email,
            "name": "Dev Temporal",
            "password": "TemporalPassword123!",
            "invite_code": invite_code
        })
        assert reg_res.status_code == 200
        dev_token = reg_res.json()["access_token"]
        dev_headers = {"Authorization": f"Bearer {dev_token}"}

        # 3. Create context and accept it
        ctx_create = await ac.post("/api/contexts", json={
            "identifier": "backend-standards",
            "name": "Backend Standards",
            "context_text": "Todos los endpoints deben retornar Pydantic models estructurados y tipados con FastAPI."
        }, headers=dev_headers)
        assert ctx_create.status_code == 200
        ctx_id = ctx_create.json()["id"]

        # Admin approves raw context
        await ac.post(f"/api/validation/contexts/{ctx_id}/approve", headers=admin_headers)

        # Simulate Gemini Context Plan generation (PLAN_PENDING)
        async with TestingSessionLocal() as session:
            c_row = (await session.execute(select(UserContext).where(UserContext.id == ctx_id))).scalars().first()
            c_row.status = "PLAN_PENDING"
            c_row.plan_markdown = "# Plan Técnico para Backend Standards\n- Pydantic estricto."
            await session.commit()

        # Admin approves context plan -> status = ACCEPTED
        app_res = await ac.post(f"/api/validation/contexts/{ctx_id}/approve-plan", headers=admin_headers)
        assert app_res.status_code == 200
        assert app_res.json()["status"] == "ACCEPTED"

        # 4. Estimate tokens with prompt + context
        est_res = await ac.post("/api/contexts/estimate", json={
            "prompt": "Generar endpoint de pagos con Stripe",
            "context_id": ctx_id
        }, headers=dev_headers)
        assert est_res.status_code == 200
        est_data = est_res.json()
        assert est_data["prompt_tokens_estimated"] > 0
        assert est_data["context_tokens_estimated"] > 0
        assert est_data["total_tokens_estimated"] == est_data["prompt_tokens_estimated"] + est_data["context_tokens_estimated"]

        # 5. Submit task 1 with fixed context
        task1_res = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Implementar módulo de checkout con Stripe",
            "context_id": ctx_id
        }, headers=dev_headers)
        assert task1_res.status_code == 200
        task1_data = task1_res.json()
        task1_id = task1_data["id"]
        assert task1_data["temporal_context_status"] == "ACTIVE"
        assert task1_data["tokens_fixed_context"] > 0

        # Simulate task 1 validator plan generation
        async with TestingSessionLocal() as session:
            t1 = (await session.execute(select(PromptTask).where(PromptTask.id == task1_id))).scalars().first()
            t1.status = "PLAN_PENDING"
            t1.plan_content = "### Plan Stripe\n1. Añadir stripe-python\n2. Crear webhook handler con verificación de firma HMAC."
            t1.temporal_context = "### Plan Stripe\n1. Añadir stripe-python\n2. Crear webhook handler con verificación de firma HMAC."
            await session.commit()

        # 6. Verify active temporal tasks endpoint
        temp_list = await ac.get("/api/contexts/temporal/active", headers=dev_headers)
        assert temp_list.status_code == 200
        active_ids = [t["id"] for t in temp_list.json()]
        assert task1_id in active_ids

        # 7. Submit task 2 chaining task 1's temporal context
        task2_res = await ac.post("/api/prompts", json={
            "project_id": proj_id,
            "prompt": "Añadir tests para los webhooks de Stripe",
            "context_id": ctx_id,
            "temporal_task_id": task1_id
        }, headers=dev_headers)
        assert task2_res.status_code == 200
        task2_data = task2_res.json()
        task2_id = task2_data["id"]
        assert task2_data["tokens_temporal_context"] > 0

        # Simulate plan for task 2 and reject it
        async with TestingSessionLocal() as session:
            t2 = (await session.execute(select(PromptTask).where(PromptTask.id == task2_id))).scalars().first()
            t2.status = "PLAN_PENDING"
            await session.commit()

        t2_rej = await ac.post(f"/api/validation/tasks/{task2_id}/reject-plan", json={
            "rejection_reason": "No se contemplaron los tests con pytest-mock."
        }, headers=admin_headers)
        assert t2_rej.status_code == 200
        assert t2_rej.json()["temporal_context_status"] == "DISCARDED"

        # 8. Approve plan on task 1 -> triggers evolution & merge into fixed context!
        t1_app = await ac.post(f"/api/validation/tasks/{task1_id}/approve-plan", headers=admin_headers)
        assert t1_app.status_code == 200
        assert t1_app.json()["temporal_context_status"] == "MERGED"

        # Check that fixed context evolved and version incremented
        ctx_check = await ac.get(f"/api/contexts/{ctx_id}", headers=dev_headers)
        assert ctx_check.status_code == 200
        ctx_data = ctx_check.json()
        assert ctx_data["version"] >= 2
        assert "Evolución Incorporada" in ctx_data["context_text"]
        assert "Stripe" in ctx_data["context_text"]



