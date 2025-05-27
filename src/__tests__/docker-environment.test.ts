/**
 * Docker Environment Configuration Tests
 * Tests for Docker Compose and environment setup
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

describe('Docker Environment Configuration', () => {
  // Use process.cwd() to get the current working directory (project root)
  const projectRoot = process.cwd();

  describe('Docker Compose Files', () => {
    test('docker-compose.yml exists and is valid YAML', () => {
      const composePath = path.join(projectRoot, 'docker-compose.yml');
      expect(existsSync(composePath)).toBe(true);

      const composeContent = readFileSync(composePath, 'utf8');
      expect(() => yaml.load(composeContent)).not.toThrow();

      const compose = yaml.load(composeContent) as any;
      expect(compose.version).toBeDefined();
      expect(compose.services).toBeDefined();
      expect(compose.networks).toBeDefined();
      expect(compose.volumes).toBeDefined();
    });

    test('docker-compose.dev.yml exists and is valid YAML', () => {
      const composeDevPath = path.join(projectRoot, 'docker-compose.dev.yml');
      expect(existsSync(composeDevPath)).toBe(true);

      const composeDevContent = readFileSync(composeDevPath, 'utf8');
      expect(() => yaml.load(composeDevContent)).not.toThrow();

      const composeDev = yaml.load(composeDevContent) as any;
      expect(composeDev.version).toBeDefined();
      expect(composeDev.services).toBeDefined();
      expect(composeDev.networks).toBeDefined();
    });

    test('docker-compose.yml includes required services', () => {
      const composePath = path.join(projectRoot, 'docker-compose.yml');
      const composeContent = readFileSync(composePath, 'utf8');
      const compose = yaml.load(composeContent) as any;

      // Check for required services
      expect(compose.services['supabase-db']).toBeDefined();
      expect(compose.services['supabase-kong']).toBeDefined();
      expect(compose.services['supabase-auth']).toBeDefined();
      expect(compose.services['supabase-rest']).toBeDefined();
      expect(compose.services['il2cpp-mcp']).toBeDefined();
    });

    test('docker-compose.dev.yml includes development services', () => {
      const composeDevPath = path.join(projectRoot, 'docker-compose.dev.yml');
      const composeDevContent = readFileSync(composeDevPath, 'utf8');
      const composeDev = yaml.load(composeDevContent) as any;

      // Check for development-specific services
      expect(composeDev.services['supabase-db']).toBeDefined();
      expect(composeDev.services['supabase-studio']).toBeDefined();
      expect(composeDev.services['supabase-meta']).toBeDefined();
      expect(composeDev.services['il2cpp-mcp-dev']).toBeDefined();
      expect(composeDev.services['il2cpp-tools']).toBeDefined();
    });
  });

  describe('Environment Configuration', () => {
    test('.env.docker.example exists and contains required variables', () => {
      const envExamplePath = path.join(projectRoot, '.env.docker.example');
      expect(existsSync(envExamplePath)).toBe(true);

      const envContent = readFileSync(envExamplePath, 'utf8');

      // Check for required environment variables
      expect(envContent).toContain('NODE_ENV=');
      expect(envContent).toContain('POSTGRES_DB=');
      expect(envContent).toContain('POSTGRES_USER=');
      expect(envContent).toContain('POSTGRES_PASSWORD=');
      expect(envContent).toContain('SUPABASE_URL=');
      expect(envContent).toContain('SUPABASE_ANON_KEY=');
      expect(envContent).toContain('SUPABASE_SERVICE_ROLE_KEY=');
      expect(envContent).toContain('IL2CPP_DUMP_PATH=');
      expect(envContent).toContain('MODEL_CACHE_PATH=');
      expect(envContent).toContain('EMBEDDINGS_MODEL=');
      expect(envContent).toContain('MCP_TRANSPORT=');
      expect(envContent).toContain('MCP_SERVER_NAME=');
    });

    test('Environment file includes security warnings', () => {
      const envExamplePath = path.join(projectRoot, '.env.docker.example');
      const envContent = readFileSync(envExamplePath, 'utf8');

      // Check for security-related comments
      expect(envContent).toContain('Update all passwords and secrets before deploying to production');
      expect(envContent).toContain('use strong passwords');
    });

    test('Environment file includes development and production sections', () => {
      const envExamplePath = path.join(projectRoot, '.env.docker.example');
      const envContent = readFileSync(envExamplePath, 'utf8');

      // Check for section headers
      expect(envContent).toContain('DEVELOPMENT CONFIGURATION');
      expect(envContent).toContain('SECURITY CONFIGURATION');
      expect(envContent).toContain('PERFORMANCE CONFIGURATION');
    });
  });

  describe('Docker Support Files', () => {
    test('Kong configuration file exists', () => {
      const kongConfigPath = path.join(projectRoot, 'docker/kong.yml');
      expect(existsSync(kongConfigPath)).toBe(true);

      const kongContent = readFileSync(kongConfigPath, 'utf8');
      expect(() => yaml.load(kongContent)).not.toThrow();

      const kong = yaml.load(kongContent) as any;
      expect(kong._format_version).toBeDefined();
      expect(kong.services).toBeDefined();
      expect(kong.consumers).toBeDefined();
    });

    test('Database initialization script exists', () => {
      const initDbPath = path.join(projectRoot, 'docker/init-db/01-init-extensions.sql');
      expect(existsSync(initDbPath)).toBe(true);

      const initDbContent = readFileSync(initDbPath, 'utf8');
      expect(initDbContent).toContain('CREATE EXTENSION IF NOT EXISTS "vector"');
      expect(initDbContent).toContain('CREATE TABLE IF NOT EXISTS il2cpp_documents');
      expect(initDbContent).toContain('match_il2cpp_documents');
    });
  });

  describe('Package.json Docker Scripts', () => {
    test('Package.json includes Docker Compose scripts', () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJsonContent = readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent);

      // Check for Docker Compose scripts
      expect(packageJson.scripts).toHaveProperty('docker:compose:up');
      expect(packageJson.scripts).toHaveProperty('docker:compose:down');
      expect(packageJson.scripts).toHaveProperty('docker:compose:logs');
      expect(packageJson.scripts).toHaveProperty('docker:compose:dev:up');
      expect(packageJson.scripts).toHaveProperty('docker:compose:dev:down');
      expect(packageJson.scripts).toHaveProperty('docker:compose:dev:logs');
      expect(packageJson.scripts).toHaveProperty('docker:setup');
      expect(packageJson.scripts).toHaveProperty('docker:setup:dirs');
      expect(packageJson.scripts).toHaveProperty('docker:setup:env');
    });

    test('Docker setup scripts are properly configured', () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJsonContent = readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent);

      // Check script content
      expect(packageJson.scripts['docker:setup:dirs']).toContain('mkdir -p');
      expect(packageJson.scripts['docker:setup:dirs']).toContain('data/dumps');
      expect(packageJson.scripts['docker:setup:dirs']).toContain('cache/models');
      expect(packageJson.scripts['docker:setup:env']).toContain('.env.docker.example');
    });
  });

  describe('Volume Configuration', () => {
    test('Production compose defines required volumes', () => {
      const composePath = path.join(projectRoot, 'docker-compose.yml');
      const composeContent = readFileSync(composePath, 'utf8');
      const compose = yaml.load(composeContent) as any;

      // Check for required volumes
      expect(compose.volumes['supabase-db-data']).toBeDefined();
      expect(compose.volumes['il2cpp-dumps']).toBeDefined();
      expect(compose.volumes['xenova-models']).toBeDefined();
      expect(compose.volumes['il2cpp-cache']).toBeDefined();
      expect(compose.volumes['il2cpp-logs']).toBeDefined();
    });

    test('IL2CPP service has proper volume mounts', () => {
      const composePath = path.join(projectRoot, 'docker-compose.yml');
      const composeContent = readFileSync(composePath, 'utf8');
      const compose = yaml.load(composeContent) as any;

      const il2cppService = compose.services['il2cpp-mcp'];
      expect(il2cppService.volumes).toBeDefined();
      expect(il2cppService.volumes).toContain('il2cpp-dumps:/app/data');
      expect(il2cppService.volumes).toContain('xenova-models:/app/models');
      expect(il2cppService.volumes).toContain('il2cpp-cache:/app/cache');
      expect(il2cppService.volumes).toContain('il2cpp-logs:/app/logs');
    });
  });

  describe('Network Configuration', () => {
    test('Services are connected to proper networks', () => {
      const composePath = path.join(projectRoot, 'docker-compose.yml');
      const composeContent = readFileSync(composePath, 'utf8');
      const compose = yaml.load(composeContent) as any;

      // Check that all services are on the same network
      Object.values(compose.services).forEach((service: any) => {
        expect(service.networks).toContain('il2cpp-network');
      });
    });

    test('Development services use separate network', () => {
      const composeDevPath = path.join(projectRoot, 'docker-compose.dev.yml');
      const composeDevContent = readFileSync(composeDevPath, 'utf8');
      const composeDev = yaml.load(composeDevContent) as any;

      // Check development network
      expect(composeDev.networks['il2cpp-dev-network']).toBeDefined();

      Object.values(composeDev.services).forEach((service: any) => {
        expect(service.networks).toContain('il2cpp-dev-network');
      });
    });
  });
});
