# API Reference & Protocols
## Vibe Manager AI REST & WebSocket API

This specification provides exhaustive documentation of all REST endpoints and WebSocket protocols exposed by the Vibe Manager AI backend.

---

## 1. General Principles

### 1.1 Base URLs
- **Unified Gateway (Port 80):** `http://localhost/api`
- **Direct Backend REST API:** `http://localhost:8000/api`
- **Direct Frontend Application:** `http://localhost:3010`
- **Local WebSocket Endpoint:** `ws://localhost/api/chat/ws` (or `ws://localhost:8000/api/chat/ws`)
- **Interactive Swagger Documentation:** `http://localhost/docs` (or `http://localhost:8000/docs`)
- **Interactive ReDoc Documentation:** `http://localhost:8000/redoc`

### 1.2 Authentication Header
All protected endpoints require a valid JSON Web Token (JWT) transmitted in the standard `Authorization` HTTP header:
```http
Authorization: Bearer <your_jwt_access_token>
```

### 1.3 Error Response Schema
All HTTP errors return standard JSON formatted according to FastAPI/Starlette standards:
```json
{
  "detail": "Error message description"
}
```

---

## 2. Authentication (`/api/auth`)

### 2.1 Verify Invitation
- **Endpoint:** `GET /api/auth/verify-invite`
- **Access:** Public
- **Query Parameters:**
  - `token` *(optional, string)*: Invitation token.
  - `code` *(optional, string)*: Invitation code (e.g. `VIBE-A1B2C3`).
- **Response (200 OK):**
  ```json
  {
    "valid": true,
    "code": "VIBE-A1B2C3",
    "token": "d8f4e2..."
  }
  ```

### 2.2 Register User
- **Endpoint:** `POST /api/auth/register`
- **Access:** Public (requires valid invite token/code, unless initial system boot)
- **Request Body:**
  ```json
  {
    "email": "developer@example.com",
    "name": "Jane Doe",
    "password": "SecurePassword123!",
    "invite_code": "VIBE-A1B2C3",
    "invite_token": "optional_token_string"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": 2,
      "email": "developer@example.com",
      "name": "Jane Doe",
      "role": "user",
      "is_active": true,
      "is_banned": false,
      "created_at": "2026-09-06T12:00:00Z"
    }
  }
  ```

### 2.3 User Login
- **Endpoint:** `POST /api/auth/login`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "developer@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response (200 OK):** Returns `TokenResponse` with `access_token` and `user` payload.
- **Errors:**
  - `401 Unauthorized`: Incorrect email or password.
  - `403 Forbidden`: Account banned by administrator.

### 2.4 Get Current Profile
- **Endpoint:** `GET /api/auth/me`
- **Access:** Authenticated user

---

## 3. Administration Console (`/api/admin`)
*All endpoints in this group require the `admin` role.*

### 3.1 Platform Statistics
- **Endpoint:** `GET /api/admin/stats`
- **Response (200 OK):**
  ```json
  {
    "users": {
      "total": 14,
      "banned": 1,
      "validators": 3
    },
    "prompts": {
      "total": 28,
      "pending": 4,
      "running": 1,
      "completed_prs": 21
    },
    "projects_total": 3
  }
  ```

### 3.2 List Users
- **Endpoint:** `GET /api/admin/users?skip=0&limit=100`

### 3.3 Ban User
- **Endpoint:** `POST /api/admin/users/{user_id}/ban`
- **Description:** Instantly revokes system access. Admin cannot self-ban.

### 3.4 Unban User
- **Endpoint:** `POST /api/admin/users/{user_id}/unban`

### 3.5 Change User Role
- **Endpoint:** `POST /api/admin/users/{user_id}/role`
- **Request Body:** `{"role": "validator" | "user" | "admin"}`

### 3.6 Create Invitation
- **Endpoint:** `POST /api/admin/invitations`
- **Request Body:**
  ```json
  {
    "max_uses": 5,
    "expires_in_days": 30
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "id": 7,
    "code": "VIBE-F4E8D1",
    "token": "r9a_Token_String...",
    "invite_url": "http://localhost:3010/register?invite=r9a_Token_String...",
    "max_uses": 5,
    "used_count": 0,
    "is_active": true,
    "expires_at": "2026-10-06T12:00:00Z",
    "whatsapp_share_url": "https://wa.me/?text=...",
    "email_share_url": "mailto:?subject=...&body=..."
  }
  ```

