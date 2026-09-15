# Deployment targets. Override in deploy.config.local.sh (optional, git-ignored).
#
#   prod  172.23.224.164  res-pln-dev-vm.ipa.dataart.net
#   test  172.23.224.99   marenas-aiagent-vm.ipa.dataart.net
#
# Select with DEPLOY_ENV=test or ./scripts/deploy-to-vm.sh --env test

DEPLOY_ENV="${DEPLOY_ENV:-prod}"

case "$DEPLOY_ENV" in
  prod)
    REMOTE_HOST="${REMOTE_HOST:-res-pln-dev-vm.ipa.dataart.net}"
    ;;
  test)
    REMOTE_HOST="${REMOTE_HOST:-172.23.224.99}"
    ;;
  *)
    echo "Unknown DEPLOY_ENV='$DEPLOY_ENV' (use prod or test)." >&2
    exit 1
    ;;
esac

REMOTE_USER="${REMOTE_DEPLOY_USER:-asadakov}"
# Use $HOME on the remote (so it works when /home/username doesn't exist or isn't writable)
REMOTE_APP_PATH="${REMOTE_APP_PATH:-\$HOME/resource-planner}"
