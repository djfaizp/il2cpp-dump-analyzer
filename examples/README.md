# IL2CPP Dump Analyzer Code Generation Examples

This directory contains comprehensive examples demonstrating the code generation capabilities of the IL2CPP Dump Analyzer MCP system. These examples show how to use the three code generation tools to create C# code from IL2CPP dump files.

## Available Examples

### 1. [Class Wrapper Generation](class-wrapper-example.md)
Learn how to generate C# wrapper classes from IL2CPP class definitions with full type fidelity and Unity integration.

**Key Features:**
- Complete class structure preservation
- Unity attribute handling
- Inheritance and interface implementation
- Custom namespace support
- XML documentation generation

### 2. [Method Stub Generation](method-stubs-example.md)
Generate method stubs with proper signatures and basic implementation from IL2CPP method definitions.

**Key Features:**
- Method signature preservation
- Parameter and return type handling
- Error handling integration
- Async/await pattern support
- Method filtering with regex patterns

### 3. [MonoBehaviour Template Generation](monobehaviour-template-example.md)
Create Unity-ready MonoBehaviour scripts with proper lifecycle methods and serialization.

**Key Features:**
- Unity lifecycle method integration
- SerializeField attribute handling
- Unity version compatibility
- Component-specific optimizations
- Inspector-friendly field organization

## Quick Start

To use these examples with your IL2CPP dump file:

1. **Ensure your MCP server is running:**
   ```bash
   npm start
   ```

2. **Connect with an MCP client** (e.g., Claude Desktop)

3. **Use the generation tools** with the examples as reference:
   ```typescript
   // Example: Generate a class wrapper
   generate_class_wrapper({
     class_name: "YourClassName",
     include_documentation: true,
     unity_version: "2022.3.0"
   })
   ```

## Common Use Cases

### Game Development
- **Reverse Engineering**: Understand game mechanics by generating readable C# code
- **Modding Support**: Create wrapper classes for game modification
- **API Documentation**: Generate documented interfaces for game systems

### Unity Development
- **Component Recreation**: Rebuild MonoBehaviour components from IL2CPP dumps
- **System Analysis**: Understand Unity game architecture and patterns
- **Code Migration**: Convert IL2CPP code back to Unity-compatible scripts

### Educational Purposes
- **Code Study**: Learn from existing Unity game implementations
- **Pattern Recognition**: Identify design patterns in commercial games
- **Architecture Analysis**: Understand large-scale Unity project structures

## Best Practices

### 1. Class Selection
- Choose classes with complete metadata for best results
- Verify inheritance chains are properly represented
- Check for Unity-specific attributes and components

### 2. Generation Options
- Use appropriate Unity version for target compatibility
- Include documentation for better code understanding
- Apply custom namespaces for organization

### 3. Code Review
- Always review generated code before use
- Verify type mappings and dependencies
- Test generated MonoBehaviour components in Unity

### 4. Troubleshooting
- Check IL2CPP dump completeness if generation fails
- Verify class names match exactly (case-sensitive)
- Ensure required dependencies are available

## File Organization

```
examples/
├── README.md                           # This overview file
├── class-wrapper-example.md           # Class wrapper generation examples
├── method-stubs-example.md            # Method stub generation examples
└── monobehaviour-template-example.md  # MonoBehaviour template examples
```

## Contributing Examples

To contribute new examples:

1. Follow the existing example format
2. Include both simple and complex scenarios
3. Provide clear explanations and use cases
4. Test examples with real IL2CPP dump files
5. Document any limitations or requirements

## Support

For questions about code generation or examples:
- Review the main [README.md](../README.md) for setup instructions
- Check [MCP-README.md](../MCP-README.md) for detailed tool documentation
- Open an issue on the GitHub repository for specific problems

---

**Note**: These examples are based on common IL2CPP dump patterns. Your specific dump file may have different structures or naming conventions. Adjust the examples accordingly for your use case.
