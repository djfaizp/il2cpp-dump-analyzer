# Class Wrapper Generation Examples

The `generate_class_wrapper` tool creates C# wrapper classes from IL2CPP class definitions with full type fidelity and Unity integration. This guide provides comprehensive examples for different scenarios.

## Basic Usage

### Simple Class Wrapper

Generate a basic wrapper for a simple class:

```typescript
generate_class_wrapper({
  class_name: "Player"
})
```

**Expected Output:**
```csharp
using System;
using UnityEngine;

/// <summary>
/// Player class wrapper
/// Generated from IL2CPP dump
/// </summary>
public class Player : MonoBehaviour
{
    /// <summary>
    /// Player health value
    /// </summary>
    [SerializeField]
    private float health;
    
    /// <summary>
    /// Player movement speed
    /// </summary>
    [SerializeField]
    private float speed;
    
    /// <summary>
    /// Player name identifier
    /// </summary>
    public string playerName;
}
```

### Advanced Class Wrapper with Custom Options

Generate a wrapper with custom configuration:

```typescript
generate_class_wrapper({
  class_name: "PlayerController",
  include_documentation: true,
  include_unity_attributes: true,
  include_serialization: true,
  custom_namespace: "Game.Characters",
  unity_version: "2022.3.0",
  additional_usings: [
    "System.Collections.Generic",
    "UnityEngine.AI",
    "Game.Interfaces"
  ]
})
```

**Expected Output:**
```csharp
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;
using Game.Interfaces;

namespace Game.Characters
{
    /// <summary>
    /// PlayerController class wrapper
    /// Generated from IL2CPP dump
    /// Unity Version: 2022.3.0
    /// </summary>
    public class PlayerController : MonoBehaviour, IMovable, IControllable
    {
        /// <summary>
        /// Navigation mesh agent for pathfinding
        /// </summary>
        [SerializeField]
        [RequireComponent(typeof(NavMeshAgent))]
        private NavMeshAgent navAgent;
        
        /// <summary>
        /// List of available weapons
        /// </summary>
        [SerializeField]
        private List<Weapon> weapons;
        
        /// <summary>
        /// Current player state
        /// </summary>
        public PlayerState currentState;
    }
}
```

## Complex Scenarios

### Inheritance Hierarchy

For classes with complex inheritance:

```typescript
generate_class_wrapper({
  class_name: "EnemyAI",
  include_documentation: true,
  unity_version: "2021.3.0"
})
```

**Expected Output:**
```csharp
using System;
using UnityEngine;
using UnityEngine.AI;

/// <summary>
/// EnemyAI class wrapper
/// Inherits from: BaseAI -> MonoBehaviour
/// </summary>
public class EnemyAI : BaseAI
{
    /// <summary>
    /// Target player reference
    /// </summary>
    [SerializeField]
    private Transform target;
    
    /// <summary>
    /// AI behavior state machine
    /// </summary>
    [SerializeField]
    private AIStateMachine stateMachine;
    
    /// <summary>
    /// Detection range for player
    /// </summary>
    [Range(1f, 50f)]
    public float detectionRange = 10f;
}
```

### Generic Classes

For generic class definitions:

```typescript
generate_class_wrapper({
  class_name: "ObjectPool",
  include_documentation: true,
  custom_namespace: "Game.Systems"
})
```

**Expected Output:**
```csharp
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Game.Systems
{
    /// <summary>
    /// ObjectPool<T> class wrapper
    /// Generic object pooling system
    /// </summary>
    public class ObjectPool<T> : MonoBehaviour where T : Component
    {
        /// <summary>
        /// Pool of available objects
        /// </summary>
        [SerializeField]
        private Queue<T> pool;
        
        /// <summary>
        /// Prefab to instantiate
        /// </summary>
        [SerializeField]
        private T prefab;
        
        /// <summary>
        /// Maximum pool size
        /// </summary>
        public int maxSize = 100;
    }
}
```

## Unity-Specific Features

### SerializeField Attributes

The generator automatically adds appropriate Unity attributes:

```csharp
// Private fields get SerializeField
[SerializeField]
private float health;

// Public fields remain public
public string playerName;

// Unity component references
[SerializeField]
[RequireComponent(typeof(Rigidbody))]
private Rigidbody rb;
```

### Unity Version Compatibility

Different Unity versions support different features:

```typescript
// Unity 2019.4 LTS
generate_class_wrapper({
  class_name: "Player",
  unity_version: "2019.4.0"
})

// Unity 2022.3 LTS (includes newer attributes)
generate_class_wrapper({
  class_name: "Player",
  unity_version: "2022.3.0"
})
```

## Error Handling

### Class Not Found

```json
{
  "success": false,
  "errors": ["Class 'NonExistentClass' not found in IL2CPP dump"],
  "suggestions": ["Check class name spelling", "Verify class exists in dump file"]
}
```

### Invalid Configuration

```json
{
  "success": false,
  "errors": ["Invalid Unity version format"],
  "warnings": ["Using default Unity version 2021.3.0"]
}
```

## Best Practices

### 1. Namespace Organization
```typescript
generate_class_wrapper({
  class_name: "Player",
  custom_namespace: "Game.Characters.Player"
})
```

### 2. Unity Version Targeting
```typescript
generate_class_wrapper({
  class_name: "Player",
  unity_version: "2022.3.0"  // Match your project version
})
```

### 3. Documentation Inclusion
```typescript
generate_class_wrapper({
  class_name: "Player",
  include_documentation: true  // Always recommended
})
```

### 4. Additional Dependencies
```typescript
generate_class_wrapper({
  class_name: "Player",
  additional_usings: [
    "System.Collections.Generic",
    "UnityEngine.AI",
    "MyProject.Interfaces"
  ]
})
```

## Common Use Cases

1. **Game Reverse Engineering**: Understand game class structures
2. **Modding Support**: Create wrapper classes for game modification
3. **Unity Migration**: Convert IL2CPP back to Unity scripts
4. **API Documentation**: Generate documented interfaces
5. **Code Study**: Learn from existing implementations

## Troubleshooting

- **Missing Types**: Ensure all dependencies are in the IL2CPP dump
- **Compilation Errors**: Check Unity version compatibility
- **Namespace Conflicts**: Use custom namespaces to avoid conflicts
- **Attribute Issues**: Verify Unity version supports required attributes
