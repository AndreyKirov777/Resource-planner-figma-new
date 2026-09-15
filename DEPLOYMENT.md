# Deployment Guide - Docker on Remote VM

This guide explains how to deploy the Resource Planning Application to a remote VM (res-pln-dev-vm.ipa.dataart.net) using Docker.

## Authentication prerequisites (multi-user access)

The app now requires sign-in via Microsoft Entra ID in production (`AUTH_MODE=entra`, the default when unset). Set these up **before** the first production deploy.

### 1. HTTPS reverse proxy (required)

Session cookies are marked `Secure` in production (`COOKIE_SECURE` defaults to `true` whenever `NODE_ENV=production`), so the app must sit behind TLS. Put a reverse proxy in front of the container and forward only port 3001 internally. A minimal [Caddy](https://caddyserver.com/) example (`Caddyfile`):

```
res-pln-dev-vm.ipa.dataart.net {
  reverse_proxy localhost:3001
}
```

Caddy provisions and renews the certificate automatically. Set `TRUST_PROXY=1` on the app container so Express trusts the proxy's `X-Forwarded-*` headers.

### 2. Entra ID app registration

In the Azure portal (Entra ID → App registrations → New registration):

1. **Redirect URIs** (platform: Web) — add both:
   - `https://res-pln-dev-vm.ipa.dataart.net/auth/callback` (production)
   - `http://localhost:3001/auth/callback` (local dev against a real tenant)
2. **Client secret** — Certificates & secrets → New client secret. Copy the value into `ENTRA_CLIENT_SECRET` (it is shown once).
3. **`groups` claim** — Token configuration → Add groups claim → Security groups, for both ID and access tokens. Entra only emits the `groups` claim for groups the app registration is explicitly configured to receive; keep this to a small set (the three groups below), not "all groups the user is in" — see the overage risk note below.
4. **Three security groups** — create (or reuse) three Entra security groups for ADMIN, MANAGER, and USER, and note their object ids for `ENTRA_GROUP_ADMIN`/`ENTRA_GROUP_MANAGER`/`ENTRA_GROUP_USER`.
5. Record the **Application (client) ID** and **Directory (tenant) ID** for `ENTRA_CLIENT_ID` / `ENTRA_TENANT_ID`.

Membership in these groups is managed entirely in Entra — the app never assigns or edits group membership.

### 3. Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `AUTH_MODE` | no | `entra` (default) in production; `dev` is refused when `NODE_ENV=production`. |
| `SESSION_SECRET` | yes (entra) | Signs the short-lived sign-in flow cookie. `openssl rand -base64 32`. |
| `ENTRA_TENANT_ID` | yes (entra) | Directory (tenant) ID. |
| `ENTRA_CLIENT_ID` | yes (entra) | Application (client) ID. |
| `ENTRA_CLIENT_SECRET` | yes (entra) | Client secret value. |
| `ENTRA_REDIRECT_URI` | yes (entra) | `https://<host>/auth/callback`. |
| `ENTRA_GROUP_ADMIN` / `_MANAGER` / `_USER` | yes (entra) | Security group object ids. |
| `ADMIN_EMAILS` | recommended | Comma-separated emails that bootstrap as ADMIN before groups are wired up; the first sign-in from one of these assigns all pre-existing (legacy) projects to that user. |
| `COOKIE_SECURE` | no | Defaults to `true` in production. Set `false` only for an HTTP-only staging environment. |
| `TRUST_PROXY` | yes (behind a proxy) | `1` so Express trusts `X-Forwarded-*` from the reverse proxy. |
| `DATABASE_URL` | no | Defaults to `file:/app/data/dev.db?connection_limit=1` in the container; keep the `connection_limit=1` param (SQLite + WAL, see below). |

### 4. First sign-in

After deploying, sign in once with an `ADMIN_EMAILS` account. This assigns every pre-existing (legacy, ownerless) project to that admin and creates its `ProjectMember` (OWNER) row — the one-time ownership migration described in the design.

### 5. Client links

The old public `/client/:projectId` view is retired. Clients are shared via an expiring, unguessable link created from the "Share…" dialog (`POST /api/projects/:id/share-links`), served at `/client/:token` and backed by the public `GET /api/share/:token` route — no session required, and the response is an explicit client-safe allow-list (never internal cost/margin figures). A link stops working once it's revoked or past its `days` (7/30/90).

### 6. Database backups

The container's `sqlite3` CLI (installed in the production image) takes a consistent online backup even while the app is running (SQLite's WAL mode makes this safe):