### 3.7 List Invitations
- **Endpoint:** `GET /api/admin/invitations`

### 3.8 Revoke Invitation
- **Endpoint:** `DELETE /api/admin/invitations/{invitation_id}`

### 3.9 Get Gemini AI Settings
- **Endpoint:** `GET /api/admin/settings/gemini`
- **Access:** `admin` role required.
- **Response (200 OK):**
  ```json
  {
    "has_api_key": true,
    "active_model": "gemini-3.6-flash",
    "available_models": [
      "gemini-3.6-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-2.5-flash"
    ]
  }
  ```

### 3.10 Update Gemini AI Settings
- **Endpoint:** `POST /api/admin/settings/gemini`
- **Access:** `admin` role required.
- **Request Body:**
  ```json
  {
    "api_key": "AIzaSy...",
    "model": "gemini-3.6-flash"
  }
  ```
- **Response (200 OK):** Returns success status and updated configuration summary.

---

## 4. Projects Management (`/api/projects`)

### 4.1 List Projects
- **Endpoint:** `GET /api/projects`
- **Access:** Authenticated. For regular users, lists only `is_active: true` projects.

### 4.2 Create Project
- **Endpoint:** `POST /api/projects`
- **Access:** `admin` role required.
- **Request Body:**
  ```json
  {
    "name": "E-Commerce App",
    "description": "Next.js online store frontend",
    "repo_url": "https://github.com/my-org/store-web",
    "default_branch": "main",
    "github_token": "ghp_PersonalAccessToken...",
    "system_prompt_rules": "Use Tailwind CSS and TypeScript strict mode.",
    "is_active": true
  }
  ```

### 4.3 Update / Delete Project
- **Endpoints:** `PUT /api/projects/{id}` and `DELETE /api/projects/{id}`
- **Access:** `admin` role required.

---

## 5. Prompts & Tasks (`/api/prompts`)

### 5.1 Submit Prompt
- **Endpoint:** `POST /api/prompts`
- **Access:** Authenticated user
- **Request Body:**
  ```json
  {
    "project_id": 1,
    "prompt": "Add an export to CSV button on the customer table component."
  }
  ```
- **Response (200 OK):** Returns the created `PromptTask` record with status `PENDING`.

### 5.2 List My Prompts
- **Endpoint:** `GET /api/prompts/my`
- **Access:** Authenticated user

### 5.3 Get Prompt Details
- **Endpoint:** `GET /api/prompts/{prompt_id}`
- **Access:** Task owner, validator, or admin.

### 5.4 List My Pull Requests
- **Endpoint:** `GET /api/prompts/prs`
- **Access:** Authenticated user
- **Description:** Returns all completed prompt tasks created by the current user that have an associated GitHub Pull Request (`pr_url is not null`), sorted by creation date descending.
- **Response (200 OK):**
  ```json
  [
    {
      "id": 14,
      "project_id": 2,
      "user_id": 3,
      "original_prompt": "Add search bar to user table",
      "edited_prompt": null,
      "status": "COMPLETED",
      "branch_name": "vibe/task-14-a9f2",
      "commit_message": "feat: add user table search filter",
      "pr_url": "https://github.com/my-org/web-app/pull/12",
      "pr_number": 12,
      "execution_logs": "[VIBE-RUNNER] Execution completed successfully.",
      "created_at": "2026-09-06T15:30:00Z"
    }
  ]
  ```

---

## 6. Validation Desk (`/api/validation`)
*Endpoints in this group require the `validator` or `admin` role.*

### 6.1 List Tasks for Review
- **Endpoint:** `GET /api/validation/tasks?status_filter=PENDING`
- **Filters:** `PENDING`, `APPROVED`, `RUNNING`, `COMPLETED`, `REJECTED`, or omit for all.

### 6.2 Edit Prompt Instructions
- **Endpoint:** `PUT /api/validation/tasks/{task_id}/edit`
- **Request Body:**
  ```json
  {
    "edited_prompt": "Add an export to CSV button using papaparse and Lucide download icon."
  }
  ```

### 6.3 Approve Task (Trigger Docker Execution)
- **Endpoint:** `POST /api/validation/tasks/{task_id}/approve`
- **Description:** Sets task status to `APPROVED`, records validator identity, and enqueues task into the Docker background runner queue.

