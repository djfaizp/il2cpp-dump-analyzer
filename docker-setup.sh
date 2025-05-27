#!/bin/bash

# IL2CPP Dump Analyzer MCP - Docker Setup Script
# This script prepares the environment for Docker deployment

set -e

echo "🚀 Setting up IL2CPP Dump Analyzer MCP Docker environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

print_status "Docker and Docker Compose are installed"

# Create necessary directories
print_info "Creating required directories..."
mkdir -p data/dumps
mkdir -p data/samples
mkdir -p cache/models
mkdir -p cache/app
mkdir -p logs
mkdir -p docker/init-db
mkdir -p docker/dev-seed

print_status "Directories created"

# Set proper permissions
print_info "Setting directory permissions..."
chmod -R 755 data cache logs docker
print_status "Permissions set"

# Create environment files if they don't exist
if [ ! -f .env.docker ]; then
    print_info "Creating .env.docker file..."
    cat > .env.docker << 'EOF'
# IL2CPP Dump Analyzer MCP - Docker Environment Configuration

# Database Configuration
POSTGRES_DB=il2cpp_analyzer
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-super-secret-and-long-postgres-password
POSTGRES_PORT=5432

# Supabase Configuration
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# API Configuration
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
REST_PORT=3000

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info
EMBEDDINGS_MODEL=Xenova/all-MiniLM-L6-v2
MCP_SERVER_NAME=il2cpp-dump-analyzer

# Paths
IL2CPP_DUMPS_PATH=./data/dumps
MODEL_CACHE_PATH=./cache/models
EOF
    print_status ".env.docker created"
else
    print_warning ".env.docker already exists, skipping creation"
fi

# Create development environment file
if [ ! -f .env.docker.dev ]; then
    print_info "Creating .env.docker.dev file..."
    cat > .env.docker.dev << 'EOF'
# IL2CPP Dump Analyzer MCP - Development Docker Environment

# Database Configuration (Development)
POSTGRES_DB=il2cpp_dev
POSTGRES_USER=postgres
POSTGRES_PASSWORD=dev_password_123
POSTGRES_PORT=5433

# Supabase Configuration (Development)
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# Development Ports
STUDIO_PORT=3001
REST_PORT=8001
MCP_DEV_PORT=3000
MCP_DEBUG_PORT=9229

# Application Configuration (Development)
NODE_ENV=development
LOG_LEVEL=debug
EMBEDDINGS_MODEL=Xenova/all-MiniLM-L6-v2
MCP_SERVER_NAME=il2cpp-dump-analyzer-dev
EOF
    print_status ".env.docker.dev created"
else
    print_warning ".env.docker.dev already exists, skipping creation"
fi

# Create sample dump file if it doesn't exist
if [ ! -f data/dumps/dump.cs ]; then
    print_info "Creating sample dump.cs file..."
    cat > data/dumps/dump.cs << 'EOF'
// Sample IL2CPP dump file for testing
// This is a minimal example - replace with your actual dump.cs file

namespace UnityEngine
{
    public class MonoBehaviour : Behaviour
    {
        public MonoBehaviour() { }
        
        public virtual void Start() { }
        public virtual void Update() { }
        public virtual void OnDestroy() { }
    }
    
    public class GameObject : Object
    {
        public GameObject() { }
        public GameObject(string name) { }
        
        public T GetComponent<T>() where T : Component { return default(T); }
        public Component GetComponent(Type type) { return null; }
    }
}

namespace MyGame
{
    public class PlayerController : MonoBehaviour
    {
        public float speed = 5.0f;
        public int health = 100;
        
        public override void Start() { }
        public override void Update() { }
        
        public void Move(Vector3 direction) { }
        public void TakeDamage(int damage) { }
    }
}
EOF
    print_status "Sample dump.cs created in data/dumps/"
else
    print_warning "dump.cs already exists in data/dumps/, skipping creation"
fi

# Build Docker images
print_info "Building Docker images..."
if docker-compose --env-file .env.docker build; then
    print_status "Docker images built successfully"
else
    print_error "Failed to build Docker images"
    exit 1
fi

# Create Docker volumes
print_info "Creating Docker volumes..."
docker volume create il2cpp-supabase-db-data
docker volume create il2cpp-dumps
docker volume create il2cpp-xenova-models
docker volume create il2cpp-cache
docker volume create il2cpp-logs
print_status "Docker volumes created"

echo ""
print_status "Docker environment setup complete!"
echo ""
print_info "Next steps:"
echo "  1. Place your actual dump.cs file in data/dumps/"
echo "  2. Run: docker-compose --env-file .env.docker up -d"
echo "  3. Check logs: docker-compose --env-file .env.docker logs -f"
echo ""
print_info "For development:"
echo "  1. Run: docker-compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d"
echo "  2. Access Supabase Studio at: http://localhost:3001"
echo ""
print_warning "Note: First startup may take 5-10 minutes to download Xenova models"
