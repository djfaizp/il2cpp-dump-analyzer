/**
 * Assembly Tracker Tool Tests
 * Tests for assembly metadata tracking, version comparison, and dependency analysis
 * Following TFD methodology - tests written before implementation
 */

import { AssemblyTrackerToolHandler } from '../mcp/tools/assembly-tracker';
import { ToolExecutionContext } from '../mcp/base-tool-handler';
import { Document } from '@langchain/core/documents';

describe('AssemblyTrackerToolHandler', () => {
  let handler: AssemblyTrackerToolHandler;
  let mockContext: ToolExecutionContext;
  let mockVectorStore: any;
  let mockLogger: any;

  // Mock IL2CPP dump content with assembly metadata
  const mockIL2CPPContent = `
// Generated by Unity IL2CPP v2021.3.16f1
// Image 0: mscorlib.dll - Assembly: mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
// Image 1: UnityEngine.CoreModule.dll - Assembly: UnityEngine.CoreModule, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null
// Image 2: holo-game.dll - Assembly: Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null

// Namespace: System
public class Object // TypeDefIndex: 2
{
    // Methods
    public virtual bool Equals(object obj) { }
    public virtual int GetHashCode() { }
}

// Namespace: UnityEngine
public class MonoBehaviour : Behaviour // TypeDefIndex: 1234
{
    // Methods
    public void Start() { }
    public void Update() { }
}

// Namespace: Game
public class GameManager : MonoBehaviour // TypeDefIndex: 5678
{
    // Fields
    public int score; // 0x18
    private bool isGameActive; // 0x1C
}
`;

  const mockAssemblyMetadata = {
    assemblies: [
      {
        name: 'mscorlib',
        version: '4.0.0.0',
        culture: 'neutral',
        publicKeyToken: 'b77a5c561934e089',
        imageName: 'mscorlib.dll',
        imageIndex: 0,
        dependencies: []
      },
      {
        name: 'UnityEngine.CoreModule',
        version: '0.0.0.0',
        culture: 'neutral',
        publicKeyToken: 'null',
        imageName: 'UnityEngine.CoreModule.dll',
        imageIndex: 1,
        dependencies: ['mscorlib']
      },
      {
        name: 'Assembly-CSharp',
        version: '0.0.0.0',
        culture: 'neutral',
        publicKeyToken: 'null',
        imageName: 'holo-game.dll',
        imageIndex: 2,
        dependencies: ['mscorlib', 'UnityEngine.CoreModule']
      }
    ],
    buildInfo: {
      unityVersion: '2021.3.16f1',
      il2cppVersion: '2021.3.16f1',
      buildConfiguration: 'Release',
      targetPlatform: 'Windows'
    },
    extractionDate: new Date('2025-01-28T10:00:00Z'),
    sourceFile: 'dump.cs'
  };

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockVectorStore = {
      similaritySearch: jest.fn(),
      searchWithFilter: jest.fn()
    };

    mockContext = {
      vectorStore: mockVectorStore,
      logger: mockLogger,
      isInitialized: jest.fn().mockReturnValue(true)
    };

    handler = new AssemblyTrackerToolHandler(mockContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(handler).toBeInstanceOf(AssemblyTrackerToolHandler);
      expect(handler['config'].name).toBe('track_assembly_metadata');
      expect(handler['config'].description).toContain('Track assembly metadata');
      expect(handler['config'].enableParameterValidation).toBe(true);
      expect(handler['config'].enableResponseFormatting).toBe(true);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required content parameter', async () => {
      const params = {};
      const result = await handler['validateParameters'](params);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Either content or file_path parameter is required');
    });

    it('should validate tracking_id parameter format', async () => {
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'invalid id with spaces'
      };
      const result = await handler['validateParameters'](params);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('tracking_id must be alphanumeric with hyphens/underscores only');
    });

    it('should validate comparison_mode parameter', async () => {
      const params = {
        content: mockIL2CPPContent,
        comparison_mode: 'invalid_mode'
      };
      const result = await handler['validateParameters'](params);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('comparison_mode must be one of: full, versions_only, dependencies_only, changes_only');
    });

    it('should accept valid parameters', async () => {
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full',
        include_dependencies: true,
        enable_caching: true
      };
      const result = await handler['validateParameters'](params);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Assembly Tracking', () => {
    it('should track new assembly metadata', async () => {
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full'
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('Assembly tracking completed');
      expect(JSON.stringify(result)).toContain('- **Assemblies processed:** 3');
      expect(JSON.stringify(result)).toContain('build-v1-0-0');
    });

    it('should detect version changes between builds', async () => {
      // First build
      const params1 = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full'
      };
      await handler.execute(params1);

      // Second build with version change
      const updatedContent = mockIL2CPPContent.replace(
        'Assembly-CSharp, Version=0.0.0.0',
        'Assembly-CSharp, Version=1.0.0.0'
      );
      const params2 = {
        content: updatedContent,
        tracking_id: 'build-v1-1-0',
        comparison_mode: 'versions_only',
        compare_with: 'build-v1-0-0'
      };

      const result = await handler.execute(params2);

      expect(JSON.stringify(result)).toContain('### Version Changes');
      expect(JSON.stringify(result)).toContain('Assembly-CSharp:** 0.0.0.0 → 1.0.0.0');
    });

    it('should analyze assembly dependencies', async () => {
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'dependencies_only',
        include_dependencies: true
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('Assembly tracking completed');
      expect(JSON.stringify(result)).toContain('Dependencies: mscorlib, UnityEngine.CoreModule');
      expect(JSON.stringify(result)).toContain('mscorlib');
      expect(JSON.stringify(result)).toContain('UnityEngine.CoreModule');
    });
  });

  describe('Metadata Comparison', () => {
    it('should compare metadata between two builds', async () => {
      // First, create the base build to cache
      const baseParams = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full'
      };
      await handler.execute(baseParams);

      // Now compare with a new build
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-1-0',
        comparison_mode: 'full',
        compare_with: 'build-v1-0-0'
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('No changes detected between builds');
      expect(JSON.stringify(result)).toContain('build-v1-0-0');
    });

    it('should detect new assemblies in comparison', async () => {
      // First, create the base build to cache
      const baseParams = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full'
      };
      await handler.execute(baseParams);

      const contentWithNewAssembly = mockIL2CPPContent +
        '\n// Image 3: NewLibrary.dll - Assembly: NewLibrary, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null';

      const params = {
        content: contentWithNewAssembly,
        tracking_id: 'build-v1-1-0',
        comparison_mode: 'changes_only',
        compare_with: 'build-v1-0-0'
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('### New Assemblies');
      expect(JSON.stringify(result)).toContain('NewLibrary');
    });

    it('should detect removed assemblies in comparison', async () => {
      // First, create the base build to cache
      const baseParams = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full'
      };
      await handler.execute(baseParams);

      const contentWithRemovedAssembly = mockIL2CPPContent.replace(
        /\/\/ Image 2:.*\n/,
        ''
      );

      const params = {
        content: contentWithRemovedAssembly,
        tracking_id: 'build-v1-1-0',
        comparison_mode: 'changes_only',
        compare_with: 'build-v1-0-0'
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('### Removed Assemblies');
      expect(JSON.stringify(result)).toContain('Assembly-CSharp');
    });
  });

  describe('Caching and Persistence', () => {
    it('should cache metadata when caching is enabled', async () => {
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full',
        enable_caching: true
      };

      await handler.execute(params);

      expect(handler['cachedMetadata'].has('build-v1-0-0')).toBe(true);
    });

    it('should not cache metadata when caching is disabled', async () => {
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full',
        enable_caching: false
      };

      await handler.execute(params);

      expect(handler['cachedMetadata'].has('build-v1-0-0')).toBe(false);
    });

    it('should retrieve cached metadata for comparison', async () => {
      // First, create the base build to cache
      const baseParams = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full'
      };
      await handler.execute(baseParams);

      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-1-0',
        comparison_mode: 'full',
        compare_with: 'build-v1-0-0'
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('No changes detected between builds');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid IL2CPP content gracefully', async () => {
      const params = {
        content: 'invalid content',
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full'
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('No assembly metadata found in IL2CPP dump');
    });

    it('should handle missing comparison target', async () => {
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-1-0',
        comparison_mode: 'full',
        compare_with: 'non-existent-build'
      };

      try {
        await handler.execute(params);
        fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).toContain('Comparison target not found: non-existent-build');
      }
    });

    it('should handle empty content', async () => {
      const params = {
        content: '',
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full'
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('Either content or file_path parameter is required');
    });
  });

  describe('Performance and Statistics', () => {
    it('should include processing statistics in response', async () => {
      const params = {
        content: mockIL2CPPContent,
        tracking_id: 'build-v1-0-0',
        comparison_mode: 'full',
        enable_performance_tracking: true
      };

      const result = await handler.execute(params);

      expect(JSON.stringify(result)).toContain('- **Processing time:**');
      expect(JSON.stringify(result)).toContain('- **Memory usage:**');
      expect(JSON.stringify(result)).toContain('- **Assemblies processed:** 3');
    });

    it('should handle large assembly lists efficiently', async () => {
      // Create content with many assemblies
      let largeContent = mockIL2CPPContent;
      for (let i = 4; i < 100; i++) {
        largeContent += `\n// Image ${i}: Library${i}.dll - Assembly: Library${i}, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null`;
      }

      const params = {
        content: largeContent,
        tracking_id: 'build-large',
        comparison_mode: 'full',
        enable_performance_tracking: true
      };

      const startTime = Date.now();
      const result = await handler.execute(params);
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(JSON.stringify(result)).toContain('- **Assemblies processed:** 99');
    });
  });
});
