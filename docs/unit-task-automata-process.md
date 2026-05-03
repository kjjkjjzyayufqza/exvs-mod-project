# UnitTaskAutomata Analysis - Process Log

## Session 2026-05-03

### Initial Discovery

**Binary**: vsac27_Release.exe (EXVS2 OBHK0.3 v27)
**IDB**: E:\OBHK0.3_v27\vsac27_Release.exe.i64

#### RTTI String Search Results
- Total UnitTaskAutomata strings: **1597**
- Estimated unique classes: **~800**
- Two naming patterns identified:
  1. VDK base: `UnitTaskAutomata{Behavior}@GAM@VDK@@` (e.g., `UnitTaskAutomataThrow@GAM@VDK@@`)
  2. EXVS2 derived: `UnitTaskAutomata_{Series}_{Unit}_{Variant}_{Action}@EXVS2@@`

#### Naming Convention Decoded
```
UnitTaskAutomata_{SeriesID}_{UnitID}_{Variant}_{ActionName}@EXVS2@@

SeriesID examples:
  000COMMON  = shared/generic behaviors
  001GUNDAM  = Mobile Suit Gundam (0079)
  002ZGUNDM  = Zeta Gundam
  033GNDAGE  = Gundam AGE

UnitID examples:
  001GUNDAM  = RX-78-2
  017DOM000  = Dom
  001ZGUNDM  = Z Gundam
  002HYAKUS  = Hyaku Shiki
  005GUNMK2  = Gundam Mk-II
```

---

### Phase 1 Results: VDK Base Class vtable Structure

#### Architecture Overview (Strategy Pattern)

```
CUnitTaskAutomataAbstract (vtable 93 slots)
  ├── Manages entity lifecycle (spawn, tick, collision, destroy)
  ├── Creates CCmdActionManager (slot 81) - the "behavior brain"
  └── Delegates movement/action logic to CCmdActionManager

CCmdActionManager (vtable 3 slots)
  ├── Slot 0: Destructor
  ├── Slot 1: Execute/Create actions (PURE VIRTUAL - the core behavior)
  └── Slot 2: Base cleanup
  │
  ├── CCmdAction_*: Individual action nodes
  │     CCmdAction_WaitForLifeTimeEnd
  │     (others TBD)
  └── CCmdActionGroup_*: Action containers
        CCmdActionGroup_Series (sequential)
```

#### VDK Base Class vtable Addresses (with ??_7 MSVC symbols)
| Address | Class |
|---|---|
| 0x1413446a0 | CUnitTaskAutomataAbstract |
| 0x141348050 | CUnitTaskAutomataRadicon |
| 0x1413512e8 | CUnitTaskAutomataRadiconParentActor |
| 0x1413e3db8 | CUnitTaskAutomataShockHalo |
| 0x1413e4408 | CUnitTaskAutomataThrowBlade |
| 0x1415d4100 | CUnitTaskAutomataPutObj |
| 0x1415d5490 | CUnitTaskAutomataSummonDefenceFormation |
| 0x1415d5a18 | CUnitTaskAutomataFunnelDefenceFormation |
| 0x1413f47d0 | CUnitTaskAutomataFunnelSwarm |

#### CCmdActionManager vtable Addresses
| Address | Class |
|---|---|
| 0x141348690 | CCmdActionManagerAbstract |
| 0x14134aec8 | CCmdActionManager (generic) |
| 0x1415d3fa8 | CCmdActionManager_FreeFall |
| 0x1415d4048 | CCmdActionManager_Throw |
| 0x1415d4428 | CCmdActionManager_PutObj |
| 0x1415d44f8 | CCmdActionManager_ThrowStopRotateOnStick |
| 0x1415d45b0 | CCmdActionManager_FreeFall_Interaction |
| 0x1415d4650 | CCmdActionManager_Sticker |
| 0x1415d46f0 | CCmdActionManager_Boomerang |
| 0x1415d3f38 | CCmdActionManager_Radicon |
| 0x14134ae58 | CCmdActionManager_StickAdapter |

---

### Phase 1 Key Findings: Vtable Slot Analysis

#### Total vtable structure: 93 base slots + 7 extended slots (100 total for derived classes)

**Slots 0-92**: Primary CUnitTaskAutomataAbstract interface
**Slots 93-99**: Framework methods added by intermediate class (shared by ALL tested classes)
**Slot 100+**: Second vtable (multiple inheritance) - mirrors primary slots

