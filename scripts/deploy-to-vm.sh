#!/usr/bin/env bash
# Deploy Resource Planning Application to the remote VM via rsync + SSH.
# Usage: ./deploy-to-vm.sh [--setup-only] [--skip-build]
# Requires: rsync, ssh. On Windows use Git Bash or WSL.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load config
# shellcheck source=scripts/deploy.config.sh
. "$SCRIPT_DIR/deploy.config.sh"
[ -f "$SCRIPT_DIR/deploy.config.local.sh" ] && . "$SCRIPT_DIR/deploy.config.local.sh"

SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

usage() {
  echo "Usage: $0 [--setup-only] [--skip-build]"
  echo "  --setup-only   Create remote directory and install Docker only (one-time)."
  echo "  --skip-build   Sync and restart only, do not rebuild image."
  exit 0
}

setup_only=false
skip_build=false
for arg in "$@"; do
  case "$arg" in
    --setup-only)  setup_only=true ;;
    --skip-build)  skip_build=true ;;
    -h|--help)     usage ;;
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

deploy_on_remote() {
  echo "Building and starting on remote..."
  if $skip_build; then
    ssh "$SSH_TARGET" "cd $REMOTE_APP_PATH && docker compose up -d"
  else
    ssh "$SSH_TARGET" "cd $REMOTE_APP_PATH && docker compose up -d --build"
  fi
  echo ""
  echo "Deployment complete."
  echo "  App (UI + API):  http://${REMOTE_HOST}:8080"
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
deploy_on_remote
