# UnitTaskAutomata Decompiled Vtable Methods — Full Analysis

This document contains decompiled pseudocode and analysis for all critical vtable
methods in the CUnitTaskAutomata class hierarchy from `vsac27_Release.exe`.

---

## Table of Contents

- [Task 1: OnUpdate Chain](#task-1-onupdate-chain)
- [Task 2: Collision & Combat Slots](#task-2-collision--combat-slots)
- [Task 3: Framework Extended Slots 93-99](#task-3-framework-extended-slots-93-99)
- [Task 4: 000COMMON Type Overrides](#task-4-000common-type-overrides)
- [Cross-Reference Summary](#cross-reference-summary)

---

## Key Object Field Map

Before diving into the functions, here's the consolidated field offset map used
throughout the decompiled code:

| Offset | Type | Name (deduced) | Notes |
|--------|------|-----------------|-------|
| +0 | `void**` | `vtable` | Pointer to virtual method table |
| +1105 | `byte` | `skipPhysicsFlag` | If set, skips physics recalc in OnUpdate |
| +1120 | `struct` | `transformMatrix` | 4x4 transform or position data |
| +1168 | `struct` | `collisionVolume` | Bounding volume for collision tests |
| +1320 | `uint32` | `entityHandle` | Entity ID / object handle in world |
| +1460 | `float` | `scaleOrAlpha` | Set to 1.0f or ~0.015f based on invisTimer |
| +11808 | `ptr` | `pBaseComponent` | Base component (flags, state) |
| +11824 | `ptr` | `pLifetimeData` | Lifetime counter at +152; init flags at +144 |
| +11864 | `ptr` | `pCollisionBitset` | Bitset array for collision layer registration |
| +12136 | `ptr` | `pActionController` | CActionController — manages action pipeline |
| +12376 | `ptr` | `pHitProcessor` | Hit callback handler object |
| +13076 | `uint32` | `hitEffectIndex` | Current hit effect slot index (max 4) |
| +13088 | `struct[4]` | `hitEffectData` | Array of 96-byte hit effect entries |
| +13472 | `ptr` | `pParams` | Parameter data block |
| +13480 | `ptr` | `pPhysicsBody` | Physics component (position, velocity, etc.) |
| +13496 | `ptr` | `pMotionCtrl` | Motion controller |
| +13520 | `ptr` | `pCollisionCtrl` | Collision controller |
| +13528 | `ptr` | `pIntersectChecker` | Intersection/overlap tester |
| +13552 | `ptr` | `pDestroyCallback` | If non-null, triggers cleanup on update |
| +13584 | `qword` | `collisionResult` | Cleared after each update frame |
| +13592 | `int32` | `paramChangedFlag` | Set by OnParamChanged, cleared by update |
| +13600 | `uint32` | `targetSlotId` | Used by ResetActions for target lookup |

### pParams Field Sub-Offsets

| pParams + Offset | Type | Name (deduced) |
|------------------|------|-----------------|
| +80 | `struct` | `damageConfigBlock` |
| +88 | `byte` | `damageFlags` |
| +100 | `int` | `configFlags` |
| +116 | `byte` | `hasAutoCollision` |
| +140 | `byte` | `hasAdditionalModel` |
| +141 | `byte` | `hasExtendedAnim` |
| +142 | `byte` | `hasInitTimer` |
| +143 | `byte` | `allowCollisionFilter` |
| +324 | `int` | `collisionMode` (0=none, 1=destroy, 2=conditional) |
| +328 | `int` | `mode / state` |
| +336 | `int[8]` | `hitEffectIds` (per-index, 8 bytes stride) |
| +340 | `int[8]` | `hitEffectParams` (per-index, 8 bytes stride) |
| +400 | `int` | `hitEffectCount` |
| +408 | `int[2]` | `hitEffectSlots` (for FreeFall OnUpdate) |
| +416 | `byte` | `hasTargetTracking` |
| +417 | `byte` | `hasResetAction` |
| +432-435 | `byte[4]` | `throwConfigFlags` |
| +464 | `byte` | `actionControllerAnimFlag` |
| +466 | `byte` | `canHitFallback` |
| +468 | `byte` | `shouldCancelFallback` |
| +470 | `byte` | `hasLifetimeOverride` |

---

## Task 1: OnUpdate Chain

### 1.1 — sub_140673170: Base `OnUpdate` (vtable slot 12)

```cpp
void CUnitTaskAutomataAbstract::OnUpdate(this) {
    // Step 1: Pre-action update
    sub_14062A7B0(this->pActionController);  // ActionController::PreUpdate

    // Step 2: Call vtable[65] — PreMotion hook
    this->vtable[65](this);  // PreMotion (nop in base, override in subclasses)

    // Step 3: Call vtable[66] — IsAlive check
    if (!this->vtable[66](this))  // IsAlive returns false → skip everything
        return;

    // Step 4: If lifetime counter < 0 (active), run physics
    if (this->pLifetimeData->counter < 0)  // offset +152 of pLifetimeData
        sub_14068D520(this->pPhysicsBody);  // PhysicsBody::Step

    // Step 5: Update collision geometry (thunk → sub_14066F620)
    sub_14066E880(this);  // UpdateCollisionGeometry

    // Step 6: If no skip flag AND lifetime active, recalc physics
    if (!this->skipPhysicsFlag && this->pLifetimeData->counter < 0)
        sub_140672A60(this->pPhysicsBody);  // PhysicsBody::Recalculate

    // Step 7: Action controller main update
    v3 = this->pActionController;
    sub_14062A840(v3);  // ActionController::ProcessActions
    sub_14062A8E0(v3);  // ActionController::PostProcessActions

    // Step 8: Call vtable[67] — PostMotion hook
    this->vtable[67](this);  // PostMotion (nop in base)

    // Step 9: Check intersection → if hit, call vtable[72] (OnHit)
    if (sub_140671980(this->pIntersectChecker, &this->collisionVolume))
        this->vtable[72](this);  // OnHit handler

    // Step 10: If destroy callback pending, trigger cleanup
    if (this->pDestroyCallback)
        sub_140672040();  // DestroyAndCleanup
}
```

**Analysis:**
- This is the **master per-frame update loop** for all UnitTask entities.
- Execution order: PreAction → AliveCheck → Physics → Collision → Actions → PostMotion → HitTest → Cleanup.
- The `pLifetimeData->counter` at offset +152 acts as both a lifetime timer and an "is active" flag (negative = active).
- Vtable slots called: **65** (PreMotion), **66** (IsAlive), **67** (PostMotion), **72** (OnHit).

---

### 1.2 — sub_1406733F0: Sub-Update Helper (vtable slot 11)

```cpp
void CUnitTaskAutomataAbstract::SubUpdate(this) {
    // Step 1: Pre-collision setup
    sub_14066EC00();  // Global collision frame setup

    // Step 2: Enable physics collision flag
    this->pPhysicsBody[+40] = 1;  // physicsBody.collisionEnabled = true

    // Step 3: Update subsystems
    sub_140671AB0(this->pIntersectChecker);  // IntersectChecker::BeginFrame
    sub_1406710E0(this->pMotionCtrl);        // MotionCtrl::Update

    // Step 4: If base component shows non-zero status, skip extended update
    if (this->pBaseComponent[+160] == 0) {
        sub_1406710F0(this->pMotionCtrl);     // MotionCtrl::PostUpdate

        if (this->pParams[+116])              // hasAutoCollision flag
            sub_14063C450(this);               // RegisterAutoCollision

        sub_140672A80(this->pPhysicsBody);    // PhysicsBody::UpdateBounds

        if (this->pParams[+141])              // hasExtendedAnim flag
            this->pActionController[+464] = 1; // enable anim flag
    }

    // Step 5: Invisibility timer management
    v2 = this->pLifetimeData;
    if (v2[+144]) {   // initTimer != 0
        this->scaleOrAlpha = 0.015f;  // 1017370378 as float = ~0.015
        v2[+144]--;                   // decrement timer
    } else {
        this->scaleOrAlpha = 1.0f;    // 1065353216 as float = 1.0
    }
}
```

**Analysis:**
- Called **before** the main OnUpdate as setup/pre-processing.
- Manages per-frame collision registration, motion updates, and an "invisibility timer" that makes the projectile nearly invisible for N frames after spawn (fade-in effect).
- The `scaleOrAlpha` field at +1460 is set to either 0.015f (invisible) or 1.0f (fully visible).
- Constants: `1017370378` = `0x3C8727FA` ≈ 0.0165f; `1065353216` = `0x3F800000` = 1.0f.

---

### 1.3 — sub_14066D910: EXVS2 Intermediate `OnUpdate` Wrapper (slot 12 override)

```cpp
void EXVS2_IntermediateClass::OnUpdate(this) {
    // Step 1: Only if lifetime is active (counter < 0)
    if (this->pLifetimeData->counter < 0) {
        // Step 2: Get collision group from physics body
        uint collisionGroup = sub_140689B50(this->pPhysicsBody);

        if (collisionGroup <= 1) {
            // Step 3: Process param change flag
            if (this->paramChangedFlag < 0) {
                sub_14066FCC0(this->pCollisionCtrl);  // CollisionCtrl::Invalidate
                this->paramChangedFlag = 0;           // clear flag
            }

            // Step 4: Register collision bits for ALL 16 layers
            ptr = this->pCollisionBitset;
            for (i = 0; i < 16; i++) {
                // Set bit 'collisionGroup' in layer i
                ptr[i * 8 + (collisionGroup >> 6)] |= (1ULL << (collisionGroup & 0x3F));

                // If collisionGroup == 0, also set bit 0 in secondary bitset
                if (collisionGroup == 0)
                    ptr[i * 8 + 128] |= 1;
            }
        }
    }

    // Step 5: Call base OnUpdate
    CUnitTaskAutomataAbstract::OnUpdate(this);  // sub_140673170

    // Step 6: Clear collision result
    this->collisionResult = 0;
}
```

**Analysis:**
- This is the **EXVS2 framework layer** that wraps the base OnUpdate.
- Before calling base, it registers the entity's collision bits across all 16 collision layers. This ensures the projectile participates in collision detection.
- The `paramChangedFlag` at +13592 is set externally (by OnParamChanged/slot 70) and cleared here each frame.
- The collision bitset at offset +11864 uses a 64-bit bitfield per layer.

---

### 1.4 — sub_1406A5B30: FreeFall EXVS2 `OnUpdate` (overrides slot 12)

```cpp
void CUnitTaskAutomata_FreeFall::OnUpdate(this) {
    // Step 1: Process hit effect slots from params
    uint* hitSlots = (uint*)(this->pParams + 408);  // 2-element array
    for (int i = 0; i < 2; i++) {
        if (hitSlots[i] != 0xFFFFFFFF)  // -1 = "no effect"
            sub_1406A5040(this, hitSlots[i]);  // ProcessHitEffectSlot
    }

    // Step 2: Delegate to intermediate class OnUpdate
    EXVS2_IntermediateClass::OnUpdate(this);  // sub_14066D910
}
```

**Helper — sub_1406A5040: ProcessHitEffectSlot:**
```cpp
void ProcessHitEffectSlot(this, uint slotIndex) {
    owner = sub_14066E6B0();  // GetOwnerEntity
    physicsBody = this->pPhysicsBody_ext;  // offset 13480 via a1[1685]

    if (!owner)
        return sub_1406898E0(physicsBody);  // PhysicsBody::Deactivate

    ptr = owner->pCollisionBitset;  // owner.offset+11864
    lifetime = this->pLifetimeData;

    if (lifetime->counter >= 0)   // not active
        return;

    // Bounds check slotIndex < 16
    bits = ptr[slotIndex];
    if (bits & 2)
        return sub_1406898E0(physicsBody);  // Deactivate (bit 1 = "dead" flag)
    if (bits & 1)
        return sub_1406899D0(physicsBody);  // Activate (bit 0 = "alive" flag)
    if (bits & 4)
        return sub_1406A5120(this->pParams); // Special state (bit 2)
}
```

**Analysis:**
- FreeFall adds a **pre-update step** that reads 2 hit effect slots from params+408.
- For each valid slot (not -1), it checks the owner entity's collision bitset to decide whether to activate/deactivate the physics body.
- Bit meanings in collision bitset: `bit 0` = alive/active, `bit 1` = dead/deactivate, `bit 2` = special state.
- After processing these slots, it falls through to the standard intermediate update.

---

## Task 2: Collision & Combat Slots

### 2.1 — sub_140673940: Base `OnCollisionCheck` (vtable slot 73)

```cpp
char CUnitTaskAutomataAbstract::OnCollisionCheck(this, collisionContext) {
    // Step 1: Collision filter check
    if (this->pParams[+143]  // allowCollisionFilter
        && sub_1405E5070(g_WorldManager + 179976, collisionContext + 32))
    {
        // Copy collision source ID into damage info
        this->pParams_ext[+24] = *(collisionContext + 32);
    }

    // Step 2: Skip if lifetime has not started (counter >= 0)
    lifetime = this->pLifetimeData;
    if (lifetime[+160] >= 0)
        return;

    // Step 3: Validate entity handle in world
    g_world = g_WorldManager + 179976;
    sub_1405E4DE0(g_world, &handle, collisionContext + 32);

    if (!sub_1405E5070(g_world, collisionContext + 32))
        return;  // source entity no longer exists

    if (sub_1405E4FE0(g_world, handle))
        return;  // entity is flagged as "ignore collision"

    // Step 4: Dispatch to collision handler
    if (sub_14066FC40(this->pCollisionCtrl_ext, collisionContext)) {
        // Valid collision → call vtable[70] = OnParamChanged
        this->vtable[70](this, collisionContext + 32, collisionContext + 36);
    } else {
        // Invalid/filtered → just acknowledge
        sub_14068EAF0(this->pPhysicsBody_ext + 48);
    }
}
```

**Analysis:**
- The base collision check performs world-validation of the collision source before dispatching.
- Uses the global world manager (`g_WorldManager` at `qword_1421158A0 + 179976`) for entity lookups.
- Vtable slot called: **70** (OnParamChanged) when collision is valid.
- The collision context struct has: `+24` = flags byte, `+32` = source entity handle (uint32), `+36` = additional data.

---

### 2.2 — sub_14066DA30: FreeFall `OnCollisionCheck` Override (slot 73)

```cpp
void CUnitTaskAutomata_FreeFall::OnCollisionCheck(this, collisionContext) {
    // Step 1: Call base collision check first
    CUnitTaskAutomataAbstract::OnCollisionCheck(this, collisionContext);

    // Step 2: Check collision mode from params
    int collisionMode = this->pParams[+324];
    if (collisionMode == 0)  // no collision response
        return;

    // Step 3: Check if physics body is in "intersecting" state
    if (!sub_140689CD0(this->pPhysicsBody_ext + 2372))
        return;  // no actual physical overlap

    // Step 4: Handle based on mode
    int mode = collisionMode - 1;
    if (mode == 0) {
        // Mode 1: Always destroy on collision
        this->vtable[94](this);  // GetPhysicsComponent → triggers destroy
    } else if (mode == 1 && collisionContext[+24]) {
        // Mode 2: Conditional destroy (only if flag byte set)
        this->vtable[94](this);
    }
}
```

**Analysis:**
- FreeFall extends the base collision check with **mode-based destruction**.
- `collisionMode` values: 0 = no response, 1 = always destroy on hit, 2 = destroy only if collision flag is set.
- Vtable slot called: **94** (GetPhysicsComponent) — in this context used as a "kill self" trigger.
- The physics body overlap check at offset +2372 is a spatial intersection test.

---

### 2.3 — sub_140675550: Hit Processing (vtable slot 59)

```cpp
void CUnitTaskAutomataAbstract::HitProcessing(this, outWindow) {
    // Step 1: Pre-hit validation
    sub_14066ED60(this);  // ValidateHitState

    // Step 2: Allocate hit result structure (size 0x140 = 320 bytes)
    hitResult = sub_14044C4E0(0x140);
    if (hitResult)
        hitResult = sub_14062AC50(hitResult, 1, 8);  // Init hit result
    else
        hitResult = NULL;

    nu::Window_x64::InitializeForExistingWindow(outWindow, hitResult);

    // Step 3: Allocate damage output structure (size 0x188 = 392 bytes)
    damageOut = sub_14044C4E0(0x188);
    if (damageOut)
        damageOut = sub_14064E540(damageOut);  // Init damage output
    else
        damageOut = NULL;

    // Step 4: Look up entity in world
    entity = sub_1405E4800(g_WorldManager + 179976, &this->entityHandle);
    if (entity) {
        // Step 5: Write damage info from entity data
        sub_14064E6B0(damageOut, entity[+215600]);  // Copy damage definition
        sub_140A5D530(outWindow, damageOut);         // Apply to hit window

        // Step 6: Allocate hit effect structure (size 0x380 = 896 bytes)
        hitEffect = sub_14044C4E0(0x380);
        if (hitEffect)
            hitEffect = sub_140649860(hitEffect);  // Init hit effect object

        std::spfun(outWindow, hitEffect);  // Attach effect to window
    } else if (damageOut) {
        // Entity not found → clean up damage output
        damageOut->destructor(damageOut, 1);
    }
}
```

**Analysis:**
- Slot 59 constructs the "hit processing" output used by the combat system.
- Allocates three structures: hit result (320 bytes), damage output (392 bytes), hit effect (896 bytes).
- Reads damage definition from the entity at **offset +215600** (`0x34AB0`), which is a large offset into the entity/unit data — this is the **BulletParam/damage config table**.
- The `entityHandle` at offset +1320 is used for world lookups.
- The `nu::Window_x64` framework is used as a generic output container.

---

### 2.4 — sub_140675660: Damage Calc (vtable slot 60)

```cpp
void CUnitTaskAutomataAbstract::DamageCalc(this, outWindow) {
    // Step 1: Pre-damage validation
    sub_14066EE30(this);  // ValidateDamageState

    // Step 2: Allocate small damage result (size 0x38 = 56 bytes)
    result = sub_14044C4E0(0x38);
    if (result)
        result = sub_1406665A0(result, 1, 8);  // Init damage calc result

    nu::Window_x64::InitializeForExistingWindow(outWindow, result);
}
```

**Analysis:**
- Slot 60 is a **lightweight damage calculation** that produces a small 56-byte result struct.
- Much simpler than slot 59 — just allocates and initializes the damage output container.
- Likely used for quick damage queries without full hit processing.

---

### 2.5 — sub_140674410: OnHit Handler (vtable slot 72)

```cpp
void CUnitTaskAutomataAbstract::OnHit(this) {
    // Step 1: Check if hit processing is enabled
    if (this->pParams[+36] == 0)  // hit processing disabled
        return;

    // Step 2: Validate hit processor object
    hitProcessor = this->pHitProcessor;  // offset +12376
    if (!hitProcessor || !hitProcessor[+48])  // no handler or handler disabled
        return;

    // Step 3: Get current hit effect index (bounds check: max 4)
    idx = this->hitEffectIndex;  // offset +13076
    if (idx >= 4) error("invalid array subscript");

    // Step 4: Compute hit effect data pointers
    hitData    = this->hitEffectData[idx];    // +13088 + idx*96
    hitDataAlt = this->hitEffectData[idx+16]; // +13104 + idx*96
    hitRef     = this->hitEffectData[idx+56]; // +13144 + idx*96 → qword

    // Step 5: Filter check — skip if hit reference is "immune"
    if (hitRef && hitRef[+88] == 1 && hitRef[+96][+101])
        return;  // target has immunity flag

    // Step 6: Dispatch to hit processor callback
    hitProcessor->vtable[6](hitProcessor, &this->transformMatrix, hitData, hitDataAlt);

    // Step 7: Post-hit physics processing
    physBody = this->pPhysicsBody;
    if (physBody[+208]) {  // has pending force
        unknown_libname_23(physBody + 176, physBody[+208], physBody[+216]);
        sub_14068D520(physBody);  // PhysicsBody::Step — apply force
    }
}
```

**Analysis:**
- Called during OnUpdate (slot 12) when an intersection is detected.
- The `hitEffectData` array at +13088 stores up to 4 hit effect entries of 96 bytes each.
- Hit processing involves: bounds checking → immunity check → dispatcher callback → optional force application.
- The immunity check at `hitRef[+88] == 1` and `hitRef[+96][+101]` filters out targets that are invulnerable.
- Physics body force application at offsets +176, +208, +216 handles knockback/impact force.

---

### 2.6 — sub_140674530: OnParamChanged (vtable slot 70)

```cpp
void CUnitTaskAutomataAbstract::OnParamChanged(this, sourceHandle, dataPtr) {
    // Step 1: Look up source entity in world
    entity = sub_140365480(g_WorldManager + 179976, sourceHandle);
    if (!entity)
        return;

    // Step 2: Read damage value from entity data (bounds check index)
    idx = *dataPtr;
    if (idx >= 4) error("invalid array subscript");

    damageValue = entity[80 * idx + 104];  // damage at index in entity table
    result = max(damageValue, 0);           // clamp to non-negative

    // Step 3: If damage > 0 OR entity has lifetime override flag
    if (result > 0 || entity[+470]) {
        // Store collision/param data
        sub_14066FE00(
            this->pCollisionCtrl_ext,   // offset 13520 via a1[1690]
            sourceHandle,
            *dataPtr,
            this->pParams + 80,         // damage config block
            this->pParams[+88]          // damage flags
        );

        // Trigger physics body acknowledgment
        sub_14068EB10(this->pPhysicsBody_ext + 48);
    }
}
```

**Analysis:**
- Slot 70 is called when the projectile receives a parameter change (e.g., from collision callback).
- It looks up the source entity, reads a damage value indexed by the first DWORD of the data pointer, and stores collision info if damage is non-zero.
- The damage config block at `pParams + 80` and flags at `pParams + 88` are passed to the collision controller.
- The entity data table uses an 80-byte stride with damage at offset +104 within each entry.

---

## Task 3: Framework Extended Slots 93-99

### 3.1 — sub_14066D900: Slot 93 — `GetMode`

```cpp
int EXVS2_Framework::GetMode(this) {
    return this->pParams[+328];  // *(uint32*)(pParams + 328)
}
```

**Analysis:** Simple getter returning the current mode/state integer from the parameter block at offset +328 of `pParams`.

---

### 3.2 — sub_14066DAF0: Slot 94 — `GetPhysicsComponent`

```cpp
void* EXVS2_Framework::GetPhysicsComponent(this) {
    return sub_1406899D0(this->pPhysicsBody);  // offset +13480
}
```

**Analysis:** Returns the physics component via a wrapper call. `sub_1406899D0` likely performs an activation or reference-count operation on the physics body before returning it. Also used as a "trigger destroy" mechanism in collision handlers.

---

### 3.3 — sub_1406A56E0: Slot 95 — `FindNearestTarget`

```cpp
ptr EXVS2_Framework::FindNearestTarget(this, targetArray) {
    // Step 1: Get owner entity
    owner = sub_14066E6B0(this);
    if (!owner || (owner->GetFlags() & 4) == 0)  // vtable[28] & 0x4
        owner = NULL;

    float minDist = 1000.0f;
    int bestType1Index = -1;  // closest type-1 target
    int fallbackType2Index = -1;  // first type-2 target

    // Step 2: Iterate up to 12 target slots
    for (int i = 0; i < 12; i++) {
        uint targetId = targetArray[i * 2];      // +0: target entity ID
        int  targetType = targetArray[i * 2 + 1]; // +4: target type

        if (targetId == 0) continue;

        // Track first type-2 as fallback
        if (targetType == 2 && fallbackType2Index < 0)
            fallbackType2Index = i;

        // For type-1 targets, compute 3D distance
        if (targetType == 1) {
            targetPos = sub_140637DF0(owner, targetId);  // GetEntityPosition
            vec3 delta = this->position - targetPos[+1216];  // pos at offset +1216

            float dist = sqrt(delta.x² + delta.y² + delta.z²);
            if (dist <= minDist) {
                minDist = dist;
                bestType1Index = i;
            }
        }
    }

    // Step 3: Return best match
    if (bestType1Index >= 0)
        return &targetArray[bestType1Index * 2];  // type-1 preferred
    if (fallbackType2Index >= 0)
        return &targetArray[fallbackType2Index * 2];  // type-2 fallback
    return NULL;
}
```

**Analysis:**
- Target array has **12 slots**, each with 8 bytes: `[entityId:u32, type:u32]`.
- Target types: **1** = primary (enemy unit), **2** = secondary (assist/sub-target).
- Type-1 targets are evaluated by 3D Euclidean distance; the closest one wins.
- Type-2 targets are used as fallback only if no type-1 target exists.
- Entity position is read at offset **+1216** from the entity object (`0x4C0` — likely the world-space position vector).
- The `this->position` is at `a1[76]` = offset **+1216** of this object too (same structure for self position).

---

### 3.4 — sub_1406A5200: Slot 96 — `GetHitEffectCount`

```cpp
int EXVS2_Framework::GetHitEffectCount(this) {
    return this->pParams[+400];  // *(uint32*)(pParams + 400)
}
```

**Analysis:** Returns the number of hit effects configured for this entity from the parameter block.

---

### 3.5 — sub_1406A5210: Slot 97 — `GetHitEffectIdAt`

```cpp
int EXVS2_Framework::GetHitEffectIdAt(this, uint index) {
    params = this->pParams;

    // Bounds check
    if (index >= params[+400])  // hitEffectCount
        throw std::out_of_range("vector : Out of range");

    return params[index * 8 + 336];  // hitEffectIds array
}
```

**Analysis:**
- Returns the hit effect ID at the given index.
- The hit effect IDs are stored at `pParams + 336` with an **8-byte stride** (interleaved with params).
- Throws `std::out_of_range` if index exceeds the count — this is a runtime safety check.

---

### 3.6 — sub_1406A5180: Slot 98 — `GetHitEffectParamAt`

```cpp
void EXVS2_Framework::GetHitEffectParamAt(this, int* out, uint index) {
    params = this->pParams;

    // Bounds check
    if (index >= params[+400])  // hitEffectCount
        throw std::out_of_range("vector : Out of range");

    *out = params[index * 8 + 340];  // hitEffectParams array
}
```

**Analysis:**
- Returns the hit effect parameter (e.g., damage modifier, type) at the given index.
- Stored at `pParams + 340` with the same 8-byte stride, offset by 4 from the IDs.
- The hit effects are thus stored as pairs: `[id:i32, param:i32]` starting at pParams+336.

---

### 3.7 — sub_1406A5B20: Slot 99 — `ResetActions` (thunk → sub_1406A6400)

```cpp
void EXVS2_Framework::ResetActions(this) {
    // Step 1: Check if reset is enabled
    if (!this->pParams[+417])  // hasResetAction flag
        return;

    // Step 2: Get owner entity
    owner = sub_14066E6B0(this);
    if (!owner)
        return;

    // Step 3: Check owner flags (bit 2 must be set)
    if ((owner->GetFlags() & 4) == 0)  // vtable[28] >> 2 & 1
        return;

    // Step 4: Look up target slot in owner's target table
    targetTable = owner[+11952];  // owner's target reference table
    entry = sub_140627820(targetTable, this->targetSlotId);  // offset +13600

    if (!entry)
        return;

    // Step 5: If target entry type == 1 (active target)
    if (entry[+4] == 1) {
        // Clear the target entry (set to 0)
        *(uint64*)entry = 0;

        // Find first entry with type == 2, promote it to type 3
        for (int i = 0; i < 12; i++) {
            if (targetTable[i*2] != 0 && targetTable[i*2 + 1] == 2) {
                targetTable[i*2 + 1] = 3;  // promote type 2 → 3
                break;
            }
        }
    }
}
```

**Analysis:**
- ResetActions manages target slot lifecycle when a projectile needs to "release" its target.
- When a target of type 1 is found in the owner's target table at the projectile's `targetSlotId`, it clears that slot.
- Then promotes the first type-2 target to type-3, which likely means "upgrade secondary to active-pending."
- Target types observed: **1** = active primary, **2** = secondary/queued, **3** = promoted/pending.
- The owner's target table is at owner offset **+11952** with the same 8-byte stride structure as FindNearestTarget.

---

## Task 4: 000COMMON Type Overrides

### 4.1 — sub_140DDC8C0: FreeFall `ConfigureDamageInfo` (vtable slot 79)

```cpp
void CUnitTaskAutomata_FreeFall::ConfigureDamageInfo(this, damageOut) {
    damageOut->type           = 1;     // offset +0: damage type = physical
    damageOut->isEnabled      = 1;     // offset +100: damage active
    damageOut->basePower      = 256;   // offset +104: base damage (0x100)
    damageOut->scaledPower    = 258;   // offset +108: scaled damage (0x102)
    damageOut->hitStunFrames  = 0;     // offset +96: no hit stun
}
```

**Analysis:**
- The simplest damage configuration: physical damage type 1, base power 256, scaled power 258, no hitstun.
- Power values 256 and 258 are likely **fixed-point** or table indices rather than raw damage numbers.
- The damage type `1` distinguishes this from beam damage (type 2), melee (type 3), etc.

---

### 4.2 — sub_1406A5980: FreeFall `CanHitTarget` (vtable slot 54)

```cpp
bool CUnitTaskAutomata_FreeFall::CanHitTarget(this) {
    // Step 1: Check if target tracking is enabled
    if (!this->pParams[+416])  // hasTargetTracking
        return sub_14066E870(this);  // base fallback: return pBaseComponent[+48]

    // Step 2: Get owner entity
    owner = sub_14066E000(this->pIntersectChecker);
    if (!owner || (owner->GetFlags() & 2) == 0)  // must be type-2 flagged
        owner = NULL;

    // Step 3: Read target reference from owner
    targetData = owner[+11800];   // owner's combat data block
    targetRef  = this->pPhysicsBody_ext;  // offset 13480 area

    // Step 4: Quick check — if target ref is non-negative, use fallback
    int targetMask = targetData[+368];
    if (targetMask >= 0)
        return targetData[+466];  // canHitFallback byte

    // Step 5: Compare entity handle bits with target mask
    uint myHandle = targetRef[+24];
    // Compare lower 12 bits, mid 12 bits, top 3 bits, and sign bit
    if ((myHandle ^ targetMask) masked to 0xFFF == 0
        && (myHandle ^ targetMask) masked to 0xFFF000 == 0
        && (myHandle ^ targetMask) masked to 0x7000000 == 0
        && myHandle >> 31 == targetMask >> 31)
    {
        return targetData[+466];  // same entity class → use fallback
    }

    // Step 6: Validate entity in world
    if (!sub_140626A40(g_WorldManager + 179976, targetRef + 24))
        return targetData[+466];  // entity invalid

    // Step 7: Get target position (only if entity type field is 0)
    if ((targetRef[+24] & 0x7000000) != 0)
        // Target is a special entity type → skip distance check
        ...;

    targetEntity = sub_1403B36B0(g_world, targetRef + 24, &outRef);

    // Step 8: Compute 3D distance to target
    float dist = length(this->position - targetEntity->position);

    // Step 9: Get owner's damage data and check hit range
    ownerEntity = sub_14066E000(this->pIntersectChecker);
    damageData = sub_140695CA0(ownerEntity);
    if (!damageData)
        return targetData[+466];  // no damage data → fallback

    bulletParam = sub_1406A52D0(this);  // GetBulletParam
    float hitRange = sub_1405F8720(damageData + 215560, **bulletParam[+10768]);

    return hitRange > dist;  // true if target is within range
}
```

**Analysis:**
- Complex range-based hit check with multiple early-out paths.
- Entity handle format: `[sign:1][type:3][mid:12][low:12]` — 28-bit structured handle.
- The hit range is read from the **damage data table** at entity offset **+215560** (`0x34AB8`), indexed by a value from the BulletParam at offset **+10768** (`0x2A10`).
- Fallback `canHitFallback` byte at `targetData[+466]` is used when distance check cannot be performed.

---

### 4.3 — sub_1406A57D0: FreeFall `ShouldCancel` (vtable slot 55)

```cpp
bool CUnitTaskAutomata_FreeFall::ShouldCancel(this) {
    // Step 1: Same target tracking check
    if (!this->pParams[+416])
        return sub_14066E860(this);  // base fallback: return pBaseComponent[+165]

    // Step 2-7: Same entity lookup and distance calculation as CanHitTarget
    // ... (identical flow to CanHitTarget)

    // Step 8: Compute distance
    float dist = length(this->position - targetEntity->position);

    // Step 9: Get hit range
    ownerEntity = sub_14066E000(this->pIntersectChecker);
    damageData = sub_140695CA0(ownerEntity);
    bulletParam = sub_1406A52D0(this);
    float hitRange = sub_1405F8720(damageData + 215560, **bulletParam[+10768]);

    // INVERTED comparison vs CanHitTarget
    return dist >= hitRange;  // true if target is OUT OF range
}
```

**Analysis:**
- **Mirror image** of CanHitTarget (slot 54) — same logic, inverted final comparison.
- Returns `true` when target is **beyond** hit range (should cancel/self-destruct).
- Fallback byte at `targetData[+468]` (shouldCancelFallback) is at a different offset than CanHitTarget's fallback (+466).
- The base fallback `sub_14066E860` returns `pBaseComponent[+165]` — a different flag than CanHitTarget's `pBaseComponent[+48]`.

---

### 4.4 — sub_1406A5C90: FreeFall `OnSpawnHitEffects` (vtable slot 77)

```cpp
void CUnitTaskAutomata_FreeFall::OnSpawnHitEffects(this) {
    // Step 1: Call base OnSpawnHitEffects
    CUnitTaskAutomataAbstract::OnSpawnHitEffects(this);  // sub_140674200

    // Step 2: Get hit effect count via vtable[96]
    uint count = this->vtable[96](this);  // GetHitEffectCount

    // Step 3: For each hit effect, spawn it
    for (uint i = 0; i < count; i++) {
        // Get effect ID via vtable[97]
        uint effectId = this->vtable[97](this, i);  // GetHitEffectIdAt

        // Get effect param via vtable[98]
        uint effectParam;
        this->vtable[98](this, &effectParam, i);    // GetHitEffectParamAt

        // Step 4: Spawn the hit effect entity
        sub_1406A6140(this, effectId, /*active=*/1, effectParam);
    }
}
```

**Helper — sub_1406A6140: SpawnHitEffect:**
```cpp
void SpawnHitEffect(this, int effectId, char active, int effectParam) {
    // Step 1: Validate entity exists in world
    if (!sub_1405E5070(g_WorldManager + 179976, &this->entityHandle))
        return;

    // Step 2: Get event system
    eventSystem = sub_14019DCE0(g_EventQueue);
    if (!eventSystem)
        eventSystem = g_EventQueue[+32];  // fallback event queue

    // Step 3: Allocate event entry (544-byte stride)
    eventBuf = eventSystem->buffer + 544 * sub_14012B8B0(eventSystem);

    // Step 4: Fill spawn event
    eventBuf->eventType   = 0x20000007;  // 536870919 = SPAWN_HIT_EFFECT
    eventBuf->subType     = 1;
    eventBuf->reserved    = 0;
    eventBuf->targetSlot  = -1;
    eventBuf->isActive    = 1;

    eventBuf->entityHandle = this->entityHandle;
    eventBuf->effectId     = effectId;
    eventBuf->effectParam  = effectParam;
    eventBuf->isActive     = active;

    // Step 5: Submit event
    entity = sub_1405E4EE0(g_world, &this->entityHandle);
    sub_1401AA810(eventSystem, eventBuf, entity, this + 44);
}
```

**Analysis:**
- FreeFall's OnSpawnHitEffects extends the base by iterating all configured hit effects and spawning them via the **event system**.
- Uses vtable slots **96**, **97**, **98** (GetHitEffectCount/Id/Param) to read effect configuration.
- Spawning works via a **message/event queue** with 544-byte event entries.
- Event type constant `0x20000007` (536870919) identifies this as a "spawn hit effect" event.
- The base `sub_140674200` (OnSpawnHitEffects) also does extensive cleanup: clears hit processor state, resets collision flags, resets physics, and applies the `hasInitTimer` flag to restart the invisibility timer.

---

### 4.5 — sub_140F6E870: FreeFall `OnTrigger` (vtable slot 71)

```cpp
void CUnitTaskAutomata_FreeFall::OnTrigger(this) {
    this->vtable[94](this);  // GetPhysicsComponent → activate/trigger
}
```

**Analysis:**
- The simplest override — just delegates to vtable slot **94** (GetPhysicsComponent).
- In context, this activates or triggers the physics component, which likely means "start the projectile's physics simulation" or "activate the projectile."
- This is a one-liner thunk that converts an external trigger event into a physics activation.

---

## Cross-Reference Summary

### Vtable Call Graph

```
OnUpdate (slot 12)
  ├── vtable[65] → PreMotion
  ├── vtable[66] → IsAlive
  ├── vtable[67] → PostMotion
  └── vtable[72] → OnHit
        ├── reads hitEffectData[hitEffectIndex]
        └── calls hitProcessor->vtable[6]

OnCollisionCheck (slot 73)
  ├── validates entity via WorldManager
  └── vtable[70] → OnParamChanged
        └── stores collision data to CollisionCtrl

FreeFall OnCollisionCheck
  ├── base OnCollisionCheck (slot 73)
  └── vtable[94] → GetPhysicsComponent (destroy self)

FreeFall OnUpdate (slot 12)
  ├── ProcessHitEffectSlot (×2)
  │     └── reads owner collision bitset → activate/deactivate physics
  └── EXVS2 Intermediate OnUpdate
        ├── registers collision bits (16 layers)
        └── base OnUpdate (slot 12)

OnSpawnHitEffects (slot 77)
  ├── base cleanup + reset
  ├── vtable[96] → GetHitEffectCount
  ├── vtable[97] → GetHitEffectIdAt (per index)
  ├── vtable[98] → GetHitEffectParamAt (per index)
  └── SpawnHitEffect → event system (0x20000007)

ResetActions (slot 99)
  └── modifies owner's target table (clear type-1, promote type-2 → type-3)

CanHitTarget (slot 54)
  └── distance check: hitRange > dist (within range = can hit)

ShouldCancel (slot 55)
  └── distance check: dist >= hitRange (out of range = should cancel)
```

### Key Constants

| Value | Hex | Meaning |
|-------|-----|---------|
| 1065353216 | 0x3F800000 | float 1.0f (fully visible) |
| 1017370378 | 0x3C8727FA | float ~0.0165f (nearly invisible) |
| 536870919 | 0x20000007 | Event type: SPAWN_HIT_EFFECT |
| 256 | 0x100 | Base damage power |
| 258 | 0x102 | Scaled damage power |
| 1094933478 | 0x41414466 | Hash key for hit processing param lookup |
| 1000.0 | — | Max target search distance (FindNearestTarget) |

### Object Size & Critical Offsets

| Range | Purpose |
|-------|---------|
| +0 to +1200 | Core transform, matrix, handles |
| +1320 | Entity handle |
| +1460 | Scale/alpha (visibility) |
| +11800-11864 | Owner/combat data pointers |
| +12136 | Action controller |
| +12376 | Hit processor |
| +13076-13472 | Hit effect data array (4 slots × 96 bytes) |
| +13472-13600 | Parameter / subsystem pointers |
| +13600 | Target slot ID |
| Total | ~13616 bytes (0x3530) |