### 6.4 Reject Task
- **Endpoint:** `POST /api/validation/tasks/{task_id}/reject`
- **Request Body:**
  ```json
  {
    "rejection_reason": "Out of scope for this sprint; please file an issue instead."
  }
  ```

### 6.5 Retry Failed Task
- **Endpoint:** `POST /api/validation/tasks/{task_id}/retry`

---

## 7. Real-Time Chat System (`/api/chat`)

### 7.1 List Conversation Threads
- **Endpoint:** `GET /api/chat/threads`
- **Behavior:**
  - If requested by an `admin`: returns all users with unread counters and message snippets.
  - If requested by a standard `user`: returns the conversation thread with the Administrator.

### 7.2 Get Messages with User
- **Endpoint:** `GET /api/chat/messages/{other_user_id}`
- **Behavior:** Returns message history in chronological order and automatically marks unread messages as read.

### 7.3 Send Message (REST)
- **Endpoint:** `POST /api/chat/messages`
- **Request Body:**
  ```json
  {
    "recipient_id": 1,
    "content": "Hello Administrator, could you review task #12?"
  }
  ```

### 7.4 Real-Time WebSocket Connection
- **Protocol:** `ws://` / `wss://`
- **Endpoint:** `/api/chat/ws?token=<jwt_access_token>`
- **Connection Handshake:**
  - Client sends JWT as query parameter `token`.
  - Backend verifies signature. If invalid or expired, closes socket with code `1008 Policy Violation`.
- **Sending a Message over WebSocket:**
  ```json
  {
    "recipient_id": 1,
    "content": "Real-time message content"
  }
  ```
- **Receiving a Message:**
  ```json
  {
    "id": 104,
    "sender_id": 1,
    "recipient_id": 2,
    "sender_name": "Administrator",
    "recipient_name": "Jane Doe",
    "content": "Checking it now!",
    "created_at": "2026-09-06T12:05:00Z",
    "is_read": false
  }
  ```

---

## 8. Real-Time Process Monitor & Live Console (`/api/processes`)

### 8.1 Active Processes and Recent Tasks
- **Endpoint:** `GET /api/processes/active`
- **Access:** Authenticated user
- **Response (200 OK):**
  ```json
  {
    "running_count": 1,
    "pending_count": 0,
    "processes": [
      {
        "id": 15,
        "project_id": 2,
        "project_name": "Online Store",
        "user_id": 3,
        "user_name": "Jane Doe",
        "original_prompt": "Add cart badge",
        "edited_prompt": null,
        "status": "RUNNING",
        "stage": "Clonando repositorio GitHub...",
        "duration_seconds": 24,
        "error_message": null,
        "branch_name": "vibe/task-15-a1b2c3",
        "pr_url": null,
        "pr_number": null,
        "created_at": "2026-09-06T19:30:00Z",
        "updated_at": "2026-09-06T19:30:24Z"
      }
    ]
  }
  ```

### 8.2 Process Details
- **Endpoint:** `GET /api/processes/{task_id}/details`
- **Access:** Authenticated user
- **Response (200 OK):** Returns detailed process summary with accumulated execution logs and failure reason if applicable.

### 8.3 Live Console Streaming (WebSocket)
- **Protocol:** `ws://` / `wss://`
- **Endpoint:** `/api/processes/{task_id}/console`
- **Behavior:**
  - Upon connection, sends `init` event with existing logs and current stage.
  - While running, streams live `log` lines emitted from the runner in real-time.
  - Emits `stage` event when phase changes (e.g., *Cloning*, *Invoking Gemini*, *Pushing PR*).
  - Emits `finish` event when execution completes or fails, with final status and concise `error` message.

### 8.4 Stop / Kill Process
- **Endpoint:** `POST /api/processes/{task_id}/stop`
- **Access:** Task owner, `validator`, or `admin`
- **Behavior:**
  - If task is in queue (`PENDING` or `APPROVED`), transitions immediately to `STOPPED` and cancels runner.
  - If task is actively executing (`RUNNING`), sends termination signal to subprocess, executes `docker kill vibe-sandbox-task-{task_id}`, logs termination event, and marks database state as `STOPPED`.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Proceso #15 detenido y sandbox abortado correctamente.",
    "task_id": 15,
    "status": "STOPPED"
  }
  ```

