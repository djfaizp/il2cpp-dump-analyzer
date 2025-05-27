import { IL2CPPDelegate, IL2CPPMethod, IL2CPPParameter, ClassInfo } from './enhanced-types';

/**
 * Parser for IL2CPP delegate types
 * Handles delegates that inherit from MulticastDelegate or Delegate
 */
export class DelegateParser {

  /**
   * Parse a delegate from class declaration and body
   */
  public parseDelegate(classInfo: ClassInfo): IL2CPPDelegate | null {
    // 1. Verify inheritance from MulticastDelegate or Delegate
    if (!this.isDelegateType(classInfo.inheritance)) {
      return null;
    }

    // 2. Extract delegate name and parent class
    const { name, parentClass } = this.parseDelegateName(classInfo.name);

    // 3. Parse the Invoke method to get signature
    const invokeMethod = this.parseInvokeMethod(classInfo.body);
    if (!invokeMethod) {
      return null;
    }

    // 4. Parse constructor and async methods
    const constructorMethod = this.parseConstructorMethod(classInfo.body);
    const beginInvokeMethod = this.parseBeginInvokeMethod(classInfo.body);
    const endInvokeMethod = this.parseEndInvokeMethod(classInfo.body);

    if (!constructorMethod) {
      return null;
    }

    return {
      name,
      namespace: this.extractNamespace(classInfo.declaration),
      fullName: classInfo.name,
      typeDefIndex: classInfo.typeDefIndex,
      isNested: !!parentClass,
      parentType: parentClass,
      isCompilerGenerated: this.isCompilerGenerated(classInfo.attributes),
      accessModifier: classInfo.accessModifier as any,
      attributes: classInfo.attributes,
      returnType: invokeMethod.returnType,
      parameters: invokeMethod.parameters,
      isMulticast: classInfo.inheritance.includes('MulticastDelegate'),
      invokeMethod,
      constructorMethod,
      beginInvokeMethod: beginInvokeMethod || undefined,
      endInvokeMethod: endInvokeMethod || undefined
    };
  }

  /**
   * Check if the inheritance indicates a delegate type
   */
  private isDelegateType(inheritance: string): boolean {
    return inheritance.includes('MulticastDelegate') ||
           inheritance.includes('Delegate');
  }

  /**
   * Parse delegate name and extract parent class if nested
   */
  private parseDelegateName(fullName: string): { name: string; parentClass?: string } {
    // Handle nested delegates like "EventMgr.OnGesture"
    const dotIndex = fullName.lastIndexOf('.');

    if (dotIndex > 0) {
      return {
        name: fullName.substring(dotIndex + 1),
        parentClass: fullName.substring(0, dotIndex)
      };
    }

    return { name: fullName };
  }

