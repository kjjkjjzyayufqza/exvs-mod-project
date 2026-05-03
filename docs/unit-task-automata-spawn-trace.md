# UnitTask Creation Flow: Complete Trace (Registration → Spawn)

## Overview

EXVS2 uses **two complementary dispatch systems** for UnitTask creation:

1. **Registration Table** (`sub_14097E740`): Creates 0x220-byte metadata records in a global table, indexed by class type ID. Each record stores a factory constructor function pointer at offset 520.
2. **Factory Dispatch** (`sub_14091BC40`): Directly maps class type IDs to factory function pointers at runtime. Called through `sub_140920AF0` (the spawn bridge).

Both are installed into `CAcBattleCore` during construction and used at spawn time.

---

## 1. Registration System

### 1.1 Entry Point: `sub_14097E740` — The Grand Dispatcher

**Signature**: `_QWORD* sub_14097E740(__int64 battleCore, __int64 classTypeId)`

This is a **5825-line, 682-case switch** function that maps every known UnitTask class type ID to its registration function. It handles:

- **COMMON classes** (small IDs 1–118): e.g., `case 100 → sub_140921530` (FreeFall registration)
- **Unit-specific classes** (compound IDs like 510050102): e.g., `case 510050102 → sub_14096F000`

The compound IDs follow the pattern `{SERIES}{UNIT}{INDEX}`:
- `10170101` = series 001, unit 017 (DOM), task 01, variant 01
- `510050102` = series 051, unit 005, task 01, variant 02

**Called from**: `CAcBattleCore` constructor (`sub_140754D30`) stores it at `this+1520`.

**Xrefs**: Only called from `sub_140754D30` (data ref at offset 1520) — this means it's a function pointer stored in the battle core, called indirectly.

### 1.2 Registration Function Pattern

Every registration function follows the same template. Example — **FreeFall (case 100)**: `sub_140921530`

```
_QWORD *sub_140921530()
{
  v0 = qword_14241E7F8;                  // Global thread-local state
  v1 = sub_14019DCE0(v0);                // Get current thread context
  if (!v1) v1 = *(v0 + 32);             // Fallback to default
  
  v2 = **(v1 + 216 + 16);               // Get registration table array
  
  if (v2[2] == v2[3])                    // If array is full
    sub_14035EB80(v2 + 1, 1);            // Grow the array
  
  v3 = (void*)v2[2];                     // Current write pointer
  if (v3) memset(v3, 0, 0x220);         // Zero-init 544-byte record
  
  v2[2] += 544;                          // Advance write pointer
  result = v2[2] - 544;                  // Point to newly allocated record
  
  result[65] = sub_14092ACC0;            // Offset 520: FACTORY CONSTRUCTOR
  result[64] = 0;                        // Offset 512: flags/state
  result[66] = 0;                        // Offset 528: reserved
  
  return result;
}
```

### 1.3 Registration Record Structure (0x220 = 544 bytes)

```
struct UnitTaskRegistration {
    // Offsets 0-511: metadata (class info, parameters, config)
    // ...
    /* +512 */ uint64_t flags;              // result[64] — always 0
    /* +520 */ void*    factoryConstructor;  // result[65] — CRITICAL: factory fn ptr
    /* +528 */ uint64_t reserved;           // result[66] — always 0
    // Offsets 532-543: padding
};
```

### 1.4 Global Registration Table

The table is accessed via a thread-local chain:

```
qword_14241E7F8                          // TLS root pointer
  → sub_14019DCE0() or fallback +32      // Thread context
    → *(context + 216)                   // Registration subsystem
      → *(subsystem + 16)               // Array descriptor
        → array[2] = write_ptr          // Next free slot
        → array[3] = capacity_end       // End of allocated space
```

The array is a growable vector of 544-byte records. Growth is handled by `sub_14035EB80`.

### 1.5 Factory Constructor Map (COMMON classes)

| Case ID | Registration Fn | Factory at [65] | Class Name |
|---------|-----------------|-----------------|------------|
| 1       | sub_140920D50   | sub_14092A880   | (COMMON type 1) |
| 3       | sub_140920CC0   | sub_14092A840   | (COMMON type 3) |
| 100     | sub_140921530   | sub_14092ACC0   | FreeFall |
| 102     | sub_1409214A0   | (different)     | (COMMON type 102) |
| 103     | sub_1409216E0   | (different)     | (COMMON type 103) |
| ...     | ...             | ...             | ... |
| 118     | sub_140921800   | (different)     | (COMMON type 118) |

