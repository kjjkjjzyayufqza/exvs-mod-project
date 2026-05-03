# UnitTaskAutomata IDA Pro Decompilation Results

## 1. Parameter Lookup System (Verified via IDA)

### 1.1 Core Lookup Function: `sub_1405B2980`

```cpp
// Simplified decompilation:
int ParamLookup(int64 dataStore_plus_2904, int* output, int64* keyState, uint* hashKey) {
    int64 keyBase = keyState[0];  // base pointer from data context
    if (!keyBase) return -1;
    
    int64* descriptor = LookupCommandDescriptorByHash(keyBase, &temp, *hashKey);
    int64 dataBase = keyState[1];
    int64 offsetTable = *descriptor;
    
    if (!output || !dataBase || !offsetTable) return -1;
    
    // Final value: read DWORD from (dataBase + offsetTable[keyBase] + keyBase)
    *output = *(int*)(dataBase + *(int64*)(offsetTable + keyBase) + keyBase);
    return 0;
}
```

### 1.2 Hash Lookup: `LookupCommandDescriptorByHash` (sub_1401A8BD0)

```cpp
// Binary search on sorted hash array
int64* LookupCommandDescriptorByHash(int64 hashTable, int64* result, uint targetHash) {
    int count = *(int*)(hashTable + 20);      // number of entries
    int* entries = (int*)(hashTable + 32);     // sorted hash array
    int* end = entries + count;
    
    // Standard binary search
    while (count > 0) {
        if (entries[count/2] >= targetHash)
            count /= 2;
        else {
            entries += count/2 + 1;
            count -= count/2 + 1;
        }
    }
    
    if (entries < end && *entries == targetHash) {
        // Found: return offset to value in the data block
        *result = end + 12 * ((entries - hashTable - 32) >> 2) - hashTable;
        return result;
    }
    *result = 0;
    return result;
}
```

**Key insight**: The parameter store uses a sorted array of hash keys with binary search. Each hash maps to an offset that points into the data block where the actual value is stored.

### 1.3 Complete Hash → Parameter Mapping (15 verified keys)

| Hash (signed) | Hash (hex) | Deduced Name | Context | Used By |
|---|---|---|---|---|
| -1918742070 | 0x8DA251CA | `terminal_velocity` | Maximum speed cap | FreeFall |
| -1571058927 | 0xA25B8B11 | `gravity_y` | Gravity/accel Y component | FreeFall, PutObj, FreeFall_Interaction |
| -1523167480 | 0xA5364F08 | `velocity_z` | Initial velocity Z / rotation Z | ALL managers |
| -1410480326 | 0xABEDC73A | `bounce_factor` | Restitution coefficient | FreeFall |
| -731733189 | 0xD462A33B | `sub_effect_count` | Additional effect loop count | FreeFall, FreeFall_Interaction, Boomerang |
| -715342969 | 0xD55CBB87 | `gravity_x` | Gravity/accel X component | FreeFall, PutObj, FreeFall_Interaction |
| -588580948 | 0xDCEAF7AC | `spin_speed` | Rotation speed per frame | FreeFall, FreeFall_Interaction, Boomerang |
| -89824932 | 0xFAA5615C | `friction` | Air resistance / drag factor | FreeFall |
| 225074389 | 0x0D6A5CD5 | `hit_effect_type` | Dispatch key for child lookup | sub_14066D730 |
| 346751088 | 0x14AB0070 | `spin_on_spawn` | Enable initial rotation (0/1) | FreeFall |
| 850177019 | 0x32ACABFB | `boomerang_config` | Boomerang mode configuration | Boomerang |
| 995285675 | 0x3B52DAAB | `gravity_z` | Gravity/accel Z component | FreeFall, PutObj, FreeFall_Interaction |
| 1010769586 | 0x3C3F1EB2 | `velocity_y` | Initial velocity Y / rotation Y | ALL managers |
| 1261973028 | 0x4B382E24 | `velocity_x` | Initial velocity X / rotation X | ALL managers |
| 1094933478 | 0x41435BE6 | `shot_bullet_id` | Sub-bullet ID to fire (0=none) | Detonator |
| 1107022401 | 0x41FBD241 | `attached_effect_id` | Attached VFX ID | ShockHalo |
| 1280698941 | 0x4C55EA3D | `lifetime` | Duration in frames / fuse timer | FreeFall, Boomerang, FreeFall_Interaction, Detonator |
| 1737628893 | 0x678B5CDD | `wait_before_action` | Wait frames before action phase | Shared Execute template |
| -1040219636 | 0xC1FF820C | `return_effect_id` | GlobalEffect ID for return phase | FreeFly |
| -1553624147 | 0xA36593AD | `sound_effect_id` | SE (sound effect) ID | Anchor |

