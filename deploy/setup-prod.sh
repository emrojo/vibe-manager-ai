#!/usr/bin/env bash
# ==============================================================================
# Vibe Manager AI - Automated Production Setup & Deployment Script
# ==============================================================================
# Supported OS: Ubuntu 20.04+, Ubuntu 22.04+, Ubuntu 24.04+, Debian 11/12
#
# Usage:
#   chmod +x deploy/setup-prod.sh
#   ./deploy/setup-prod.sh
# ==============================================================================

set -eo pipefail

# Text formatting
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${CYAN}${BOLD}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}${BOLD}[ERROR]${NC} $1"
}

# ------------------------------------------------------------------------------
# 1. Environment & Path Resolution
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNNING_USER="${SUDO_USER:-$USER}"

echo -e "${CYAN}==============================================================================${NC}"
echo -e "${CYAN}${BOLD}     Vibe Manager AI - Script de Despliegue en Producción                     ${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo -e "Directorio del proyecto: ${BOLD}${PROJECT_DIR}${NC}"
echo -e "Usuario de ejecución:    ${BOLD}${RUNNING_USER}${NC}\n"

# Check operating system
OS="$(uname -s)"
if [ "$OS" != "Linux" ]; then
    log_warn "Este script está diseñado para entornos de producción Linux (Ubuntu/Debian)."
    log_warn "Sistema operativo detectado: $OS."
    read -rp "¿Deseas continuar de todas formas? [s/N]: " continue_non_linux
    if [[ ! "$continue_non_linux" =~ ^[sSyY]$ ]]; then
        log_error "Instalación cancelada."
        exit 1
    fi
fi

if [ "$RUNNING_USER" = "root" ] && [ -z "$SUDO_USER" ]; then
    log_warn "Estás ejecutando el script directamente como usuario root."
    log_warn "En producción es altamente recomendable usar un usuario no-root con privilegios sudo (ej: ubuntu, deploy)."
fi


# ------------------------------------------------------------------------------
# 2. Prerequisites Verification
# ------------------------------------------------------------------------------
log_info "Verificando dependencias del sistema..."

MISSING_PACKAGES=()

check_command() {
    if ! command -v "$1" &> /dev/null; then
        MISSING_PACKAGES+=("$1")
    fi
}

check_command docker
check_command git
check_command openssl
check_command nginx

# Check docker compose plugin (v2)
if command -v docker &> /dev/null; then
    if ! docker compose version &> /dev/null; then
        MISSING_PACKAGES+=("docker-compose-plugin")
    fi
fi

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    log_warn "Faltan paquetes necesarios: ${MISSING_PACKAGES[*]}"
    echo -e "Puedes instalarlos con:"
    echo -e "${BOLD}sudo apt update && sudo apt install -y curl git openssl nginx certbot python3-certbot-nginx${NC}"
    echo -e "Para instalar Docker Engine oficial y Docker Compose:"
    echo -e "${BOLD}curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER${NC}"
    echo ""
    read -rp "¿Deseas que este script intente instalar los paquetes faltantes vía apt? [s/N]: " install_deps
    if [[ "$install_deps" =~ ^[sSyY]$ ]]; then
        sudo apt update
        sudo apt install -y curl git openssl nginx certbot python3-certbot-nginx
        if ! command -v docker &> /dev/null; then
            log_info "Instalando Docker Engine..."
            curl -fsSL https://get.docker.com | sudo sh
            sudo usermod -aG docker "$RUNNING_USER" || true
            sudo systemctl enable docker
            sudo systemctl start docker
        fi
    else
        log_error "Por favor instala las dependencias e inicia el script de nuevo."
        exit 1
    fi
fi

log_success "Todas las dependencias están presentes."

# Verify Docker daemon connectivity and docker.sock permissions
if ! docker info &> /dev/null; then
    log_warn "No se puede conectar al socket de Docker (/var/run/docker.sock) con el usuario actual."
    log_info "Añadiendo usuario actual al grupo docker: sudo usermod -aG docker $RUNNING_USER"
    sudo usermod -aG docker "$RUNNING_USER" || true
    log_info "Verifica que el servicio docker esté activo con: sudo systemctl start docker"
fi

