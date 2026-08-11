<#
.SYNOPSIS
    Deploy Resource Planning Application to the remote VM (res-pln-dev-vm.ipa.dataart.net).
.DESCRIPTION
    Uses Docker context over SSH: builds the image on the remote VM and runs the app.
    One-time setup: ensure SSH access and run with -SetupContext once.
.EXAMPLE
    .\deploy-to-vm.ps1
    .\deploy-to-vm.ps1 -SetupContext
    .\deploy-to-vm.ps1 -SkipBuild
    .\deploy-to-vm.ps1 -BaselineDb -SkipBuild
#>
param(
    [switch] $SetupContext,
    [switch] $SkipBuild,
    [switch] $BaselineDb
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Load config (allow override from deploy.config.local.ps1)
. (Join-Path $ScriptDir "deploy.config.ps1")
$localConfig = Join-Path $ScriptDir "deploy.config.local.ps1"
if (Test-Path $localConfig) {
    . $localConfig
}

$sshTarget = if ($REMOTE_USER) { "${REMOTE_USER}@${REMOTE_HOST}" } else { $REMOTE_HOST }
$HealthUrl = "http://127.0.0.1:3001/api/projects"
$HealthRetries = 36
$HealthIntervalSec = 5

function Test-SshConnection {
    Write-Host "Checking SSH connection to $sshTarget..." -ForegroundColor Cyan
    ssh -o BatchMode=yes -o ConnectTimeout=5 $sshTarget "echo OK" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "SSH connection failed. Ensure:" -ForegroundColor Red
        Write-Host "  1. You can log in: ssh $sshTarget" -ForegroundColor Yellow
        Write-Host "  2. SSH key is set up (passwordless preferred)" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "SSH OK." -ForegroundColor Green
}

function Setup-DockerContext {
    Write-Host "Creating Docker context '$DOCKER_CONTEXT_NAME' for $sshTarget..." -ForegroundColor Cyan
    $existing = docker context ls -q | Select-String -Pattern "^$([regex]::Escape($DOCKER_CONTEXT_NAME))`$"
    if ($existing) {
        Write-Host "Context '$DOCKER_CONTEXT_NAME' already exists. Use 'docker context use $DOCKER_CONTEXT_NAME' to switch." -ForegroundColor Yellow
        docker context use $DOCKER_CONTEXT_NAME
        return
    }
    docker context create $DOCKER_CONTEXT_NAME --docker "host=ssh://$sshTarget"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create Docker context. Ensure Docker is installed on the VM and your user is in the 'docker' group." -ForegroundColor Red
        exit 1
    }
    docker context use $DOCKER_CONTEXT_NAME
    Write-Host "Docker context '$DOCKER_CONTEXT_NAME' is ready." -ForegroundColor Green
}

function Invoke-BaselineDb {
    Write-Host "Baselining existing remote DB (Prisma P3005 recovery)..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
        docker-compose --context $DOCKER_CONTEXT_NAME stop app 2>$null

        # List migrations from the image so -SkipBuild stays consistent with the running image.
        $migrationDirs = docker-compose --context $DOCKER_CONTEXT_NAME run --rm --no-deps `
            --entrypoint sh app -c 'ls -1 prisma/migrations' 2>$null
        foreach ($m in ($migrationDirs -split "`n")) {
            $name = "$m".Trim()
            if (-not $name) { continue }
            Write-Host "Marking applied: $name"
            docker-compose --context $DOCKER_CONTEXT_NAME run --rm --no-deps `
                -e DATABASE_URL=file:/app/data/dev.db `
                --entrypoint npx app prisma migrate resolve --applied $name
            # Already-recorded migrations are non-fatal
        }

        Write-Host "Checking for remaining schema drift..."
        $diffRaw = docker-compose --context $DOCKER_CONTEXT_NAME run --rm --no-deps `
            -e DATABASE_URL=file:/app/data/dev.db `
            --entrypoint npx app prisma migrate diff `
            --from-url file:/app/data/dev.db `
            --to-schema-datamodel prisma/schema.prisma `
            --script 2>$null

        $sqlLines = @()
        foreach ($line in ($diffRaw -split "`n")) {
            if ($line -match '^┌') { break }
            $sqlLines += $line
        }
        $sql = ($sqlLines -join "`n").Trim()

        if ($sql -match '(?im)^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|PRAGMA)\s') {
            Write-Host "Applying schema drift SQL:"
            Write-Host $sql
            $sql | docker-compose --context $DOCKER_CONTEXT_NAME run --rm --no-deps -i `
                -e DATABASE_URL=file:/app/data/dev.db `
                --entrypoint npx app prisma db execute --stdin --schema prisma/schema.prisma
        } else {
            Write-Host "No schema drift after baseline."
        }

        docker-compose --context $DOCKER_CONTEXT_NAME run --rm --no-deps `
            -e DATABASE_URL=file:/app/data/dev.db `
            --entrypoint npx app prisma migrate deploy
    } finally {
        Pop-Location
    }
    Write-Host "Baseline done." -ForegroundColor Green
}

