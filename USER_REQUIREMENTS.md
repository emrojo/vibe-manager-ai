# User Requirements & Specification

## Overview
Vibe Manager AI enables software engineering teams to manage projects, run AI-guided tasks using LLM agents, validate repository code against custom rules, and automatically produce GitHub Pull Requests with verified implementations.

## Functional Requirements

### 1. User Authentication & Authorization
- Users must be able to register, log in, and receive secure JWT tokens.
- Support for multi-role authorization (Admin, Developer, Viewer).
- Admin users can manage project invitations, user plans, and system settings.

### 2. Project Management
- Ability to create, update, list, and delete projects.
- Link each project to a target GitHub repository URL and branch.
- Securely store API keys and credentials encrypted at rest.

### 3. AI Task Execution (Gemini Integration)
- Users can submit natural language prompt tasks targeting specific projects.
- Gemini AI interprets prompts, breaks down tasks, and generates file changes.
- Execution outputs are streamed in real time to the user interface.

### 4. Isolated Task Runner & Code Execution
- Tasks execute inside isolated Docker runner containers.
- Code changes are verified and tested in isolation before committing.
- Support for step-by-step log streaming and process cancellation.

### 5. Repository Validators
- Configure customizable rules and checks for repository structures and linting.
- Pre-execution and post-execution validation gates to prevent breaking builds.

### 6. GitHub Integration & Pull Request Generation
- Automated creation of feature branches and commits from generated code changes.
- Automatic creation and linking of Pull Requests on GitHub with detailed descriptions.

## Non-Functional Requirements

- **Security**: All API routes (except public auth) must be protected by JWT. Sensitive tokens must be encrypted.
- **Scalability**: Asynchronous background queue workers handle long-running LLM and Docker tasks.
- **Observability**: Live console output and WebSocket streaming for background process monitoring.
- **Containerization**: Full system runnability via Docker Compose with zero manual dependency setups.
