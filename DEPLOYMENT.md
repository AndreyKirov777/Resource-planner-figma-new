# Deployment Guide - Docker on Remote VM

This guide explains how to deploy the Resource Planning Application to a remote VM using Docker.

## Prerequisites

✅ Docker context "prod" is already created and points to your remote VM
✅ Docker configuration files have been created

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
- Expose the application on port 80 and 3001

#### Option B: Using Docker Commands Directly

Build the image:

```powershell
docker --context prod build -t resource-planner:latest .
```

Run the container:

```powershell
docker --context prod run -d `
  -p 80:3001 `
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
- **Web UI**: `http://[YOUR_VM_IP]` (port 80)

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
  -p 80:3001 `
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
If ports 80 or 3001 are already in use on the VM, modify the port mappings in `docker-compose.yml` or your docker run command.

## Important Notes

1. **Database Persistence**: The database is stored in a Docker named volume (`db-data`). This means:
   - The database persists even if you remove and recreate containers
   - The database is isolated from your local filesystem
   - You need to explicitly copy the database for backups (see Database Backup section)
   - On first deployment, a fresh database will be created with default data
2. **Environment Variables**: Add any production environment variables to the `docker-compose.yml` file under the `environment` section.
3. **HTTPS**: For production, consider setting up a reverse proxy (nginx) with SSL certificates.
4. **Firewall**: Ensure ports 80 and/or 3001 are open on your VM's firewall.

## Next Steps

Consider:
- Setting up automated backups
- Configuring a reverse proxy (nginx) for HTTPS
- Setting up monitoring and logging
- Implementing CI/CD for automated deployments