---

## 2. Spawn Flow: MSC Syscall → Class Lookup → Allocate → Construct → Init

### 2.1 CAcBattleCore Setup

The `CAcBattleCore` constructor (`sub_140754D30`) installs the dispatch function table:

```cpp
// sub_140754D30 — CAcBattleCore constructor
*(_QWORD*)(this + 1512) = sub_140920AF0;   // Spawn bridge (factory invoker)
*(_QWORD*)(this + 1520) = sub_14097E740;   // Registration dispatcher
*(_QWORD*)(this + 1528) = sub_140920B40;   // Post-spawn handler
*(_QWORD*)(this + 1536) = sub_140920AC0;   // Cleanup handler
*(_QWORD*)(this + 1544) = sub_140920AE0;   // Auxiliary handler
*(_QWORD*)(this + 1552) = sub_140989280;   // Extended handler
*(_QWORD*)(this + 1560) = sub_140755520;   // Callback A
*(_QWORD*)(this + 1568) = sub_140755540;   // Callback B
```

### 2.2 Spawn Bridge: `sub_140920AF0`

```cpp
__int64 sub_140920AF0(__int64 a1, __int64 a2, __int64 classTypeId)
{
    v8 = classTypeId;
    v6 = sub_14091BC40(&v8);    // Resolve factory function pointer
    return v6(a1, a2, classTypeId);  // Call the factory!
}
```

This is the **spawn entry point**. It:
1. Takes the class type ID
2. Calls `sub_14091BC40` to resolve it to a factory function pointer
3. Calls that factory to allocate + construct the UnitTask

### 2.3 Factory Resolver: `sub_14091BC40`

**Signature**: `fnPtr sub_14091BC40(__int64* classIdRef)`

A **3874-line, 937-return** dispatch function. It:

1. Reads the class type ID from the spawn context:
   ```cpp
   v1 = *(*(*a1 + 88) + 8);            // Navigate to spawn record
   v2 = vtable[2](v1);                  // Call GetClassId on spawn record
   ```
2. Giant switch/if-else tree on `v2` (class type ID)
3. Returns the appropriate factory constructor function pointer

Returns `sub_14042F580` as the default fallback factory.

### 2.4 Factory Constructor Example: FreeFall (`sub_14092ACC0`)

```cpp
_QWORD* sub_14092ACC0(__int64 a1, __int64 a2, unsigned __int64 a3)
{
    v3 = sub_14044C4E0(0x3530, a2, a3);   // Allocate 0x3530 (13616) bytes
    v4 = v3;
    if (!v3) return 0;
    
    memset(v3, 0, 0x3530);                 // Zero-init full object
    sub_1406A4CF0(v4);                     // Base UnitTask constructor chain
    
    *v4 = &EXVS2::CUnitTaskAutomata_000COMMON_000COMMON_001_FreeFall::`vftable';
    return v4;
}
```

### 2.5 Constructor Chain (bottom-up)

```
sub_14092ACC0 (FreeFall factory)
  │
  ├── sub_14044C4E0(0x3530)              // Memory allocator (13616 bytes)
  ├── memset(0, 0x3530)                  // Zero-initialize
  ├── sub_1406A4CF0(this)                // Intermediate constructor
  │     │
  │     ├── sub_14066D660(this)          // Radicon layer constructor
  │     │     │
  │     │     ├── sub_14063B260(this)    // Abstract base constructor
  │     │     │     │
  │     │     │     ├── sub_14066E030()  // Entity framework init
  │     │     │     ├── vtable = CUnitTaskAutomataAbstract::vftable (0x1413446a0)
  │     │     │     └── Zero-init: offsets 13472-13572
  │     │     │
  │     │     ├── vtable = CUnitTaskAutomataRadicon::vftable (0x141348050)
  │     │     ├── this+13584 = 0         // Clear radicon ptr
  │     │     └── this+13592 = 0         // Clear radicon state
  │     │
  │     ├── this+13600 = 0               // Clear parent flag
  │     └── vtable = CUnitTaskAutomataRadiconParentActor::vftable
  │
  └── vtable = FreeFall::vftable         // Final vtable override
