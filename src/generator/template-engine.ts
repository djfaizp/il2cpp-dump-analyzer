/**
 * Template engine integration for IL2CPP code generation
 * Supports multiple template engines with a unified interface
 */

import {
  TemplateConfig,
  TemplateEngine,
  TemplateVariable,
  GenerationError,
  GenerationErrorType
} from './types';

/**
 * Template processing result
 */
export interface TemplateResult {
  /** Success status */
  success: boolean;
  /** Rendered content */
  content?: string;
  /** Any errors that occurred */
  errors: GenerationError[];
  /** Processing time in milliseconds */
  processingTime: number;
}

/**
 * Template context for rendering
 */
export interface TemplateContext {
  /** Variables available to the template */
  variables: Record<string, any>;
  /** Helper functions */
  helpers: Record<string, Function>;
  /** Partial templates */
  partials: Record<string, string>;
}

/**
 * Unified template engine interface
 */
export interface ITemplateEngine {
  /** Engine type identifier */
  readonly type: TemplateEngine;
  
  /** Render template with context */
  render(template: string, context: TemplateContext): Promise<TemplateResult>;
  
  /** Validate template syntax */
  validate(template: string): Promise<boolean>;
  
  /** Compile template for reuse */
  compile(template: string): Promise<CompiledTemplate>;
}

/**
 * Compiled template interface
 */
export interface CompiledTemplate {
  /** Render with context */
  render(context: TemplateContext): Promise<TemplateResult>;
  
  /** Get required variables */
  getRequiredVariables(): string[];
}

/**
 * Simple string replacement template engine
 */
export class SimpleReplaceEngine implements ITemplateEngine {
  readonly type = TemplateEngine.SIMPLE_REPLACE;

