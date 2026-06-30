# Deployment Guide — Resource Planner

_Generated: 2026-06-30 · Deep scan · Source runbook: [DEPLOYMENT.md](../DEPLOYMENT.md)_

This summarizes how the app is built and deployed. The full step-by-step runbook (SSH setup,
troubleshooting, backups) lives in [DEPLOYMENT.md](../DEPLOYMENT.md) and
[DEPLOYMENT_SUMMARY.md](../DEPLOYMENT_SUMMARY.md).

## Production Model

- **One process serves everything.** The Express server ([server.ts](../server.ts)) serves the built SPA
  from `build/` **and** the `/api` JSON endpoints from the same origin (port 3001). No separate web server.
- A production run therefore needs a **fresh `npm run build`** so `build/` is current.
- Database is a SQLite file. In Docker it lives in a named volume; locally it's `prisma/dev.db`.

## Option A — Docker (recommended)

### Image build ([Dockerfile](../Dockerfile))
Multi-stage `node:20-alpine`:
1. **builder:** `npm ci` → `npx prisma generate` → `npm run build` (frontend).
2. **production:** `npm ci --omit=dev`, copies the generated Prisma client, `build/`, `server.ts`,
   `server-validation.ts`, and the runtime source deps (`src/utils`, `src/config`).
3. **Start command:** `npx prisma db push --accept-data-loss && npm run server` (syncs schema, then serves).

> `--accept-data-loss` lets `db push` drop renamed/removed tables on existing DBs — safe for this app's
> sync-on-start model, but be aware when changing the schema against a populated volume.

### Compose ([docker-compose.yml](../docker-compose.yml))
```bash
docker-compose up -d --build
```
- Ports: `3001:3001` (API & Web UI) and `8080:3001` (alternative Web UI port).
- Volume: `db-data:/app/data` persists the SQLite DB.
- Env: `NODE_ENV=production`, `PORT=3001`, `DATABASE_URL=file:/app/data/dev.db`.
- Healthcheck: `wget` against `http://localhost:3001/api/projects` every 30s.

Access: **http://<host>:8080** (or `:3001`).

## Option B — Deploy to VM ([scripts/deploy-to-vm.sh](../scripts/deploy-to-vm.sh))

Target VM: `res-pln-dev-vm.ipa.dataart.net` (rsync + SSH, builds image on the VM via Docker).

```bash
# one-time: create the remote app directory
./scripts/deploy-to-vm.sh --setup-only

# deploy (build + restart)
./scripts/deploy-to-vm.sh        # or: npm run deploy

# restart containers without rebuilding
./scripts/deploy-to-vm.sh --skip-build
```

- Requires `rsync` + `ssh`; passwordless SSH keys recommended (`chmod 600 ~/.ssh/id_rsa`).
- Override VM user/path: copy [scripts/deploy.config.sh](../scripts/deploy.config.sh) to
  `scripts/deploy.config.local.sh` and set `REMOTE_USER` / `REMOTE_APP_PATH`.
- **Windows:** use [scripts/deploy-to-vm.ps1](../scripts/deploy-to-vm.ps1) (Docker context "prod"):
  `.\deploy-to-vm.ps1 -SetupContext` once, then `.\deploy-to-vm.ps1`.

## Environment Variables

| Var | Default | Where |
| --- | --- | --- |
| `DATABASE_URL` | `file:<root>/prisma/dev.db` (local) · `file:/app/data/dev.db` (Docker) | server.ts / compose |
| `PORT` | `3001` (hardcoded `PORT` const in server.ts; compose sets env too) | server.ts / compose |
| `NODE_ENV` | `production` in Docker | compose |

Add production env vars under the `environment:` section of `docker-compose.yml`.

## Database Operations in Production

- **Backup** (named volume): `docker --context prod cp <container>:/app/prisma/dev.db ./backup-dev.db`
  (the runbook also references the `db-data` volume — confirm the live path with `docker exec`).
- **Restore:** copy a `.db` back into the container and restart.
- The DB persists across container recreation via the `db-data` volume; first deploy creates a fresh DB
  with the seeded Default Project.

## Operational Notes & Hardening (from runbook)

- **HTTPS:** put a reverse proxy (nginx) with TLS in front for production.
- **Firewall:** open `8080` and/or `3001` on the VM.
- **No auth** in the app itself — restrict network access accordingly.
- Consider automated backups, monitoring/logging, and CI/CD (none configured in-repo today).

## Pre-Deploy Checklist

1. `npx tsc --noEmit` and `npm test` pass (build doesn't type-check).
2. `npm run build` produces a current `build/`.
3. Schema changes reviewed — `db push --accept-data-loss` runs on container start.
4. README API list in sync with `server.ts` (drift test).
