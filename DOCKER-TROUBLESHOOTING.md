# Docker Troubleshooting Guide

This guide helps resolve common Docker issues with the IL2CPP Dump Analyzer MCP system.

## 🚀 Quick Setup

### Prerequisites
1. **Docker Desktop** installed and running
2. **Docker Compose** available
3. **At least 6GB RAM** available for Docker
4. **10GB free disk space** for models and data

### Initial Setup
```bash
# Linux/macOS
./docker-setup.sh

# Windows PowerShell
.\docker-setup.ps1
```

## 🔧 Common Issues and Solutions

### 1. Container Fails to Start

**Symptoms:**
- Container exits immediately
- Health check failures
- "Model loading timeout" errors

**Solutions:**

#### A. Increase Memory Allocation
```yaml
# In docker-compose.yml
deploy:
  resources:
    limits:
      memory: 6G  # Increase if you have more RAM
```

#### B. Extend Startup Time
```yaml
# In docker-compose.yml
healthcheck:
  start_period: 600s  # 10 minutes for slow systems
```

#### C. Check Docker Resources
```bash
# Check available memory
docker system df
docker system prune  # Clean up if needed
```

### 2. Xenova Model Download Issues

**Symptoms:**
- "Failed to load @xenova/transformers" errors
- Network timeout during startup
- Model cache permission errors

**Solutions:**

#### A. Pre-download Models (Recommended)
```bash
# Create a temporary container to download models
docker run --rm -v xenova-models:/models \
  node:18-slim sh -c "
    npm install @xenova/transformers && 
    node -e \"
      import('@xenova/transformers').then(async ({pipeline, env}) => {
        env.cacheDir = '/models';
        await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('Model downloaded successfully');
      })
    \"
  "
```

#### B. Use Alternative Model
```yaml
# In docker-compose.yml environment
EMBEDDINGS_MODEL: Xenova/all-MiniLM-L12-v2  # Smaller alternative
```

#### C. Fix Permissions
```bash
# Fix model cache permissions
docker volume rm il2cpp-xenova-models
docker volume create il2cpp-xenova-models
```

### 3. Supabase Connection Issues

**Symptoms:**
- "Connection refused" errors
- Database initialization failures
- PostgREST not responding

**Solutions:**

#### A. Check Service Dependencies
```bash
# Check if all services are running
docker-compose --env-file .env.docker ps

# Restart in correct order
docker-compose --env-file .env.docker down
docker-compose --env-file .env.docker up -d supabase-db
# Wait for database to be ready
docker-compose --env-file .env.docker up -d supabase-rest
docker-compose --env-file .env.docker up -d il2cpp-mcp
```

#### B. Verify Database Setup
```bash
# Check database logs
docker-compose --env-file .env.docker logs supabase-db

# Connect to database manually
docker exec -it il2cpp-supabase-db psql -U postgres -d il2cpp_analyzer
```

#### C. Reset Database
```bash
# Complete reset (WARNING: destroys data)
docker-compose --env-file .env.docker down -v
docker volume rm il2cpp-supabase-db-data
docker-compose --env-file .env.docker up -d
```

### 4. Memory and Performance Issues

**Symptoms:**
- Container killed by OOM (Out of Memory)
- Slow startup times
- High CPU usage

**Solutions:**

#### A. Optimize Docker Settings
```bash
# Increase Docker Desktop memory allocation
# Docker Desktop → Settings → Resources → Memory: 8GB+
```

#### B. Use Development Mode
```bash
# Use lighter development setup
docker-compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d
```

#### C. Monitor Resource Usage
```bash
# Monitor container resources
docker stats

# Check system resources
docker system df
```

### 5. Volume and Permission Issues

**Symptoms:**
- "Permission denied" errors
- Files not persisting
- Cannot write to mounted directories

**Solutions:**

#### A. Fix Volume Permissions
```bash
# Linux/macOS: Fix host directory permissions
sudo chown -R $USER:$USER data cache logs

# Windows: Run Docker Desktop as Administrator
```

#### B. Use Named Volumes (Recommended)
The updated docker-compose.yml now uses named volumes instead of bind mounts for better compatibility.

#### C. Reset Volumes
```bash
# Remove and recreate volumes
docker-compose --env-file .env.docker down
docker volume rm il2cpp-dumps il2cpp-cache il2cpp-logs
docker-compose --env-file .env.docker up -d
```

## 🔍 Debugging Commands

### Check Container Status
```bash
# View all containers
docker-compose --env-file .env.docker ps

# Check specific container logs
docker-compose --env-file .env.docker logs il2cpp-mcp

# Follow logs in real-time
docker-compose --env-file .env.docker logs -f il2cpp-mcp
```

### Interactive Debugging
```bash
# Access container shell
docker exec -it il2cpp-mcp-server bash

# Run health check manually
docker exec il2cpp-mcp-server node /app/docker/health-check.js

# Check environment variables
docker exec il2cpp-mcp-server env | grep -E "(SUPABASE|MODEL|NODE)"
```

### Network Debugging
```bash
# Check network connectivity
docker exec il2cpp-mcp-server ping supabase-rest
docker exec il2cpp-mcp-server curl -f http://supabase-rest:3000/

# Inspect Docker networks
docker network ls
docker network inspect il2cpp-network
```

## 📊 Performance Optimization

### For Development
```bash
# Use development compose with hot reloading
docker-compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d

# Access development tools
docker exec -it il2cpp-mcp-server-dev npm run test
```

### For Production
```bash
# Use production compose with optimizations
docker-compose --env-file .env.docker up -d

# Monitor performance
docker stats il2cpp-mcp-server
```

## 🆘 Getting Help

### Collect Debug Information
```bash
# Create debug report
echo "=== Docker Version ===" > debug-report.txt
docker --version >> debug-report.txt
echo "=== Docker Compose Version ===" >> debug-report.txt
docker-compose --version >> debug-report.txt
echo "=== Container Status ===" >> debug-report.txt
docker-compose --env-file .env.docker ps >> debug-report.txt
echo "=== Container Logs ===" >> debug-report.txt
docker-compose --env-file .env.docker logs --tail=100 >> debug-report.txt
echo "=== System Resources ===" >> debug-report.txt
docker system df >> debug-report.txt
```

### Reset Everything
```bash
# Nuclear option: complete reset
docker-compose --env-file .env.docker down -v --remove-orphans
docker system prune -a --volumes
./docker-setup.sh  # or .\docker-setup.ps1 on Windows
```

## 📝 Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDINGS_MODEL` | `Xenova/all-MiniLM-L6-v2` | Embedding model to use |
| `MODEL_CACHE_PATH` | `/app/models` | Model cache directory |
| `NODE_ENV` | `production` | Node.js environment |
| `LOG_LEVEL` | `info` | Logging level |
| `POSTGRES_PASSWORD` | (required) | Database password |
| `SUPABASE_SERVICE_ROLE_KEY` | (required) | Supabase service key |

## 🔄 Update Process

```bash
# Pull latest changes
git pull origin main

# Rebuild containers
docker-compose --env-file .env.docker build --no-cache

# Restart services
docker-compose --env-file .env.docker down
docker-compose --env-file .env.docker up -d
```