  /**
   * Render template using simple string replacement
   * Variables are replaced using {{variableName}} syntax
   */
  async render(template: string, context: TemplateContext): Promise<TemplateResult> {
    const startTime = Date.now();
    const errors: GenerationError[] = [];

    try {
      let content = template;
      
      // Replace variables
      for (const [key, value] of Object.entries(context.variables)) {
        const placeholder = `{{${key}}}`;
        const stringValue = this.convertToString(value);
        content = content.replace(new RegExp(placeholder, 'g'), stringValue);
      }

      // Check for unreplaced placeholders
      const unreplacedMatches = content.match(/{{[^}]+}}/g);
      if (unreplacedMatches) {
        for (const match of unreplacedMatches) {
          errors.push({
            type: GenerationErrorType.TEMPLATE_ERROR,
            message: `Unreplaced template variable: ${match}`,
            code: 'UNREPLACED_VARIABLE',
            context: 'Template rendering'
          });
        }
      }

      return {
        success: errors.length === 0,
        content: errors.length === 0 ? content : undefined,
        errors,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      errors.push({
        type: GenerationErrorType.TEMPLATE_ERROR,
        message: error instanceof Error ? error.message : 'Template rendering failed',
        code: 'RENDER_ERROR',
        context: 'SimpleReplaceEngine.render'
      });

      return {
        success: false,
        errors,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Validate template syntax
   */
  async validate(template: string): Promise<boolean> {
    try {
      // Check for balanced braces
      const openBraces = (template.match(/{{/g) || []).length;
      const closeBraces = (template.match(/}}/g) || []).length;
      
      return openBraces === closeBraces;
    } catch {
      return false;
    }
  }

  /**
   * Compile template for reuse
   */
  async compile(template: string): Promise<CompiledTemplate> {
    const requiredVariables = this.extractVariables(template);
    
    return {
      render: async (context: TemplateContext) => this.render(template, context),
      getRequiredVariables: () => requiredVariables
    };
  }

  /**
   * Extract variable names from template
   */
  private extractVariables(template: string): string[] {
    const matches = template.match(/{{([^}]+)}}/g) || [];
    return matches.map(match => match.replace(/[{}]/g, '').trim());
  }

  /**
   * Convert value to string representation
   */
  private convertToString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
}

/**
 * Template engine factory
 */
export class TemplateEngineFactory {
  private static engines: Map<TemplateEngine, ITemplateEngine> = new Map();

  /**
   * Get template engine instance
   */
  static getEngine(type: TemplateEngine): ITemplateEngine {
    if (!this.engines.has(type)) {
      this.engines.set(type, this.createEngine(type));
    }
    return this.engines.get(type)!;
  }

  /**
   * Create template engine instance
   */
  private static createEngine(type: TemplateEngine): ITemplateEngine {
    switch (type) {
      case TemplateEngine.SIMPLE_REPLACE:
        return new SimpleReplaceEngine();
      case TemplateEngine.HANDLEBARS:
        // TODO: Implement Handlebars engine when needed
        throw new Error('Handlebars engine not yet implemented');
      case TemplateEngine.MUSTACHE:
        // TODO: Implement Mustache engine when needed
        throw new Error('Mustache engine not yet implemented');
      default:
        throw new Error(`Unsupported template engine: ${type}`);
    }
  }
}

/**
 * Template manager for handling template configurations
 */
export class TemplateManager {
  private templates: Map<string, TemplateConfig> = new Map();
  private compiledTemplates: Map<string, CompiledTemplate> = new Map();

  /**
   * Register a template configuration
   */
  registerTemplate(config: TemplateConfig): void {
    this.templates.set(config.name, config);
  }

  /**
   * Get template configuration
   */
  getTemplate(name: string): TemplateConfig | undefined {
    return this.templates.get(name);
  }

  /**
   * Render template with context
   */
  async renderTemplate(
    templateName: string,
    context: TemplateContext
  ): Promise<TemplateResult> {
    const config = this.templates.get(templateName);
    if (!config) {
      return {
        success: false,
        errors: [{
          type: GenerationErrorType.TEMPLATE_ERROR,
          message: `Template not found: ${templateName}`,
          code: 'TEMPLATE_NOT_FOUND',
          context: 'TemplateManager.renderTemplate'
        }],
        processingTime: 0
      };
    }

    // Validate required variables
    const validationErrors = this.validateContext(config, context);
    if (validationErrors.length > 0) {
      return {
        success: false,
        errors: validationErrors,
        processingTime: 0
      };
    }

    const engine = TemplateEngineFactory.getEngine(config.engine);
    return engine.render(config.template, context);
  }

  /**
   * Compile and cache template
   */
  async compileTemplate(templateName: string): Promise<CompiledTemplate | null> {
    if (this.compiledTemplates.has(templateName)) {
      return this.compiledTemplates.get(templateName)!;
    }

    const config = this.templates.get(templateName);
    if (!config) {
      return null;
    }

    const engine = TemplateEngineFactory.getEngine(config.engine);
    const compiled = await engine.compile(config.template);
    this.compiledTemplates.set(templateName, compiled);
    
    return compiled;
  }

  /**
   * Validate template context against configuration
   */
  private validateContext(
    config: TemplateConfig,
    context: TemplateContext
  ): GenerationError[] {
    const errors: GenerationError[] = [];

    for (const [varName, varConfig] of Object.entries(config.variables)) {
      if (varConfig.required && !(varName in context.variables)) {
        errors.push({
          type: GenerationErrorType.VALIDATION_ERROR,
          message: `Required template variable missing: ${varName}`,
          code: 'MISSING_REQUIRED_VARIABLE',
          context: `Template: ${config.name}`
        });
      }

      if (varName in context.variables) {
        const value = context.variables[varName];
        const expectedType = varConfig.type;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (actualType !== expectedType) {
          errors.push({
            type: GenerationErrorType.VALIDATION_ERROR,
            message: `Template variable type mismatch: ${varName} expected ${expectedType}, got ${actualType}`,
            code: 'VARIABLE_TYPE_MISMATCH',
            context: `Template: ${config.name}`
          });
        }
      }
    }

    return errors;
  }

  /**
   * Get all registered template names
   */
  getTemplateNames(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Clear all templates and compiled cache
   */
  clear(): void {
    this.templates.clear();
    this.compiledTemplates.clear();
  }
}
