#!/usr/bin/env ts-node

/**
 * Comprehensive test runner for IL2CPP dump analyzer MCP system
 * Runs all test suites and generates detailed reports
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestSuite {
  name: string;
  command: string;
  description: string;
  timeout: number;
}

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Unit Tests',
    command: 'npm run test:unit',
    description: 'Core unit tests for MCP tools and components',
    timeout: 60000
  },
  {
    name: 'Integration Tests',
    command: 'npm run test:integration',
    description: 'End-to-end integration tests',
    timeout: 120000
  },
  {
    name: 'Performance Tests',
    command: 'npm run test:performance',
    description: 'Performance and load testing',
    timeout: 180000
  },
  {
    name: 'MCP Tools Tests',
    command: 'npm run test:mcp-tools',
    description: 'Specific tests for MCP tool implementations',
    timeout: 90000
  },
  {
    name: 'Coverage Report',
    command: 'npm run test:coverage',
    description: 'Generate comprehensive test coverage report',
    timeout: 120000
  }
];

async function runTestSuite(suite: TestSuite): Promise<TestResult> {
  console.log(`\n🧪 Running ${suite.name}...`);
  console.log(`📝 ${suite.description}`);

  const startTime = Date.now();

  try {
    const output = execSync(suite.command, {
      encoding: 'utf-8',
      timeout: suite.timeout,
      stdio: 'pipe'
    });

    const duration = Date.now() - startTime;
    console.log(`✅ ${suite.name} completed in ${duration}ms`);

    return {
      suite: suite.name,
      passed: true,
      duration,
      output
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`❌ ${suite.name} failed after ${duration}ms`);
    console.log(`Error: ${error.message}`);

    return {
      suite: suite.name,
      passed: false,
      duration,
      output: error.stdout || '',
      error: error.message
    };
  }
}

async function generateTestReport(results: TestResult[]): Promise<void> {
  const reportDir = path.join(process.cwd(), 'test-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `test-report-${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
    },
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Test report saved to: ${reportPath}`);

  // Generate markdown summary
  const markdownPath = path.join(reportDir, `test-summary-${timestamp}.md`);
  const markdown = generateMarkdownSummary(report);
  fs.writeFileSync(markdownPath, markdown);
  console.log(`📄 Markdown summary saved to: ${markdownPath}`);
}

function generateMarkdownSummary(report: any): string {
  const { summary, results } = report;
  const successRate = ((summary.passed / summary.total) * 100).toFixed(1);

  let markdown = `# IL2CPP Dump Analyzer MCP - Test Report\n\n`;
  markdown += `**Generated:** ${report.timestamp}\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `- **Total Test Suites:** ${summary.total}\n`;
  markdown += `- **Passed:** ${summary.passed} ✅\n`;
  markdown += `- **Failed:** ${summary.failed} ❌\n`;
  markdown += `- **Success Rate:** ${successRate}%\n`;
  markdown += `- **Total Duration:** ${(summary.totalDuration / 1000).toFixed(2)}s\n\n`;

  markdown += `## Test Suite Results\n\n`;

  results.forEach((result: TestResult) => {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    const duration = (result.duration / 1000).toFixed(2);

    markdown += `### ${result.suite} ${status}\n\n`;
    markdown += `- **Duration:** ${duration}s\n`;

    if (result.error) {
      markdown += `- **Error:** ${result.error}\n`;
    }

    markdown += `\n`;
  });

  if (summary.failed > 0) {
    markdown += `## Recommendations\n\n`;
    markdown += `Some test suites failed. Please review the following:\n\n`;

    results.filter((r: TestResult) => !r.passed).forEach((result: TestResult) => {
      markdown += `- **${result.suite}:** Check the error details and fix any issues\n`;
    });

    markdown += `\n`;
    markdown += `Run individual test suites for more detailed debugging:\n`;
    markdown += `\`\`\`bash\n`;
    markdown += `npm run test:unit\n`;
    markdown += `npm run test:integration\n`;
    markdown += `npm run test:performance\n`;
    markdown += `\`\`\`\n`;
  }

  return markdown;
}

async function main(): Promise<void> {
  console.log('🚀 Starting comprehensive test suite for IL2CPP Dump Analyzer MCP');
  console.log('=' .repeat(80));

  const results: TestResult[] = [];

  for (const suite of TEST_SUITES) {
    const result = await runTestSuite(suite);
    results.push(result);

    // Add a small delay between test suites
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 Test Summary:');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`📊 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  await generateTestReport(results);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Please review the test report for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed successfully!');
    process.exit(0);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test suite
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}
