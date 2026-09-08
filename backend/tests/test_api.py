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
    assert os.path.exists("alembic.ini")
    cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1
    assert heads[0] == "0002_plan_fb"

    # Check migration revision head details
    head_revision = script.get_revision(heads[0])
    assert "add plan_feedback to prompt_tasks" in head_revision.doc


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
