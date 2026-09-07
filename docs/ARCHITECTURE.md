# Architecture Specification

## Overview

Vibe Manager AI is designed as a modular, containerized multi-tier application. It consists of an API Gateway, Web Frontend, REST Backend, Queue Worker, Isolated Task Runner, and PostgreSQL Database.

## System Diagram

```
                       +-------------------+
                       |    Web Browser    |
                       +---------+---------+
                                 |
                                 v
                       +-------------------+
                       |   Nginx Gateway   |
                       +----+---------+----+
                            |         |
                  /api/*    |         |  /* (Static / SSR)
                 +----------+         +----------+
                 v                               v
       +-------------------+           +-------------------+
       |  FastAPI Backend  |           | Next.js Frontend  |
       +---------+---------+           +-------------------+
                 |
     +-----------+----------+
     |                      |
     v                      v
+----+--------------+  +----+--------------+
| PostgreSQL DB     |  | Queue Worker      |
| (Alembic Migr.)   |  +----+--------------+
+-------------------+       |
                            v
                      +----+--------------+
                      | Task Runner       |
                      | (Docker Isolated) |
                      +-------------------+
```

## Core Components

### 1. Nginx Gateway (`gateway/`)
- Acts as the primary entry point on port `80` / `443`.
- Routes standard web traffic to the Next.js Frontend.
- Routes `/api/*` requests to the FastAPI Backend.
- Handles WebSocket upgraded connections for real-time console log streaming.

### 2. Next.js Frontend (`frontend/`)
- Built with Next.js (App Router), React, TypeScript, and Tailwind CSS.
- Provides interactive dashboards for projects, active processes, AI chat, PR generation, and admin management.
- Handles authentication state through `AuthContext`.

### 3. FastAPI Backend (`backend/`)
- Core REST API serving authentication, project CRUD, task scheduling, and GitHub integration.
- Utilizes SQLAlchemy ORM with PostgreSQL and Alembic migration scripts.
- Implements Google Gemini service wrappers for AI prompt processing.

### 4. Queue Worker & Task Runner (`runner/`, `backend/app/services/`)
- Asynchronous task worker processes heavy jobs off the main HTTP thread.
- Spawns isolated Docker runner containers (`run_task.py`) with strict memory and execution boundaries.
- Streams live stdout/stderr execution logs back through SSE/WebSockets to the web interface.

### 5. Persistence Layer
- PostgreSQL stores user accounts, projects, prompt tasks, validator definitions, and process execution history.
- Alembic handles schema migrations seamlessly during application startup.
