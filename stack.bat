@echo off
setlocal enabledelayedexpansion

set STACK_NAME=vibe-manager-stack

if "%1"=="" goto help
if "%1"=="help" goto help
if "%1"=="start" goto start
if "%1"=="up" goto start
if "%1"=="stop" goto stop
if "%1"=="down" goto stop
if "%1"=="restart" goto restart
if "%1"=="logs" goto logs
if "%1"=="status" goto status
if "%1"=="ps" goto status
if "%1"=="reset" goto reset

echo Unknown command: %1
echo.
goto help

:start
echo ========================================================
echo  Launching Vibe Manager AI Unified Stack
echo ========================================================
docker-compose up -d --build
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start stack. Check if Docker Desktop is running.
    exit /b 1
)
echo.
echo ========================================================
echo  Vibe Manager AI Stack is Running!
echo ========================================================
echo  Unified Web Portal:   http://localhost
echo  Frontend UI:          http://localhost:3000
echo  Backend API & Docs:   http://localhost:8000/docs
echo.
echo  Default Admin:        admin@vibemanager.ai / Admin1234!
echo  Default Invite Code:  VIBE-WELCOME
echo ========================================================
goto end

:stop
echo Stopping Vibe Manager AI Stack...
docker-compose down
echo Stack stopped.
goto end

:restart
echo Restarting Vibe Manager AI Stack...
docker-compose restart
echo Stack restarted.
goto end

:logs
if "%2"=="" (
    docker-compose logs -f
) else (
    docker-compose logs -f %2
)
goto end

:status
echo ========================================================
echo  Vibe Manager AI Stack Status
echo ========================================================
docker-compose ps
goto end

:reset
echo ========================================================
echo  WARNING: This will stop the stack and delete data volumes!
echo ========================================================
set /p CONFIRM="Are you sure? (y/N): "
if /i "!CONFIRM!"=="y" (
    docker-compose down -v
    echo Stack has been reset to factory defaults.
) else (
    echo Reset canceled.
)
goto end

:help
echo Vibe Manager AI - Stack Management Utility
echo.
echo Usage:
echo   stack.bat ^<command^> [options]
echo.
echo Commands:
echo   up ^| start      Build and start all stack services in background
echo   down ^| stop    Stop all stack services
echo   restart        Restart stack containers
echo   status ^| ps    Show real-time container status and ports
echo   logs [service] View live logs (e.g., stack.bat logs backend)
echo   reset          Stop stack and wipe persistent volumes
echo   help           Show this message
echo.
goto end

:end
endlocal