#### Override Frequency Analysis (8 EXVS2 classes tested)

**100% override rate (ALL classes override these = core behavior interface):**

| Slot | Base Function | Purpose (deduced) |
|------|------|------|
| 0 | sub_14063B590 | **Destructor** - cleanup + free memory |
| 2 | sub_140673A40 | **OnInit/PostConstruct** - read parameters, setup hit effects |
| 3 | sub_140602840 | **Constructor helper** |
| 12 | sub_140673170 | **OnUpdate/Tick** - main per-frame lifecycle |
| 21 | sub_140672C40 | **PreInit** - early initialization step |
| 23 | sub_14035E760 | **GetTypeFlags** or size-related |
| 28 | sub_14063BBD0 | **GetClassId** - returns constant identifier (e.g. 465 for FreeFall) |
| 54 | sub_14066E870 | **CanHitTarget** - distance-based hit check |
| 55 | sub_14066E860 | **ShouldCancel** - distance-based cancel check |
| 70 | sub_140674530 | **OnParamChanged** - stores updated param |
| 71 | nop | **OnTrigger** - activation trigger (delegates to vtable[94]) |
| 73 | sub_140673940 | **OnCollisionCheck** - collision response with timer |
| 77 | sub_140674200 | **OnSpawnHitEffects** - iterates and spawns hit effects |
| 78 | sub_14063B690 | **Factory/Constructor** - creates the UnitTask instance |
| 79 | nop | **ConfigureDamageInfo** - sets damage type/flags on output struct |

**Partially overridden (behavior-category specific):**

| Slot | Override Rate | Purpose |
|------|------|------|
| 22 | 4/8 | Extended init (Throw types) |
| 76 | 4/8 | Additional behavior hook (Throw types) |
| 81 | ALL (purecall in base) | **CreateCmdActionManager** - CRITICAL factory |
| 84 | varies by type | Configuration (Summon types override differently) |
| 87-89 | varies by type | Additional hooks (Summon types) |

#### Framework Slots (never overridden - same across all classes)

| Slot | Function | Purpose |
|------|------|------|
| 93 | sub_14066D900 | GetMode - returns mode from params+328 |
| 94 | sub_14066DAF0 | GetPhysicsComponent |
| 95 | sub_1406A56E0 | **FindNearestTarget** - 3D distance search across 12 slots |
| 96 | sub_1406A5200 | GetHitEffectCount - from params+400 |
| 97 | sub_1406A5210 | GetHitEffectIdAt(index) - from array params+336 |
| 98 | sub_1406A5180 | GetHitEffectParamAt(index) - from array params+340 |
| 99 | sub_1406A5B20 | Reset/Configure (thunks to sub_1406A6400) |

#### Slot 12 (OnUpdate) Call Chain

```
Derived::OnUpdate (e.g. FreeFall slot 12)
  └── Iterates hit effects, calls SpawnHitEffect for each
      └── sub_14066D910 (framework "collision setup + delegate to base")
          ├── Sets collision bitmask
          └── Base::OnUpdate (sub_140673170)
              ├── UpdatePhysics (sub_14062A7B0)
              ├── Call vtable[65] - PreMotion hook
              ├── Call vtable[66] - IsAlive check
              ├── If alive:
              │   ├── UpdateMotion
              │   ├── Call vtable[67] - PostMotion hook
              │   ├── CheckCollision
              │   └── Call vtable[72] - OnHit handler
              └── Additional processing if special data exists
```

#### CCmdActionManager_FreeFall::Execute (slot 1) Analysis

The "Execute" method (the core behavior creator):
1. Allocates physics body (0x80 bytes)
2. Reads parameters via hash lookup (sub_1405B2980 with various hash keys):
   - Initial velocity vector (3 components)
   - Gravity/acceleration vector (3 components)
   - Lifetime duration
   - Rotation parameters
   - Misc configuration flags
3. Creates action sequence:
   - `CCmdAction_WaitForLifeTimeEnd` (monitors expiration)
   - `CCmdActionGroup_Series` (sequential action chain)
   - Additional action for gravity/spin
4. Registers all actions to the action manager

**Parameter reading pattern**: `sub_1405B2980(dataStore + 2904, &output, keyPtr, &hashKey)`
- Uses hash values to look up parameters from a centralized data store
- These are the same hashes used in the hit_effect dispatch system

---