```

### 2.6 Vtable Slot 78: Component Factory (`sub_14094DF60`)

Distinct from the main factory — this creates a **smaller component** (0x1C0 = 448 bytes):

```cpp
_DWORD* sub_14094DF60(__int64 a1, __int64 a2, unsigned __int64 a3)
{
    result = sub_14044C4E0(0x1C0, a2, a3);  // Allocate 448 bytes
    memset(result, 0, 0x1C0);
    sub_1406A4D20(v4);                       // Init base fields
    v4[108] = 1075838976;                    // = 1.0f at offset 432
    return result;
}
```

`sub_1406A4D20` initializes the parameter block:
- Calls `sub_14063B2F0` for deep base init
- Zeroes fields at offsets 320, 328, 332, 400, 416, 420
- Sets sentinel values (-1) at offsets 408, 412

### 2.7 Base OnInit: `sub_140673A40` (vtable slot 2)

The massive OnInit function (~400 lines) performs post-construction initialization:

1. **Allocates sub-components**:
   - `CActorStatus_BaseBullet` (0x360 bytes) → stored at `this+11816`
   - `CActorStatus_CommandActionBase` (0x30 bytes) → stored at `this+11872`
   - Motion controller (0x110 bytes) → stored at `this+11824`
   - Physics/collision (0x300 bytes) → stored at `this+11864`

2. **Binds to parent entity**:
   - Calls vtable[82] to get the parent CCmdActionManager
   - Reads spawn parameters via `sub_14068DA10`
   - Copies position, orientation from parent

3. **Sets up collision**:
   - Configures collision regions
   - Binds to physics world

4. **Creates the CCmdActionManager**:
   ```cpp
   v50 = vtable[81](this);    // CreateCmdActionManager — PURE VIRTUAL
   this+13480 = v50;          // Store action manager
   ```

5. **Configures rendering/animation**:
   - Binds model data
   - Sets initial transform

### 2.8 FreeFall OnInit Override: `sub_140F76310` → `sub_1406A5BA0`

The FreeFall OnInit is a thunk to `sub_1406A5BA0`:

```cpp
__int64 sub_1406A5BA0(__int64 this)
{
    sub_14066DAA0();                    // Thunk to base OnInit (sub_140673A40)
    
    // Read params to determine parent linkage
    if (*(params + 417))
    {
        parentEntity = sub_14066E6B0(this);   // Find parent
        this+13600 = vtable[95](this, parentEntity+11952);
    }
    
    // Configure initial state
    if (*(params + 419))
        *(this+11808 + 48) = 0;
    
    vtable[99](this);                  // ResetActions
    
    // Spawn hit effects
    count = vtable[96](this);          // GetHitEffectCount
    for (i = 0; i < count; i++)
    {
        effectId = vtable[97](this, i);       // GetHitEffectIdAt
        vtable[98](this, &effectParam, i);    // GetHitEffectParamAt
        sub_1406A6140(this, effectId, 0, effectParam);  // Spawn hit effect
    }
}
```

### 2.9 FreeFall PreInit: `sub_1406A5100` (vtable slot 21)

```cpp
__int64 sub_1406A5100(__int64 this)
{
    sub_1406A4DF0(this, this + 8);  // Process child nodes, set display mode
    return sub_140672C40(this);      // Base PreInit
}
```

Base PreInit (`sub_140672C40`):
```cpp
__int64 sub_140672C40(__int64 this)
{
    sub_14068B320(*(this + 13488));  // Reset spawn record
    sub_14063D070(this);             // Configure physics
    sub_14066E450(this);             // Configure collision
    return sub_140672D20(this);      // Extended init
}
```

### 2.10 FreeFall CreateCmdActionManager: `sub_140F387C0` (vtable slot 81)

```cpp
_QWORD* sub_140F387C0(__int64 this, __int64 parent, unsigned __int64 size)
{
    v3 = sub_14044C4E0(0x110, parent, size);  // Allocate 272 bytes
    v4 = v3;
    if (!v3) return 0;
    
    memset(v3, 0, 0x110);
    sub_140DDC790(v4);                         // CCmdActionManager_Radicon base init
    
    *v4     = &CCmdActionManager_FreeFall::vftable;    // Primary vtable
    v4[6]   = &CCmdActionManager_FreeFall::vftable;    // Secondary vtable (offset 48)
    
    return v4;
}
```

The `sub_140DDC790` constructor chain:
```
sub_140DDC790 (CCmdActionManager_Radicon)
  ├── sub_14068D390 (CCmdActionManager base)
  │     ├── sub_1406726D0 (base allocator)
  │     ├── sub_14068D420 (secondary vtable init)
  │     ├── vtable = CCmdActionManager::vftable
  │     └── Init 3 linked-list pairs at offsets 22-27 (176-216 bytes)
  │
  ├── vtable = CCmdActionManager_Radicon::vftable
  ├── offset 224 = -1 (sentinel)
  ├── offset 228 = 0
  └── Init 2 more linked-list pairs at offsets 232-256
