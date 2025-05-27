# MonoBehaviour Template Generation Examples

The `generate_monobehaviour_template` tool creates Unity-ready MonoBehaviour scripts with proper lifecycle methods, serialization, and Unity-specific features. This guide provides comprehensive examples for different scenarios.

## Basic Usage

### Simple MonoBehaviour Template

Generate a basic MonoBehaviour template:

```typescript
generate_monobehaviour_template({
  class_name: "PlayerController"
})
```

**Expected Output:**
```csharp
using System;
using UnityEngine;

/// <summary>
/// PlayerController MonoBehaviour template
/// Generated from IL2CPP dump
/// </summary>
public class PlayerController : MonoBehaviour
{
    #region Serialized Fields
    
    /// <summary>
    /// Player movement speed
    /// </summary>
    [SerializeField]
    private float moveSpeed = 5f;
    
    /// <summary>
    /// Player health value
    /// </summary>
    [SerializeField]
    private float health = 100f;
    
    #endregion
    
    #region Unity Lifecycle
    
    /// <summary>
    /// Called before the first frame update
    /// </summary>
    private void Start()
    {
        // TODO: Initialize PlayerController
    }
    
    /// <summary>
    /// Called once per frame
    /// </summary>
    private void Update()
    {
        // TODO: Update PlayerController logic
    }
    
    /// <summary>
    /// Called when the object becomes enabled and active
    /// </summary>
    private void OnEnable()
    {
        // TODO: Setup event listeners and initialization
    }
    
    /// <summary>
    /// Called when the object becomes disabled or inactive
    /// </summary>
    private void OnDisable()
    {
        // TODO: Cleanup event listeners and resources
    }
    
    #endregion
}
```

### Advanced MonoBehaviour with Custom Configuration

```typescript
generate_monobehaviour_template({
  class_name: "EnemyAI",
  include_documentation: true,
  include_unity_attributes: true,
  include_serialization: true,
  custom_namespace: "Game.Enemies",
  unity_version: "2022.3.0",
  additional_usings: [
    "UnityEngine.AI",
    "System.Collections",
    "Game.Interfaces"
  ]
})
```

**Expected Output:**
```csharp
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.AI;
using Game.Interfaces;

namespace Game.Enemies
{
    /// <summary>
    /// EnemyAI MonoBehaviour template
    /// Generated from IL2CPP dump
    /// Unity Version: 2022.3.0
    /// </summary>
    [RequireComponent(typeof(NavMeshAgent))]
    public class EnemyAI : MonoBehaviour, IEnemy, IDamageable
    {
        #region Serialized Fields
        
        /// <summary>
        /// Navigation mesh agent for pathfinding
        /// </summary>
        [SerializeField]
        [Tooltip("AI navigation component")]
        private NavMeshAgent navAgent;
        
        /// <summary>
        /// Target player transform
        /// </summary>
        [SerializeField]
        [Tooltip("Player target to follow")]
        private Transform target;
        
        /// <summary>
        /// AI detection range
        /// </summary>
        [SerializeField]
        [Range(1f, 50f)]
        [Tooltip("Range for detecting player")]
        private float detectionRange = 10f;
        
        /// <summary>
        /// Enemy health points
        /// </summary>
        [SerializeField]
        [Min(0f)]
        private float health = 100f;
        
        #endregion
        
        #region Public Properties
        
        /// <summary>
        /// Current AI state
        /// </summary>
        public AIState CurrentState { get; private set; }
        
        /// <summary>
        /// Is enemy alive
        /// </summary>
        public bool IsAlive => health > 0f;
        
        #endregion
        
        #region Unity Lifecycle
        
        /// <summary>
        /// Called when the script instance is being loaded
        /// </summary>
        private void Awake()
        {
            // TODO: Initialize components and references
            navAgent = GetComponent<NavMeshAgent>();
        }
        
        /// <summary>
        /// Called before the first frame update
        /// </summary>
        private void Start()
        {
            // TODO: Initialize EnemyAI
            CurrentState = AIState.Idle;
        }
        
        /// <summary>
        /// Called once per frame
        /// </summary>
        private void Update()
        {
            // TODO: Update AI logic
            UpdateAI();
        }
        
        /// <summary>
        /// Called at fixed intervals for physics
        /// </summary>
        private void FixedUpdate()
        {
            // TODO: Physics-based AI updates
        }
        
        /// <summary>
        /// Called when the object becomes enabled and active
        /// </summary>
        private void OnEnable()
        {
            // TODO: Subscribe to events and enable AI
        }
        
        /// <summary>
        /// Called when the object becomes disabled or inactive
        /// </summary>
        private void OnDisable()
        {
            // TODO: Unsubscribe from events and disable AI
        }
        
        /// <summary>
        /// Called when the MonoBehaviour will be destroyed
        /// </summary>
        private void OnDestroy()
        {
            // TODO: Cleanup resources and references
        }
        
        #endregion
        
        #region Private Methods
        
        /// <summary>
        /// Update AI behavior based on current state
        /// </summary>
        private void UpdateAI()
        {
            // TODO: Implement AI state machine logic
        }
        
        #endregion
        
        #region Unity Events
        
        /// <summary>
        /// Called when a collider enters the trigger
        /// </summary>
        /// <param name="other">The collider that entered</param>
        private void OnTriggerEnter(Collider other)
        {
            // TODO: Handle trigger enter events
        }
        
        /// <summary>
        /// Called when a collider exits the trigger
        /// </summary>
        /// <param name="other">The collider that exited</param>
        private void OnTriggerExit(Collider other)
        {
            // TODO: Handle trigger exit events
        }
        
        #endregion
    }
}
```