---

## 2. Registration System (sub_140921530)

```cpp
// Simplified decompilation:
Record* RegisterUnitTaskClass() {
    int64 globalTable = qword_14241E7F8;
    int64 slot = FindOrAllocSlot(globalTable);
    
    Record** list = *(Record***)(*(int64*)(slot + 216) + 16);
    
    // Expand if full
    if (list[2] == list[3])
        GrowArray(list + 1, 1);
    
    // Zero-init new 0x220 (544) byte record
    memset(list[2], 0, 0x220);
    list[2] += 544;  // advance write pointer
    
    Record* record = list[2] - 544;
    record->offset_520 = sub_14092ACC0;  // default constructor
    record->offset_512 = 0;              // class ID (to be set by caller)
    record->offset_528 = 0;              // flags
    return record;
}
```

**Record layout (0x220 = 544 bytes)**:
- offset 512 (0x200): class type ID
- offset 520 (0x208): constructor function pointer
- offset 528 (0x210): additional flags

---

## 3. Hit Effect Dispatch (sub_14066D730)

```cpp
// Simplified decompilation:
int64 FindChildByHitEffectType(int64 parent, uint targetType) {
    int64 bestMatch = 0;
    uint childIter;
    
    if (!GetFirstChild(parent, &childIter))
        return 0;
    
    do {
        int64 child = GetChildByIter(parent, childIter);
        if (!child) continue;
        
        // Only check children with type flag 0x80
        if ((child->vtable->GetTypeFlags(child) & 0x80) == 0) continue;
        
        int64 childData = child->offset_11808;
        
        // Read hit_effect_type via hash 0x0D6A5CD5
        int childType;
        ParamLookup(GetDataStore() + 2904, &childType, 
                    childData + 56, &HASH_0x0D6A5CD5);
        
        if (childType == targetType) {
            // Direct match found
        } else {
            // Recurse into child's children
            child = FindChildByHitEffectType(child, targetType);
            if (!child) continue;
        }
        
        // Priority selection: lower priority value wins
        if (!bestMatch || 
            *(int*)(bestMatch->offset_11808 + 160) >= 
            *(int*)(child->offset_11808 + 160)) {
            bestMatch = child;
        }
    } while (GetNextChild(parent, &childIter));
    
    return bestMatch;
}
```

**Key findings**:
- Recursive tree search through child objects
- Filters by type flag 0x80 (projectile/hit effect)
- Uses hash 0x0D6A5CD5 to read `hit_effect_type` from each child's data
- Priority system at data+160: lower value = higher priority

---

## 4. Factory Function (FreeFall: sub_14094DF60)

```cpp
UnitTask* FreeFallFactory(int64 unused, int64 a2, uint64 a3) {
    void* obj = Allocate(0x1C0);  // 448 bytes for CCmdActionManager wrapper
    if (!obj) return NULL;
    
    memset(obj, 0, 0x1C0);
    BaseInit(obj);                 // sub_1406A4D20: zero fields + init arrays
    obj->offset_432 = 1075838976; // float 2.5 (default config value)
    return obj;
}
```

**Note**: The UnitTask entity itself is 0x3530 bytes. The factory here creates the CCmdActionManager wrapper object (0x1C0 bytes). The entity allocation happens in the engine framework.

---

## 5. OnInit (sub_1406A5BA0 — shared EXVS2 init)

