# System Architecture & Technical Design
## Vibe Manager AI

This document provides an in-depth architectural breakdown of **Vibe Manager AI**, detailing the structural layers, Docker sandboxing mechanisms, AI agent synthesis pipeline, and real-time communication protocols.

---

## 1. High-Level Architecture

Vibe Manager AI is architected as a modular, decoupled system composed of four major layers:

```mermaid
flowchart TB
    subgraph Presentation Layer [Frontend - Next.js 15 & React 19]
        UI_User[User Dashboard / Prompt Studio]
        UI_Val[Validator Desk & Inline Editor]
        UI_Adm[Admin Console & User Governance]
        UI_Chat[Real-Time WebSocket Chat Interface]
    end

    subgraph Application Layer [Backend - FastAPI & Python 3.12]
        API[FastAPI REST API Engine]
        AUTH[JWT & Argon2/Bcrypt Security Guard]
        WS[WebSocket Connection Manager]
        QUEUE[Async Background Task Queue]
    end

    subgraph Persistence Layer [Storage & Database]
        DB[(SQLAlchemy Async / SQLite or PostgreSQL)]
        VOL[Ephemeral Volume Mounts]
    end

    subgraph Sandbox Layer [Docker Engine Isolation]
        DOCKER_MGR[Docker Runner Orchestrator]
        CONTAINER[Isolated Container - vibe-runner:latest]
        AGENT[AI Synthesis Agent - Google Gemini]
        GIT[Git CLI & GitHub REST Client]
    end

    subgraph External Cloud Services
        GEMINI_API[Google Gemini API]
        GITHUB[GitHub API & Git Remote Repositories]
    end

    Presentation Layer <-->|HTTPS REST & WSS| Application Layer
    Application Layer <--> DB
    QUEUE --> DOCKER_MGR
    DOCKER_MGR -->|docker run with memory & timeout limits| CONTAINER
    CONTAINER --- VOL
    CONTAINER --> AGENT
    AGENT <-->|JSON Structured Schema| GEMINI_API
    CONTAINER --> GIT
    GIT <-->|Clone / Push / Create PR| GITHUB
```

---

## 2. Component Breakdown

### 2.1 Presentation Layer (`/frontend`)
- **Framework:** Next.js 15 App Router (`src/app`), React 19, TypeScript.
- **Styling & UI:** Tailwind CSS, Lucide React icons, customized dark slate aesthetic.
- **Client State Management:** `AuthContext` provides session state, reactive token handling, and role-based client-side redirects.
- **Key Modules:**
  - `src/app/dashboard/page.tsx`: Project selection dropdown, prompt textarea, real-time prompt lifecycle table, PR hyperlinks, and execution log viewers.
  - `src/app/validator/page.tsx`: Multi-status filter tabs, dual-view diff (Original prompt vs. Editable prompt), approval and rejection modals.
  - `src/app/admin/page.tsx`: System throughput statistics, user directory, ban/unban toggles, role switches, invitation generator with WhatsApp/Email deep links, and project configuration.
  - `src/app/chat/page.tsx`: Multi-channel chat interface with automatic WebSocket connection and REST fallback.

### 2.2 Application Layer (`/backend`)
- **Framework:** FastAPI 0.115+ on Python 3.12, Uvicorn ASGI server.
- **ORM & Database:** SQLAlchemy 2.0 async with `aiosqlite` (default local) and compatible with `asyncpg` for PostgreSQL production deployments.
- **Security:**
  - Token hashing: `bcrypt` with automated salt generation.
  - Session tokens: JSON Web Tokens (JWT) signed with HMAC-SHA256 (`HS256`).
  - Role-Based Access Control (RBAC): FastAPI dependency injection (`require_roles(["admin"])`).
- **Real-Time Communication:**
  - `ConnectionManager` class tracks active WebSocket connections per `user_id`.
  - Sends immediate push notifications when messages arrive.

### 2.3 Sandbox Layer (`/runner`)
- **Docker Image:** `vibe-runner:latest` (built from `runner/Dockerfile`).
- **Base Image:** `python:3.12-slim` equipped with `git`, `curl`, `ca-certificates`, and `httpx`.
- **Blast Radius Containment:**
  - **Memory Limit:** 2GB (`--memory 2g`).
  - **Execution Timeout:** 300 seconds default.
  - **Isolated Volume:** Temporary folder generated dynamically per task (`tmpfs` / host temp dir) mounted at `/runner_workspace`.
  - **Network Isolation:** Outbound traffic limited to Git repository and Google Gemini API endpoints; no access to the host's private network.

