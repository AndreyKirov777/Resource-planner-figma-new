# Deployment configuration for res-pln-dev-vm.ipa.dataart.net
# Override in deploy.config.local.sh (optional, git-ignored).

REMOTE_HOST="${REMOTE_HOST:-res-pln-dev-vm.ipa.dataart.net}"
REMOTE_USER="${REMOTE_DEPLOY_USER:-asadakov}"
# Use $HOME on the remote (so it works when /home/username doesn't exist or isn't writable)
REMOTE_APP_PATH="${REMOTE_APP_PATH:-\$HOME/resource-planner}"
