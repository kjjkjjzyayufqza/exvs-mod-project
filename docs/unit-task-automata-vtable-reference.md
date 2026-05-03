# UnitTaskAutomata VTable Abstracted Reference

## Architecture Summary

EXVS2's projectile/weapon system uses a **Strategy Pattern** with three layers:

```
┌─────────────────────────────────────────────────────────────┐
│ CUnitTaskAutomata (Entity Layer)                            │
│   - Owns the vtable (93+7 = 100 virtual methods)           │
│   - Manages lifecycle: spawn → tick → collide → destroy     │
│   - Holds physics, collision, and parameter components       │
│   - Object size: ~13616 bytes (0x3530)                      │
├─────────────────────────────────────────────────────────────┤
│ CCmdActionManager (Behavior Layer)                           │
│   - Created by UnitTask via vtable[81] factory              │
│   - 3 virtual methods (destructor, execute, cleanup)        │
│   - Execute() builds the action pipeline                    │
│   - Reads parameters from data store via hash lookup        │
├─────────────────────────────────────────────────────────────┤
│ CCmdAction / CCmdActionGroup (Action Layer)                  │
│   - Individual action nodes: Wait, Move, Rotate, etc.       │
│   - Groups: Series (sequential), Parallel (concurrent)      │
│   - Chained together to form complex behavior               │
└─────────────────────────────────────────────────────────────┘
```

---

## Class Hierarchy

```
CUnitTaskAutomataAbstract@GAM@VDK (vtable: 0x1413446a0)
  │
  ├── [Intermediate Framework Class] (adds slots 93-99)
  │     All 000COMMON and unit-specific EXVS2 classes share this
  │     │
  │     ├── CUnitTaskAutomata_000COMMON_*@EXVS2 (generic weapons)
  │     │     FreeFall, ThrowSaber, BeamBoomerang, ShockHalo,
  │     │     ThrowBlade, PurgeFly, ThrowPillar, ThrowMissile, etc.
  │     │
  │     └── CUnitTaskAutomata_{SERIES}_{UNIT}_*@EXVS2 (unit-specific)
  │           001GUNDAM_001GUNDAM_001_BeamJavelin
  │           001GUNDAM_017DOM000_001_AssistDomGrap
  │           002ZGUNDM_001ZGUNDM_001_BeamConfuse
  │           etc.
  │
  ├── CUnitTaskAutomataRadicon@GAM@VDK (vtable: 0x141348050)
  │     Remote-controlled unit tasks (radio-controlled weapons)
  │
  ├── CUnitTaskAutomataFunnelSwarm@GAM@VDK (vtable: 0x1413f47d0)
  │     Funnel swarm (multiple autonomous bits)
  │
  └── CUnitTaskAutomataSummonDefenceFormation@GAM@VDK (vtable: 0x1415d5490)
        Defence formation summons
```

---

## Core Virtual Method Interface (Must-Override for New UnitTask)

These 15 slots are overridden by **100% of analyzed classes**. They define the essential behavior contract.

### Lifecycle Methods

| Slot | Name | Signature (deduced) | Description |
|------|------|------|------|
| **0** | `Destructor` | `void(this, char flags)` | Cleanup resources. If `flags & 1`, free the object memory (size varies by class). |
| **78** | `Factory` | `UnitTask*(allocSize)` | Static-like factory. Allocates object, calls constructor chain, returns new instance. |
| **3** | `ConstructorHelper` | `void(this)` | Called during construction to init base members. Often thunks to base. |
| **21** | `PreInit` | `void(this)` | Early initialization. Sets up sub-components before main init. |
| **2** | `OnInit` | `void(this)` | Post-construction init. Reads parameter block, sets up hit effects, calls vtable[99]. |

### Per-Frame Update

| Slot | Name | Signature (deduced) | Description |
|------|------|------|------|
| **12** | `OnUpdate` | `void(this)` | **Main tick function.** Iterates hit effects → sets collision bits → calls base lifecycle (physics, motion, collision, hit detection). Override to add pre/post processing. |