  /**
   * Parse the Invoke method which defines the delegate signature
   */
  private parseInvokeMethod(classBody: string): IL2CPPMethod | null {
    const lines = classBody.split('\n');

    // Look for the Invoke method
    const invokeRegex = /^\s*(?:\/\/[^\n]*\n)?\s*public\s+virtual\s+([^\s]+)\s+Invoke\s*\(([^)]*)\)\s*\{\s*\}(?:\s*\/\/.*)?$/m;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.includes('public virtual') && line.includes('Invoke(')) {
        // Extract method signature
        const match = line.match(/public\s+virtual\s+([^\s]+)\s+Invoke\s*\(([^)]*)\)/);
        if (match) {
          const returnType = match[1];
          const parametersStr = match[2];

          // Parse parameters
          const parameters = this.parseParameters(parametersStr);

          // Extract RVA and offset from previous line if available
          let rva = '';
          let offset = '';
          let slot = '';

          if (i > 0) {
            const prevLine = lines[i - 1].trim();
            const rvaMatch = prevLine.match(/RVA:\s*(0x[0-9A-F]+)\s+Offset:\s*(0x[0-9A-F]+)(?:\s+VA:\s*0x[0-9A-F]+)?(?:\s+Slot:\s*(\d+))?/);
            if (rvaMatch) {
              rva = rvaMatch[1];
              offset = rvaMatch[2];
              slot = rvaMatch[3] || '';
            }
          }

          return {
            name: 'Invoke',
            returnType,
            parameters,
            isPublic: true,
            isStatic: false,
            isVirtual: true,
            isAbstract: false,
            isOverride: false,
            attributes: [],
            rva,
            offset,
            slot: slot ? parseInt(slot, 10) : undefined
          };
        }
      }
    }

    return null;
  }

  /**
   * Parse the constructor method
   */
  private parseConstructorMethod(classBody: string): IL2CPPMethod | null {
    const lines = classBody.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.includes('public void .ctor(object object, IntPtr method)')) {
        // Extract RVA and offset from previous line if available
        let rva = '';
        let offset = '';

        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          const rvaMatch = prevLine.match(/RVA:\s*(0x[0-9A-F]+)\s+Offset:\s*(0x[0-9A-F]+)/);
          if (rvaMatch) {
            rva = rvaMatch[1];
            offset = rvaMatch[2];
          }
        }

        return {
          name: '.ctor',
          returnType: 'void',
          parameters: [
            { name: 'object', type: 'object' },
            { name: 'method', type: 'IntPtr' }
          ],
          isPublic: true,
          isStatic: false,
          isVirtual: false,
          isAbstract: false,
          isOverride: false,
          attributes: [],
          rva,
          offset
        };
      }
    }

    return null;
  }

  /**
   * Parse the BeginInvoke method
   */
  private parseBeginInvokeMethod(classBody: string): IL2CPPMethod | null {
    const lines = classBody.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.includes('public virtual IAsyncResult BeginInvoke(')) {
        const match = line.match(/public\s+virtual\s+IAsyncResult\s+BeginInvoke\s*\(([^)]*)\)/);
        if (match) {
          const parametersStr = match[1];
          const parameters = this.parseParameters(parametersStr);

          // Extract RVA and offset
          let rva = '';
          let offset = '';
          let slot = '';

          if (i > 0) {
            const prevLine = lines[i - 1].trim();
            const rvaMatch = prevLine.match(/RVA:\s*(0x[0-9A-F]+)\s+Offset:\s*(0x[0-9A-F]+)(?:\s+VA:\s*0x[0-9A-F]+)?(?:\s+Slot:\s*(\d+))?/);
            if (rvaMatch) {
              rva = rvaMatch[1];
              offset = rvaMatch[2];
              slot = rvaMatch[3] || '';
            }
          }

          return {
            name: 'BeginInvoke',
            returnType: 'IAsyncResult',
            parameters,
            isPublic: true,
            isStatic: false,
            isVirtual: true,
            isAbstract: false,
            isOverride: false,
            attributes: [],
            rva,
            offset,
            slot: slot ? parseInt(slot, 10) : undefined
          };
        }
      }
    }

    return null;
  }

  /**
   * Parse the EndInvoke method
   */
  private parseEndInvokeMethod(classBody: string): IL2CPPMethod | null {
    const lines = classBody.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.includes('public virtual void EndInvoke(IAsyncResult result)')) {
        // Extract RVA and offset
        let rva = '';
        let offset = '';
        let slot = '';

        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          const rvaMatch = prevLine.match(/RVA:\s*(0x[0-9A-F]+)\s+Offset:\s*(0x[0-9A-F]+)(?:\s+VA:\s*0x[0-9A-F]+)?(?:\s+Slot:\s*(\d+))?/);
          if (rvaMatch) {
            rva = rvaMatch[1];
            offset = rvaMatch[2];
            slot = rvaMatch[3] || '';
          }
        }

        return {
          name: 'EndInvoke',
          returnType: 'void',
          parameters: [{ name: 'result', type: 'IAsyncResult' }],
          isPublic: true,
          isStatic: false,
          isVirtual: true,
          isAbstract: false,
          isOverride: false,
          attributes: [],
          rva,
          offset,
          slot: slot ? parseInt(slot, 10) : undefined
        };
      }
    }

    return null;
  }

  /**
   * Parse method parameters from parameter string
   */
  private parseParameters(parametersStr: string): IL2CPPParameter[] {
    if (!parametersStr || parametersStr.trim() === '') {
      return [];
    }

    const parameters: IL2CPPParameter[] = [];
    const paramParts = parametersStr.split(',');

    for (const part of paramParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Split by last space to separate type and name
      const lastSpaceIndex = trimmed.lastIndexOf(' ');
      if (lastSpaceIndex !== -1) {
        const type = trimmed.substring(0, lastSpaceIndex).trim();
        const name = trimmed.substring(lastSpaceIndex + 1).trim();
        parameters.push({
          type,
          name,
          isGeneric: this.isGenericType(type)
        });
      }
    }

    return parameters;
  }

  /**
   * Check if a type is generic (contains < and >)
   */
  private isGenericType(type: string): boolean {
    return type.includes('<') && type.includes('>');
  }

  /**
   * Extract namespace from declaration
   */
  private extractNamespace(declaration: string): string {
    // For now, return empty string as namespace is tracked separately
    return '';
  }

  /**
   * Check if the type is compiler generated
   */
  private isCompilerGenerated(attributes: string[]): boolean {
    return attributes.some(attr => attr.includes('CompilerGenerated'));
  }
}