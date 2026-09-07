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