```cpp
void EXVS2_OnInit(int64 this) {
    sub_14066DAA0();  // base framework init
    
    // If target tracking enabled
    if (*(byte*)(this->params + 417)) {
        int64 target = FindLinkedEntity(this);
        this->cached_param_13600 = vtable[95](this, target->data);
        // GetClassId from target's linked object
    }
    
    // If rotation disabled
    if (*(byte*)(this->params + 419))
        *(byte*)(this->data_11808 + 48) = 0;  // disable rotation flag
    
    vtable[99](this);  // ResetActions
    
    // Spawn hit effects
    int count = vtable[96](this);  // GetHitEffectCount
    for (int i = 0; i < count; i++) {
        int effectId = vtable[97](this, i);    // GetHitEffectIdAt
        int effectParam;
        vtable[98](this, &effectParam, i);     // GetHitEffectParamAt
        SpawnHitEffect(this, effectId, 0, effectParam);
    }
}
```

---

## 6. OnUpdate Chain (EXVS2 FreeFall: sub_1406A5B30)

```cpp
void FreeFall_OnUpdate(int64* this) {
    // Iterate hit effect slots (2 slots in this object layout)
    uint* effectSlots = (uint*)(this[1684] + 408);  // params + 408
    for (int i = 0; i < 2; i++) {
        if (effectSlots[i] != -1)
            ProcessHitEffect(this, effectSlots[i]);
    }
    
    // Delegate to EXVS2 framework update
    EXVS2_FrameworkUpdate(this);  // sub_14066D910
}
```

### 6.1 Framework Update (sub_14066D910)

```cpp
void EXVS2_FrameworkUpdate(int64 this) {
    // Check if timeline frame is negative (needs setup)
    if (*(int*)(this->timeline_11824 + 152) < 0) {
        uint physicsMode = GetPhysicsMode(this->physics_13480);
        
        if (physicsMode <= 1) {
            // Reset timer if negative
            if (*(int*)(this + 13592) < 0) {
                ResetCollisionState(this->collision_13520);
                *(int*)(this + 13592) = 0;
            }
            
            // Set collision bitmask for all 16 slots
            for (int slot = 0; slot < 16; slot++) {
                collisionData[slot] |= (1LL << (physicsMode & 0x3F));
                if (physicsMode == 0)
                    collisionData[slot + 16] |= 1;
            }
        }
    }
    
    // Call base class OnUpdate (the main tick)
    Base_OnUpdate(this);  // sub_140673170
    
    // Clear special processing pointer
    *(int64*)(this + 13584) = 0;
}
```

---

## 7. Combat Functions

### 7.1 CanHitTarget (sub_1406A5980)

```cpp
bool CanHitTarget(Entity* this) {
    if (!this->params->config_flags_416) 
        return BaseCanHitTarget();  // fallback
    
    Entity* target = FindLinkedEntity(this->data_11808);
    if (!target || !(target->GetTypeFlags() & 2))
        target = NULL;
    
    int64 targetData = target->offset_11800;
    int targetFlags = *(int*)(targetData + 368);
    
    // Quick check: if flags >= 0, use cached result
    if (targetFlags >= 0)
        return *(byte*)(targetData + 466);
    
    // Check if same battle group (matching flag bits)
    if (SameBattleGroup(this->data, targetData))
        return *(byte*)(targetData + 466);
    
    // Full 3D distance check
    float3 delta = this->position - target->position;
    float dist = sqrt(dot(delta, delta));
    
    // Look up hit range from parameter table
    int64 rangeData = GetRangeTable(target);
    float hitRange = LookupRange(rangeData + 215560, GetBulletParamId(this));
    
    return hitRange > dist;  // within range = can hit
}
```

### 7.2 ShouldCancel (sub_1406A57D0)

```cpp
bool ShouldCancel(Entity* this) {
    // Same structure as CanHitTarget but INVERTED
    // ... (identical target resolution)
    
    float dist = sqrt(dot(delta, delta));
    float cancelRange = LookupRange(rangeData + 215560, GetBulletParamId(this));
    
    return dist >= cancelRange;  // beyond range = should cancel
}
```

### 7.3 ConfigureDamageInfo (FreeFall: sub_140DDC8C0)

```cpp
void ConfigureDamageInfo(int64 this, DamageInfo* out) {
    out->type = 1;           // damage type: projectile
    out->flags = 1;          // active
    out->power_primary = 256;   // base damage
    out->power_secondary = 258; // secondary damage value
    out->hitStun = 0;        // no hit stun
}
```

### 7.4 FindNearestTarget (sub_1406A56E0)

