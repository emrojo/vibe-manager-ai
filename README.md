# Vibe Manager AI

Vibe Manager AI is an AI-powered software project management and automated task execution platform. It integrates LLMs (Google Gemini) with containerized task runners, GitHub API integrations, repository validators, and live process monitoring to turn high-level prompts into actionable pull requests.

## Key Features

- **Project & Repository Management**: Register projects, link GitHub repositories, and manage encrypted credentials.
- **AI-Powered Task Generation & Execution**: Use Gemini AI to process prompt tasks and automatically generate code, tests, and pull requests.
- **Isolated Execution Environment**: Run tasks safely inside isolated Docker containers via the runner service.
- **Real-Time Process Streaming**: Monitor task logs, system processes, and execution output live via WebSockets and SSE.
- **Repository Validators**: Define custom rules and validation pipelines to ensure code quality before PR creation.
- **Multi-Tenant & Role-Based Access**: Complete authentication and authorization flow with token-based security and admin controls.

## Tech Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: FastAPI, Python 3.11+, Pydantic, SQLAlchemy, Alembic
- **Database**: PostgreSQL
- **Gateway**: Nginx (Reverse Proxy & SSL termination)
- **Task Runner**: Docker SDK / Isolated Python Runner Container
- **AI Provider**: Google Gemini API

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Python 3.11+ (for local development outside containers)
- Node.js 18+ (for frontend development)
- Git

### Quickstart with Docker Compose

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/vibe-manager-ai.git
   cd vibe-manager-ai
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in required values:
   ```bash
   cp .env.example .env
   ```

3. **Launch the Application**:
   Using Docker Compose:
   ```bash
   docker-compose up -d --build
   ```

   Or use the convenience scripts provided for Windows:
   ```powershell
   .\stack.ps1 up
   ```
   Or batch script:
   ```cmd
   stack.bat up
   ```

4. **Access the Services**:
   - **Application Gateway / Web UI**: `http://localhost`
   - **FastAPI Documentation**: `http://localhost/api/docs` (or `http://localhost:8000/docs`)

## Environment Variables Configuration

Refer to `.env.example` for all configurable keys:

| Variable | Description | Default |
| --- | --- | --- |
| `POSTGRES_USER` | Database username | `vibe_user` |
| `POSTGRES_PASSWORD` | Database password | `vibe_password` |
| `POSTGRES_DB` | Database name | `vibe_db` |
| `DATABASE_URL` | PostgreSQL connection URI | `postgresql://...` |
| `SECRET_KEY` | JWT signing secret | Required |
| `GEMINI_API_KEY` | Google Gemini API key | Required for AI operations |
| `GITHUB_TOKEN` | GitHub Personal Access Token | Required for repo management |

## Project Structure

```
vibe-manager-ai/
├── backend/          # FastAPI REST API, database models, and service logic
├── frontend/         # Next.js web application
├── gateway/          # Nginx reverse proxy configuration
├── runner/           # Dockerized task runner script
├── docs/             # Technical architecture and API specification
├── docker-compose.yml
├── .env.example
└── README.md
```

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Reference](docs/API_REFERENCE.md)
- [User Requirements & Specs](USER_REQUIREMENTS.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