### Targeting & Distance

| Slot | Name | Signature (deduced) | Description |
|------|------|------|------|
| **54** | `CanHitTarget` | `bool(this)` | Returns true if projectile is within hit range of target. Uses 3D distance + parameter lookup. |
| **55** | `ShouldCancel` | `bool(this)` | Returns true if projectile is too far from target (should self-destruct). Inverse of CanHitTarget. |

### Collision & Damage

| Slot | Name | Signature (deduced) | Description |
|------|------|------|------|
| **73** | `OnCollisionCheck` | `void(this, context)` | Collision response handler. Checks mode/state, conditionally triggers kill via vtable[94]. |
| **70** | `OnParamChanged` | `void(this, params*)` | Stores a parameter update. Reads first DWORD from params, saves to object+13592. |
| **79** | `ConfigureDamageInfo` | `void(this, damageOut*)` | Fills damage output struct: type=1, flags, power values (256/258), hitStun=0. |

### Identity & Configuration

| Slot | Name | Signature (deduced) | Description |
|------|------|------|------|
| **28** | `GetClassId` | `int(this)` | Returns a unique integer identifying this UnitTask type (e.g., FreeFall=465). |
| **23** | `GetTypeFlags` | `void(this)` | Returns type information or memory-related flags. |

### CCmdActionManager Factory

| Slot | Name | Signature (deduced) | Description |
|------|------|------|------|
| **81** | `CreateCmdActionManager` | `CmdActionManager*(this, parent, size)` | **CRITICAL.** Allocates and returns the CCmdActionManager for this task. Determines the entire movement/action behavior. |

### Trigger

| Slot | Name | Signature (deduced) | Description |
|------|------|------|------|
| **71** | `OnTrigger` | `void(this)` | External activation trigger. Delegates to vtable[94] (GetPhysicsComponent → activate). |
| **77** | `OnSpawnHitEffects` | `void(this)` | Iterates hit effect array and spawns each one. Calls vtable[96]/[97]/[98] for count/id/params. |

---

## Framework Methods (Shared, Do NOT Override)

These are provided by the intermediate framework class. They handle common infrastructure.

| Slot | Name | Signature | Description |
|------|------|------|------|
| **93** | `GetMode` | `int(this)` | Returns current mode/state from params+328 |
| **94** | `GetPhysicsComponent` | `void*(this)` | Returns physics subsystem from object+13480 |
| **95** | `FindNearestTarget` | `ptr(this, targetArray)` | Iterates up to 12 target slots, returns closest by 3D distance (prefers type=1 over type=2) |
| **96** | `GetHitEffectCount` | `int(this)` | Returns count of hit effects from params+400 |
| **97** | `GetHitEffectIdAt` | `int(this, index)` | Returns hit effect ID at index (from params+336, bounds-checked) |
| **98** | `GetHitEffectParamAt` | `void(this, out*, index)` | Returns hit effect parameter at index (from params+340, bounds-checked) |
| **99** | `ResetActions` | `void(this)` | Resets/reconfigures action state |

---

## CCmdActionManager Types & Behavior Mapping

Each CCmdActionManager type defines a distinct motion/action pattern:

| CCmdActionManager Type | Behavior | Used By |
|---|---|---|
| `_FreeFall` | Gravity-affected projectile. Reads initial velocity + gravity, creates physics body, waits for lifetime. | FreeFall, PurgeFly, DelayExplosion |
| `_Throw` | Directed throw with target tracking. Reads launch angle + speed + tracking factor. | ThrowSaber, ThrowMissile, BeamJavelin, NapalmBomb, ThrowShield |
| `_Boomerang` | Outward + return trajectory. Two-phase motion with midpoint turnaround. | BeamBoomerang |
| `_PutObj` | Static placement. No movement, just positioned at spawn point. | PutObj (mines, traps) |
| `_ThrowStopRotateOnStick` | Thrown then sticks on contact, stops rotating. | ThrowSaberRolling, StickSaber |
| `_Sticker` | Attaches to target on contact. | StickSaber variants |
| `_FreeFall_Interaction` | FreeFall + interactive collision response (bounces off terrain). | FreeFall_Interaction |
| `_Radicon` | Remote-controlled. Takes input from player for steering. | Funnels, guided missiles |