```cpp
int64 FindNearestTarget(Entity* this, TargetSlot* slots) {
    float closestDist = 1000.0f;
    int bestType1 = -1;  // type 1 = attack target (preferred)
    int bestType2 = -1;  // type 2 = secondary target
    
    for (int i = 0; i < 12; i++) {
        if (!slots[i].id) continue;
        
        if (slots[i].type == 2 && bestType2 < 0)
            bestType2 = i;
        
        if (slots[i].type == 1) {
            Entity* target = GetEntityById(linked, slots[i].id);
            float3 delta = this->position - target->position_1216;
            float dist = length(delta);
            
            if (dist <= closestDist) {
                closestDist = dist;
                bestType1 = i;
            }
        }
    }
    
    // Prefer type 1 (attack) over type 2 (secondary)
    if (bestType1 >= 0)
        return &slots[bestType1];
    if (bestType2 >= 0)
        return &slots[bestType2];
    return NULL;
}
```

---

## 8. CCmdActionManager Execute Decompilations

### 8.1 CCmdActionManager_FreeFall::Execute (sub_140DE9BD0)

**Pipeline:**
```
Physics Body (0x80 bytes)
  ├── BulletFlyFunction (sub_1406A64D0) — reads:
  │     velocity_x (hash -1523167480), velocity_y (1010769586), velocity_z (1261973028)
  │     gravity_x (-715342969), gravity_y (-1571058927), gravity_z (995285675)
  │     lifetime (1280698941), spin_speed (-588580948), 
  │     bounce_factor (-1410480326), friction (-89824932)
  │     terminal_velocity (-1918742070)
  │   Stores: velocity→offset_80, gravity→offset_64, lifetime→offset_96,
  │     spin_speed→offset_100, bounce→offset_104, friction→offset_108, maxspeed→offset_44
  │
  ├── CCmdAction_WaitForLifeTimeEnd (lifetime=0, mode=2)
  │
  └── CCmdActionGroup_Series
        ├── [GravitySpinAction] (sub_140DE9B00) — reads params+432
        │   Conditional: if spin_on_spawn (346751088) != 0 → mode=2
        ├── [Optional: sub_1406B1710] — if sub_effect_count (-731733189) > 0
        │   Additional rotation/spin effect
        └── (registered to physics body)

Final: sub_1406A13E0(keyValues, context, 8) — post-init with mode=8
```

### 8.2 CCmdActionManager_Throw::Execute (sub_140DEA280)

**Pipeline:**
```
This is a THIN WRAPPER that delegates to vtable[3] of the manager itself:
  1. Gets InstanceKeyValuePtr
  2. Calls vtable[3](this, keyValues, context)

The actual Throw pipeline is built by the subclass vtable[3] implementation.
```

### 8.3 CCmdActionManager_PutObj::Execute (sub_140DEAD10)

**Pipeline:**
```
Conditional prefix (if params+436):
  ├── CCmdAction_VernierController_Start — reads params+440, params+444
  │   Handles vernier/thruster visual effect
  └── CCmdAction_DustController_Start — reads params+448
      Handles dust/debris visual effect

Physics Body (0x80 bytes)

Sub-pipeline (sub_140DEACA0, 0xC0 bytes):
  Reads: rotation_z (-1523167480), rotation_y (1010769586), rotation_x (1261973028)
  Reads: lifetime (1280698941)
  Stores rotation → packed XMM vector at offset 160
  Stores lifetime → offset 176, mode → 0x40000000 at offset 180
  
CCmdAction_RotateOffsetBone:
  Reads: gravity_x (-715342969) → degrees→radians
  Reads: gravity_y (-1571058927) → degrees→radians  
  Reads: gravity_z (995285675) → degrees→radians
  Packs into rotation vector at offset 48
  
CCmdAction_WaitByFrame(1800) — 30 second timeout (safety)

Delegates to vtable[3] for final setup

CCmdAction_Blank — separator

Conditional tail: if params+452 == 1:
  sub_1406A13E0(keyValues, context, 10) — special mode 10
```

### 8.4 CCmdActionManager_Boomerang::Execute (sub_140DEBFF0)

