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
#>
param(
    [switch] $SetupContext,
    [switch] $SkipBuild
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
        Write-Host ""
        Write-Host "Deployment complete." -ForegroundColor Green
        Write-Host "  Web UI:  http://${REMOTE_HOST}" -ForegroundColor White
        Write-Host "  API:     http://${REMOTE_HOST}:3001" -ForegroundColor White
        Write-Host ""
        Write-Host "Useful commands:" -ForegroundColor Cyan
        Write-Host "  docker --context $DOCKER_CONTEXT_NAME ps" -ForegroundColor Gray
        Write-Host "  docker --context $DOCKER_CONTEXT_NAME logs -f resourceplannerfigma-app-1" -ForegroundColor Gray
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

Deploy-App