function Wait-ForHealthy {
    Write-Host "Waiting for app to become healthy ($HealthUrl)..." -ForegroundColor Cyan
    for ($i = 1; $i -le $HealthRetries; $i++) {
        $status = ssh -o BatchMode=yes -o ConnectTimeout=10 $sshTarget "curl -sf -o /dev/null -w '%{http_code}' $HealthUrl" 2>$null
        if ($status -eq "200") {
            Write-Host "Health check OK (HTTP 200)." -ForegroundColor Green
            return
        }

        $containerStatus = ssh -o BatchMode=yes -o ConnectTimeout=10 $sshTarget `
            "cd `$HOME/resource-planner && docker compose ps --format '{{.Status}}' 2>/dev/null | head -1" 2>$null
        Write-Host "  attempt $i/$HealthRetries`: HTTP $status (container: $containerStatus)"

        if ("$containerStatus" -match 'Restarting') {
            break
        }
        Start-Sleep -Seconds $HealthIntervalSec
    }

    Write-Host ""
    Write-Host "Deployment failed: app did not become healthy." -ForegroundColor Red
    Write-Host "Recent remote logs:" -ForegroundColor Yellow
    ssh -o BatchMode=yes $sshTarget "cd `$HOME/resource-planner && docker compose logs --tail=80"
    $logs = ssh -o BatchMode=yes $sshTarget "cd `$HOME/resource-planner && docker compose logs --tail=120" 2>$null
    if ("$logs" -match 'P3005') {
        Write-Host ""
        Write-Host "Detected Prisma P3005 (existing DB without migration history)." -ForegroundColor Yellow
        Write-Host "Recover with:" -ForegroundColor Yellow
        Write-Host "  .\deploy-to-vm.ps1 -BaselineDb -SkipBuild" -ForegroundColor Gray
    }
    exit 1
}

function Deploy-App {
    Push-Location $ProjectRoot
    try {
        Write-Host "Deploying from: $ProjectRoot" -ForegroundColor Cyan
        if (-not $SkipBuild) {
            Write-Host "Building and starting containers on remote VM (this may take a few minutes)..." -ForegroundColor Cyan
            docker-compose --context $DOCKER_CONTEXT_NAME up -d --build
        } else {
            Write-Host "Restarting existing containers (no rebuild)..." -ForegroundColor Cyan
            docker-compose --context $DOCKER_CONTEXT_NAME up -d
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Deploy failed. Check output above." -ForegroundColor Red
            exit 1
        }

        Wait-ForHealthy

        Write-Host ""
        Write-Host "Deployment complete." -ForegroundColor Green
        Write-Host "  App (UI + API):  http://${REMOTE_HOST}:3001" -ForegroundColor White
        Write-Host "  Alternate port:  http://${REMOTE_HOST}:8080" -ForegroundColor White
        Write-Host ""
        Write-Host "Useful commands:" -ForegroundColor Cyan
        Write-Host "  docker --context $DOCKER_CONTEXT_NAME ps" -ForegroundColor Gray
        Write-Host "  docker --context $DOCKER_CONTEXT_NAME compose logs -f" -ForegroundColor Gray
    } finally {
        Pop-Location
    }
}

# Main
if ($SetupContext) {
    Test-SshConnection
    Setup-DockerContext
    Write-Host "Run .\deploy-to-vm.ps1 (without -SetupContext) to deploy." -ForegroundColor Cyan
    exit 0
}

Test-SshConnection
$ctx = docker context show 2>$null
if ($ctx -ne $DOCKER_CONTEXT_NAME) {
    $exists = docker context ls -q | Select-String -Pattern "^$([regex]::Escape($DOCKER_CONTEXT_NAME))`$"
    if (-not $exists) {
        Write-Host "Docker context '$DOCKER_CONTEXT_NAME' not found. Run with -SetupContext first:" -ForegroundColor Yellow
        Write-Host "  .\deploy-to-vm.ps1 -SetupContext" -ForegroundColor Gray
        exit 1
    }
    Write-Host "Using Docker context: $DOCKER_CONTEXT_NAME" -ForegroundColor Cyan
    docker context use $DOCKER_CONTEXT_NAME
}

if ($BaselineDb) {
    Invoke-BaselineDb
}

Deploy-App