```bash
# Run daily via cron on the host, or as a scheduled task hitting the container:
docker --context prod exec resource-planner sqlite3 /app/data/dev.db ".backup /app/data/backup-$(date +\%F).db"
```

A host crontab entry (adjust the container name):

```cron
0 3 * * * docker --context prod exec resource-planner sqlite3 /app/data/dev.db ".backup /app/data/backup-$(date +\%F).db"
```

Prune old `backup-*.db` files on a schedule that matches your retention needs.

## Deploy from your local machine (recommended)

Use the deploy script from the project root. One-time setup is required.

### Environments

| Env | Host | Address | Deploy |
| --- | --- | --- | --- |
| **prod** (default) | `res-pln-dev-vm.ipa.dataart.net` | `172.23.224.164` | `npm run deploy` or `./scripts/deploy-to-vm.sh --env prod` |
| **test** | `marenas-aiagent-vm.ipa.dataart.net` | `172.23.224.99` | `npm run deploy:test` or `./scripts/deploy-to-vm.sh --env test` |

Both VMs use the same Docker layout: app at `~/resource-planner`, ports **3001** and **8080**, named volume `db-data`. TEST gets its own empty database — it does not copy PROD data.

### One-time setup

1. **SSH access**  
   Ensure you can log in to the target VM:
   ```bash
   ssh your-username@res-pln-dev-vm.ipa.dataart.net   # prod
   ssh your-username@172.23.224.99                    # test
   ```
   Use SSH keys for passwordless deploy (recommended). Fix key permissions if needed: `chmod 600 ~/.ssh/id_rsa`.

2. **Docker on the VM**  
   Docker must be installed on the VM, and your user must be in the `docker` group (e.g. `sudo usermod -aG docker $USER` and log in again).

3. **One-time remote setup (macOS/Linux)**  
   From the project root:
   ```bash
   chmod +x scripts/deploy-to-vm.sh
   ./scripts/deploy-to-vm.sh --setup-only            # prod
   ./scripts/deploy-to-vm.sh --env test --setup-only # test
   ```
   This creates the app directory on the VM. To use a different VM user or path, copy `scripts/deploy.config.sh` to `scripts/deploy.config.local.sh` and set `REMOTE_USER` and/or `REMOTE_APP_PATH`.

### Deploy (macOS / Linux)

From the project root:
```bash
./scripts/deploy-to-vm.sh            # prod
./scripts/deploy-to-vm.sh --env test # test
```
Or: `npm run deploy` / `npm run deploy:test`

To only restart containers without rebuilding:
```bash
./scripts/deploy-to-vm.sh --skip-build
./scripts/deploy-to-vm.sh --env test --skip-build
```

The script waits for `http://127.0.0.1:3001/api/health` on the VM and fails (with logs) if the container crash-loops.

If deploy fails with Prisma **P3005** (existing DB volume without migration history), recover without wiping data:
```bash
./scripts/deploy-to-vm.sh --baseline-db --skip-build
```

Requires `rsync` and `ssh` (both are standard on macOS).

### Deploy (Windows)

Use Git Bash / WSL and the same shell script:
```bash
./scripts/deploy-to-vm.sh --setup-only   # one-time (prod)
./scripts/deploy-to-vm.sh --env test --setup-only
./scripts/deploy-to-vm.sh                # deploy prod
./scripts/deploy-to-vm.sh --env test     # deploy test
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
3. **HTTPS**: Required in production — session cookies are `Secure`. See "Authentication prerequisites" above.
4. **Firewall**: Ensure ports 8080 and/or 3001 are open on your VM's firewall.

## Next Steps

Consider:
- Automating the database backup cron (see "Authentication prerequisites" above)
- Setting up monitoring and logging
- Implementing CI/CD for automated deployments

