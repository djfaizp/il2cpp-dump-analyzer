#!/usr/bin/env node

/**
 * Docker monitoring and management script for IL2CPP dump analyzer MCP system
 * Provides container monitoring, health checks, and lifecycle management
 */

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Monitoring configuration
const MONITOR_CONFIG = {
  containers: [
    'il2cpp-mcp-server',
    'il2cpp-supabase-db',
    'il2cpp-supabase-kong',
    'il2cpp-supabase-auth',
    'il2cpp-supabase-rest'
  ],
  healthCheckInterval: 30000, // 30 seconds
  logRetentionDays: 7,
  alertThresholds: {
    memoryUsagePercent: 85,
    cpuUsagePercent: 80,
    diskUsagePercent: 90,
    restartCount: 5
  }
};

/**
 * Main monitoring function
 */
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'status':
      await showContainerStatus();
      break;
    case 'health':
      await performHealthChecks();
      break;
    case 'logs':
      await showLogs(process.argv[3]);
      break;
    case 'metrics':
      await showMetrics();
      break;
    case 'restart':
      await restartContainer(process.argv[3]);
      break;
    case 'cleanup':
      await cleanupResources();
      break;
    case 'watch':
      await startMonitoring();
      break;
    case 'export':
      await exportMetrics(process.argv[3]);
      break;
    default:
      showUsage();
  }
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
Docker Monitor for IL2CPP Dump Analyzer MCP System

Usage: node docker/monitor.js <command> [options]

Commands:
  status              Show status of all containers
  health              Perform health checks on all containers
  logs [container]    Show logs for specific container or all containers
  metrics             Show resource metrics for all containers
  restart [container] Restart specific container or all containers
  cleanup             Clean up unused resources and old logs
  watch               Start continuous monitoring
  export [format]     Export metrics (json, prometheus, csv)

Examples:
  node docker/monitor.js status
  node docker/monitor.js logs il2cpp-mcp-server
  node docker/monitor.js restart il2cpp-mcp-server
  node docker/monitor.js export prometheus
`);
}

/**
 * Show container status
 */
async function showContainerStatus() {
  console.log('🐳 Container Status Report');
  console.log('=' .repeat(50));

  for (const container of MONITOR_CONFIG.containers) {
    try {
      const status = await getContainerStatus(container);
      const healthIcon = status.health === 'healthy' ? '✅' : 
                        status.health === 'unhealthy' ? '❌' : '⚠️';
      
      console.log(`${healthIcon} ${container}`);
      console.log(`   Status: ${status.state} (${status.uptime})`);
      console.log(`   Health: ${status.health || 'unknown'}`);
      console.log(`   CPU: ${status.cpu}% | Memory: ${status.memory}`);
      console.log(`   Restarts: ${status.restarts}`);
      console.log('');
    } catch (error) {
      console.log(`❌ ${container}: ${error.message}`);
    }
  }
}

/**
 * Get container status information
 */
async function getContainerStatus(containerName) {
  return new Promise((resolve, reject) => {
    const cmd = `docker inspect ${containerName} --format '{{json .}}'`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Container not found or not running`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const state = data.State;
        const config = data.Config;
        
        // Calculate uptime
        const startTime = new Date(state.StartedAt);
        const uptime = formatUptime(Date.now() - startTime.getTime());
        
        // Get resource usage
        getContainerStats(containerName).then(stats => {
          resolve({
            state: state.Status,
            health: state.Health?.Status,
            uptime,
            cpu: stats.cpu,
            memory: stats.memory,
            restarts: data.RestartCount || 0,
            image: config.Image
          });
        }).catch(() => {
          resolve({
            state: state.Status,
            health: state.Health?.Status,
            uptime,
            cpu: 'N/A',
            memory: 'N/A',
            restarts: data.RestartCount || 0,
            image: config.Image
          });
        });
      } catch (parseError) {
        reject(new Error(`Failed to parse container data`));
      }
    });
  });
}

/**
 * Get container resource statistics
 */
