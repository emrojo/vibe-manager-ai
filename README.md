# Vibe Manager AI 🚀

Plataforma colaborativa completa para la propuesta, validación humana asistida y ejecución automatizada de prompts de código mediante **Google Gemini**, sandboxing en contenedores **Docker** y creación automática de **Pull Requests en GitHub**.

---

## 🌟 Características Principales

1. **Portal de Usuarios Registrados**:
   - Selector dinámico de proyectos web objetivo.
   - Editor de prompts para proponer cambios y mejoras en el código.
   - Capacidad de mandar múltiples prompts secuenciales.
   - Historial de prompts con estado en tiempo real (En Revisión, Aprobado, Ejecutando en Docker, PR Creado en GitHub, Rechazado).
   - Enlace directo a los Pull Requests generados en GitHub y visor de logs de ejecución.
   - Chat en tiempo real con el Administrador.

2. **Mesa de Validación (Rol Validador)**:
   - Panel de control con las solicitudes pendientes.
   - Capacidad de **editar y ajustar las instrucciones del prompt** antes de aprobarlo para guiar a la IA.
   - **Aceptar**: Envía el prompt a la cola de ejecución automatizada en Docker.
   - **Rechazar**: Permite registrar el motivo del rechazo para que el usuario lo revise.

3. **Ejecución Aislada en Contenedores Docker (Sandbox Worker)**:
   - Los cambios solicitados se ejecutan dentro de un contenedor Docker efímero para aislar el entorno anfitrión.
   - Clona el repositorio destino con el token de GitHub (PAT).
   - Crea una rama independiente (`vibe/task-{id}-{hash}`).
   - Google Gemini analiza los archivos del proyecto y genera las modificaciones exactas de código.
   - Aplica los parches, genera un commit descriptivo y hace push a GitHub.
   - Abre automáticamente el **Pull Request** en GitHub mediante la API REST y guarda el enlace y los logs en la base de datos.

4. **Consola de Administración (Rol Administrador)**:
   - **Gestión de Usuarios**: Banear usuarios, readmitirlos y otorgar/revocar el rol de **Validador**.
   - **Generador de Invitaciones**: Crea códigos de invitación (`VIBE-XXXX`) y enlaces de registro con botones directos para compartir en **WhatsApp** (`https://wa.me/?text=...`) o por **Email** (`mailto:...`).
   - **Gestión de Proyectos**: Dar de alta repositorios de GitHub con su rama base y Personal Access Token (PAT).
   - **Bandeja de Chat**: Chat en tiempo real por WebSockets con cualquier usuario de la plataforma.

---

## 🏗️ Arquitectura del Proyecto

```
vibe-manager-ai/
├── backend/               # API REST & WebSockets (FastAPI + Python 3.12 + SQLAlchemy async)
│   ├── app/
│   │   ├── models/        # User, Project, PromptTask, Invitation, ChatMessage
│   │   ├── routers/       # auth, admin, projects, prompts, validation, chat
│   │   ├── services/      # docker_runner, ai_gemini, github_service, queue_worker
│   │   └── main.py
│   ├── tests/             # Tests automatizados end-to-end con pytest
│   └── requirements.txt
├── runner/                # Sandbox de ejecución en Docker
│   ├── Dockerfile         # Imagen aislada con Git y Python
│   └── run_task.py        # Script que ejecuta Gemini, git commit, push y PR
├── frontend/              # Aplicación Web (Next.js 15 + React 19 + Tailwind CSS)
│   └── src/app/
│       ├── dashboard/     # Portal del usuario para redactar prompts y ver PRs
│       ├── validator/     # Mesa de validación y edición de prompts
│       ├── admin/         # Consola de administración y usuarios
│       ├── chat/          # Chat en tiempo real usuario <-> admin
│       ├── login/
│       └── register/      # Registro con código o enlace de invitación
└── docker-compose.yml     # Orquestación de toda la plataforma
```

---

## 🚀 Puesta en Marcha

### Opción 1: Con Docker Compose (Recomendada)

1. Clona o abre la carpeta del proyecto:
   ```bash
   cd vibe-manager-ai
   ```

2. Configura tu clave de Gemini (opcional pero recomendada) en `.env`:
   ```env
   GEMINI_API_KEY=tu_clave_de_gemini
   ```

3. Levanta todos los servicios con un solo comando:
   ```bash
   docker-compose up --build
   ```

4. Accede a las aplicaciones:
   - **Frontend**: [http://localhost:3000](http://localhost:3000)
   - **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Opción 2: Ejecución Local en Modo Desarrollo

#### 1. Backend (FastAPI):
```bash
cd backend
python -m venv .venv
# En Windows:
.\.venv\Scripts\activate
# En Linux/Mac:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend (Next.js):
```bash
cd frontend
npm install
npm run dev
```

---

## 🔑 Credenciales por Defecto

Al inicializar el sistema por primera vez, se crea automáticamente un usuario administrador y un código de invitación inicial:

- **Usuario Administrador**:
  - **Email:** `admin@vibemanager.ai`
  - **Contraseña:** `Admin1234!`
- **Código de Invitación Inicial para nuevos usuarios**:
  - `VIBE-WELCOME` (o enlace `/register?invite=welcome-token-2026`)