## Unity-Specific Features

### SerializeField Attributes

The generator automatically adds appropriate Unity serialization:

```csharp
#region Serialized Fields

/// <summary>
/// Movement speed of the character
/// </summary>
[SerializeField]
[Range(0f, 20f)]
[Tooltip("How fast the character moves")]
private float moveSpeed = 5f;

/// <summary>
/// Character health points
/// </summary>
[SerializeField]
[Min(0f)]
private float health = 100f;

/// <summary>
/// Audio source for sound effects
/// </summary>
[SerializeField]
[RequireComponent(typeof(AudioSource))]
private AudioSource audioSource;

#endregion
```

### Unity Lifecycle Methods

Complete lifecycle method integration with proper execution order:

```csharp
#region Unity Lifecycle

// Execution Order: -100
private void Awake() { }

// Execution Order: 0
private void Start() { }

// Execution Order: 0 (every frame)
private void Update() { }

// Execution Order: 0 (fixed timestep)
private void FixedUpdate() { }

// Execution Order: 0 (after Update)
private void LateUpdate() { }

// Event-based
private void OnEnable() { }
private void OnDisable() { }
private void OnDestroy() { }

#endregion
```

### Unity Version Compatibility

Different Unity versions support different features:

```typescript
// Unity 2019.4 LTS
generate_monobehaviour_template({
  class_name: "Player",
  unity_version: "2019.4.0"
})

// Unity 2022.3 LTS (includes newer attributes and features)
generate_monobehaviour_template({
  class_name: "Player",
  unity_version: "2022.3.0"
})
```

## Component-Specific Templates

### UI Controller

```typescript
generate_monobehaviour_template({
  class_name: "UIController",
  custom_namespace: "Game.UI",
  additional_usings: ["UnityEngine.UI", "TMPro"]
})
```

**Output includes UI-specific features:**
```csharp
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace Game.UI
{
    public class UIController : MonoBehaviour
    {
        #region UI Components
        
        [SerializeField]
        private Button startButton;
        
        [SerializeField]
        private TextMeshProUGUI scoreText;
        
        [SerializeField]
        private Slider healthSlider;
        
        #endregion
    }
}
```

### Physics Controller

```typescript
generate_monobehaviour_template({
  class_name: "PhysicsController",
  additional_usings: ["UnityEngine.Physics"]
})
```

