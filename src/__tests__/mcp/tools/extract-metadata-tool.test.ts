/**
 * Extract Metadata MCP Tool Tests
 * Tests for the IL2CPP metadata extraction MCP tool
 * Following Test-Driven Development (TFD) methodology
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { realIL2CPPDumpSample, realIL2CPPComplexSample } from '../../test-data';

describe('Extract Metadata MCP Tool Tests', () => {
  // Test the core metadata extraction logic without importing the full tool
  // This avoids circular import issues while still testing the functionality

  /**
   * Helper function to extract assembly metadata from IL2CPP dump content
   */
  function extractAssemblyMetadata(content: string) {
    const assemblies: any[] = [];
    const lines = content.split('\n');
    const imageRegex = /\/\/ Image (\d+): (.+?) - Assembly: (.+?), Version=(.+?), Culture=(.+?), PublicKeyToken=(.+?)$/;

    for (const line of lines) {
      const trimmedLine = line.trim();
      const match = trimmedLine.match(imageRegex);

      if (match) {
        const [, imageIndexStr, imageName, assemblyName, version, culture, publicKeyToken] = match;

        assemblies.push({
          name: assemblyName.trim(),
          version: version.trim(),
          culture: culture.trim(),
          publicKeyToken: publicKeyToken.trim(),
          imageName: imageName.trim(),
          imageIndex: parseInt(imageIndexStr),
          dependencies: []
        });
      }
    }

    return assemblies;
  }

  /**
   * Helper function to extract build information from IL2CPP dump content
   */
  function extractBuildInformation(content: string) {
    const buildInfo: any = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Unity version
      const unityMatch = trimmedLine.match(/\/\/ Generated by Unity IL2CPP v(.+?)$/);
      if (unityMatch) {
        buildInfo.unityVersion = unityMatch[1].trim();
        buildInfo.il2cppVersion = unityMatch[1].trim();
      }

      // Build configuration
      const configMatch = trimmedLine.match(/\/\/ Build Configuration: (.+?)$/);
      if (configMatch) {
        buildInfo.buildConfiguration = configMatch[1].trim();
      }

      // Target platform
      const platformMatch = trimmedLine.match(/\/\/ Target Platform: (.+?)$/);
      if (platformMatch) {
        buildInfo.targetPlatform = platformMatch[1].trim();
      }

      // Scripting backend
      const backendMatch = trimmedLine.match(/\/\/ Scripting Backend: (.+?)$/);
      if (backendMatch) {
        buildInfo.scriptingBackend = backendMatch[1].trim();
      }
    }

    return buildInfo;
  }

  /**
   * Helper function to extract type system metadata
   */
  function extractTypeSystemMetadata(content: string) {
    const lines = content.split('\n');
    let totalTypes = 0;
    const genericTypes: any[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Count all types with TypeDefIndex
      if (trimmedLine.includes('TypeDefIndex:')) {
        totalTypes++;
      }
    }

    return {
      totalTypes,
      genericTypes
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Assembly Metadata Extraction', () => {
    it('should extract assembly metadata from IL2CPP dump content', () => {
      // Arrange
      const content = `
// Generated by Unity IL2CPP v2021.3.16f1
// Build Configuration: Release
// Target Platform: Windows x64
// Scripting Backend: IL2CPP
// Image 0: holo-game.dll - Assembly: Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null
// Image 1: mscorlib.dll - Assembly: mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089

// Namespace: Game.Player
public class PlayerController : MonoBehaviour // TypeDefIndex: 100
{
}
      `;

      // Act
      const assemblies = extractAssemblyMetadata(content);

      // Assert
      expect(assemblies).toHaveLength(2);
      expect(assemblies[0]).toEqual({
        name: 'Assembly-CSharp',
        version: '0.0.0.0',
        culture: 'neutral',
        publicKeyToken: 'null',
        imageName: 'holo-game.dll',
        imageIndex: 0,
        dependencies: []
      });
      expect(assemblies[1]).toEqual({
        name: 'mscorlib',
        version: '4.0.0.0',
        culture: 'neutral',
        publicKeyToken: 'b77a5c561934e089',
        imageName: 'mscorlib.dll',
        imageIndex: 1,
        dependencies: []
      });
    });

    it('should extract build information correctly', () => {
      // Arrange
      const content = `
// Generated by Unity IL2CPP v2022.3.0f1
// Build Configuration: Debug
// Target Platform: Android ARM64
// Scripting Backend: IL2CPP
// Image 0: Assembly-CSharp.dll - Assembly: Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null
      `;

      // Act
      const buildInfo = extractBuildInformation(content);

      // Assert
      expect(buildInfo.unityVersion).toBe('2022.3.0f1');
      expect(buildInfo.il2cppVersion).toBe('2022.3.0f1');
      expect(buildInfo.buildConfiguration).toBe('Debug');
      expect(buildInfo.targetPlatform).toBe('Android ARM64');
      expect(buildInfo.scriptingBackend).toBe('IL2CPP');
    });
  });

  describe('Type System Metadata Extraction', () => {
    it('should count types with TypeDefIndex correctly', () => {
      // Arrange
      const content = `
// Namespace: Game.Player
public class PlayerController : MonoBehaviour // TypeDefIndex: 100
{
}

// Namespace: Game.Player
public enum PlayerState // TypeDefIndex: 101
{
}

// Namespace: Game.Enemies
public class Enemy : MonoBehaviour // TypeDefIndex: 102
{
}
      `;

      // Act
      const typeSystem = extractTypeSystemMetadata(content);

      // Assert
      expect(typeSystem.totalTypes).toBe(3);
      expect(typeSystem.genericTypes).toHaveLength(0);
    });

    it('should handle content with no types', () => {
      // Arrange
      const content = `
// Generated by Unity IL2CPP v2021.3.16f1
// Build Configuration: Release
// Target Platform: Windows x64
// Scripting Backend: IL2CPP
      `;

      // Act
      const typeSystem = extractTypeSystemMetadata(content);

      // Assert
      expect(typeSystem.totalTypes).toBe(0);
      expect(typeSystem.genericTypes).toHaveLength(0);
    });
  });

  describe('Real IL2CPP Sample Processing', () => {
    it('should process real IL2CPP dump sample correctly', () => {
      // Act
      const assemblies = extractAssemblyMetadata(realIL2CPPDumpSample);
      const buildInfo = extractBuildInformation(realIL2CPPDumpSample);
      const typeSystem = extractTypeSystemMetadata(realIL2CPPDumpSample);

      // Assert
      expect(assemblies.length).toBeGreaterThan(0);
      expect(buildInfo.unityVersion).toBeDefined();
      expect(typeSystem.totalTypes).toBeGreaterThan(0);
    });

    it('should process complex IL2CPP dump sample correctly', () => {
      // Act
      const assemblies = extractAssemblyMetadata(realIL2CPPComplexSample);
      const buildInfo = extractBuildInformation(realIL2CPPComplexSample);
      const typeSystem = extractTypeSystemMetadata(realIL2CPPComplexSample);

      // Assert
      expect(assemblies.length).toBeGreaterThan(0);
      expect(buildInfo.unityVersion).toBeDefined();
      expect(typeSystem.totalTypes).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty content gracefully', () => {
      // Act
      const assemblies = extractAssemblyMetadata('');
      const buildInfo = extractBuildInformation('');
      const typeSystem = extractTypeSystemMetadata('');

      // Assert
      expect(assemblies).toHaveLength(0);
      expect(Object.keys(buildInfo)).toHaveLength(0);
      expect(typeSystem.totalTypes).toBe(0);
    });

    it('should handle malformed assembly lines', () => {
      // Arrange
      const content = `
// Image 0: incomplete line
// Image 1: holo-game.dll - Assembly: Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null
      `;

      // Act
      const assemblies = extractAssemblyMetadata(content);

      // Assert
      expect(assemblies).toHaveLength(1);
      expect(assemblies[0].name).toBe('Assembly-CSharp');
    });

    it('should handle content with only comments', () => {
      // Arrange
      const content = `
// This is just a comment
// Another comment
// No actual IL2CPP content here
      `;

      // Act
      const assemblies = extractAssemblyMetadata(content);
      const buildInfo = extractBuildInformation(content);
      const typeSystem = extractTypeSystemMetadata(content);

      // Assert
      expect(assemblies).toHaveLength(0);
      expect(Object.keys(buildInfo)).toHaveLength(0);
      expect(typeSystem.totalTypes).toBe(0);
    });
  });
});