### Object Layout Summary

```
CUnitTaskAutomata object (size ~0x3530 = 13616 bytes):
  +0x0000: vtable pointer
  +0x0451: flags byte
  +0x0BD8: some pointer (offset 3032)  
  +0x2E50: component pointer (offset 11856)
  +0x2E30: timeline/frame data (offset 11824)
  +0x2F68: collision component (offset 12136)
  +0x3498: hit_effect_params pointer (offset 13472) -> parameter data block
  +0x34A8: physics_component pointer (offset 13480)
  +0x34B8: collision_handler pointer (offset 13496)
  +0x34D8: auxiliary_data pointer (offset 13528)
  +0x34F0: special_processing pointer (offset 13552)
  +0x3518: timer/counter (offset 13592)
  +0x3520: cached_param (offset 13600)
  +0x3530: additional_data (offset 13616) [used by Boomerang for countdown]
```

```
Parameter data block (pointed to by +13472):
  +0x0148: mode/state (offset 328)
  +0x0150: hit_effect_id_array[8] (offset 336, 8 bytes each)
  +0x0190: hit_effect_count (offset 400)
  +0x0198: hit_effect_info (offset 408+)
  +0x01A0: config_flags (offset 416+)
  +0x01A1: flag_useTargetTracking (offset 417)
  +0x01A3: flag_disableRotation (offset 419)
  +0x01A4: flag_spawnLocked (offset 420)
  +0x01B0: damage_data (offset 432)
```

---

### Phase 3: Hash 0x0D6A5CD5 Dispatch Analysis

**Conclusion**: 0x0D6A5CD5 (decimal: 225074389) is NOT a class ID. It is a **parameter lookup hash key** used with `sub_1405B2980(dataStore + 2904, &output, keyPtr, &hashKey)` to read the "hit_effect_type" field from the centralized parameter store.

**Usage pattern** (in `sub_14066D730`):
```
For each child object with type flag 0x80:
    Read hit_effect_type via hash 0x0D6A5CD5 from child's data
    If matches target type → return this child
    If multiple matches → pick lowest priority (params+160)
```

**UnitTask Creation Flow**:
1. At startup: each class calls registration (e.g., `sub_140921530`)
2. Registration stores constructor pointer in global table (offset 520 in 0x220-byte record)
3. At runtime: system looks up the registered constructor for desired type
4. Constructor: `allocate(0x3530)` → `memset(0)` → `sub_1406A4CF0(base_init)` → set EXVS2 vtable
5. Post-construct: engine calls vtable[21] (PreInit) → vtable[2] (OnInit) → vtable[81] (CreateCmdActionManager)

### Phase 2 Partial: CCmdActionManager Analysis

**CCmdActionManager_Throw::BuildPipeline** (sub_140DEA2C0):
- Creates CCmdActionGroup_Series
- Adds CCmdAction_TerminateSeriesEnd  
- Reads rotation params (hash 1261973028, 1010769586, -1523167480) → degrees to radians
- Calls main throw setup with rotation vector + config flags

**CCmdActionManager_Boomerang::BuildPipeline** (sub_140DEC4F0):
- Phase 1: CCmdAction_StandardHomingMoveSet (outward homing) + WaitForLifeTimeEnd
- Phase 2: CCmdAction_WaitByFrame (return timing) + Blank + Return motion + SetIntersectEnableMode(off)
- Reads hash 850177019 (config) and 1280698941 (lifetime)

---

### Completed Steps
1. ~~Locate vtable~~ DONE (0x1413446a0, 93+7 slots)
2. ~~Decompile vtable methods~~ DONE (15 core + 7 framework slots documented)
3. ~~Analyze hash dispatch~~ DONE (parameter lookup key, not class ID)
4. ~~Sample CCmdActionManager types~~ DONE (FreeFall, Throw, Boomerang)
5. ~~Create abstracted reference document~~ DONE (vtable-reference.md)
6. ~~Document template~~ DONE (creation + proxy templates in reference)

### Remaining Work
- [ ] Analyze Summon/Assist CCmdActionManager types
- [ ] Analyze Anchor (multi-phase hook) CCmdActionManager
- [ ] Analyze Radicon (player-controlled) behavior
- [ ] Analyze FunnelSwarm (multi-entity) pattern
- [ ] Complete the hash → parameter name mapping table
- [ ] Trace full creation from MSC syscall to UnitTask spawn
