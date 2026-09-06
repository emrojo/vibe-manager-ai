# API Reference & Protocols
## Vibe Manager AI REST & WebSocket API

This specification provides exhaustive documentation of all REST endpoints and WebSocket protocols exposed by the Vibe Manager AI backend.

---

## 1. General Principles

### 1.1 Base URLs
- **Local REST API:** `http://localhost:8000/api`
- **Local WebSocket Endpoint:** `ws://localhost:8000/api/chat/ws`
- **Interactive Swagger Documentation:** `http://localhost:8000/docs`
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
    "invite_url": "http://localhost:3000/register?invite=r9a_Token_String...",
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