---

## 3. Sandboxed Execution Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    actor V as Validator
    participant BE as FastAPI Backend
    participant Q as Background Queue
    participant DK as Docker Engine
    participant C as vibe-runner Container
    participant AI as Google Gemini
    participant GH as GitHub API

    U->>BE: POST /api/prompts (Prompt for Project X)
    BE-->>U: PromptTask created (Status: PENDING)
    V->>BE: PUT /api/validation/tasks/{id}/edit (Refines prompt)
    V->>BE: POST /api/validation/tasks/{id}/approve
    BE->>Q: enqueue_prompt_task(task_id)
    BE-->>V: Task status updated to APPROVED
    Q->>DK: Launch container (vibe-runner:latest)
    Note over DK,C: Memory: 2GB | Timeout: 300s | Volume: /runner_workspace
    C->>GH: git clone -b main https://x-access-token:{PAT}@github.com/org/repo
    C->>C: Scan repository file tree and key samples
    C->>AI: generateContent(system_prompt + file_tree + user_prompt)
    AI-->>C: JSON: {commit_message, pr_title, pr_body, changes[]}
    loop For each change in changes[]
        C->>C: CREATE / MODIFY / DELETE file on disk
    end
    C->>GH: git commit -m "{commit_message}"
    C->>GH: git push origin vibe/task-{id}-{hash}
    C->>GH: POST /repos/{owner}/{repo}/pulls (Create PR)
    GH-->>C: PR URL & PR Number
    C-->>BE: Save result.json & container stdout/stderr
    BE->>BE: Update PromptTask (Status: COMPLETED, pr_url, logs)
```

---

## 4. Google Gemini Prompt Engineering & Schema Enforcement

The runner leverages Google Gemini with strict JSON mode (`responseMimeType: application/json`):

```json
{
  "commit_message": "feat(nav): add PDF export button with icon",
  "pr_title": "feat: Add PDF export capability to navigation bar",
  "pr_body": "## Summary of Changes\n- Integrated PDF export trigger\n- Added download icon using Lucide\n- Styled using Tailwind CSS",
  "changes": [
    {
      "path": "src/components/Navbar.tsx",
      "action": "MODIFY",
      "content": "/* Complete file content */"
    }
  ]
}
```

### Safety & Integrity Rules:
1. **Full File Content:** The model is instructed never to produce truncated code (e.g., `// ... rest of code remains the same`), preventing source file corruption.
2. **Deterministic Changes:** Temperature is set to `0.2` to ensure consistent code synthesis adhering to project conventions.
3. **Graceful Mock Fallback:** If `GEMINI_API_KEY` is not provided during testing, a mock change generator creates a tracking log file (`VIBE_CHANGES.md`) and commits it, enabling offline verification.

---

## 5. Database Schema & Relationships

```mermaid
erDiagram
    User ||--o{ PromptTask : submits
    User ||--o{ PromptTask : validates
    User ||--o{ Invitation : creates
    User ||--o{ ChatMessage : sends
    User ||--o{ ChatMessage : receives
    Project ||--o{ PromptTask : targets

    User {
        int id PK
        string email UK
        string name
        string hashed_password
        string role "admin | validator | user"
        boolean is_active
        boolean is_banned
        datetime created_at
    }

    Invitation {
        int id PK
        string code UK
        string token UK
        int created_by_id FK
        int max_uses
        int used_count
        boolean is_active
        datetime expires_at
    }

    Project {
        int id PK
        string name
        string repo_url
        string default_branch
        string github_token
        string system_prompt_rules
        boolean is_active
    }

    PromptTask {
        int id PK
        int project_id FK
        int user_id FK
        int validated_by_id FK
        text original_prompt
        text edited_prompt
        string status "PENDING|APPROVED|REJECTED|RUNNING|COMPLETED|FAILED"
        text rejection_reason
        string branch_name
        string commit_message
        string pr_url
        int pr_number
        text execution_logs
    }

    ChatMessage {
        int id PK
        int sender_id FK
        int recipient_id FK
        text content
        boolean is_read
        datetime created_at
    }
```
