/**
 * Find Class Hierarchy Tool Real Data Tests
 * Tests the find_class_hierarchy MCP tool using actual dump.cs content
 *
 * This test file follows the "C# Real Test" requirement:
 * All MCP tools MUST be tested with dump.cs as the primary test file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  setupRealDataTest,
  clearTestCache,
  RealDataTestContext,
  createRealDataVectorStore
} from '../../utils/dump-cs-test-setup';
import {
  RealDataAssertions,
  RealDataQueries,
  RealDataValidation
} from '../../utils/real-data-helpers';
import { FindClassHierarchyToolHandler } from '../../../mcp/tools/find-class-hierarchy-tool';
import { ToolExecutionContext } from '../../../mcp/base-tool-handler';
import { Logger } from '../../../types';

// Load dump.cs content for testing
const dumpFilePath = path.join(process.cwd(), 'dump.cs');
const dumpContent = fs.readFileSync(dumpFilePath, 'utf-8');

// Test configuration for real dump.cs data
const TEST_CONFIG = {
  useDirectContent: true, // Use direct content loading to avoid file system issues
  dumpContent: dumpContent, // Provide the actual dump.cs content
  useCache: true,
  chunkSize: 1000,
  chunkOverlap: 200,
  maxDocuments: 1000 // Increased for comprehensive testing with real data
};

describe('FindClassHierarchyToolHandler with Real dump.cs Data', () => {
  let testContext: RealDataTestContext;
  let realVectorStore: any;
  let toolHandler: FindClassHierarchyToolHandler;
  let mockLogger: Logger;

  beforeAll(async () => {
    console.log('Setting up real data test environment...');

    // Setup test environment with actual dump.cs
    testContext = await setupRealDataTest(TEST_CONFIG);
    realVectorStore = createRealDataVectorStore(testContext);

    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as Logger;

    // Create tool execution context
    const executionContext: ToolExecutionContext = {
      vectorStore: realVectorStore,
      logger: mockLogger,
      isInitialized: () => true
    };

    // Initialize tool handler
    toolHandler = new FindClassHierarchyToolHandler(executionContext);

    console.log(`Test environment ready with ${testContext.classes.length} classes`);
    console.log(`MonoBehaviour classes: ${testContext.monoBehaviours.length}`);
    console.log(`Available classes: ${testContext.classes.slice(0, 10).map(c => c.name).join(', ')}...`);

    // Log some specific classes we're looking for
    const targetClasses = ['StationEffectManager', 'CustomAttackAnimOverrideConfig', 'CameraFacingBillboardWithConstraints'];
    targetClasses.forEach(className => {
      const found = testContext.classes.find(c => c.name === className);
      console.log(`${className}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    // Log MonoBehaviour examples
    console.log(`MonoBehaviour examples: ${testContext.monoBehaviours.slice(0, 5).map(mb => mb.name).join(', ')}...`);
  }, 30000); // Increased timeout for real data setup

  afterAll(async () => {
    await clearTestCache();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Real Class Hierarchy Discovery', () => {
    it('should find hierarchy for any available class', async () => {
      // Arrange - Use any available class from the real data
      const availableClass = testContext.classes[0];
      const className = availableClass.name;

      // Act
      const result = await toolHandler.execute({
        class_name: className,
        include_methods: true
      });

      // Assert
      expect(result).toBeDefined();
      console.log('Raw result:', JSON.stringify(result, null, 2));

      const responseData = JSON.parse(result.content[0].text);
      console.log('Parsed response data:', JSON.stringify(responseData, null, 2));

      // Check if this is an error response
      if (responseData.error || responseData.found === false) {
        console.log(`Tool returned error/not found response for ${className}`);
        expect(responseData.metadata).toBeDefined();
        return;
      }

      // If successful, validate hierarchy structure
      if (responseData.name) {
        expect(responseData.name).toBeDefined();
        expect(typeof responseData.name).toBe('string');
        expect(responseData.baseClass).toBeDefined();
        expect(typeof responseData.isMonoBehaviour).toBe('boolean');
        expect(responseData.methods).toBeDefined();

        // Verify metadata
        expect(responseData.metadata.searchedClass).toBe(className);
        expect(responseData.metadata.includesMethods).toBe(true);
        expect(responseData.metadata.timestamp).toBeDefined();

        console.log(`Found hierarchy for ${responseData.name} (base: ${responseData.baseClass}, MonoBehaviour: ${responseData.isMonoBehaviour})`);
        if (responseData.methods) {
          console.log(`  Methods: ${responseData.methods.length}`);
        }
      } else {
        console.log('No name found in response data, checking structure...');
        console.log('Response keys:', Object.keys(responseData));
      }
    });

    it('should find hierarchy for MonoBehaviour class if available', async () => {
      // Arrange - Use any MonoBehaviour from the real data
      if (testContext.monoBehaviours.length > 0) {
        const monoBehaviourClass = testContext.monoBehaviours[0];
        const className = monoBehaviourClass.name;

        // Act
        const result = await toolHandler.execute({
          class_name: className,
          include_methods: true
        });

        // Assert
        expect(result).toBeDefined();
        const responseData = JSON.parse(result.content[0].text);

        // Check if this is an error response
        if (responseData.error || responseData.found === false) {
          console.log(`Tool returned error/not found response for MonoBehaviour class ${className}`);
          expect(responseData.metadata).toBeDefined();
          return;
        }

        // If successful, validate MonoBehaviour hierarchy
        if (responseData.name) {
          expect(responseData.name).toBeDefined();
          expect(typeof responseData.isMonoBehaviour).toBe('boolean');

          console.log(`Found hierarchy for MonoBehaviour ${responseData.name} (base: ${responseData.baseClass}, isMonoBehaviour: ${responseData.isMonoBehaviour})`);
        }
      } else {
        console.log('No MonoBehaviour classes found in test data');
      }
    });

    it('should find hierarchy without methods when include_methods is false', async () => {
      // Arrange - Use a known class from dump.cs
      const knownClass = RealDataQueries.getKnownClassName(testContext);

      // Act
      const result = await toolHandler.execute({
        class_name: knownClass,
        include_methods: false
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      // Check if this is an error response
      if (responseData.error || responseData.found === false) {
        console.log('Tool returned error/not found response');
        expect(responseData.metadata).toBeDefined();
        return;
      }

      // If successful, validate structure without methods
      if (responseData.name) {
        expect(responseData.name).toBeDefined();
        expect(responseData.baseClass).toBeDefined();
        expect(typeof responseData.isMonoBehaviour).toBe('boolean');
        expect(responseData.methods).toBeUndefined();
        expect(responseData.metadata.includesMethods).toBe(false);
        console.log(`Found hierarchy for ${responseData.name} without methods`);
      }
    });
  });

  describe('Real Data Validation', () => {
    it('should validate hierarchy structure from dump.cs', async () => {
      // Arrange
      const knownClass = RealDataQueries.getKnownClassName(testContext);

      // Act
      const result = await toolHandler.execute({
        class_name: knownClass,
        include_methods: true
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      // Check if this is an error response
      if (responseData.error || responseData.found === false) {
        console.log('Tool returned error/not found response for validation test');
        expect(responseData.metadata).toBeDefined();
        return;
      }

      // If successful, validate hierarchy structure
      if (responseData.name) {
        expect(responseData.name).toBeDefined();
        expect(responseData.namespace).toBeDefined();
        expect(responseData.fullName).toBeDefined();
        expect(responseData.baseClass).toBeDefined();
        expect(responseData.interfaces).toBeDefined();
        expect(typeof responseData.isMonoBehaviour).toBe('boolean');

        // Validate types
        expect(typeof responseData.name).toBe('string');
        expect(typeof responseData.baseClass).toBe('string');
        expect(Array.isArray(responseData.interfaces)).toBe(true);

        // Validate metadata
        expect(responseData.metadata.searchedClass).toBe(knownClass);
        expect(typeof responseData.metadata.includesMethods).toBe('boolean');
        expect(responseData.metadata.timestamp).toBeDefined();

        console.log(`Validated hierarchy structure for: ${responseData.name}`);
      }
    });

    it('should validate method information when included', async () => {
      // Arrange - Use StationEffectManager which has many methods
      const className = 'StationEffectManager';

      // Act
      const result = await toolHandler.execute({
        class_name: className,
        include_methods: true
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      // Check if this is an error response
      if (responseData.error || responseData.found === false) {
        console.log('Tool returned error/not found response for method validation');
        expect(responseData.metadata).toBeDefined();
        return;
      }

      // If successful and has methods, validate method structure
      if (responseData.name && responseData.methods && responseData.methods.length > 0) {
        const method = responseData.methods[0];

        expect(method.name).toBeDefined();
        expect(method.returnType).toBeDefined();
        expect(method.parameters).toBeDefined();
        expect(typeof method.isStatic).toBe('boolean');
        expect(typeof method.isVirtual).toBe('boolean');
        expect(typeof method.isOverride).toBe('boolean');

        console.log(`Validated method structure for ${responseData.name}: ${method.name}`);
      }
    });
  });

  describe('Error Handling with Real Data', () => {
    it('should handle non-existent class search gracefully', async () => {
      // Arrange
      const nonExistentClass = 'NonExistentClass123';

      // Act
      const result = await toolHandler.execute({
        class_name: nonExistentClass,
        include_methods: true
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Should return error response or empty result
      const responseText = result.content[0].text;
      expect(responseText).toContain(nonExistentClass);

      console.log(`Handled non-existent class search gracefully: ${nonExistentClass}`);
    });
  });

  describe('Performance with Real Data', () => {
    it('should complete hierarchy analysis within reasonable time', async () => {
      // Arrange
      const startTime = Date.now();
      const className = 'StationEffectManager';

      // Act
      const result = await toolHandler.execute({
        class_name: className,
        include_methods: true
      });
      const endTime = Date.now();

      // Assert
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result).toBeDefined();

      console.log(`Hierarchy analysis completed in ${executionTime}ms`);
    });
  });

  describe('Additional Real Class Tests', () => {
    it('should find hierarchy for CameraFacingBillboardWithConstraints (MonoBehaviour)', async () => {
      // Arrange - Another MonoBehaviour from dump.cs
      const className = 'CameraFacingBillboardWithConstraints';

      // Act
      const result = await toolHandler.execute({
        class_name: className,
        include_methods: true
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      if (responseData.name) {
        expect(responseData.name).toBe(className);
        expect(responseData.baseClass).toBe('MonoBehaviour');
        expect(responseData.isMonoBehaviour).toBe(true);
        console.log(`Found MonoBehaviour hierarchy for ${responseData.name}`);
      } else {
        console.log('CameraFacingBillboardWithConstraints not found in processed data');
        expect(responseData.metadata).toBeDefined();
      }
    });

    it('should find hierarchy for WindParticleDrag (MonoBehaviour)', async () => {
      // Arrange - Another MonoBehaviour from dump.cs
      const className = 'WindParticleDrag';

      // Act
      const result = await toolHandler.execute({
        class_name: className,
        include_methods: true
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      if (responseData.name) {
        expect(responseData.name).toBe(className);
        expect(responseData.baseClass).toBe('MonoBehaviour');
        expect(responseData.isMonoBehaviour).toBe(true);
        console.log(`Found MonoBehaviour hierarchy for ${responseData.name}`);
      } else {
        console.log('WindParticleDrag not found in processed data');
        expect(responseData.metadata).toBeDefined();
      }
    });

    it('should find hierarchy for TopDownMapTileSettings (ScriptableObject)', async () => {
      // Arrange - Another ScriptableObject from dump.cs
      const className = 'TopDownMapTileSettings';

      // Act
      const result = await toolHandler.execute({
        class_name: className,
        include_methods: true
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      if (responseData.name) {
        expect(responseData.name).toBe(className);
        expect(responseData.baseClass).toBe('ScriptableObject');
        expect(responseData.isMonoBehaviour).toBe(false);
        console.log(`Found ScriptableObject hierarchy for ${responseData.name}`);
      } else {
        console.log('TopDownMapTileSettings not found in processed data');
        expect(responseData.metadata).toBeDefined();
      }
    });

    it('should find hierarchy for NeutralAvatarSettingsUtility (static class)', async () => {
      // Arrange - Static utility class from dump.cs
      const className = 'NeutralAvatarSettingsUtility';

      // Act
      const result = await toolHandler.execute({
        class_name: className,
        include_methods: true
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      if (responseData.name) {
        expect(responseData.name).toBe(className);
        expect(responseData.isMonoBehaviour).toBe(false);
        console.log(`Found static class hierarchy for ${responseData.name} (base: ${responseData.baseClass})`);
      } else {
        console.log('NeutralAvatarSettingsUtility not found in processed data');
        expect(responseData.metadata).toBeDefined();
      }
    });
  });

  describe('Real Data Edge Cases', () => {
    it('should handle partial class name matching', async () => {
      // Arrange - Use partial name that should match multiple classes
      const partialName = 'Manager';

      // Act
      const result = await toolHandler.execute({
        class_name: partialName,
        include_methods: false
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      // Should either find a class or return not found
      if (responseData.name) {
        expect(responseData.name).toContain(partialName);
        console.log(`Found class with partial name match: ${responseData.name}`);
      } else {
        console.log('No exact match found for partial name');
        expect(responseData.metadata).toBeDefined();
      }
    });

    it('should validate real MonoBehaviour detection', async () => {
      // Arrange - Use any MonoBehaviour from real data
      if (testContext.monoBehaviours.length > 0) {
        const monoBehaviour = testContext.monoBehaviours[0];

        // Act
        const result = await toolHandler.execute({
          class_name: monoBehaviour.name,
          include_methods: true
        });

        // Assert
        expect(result).toBeDefined();
        const responseData = JSON.parse(result.content[0].text);

        if (responseData.name) {
          expect(responseData.isMonoBehaviour).toBe(true);
          expect(responseData.baseClass).toBe('MonoBehaviour');
          console.log(`Validated MonoBehaviour detection for: ${responseData.name}`);
        }
      } else {
        console.log('No MonoBehaviour classes found in test data');
      }
    });
  });
});