---

## CCmdAction Node Types (Action Building Blocks)

These are the individual action nodes used to compose behavior pipelines:

| CCmdAction Type | Purpose | Key Parameters |
|---|---|---|
| `CCmdAction_WaitForLifeTimeEnd` | Monitors lifetime timer. Triggers next phase when expired. | lifetime (int, negative = absolute frames) |
| `CCmdAction_StandardHomingMoveSet` | Homing/tracking movement toward target. | tracking factor, speed |
| `CCmdAction_BulletFlyFunctionAbstract` | Base straight-line projectile flight. | velocity vector |
| `CCmdAction_WaitByFrame` | Waits N frames before proceeding. | frame count |
| `CCmdAction_Blank` | No-op separator/placeholder. | - |
| `CCmdAction_SetIntersectEnableMode` | Enable/disable collision detection. | mode (0=off, 1=on) |
| `CCmdAction_TerminateSeriesEnd` | Marks end of action series, triggers cleanup. | - |

### CCmdActionGroup Types

| Group Type | Purpose |
|---|---|
| `CCmdActionGroup_Series` | Executes actions sequentially (one after another) |
| (Parallel - presumed) | Executes actions concurrently |

---

## Behavior Pipeline Examples

### FreeFall Pipeline
```
Physics Body
  ├── [Custom gravity motion] (reads velocity + gravity from params)
  └── CCmdAction_WaitForLifeTimeEnd (destroy after lifetime)

Action Group (Series)
  └── [Gravity spin action] (optional, based on rotation params)
```

### Throw Pipeline
```
Action Group (Series)
  ├── CCmdAction_TerminateSeriesEnd (end marker)
  ├── [Optional: additional setup if params+435 flag]
  └── [sub_1406A1610: main throw motion with rotation vector]

Parameters read:
  - Rotation X (degrees → radians): hash 1261973028
  - Rotation Y (degrees → radians): hash 1010769586
  - Rotation Z (degrees → radians): hash -1523167480
  - Config flags: params+432, params+100, params+433
```

### Boomerang Pipeline (Dual-Phase)
```
Phase 1 - Outward:
  Physics Body
    ├── CCmdAction_StandardHomingMoveSet (homing toward target)
    └── CCmdAction_WaitForLifeTimeEnd (negative lifetime = outward duration)

Phase 2 - Return:
  Action Group (Series)
    ├── CCmdAction_WaitByFrame (wait for return timing)
    ├── CCmdAction_Blank (separator)
    ├── [Return motion link]
    └── CCmdAction_SetIntersectEnableMode (mode=0, disable collision during return)

Parameters read:
  - Config: hash 850177019
  - Lifetime/distance: hash 1280698941
```

---

## Parameter Reading System

Parameters are stored in a centralized data store and accessed via **hash keys**:

```cpp
// Pattern: sub_1405B2980(dataStore + 2904, &output, keyPointer, &hashKey)
// The hash keys correspond to parameter names in the game data

// Example hashes found in CCmdActionManager_FreeFall::Execute:
// Initial velocity X/Y/Z, Gravity X/Y/Z, Lifetime, Rotation speed, etc.
```

The `hit_effect_hash` (like 0x0D6A5CD5) is used in the **dispatch system** to select which UnitTaskAutomata class to instantiate.

---

## Template: Creating a New UnitTask

To implement a new UnitTask, you need to provide:

### Minimum Required Overrides (15 vtable slots):

