# API Reference

The Vibe Manager AI REST API is built with FastAPI. Interactive API documentation is available at `/api/docs` (Swagger UI) and `/api/redoc` (ReDoc) when running the server.

## Base URL
- Production Gateway: `http://localhost/api`
- Direct Backend: `http://localhost:8000/api`

## Endpoints Summary

### Authentication (`/auth`)
- `POST /auth/register` - Register a new user account.
- `POST /auth/login` - Authenticate user and receive OAuth2 access token.
- `GET /auth/me` - Retrieve current authenticated user profile.

### Projects (`/projects`)
- `GET /projects/` - List user projects.
- `POST /projects/` - Create a new project linked to a GitHub repository.
- `GET /projects/{project_id}` - Retrieve detailed project information.
- `PUT /projects/{project_id}` - Update project configuration.
- `DELETE /projects/{project_id}` - Remove a project.

### Prompt Tasks (`/prompts`)
- `GET /prompts/` - List prompt execution tasks.
- `POST /prompts/` - Submit a new AI prompt task for processing.
- `GET /prompts/{task_id}` - Get status and details of a specific prompt task.
- `POST /prompts/{task_id}/execute` - Trigger containerized execution for a task.

### Processes & Live Streaming (`/processes`)
- `GET /processes/` - List active and historical background processes.
- `GET /processes/{process_id}/stream` - SSE endpoint streaming live execution logs.
- `WS /processes/{process_id}/ws` - WebSocket endpoint for interactive log streams.

### Repository Validation (`/validation`)
- `GET /validation/rules` - Retrieve configured repository validation rules.
- `POST /validation/run` - Trigger repository validation against defined guidelines.

### Admin Controls (`/admin`)
- `GET /admin/users` - List system users (Admin only).
- `POST /admin/invitations` - Issue invitation tokens for system access.
- `PATCH /admin/users/{user_id}/plan` - Update user plan and resource quotas.

## Authentication Header
Protected endpoints require a Bearer token in the request header:
```
Authorization: Bearer <your_jwt_token>
```
