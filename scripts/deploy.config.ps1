# Deployment configuration for res-pln-dev-vm.ipa.dataart.net
# Copy this file to deploy.config.local.ps1 and adjust if needed (optional).
# The local file is ignored by git.

$REMOTE_HOST = "res-pln-dev-vm.ipa.dataart.net"
# VM user (override with REMOTE_DEPLOY_USER env or deploy.config.local.ps1)
$REMOTE_USER = if ($env:REMOTE_DEPLOY_USER) { $env:REMOTE_DEPLOY_USER } else { "asadakov" }
$REMOTE_APP_PATH = "/home/$REMOTE_USER/resource-planner"
$DOCKER_CONTEXT_NAME = "prod"
