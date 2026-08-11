# Deployment Guide - Docker on Remote VM

This guide explains how to deploy the Resource Planning Application to a remote VM (res-pln-dev-vm.ipa.dataart.net) using Docker.

## Deploy from your local machine (recommended)

Use the deploy script from the project root. One-time setup is required.

### One-time setup

1. **SSH access**  
   Ensure you can log in to the VM:
   ```bash
   ssh your-username@res-pln-dev-vm.ipa.dataart.net
   ```
   Use SSH keys for passwordless deploy (recommended). Fix key permissions if needed: `chmod 600 ~/.ssh/id_rsa`.

2. **Docker on the VM**  
   Docker must be installed on the VM, and your user must be in the `docker` group (e.g. `sudo usermod -aG docker $USER` and log in again).

3. **One-time remote setup (macOS/Linux)**  
   From the project root:
   ```bash
   chmod +x scripts/deploy-to-vm.sh
   ./scripts/deploy-to-vm.sh --setup-only
   ```
   This creates the app directory on the VM. To use a different VM user or path, copy `scripts/deploy.config.sh` to `scripts/deploy.config.local.sh` and set `REMOTE_USER` and/or `REMOTE_APP_PATH`.

### Deploy (macOS / Linux)

From the project root:
```bash
./scripts/deploy-to-vm.sh
```
Or: `npm run deploy`

To only restart containers without rebuilding:
```bash
./scripts/deploy-to-vm.sh --skip-build
```

The script waits for `http://127.0.0.1:3001/api/projects` on the VM and fails (with logs) if the container crash-loops.

If deploy fails with Prisma **P3005** (existing DB volume without migration history), recover without wiping data:
```bash
./scripts/deploy-to-vm.sh --baseline-db --skip-build
```

Requires `rsync` and `ssh` (both are standard on macOS).

### Deploy (Windows)

Use Git Bash / WSL and the same shell script:
```bash
./scripts/deploy-to-vm.sh --setup-only   # one-time
./scripts/deploy-to-vm.sh                # deploy
./scripts/deploy-to-vm.sh --baseline-db --skip-build   # P3005 recovery
```
Optional override: copy `scripts/deploy.config.sh` to `scripts/deploy.config.local.sh` and set `REMOTE_USER`.

---

## Manual deployment (Docker context)

### Prerequisites

- Docker context "prod" is created and points to your remote VM (see **One-time setup** above), or you use the deploy script.
- Docker configuration files (Dockerfile, docker-compose.yml) are in the project.

## Deployment Steps

### 1. Verify Docker Context

First, confirm your "prod" context is active:

```powershell
docker context ls
```

You should see your "prod" context in the list. To switch to it:

```powershell
docker context use prod
```

### 2. Build and Deploy

#### Option A: Using Docker Compose (Recommended)

Build and start the application on the remote VM:

```powershell
docker-compose --context prod up -d --build
```

This will:
- Build the Docker image on the remote VM
- Start the container in detached mode
- Expose the application on port 8080 (Web UI) and 3001 (API). If port 80 is free on the VM, you can change `8080:3001` to `80:3001` in `docker-compose.yml`.

#### Option B: Using Docker Commands Directly

Build the image:

```powershell
docker --context prod build -t resource-planner:latest .
```

Run the container:

```powershell
docker --context prod run -d `
  -p 8080:3001 `
  -p 3001:3001 `
  -v resource-planner-data:/app/data `
  --name resource-planner `
  --restart unless-stopped `
  resource-planner:latest
```

### 3. Verify Deployment

Check if the container is running:

```powershell
docker --context prod ps
```

View application logs:

```powershell
docker --context prod logs -f resource-planner
```

### 4. Access Your Application

Once deployed, access your application at:
- **API**: `http://[YOUR_VM_IP]:3001`
- **Web UI**: `http://[YOUR_VM_IP]:8080`

## Managing the Application

### View Logs
```powershell
docker --context prod logs -f resource-planner
```

### Restart the Application
```powershell
docker --context prod restart resource-planner
```

### Stop the Application
```powershell
docker --context prod stop resource-planner
```

### Update the Application

When you make changes to the code:

```powershell
# Rebuild and restart
docker-compose --context prod up -d --build

# Or manually:
docker --context prod stop resource-planner
docker --context prod rm resource-planner
docker --context prod build -t resource-planner:latest .
docker --context prod run -d `
  -p 8080:3001 `
  -p 3001:3001 `
  -v resource-planner-data:/app/data `
  --name resource-planner `
  --restart unless-stopped `
  resource-planner:latest
```

### Database Backup

The database is stored in a Docker named volume (`db-data`). To backup your SQLite database:

```powershell
# Get the container name
docker --context prod ps

# Backup the database (replace 'resourceplannerfigma-app-1' with your actual container name)
docker --context prod cp resourceplannerfigma-app-1:/app/prisma/dev.db ./backup-dev.db
```

To restore from backup:

```powershell
# Copy backup into container
docker --context prod cp ./backup-dev.db resourceplannerfigma-app-1:/app/prisma/dev.db

# Restart the container
docker-compose --context prod restart
```

### Migrating Existing Database

If you want to use your existing local database, copy it to the container after first deployment:

```powershell
# First, deploy the application (it will create an empty database)
docker-compose --context prod up -d --build

# Then copy your local database
docker --context prod cp "./prisma/dev.db" resourceplannerfigma-app-1:/app/prisma/dev.db

# Restart to use the new database
docker-compose --context prod restart
```

## Troubleshooting

### SSH: "Permission denied (publickey)" or "UNPROTECTED PRIVATE KEY FILE"
- **Key permissions**: Your private key must not be readable by others. On macOS/Linux: `chmod 600 ~/.ssh/id_rsa`. On Windows (PowerShell): `icacls $env:USERPROFILE\.ssh\id_rsa /inheritance:r /grant:r "$env:USERNAME:R"`.
- Ensure your public key is on the VM: `ssh-copy-id your-username@res-pln-dev-vm.ipa.dataart.net` (or add `~/.ssh/id_rsa.pub` to `~/.ssh/authorized_keys` on the VM).

### Container won't start
```powershell
# Check logs for errors
docker --context prod logs resource-planner

# Check container status
docker --context prod ps -a
```

### Database issues
```powershell
# Access container shell
docker --context prod exec -it resource-planner sh

# Run migrations manually
docker --context prod exec resource-planner npx prisma migrate deploy
```

### Port conflicts
If you see **"Bind for 0.0.0.0:80 failed: port is already allocated"**, port 80 is in use on the VM. The default is now **8080** for the Web UI (see `docker-compose.yml`). Use `http://VM:8080` to open the app. To use port 80 instead, change `8080:3001` to `80:3001` in `docker-compose.yml` and free port 80 on the VM (e.g. stop nginx or another service).

## Important Notes

1. **Database Persistence**: The database is stored in a Docker named volume (`db-data`). This means:
   - The database persists even if you remove and recreate containers
   - The database is isolated from your local filesystem
   - You need to explicitly copy the database for backups (see Database Backup section)
   - On first deployment, a fresh database will be created with default data
2. **Environment Variables**: Add any production environment variables to the `docker-compose.yml` file under the `environment` section.
3. **HTTPS**: For production, consider setting up a reverse proxy (nginx) with SSL certificates.
4. **Firewall**: Ensure ports 8080 and/or 3001 are open on your VM's firewall.

## Next Steps

Consider:
- Setting up automated backups
- Configuring a reverse proxy (nginx) for HTTPS
- Setting up monitoring and logging
- Implementing CI/CD for automated deployments

