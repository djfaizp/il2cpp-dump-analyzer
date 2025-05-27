/**
 * Enhanced IL2CPP Parser Tests
 * Tests for parsing real IL2CPP dump format with comprehensive coverage
 * Following Test-Driven Development (TFD) methodology
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { realIL2CPPDumpSample, realIL2CPPComplexSample } from './test-data';

// Mock file system before importing the parser
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  promises: {
    readFile: jest.fn()
  }
}));

import { EnhancedIL2CPPParser } from '../parser/enhanced-il2cpp-parser';
import * as fs from 'fs';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Enhanced IL2CPP Parser Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Real IL2CPP Format Parsing', () => {
    it('should parse image mappings correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();

      // Act
      parser.loadContent(realIL2CPPDumpSample);
      const result = parser.extractAllConstructs();

      // Debug logging
      console.log('Parse result:', {
        classCount: result.classes.length,
        enumCount: result.enums.length,
        imageMappingCount: result.imageMappings.size,
        parseErrors: result.statistics.parseErrors,
        firstFewLines: realIL2CPPDumpSample.split('\n').slice(0, 10)
      });

      // Assert
      expect(result.imageMappings).toBeDefined();
      expect(result.imageMappings.size).toBeGreaterThan(0);
      expect(result.imageMappings.get(0)).toBe('holo-game.dll');
      expect(result.imageMappings.get(1)).toBe('mscorlib.dll');
    });

    it('should parse TypeDefIndex correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPDumpSample);

      // Act
      await parser.loadFile('real-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const customConfig = result.classes.find(c => c.name === 'CustomAttackAnimOverrideConfig');
      expect(customConfig).toBeDefined();
      expect(customConfig.typeDefIndex).toBe(6);
    });

    it('should parse nested types correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPDumpSample);

      // Act
      await parser.loadFile('real-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const overrideConfig = result.classes.find(c =>
        c.name === 'CustomAttackAnimOverrideConfig.OverrideConfig'
      );
      expect(overrideConfig).toBeDefined();
      expect(overrideConfig.isStruct).toBe(true);
      expect(overrideConfig.typeDefIndex).toBe(5);
    });

    it('should parse attributes correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPDumpSample);

      // Act
      await parser.loadFile('real-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const customConfig = result.classes.find(c => c.name === 'CustomAttackAnimOverrideConfig');
      expect(customConfig.attributes).toContain('CreateAssetMenu');

      const overrideConfig = result.classes.find(c =>
        c.name === 'CustomAttackAnimOverrideConfig.OverrideConfig'
      );
      expect(overrideConfig.attributes).toContain('Serializable');
    });

    it('should parse field offsets correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPDumpSample);

      // Act
      await parser.loadFile('real-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const billboard = result.classes.find(c => c.name === 'CameraFacingBillboardWithConstraints');
      expect(billboard).toBeDefined();

      const pixelScaleField = billboard.fields.find(f => f.name === 'pixelScale');
      expect(pixelScaleField).toBeDefined();
      expect(pixelScaleField.offset).toBe('0x20');
      expect(pixelScaleField.type).toBe('float');
    });

    it('should parse method RVA and offsets correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPDumpSample);

      // Act
      await parser.loadFile('real-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const billboard = result.classes.find(c => c.name === 'CameraFacingBillboardWithConstraints');
      const lateUpdateMethod = billboard.methods.find(m => m.name === 'LateUpdate');

      expect(lateUpdateMethod).toBeDefined();
      expect(lateUpdateMethod.rva).toBe('0x5BE44A0');
      expect(lateUpdateMethod.offset).toBe('0x5BE34A0');
      expect(lateUpdateMethod.isPrivate).toBe(true);
    });
  });

  describe('Complex IL2CPP Format Parsing', () => {
    it('should parse generic methods correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPComplexSample);

      // Act
      await parser.loadFile('complex-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const playerController = result.classes.find(c => c.name === 'PlayerController');
      const getComponentMethod = playerController.methods.find(m => m.name === 'GetComponent');

      expect(getComponentMethod).toBeDefined();
      expect(getComponentMethod.isGeneric).toBe(true);
      expect(getComponentMethod.genericConstraints).toContain('where T : Component');
    });

    it('should parse method slots correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPComplexSample);

      // Act
      await parser.loadFile('complex-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const playerController = result.classes.find(c => c.name === 'PlayerController');
      const startMethod = playerController.methods.find(m => m.name === 'Start');

      expect(startMethod).toBeDefined();
      expect(startMethod.slot).toBe(4);
      expect(startMethod.isOverride).toBe(true);
    });

    it('should parse SerializeField attributes correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPComplexSample);

      // Act
      await parser.loadFile('complex-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const playerController = result.classes.find(c => c.name === 'PlayerController');
      const speedField = playerController.fields.find(f => f.name === 'speed');

      expect(speedField).toBeDefined();
      expect(speedField.attributes).toContain('SerializeField');
      expect(speedField.isPrivate).toBe(true);
    });

    it('should detect MonoBehaviour inheritance correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPComplexSample);

      // Act
      await parser.loadFile('complex-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const playerController = result.classes.find(c => c.name === 'PlayerController');
      expect(playerController.isMonoBehaviour).toBe(true);
      expect(playerController.baseClass).toBe('MonoBehaviour');
      expect(playerController.namespace).toBe('Game.Player');
    });
  });

  describe('Error Handling and Statistics', () => {
    it('should handle malformed content gracefully', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      const malformedContent = `
        // Namespace: Test
        public class { // Missing class name
          public void Method(
          // Missing closing parenthesis
        }
      `;
      mockFs.promises.readFile.mockResolvedValue(malformedContent);

      // Act
      await parser.loadFile('malformed.cs');
      const result = parser.extractAllConstructs();

      // Assert
      expect(result.statistics.parseErrors).toBeGreaterThan(0);
      expect(result.statistics.parsingCoverage).toBeLessThan(1.0);
    });

    it('should provide comprehensive statistics', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPDumpSample);

      // Act
      await parser.loadFile('real-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalConstructs).toBeGreaterThan(0);
      expect(result.statistics.classCount).toBeGreaterThan(0);
      expect(result.statistics.enumCount).toBeGreaterThan(0);
      expect(result.statistics.methodCount).toBeGreaterThan(0);
      expect(result.statistics.fieldCount).toBeGreaterThan(0);
      expect(result.statistics.parseErrors).toBe(0);
      expect(result.statistics.parsingCoverage).toBeGreaterThan(0.8);
    });

    it('should handle empty namespace correctly', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      mockFs.promises.readFile.mockResolvedValue(realIL2CPPDumpSample);

      // Act
      await parser.loadFile('real-dump.cs');
      const result = parser.extractAllConstructs();

      // Assert
      const moduleClass = result.classes.find(c => c.name === '<Module>');
      expect(moduleClass).toBeDefined();
      expect(moduleClass.namespace).toBe('');
      expect(moduleClass.fullName).toBe('<Module>');
    });
  });

  describe('Performance Tests', () => {
    it('should parse large files efficiently', async () => {
      // Arrange
      const parser = await createEnhancedParser();
      const largeContent = realIL2CPPDumpSample.repeat(50);
      mockFs.promises.readFile.mockResolvedValue(largeContent);

      // Act
      const startTime = Date.now();
      await parser.loadFile('large-dump.cs');
      const result = parser.extractAllConstructs();
      const endTime = Date.now();

      // Assert
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.statistics.totalConstructs).toBeGreaterThan(0);
    });
  });
});

// Helper function to create enhanced parser
async function createEnhancedParser() {
  return new EnhancedIL2CPPParser();
}
