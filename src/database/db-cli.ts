#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { SupabaseConnectionManager } from './connection-manager';
import { EnhancedSupabaseVectorStore } from './enhanced-vector-store';
import { XenovaEmbeddings } from '../embeddings/xenova-embeddings';

// Load environment variables
dotenv.config();

/**
 * Database CLI tool for managing the IL2CPP dump analyzer database
 */
async function main() {
  await yargs(hideBin(process.argv))
    .scriptName('db-cli')
    .usage('$0 <command> [options]')
    .command(
      'health',
      'Check database health and connection status',
      {},
      async () => {
        try {
          console.log('🔍 Checking database health...\n');
          
          const connectionManager = SupabaseConnectionManager.getInstance(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_KEY!
          );

          const embeddings = new XenovaEmbeddings();
          const vectorStore = new EnhancedSupabaseVectorStore(embeddings);
          
          const health = await vectorStore.getHealthStatus();
          
          console.log('📊 Health Status:');
          console.log(`  Overall Health: ${health.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
          console.log(`  Last Health Check: ${health.connectionStats.lastHealthCheck || 'Never'}`);
          
          console.log('\n🔗 Connection Statistics:');
          console.log(`  Total Connections: ${health.connectionStats.stats.totalConnections}`);
          console.log(`  Active Connections: ${health.connectionStats.stats.activeConnections}`);
          console.log(`  Total Acquired: ${health.connectionStats.stats.totalAcquired}`);
          console.log(`  Total Released: ${health.connectionStats.stats.totalReleased}`);
          
          console.log('\n⚡ Performance Statistics:');
          console.log(`  Total Operations: ${health.performanceStats.totalOperations}`);
          console.log(`  Success Rate: ${((1 - health.performanceStats.errorRate) * 100).toFixed(2)}%`);
          console.log(`  Average Duration: ${health.performanceStats.averageDuration.toFixed(2)}ms`);
          console.log(`  P95 Duration: ${health.performanceStats.p95Duration.toFixed(2)}ms`);
          
          console.log('\n💾 Cache Statistics:');
          console.log(`  Cache Size: ${health.cacheStats.size}/${health.cacheStats.maxSize}`);
          console.log(`  Hit Rate: ${(health.cacheStats.hitRate * 100).toFixed(2)}%`);
          
          console.log('\n🔄 Circuit Breaker:');
          console.log(`  State: ${health.circuitBreakerStats.state}`);
          console.log(`  Failures: ${health.circuitBreakerStats.failures}`);
          
          await vectorStore.cleanup();
        } catch (error) {
          console.error('❌ Health check failed:', error);
          process.exit(1);
        }
      }
    )
    .command(
      'stats',
      'Show database statistics and table information',
      {},
      async () => {
        try {
          console.log('📈 Fetching database statistics...\n');
          
          const connectionManager = SupabaseConnectionManager.getInstance(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_KEY!
          );
          
          const client = connectionManager.getClient();
          
          // Get database statistics
          const { data: stats, error } = await client.rpc('get_database_stats');
          
          if (error) {
            throw error;
          }
          
          console.log('📊 Table Statistics:');
          console.log('┌─────────────────────────┬─────────────┬─────────────┬─────────────┬─────────────┐');
          console.log('│ Table Name              │ Row Count   │ Table Size  │ Index Size  │ Total Size  │');
          console.log('├─────────────────────────┼─────────────┼─────────────┼─────────────┼─────────────┤');
          
          for (const row of stats || []) {
            console.log(`│ ${row.table_name.padEnd(23)} │ ${String(row.row_count).padEnd(11)} │ ${row.table_size.padEnd(11)} │ ${row.index_size.padEnd(11)} │ ${row.total_size.padEnd(11)} │`);
          }
          
          console.log('└─────────────────────────┴─────────────┴─────────────┴─────────────┴─────────────┘');
          
          connectionManager.releaseClient();
        } catch (error) {
          console.error('❌ Failed to fetch statistics:', error);
          process.exit(1);
        }
      }
    )
    .command(
      'cleanup',
      'Clean up old performance logs and optimize database',
      {
        days: {
          alias: 'd',
          type: 'number',
          default: 30,
          description: 'Number of days of logs to keep'
        }
      },
      async (args) => {
        try {
          console.log(`🧹 Cleaning up performance logs older than ${args.days} days...\n`);
          
          const connectionManager = SupabaseConnectionManager.getInstance(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_KEY!
          );
          
          const client = connectionManager.getClient();
          
          // Clean up old performance logs
          const { data: deletedCount, error } = await client.rpc('cleanup_old_performance_logs', {
            days_to_keep: args.days
          });
          
          if (error) {
            throw error;
          }
          
          console.log(`✅ Cleaned up ${deletedCount} old performance log entries`);
          
          // Clear vector store cache
          const embeddings = new XenovaEmbeddings();
          const vectorStore = new EnhancedSupabaseVectorStore(embeddings);
          vectorStore.clearCache();
          
          console.log('✅ Cleared vector store cache');
          
          connectionManager.releaseClient();
          await vectorStore.cleanup();
        } catch (error) {
          console.error('❌ Cleanup failed:', error);
          process.exit(1);
        }
      }
    )
    .command(
      'test-connection',
      'Test database connection and basic operations',
      {},
      async () => {
        try {
          console.log('🔌 Testing database connection...\n');
          
          const connectionManager = SupabaseConnectionManager.getInstance(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_KEY!
          );
          
          const client = connectionManager.getClient();
          
          // Test basic query
          console.log('1. Testing basic table access...');
          const { data: testData, error: testError } = await client
            .from('il2cpp_documents')
            .select('id')
            .limit(1);
          
          if (testError) {
            throw new Error(`Table access failed: ${testError.message}`);
          }
          console.log('   ✅ Table access successful');
          
          // Test vector search function
          console.log('2. Testing vector search function...');
          const testEmbedding = Array(384).fill(0.1);
          const { data: searchData, error: searchError } = await client.rpc('match_documents', {
            query_embedding: testEmbedding,
            match_threshold: 0.0,
            match_count: 1
          });
          
          if (searchError) {
            throw new Error(`Vector search failed: ${searchError.message}`);
          }
          console.log('   ✅ Vector search function working');
          
          // Test performance logging
          console.log('3. Testing performance logging...');
          const { error: logError } = await client.rpc('log_query_performance', {
            operation_name: 'test_connection',
            duration_ms: 100,
            success: true
          });
          
          if (logError) {
            throw new Error(`Performance logging failed: ${logError.message}`);
          }
          console.log('   ✅ Performance logging working');
          
          console.log('\n🎉 All database tests passed successfully!');
          
          connectionManager.releaseClient();
        } catch (error) {
          console.error('❌ Connection test failed:', error);
          process.exit(1);
        }
      }
    )
    .command(
      'export-metrics',
      'Export performance metrics to a file',
      {
        output: {
          alias: 'o',
          type: 'string',
          default: 'db-metrics.json',
          description: 'Output file path'
        }
      },
      async (args) => {
        try {
          console.log('📤 Exporting performance metrics...\n');
          
          const embeddings = new XenovaEmbeddings();
          const vectorStore = new EnhancedSupabaseVectorStore(embeddings);
          
          const metrics = vectorStore.exportMetrics();
          
          const fs = await import('fs');
          fs.writeFileSync(args.output, metrics);
          
          console.log(`✅ Metrics exported to ${args.output}`);
          
          await vectorStore.cleanup();
        } catch (error) {
          console.error('❌ Export failed:', error);
          process.exit(1);
        }
      }
    )
    .demandCommand(1, 'You need to specify a command')
    .help()
    .alias('help', 'h')
    .version('1.0.0')
    .parse();
}

// Run the CLI
if (require.main === module) {
  main().catch(error => {
    console.error('❌ CLI error:', error);
    process.exit(1);
  });
}
