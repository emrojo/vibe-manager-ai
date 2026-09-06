<#
.SYNOPSIS
  Vibe Manager AI - Unified Stack Management Utility for PowerShell
.EXAMPLE
  .\stack.ps1 up
  .\stack.ps1 status
  .\stack.ps1 logs backend
  .\stack.ps1 down
#>

param(
  [Parameter(Position=0)]
  [ValidateSet("up", "start", "down", "stop", "restart", "logs", "status", "ps", "backup", "restore", "reset", "help")]
  [string]$Command = "help",

  [Parameter(Position=1)]
  [string]$Service = ""
)

switch ($Command) {
  { $_ -in "up", "start" } {
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Launching Vibe Manager AI Unified Stack..." -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    docker-compose up -d --build
    if ($LASTEXITCODE -ne 0) {
      Write-Host "`n[ERROR] Failed to launch stack. Ensure Docker Desktop is running." -ForegroundColor Red
      return
    }
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host " Vibe Manager AI Stack is Active!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host " Unified Portal (Single Entry):  http://localhost" -ForegroundColor Yellow
    Write-Host " Frontend Direct UI:             http://localhost:3001" -ForegroundColor White
    Write-Host " Backend API & Swagger Docs:     http://localhost:8000/docs" -ForegroundColor White
    Write-Host " Persistent PostgreSQL Database: localhost:5432 (vibe_manager)" -ForegroundColor Cyan
    Write-Host "`n Admin Account:  admin@vibemanager.ai / Admin1234!" -ForegroundColor Gray
    Write-Host " Welcome Invite: VIBE-WELCOME" -ForegroundColor Gray
    Write-Host "========================================================" -ForegroundColor Green
  }

  { $_ -in "down", "stop" } {
    Write-Host "Stopping Vibe Manager AI Stack (volumes preserved)..." -ForegroundColor Yellow
    docker-compose down
    Write-Host "Stack stopped successfully. Data volumes remain persistent." -ForegroundColor Green
  }

  "restart" {
    Write-Host "Restarting Vibe Manager AI Stack..." -ForegroundColor Cyan
    docker-compose restart
    Write-Host "Stack restarted." -ForegroundColor Green
  }

  "logs" {
    if ($Service) {
      docker-compose logs -f $Service
    } else {
      docker-compose logs -f
    }
  }

  { $_ -in "status", "ps" } {
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Vibe Manager AI Stack Status" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    docker-compose ps
  }

  "backup" {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = if ($Service) { $Service } else { "./backup_vibe_manager_$timestamp.sql" }
    Write-Host "Creating backup of PostgreSQL database to $backupFile..." -ForegroundColor Cyan
    docker exec vibe-db pg_dump -U vibe_user -d vibe_manager > $backupFile
    if ($LASTEXITCODE -eq 0 -and (Test-Path $backupFile)) {
      $size = (Get-Item $backupFile).Length
      Write-Host "Backup created successfully! ($size bytes) -> $backupFile" -ForegroundColor Green
    } else {
      Write-Host "Backup failed. Ensure vibe-db is running." -ForegroundColor Red
    }
  }

  "restore" {
    if (-not $Service -or -not (Test-Path $Service)) {
      Write-Host "Error: Please specify an existing SQL backup file to restore. Example: .\stack.ps1 restore ./backup.sql" -ForegroundColor Red
      return
    }
    Write-Host "Restoring PostgreSQL database from $Service..." -ForegroundColor Yellow
    Get-Content $Service | docker exec -i vibe-db psql -U vibe_user -d vibe_manager
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Database restored successfully from $Service." -ForegroundColor Green
    } else {
      Write-Host "Restore failed. Ensure vibe-db is running." -ForegroundColor Red
    }
  }

  "reset" {
    $confirm = Read-Host "Are you sure you want to stop the stack and delete data volumes? (y/N)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
      docker-compose down -v
      Write-Host "Stack has been reset to factory defaults (data volumes wiped)." -ForegroundColor Green
    } else {
      Write-Host "Reset canceled." -ForegroundColor Yellow
    }
  }

  default {
    Write-Host "Vibe Manager AI - Stack Management Utility" -ForegroundColor Cyan
    Write-Host "`nUsage:" -ForegroundColor White
    Write-Host "  .\stack.ps1 <command> [argument]" -ForegroundColor Gray
    Write-Host "`nCommands:" -ForegroundColor White
    Write-Host "  up | start       Build and start all stack services in background" -ForegroundColor Gray
    Write-Host "  down | stop      Stop all stack services (preserves data volumes)" -ForegroundColor Gray
    Write-Host "  restart          Restart stack containers" -ForegroundColor Gray
    Write-Host "  status | ps      Show real-time container status and ports" -ForegroundColor Gray
    Write-Host "  logs [service]   View live logs (e.g., .\stack.ps1 logs backend)" -ForegroundColor Gray
    Write-Host "  backup [file]    Export SQL backup from PostgreSQL database" -ForegroundColor Gray
    Write-Host "  restore <file>   Restore SQL backup into PostgreSQL database" -ForegroundColor Gray
    Write-Host "  reset            Stop stack and wipe persistent volumes" -ForegroundColor Gray
    Write-Host "  help             Show this message`n" -ForegroundColor Gray
  }
}