**Pipeline:**
```
Phase 1 - Outward:
  CCmdActionGroup_Series (outer)
    ├── [Optional: CCmdAction_PlayLoopSE] — if config hash (-3893601250) != 0
    │   Sound effect with looping
    │
    ├── CCmdActionGroup_Series (inner — movement)
    │   Built by vtable[3] and sub_14068E160 (homing setup)
    │   Mode = 2
    │
    └── [Optional: CCmdAction_StopLoopSE(1000)] — stops loop sound

Reads: rotation_z (-1523167480), rotation_y (1010769586), rotation_x (1261973028)
  All converted: degrees → radians (value * PI / 180.0)

Reads config flags: params+433, params+100, params+432

Calls: sub_1406A1610(keyValues, context, outerSeries, &rotationVector, 
                      flag_432, flag_100, flag_433)
  — Main throw/boomerang motion setup with rotation
```

### 8.5 CCmdActionManager_Sticker::Execute (sub_140DEBEB0)

**Pipeline:**
```
Get stick lifetime from vtable[100](this) — negative = absolute frames

If lifetime < 0:
  CCmdAction_CauseStick — triggers stick attachment
    stick_param = lifetime value (negative number)

sub_14068E160(this+48, keyValues, context) — setup chain

CCmdAction_Blank — terminator separator

Calls: unknown_libname_23(this+232, blank, keyValues) — finalize
```

### 8.6 CCmdActionManager_FreeFall_Interaction::Execute (sub_140DEB820)

**Pipeline:**
```
Physics Body (0x80 bytes)

Read spawn matrix → compute initial direction vectors (v9, v10)

BulletFlyFunction (sub_1406A6530, 0x50 bytes):
  Reads: velocity_z (-1523167480), velocity_y (1010769586), velocity_x (1261973028)
    → Transform by spawn matrix to get world-space initial velocity
  Reads: gravity_x (-715342969), gravity_y (-1571058927), gravity_z (995285675)
    → Transform by spawn matrix to get world-space gravity
  Reads: lifetime (1280698941)
  Stores: velocity→offset_48, gravity→offset_32, lifetime→offset_64

CCmdAction_WaitForLifeTimeEnd (lifetime=0, mode=2)

CCmdActionGroup_Series (bounce phase):
  Reads: bounce_wait_frames (-588580948 as int)
  ├── CCmdAction_WaitByFrame(bounce_wait_frames) — delay before bounce
  └── CCmdAction_SetCollisionEnableModeForShell(1) — enable stage collision

Optional additional effect series (if sub_effect_count != 0):
  CCmdActionGroup_Series
    ├── [GravitySpinAction] — reads params+432
    └── [RotationEffect] — sub_1406B1710 with effect count

Register physics body to action manager
```

---

## 9. Framework Extended Slots (93-99) Verified

| Slot | Function | Decompiled Behavior |
|------|----------|-------------------|
| 93 | `sub_14066D900` | `return *(uint*)(this->params_13472 + 328)` — GetMode |
| 94 | `sub_14066DAF0` | `return GetPhysicsBody(this->physics_13480)` — GetPhysicsComponent |
| 95 | `sub_1406A56E0` | Iterate 12 target slots, 3D distance sort, prefer type=1 over type=2 |
| 96 | `sub_1406A5200` | Returns count from params (not decompiled, trivial getter) |
| 97 | `sub_1406A5210` | Returns hit effect ID at index (not decompiled, trivial getter) |
| 98 | `sub_1406A5180` | Returns hit effect param at index (not decompiled, trivial getter) |
| 99 | `sub_1406A5B20` | Thunks to `sub_1406A6400` — ResetActions/ReconfigureActions |

---

## 10. CRITICAL FINDING: Shared Execute Template Pattern

### 10.1 Discovery

**Most CCmdActionManagers share the SAME Execute function** (`sub_14068E280`). This is a **Template Method Pattern** where the base Execute builds a common pipeline skeleton, and subclass virtual methods fill in the specific behavior.