```

---

## 3. Hit Effect Dispatch System: `sub_14066D730`

### 3.1 Function Analysis

```cpp
__int64 sub_14066D730(__int64 entity, unsigned int targetHash)
{
    bestMatch = 0;
    childIndex = 0;
    
    if (!sub_140601790(entity, &childIndex))   // Find first child
        return 0;
    
    do {
        child = sub_140602280(entity, childIndex);  // Get child at index
        if (!child) continue;
        
        // Check if child has flag 0x80 in its type flags (vtable[28])
        if ((vtable[28](child) & 0x80) == 0) continue;
        
        params = *(child + 11808);             // Get params block
        dataStore = sub_1405AA780();           // Get global data store
        
        hashKey = 0x0D6A5CD5;                 // Hash key for "hit_effect_hash"
        sub_1405B2980(dataStore + 2904, &value, params + 56, &hashKey);
        
        // Check: does this child's hit_effect_hash match our target?
        if (value == targetHash || 
            (recursiveMatch = sub_14066D730(child, targetHash)) != 0)
        {
            candidate = (value == targetHash) ? child : recursiveMatch;
            
            // Priority check: keep candidate with LOWEST priority value
            if (!bestMatch || 
                *(*(bestMatch + 11808) + 160) >= *(*(candidate + 11808) + 160))
            {
                bestMatch = candidate;
            }
        }
    } while (sub_1406023F0(entity, &childIndex));  // Next child
    
    return bestMatch;
}
```

### 3.2 Key Details

- **Hash 0x0D6A5CD5** (225074389 decimal): This is the parameter hash key for `hit_effect_hash`. It's used to look up which hit effect type a child entity represents.

- **Child iteration**: Uses `sub_140601790` (find first) and `sub_1406023F0` (find next) to iterate up to 64 child slots (array bounds-checked at index 0x40).

- **Child access**: `sub_140602280(entity, index)` returns `*(entity + 16*index + 56)` — a simple array lookup.

- **Type filter**: Only children with `vtable[28]() & 0x80` are considered. This flag (bit 7 of GetTypeFlags) identifies entities that ARE hit effects.

- **Recursive search**: If a direct child doesn't match, the function recurses into that child's children — enabling nested hit effect hierarchies.

- **Priority system**: `*(params + 160)` is the priority value. **Lower values win** — the function keeps the candidate with the smallest priority. This allows multiple matching children where only the highest-priority one is selected.

### 3.3 Flow Summary

```
sub_14066D730(entity, targetHash=0x0D6A5CD5)
  │
  ├── For each child of entity:
  │     ├── Check vtable[28]() & 0x80 (is it a hit effect?)
  │     ├── Read child's hit_effect_hash via sub_1405B2980
  │     │     └── Reads from: dataStore + 2904, using hash key 0x0D6A5CD5
  │     │         against child's params block (child+11808+56)
  │     ├── If hash matches targetHash:
  │     │     └── Compare priority (params+160), keep lowest
  │     └── Else: recurse into child
  │
  └── Return: best matching child (or 0 if none)