```cpp
class CUnitTaskAutomata_MyNewTask {
    // Identity
    virtual int GetClassId() { return UNIQUE_ID; }        // slot 28
    virtual void GetTypeFlags();                           // slot 23
    
    // Lifecycle
    virtual void Destructor(char flags);                   // slot 0
    virtual void* Factory(size_t size);                    // slot 78
    virtual void ConstructorHelper();                      // slot 3
    virtual void PreInit();                                // slot 21
    virtual void OnInit();                                 // slot 2
    
    // Behavior
    virtual void OnUpdate();                               // slot 12
    virtual CmdActionManager* CreateCmdActionManager();    // slot 81 (CRITICAL)
    virtual void OnTrigger();                              // slot 71
    virtual void OnSpawnHitEffects();                      // slot 77
    
    // Combat
    virtual bool CanHitTarget();                           // slot 54
    virtual bool ShouldCancel();                           // slot 55
    virtual void OnCollisionCheck(ctx);                    // slot 73
    virtual void OnParamChanged(params*);                  // slot 70
    virtual void ConfigureDamageInfo(out*);                // slot 79
};
```

### Creating a Custom CCmdActionManager:

```cpp
class CCmdActionManager_MyBehavior {
    virtual void Destructor(char flags);  // slot 0
    virtual void Execute(parent, size);   // slot 1 - BUILD YOUR ACTION PIPELINE HERE
    // slot 2 inherited from base
};

// In Execute():
// 1. Allocate physics body
// 2. Read parameters from data store using hash keys
// 3. Create CCmdAction_* nodes (WaitForLifeTimeEnd, etc.)
// 4. Create CCmdActionGroup_* containers (Series, Parallel)
// 5. Register actions to the manager
```

---

## Template: Proxying an Existing UnitTask

To intercept/modify an existing UnitTask's behavior without full reimplementation:

### Approach 1: Hook OnUpdate (slot 12)
Replace the vtable[12] pointer to inject pre/post processing around the original update.

### Approach 2: Hook CreateCmdActionManager (slot 81)
Replace the CCmdActionManager factory to return a modified version that wraps the original.

### Approach 3: Hook ConfigureDamageInfo (slot 79)
Modify damage output without changing movement behavior.

### Key Addresses for Hooking
- Base vtable: `0x1413446a0`
- All EXVS2 vtables: `0x1413Exxxx` to `0x1415Dxxxx` range
- CCmdActionManager vtables: `0x1415D3xxx` to `0x1415D4xxx` range

---

## Appendix: Full 93-Slot Base Class Reference

