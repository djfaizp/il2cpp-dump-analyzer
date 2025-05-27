import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { IL2CPPClass, IL2CPPEnum, IL2CPPInterface, IL2CPPMethod } from '../parser/enhanced-types';

/**
 * Specialized chunker for IL2CPP code that preserves semantic meaning
 * Enhanced with IL2CPP-specific optimizations for better RAG performance
 */
export class IL2CPPCodeChunker {
  private splitter: RecursiveCharacterTextSplitter;
  private methodSplitter: RecursiveCharacterTextSplitter;

  constructor(
    private readonly chunkSize: number = 1000,
    private readonly chunkOverlap: number = 200,
    private readonly methodChunkSize: number = 500,
    private readonly methodChunkOverlap: number = 100
  ) {
    // Initialize the text splitter with C# specific separators for classes
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      separators: [
        // Class level separators
        "\n\n", "\n", " ", "",
        // Method level separators
        "{", "}", "(", ")", ";",
      ]
    });

    // Specialized splitter for methods with smaller chunk size
    this.methodSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.methodChunkSize,
      chunkOverlap: this.methodChunkOverlap,
      separators: [
        // Method level separators
        "\n", ";", "{", "}", "(", ")", ",", " ", ""
      ]
    });
  }

  /**
   * Create chunks from a class definition
   * @param classEntity IL2CPP class entity
   * @returns Array of chunks with metadata
   */
  public async chunkClass(classEntity: IL2CPPClass): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    // Create a chunk for the class definition
    const classDefinition = this.formatClassDefinition(classEntity);
    const classChunks = await this.splitter.createDocuments([classDefinition]);

    for (const chunk of classChunks) {
      chunks.push({
        text: chunk.pageContent,
        metadata: {
          type: 'class',
          name: classEntity.name,
          namespace: classEntity.namespace,
          fullName: classEntity.fullName,
          isMonoBehaviour: classEntity.isMonoBehaviour,
          typeDefIndex: classEntity.typeDefIndex
        }
      });
    }

    // Create chunks for each method
    for (const method of classEntity.methods) {
      const methodChunks = await this.chunkMethod(method, classEntity);
      chunks.push(...methodChunks);
    }

    return chunks;
  }

  /**
   * Create chunks from a method definition
   * @param methodEntity IL2CPP method entity
   * @param parentClass Parent class of the method
   * @returns Array of chunks with metadata
   */
  public async chunkMethod(
    methodEntity: IL2CPPMethod,
    parentClass: IL2CPPClass
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    // Format the method signature with more context
    const methodSignature = this.formatMethodSignature(methodEntity);

    // Add class context to the method for better semantic understanding
    const methodWithContext = `Class: ${parentClass.fullName}\n${methodSignature}`;

    // Create chunks for the method using the specialized method splitter
    const methodChunks = await this.methodSplitter.createDocuments([methodWithContext]);

    for (const chunk of methodChunks) {
      chunks.push({
        text: chunk.pageContent,
        metadata: {
          type: 'method',
          name: methodEntity.name,
          returnType: methodEntity.returnType,
          parentClass: parentClass.name,
          parentNamespace: parentClass.namespace,
          fullName: `${parentClass.fullName}.${methodEntity.name}`,
          isStatic: methodEntity.isStatic,
          isVirtual: methodEntity.isVirtual,
          isOverride: methodEntity.isOverride,
          isAbstract: methodEntity.isAbstract,
          rva: methodEntity.rva,
          offset: methodEntity.offset,
          parameters: methodEntity.parameters.map(p => `${p.type} ${p.name}`).join(', '),
          // Add IL2CPP specific metadata
          typeDefIndex: parentClass.typeDefIndex,
          isMonoBehaviour: parentClass.isMonoBehaviour || false
        }
      });
    }

    return chunks;
  }

  /**
   * Create chunks from an enum definition
   * @param enumEntity IL2CPP enum entity
   * @returns Array of chunks with metadata
   */
  public async chunkEnum(enumEntity: IL2CPPEnum): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    // Format the enum definition
    const enumDefinition = this.formatEnumDefinition(enumEntity);

    // Create chunks for the enum
    const enumChunks = await this.splitter.createDocuments([enumDefinition]);

    for (const chunk of enumChunks) {
      chunks.push({
        text: chunk.pageContent,
        metadata: {
          type: 'enum',
          name: enumEntity.name,
          namespace: enumEntity.namespace,
          fullName: enumEntity.fullName,
          typeDefIndex: enumEntity.typeDefIndex
        }
      });
    }

    return chunks;
  }

  /**
   * Create chunks from an interface definition
   * @param interfaceEntity IL2CPP interface entity
   * @returns Array of chunks with metadata
   */
  public async chunkInterface(interfaceEntity: IL2CPPInterface): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];

    // Format the interface definition
    const interfaceDefinition = this.formatInterfaceDefinition(interfaceEntity);

    // Create chunks for the interface
    const interfaceChunks = await this.splitter.createDocuments([interfaceDefinition]);

    for (const chunk of interfaceChunks) {
      chunks.push({
        text: chunk.pageContent,
        metadata: {
          type: 'interface',
          name: interfaceEntity.name,
          namespace: interfaceEntity.namespace,
          fullName: interfaceEntity.fullName,
          typeDefIndex: interfaceEntity.typeDefIndex
        }
      });
    }

    return chunks;
  }

  // Helper methods to format code entities
  private formatClassDefinition(classEntity: IL2CPPClass): string {
    let definition = '';

    // Add namespace
    if (classEntity.namespace) {
      definition += `namespace ${classEntity.namespace} {\n`;
    }

    // Add class declaration
    definition += `public class ${classEntity.name}`;

    // Add inheritance
    if (classEntity.baseClass || classEntity.interfaces.length > 0) {
      definition += ' : ';
      if (classEntity.baseClass) {
        definition += classEntity.baseClass;
      }

      if (classEntity.baseClass && classEntity.interfaces.length > 0) {
        definition += ', ';
      }

      if (classEntity.interfaces.length > 0) {
        definition += classEntity.interfaces.join(', ');
      }
    }

    definition += ' {\n';

    // Add fields
    for (const field of classEntity.fields) {
      const accessModifier = field.isPublic ? 'public' : 'private';
      const staticModifier = field.isStatic ? 'static ' : '';
      const readonlyModifier = field.isReadOnly ? 'readonly ' : '';

      // Add attributes if present
      const attributes = field.attributes || [];
      if (attributes.length > 0) {
        definition += `  [${attributes.join(', ')}]\n`;
      }

      definition += `  ${accessModifier} ${staticModifier}${readonlyModifier}${field.type} ${field.name};\n`;
    }

    // Add method signatures (not implementations)
    for (const method of classEntity.methods) {
      const accessModifier = method.isPublic ? 'public' : 'private';
      const staticModifier = method.isStatic ? 'static ' : '';
      const virtualModifier = method.isVirtual ? 'virtual ' : '';
      const overrideModifier = method.isOverride ? 'override ' : '';
      const abstractModifier = method.isAbstract ? 'abstract ' : '';

      // Add attributes if present
      const attributes = method.attributes || [];
      if (attributes.length > 0) {
        definition += `  [${attributes.join(', ')}]\n`;
      }

      definition += `  ${accessModifier} ${staticModifier}${virtualModifier}${overrideModifier}${abstractModifier}${method.returnType} ${method.name}(`;

      // Add parameters
      const params = method.parameters.map(p => `${p.type} ${p.name}`).join(', ');
      definition += `${params});\n`;
    }

    // Close class and namespace
    definition += '}\n';
    if (classEntity.namespace) {
      definition += '}\n';
    }

    return definition;
  }

  private formatMethodSignature(methodEntity: IL2CPPMethod): string {
    const accessModifier = methodEntity.isPublic ? 'public' : 'private';
    const staticModifier = methodEntity.isStatic ? 'static ' : '';
    const virtualModifier = methodEntity.isVirtual ? 'virtual ' : '';
    const overrideModifier = methodEntity.isOverride ? 'override ' : '';
    const abstractModifier = methodEntity.isAbstract ? 'abstract ' : '';

    let signature = `${accessModifier} ${staticModifier}${virtualModifier}${overrideModifier}${abstractModifier}${methodEntity.returnType} ${methodEntity.name}(`;

    // Add parameters
    const params = methodEntity.parameters.map(p => `${p.type} ${p.name}`).join(', ');
    signature += `${params})`;

    // Add RVA and offset information
    if (methodEntity.rva || methodEntity.offset) {
      signature += ` // RVA: ${methodEntity.rva}, Offset: ${methodEntity.offset}`;
    }

    return signature;
  }

  private formatEnumDefinition(enumEntity: IL2CPPEnum): string {
    let definition = '';

    // Add namespace
    if (enumEntity.namespace) {
      definition += `namespace ${enumEntity.namespace} {\n`;
    }

    // Add enum declaration
    definition += `public enum ${enumEntity.name} {\n`;

    // Add enum values
    for (const value of enumEntity.values) {
      definition += `  ${value.name} = ${value.value},\n`;
    }

    // Close enum and namespace
    definition += '}\n';
    if (enumEntity.namespace) {
      definition += '}\n';
    }

    return definition;
  }

  private formatInterfaceDefinition(interfaceEntity: IL2CPPInterface): string {
    let definition = '';

    // Add namespace
    if (interfaceEntity.namespace) {
      definition += `namespace ${interfaceEntity.namespace} {\n`;
    }

    // Add interface declaration
    definition += `public interface ${interfaceEntity.name} {\n`;

    // Add method signatures
    for (const method of interfaceEntity.methods) {
      definition += `  ${method.returnType} ${method.name}(`;

      // Add parameters
      const params = method.parameters.map(p => `${p.type} ${p.name}`).join(', ');
      definition += `${params});\n`;
    }

    // Close interface and namespace
    definition += '}\n';
    if (interfaceEntity.namespace) {
      definition += '}\n';
    }

    return definition;
  }
}

/**
 * Represents a chunk of code with metadata
 */
export interface CodeChunk {
  text: string;
  metadata: {
    type: 'class' | 'method' | 'enum' | 'interface';
    name: string;
    namespace?: string;
    fullName: string;
    [key: string]: any;
  };
}
