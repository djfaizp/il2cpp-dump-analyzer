# IL2CPP Dump Analyzer MCP Server - Multi-stage Docker Build
# Optimized for both development and production environments

# =============================================================================
# Base Stage - Common dependencies and setup
# =============================================================================
FROM node:18-slim AS base

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs il2cpp

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY tsconfig.json ./

# =============================================================================
# Dependencies Stage - Install and cache dependencies
# =============================================================================
FROM base AS deps

# Install all dependencies (including dev dependencies for building)
RUN npm install && \
    npm cache clean --force

# =============================================================================
# Build Stage - Compile TypeScript and prepare production assets
# =============================================================================
FROM base AS builder

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY src ./src
COPY bin ./bin

# Build the application
RUN npm run build

# Remove dev dependencies and install only production dependencies
RUN rm -rf node_modules && \
    npm install --only=production && \
    npm cache clean --force

# =============================================================================
# Development Stage - For development with hot reloading
# =============================================================================
FROM base AS development

# Copy all dependencies (including dev dependencies)
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY src ./src
COPY bin ./bin
COPY jest.config.js ./
COPY .env.example ./

# Create directories for volumes with proper permissions
RUN mkdir -p /app/data /app/data/dumps /app/models /app/cache /app/logs && \
    chown -R il2cpp:nodejs /app && \
    chmod -R 755 /app/data /app/models /app/cache /app/logs

# Switch to non-root user
USER il2cpp

# Expose port for development server (if needed)
EXPOSE 3000

# Health check for development
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Development container healthy')" || exit 1

# Default command for development
CMD ["npm", "run", "dev"]

# =============================================================================
# Production Stage - Minimal production image
# =============================================================================
FROM node:18-slim AS production

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    dumb-init \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs il2cpp

# Set working directory
WORKDIR /app

# Copy production dependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/package.json ./

# Copy configuration files
COPY .env.example ./

# Copy Docker utilities
COPY docker/health-check.js ./docker/health-check.js

# Create directories for volumes and set permissions
RUN mkdir -p /app/data /app/data/dumps /app/models /app/cache /app/logs && \
    chmod +x /app/docker/health-check.js && \
    chown -R il2cpp:nodejs /app && \
    chmod -R 755 /app/data /app/models /app/cache /app/logs

# Switch to non-root user
USER il2cpp

# Enhanced health check for production
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
    CMD node /app/docker/health-check.js || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Default command for production (MCP stdio server)
CMD ["node", "bin/il2cpp-mcp-stdio.js"]

# =============================================================================
# Default target
# =============================================================================
FROM production AS default