| Slot | Base Address | Category | Notes |
|------|------|------|------|
| 0 | 0x14063B590 | Lifecycle | Destructor |
| 1 | 0x140135E70 | Framework | Returns 0 (nop) |
| 2 | 0x140673A40 | Lifecycle | OnInit |
| 3 | 0x140602840 | Lifecycle | ConstructorHelper |
| 4 | 0x14035E840 | Framework | Internal |
| 5 | 0x14035E830 | Framework | Internal |
| 6 | 0x14035E810 | Framework | Internal |
| 7 | 0x1400394F0 | Framework | Memory operation |
| 8 | 0x14063C250 | Identity | Returns constant 1017648 (type hash?) |
| 9 | 0x140135E70 | Framework | Returns 0 |
| 10 | 0x140033290 | Nop | SetVirtualDebugValue |
| 11 | 0x1406733F0 | Update | Sub-update helper |
| 12 | 0x140673170 | **Lifecycle** | **Main update tick** |
| 13 | 0x140033290 | Nop | |
| 14 | 0x140033290 | Nop | |
| 15 | 0x140673280 | Update | Motion processing |
| 16 | 0x1406736B0 | Update | Animation step |
| 17 | 0x140673630 | Update | Physics step |
| 18 | 0x140672B10 | Init | Component setup |
| 19 | 0x140672E30 | Init | Data binding |
| 20 | 0x1406734C0 | Update | State transition |
| 21 | 0x140672C40 | **Lifecycle** | **PreInit** |
| 22 | 0x1406733C0 | Init | Extended init (Throw types) |
| 23 | 0x14035E760 | **Identity** | **GetTypeFlags** |
| 24 | 0x140135E70 | Framework | Returns 0 |
| 25 | 0x140034940 | Registration | RegisterName |
| 26 | 0x14063C220 | Framework | Internal |
| 27 | 0x1406028F0 | Framework | Internal |
| 28 | 0x14063BBD0 | **Identity** | **GetClassId** |
| 29 | 0x14063BE60 | Framework | Internal |
| 30 | 0x140033290 | Nop | |
| 31 | 0x140672C80 | Init | Component init |
| 32 | 0x14063CB90 | Framework | Internal |
| 33 | 0x140602160 | Framework | Serialize? |
| 34 | 0x140601D40 | Framework | Internal |
| 35 | 0x140601DC0 | Framework | Internal |
| 36 | 0x140360730 | Framework | Internal |
| 37 | 0x140135E70 | Framework | Returns 0 |
| 38 | 0x140033290 | Nop | |
| 39 | 0x14063BF90 | Framework | Internal |
| 40 | 0x14063BF80 | Framework | Internal |
| 41 | 0x14063BF70 | Framework | Internal |
| 42 | 0x1400394F0 | Framework | Memory operation |
| 43 | 0x140602370 | Framework | Internal |
| 44 | 0x14063C3D0 | Framework | Internal |
| 45 | 0x14063BF50 | Framework | Internal |
| 46 | 0x1400394F0 | Framework | Memory operation |
| 47 | 0x14063C260 | Framework | Internal |
| 48 | 0x140674190 | Update | Position update |
| 49 | 0x14063C370 | Framework | Internal |
| 50 | 0x14063BE50 | Framework | Internal |
| 51 | 0x14063BF00 | Framework | Internal |
| 52 | 0x1400348F0 | Framework | GetFreeNode |
| 53 | 0x14063C2A0 | Framework | Internal |
| 54 | 0x14066E870 | **Combat** | **CanHitTarget** |
| 55 | 0x14066E860 | **Combat** | **ShouldCancel** |
| 56 | 0x14063B6D0 | Framework | Internal |
| 57 | 0x140033290 | Nop | |
| 58 | 0x14063C080 | Framework | Internal |
| 59 | 0x140675550 | Combat | Hit processing |
| 60 | 0x140675660 | Combat | Damage calc |
| 61 | 0x140672DB0 | Combat | Target lock |
| 62 | 0x14063BF10 | Framework | Internal |
| 63 | 0x14063C1E0 | Framework | Internal |
| 64 | 0x14063C190 | Framework | Internal |
| 65 | 0x1406733B0 | **Update** | PreMotion hook (called by slot 12) |
| 66 | 0x1400394F0 | **Update** | IsAlive check (called by slot 12) |
| 67 | 0x1406732D0 | **Update** | PostMotion hook (called by slot 12) |
| 68 | 0x140673070 | Update | State check |
| 69 | 0x140033290 | Nop | |
| 70 | 0x140674530 | **Combat** | **OnParamChanged** |
| 71 | 0x140033290 | **Trigger** | **OnTrigger** (nop in base) |
| 72 | 0x140674410 | **Combat** | OnHit handler (called by slot 12) |
| 73 | 0x140673940 | **Combat** | **OnCollisionCheck** |
| 74 | 0x140033290 | Nop | |
| 75 | 0x140033290 | Nop | |
| 76 | 0x140033290 | Nop | (overridden by Throw types) |
| 77 | 0x140674200 | **Trigger** | **OnSpawnHitEffects** |
| 78 | 0x14063B690 | **Lifecycle** | **Factory** |
| 79 | 0x140033290 | **Combat** | **ConfigureDamageInfo** (nop in base) |
| 80 | 0x1406748B0 | Extended | Framework init |
| 81 | _purecall | **CRITICAL** | **CreateCmdActionManager** (PURE VIRTUAL) |
| 82 | 0x140674CD0 | Extended | Internal |
| 83 | 0x140674D00 | Extended | Internal |
| 84 | 0x140E26F80 | Extended | Config (Summon types override) |
| 85 | 0x140033290 | Nop | |
| 86 | 0x140674F00 | Extended | Internal |
| 87-91 | 0x140033290 | Nop | (Summon types override 87-89) |
| 92 | 0x140674E50 | Extended | Internal |
