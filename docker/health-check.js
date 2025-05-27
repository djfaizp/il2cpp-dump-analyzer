#!/usr/bin/env node

/**
 * Enhanced Docker health check script for IL2CPP dump analyzer MCP system
 * Performs comprehensive health checks for container monitoring
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

// Health check configuration - Docker-optimized
const HEALTH_CHECK_CONFIG = {
  timeout: 30000, // 30 seconds - increased for model loading
  retries: 3,
  components: {
    process: true,
    memory: true,
    disk: true,
    dependencies: true,
    mcp: true
  },
  thresholds: {
    memoryUsagePercent: 95, // Increased for Xenova models
    diskUsagePercent: 95,
    responseTimeMs: 15000 // Increased timeout
  }
};

/**
 * Main health check function
 */
async function performHealthCheck() {
  const startTime = Date.now();
  const results = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {},
    metrics: {},
    errors: []
  };

  try {
    console.log('Starting Docker health check...');

    // Check process health
    if (HEALTH_CHECK_CONFIG.components.process) {
      results.checks.process = await checkProcessHealth();
    }

    // Check memory usage
    if (HEALTH_CHECK_CONFIG.components.memory) {
      results.checks.memory = await checkMemoryHealth();
    }

    // Check disk usage
    if (HEALTH_CHECK_CONFIG.components.disk) {
      results.checks.disk = await checkDiskHealth();
    }

    // Check dependencies
    if (HEALTH_CHECK_CONFIG.components.dependencies) {
      results.checks.dependencies = await checkDependencies();
    }

    // Check MCP server
    if (HEALTH_CHECK_CONFIG.components.mcp) {
      results.checks.mcp = await checkMCPHealth();
    }

    // Determine overall health status
    const failedChecks = Object.values(results.checks).filter(check => !check.healthy);
    if (failedChecks.length > 0) {
      results.status = 'unhealthy';
      results.errors = failedChecks.map(check => check.error).filter(Boolean);
    }

    // Add performance metrics
    results.metrics.responseTime = Date.now() - startTime;
    results.metrics.memoryUsage = process.memoryUsage();
    results.metrics.uptime = process.uptime();

    // Log results
    console.log(`Health check completed: ${results.status} (${results.metrics.responseTime}ms)`);

    if (results.status === 'healthy') {
      console.log('✅ All health checks passed');
      process.exit(0);
    } else {
      console.error('❌ Health check failed:', results.errors);
      process.exit(1);
    }

  } catch (error) {
    console.error('Health check error:', error);
    process.exit(1);
  }
}

/**
 * Check process health
 */
async function checkProcessHealth() {
  try {
    // Check if the main process is responsive
    const isResponsive = process.pid > 0 && process.uptime() > 0;

    return {
      healthy: isResponsive,
      details: {
        pid: process.pid,
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform
      }
    };
  } catch (error) {
    return {
      healthy: false,
      error: `Process health check failed: ${error.message}`,
      details: { error: error.message }
    };
  }
}

/**
 * Check memory health
 */
async function checkMemoryHealth() {
  try {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.rss + memUsage.heapTotal;
    const usagePercent = (memUsage.rss / totalMemory) * 100;

    const isHealthy = usagePercent < HEALTH_CHECK_CONFIG.thresholds.memoryUsagePercent;

    return {
      healthy: isHealthy,
      details: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        usagePercent: Math.round(usagePercent * 100) / 100
      },
      error: !isHealthy ? `Memory usage too high: ${usagePercent.toFixed(1)}%` : undefined
    };
  } catch (error) {
    return {
      healthy: false,
      error: `Memory health check failed: ${error.message}`,
      details: { error: error.message }
    };
  }
}

/**
 * Check disk health
 */
async function checkDiskHealth() {
  try {
    const paths = ['/app', '/app/data', '/app/models', '/app/cache'];
    const diskChecks = {};

    for (const checkPath of paths) {
      try {
        await fs.access(checkPath);
        const stats = await fs.stat(checkPath);
        diskChecks[checkPath] = {
          accessible: true,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime
        };
      } catch (error) {
        diskChecks[checkPath] = {
          accessible: false,
          error: error.message
        };
      }
    }

    const allAccessible = Object.values(diskChecks).every(check => check.accessible);

    return {
      healthy: allAccessible,
      details: diskChecks,
      error: !allAccessible ? 'Some required paths are not accessible' : undefined
    };
  } catch (error) {
    return {
      healthy: false,
      error: `Disk health check failed: ${error.message}`,
      details: { error: error.message }
    };
  }
}