async function getContainerStats(containerName) {
  return new Promise((resolve, reject) => {
    const cmd = `docker stats ${containerName} --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      const lines = stdout.trim().split('\n');
      if (lines.length < 2) {
        reject(new Error('No stats data'));
        return;
      }

      const statsLine = lines[1];
      const [cpu, memory] = statsLine.split('\t');
      
      resolve({
        cpu: cpu.replace('%', ''),
        memory: memory
      });
    });
  });
}

/**
 * Perform health checks on all containers
 */
async function performHealthChecks() {
  console.log('🏥 Health Check Report');
  console.log('=' .repeat(50));

  const results = [];
  
  for (const container of MONITOR_CONFIG.containers) {
    try {
      const health = await performContainerHealthCheck(container);
      results.push({ container, ...health });
      
      const icon = health.healthy ? '✅' : '❌';
      console.log(`${icon} ${container}: ${health.message}`);
      
      if (health.details) {
        Object.entries(health.details).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }
      console.log('');
    } catch (error) {
      console.log(`❌ ${container}: Health check failed - ${error.message}`);
      results.push({ container, healthy: false, message: error.message });
    }
  }

  // Summary
  const healthyCount = results.filter(r => r.healthy).length;
  console.log(`Summary: ${healthyCount}/${results.length} containers healthy`);
  
  if (healthyCount < results.length) {
    process.exit(1);
  }
}

/**
 * Perform health check on specific container
 */
async function performContainerHealthCheck(containerName) {
  return new Promise((resolve, reject) => {
    // For IL2CPP MCP server, use the custom health check
    if (containerName === 'il2cpp-mcp-server') {
      const cmd = `docker exec ${containerName} node /app/docker/health-check.js`;
      
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          resolve({
            healthy: false,
            message: 'Health check script failed',
            details: { error: stderr || error.message }
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve({
            healthy: result.status === 'healthy',
            message: result.status,
            details: {
              responseTime: `${result.metrics.responseTime}ms`,
              uptime: `${Math.round(result.metrics.uptime)}s`,
              memory: `${Math.round(result.metrics.memoryUsage.rss / 1024 / 1024)}MB`
            }
          });
        } catch (parseError) {
          resolve({
            healthy: true,
            message: 'Health check passed',
            details: { output: stdout.trim() }
          });
        }
      });
    } else {
      // For other containers, check if they're running
      exec(`docker inspect ${containerName} --format '{{.State.Status}}'`, (error, stdout) => {
        if (error) {
          reject(new Error('Container not found'));
          return;
        }

        const status = stdout.trim();
        resolve({
          healthy: status === 'running',
          message: `Container ${status}`,
          details: { status }
        });
      });
    }
  });
}

/**
 * Show container logs
 */
async function showLogs(containerName) {
  if (containerName) {
    console.log(`📋 Logs for ${containerName}`);
    console.log('=' .repeat(50));
    
    const logs = spawn('docker', ['logs', '--tail', '100', '-f', containerName], {
      stdio: 'inherit'
    });

    process.on('SIGINT', () => {
      logs.kill();
      process.exit(0);
    });
  } else {
    console.log('📋 Logs for all containers');
    console.log('=' .repeat(50));
    
    for (const container of MONITOR_CONFIG.containers) {
      console.log(`\n--- ${container} ---`);
      await new Promise((resolve) => {
        exec(`docker logs --tail 20 ${container}`, (error, stdout, stderr) => {
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
          resolve();
        });
      });
    }
  }
}

/**
 * Show resource metrics
 */
async function showMetrics() {
  console.log('📊 Resource Metrics');
  console.log('=' .repeat(50));

  const cmd = `docker stats ${MONITOR_CONFIG.containers.join(' ')} --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"`;
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('Failed to get metrics:', error.message);
      return;
    }

    console.log(stdout);
    
    // Check for alerts
    const lines = stdout.trim().split('\n').slice(1); // Skip header
    lines.forEach(line => {
      const [container, cpu, memUsage, memPerc] = line.split('\t');
      const cpuNum = parseFloat(cpu.replace('%', ''));
      const memNum = parseFloat(memPerc.replace('%', ''));
      
      if (cpuNum > MONITOR_CONFIG.alertThresholds.cpuUsagePercent) {
        console.log(`⚠️  HIGH CPU: ${container} using ${cpu} CPU`);
      }
      
      if (memNum > MONITOR_CONFIG.alertThresholds.memoryUsagePercent) {
        console.log(`⚠️  HIGH MEMORY: ${container} using ${memPerc} memory`);
      }
    });
  });
}