```

---

## 4. Parameter Lookup: `sub_1405B2980`

### 4.1 Function Analysis

```cpp
__int64 sub_1405B2980(
    __int64 descriptorTable,  // dataStore + 2904
    _DWORD* output,           // Output value
    __int64* params,          // Pointer pair: [dataPtr, offsetTable]
    unsigned int* hashKey     // Hash key to look up
)
{
    dataPtr = params[0];                // *params — base data pointer
    if (!dataPtr) return -1;            // No data → fail
    
    v7 = LookupCommandDescriptorByHash(dataPtr, &temp, *hashKey);
    
    offsetTable = params[1];            // params[1] — offset lookup table
    descriptor = *v7;                   // Resolved descriptor
    
    if (!output || !offsetTable || !descriptor)
        return -1;                      // Missing components → fail
    
    // Final value = read int at: dataPtr + *(descriptor + dataPtr) + dataPtr
    //             = read int at computed offset
    value = *(int*)(offsetTable + *(uint64_t*)(descriptor + dataPtr) + dataPtr);
    *output = value;
    
    return 0;  // Success
}
```

### 4.2 Key Insights

- **`descriptorTable`** = `qword_1421155D0 + 2904` — a global singleton data store containing parameter descriptors.

- **`params`** is a two-pointer structure:
  - `params[0]` = base data pointer (the raw parameter data block)
  - `params[1]` = offset lookup table (maps descriptor positions to data offsets)

- **`LookupCommandDescriptorByHash`** resolves the hash key to a descriptor record within the data block. The descriptor contains the offset to the actual value.

- **Value resolution chain**:
  ```
  hashKey → LookupCommandDescriptorByHash → descriptor
  descriptor → offset within data block
  data block + offset → actual parameter value (int32)
  ```

- **Return value**: 0 on success, -1 (0xFFFFFFFF) on failure.

### 4.3 Data Store Access Pattern

```
qword_1421155D0 (global singleton — returned by sub_1405AA780)
  └── +2904: descriptor table base
        │
        └── LookupCommandDescriptorByHash(dataPtr, &temp, hashKey)
              │
              └── Returns pointer to descriptor containing offset
                    │
                    └── *(offsetTable + *(descriptor + dataPtr) + dataPtr)
                          │
                          └── Final parameter value (int32)
```

### 4.4 Known Hash Keys

| Hash | Decimal | Used For |
|------|---------|----------|
| 0x0D6A5CD5 | 225074389 | hit_effect_hash (dispatch selector) |
| Other hashes | ... | Velocity, gravity, lifetime, rotation, etc. |

---

## 5. Complete End-to-End Trace

### 5.1 Registration (Game Startup)

```
CAcBattleCore::Constructor (sub_140754D30)
  │
  ├── Store function table at this+1512..1576:
  │     ├── +1512: sub_140920AF0  (spawn bridge)
  │     ├── +1520: sub_14097E740  (registration dispatcher)
  │     ├── +1528: sub_140920B40  (post-spawn handler)
  │     └── ...
  │
  └── Later, during game init:
        sub_14097E740(battleCore, classTypeId)  // Called for each class
          │
          ├── switch(classTypeId):
          │     case 100:  sub_140921530()  // FreeFall
          │     case 1:    sub_140920D50()  // Type 1
          │     case 510050102: sub_14096F000()  // Unit-specific
          │     ... (682 cases total)
          │
          └── Each registration function:
                1. Access global table via TLS chain
                2. Allocate 544-byte record
                3. Store factory constructor at record[65] (offset 520)
                4. Return record pointer
```

### 5.2 Spawn (Runtime, triggered by MSC syscall)

```
MSC Syscall (e.g., spawnProjectile)
  │
  ├── sub_140920AF0(entity, context, classTypeId)  // Spawn bridge
  │     │
  │     ├── sub_14091BC40(&classTypeId)             // Resolve factory
  │     │     │
  │     │     ├── Read class ID from spawn context
  │     │     ├── Giant switch (937 returns)
  │     │     └── Return: factory function pointer
  │     │
  │     └── factory(entity, context, classTypeId)   // Call factory
  │           │
  │           ├── sub_14044C4E0(0x3530)             // Allocate 13616 bytes
  │           ├── memset(0, 0x3530)                 // Zero-init
  │           │
  │           ├── Constructor chain (C++ style, bottom-up):
  │           │     sub_14066E030()                  // Entity framework
  │           │     sub_14063B260()                  // CUnitTaskAutomataAbstract
  │           │       vtable = Abstract::vftable
  │           │       Zero-init offsets 13472-13572
  │           │     sub_14066D660()                  // CUnitTaskAutomataRadicon
  │           │       vtable = Radicon::vftable
  │           │     sub_1406A4CF0()                  // RadiconParentActor
  │           │       vtable = RadiconParentActor::vftable
  │           │
  │           └── vtable = FreeFall::vftable         // Final override
  │
  ├── PreInit: vtable[21] → sub_1406A5100
  │     ├── sub_1406A4DF0: Process child nodes
  │     └── sub_140672C40: Reset spawn record, configure physics/collision
  │
  ├── OnInit: vtable[2] → sub_140F76310 → sub_1406A5BA0
  │     ├── Base OnInit (sub_140673A40):
  │     │     ├── Allocate CActorStatus_BaseBullet (0x360)
  │     │     ├── Allocate CActorStatus_CommandActionBase (0x30)
  │     │     ├── Allocate motion controller (0x110)
  │     │     ├── Allocate physics/collision (0x300)
  │     │     ├── Read spawn parameters
  │     │     ├── Copy position/orientation from parent
  │     │     ├── Configure collision regions
  │     │     └── vtable[81](this) → CreateCmdActionManager
  │     │           │
  │     │           └── sub_140F387C0: FreeFall action manager
  │     │                 ├── Allocate 0x110 bytes
  │     │                 ├── CCmdActionManager_Radicon base init
  │     │                 └── vtable = CCmdActionManager_FreeFall::vftable
  │     │
  │     ├── Link to parent entity (if params+417)
  │     ├── vtable[99]: ResetActions
  │     └── For each hit effect (vtable[96] count):
  │           sub_1406A6140(this, effectId, 0, effectParam)
  │
  └── Ready for OnUpdate (vtable[12]) per-frame ticking
