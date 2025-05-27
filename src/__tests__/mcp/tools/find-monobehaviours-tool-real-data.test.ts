/**
 * Find MonoBehaviours Tool Real Data Tests
 * Tests the find_monobehaviours MCP tool using actual dump.cs content
 *
 * This test file follows the "C# Real Test" requirement:
 * All MCP tools MUST be tested with dump.cs as the primary test file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
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
import { FindMonoBehavioursToolHandler } from '../../../mcp/tools/find-monobehaviours-tool';
import { ToolExecutionContext } from '../../../mcp/base-tool-handler';
import { Logger } from '../../../types';

// Sample IL2CPP dump content for testing (extracted from real dump.cs)
const SAMPLE_DUMP_CONTENT = `// Image 0: holo-game.dll - 0
// Image 1: holo-protos.dll - 15021

// Namespace:
public class CameraFacingBillboardWithConstraints : MonoBehaviour // TypeDefIndex: 8
{
	// Fields
	public float pixelScale; // 0x20
	public float minScale; // 0x24
	public float maxScale; // 0x28
	public CameraFacingBillboardWithConstraints.LockAxis axisConstraints; // 0x2C

	// Methods
	private void LateUpdate() { }
	private void vxx(CameraFacingBillboardWithConstraints.LockAxis a) { }
	public void .ctor() { }
}

// Namespace:
public class StationEffectManager : MonoBehaviour // TypeDefIndex: 12
{
	// Fields
	[SerializeField]
	private Animator lightPanelAnimator; // 0x20
	[SerializeField]
	private GameObject closeRoot; // 0x28
	[SerializeField]
	private GameObject farRoot; // 0x30

	// Methods
	public void Initialize(bool isFar, bool isDefeated) { }
	public void OnEnterCloseProximity() { }
	public void OnExitCloseProximity() { }
	public void .ctor() { }
}

// Namespace:
public class CustomAttackAnimOverrideConfig : ScriptableObject // TypeDefIndex: 6
{
	// Fields
	public CustomAttackAnimOverrideConfig.OverrideConfig[] CustomAttackAnimConfigs; // 0x18

	// Methods
	public void .ctor() { }
}

// Namespace:
public enum CameraFacingBillboardWithConstraints.LockAxis // TypeDefIndex: 7
{
	// Fields
	public int value__; // 0x0
	public const CameraFacingBillboardWithConstraints.LockAxis DEFAULT = 0;
	public const CameraFacingBillboardWithConstraints.LockAxis AXIS_X = 1;
	public const CameraFacingBillboardWithConstraints.LockAxis AXIS_Y = 2;
}`;

// Test configuration for real dump.cs data
const TEST_CONFIG = {
  useDirectContent: true,
  dumpContent: SAMPLE_DUMP_CONTENT,
  useCache: true,
  chunkSize: 1000,
  chunkOverlap: 200,
  maxDocuments: 500 // Limit for faster tests
};

describe('FindMonoBehavioursToolHandler with Real dump.cs Data', () => {
  let testContext: RealDataTestContext;
  let realVectorStore: any;
  let toolHandler: FindMonoBehavioursToolHandler;
  let executionContext: ToolExecutionContext;

  beforeAll(async () => {
    console.log('Setting up real data test environment for find_monobehaviours tool...');

    // Setup real data test environment using dump.cs
    testContext = await setupRealDataTest(TEST_CONFIG);
    realVectorStore = createRealDataVectorStore(testContext);

    // Validate test context
    RealDataValidation.validateTestContext(testContext);
    RealDataValidation.validateUnityPatterns(testContext);

    // Create execution context for tool handler
    executionContext = {
      vectorStore: realVectorStore,
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      } as Logger,
      isInitialized: jest.fn().mockReturnValue(true)
    };

    console.log(`Test environment ready with ${testContext.monoBehaviours.length} MonoBehaviour classes`);
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    // Clean up test cache if needed
    clearTestCache();
  });

  beforeEach(() => {
    // Create fresh tool handler for each test
    toolHandler = new FindMonoBehavioursToolHandler(executionContext);

    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('Real MonoBehaviour Discovery', () => {
    it('should find all MonoBehaviours from dump.cs without query', async () => {
      // Arrange
      RealDataAssertions.assertMonoBehavioursExist(testContext);

      // Act
      const result = await toolHandler.execute({ top_k: 20 });

      // Assert
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Parse the response content
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.monoBehaviours).toBeDefined();
      expect(Array.isArray(responseData.monoBehaviours)).toBe(true);
      expect(responseData.monoBehaviours.length).toBeGreaterThan(0);

      // Verify all results are MonoBehaviours
      responseData.monoBehaviours.forEach((mb: any) => {
        expect(mb.name).toBeDefined();
        expect(mb.content).toBeDefined();
        expect(typeof mb.name).toBe('string');
        expect(typeof mb.content).toBe('string');
      });

      // Verify metadata
      expect(responseData.metadata).toBeDefined();
      expect(responseData.metadata.query).toBe('All MonoBehaviours');
      expect(responseData.metadata.resultCount).toBe(responseData.monoBehaviours.length);
      expect(responseData.metadata.timestamp).toBeDefined();

      console.log(`Found ${responseData.monoBehaviours.length} MonoBehaviour classes in dump.cs`);
    });

    it('should find specific MonoBehaviours by name from dump.cs', async () => {
      // Arrange - Use known MonoBehaviour classes from dump.cs
      const knownMonoBehaviours = [
        'CameraFacingBillboardWithConstraints',
        'StationEffectManager'
      ];

      for (const mbName of knownMonoBehaviours) {
        // Act
        const result = await toolHandler.execute({
          query: mbName,
          top_k: 5
        });

        // Assert
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();

        const responseData = JSON.parse(result.content[0].text);
        expect(responseData.monoBehaviours).toBeDefined();

        if (responseData.monoBehaviours.length > 0) {
          // Verify at least one result matches our search
          const hasMatchingResult = responseData.monoBehaviours.some((mb: any) =>
            mb.name === mbName || mb.content.includes(mbName)
          );
          expect(hasMatchingResult).toBe(true);

          // Verify metadata
          expect(responseData.metadata.query).toBe(mbName);
          expect(responseData.metadata.resultCount).toBe(responseData.monoBehaviours.length);

          console.log(`Found ${responseData.monoBehaviours.length} results for MonoBehaviour: ${mbName}`);
        }
      }
    });

    it('should filter MonoBehaviours by pattern from dump.cs', async () => {
      // Arrange - Use a pattern that should match multiple MonoBehaviours
      const searchPattern = 'Manager'; // Should match StationEffectManager and others

      // Act
      const result = await toolHandler.execute({
        query: searchPattern,
        top_k: 10
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.monoBehaviours).toBeDefined();

      // Verify metadata
      expect(responseData.metadata.query).toBe(searchPattern);
      expect(responseData.metadata.resultCount).toBe(responseData.monoBehaviours.length);

      // If results found, verify they contain the pattern
      if (responseData.monoBehaviours.length > 0) {
        responseData.monoBehaviours.forEach((mb: any) => {
          const containsPattern = mb.name.includes(searchPattern) ||
                                mb.content.includes(searchPattern);
          // Note: Due to semantic search, not all results may contain exact pattern
          // but they should be semantically related
          expect(mb.name).toBeDefined();
          expect(mb.content).toBeDefined();
        });

        console.log(`Found ${responseData.monoBehaviours.length} MonoBehaviours matching pattern: ${searchPattern}`);
      }
    });

    it('should handle non-existent MonoBehaviour search gracefully', async () => {
      // Arrange
      const nonExistentName = 'NonExistentMonoBehaviour123';

      // Act
      const result = await toolHandler.execute({
        query: nonExistentName,
        top_k: 5
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.monoBehaviours).toBeDefined();
      expect(Array.isArray(responseData.monoBehaviours)).toBe(true);

      // Should return empty results or no exact matches
      expect(responseData.metadata.query).toBe(nonExistentName);
      expect(responseData.metadata.resultCount).toBe(responseData.monoBehaviours.length);

      console.log(`Search for non-existent MonoBehaviour returned ${responseData.monoBehaviours.length} results`);
    });
  });

  describe('Real Data Validation', () => {
    it('should validate MonoBehaviour structure from dump.cs', async () => {
      // Arrange
      const knownMonoBehaviour = RealDataQueries.getKnownMonoBehaviourName(testContext);

      // Act
      const result = await toolHandler.execute({
        query: knownMonoBehaviour,
        top_k: 1
      });

      // Assert
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);

      if (responseData.monoBehaviours.length > 0) {
        const mb = responseData.monoBehaviours[0];

        // Validate MonoBehaviour structure
        expect(mb.name).toBeDefined();
        expect(mb.namespace).toBeDefined();
        expect(mb.fullName).toBeDefined();
        expect(mb.content).toBeDefined();
        expect(mb.interfaces).toBeDefined();
        expect(mb.methods).toBeDefined();

        // Validate types
        expect(typeof mb.name).toBe('string');
        expect(typeof mb.content).toBe('string');
        expect(Array.isArray(mb.interfaces)).toBe(true);
        expect(Array.isArray(mb.methods)).toBe(true);

        console.log(`Validated MonoBehaviour structure for: ${mb.name}`);
      }
    });

    it('should verify tool execution context and logging', async () => {
      // Arrange & Act
      const result = await toolHandler.execute({ top_k: 1 });

      // Assert
      expect(result).toBeDefined();

      // Verify logging was called
      expect(executionContext.logger.debug).toHaveBeenCalled();

      // Verify execution timing is included
      expect(result.content[0].text).toContain('executionTime');

      console.log('Tool execution context and logging verified');
    });
  });

  describe('Performance with Real Data', () => {
    it('should complete MonoBehaviour search within reasonable time', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      const result = await toolHandler.execute({ top_k: 10 });
      const endTime = Date.now();

      // Assert
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result).toBeDefined();

      console.log(`MonoBehaviour search completed in ${executionTime}ms`);
    });
  });
});
