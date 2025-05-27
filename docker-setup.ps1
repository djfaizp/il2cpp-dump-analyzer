# IL2CPP Dump Analyzer MCP - Docker Setup Script (PowerShell)
# This script prepares the environment for Docker deployment on Windows

param(
    [switch]$Force = $false
)

# Set error action preference
$ErrorActionPreference = "Stop"

Write-Host "🚀 Setting up IL2CPP Dump Analyzer MCP Docker environment..." -ForegroundColor Green

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Blue
}

# Check if Docker is installed
try {
    docker --version | Out-Null
    Write-Status "Docker is installed"
} catch {
    Write-Error "Docker is not installed. Please install Docker Desktop first."
    exit 1
}

# Check if Docker Compose is installed
try {
    docker-compose --version | Out-Null
    Write-Status "Docker Compose is installed"
} catch {
    Write-Error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
}

# Create necessary directories
Write-Info "Creating required directories..."
$directories = @(
    "data\dumps",
    "data\samples", 
    "cache\models",
    "cache\app",
    "logs",
    "docker\init-db",
    "docker\dev-seed"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}
Write-Status "Directories created"

# Create environment files if they don't exist
if (!(Test-Path ".env.docker") -or $Force) {
    Write-Info "Creating .env.docker file..."
    @"
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
"@ | Out-File -FilePath ".env.docker" -Encoding UTF8
    Write-Status ".env.docker created"
} else {
    Write-Warning ".env.docker already exists, skipping creation (use -Force to overwrite)"
}

# Create development environment file
if (!(Test-Path ".env.docker.dev") -or $Force) {
    Write-Info "Creating .env.docker.dev file..."
    @"
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
"@ | Out-File -FilePath ".env.docker.dev" -Encoding UTF8
    Write-Status ".env.docker.dev created"
} else {
    Write-Warning ".env.docker.dev already exists, skipping creation (use -Force to overwrite)"
}

# Create sample dump file if it doesn't exist
if (!(Test-Path "data\dumps\dump.cs") -or $Force) {
    Write-Info "Creating sample dump.cs file..."
    @"
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
"@ | Out-File -FilePath "data\dumps\dump.cs" -Encoding UTF8
    Write-Status "Sample dump.cs created in data\dumps\"
} else {
    Write-Warning "dump.cs already exists in data\dumps\, skipping creation (use -Force to overwrite)"
}

# Build Docker images
Write-Info "Building Docker images..."
try {
    docker-compose --env-file .env.docker build
    Write-Status "Docker images built successfully"
} catch {
    Write-Error "Failed to build Docker images: $_"
    exit 1
}

# Create Docker volumes
Write-Info "Creating Docker volumes..."
$volumes = @(
    "il2cpp-supabase-db-data",
    "il2cpp-dumps", 
    "il2cpp-xenova-models",
    "il2cpp-cache",
    "il2cpp-logs"
)

foreach ($volume in $volumes) {
    try {
        docker volume create $volume | Out-Null
    } catch {
        # Volume might already exist, that's okay
    }
}
Write-Status "Docker volumes created"

Write-Host ""
Write-Status "Docker environment setup complete!"
Write-Host ""
Write-Info "Next steps:"
Write-Host "  1. Place your actual dump.cs file in data\dumps\"
Write-Host "  2. Run: docker-compose --env-file .env.docker up -d"
Write-Host "  3. Check logs: docker-compose --env-file .env.docker logs -f"
Write-Host ""
Write-Info "For development:"
Write-Host "  1. Run: docker-compose -f docker-compose.dev.yml --env-file .env.docker.dev up -d"
Write-Host "  2. Access Supabase Studio at: http://localhost:3001"
Write-Host ""
Write-Warning "Note: First startup may take 5-10 minutes to download Xenova models"