# ------------------------------------------------------------------------------
# 3. Environment Variables Configuration (.env)
# ------------------------------------------------------------------------------
ENV_FILE="${PROJECT_DIR}/.env"
log_info "Configurando variables de entorno de producción..."

if [ ! -f "$ENV_FILE" ]; then
    log_info "Creando archivo .env inicial con credenciales criptográficamente seguras..."

    RANDOM_SECRET="$(openssl rand -hex 32)"
    RANDOM_DB_PASS="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)"
    RANDOM_ADMIN_PASS="$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 18)"

    cat <<EOF > "$ENV_FILE"
# ==============================================================================
# Vibe Manager AI - Production Environment Variables (Hardened)
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ==============================================================================

# Application Environment & Security Controls
ENVIRONMENT=production
DOCS_ENABLED=false
REQUIRE_DOCKER_SANDBOX=true
SEED_DEMO_DATA=false
CORS_ORIGINS=

# Application Secrets (Randomly generated 64-char key)
SECRET_KEY=${RANDOM_SECRET}
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# PostgreSQL 16 Credentials (Isolated internal persistent database)
POSTGRES_DB=vibe_manager
POSTGRES_USER=vibe_user
POSTGRES_PASSWORD=${RANDOM_DB_PASS}
DATABASE_URL=postgresql+asyncpg://vibe_user:${RANDOM_DB_PASS}@db:5432/vibe_manager

# Initial Admin Credentials (Randomly generated for security)
DEFAULT_ADMIN_EMAIL=admin@vibemanager.ai
DEFAULT_ADMIN_PASSWORD=${RANDOM_ADMIN_PASS}

# Google Gemini AI Settings
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash

# GitHub Automation Fallback Token (optional)
GITHUB_TOKEN=

# Docker Sandbox Execution Runner
DOCKER_RUNNER_IMAGE=vibe-runner:latest
DOCKER_TIMEOUT_SECONDS=300

# Host Ingress URL
FRONTEND_URL=https://localhost

# Production Port Bindings (Exclusively loopback 127.0.0.1:8080 for host Nginx)
GATEWAY_BIND=127.0.0.1:8080:80
EOF
    chmod 600 "$ENV_FILE"
    log_success "Archivo .env generado con contraseñas seguras y permisos 600."
else
    log_info "Archivo .env existente detectado. Conservando configuración actual."
    chmod 600 "$ENV_FILE" || true
    grep -q "^GATEWAY_BIND=" "$ENV_FILE" || echo "GATEWAY_BIND=127.0.0.1:8080:80" >> "$ENV_FILE"
    grep -q "^ENVIRONMENT=" "$ENV_FILE" || echo "ENVIRONMENT=production" >> "$ENV_FILE"
    grep -q "^REQUIRE_DOCKER_SANDBOX=" "$ENV_FILE" || echo "REQUIRE_DOCKER_SANDBOX=true" >> "$ENV_FILE"
fi


# Prompt for Domain Name
echo ""
read -rp "Introduce tu nombre de dominio para el proxy Nginx (ej: vibe.midominio.com o localhost): " DOMAIN_NAME
DOMAIN_NAME="${DOMAIN_NAME:-localhost}"

# Prompt for Gemini API Key if empty
CURRENT_GEMINI_KEY="$(grep -E '^GEMINI_API_KEY=' "$ENV_FILE" | cut -d '=' -f2- || true)"
if [ -z "$CURRENT_GEMINI_KEY" ]; then
    read -rp "Introduce tu clave de API de Google Gemini (opcional ahora, configurable más tarde): " INPUT_GEMINI_KEY
    if [ -n "$INPUT_GEMINI_KEY" ]; then
        sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${INPUT_GEMINI_KEY}|" "$ENV_FILE"
        log_success "GEMINI_API_KEY guardada en .env."
    fi
fi

# Update FRONTEND_URL in .env
if [ "$DOMAIN_NAME" != "localhost" ]; then
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN_NAME}|" "$ENV_FILE"
fi

# ------------------------------------------------------------------------------
# 4. Build Sandbox Runner Image
# ------------------------------------------------------------------------------
log_info "Construyendo la imagen aislada del runner sandbox (vibe-runner:latest)..."
(cd "${PROJECT_DIR}" && docker build -t vibe-runner:latest ./runner)
log_success "Imagen vibe-runner:latest construida correctamente."

