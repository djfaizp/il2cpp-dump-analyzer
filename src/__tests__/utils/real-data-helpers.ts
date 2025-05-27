/**
 * Real Data Test Helpers
 * Utility functions for working with real dump.cs data in tests
 */

import { Document } from '@langchain/core/documents';
import { RealDataTestContext } from './dump-cs-test-setup';
import { IL2CPPClass, IL2CPPEnum, IL2CPPInterface } from '../../parser/enhanced-types';

/**
 * Test assertion helpers for real data validation
 */
export class RealDataAssertions {
  /**
   * Assert that a class exists in the real data
   */
  static assertClassExists(context: RealDataTestContext, className: string): IL2CPPClass {
    const foundClass = context.classes.find(cls => 
      cls.name === className || cls.fullName === className
    );
    
    if (!foundClass) {
      const availableClasses = context.classes.slice(0, 10).map(cls => cls.name).join(', ');
      throw new Error(
        `Class '${className}' not found in real dump.cs data. ` +
        `Available classes (first 10): ${availableClasses}`
      );
    }
    
    return foundClass;
  }

  /**
   * Assert that an enum exists in the real data
   */
  static assertEnumExists(context: RealDataTestContext, enumName: string): IL2CPPEnum {
    const foundEnum = context.enums.find(enm => 
      enm.name === enumName || enm.fullName === enumName
    );
    
    if (!foundEnum) {
      const availableEnums = context.enums.slice(0, 10).map(enm => enm.name).join(', ');
      throw new Error(
        `Enum '${enumName}' not found in real dump.cs data. ` +
        `Available enums (first 10): ${availableEnums}`
      );
    }
    
    return foundEnum;
  }

  /**
   * Assert that MonoBehaviours exist in the real data
   */
  static assertMonoBehavioursExist(context: RealDataTestContext): IL2CPPClass[] {
    if (context.monoBehaviours.length === 0) {
      throw new Error('No MonoBehaviour classes found in real dump.cs data');
    }
    
    return context.monoBehaviours;
  }

  /**
   * Assert that search results contain expected metadata
   */
  static assertSearchResultsValid(results: Document[], expectedType?: string): void {
    if (results.length === 0) {
      throw new Error('Search results are empty');
    }

    for (const result of results) {
      if (!result.metadata) {
        throw new Error('Search result missing metadata');
      }

      if (!result.metadata.name) {
        throw new Error('Search result missing name in metadata');
      }

      if (!result.metadata.type) {
        throw new Error('Search result missing type in metadata');
      }

      if (expectedType && result.metadata.type !== expectedType) {
        throw new Error(
          `Expected result type '${expectedType}', got '${result.metadata.type}'`
        );
      }
    }
  }
}

/**
 * Real data query helpers for common test scenarios
 */
export class RealDataQueries {
  /**
   * Get a known MonoBehaviour class name from real data
   */
  static getKnownMonoBehaviourName(context: RealDataTestContext): string {
    if (context.monoBehaviours.length === 0) {
      throw new Error('No MonoBehaviour classes found in real data');
    }
    
    // Return the first MonoBehaviour found
    return context.monoBehaviours[0].name;
  }

  /**
   * Get a known enum name from real data
   */
  static getKnownEnumName(context: RealDataTestContext): string {
    if (context.enums.length === 0) {
      throw new Error('No enums found in real data');
    }
    
    // Return the first enum found
    return context.enums[0].name;
  }

  /**
   * Get a known class name from real data
   */
  static getKnownClassName(context: RealDataTestContext): string {
    if (context.classes.length === 0) {
      throw new Error('No classes found in real data');
    }
    
    // Return the first class found
    return context.classes[0].name;
  }

  /**
   * Get a known namespace from real data
   */
  static getKnownNamespace(context: RealDataTestContext): string {
    const namespaces = [...new Set(context.classes.map(cls => cls.namespace).filter(Boolean))];
    
    if (namespaces.length === 0) {
      throw new Error('No namespaces found in real data');
    }
    
    return namespaces[0];
  }

  /**
   * Get search queries that should return results based on real data
   */
  static getValidSearchQueries(context: RealDataTestContext): string[] {
    const queries: string[] = [];
    
    // Add class names
    if (context.classes.length > 0) {
      queries.push(context.classes[0].name);
    }
    
    // Add MonoBehaviour names
    if (context.monoBehaviours.length > 0) {
      queries.push(context.monoBehaviours[0].name);
    }
    
    // Add enum names
    if (context.enums.length > 0) {
      queries.push(context.enums[0].name);
    }
    
    // Add common Unity terms that should exist in real data
    queries.push('MonoBehaviour', 'GameObject', 'Component');
    
    return queries;
  }

  /**
   * Get search queries that should return no results
   */
  static getInvalidSearchQueries(): string[] {
    return [
      'NonExistentClass123',
      'FakeMonoBehaviour456',
      'InvalidEnum789',
      'ThisClassDoesNotExist'
    ];
  }
}

/**
 * Performance test helpers for real data
 */
export class RealDataPerformance {
  /**
   * Measure search performance with real data
   */
  static async measureSearchPerformance(
    vectorStore: any,
    query: string,
    iterations: number = 10
  ): Promise<{ averageTime: number; minTime: number; maxTime: number }> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await vectorStore.similaritySearch(query, 5);
      const endTime = Date.now();
      times.push(endTime - startTime);
    }
    
    return {
      averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times)
    };
  }

  /**
   * Validate that search performance meets expectations
   */
  static assertSearchPerformance(
    performanceResult: { averageTime: number; minTime: number; maxTime: number },
    maxAverageTime: number = 1000
  ): void {
    if (performanceResult.averageTime > maxAverageTime) {
      throw new Error(
        `Search performance too slow: ${performanceResult.averageTime}ms average ` +
        `(expected < ${maxAverageTime}ms)`
      );
    }
  }
}

/**
 * Real data validation helpers
 */
export class RealDataValidation {
  /**
   * Validate that the real data context is properly set up
   */
  static validateTestContext(context: RealDataTestContext): void {
    if (!context.vectorStore) {
      throw new Error('Vector store not initialized in test context');
    }
    
    if (!context.parser) {
      throw new Error('Parser not initialized in test context');
    }
    
    if (!context.documents || context.documents.length === 0) {
      throw new Error('No documents found in test context');
    }
    
    if (!context.classes || context.classes.length === 0) {
      throw new Error('No classes found in test context');
    }
  }

  /**
   * Validate that real data contains expected Unity patterns
   */
  static validateUnityPatterns(context: RealDataTestContext): void {
    // Check for MonoBehaviour classes
    if (context.monoBehaviours.length === 0) {
      console.warn('Warning: No MonoBehaviour classes found in real data');
    }
    
    // Check for Unity-specific patterns
    const hasUnityPatterns = context.classes.some(cls => 
      cls.baseClass === 'MonoBehaviour' ||
      cls.baseClass === 'ScriptableObject' ||
      cls.name.includes('Unity') ||
      cls.namespace?.includes('Unity')
    );
    
    if (!hasUnityPatterns) {
      console.warn('Warning: No Unity-specific patterns found in real data');
    }
  }
}
