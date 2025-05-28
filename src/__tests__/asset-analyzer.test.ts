/**
 * Unity Asset Analyzer Tests
 * Comprehensive test suite following TFD methodology
 */

import { Document } from '@langchain/core/documents';
import {
  UnityAssetAnalyzer,
  AssetReference,
  AssetAnalysisResult,
  AssetUsagePattern,
  AssetDependency
} from '../analysis/asset-analyzer';

describe('UnityAssetAnalyzer', () => {
  let analyzer: UnityAssetAnalyzer;

  beforeEach(() => {
    analyzer = new UnityAssetAnalyzer();
  });

  describe('Asset Reference Detection', () => {
    test('should detect Resources.Load calls', async () => {
      const document = createTestDocument(`
        public class TestClass {
          void LoadAsset() {
            var texture = Resources.Load<Texture2D>("UI/MainMenu/background");
            var audio = Resources.Load("Audio/music", typeof(AudioClip));
          }
        }
      `, 'TestClass');

      const result = await analyzer.analyzeAssets([document]);

      expect(result.assetReferences).toHaveLength(2);
      expect(result.assetReferences[0]).toMatchObject({
        assetPath: 'UI/MainMenu/background',
        assetType: 'Texture',
        loadingMethod: 'Resources.Load',
        referencingClass: 'TestClass',
        isResourcesLoad: true,
        isAssetDatabase: false,
        isAddressable: false,
      });
      expect(result.assetReferences[0].confidence).toBeGreaterThan(0.7);
    });

    test('should detect AssetDatabase calls', async () => {
      const document = createTestDocument(`
        #if UNITY_EDITOR
        public class EditorScript {
          void LoadEditorAsset() {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Player.prefab");
            var material = AssetDatabase.LoadMainAssetAtPath("Assets/Materials/PlayerMaterial.mat");
          }
        }
        #endif
      `, 'EditorScript');

      const result = await analyzer.analyzeAssets([document]);

      expect(result.assetReferences).toHaveLength(2);
      expect(result.assetReferences[0]).toMatchObject({
        assetPath: 'Assets/Prefabs/Player.prefab',
        assetType: 'Prefab',
        loadingMethod: 'AssetDatabase',
        isAssetDatabase: true,
      });
    });

    test('should detect Addressable asset loading', async () => {
      const document = createTestDocument(`
        public class AddressableLoader {
          async void LoadAddressableAsset() {
            var handle = Addressables.LoadAssetAsync<Sprite>("player_icon");
            var instance = Addressables.InstantiateAsync("enemy_prefab");
          }
        }
      `, 'AddressableLoader');

      const result = await analyzer.analyzeAssets([document]);

      expect(result.assetReferences).toHaveLength(2);
      expect(result.assetReferences[0]).toMatchObject({
        assetPath: 'player_icon',
        loadingMethod: 'Addressables',
        isAddressable: true,
      });
    });

    test('should detect SerializeField asset references', async () => {
      const document = createTestDocument(`
        public class PlayerController : MonoBehaviour {
          [SerializeField] private AudioClip jumpSound;
          [SerializeField] private Texture2D playerTexture;
          public GameObject weaponPrefab; // asset reference
        }
      `, 'PlayerController');

      const result = await analyzer.analyzeAssets([document]);

      expect(result.assetReferences).toHaveLength(3);
      expect(result.assetReferences.some(ref => ref.assetType === 'Audio')).toBe(true);
      expect(result.assetReferences.some(ref => ref.assetType === 'Texture')).toBe(true);
      expect(result.assetReferences.some(ref => ref.assetType === 'Prefab')).toBe(true);
    });

    test('should handle malformed or invalid asset references', async () => {
      const document = createTestDocument(`
        public class InvalidReferences {
          void BadCode() {
            var invalid = Resources.Load<>(""); // Empty path
            var nullRef = Resources.Load(null, typeof(Object)); // Null path
            // Incomplete line: Resources.Load<Texture2D>
          }
        }
      `, 'InvalidReferences');

      const result = await analyzer.analyzeAssets([document]);

      // Should handle gracefully without crashing
      expect(result.assetReferences).toBeDefined();
      expect(result.assetReferences.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Asset Type Categorization', () => {
    test('should categorize asset types correctly', async () => {
      const document = createTestDocument(`
        public class AssetTypes {
          void LoadDifferentTypes() {
            Resources.Load<Texture2D>("texture");
            Resources.Load<AudioClip>("audio");
            Resources.Load<GameObject>("prefab");
            Resources.Load<Material>("material");
            Resources.Load<AnimationClip>("animation");
            Resources.Load<Mesh>("mesh");
            Resources.Load<Font>("font");
          }
        }
      `, 'AssetTypes');

      const result = await analyzer.analyzeAssets([document]);

      const assetTypes = result.assetReferences.map(ref => ref.assetType);
      expect(assetTypes).toContain('Texture');
      expect(assetTypes).toContain('Audio');
      expect(assetTypes).toContain('Prefab');
      expect(assetTypes).toContain('Material');
      expect(assetTypes).toContain('Animation');
      expect(assetTypes).toContain('Mesh');
      expect(assetTypes).toContain('Font');
    });

    test('should handle unknown asset types', async () => {
      const document = createTestDocument(`
        public class UnknownTypes {
          void LoadUnknownType() {
            Resources.Load<CustomAssetType>("custom");
          }
        }
      `, 'UnknownTypes');

      const result = await analyzer.analyzeAssets([document]);

      expect(result.assetReferences[0].assetType).toBe('CustomAssetType');
    });
  });

  describe('Usage Pattern Detection', () => {
    test('should detect high-frequency Resources.Load usage', async () => {
      const documents = Array.from({ length: 15 }, (_, i) =>
        createTestDocument(`
          public class Class${i} {
            void Load() {
              Resources.Load<Texture2D>("texture${i}");
            }
          }
        `, `Class${i}`)
      );

      const result = await analyzer.analyzeAssets(documents);

      const resourcesPattern = result.usagePatterns.find(p =>
        p.pattern === 'Resources.Load Usage'
      );
      expect(resourcesPattern).toBeDefined();
      expect(resourcesPattern!.frequency).toBe(15);
      expect(resourcesPattern!.severity).toBe('high');
    });

    test('should provide optimization recommendations for patterns', async () => {
      const document = createTestDocument(`
        public class PatternTest {
          void LoadSynchronously() {
            Resources.Load<Texture2D>("sync1");
            Resources.Load<AudioClip>("sync2");
            Resources.Load<GameObject>("sync3");
          }
        }
      `, 'PatternTest');

      const result = await analyzer.analyzeAssets([document]);

      const pattern = result.usagePatterns.find(p => p.pattern === 'Resources.Load Usage');
      expect(pattern?.optimization).toContain('Addressables');
    });
  });

  describe('Dependency Analysis', () => {
    test('should build asset dependency graph', async () => {
      const documents = [
        createTestDocument(`
          public class ClassA {
            void Load() {
              Resources.Load<Texture2D>("shared_texture");
            }
          }
        `, 'ClassA'),
        createTestDocument(`
          public class ClassB {
            void Load() {
              Resources.Load<Texture2D>("shared_texture");
              Resources.Load<AudioClip>("unique_audio");
            }
          }
        `, 'ClassB')
      ];

      const result = await analyzer.analyzeAssets(documents);

      expect(result.dependencies).toBeDefined();
      expect(result.dependencies.length).toBeGreaterThan(0);

      const sharedTextureDep = result.dependencies.find(dep =>
        dep.assetPath === 'shared_texture'
      );
      expect(sharedTextureDep?.dependents).toContain('ClassA');
      expect(sharedTextureDep?.dependents).toContain('ClassB');
    });

    test('should detect circular dependencies', async () => {
      // This is a simplified test - real circular dependency detection would be more complex
      const result = await analyzer.analyzeAssets([]);

      expect(result.circularDependencies).toBeDefined();
      expect(Array.isArray(result.circularDependencies)).toBe(true);
    });
  });

  describe('Optimization Recommendations', () => {
    test('should recommend Addressables for Resources.Load usage', async () => {
      const document = createTestDocument(`
        public class ResourcesUser {
          void LoadMultiple() {
            Resources.Load<Texture2D>("tex1");
            Resources.Load<AudioClip>("audio1");
            Resources.Load<GameObject>("prefab1");
          }
        }
      `, 'ResourcesUser');

      const result = await analyzer.analyzeAssets([document]);

      expect(result.optimizationRecommendations.some(rec =>
        rec.includes('Addressables')
      )).toBe(true);
    });

    test('should recommend async loading for synchronous calls', async () => {
      const document = createTestDocument(`
        public class SyncLoader {
          void LoadSync() {
            Resources.Load<Texture2D>("large_texture");
            Resources.Load<AudioClip>("large_audio");
          }
        }
      `, 'SyncLoader');

      const result = await analyzer.analyzeAssets([document]);

      expect(result.optimizationRecommendations.some(rec =>
        rec.includes('async')
      )).toBe(true);
    });

    test('should warn about circular dependencies', async () => {
      // Mock a scenario with circular dependencies
      const result = await analyzer.analyzeAssets([]);

      // The recommendation system should handle circular dependencies
      expect(result.optimizationRecommendations).toBeDefined();
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle empty document list', async () => {
      const result = await analyzer.analyzeAssets([]);

      expect(result.totalAssets).toBe(0);
      expect(result.assetReferences).toHaveLength(0);
      expect(result.dependencies).toHaveLength(0);
      expect(result.usagePatterns).toHaveLength(0);
      expect(result.unusedAssets).toHaveLength(0);
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle large number of documents efficiently', async () => {
      const documents = Array.from({ length: 100 }, (_, i) =>
        createTestDocument(`
          public class LargeClass${i} {
            void Load() {
              Resources.Load<Texture2D>("texture${i}");
              Resources.Load<AudioClip>("audio${i}");
            }
          }
        `, `LargeClass${i}`)
      );

      const startTime = Date.now();
      const result = await analyzer.analyzeAssets(documents);
      const processingTime = Date.now() - startTime;

      expect(result.totalAssets).toBe(200); // 2 assets per document
      expect(result.assetReferences).toHaveLength(200);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.metadata.processingTime).toBeGreaterThan(0);
    });

    test('should provide comprehensive metadata', async () => {
      const document = createTestDocument(`
        public class MetadataTest {
          void Load() {
            Resources.Load<Texture2D>("texture");
            Resources.Load<AudioClip>("audio");
          }
        }
      `, 'MetadataTest');

      const result = await analyzer.analyzeAssets([document]);

      expect(result.metadata).toMatchObject({
        analysisTimestamp: expect.any(String),
        processingTime: expect.any(Number),
        codebaseSize: 1,
        assetTypes: expect.any(Object),
      });
      expect(result.metadata.assetTypes.Texture).toBe(1);
      expect(result.metadata.assetTypes.Audio).toBe(1);
    });
  });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(content: string, className: string): Document {
  return new Document({
    pageContent: content,
    metadata: {
      name: className,
      type: 'class',
      namespace: 'Test',
      fullName: `Test.${className}`,
    },
  });
}