# ------------------------------------------------------------------------------
# 5. Build and Test Docker Compose Stack
# ------------------------------------------------------------------------------
log_info "Construyendo imágenes de producción (backend, frontend, gateway)..."
(cd "${PROJECT_DIR}" && docker compose -f docker-compose.yml -f docker-compose.prod.yml build)
log_success "Contenedores de producción compilados con éxito."

# ------------------------------------------------------------------------------
# 6. Setup Systemd Service Unit
# ------------------------------------------------------------------------------
log_info "Configurando el servicio del sistema systemd (vibe-manager.service)..."
SERVICE_DEST="/etc/systemd/system/vibe-manager.service"

sudo bash -c "cat <<EOF > '${SERVICE_DEST}'
[Unit]
Description=Vibe Manager AI Platform (Docker Compose Stack)
Documentation=https://github.com/emrojo/vibe-manager-ai
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${PROJECT_DIR}

# Start and Stop Compose Stack
ExecStart=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.prod.yml down
ExecReload=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.prod.yml restart

TimeoutStartSec=300
TimeoutStopSec=60
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable vibe-manager
sudo systemctl restart vibe-manager
log_success "Servicio systemd vibe-manager habilitado e iniciado."

# ------------------------------------------------------------------------------
# 7. Setup Host Nginx Configuration
# ------------------------------------------------------------------------------
log_info "Configurando Nginx como Proxy Inverso en el host..."
NGINX_AVAILABLE="/etc/nginx/sites-available/vibe-manager.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/vibe-manager.conf"

# Prepare Nginx configuration file tailored for HTTP initially (or HTTPS if certificates exist)
sudo bash -c "cat << 'EOF' > '${NGINX_AVAILABLE}'
# Rate limiting zones
limit_req_zone \$binary_remote_addr zone=vibe_auth_limit:10m rate=5r/s;
limit_req_zone \$binary_remote_addr zone=vibe_prompt_limit:10m rate=10r/m;