**Output includes physics-specific features:**
```csharp
[RequireComponent(typeof(Rigidbody))]
public class PhysicsController : MonoBehaviour
{
    #region Physics Components
    
    [SerializeField]
    private Rigidbody rb;
    
    [SerializeField]
    private Collider col;
    
    #endregion
    
    #region Physics Events
    
    private void OnCollisionEnter(Collision collision)
    {
        // TODO: Handle collision events
    }
    
    private void OnTriggerEnter(Collider other)
    {
        // TODO: Handle trigger events
    }
    
    #endregion
}
```

## Advanced Patterns

### State Machine Integration

```csharp
public class StateMachineController : MonoBehaviour
{
    #region State Machine
    
    /// <summary>
    /// Current state of the state machine
    /// </summary>
    public IState CurrentState { get; private set; }
    
    /// <summary>
    /// Available states dictionary
    /// </summary>
    private Dictionary<StateType, IState> states;
    
    #endregion
    
    #region State Management
    
    /// <summary>
    /// Change to a new state
    /// </summary>
    /// <param name="newStateType">Type of state to change to</param>
    public void ChangeState(StateType newStateType)
    {
        // TODO: Implement state transition logic
    }
    
    #endregion
}
```

### Event System Integration

```csharp
public class EventController : MonoBehaviour
{
    #region Unity Events
    
    /// <summary>
    /// Event triggered when player dies
    /// </summary>
    [SerializeField]
    private UnityEvent OnPlayerDeath;
    
    /// <summary>
    /// Event triggered when level completes
    /// </summary>
    [SerializeField]
    private UnityEvent<int> OnLevelComplete;
    
    #endregion
}
```

## Response Format

```json
{
  "success": true,
  "generatedCode": "// Generated MonoBehaviour template...",
  "metadata": {
    "className": "EnemyController",
    "namespace": "Game.Enemies",
    "generationType": "monobehaviour_template",
    "isMonoBehaviour": true,
    "baseClass": "MonoBehaviour",
    "includeDocumentation": true,
    "includeUnityAttributes": true,
    "includeSerialization": true,
    "unityVersion": "2022.3.0",
    "codeStats": {
      "totalLines": 120,
      "methodCount": 8,
      "fieldCount": 5,
      "lifecycleMethodCount": 6
    },
    "timestamp": "2024-01-16T10:30:00.000Z"
  },
  "errors": [],
  "warnings": []
}
```

## Best Practices

### 1. Organize Code Sections
```csharp
#region Serialized Fields
// Private serialized fields
#endregion

#region Public Properties
// Public properties and accessors
#endregion

#region Unity Lifecycle
// Unity lifecycle methods
#endregion

#region Private Methods
// Private implementation methods
#endregion
```

### 2. Use Appropriate Attributes
```csharp
[SerializeField]
[Range(0f, 100f)]
[Tooltip("Player health value")]
private float health = 100f;
```

### 3. Include Component Requirements
```csharp
[RequireComponent(typeof(Rigidbody))]
[RequireComponent(typeof(Collider))]
public class PhysicsObject : MonoBehaviour
```

### 4. Unity Version Targeting
```typescript
generate_monobehaviour_template({
  class_name: "Player",
  unity_version: "2022.3.0"  // Match your project version
})
```

## Common Use Cases

1. **Component Recreation**: Rebuild MonoBehaviour components from IL2CPP dumps
2. **Unity Migration**: Convert IL2CPP code back to Unity-compatible scripts
3. **Game Analysis**: Understand Unity game component architecture
4. **Modding Support**: Create component templates for game modification
5. **Educational**: Learn Unity component patterns from existing games

## Troubleshooting

- **Not a MonoBehaviour**: Ensure the target class inherits from MonoBehaviour
- **Missing Unity Methods**: Check Unity version compatibility
- **Serialization Issues**: Verify fields are properly marked as serializable
- **Component Dependencies**: Ensure required components are available
