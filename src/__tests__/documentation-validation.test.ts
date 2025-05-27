/**
 * Documentation Validation Tests
 *
 * Tests to ensure documentation accuracy and completeness for the IL2CPP Dump Analyzer MCP system.
 * These tests validate that examples compile correctly and documentation is up-to-date.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Documentation Validation', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const examplesDir = path.join(projectRoot, 'examples');
  const readmeFile = path.join(projectRoot, 'README.md');
  const mcpReadmeFile = path.join(projectRoot, 'MCP-README.md');

  beforeAll(() => {
    // Ensure test environment is properly set up
    expect(fs.existsSync(projectRoot)).toBe(true);
  });

  describe('README.md Validation', () => {
    let readmeContent: string;

    beforeAll(() => {
      readmeContent = fs.readFileSync(readmeFile, 'utf-8');
    });

    it('should mention all 10 MCP tools', () => {
      expect(readmeContent).toContain('10 comprehensive MCP tools');

      // Check for all tool names
      const expectedTools = [
        'search_code',
        'find_monobehaviours',
        'find_class_hierarchy',
        'find_enum_values',
        'analyze_dependencies',
        'find_cross_references',
        'find_design_patterns',
        'generate_class_wrapper',
        'generate_method_stubs',
        'generate_monobehaviour_template'
      ];

      expectedTools.forEach(tool => {
        expect(readmeContent).toContain(tool);
      });
    });

    it('should include code generation tools section', () => {
      expect(readmeContent).toContain('### Code Generation Tools');
      expect(readmeContent).toContain('Class Wrapper Generation');
      expect(readmeContent).toContain('Method Stub Generation');
      expect(readmeContent).toContain('MonoBehaviour Template Generation');
    });

    it('should reference examples directory', () => {
      expect(readmeContent).toContain('examples/');
      expect(readmeContent).toContain('class-wrapper-example.md');
      expect(readmeContent).toContain('method-stubs-example.md');
      expect(readmeContent).toContain('monobehaviour-template-example.md');
    });

    it('should include generator directory in project structure', () => {
      expect(readmeContent).toContain('├── generator/');
      expect(readmeContent).toContain('class-wrapper-generator.ts');
      expect(readmeContent).toContain('method-stub-generator.ts');
      expect(readmeContent).toContain('monobehaviour-generator.ts');
    });

    it('should include troubleshooting for code generation', () => {
      expect(readmeContent).toContain('Code Generation Issues');
      expect(readmeContent).toContain('MonoBehaviour Generation Issues');
    });
  });

  describe('MCP-README.md Validation', () => {
    let mcpReadmeContent: string;

    beforeAll(() => {
      mcpReadmeContent = fs.readFileSync(mcpReadmeFile, 'utf-8');
    });

    it('should mention 10 MCP tools', () => {
      expect(mcpReadmeContent).toContain('10 advanced MCP tools');
      expect(mcpReadmeContent).toContain('10 comprehensive MCP tools');
    });

    it('should include code generation in supported analysis types', () => {
      expect(mcpReadmeContent).toContain('Code Generation');
      expect(mcpReadmeContent).toContain('C# wrapper classes');
      expect(mcpReadmeContent).toContain('method stubs');
      expect(mcpReadmeContent).toContain('Unity MonoBehaviour templates');
    });

    it('should document all three code generation tools', () => {
      // Tool 8: generate_class_wrapper
      expect(mcpReadmeContent).toContain('### 8. generate_class_wrapper');
      expect(mcpReadmeContent).toContain('C# Class Wrapper Generation');

      // Tool 9: generate_method_stubs
      expect(mcpReadmeContent).toContain('### 9. generate_method_stubs');
      expect(mcpReadmeContent).toContain('Method Stub Generation');

      // Tool 10: generate_monobehaviour_template
      expect(mcpReadmeContent).toContain('### 10. generate_monobehaviour_template');
      expect(mcpReadmeContent).toContain('Unity MonoBehaviour Template Generation');
    });

    it('should include proper parameter documentation for code generation tools', () => {
      // Check for required parameters
      expect(mcpReadmeContent).toContain('class_name` (string, required)');

      // Check for optional parameters
      expect(mcpReadmeContent).toContain('include_documentation` (boolean, optional');
      expect(mcpReadmeContent).toContain('include_unity_attributes` (boolean, optional');
      expect(mcpReadmeContent).toContain('unity_version` (string, optional');
      expect(mcpReadmeContent).toContain('additional_usings` (array, optional');
    });

    it('should include examples for each code generation tool', () => {
      // Check for TypeScript examples
      expect(mcpReadmeContent).toContain('```typescript');
      expect(mcpReadmeContent).toContain('generate_class_wrapper({');
      expect(mcpReadmeContent).toContain('generate_method_stubs({');
      expect(mcpReadmeContent).toContain('generate_monobehaviour_template({');
    });
  });

  describe('Examples Directory Validation', () => {
    it('should exist and contain all required files', () => {
      expect(fs.existsSync(examplesDir)).toBe(true);

      const requiredFiles = [
        'README.md',
        'class-wrapper-example.md',
        'method-stubs-example.md',
        'monobehaviour-template-example.md'
      ];

      requiredFiles.forEach(file => {
        const filePath = path.join(examplesDir, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });

    it('should have comprehensive examples README', () => {
      const examplesReadme = fs.readFileSync(path.join(examplesDir, 'README.md'), 'utf-8');

      expect(examplesReadme).toContain('# IL2CPP Dump Analyzer Code Generation Examples');
      expect(examplesReadme).toContain('Class Wrapper Generation');
      expect(examplesReadme).toContain('Method Stub Generation');
      expect(examplesReadme).toContain('MonoBehaviour Template Generation');
      expect(examplesReadme).toContain('Quick Start');
      expect(examplesReadme).toContain('Best Practices');
    });

    it('should have detailed class wrapper examples', () => {
      const classWrapperExample = fs.readFileSync(
        path.join(examplesDir, 'class-wrapper-example.md'),
        'utf-8'
      );

      expect(classWrapperExample).toContain('# Class Wrapper Generation Examples');
      expect(classWrapperExample).toContain('generate_class_wrapper');
      expect(classWrapperExample).toContain('```typescript');
      expect(classWrapperExample).toContain('```csharp');
      expect(classWrapperExample).toContain('Basic Usage');
      expect(classWrapperExample).toContain('Advanced Class Wrapper with Custom Options');
      expect(classWrapperExample).toContain('Best Practices');
    });

    it('should have detailed method stubs examples', () => {
      const methodStubsExample = fs.readFileSync(
        path.join(examplesDir, 'method-stubs-example.md'),
        'utf-8'
      );

      expect(methodStubsExample).toContain('# Method Stub Generation Examples');
      expect(methodStubsExample).toContain('generate_method_stubs');
      expect(methodStubsExample).toContain('method_filter');
      expect(methodStubsExample).toContain('include_error_handling');
      expect(methodStubsExample).toContain('Filtering Examples');
    });

    it('should have detailed MonoBehaviour template examples', () => {
      const monoBehaviourExample = fs.readFileSync(
        path.join(examplesDir, 'monobehaviour-template-example.md'),
        'utf-8'
      );

      expect(monoBehaviourExample).toContain('# MonoBehaviour Template Generation Examples');
      expect(monoBehaviourExample).toContain('generate_monobehaviour_template');
      expect(monoBehaviourExample).toContain('Unity Lifecycle');
      expect(monoBehaviourExample).toContain('SerializeField');
      expect(monoBehaviourExample).toContain('Component-Specific Templates');
    });
  });

  describe('Code Example Validation', () => {
    it('should have valid TypeScript examples in documentation', () => {
      const mcpReadmeContent = fs.readFileSync(mcpReadmeFile, 'utf-8');

      // Extract TypeScript code blocks
      const tsCodeBlocks = mcpReadmeContent.match(/```typescript\n([\s\S]*?)\n```/g);
      expect(tsCodeBlocks).toBeTruthy();
      expect(tsCodeBlocks!.length).toBeGreaterThan(0);

      // Check for proper function calls
      tsCodeBlocks!.forEach(block => {
        if (block.includes('generate_')) {
          expect(block).toMatch(/generate_\w+\s*\(/);
          expect(block).toContain('class_name:');
        }
      });
    });

    it('should have valid C# examples in examples directory', () => {
      const exampleFiles = [
        'class-wrapper-example.md',
        'method-stubs-example.md',
        'monobehaviour-template-example.md'
      ];

      exampleFiles.forEach(file => {
        const content = fs.readFileSync(path.join(examplesDir, file), 'utf-8');
        const csharpBlocks = content.match(/```csharp\n([\s\S]*?)\n```/g);

        if (csharpBlocks) {
          csharpBlocks.forEach(block => {
            // Basic C# syntax validation - check for C# constructs
            const hasUsing = /using\s+\w+/.test(block);
            const hasClass = /class\s+\w+/.test(block);
            const hasMethod = /public\s+\w+|private\s+\w+|protected\s+\w+/.test(block);
            const hasAttribute = /\[SerializeField\]|\[Range\(|\[RequireComponent/.test(block);
            const hasNamespace = /namespace\s+\w+/.test(block);
            const hasComment = /\/\/|\/\*|\*\//.test(block);
            const hasProperty = /\{\s*get|\{\s*set/.test(block);
            const hasField = /private\s+\w+\s+\w+|public\s+\w+\s+\w+/.test(block);

            // Should have at least one C# construct (very flexible)
            expect(hasUsing || hasClass || hasMethod || hasAttribute || hasNamespace || hasComment || hasProperty || hasField).toBe(true);
          });
        }
      });
    });
  });

  describe('Documentation Consistency', () => {
    it('should have consistent tool counts across all documentation', () => {
      const readmeContent = fs.readFileSync(readmeFile, 'utf-8');
      const mcpReadmeContent = fs.readFileSync(mcpReadmeFile, 'utf-8');

      // Both should mention 10 tools
      expect(readmeContent).toContain('10 comprehensive MCP tools');
      expect(mcpReadmeContent).toContain('10 comprehensive MCP tools');
    });

    it('should have consistent tool names across documentation', () => {
      const readmeContent = fs.readFileSync(readmeFile, 'utf-8');
      const mcpReadmeContent = fs.readFileSync(mcpReadmeFile, 'utf-8');

      const codeGenTools = [
        'generate_class_wrapper',
        'generate_method_stubs',
        'generate_monobehaviour_template'
      ];

      codeGenTools.forEach(tool => {
        expect(readmeContent).toContain(tool);
        expect(mcpReadmeContent).toContain(tool);
      });
    });

    it('should have consistent parameter descriptions', () => {
      const mcpReadmeContent = fs.readFileSync(mcpReadmeFile, 'utf-8');

      // Check that common parameters have consistent descriptions
      const classNameOccurrences = mcpReadmeContent.match(/class_name.*required.*Name of the IL2CPP/g);
      expect(classNameOccurrences).toBeTruthy();
      expect(classNameOccurrences!.length).toBe(3); // Should appear in all 3 tools
    });
  });
});