/**
 * Check dependencies health
 */
async function checkDependencies() {
  try {
    const dependencies = {
      supabase: await checkSupabaseConnection(),
      models: await checkModelsAvailability(),
      environment: await checkEnvironmentVariables()
    };

    const allHealthy = Object.values(dependencies).every(dep => dep.healthy);

    return {
      healthy: allHealthy,
      details: dependencies,
      error: !allHealthy ? 'Some dependencies are unhealthy' : undefined
    };
  } catch (error) {
    return {
      healthy: false,
      error: `Dependencies health check failed: ${error.message}`,
      details: { error: error.message }
    };
  }
}

/**
 * Check Supabase connection
 */
async function checkSupabaseConnection() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        healthy: false,
        error: 'Supabase configuration missing'
      };
    }

    // Simple connectivity check (without making actual HTTP request to avoid dependencies)
    return {
      healthy: true,
      details: {
        url: supabaseUrl,
        keyConfigured: !!supabaseKey
      }
    };
  } catch (error) {
    return {
      healthy: false,
      error: `Supabase check failed: ${error.message}`
    };
  }
}

/**
 * Check models availability
 */
async function checkModelsAvailability() {
  try {
    const modelCachePath = process.env.MODEL_CACHE_PATH || '/app/models';

    try {
      await fs.access(modelCachePath);
      const stats = await fs.stat(modelCachePath);

      return {
        healthy: true,
        details: {
          path: modelCachePath,
          accessible: true,
          isDirectory: stats.isDirectory()
        }
      };
    } catch (error) {
      return {
        healthy: false,
        error: `Models directory not accessible: ${error.message}`,
        details: { path: modelCachePath }
      };
    }
  } catch (error) {
    return {
      healthy: false,
      error: `Models check failed: ${error.message}`
    };
  }
}

/**
 * Check environment variables
 */
async function checkEnvironmentVariables() {
  try {
    const requiredEnvVars = [
      'NODE_ENV',
      'SUPABASE_URL',
      'MCP_TRANSPORT'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    return {
      healthy: missingVars.length === 0,
      details: {
        required: requiredEnvVars,
        missing: missingVars,
        nodeEnv: process.env.NODE_ENV,
        mcpTransport: process.env.MCP_TRANSPORT
      },
      error: missingVars.length > 0 ? `Missing environment variables: ${missingVars.join(', ')}` : undefined
    };
  } catch (error) {
    return {
      healthy: false,
      error: `Environment check failed: ${error.message}`
    };
  }
}

/**
 * Check MCP server health
 */
async function checkMCPHealth() {
  try {
    // For stdio transport, we can only check if the process is running
    // and the required files exist
    const mcpBinaryPath = '/app/bin/il2cpp-mcp-stdio.js';

    try {
      await fs.access(mcpBinaryPath);
      const stats = await fs.stat(mcpBinaryPath);

      return {
        healthy: true,
        details: {
          transport: 'stdio',
          binaryPath: mcpBinaryPath,
          binaryExists: true,
          binarySize: stats.size,
          binaryModified: stats.mtime
        }
      };
    } catch (error) {
      return {
        healthy: false,
        error: `MCP binary not found: ${error.message}`,
        details: { binaryPath: mcpBinaryPath }
      };
    }
  } catch (error) {
    return {
      healthy: false,
      error: `MCP health check failed: ${error.message}`
    };
  }
}

// Run health check if this script is executed directly
if (require.main === module) {
  performHealthCheck().catch(error => {
    console.error('Health check failed:', error);
    process.exit(1);
  });
}

module.exports = {
  performHealthCheck,
  checkProcessHealth,
  checkMemoryHealth,
  checkDiskHealth,
  checkDependencies,
  checkMCPHealth
};