| Manager | Execute Function | Specific Behavior Slot (vtable[3]) |
|---------|-----------------|-----------------------------------|
| FreeFall | `sub_140DE9BD0` (UNIQUE) | `0x141c685b0` (data ptr) |
| Throw | `sub_140DEA280` (THIN WRAPPER→vtable[3]) | `sub_140DEA2C0` |
| Boomerang | `sub_140DEBFF0` (UNIQUE) | `sub_140DEC4F0` |
| PutObj | `sub_140DEAD10` (UNIQUE) | nop |
| Sticker | `sub_140DEBEB0` (UNIQUE) | `0x141c68aa0` (data ptr) |
| FreeFall_Interaction | `sub_140DEB820` (UNIQUE) | `0x141c689d0` (data ptr) |
| **Anchor** | `sub_14068E280` (SHARED) | `sub_14068DFD0` |
| **Summon** | `sub_14068E280` (SHARED) | `sub_14068DFD0` |
| **SummonRush** | `sub_14068E280` (SHARED) | `sub_14068DFD0` |
| **Radicon** | `sub_14068E280` (SHARED) | `sub_14068DFD0` |
| **ShockHalo** | `sub_14068E280` (SHARED) | `sub_14068DFD0` |
| **FreeFly** | `sub_14068E280` (SHARED) | `sub_14068DFD0` |
| **Detonator** | `sub_14068E280` (SHARED) | `sub_14068DFD0` |

### 10.2 Shared Execute Pipeline (sub_14068E280)

```
CCmdActionManagerBase::Execute(this, keyValues, context):
  │
  ├── Create CCmdAction_Blank (separator/anchor point)
  │
  ├── sub_14068E0A0(this, keyValues, context, this->mode, 0) — pre-setup
  │
  ├── Create CCmdActionGroup_Series (main action series)
  │   │
  │   ├── vtable[3](this, series, context) — SUBCLASS SPECIFIC SETUP
  │   │   This is where Summon/Anchor/Radicon/etc. add their movement
  │   │
  │   ├── Create Physics Body (0x80 bytes)
  │   │
  │   ├── If mode != 8:
  │   │   ├── CCmdAction_MoveTransStickingMatrix (stick movement)
  │   │   └── CCmdAction_WaitForOrderedReleaseSticks (wait for release)
  │   │
  │   ├── If config flag set:
  │   │   CCmdAction_WaitByFrame(hash 1737628893) — delay before next phase
  │   │   else: CCmdAction_TerminateStop — immediate stop
  │   │
  │   ├── If entity has "leaved" state:
  │   │   CCmdAction_WaitForLeaved (wait until departed)
  │   │
  │   ├── vtable[4](this, physicsBody, context) — SUBCLASS POST-MOTION
  │   ├── vtable[5](this, physicsBody, context) — SUBCLASS FINAL SETUP
  │   │
  │   └── Register physicsBody to series
  │
  ├── Create second CCmdActionGroup_Series (release phase)
  │   ├── sub_14068DDB0(...) — release stick setup
  │   ├── CCmdAction_ReleaseStick — release attachment
  │   └── vtable[8](this, series, context) — SUBCLASS CLEANUP
  │
  └── Register both series to keyValues
      Store references if this->flag_60 is set

Hash 1737628893 (0x678B5CDD) = wait_before_action_frames (new discovery!)
```

### 10.3 Sub_14068DFD0 (Shared Slot 3 for Summon/Anchor/Funnel types)

This is the common behavior setup called by Summon, Anchor, Radicon, ShockHalo, FreeFly, and Detonator. Each subclass further overrides this through additional virtual dispatch.

### 10.4 Key Architectural Insight

The CCmdActionManager hierarchy has TWO execution models:

**Model A: Direct Override** (FreeFall, Throw, Boomerang, PutObj, Sticker, FreeFall_Interaction)
- Each manager has its own unique Execute function
- Builds the entire pipeline from scratch
- Maximum control, minimum code reuse

**Model B: Template Method** (Summon, Anchor, Radicon, ShockHalo, FreeFly, Detonator)  
- All share `sub_14068E280` as Execute
- Common skeleton: setup → stick → wait → release
- Subclass provides behavior via vtable[3], vtable[4], vtable[5], vtable[8]
- More code reuse, behavior differences via virtual dispatch

This means for **creating new types**:
- Simple projectiles → Use Model A (copy FreeFall/Throw pattern)
- Complex multi-phase entities → Use Model B (subclass the template)
- The template automatically handles: stick, release, wait, leaved states
