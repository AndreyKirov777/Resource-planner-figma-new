#!/usr/bin/env bash
# Deploy Resource Planning Application to the remote VM via rsync + SSH.
# Usage: ./deploy-to-vm.sh [--setup-only] [--skip-build] [--baseline-db]
# Requires: rsync, ssh. On Windows use Git Bash or WSL.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load config
# shellcheck source=scripts/deploy.config.sh
. "$SCRIPT_DIR/deploy.config.sh"
[ -f "$SCRIPT_DIR/deploy.config.local.sh" ] && . "$SCRIPT_DIR/deploy.config.local.sh"

SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
HEALTH_URL="http://127.0.0.1:3001/api/projects"
HEALTH_RETRIES="${HEALTH_RETRIES:-36}"   # ~3 minutes at 5s interval
HEALTH_INTERVAL_SEC="${HEALTH_INTERVAL_SEC:-5}"

usage() {
  echo "Usage: $0 [--setup-only] [--skip-build] [--baseline-db]"
  echo "  --setup-only    Create remote directory and ensure Docker only (one-time)."
  echo "  --skip-build    Sync and restart only, do not rebuild image."
  echo "  --baseline-db   Recover from Prisma P3005 on an existing non-empty DB volume,"
  echo "                  then start/redeploy. Safe for data; does not wipe the volume."
  exit 0
}

setup_only=false
skip_build=false
baseline_db=false
for arg in "$@"; do
  case "$arg" in
    --setup-only)   setup_only=true ;;
    --skip-build)   skip_build=true ;;
    --baseline-db)  baseline_db=true ;;
    -h|--help)      usage ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $0 [--setup-only] [--skip-build] [--baseline-db]" >&2
      exit 1
      ;;
  esac
done

ssh_check() {
  echo "Checking SSH connection to $SSH_TARGET..."
  err=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" "echo OK" 2>&1) || true
  if [ "$err" != "OK" ]; then
    echo "SSH failed. Error output:"
    echo "$err"
    echo ""
    echo "Fix:"
    echo "  1. Test login:  ssh $SSH_TARGET"
    echo "  2. If using keys: chmod 600 ~/.ssh/id_rsa  and  ssh-copy-id $SSH_TARGET"
    echo "  3. Or add your ~/.ssh/id_rsa.pub to the VM's ~/.ssh/authorized_keys"
    exit 1
  fi
  echo "SSH OK."
}

remote_setup() {
  echo "One-time setup on remote: creating app dir and ensuring Docker..."
  ssh "$SSH_TARGET" "mkdir -p $REMOTE_APP_PATH && (command -v docker >/dev/null 2>&1 || { echo 'Docker not found on VM. Install Docker and add your user to the docker group.'; exit 1; })"
  echo "Remote path: $REMOTE_APP_PATH"
}

sync_to_remote() {
  echo "Syncing project to $SSH_TARGET:$REMOTE_APP_PATH ..."
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'build' \
    --exclude 'dist' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '*.log' \
    --exclude '.app.pids' \
    --exclude 'logs' \
    "$PROJECT_ROOT/" "$SSH_TARGET:$REMOTE_APP_PATH/"
  echo "Sync done."
}

# Recover when prisma migrate deploy hits P3005 (existing schema, no migration history).
# Marks all committed migrations as applied, then applies any remaining schema drift via migrate diff.
baseline_remote_db() {
  echo "Baselining existing remote DB (Prisma P3005 recovery)..."
  # shellcheck disable=SC2029
  ssh "$SSH_TARGET" "cd $REMOTE_APP_PATH && set -e
    docker compose stop app 2>/dev/null || true

    # List migrations from the image (not the host copy) so --skip-build stays consistent.
    for m in \$(docker compose run --rm --no-deps --entrypoint sh app -c 'ls -1 prisma/migrations'); do
      echo \"Marking applied: \$m\"
      docker compose run --rm --no-deps -e DATABASE_URL=file:/app/data/dev.db \
        --entrypoint npx app prisma migrate resolve --applied \"\$m\" || true
    done

    echo 'Checking for remaining schema drift...'
    # Prisma may append an 'Update available' banner to stdout; drop it before executing SQL.
    docker compose run --rm --no-deps -e DATABASE_URL=file:/app/data/dev.db \
      --entrypoint npx app prisma migrate diff \
      --from-url file:/app/data/dev.db \
      --to-schema-datamodel prisma/schema.prisma \
      --script 2>/dev/null | awk '/^┌/{exit} {print}' > /tmp/resource-planner-schema-drift.sql

    if grep -Eqi '^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|PRAGMA)[[:space:]]' /tmp/resource-planner-schema-drift.sql; then
      echo 'Applying schema drift SQL:'
      cat /tmp/resource-planner-schema-drift.sql
      docker compose run --rm --no-deps -e DATABASE_URL=file:/app/data/dev.db -i \
        --entrypoint npx app prisma db execute --stdin --schema prisma/schema.prisma \
        < /tmp/resource-planner-schema-drift.sql
    else
      echo 'No schema drift after baseline.'
    fi

    docker compose run --rm --no-deps -e DATABASE_URL=file:/app/data/dev.db \
      --entrypoint npx app prisma migrate deploy
  "
  echo "Baseline done."
}

wait_for_healthy() {
  echo "Waiting for app to become healthy ($HEALTH_URL)..."
  local i status restarting
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    status=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" \
      "curl -sf -o /dev/null -w '%{http_code}' $HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
      echo "Health check OK (HTTP 200)."
      return 0
    fi

    restarting=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" \
      "cd $REMOTE_APP_PATH && docker compose ps --format '{{.Status}}' 2>/dev/null | head -1" || true)
    echo "  attempt $i/$HEALTH_RETRIES: HTTP $status (container: ${restarting:-unknown})"

    if echo "$restarting" | grep -qi 'Restarting'; then
      # Crash loop usually means migrate/start failed; no point waiting the full timeout.
      break
    fi
    sleep "$HEALTH_INTERVAL_SEC"
  done

  echo ""
  echo "Deployment failed: app did not become healthy."
  echo "Recent remote logs:"
  ssh -o BatchMode=yes "$SSH_TARGET" "cd $REMOTE_APP_PATH && docker compose logs --tail=80" || true
  echo ""
  if ssh -o BatchMode=yes "$SSH_TARGET" "cd $REMOTE_APP_PATH && docker compose logs --tail=120 2>/dev/null | grep -q 'P3005'"; then
    echo "Detected Prisma P3005 (existing DB without migration history)."
    echo "Recover with:"
    echo "  ./scripts/deploy-to-vm.sh --baseline-db --skip-build"
  fi
  exit 1
}

deploy_on_remote() {
  echo "Building and starting on remote..."
  if $skip_build; then
    ssh "$SSH_TARGET" "cd $REMOTE_APP_PATH && docker compose up -d"
  else
    ssh "$SSH_TARGET" "cd $REMOTE_APP_PATH && docker compose up -d --build"
  fi
}

print_success() {
  echo ""
  echo "Deployment complete."
  echo "  App (UI + API):  http://${REMOTE_HOST}:3001"
  echo "  Alternate port:  http://${REMOTE_HOST}:8080"
  echo ""
  echo "Logs: ssh $SSH_TARGET 'cd $REMOTE_APP_PATH && docker compose logs -f'"
}

if $setup_only; then
  ssh_check
  remote_setup
  echo "Run ./deploy-to-vm.sh to deploy."
  exit 0
fi

ssh_check
sync_to_remote

if $baseline_db; then
  baseline_remote_db
fi

deploy_on_remote
wait_for_healthy
print_success