upstream vibe_gateway_upstream {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN_NAME__;

    # Certbot ACME webroot challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }

    # Security Headers
    add_header X-Content-Type-Options \"nosniff\" always;
    add_header X-Frame-Options \"SAMEORIGIN\" always;
    add_header X-XSS-Protection \"1; mode=block\" always;
    add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;

    client_max_body_size 10M;
    client_body_buffer_size 128k;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    # Deny access to hidden files (.git, .env)
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Block public access to docs in production
    location ~* ^/(docs|redoc|openapi\.json) {
        return 404;
    }

    # Rate-limited Auth Endpoints
    location ~* ^/api/auth/(login|register) {
        limit_req zone=vibe_auth_limit burst=10 nodelay;
        proxy_pass http://vibe_gateway_upstream;
        proxy_http_version 1.1;
        proxy_set_header Connection \"\";
    }

    # Rate-limited Prompt Submission Endpoint
    location = /api/prompts {
        limit_req zone=vibe_prompt_limit burst=5 nodelay;
        proxy_pass http://vibe_gateway_upstream;
        proxy_http_version 1.1;
        proxy_set_header Connection \"\";
    }

    # WebSockets (Real-time Chat & Live Streaming Terminal Consoles)
    location ~* ^/api/(chat/ws|processes/.+/console) {
        proxy_pass http://vibe_gateway_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"Upgrade\";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }

    # REST API
    location /api/ {
        proxy_pass http://vibe_gateway_upstream;
        proxy_http_version 1.1;
        proxy_set_header Connection \"\";
        proxy_connect_timeout 60s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Next.js Static Asset Caching
    location /_next/static/ {
        proxy_pass http://vibe_gateway_upstream;
        proxy_http_version 1.1;
        proxy_set_header Connection \"\";
        expires 365d;
        access_log off;
        add_header Cache-Control \"public, max-age=31536000, immutable\";
    }

    # Frontend Web Application (Default)
    location / {
        proxy_pass http://vibe_gateway_upstream;
        proxy_http_version 1.1;
        proxy_set_header Connection \"\";
        proxy_connect_timeout 30s;
        proxy_read_timeout 60s;
    }
}
EOF"


sudo sed -i "s/__DOMAIN_NAME__/${DOMAIN_NAME}/g" "${NGINX_AVAILABLE}"

# Create certbot webroot dir
sudo mkdir -p /var/www/certbot

# Create symlink
if [ ! -f "$NGINX_ENABLED" ]; then
    sudo ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
fi

# Disable default nginx site if active
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    sudo rm -f "/etc/nginx/sites-enabled/default"
fi

# Test and reload Nginx
if sudo nginx -t; then
    sudo systemctl reload nginx
    log_success "Nginx configurado y recargado con éxito."
else
    log_error "Falló la prueba de configuración de Nginx (nginx -t)."
fi

# ------------------------------------------------------------------------------
# 8. Summary & Next Steps
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}     ¡Instalación y Puesta en Marcha de Producción Completada!                ${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
# Read admin credentials from .env to display
ACTUAL_ADMIN_EMAIL="$(grep -E '^DEFAULT_ADMIN_EMAIL=' "$ENV_FILE" | cut -d '=' -f2- || echo 'admin@vibemanager.ai')"
ACTUAL_ADMIN_PASS="$(grep -E '^DEFAULT_ADMIN_PASSWORD=' "$ENV_FILE" | cut -d '=' -f2- || echo '********')"

echo -e "El stack de Vibe Manager AI está activo mediante ${BOLD}systemd${NC} y securizado tras Nginx."
echo ""
echo -e "${BOLD}Acceso Web Inicial:${NC}    http://${DOMAIN_NAME}"
echo -e "${BOLD}Usuario Administrador:${NC} ${ACTUAL_ADMIN_EMAIL}"
echo -e "${BOLD}Contraseña Generada:${NC}   ${YELLOW}${BOLD}${ACTUAL_ADMIN_PASS}${NC}"
echo ""
echo -e "${RED}${BOLD}[IMPORTANTE] Guarda inmediatamente la contraseña del administrador en tu gestor de claves.${NC}"
echo -e "Por seguridad, en modo producción las invitaciones abiertas están deshabilitadas;"
echo -e "podrás emitir invitaciones personalizadas desde el panel de administración una vez dentro."
echo ""
echo -e "${CYAN}${BOLD}PASOS RECOMENDADOS A CONTINUACIÓN:${NC}"

echo ""
if [ "$DOMAIN_NAME" != "localhost" ]; then
    echo -e "1. ${BOLD}Activar HTTPS Gratuito con Let's Encrypt (Certbot):${NC}"
    echo -e "   Ejecuta el siguiente comando para generar e instalar el certificado SSL automáticamente:"
    echo -e "   ${BOLD}sudo certbot --nginx -d ${DOMAIN_NAME}${NC}"
    echo -e "   (Certbot modificará automáticamente la configuración de Nginx para redirigir todo a HTTPS)"
    echo ""
fi
echo -e "2. ${BOLD}Configurar Firewall UFW (Recomendado):${NC}"
echo -e "   sudo ufw allow 22/tcp    # SSH"
echo -e "   sudo ufw allow 80/tcp    # HTTP"
echo -e "   sudo ufw allow 443/tcp   # HTTPS"
echo -e "   sudo ufw enable"
echo ""
echo -e "3. ${BOLD}Comandos de Gestión del Servicio:${NC}"
echo -e "   - Ver estado:     ${BOLD}sudo systemctl status vibe-manager${NC}"
echo -e "   - Reiniciar:      ${BOLD}sudo systemctl restart vibe-manager${NC}"
echo -e "   - Ver logs stack: ${BOLD}docker compose logs -f${NC} o ${BOLD}sudo journalctl -u vibe-manager -f${NC}"
echo ""
echo -e "4. ${BOLD}Backup Diario de Base de Datos (Cron):${NC}"
echo -e "   Añade a tu crontab (${BOLD}crontab -e${NC}):"
echo -e "   ${BOLD}0 3 * * * ${PROJECT_DIR}/stack backup /var/backups/vibe_db_\$(date +\\%F).sql${NC}"
echo ""
echo -e "${GREEN}==============================================================================${NC}"