/**
 * Restart container
 */
async function restartContainer(containerName) {
  if (containerName) {
    console.log(`🔄 Restarting ${containerName}...`);
    
    exec(`docker restart ${containerName}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Failed to restart ${containerName}:`, error.message);
        return;
      }
      console.log(`✅ ${containerName} restarted successfully`);
    });
  } else {
    console.log('🔄 Restarting all containers...');
    
    for (const container of MONITOR_CONFIG.containers) {
      await new Promise((resolve) => {
        exec(`docker restart ${container}`, (error) => {
          if (error) {
            console.error(`Failed to restart ${container}:`, error.message);
          } else {
            console.log(`✅ ${container} restarted`);
          }
          resolve();
        });
      });
    }
  }
}

/**
 * Clean up resources
 */
async function cleanupResources() {
  console.log('🧹 Cleaning up resources...');
  
  // Remove unused containers
  exec('docker container prune -f', (error, stdout) => {
    if (stdout.trim()) {
      console.log('Removed unused containers:', stdout.trim());
    }
  });
  
  // Remove unused images
  exec('docker image prune -f', (error, stdout) => {
    if (stdout.trim()) {
      console.log('Removed unused images:', stdout.trim());
    }
  });
  
  // Remove unused volumes
  exec('docker volume prune -f', (error, stdout) => {
    if (stdout.trim()) {
      console.log('Removed unused volumes:', stdout.trim());
    }
  });
  
  console.log('✅ Cleanup completed');
}

/**
 * Start continuous monitoring
 */
async function startMonitoring() {
  console.log('👁️  Starting continuous monitoring...');
  console.log('Press Ctrl+C to stop');
  
  const monitor = setInterval(async () => {
    console.clear();
    console.log(`🕐 ${new Date().toLocaleString()}`);
    await showContainerStatus();
    await showMetrics();
  }, MONITOR_CONFIG.healthCheckInterval);

  process.on('SIGINT', () => {
    clearInterval(monitor);
    console.log('\n👋 Monitoring stopped');
    process.exit(0);
  });
}

/**
 * Export metrics
 */
async function exportMetrics(format = 'json') {
  console.log(`📤 Exporting metrics in ${format} format...`);
  
  // Get metrics from IL2CPP MCP server
  try {
    exec('docker exec il2cpp-mcp-server curl -s http://localhost:9090/metrics', (error, stdout) => {
      if (error) {
        console.error('Failed to export metrics:', error.message);
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `metrics-${timestamp}.${format}`;
      
      if (format === 'prometheus') {
        require('fs').writeFileSync(filename, stdout);
      } else if (format === 'json') {
        // Convert Prometheus to JSON (simplified)
        const metrics = {};
        stdout.split('\n').forEach(line => {
          if (line && !line.startsWith('#')) {
            const [name, value] = line.split(' ');
            metrics[name] = parseFloat(value) || value;
          }
        });
        require('fs').writeFileSync(filename, JSON.stringify(metrics, null, 2));
      }
      
      console.log(`✅ Metrics exported to ${filename}`);
    });
  } catch (error) {
    console.error('Export failed:', error.message);
  }
}

/**
 * Format uptime duration
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Monitor error:', error);
    process.exit(1);
  });
}

module.exports = {
  getContainerStatus,
  performContainerHealthCheck,
  showContainerStatus,
  performHealthChecks
};