```

### 5.3 Hit Effect Dispatch (Runtime)

```
sub_14066D730(entity, targetHash)
  │
  ├── Iterate children (up to 64 slots)
  │     ├── Filter: vtable[28]() & 0x80 (must be hit effect)
  │     ├── Read hit_effect_hash via sub_1405B2980
  │     │     └── Hash key: 0x0D6A5CD5 against child params
  │     ├── Match check: child's hash == targetHash?
  │     ├── Recursive descent if no direct match
  │     └── Priority: keep lowest *(params+160) value
  │
  └── Return: best matching child entity
```

### 5.4 Parameter Lookup (Throughout lifecycle)

```
sub_1405B2980(descriptorTable, &output, paramsPtr, &hashKey)
  │
  ├── Extract data pointer from params[0]
  ├── LookupCommandDescriptorByHash(data, hashKey)
  ├── Resolve offset from descriptor
  ├── Read int32 at computed offset
  └── Return: 0 (success) or -1 (fail)
```

---

## 6. Key Address Summary

| Address | Name | Role |
|---------|------|------|
| `sub_14097E740` | RegisterDispatch | 682-case switch: classTypeId → registration record |
| `sub_140921530` | RegisterFreeFall | Creates 0x220-byte record for FreeFall (case 100) |
| `sub_14091BC40` | FactoryDispatch | 937-return switch: classTypeId → factory fn ptr |
| `sub_140920AF0` | SpawnBridge | Resolves factory and calls it |
| `sub_14092ACC0` | FreeFallFactory | Allocates 0x3530 bytes, constructs FreeFall |
| `sub_1406A4CF0` | BaseConstructor | Intermediate constructor (RadiconParentActor layer) |
| `sub_14063B260` | AbstractConstructor | Base class constructor (CUnitTaskAutomataAbstract) |
| `sub_14066D660` | RadiconConstructor | Radicon layer constructor |
| `sub_140673A40` | BaseOnInit | Full OnInit: allocates sub-components, creates CCmdActionManager |
| `sub_1406A5BA0` | FreeFallOnInit | FreeFall OnInit: calls base, links parent, spawns hit effects |
| `sub_1406A5100` | FreeFallPreInit | Process children, configure physics |
| `sub_140F387C0` | FreeFallCreateCmdAM | Creates CCmdActionManager_FreeFall (0x110 bytes) |
| `sub_14094DF60` | VtableSlot78Factory | Creates component object (0x1C0 bytes), not full UnitTask |
| `sub_14066D730` | HitEffectDispatch | Recursive child search by hit_effect_hash with priority |
| `sub_1405B2980` | ParamLookup | Hash-based parameter value retrieval |
| `sub_140754D30` | CAcBattleCoreInit | Battle core constructor, installs dispatch tables |
| `sub_14044C4E0` | MemoryAllocator | nu:: memory allocation |
| `qword_14241E7F8` | TLSRoot | Thread-local storage root for registration table |
| `qword_1421155D0` | GlobalDataStore | Global parameter data store singleton |
