# BeamJavelin & NapalmBomb Weapon Behavior Analysis

## Summary

| Property | BeamJavelin | NapalmBomb |
|----------|-------------|------------|
| Archetype | CCmdActionManager_ThrowMortar | CCmdActionManager_Detonator |
| Base Class | CCmdActionManager_Throw | CCmdActionManager_Throw |
| Object Size | 0x120 (288 bytes) | 0x130 (304 bytes) |
| 001/002 CmdMgr | **Shared** (same factory) | **Different** (separate factories) |
| 001/002 Behavior | Different slot 89 (motion hashes) | Different Execute override (appends Blank node) |

---

## BeamJavelin (Throw/Mortar Archetype)

### Class Hierarchy

```
CCmdActionManager_Throw (VDK::GAM)
  └── CCmdActionManager_ThrowMortar (VDK::GAM)
        ├── vtable: 0x1415D4B68
        ├── Execute: sub_140DEA2C0 (via thunk sub_140DEA280 → vtable[3])
        └── Both 001 and 002 share this single manager instance
```

### 1. CreateCmdActionManager — `sub_140DDFF20` (slot 81, shared)

```cpp
CmdActionManager* CreateCmdActionManager(this, parent, size) {
    void* mem = AllocateObject(0x120);  // 288 bytes
    if (!mem) return nullptr;
    memset(mem, 0, 0x120);
    
    // Constructor chain:
    // CCmdActionManager_base → CCmdActionManager_Throw → CCmdActionManager_ThrowMortar
    ConstructThrowMortar(mem);  // sub_140DDFE80
    return mem;
}
```

**Constructor chain (`sub_140DDFE80`):**
```cpp
void ConstructThrowMortar(obj) {
    ConstructThrowBase(obj);                              // sub_140DDC790
    obj->vtable = CCmdActionManager_Throw::vftable;      // intermediate
    obj[34] = 0; obj[35] = 0;                            // init linked list
    InitLinkedList(&obj[34]);                             // sub_1406BF3C0
    obj->vtable = CCmdActionManager_ThrowMortar::vftable; // final vtable
}
```

### 2. ThrowMortar Execute — `sub_140DEA2C0` (virtual slot 3)

This is the main behavior builder called when the BeamJavelin spawns.

```cpp
void Execute(this, parent, context) {
    // === Phase 1: Create main action group ===
    CCmdActionGroup_Series* mainGroup = new CCmdActionGroup_Series(context);
    mainGroup->repeatMode = 1;  // run once
    RegisterActionGroup(this, mainGroup, context);
    LinkToPhysicsBody(this + 48, mainGroup, context);
    
    // === Phase 2: Add TerminateSeriesEnd node ===
    CCmdAction_TerminateSeriesEnd* terminator = new CCmdAction_TerminateSeriesEnd(context);
    mainGroup->AddAction(terminator);
    
    // === Phase 3: Optional blank separator (if params+435 flag set) ===
    if (*(params + 435)) {
        AddBlankWithPhysicsLink(this, mainGroup, context);  // sub_140DEAAF0
    }
    
    // === Phase 4: Read rotation vector from params ===
    float rotX = 0, rotY = 0, rotZ = 0;
    if (*(params + 434)) {  // rotation enabled flag
        ReadParam(hash=1261973028, &rotX, paramsKey);  // Rotation X (degrees)
        ReadParam(hash=1010769586, &rotY, paramsKey);  // Rotation Y (degrees)
        ReadParam(hash=-1523167480, &rotZ, paramsKey); // Rotation Z (degrees)
        
        rotX = rotX * PI / 180.0;  // convert to radians
        rotY = rotY * PI / 180.0;
        rotZ = rotZ * PI / 180.0;
        rotationVector = {rotZ, rotX, rotY, 0.0};
    }
    
    // === Phase 5: Build throw motion pipeline ===
    // sub_1406A1610: creates physics body + rotation + optional wait-rotate loop
    BuildThrowMotion(
        parent,
        context,
        mainGroup,
        &rotationVector,
        *(params + 432),   // throwMode flag
        *(params + 100),   // orientToTarget flag  
        *(params + 433)    // rotateOffsetBoneZ flag
    );
}
```

**Action Pipeline (ThrowMortar):**
```
CCmdActionGroup_Series (mainGroup)
  ├── [PhysicsBody link]
  ├── CCmdAction_TerminateSeriesEnd
  ├── [Optional: CCmdAction_Blank + physics link if params+435]
  └── [Throw motion block via sub_1406A1610]:
        ├── [Series adds mainGroup to physics body]
        ├── [If rotateOffsetBoneZ]: CCmdAction_RotateOffsetBoneForUpvectorZ
        ├── [If rotation vector non-zero]:
        │     ├── [If throwMode]: CCmdActionGroup_Loop
        │     │     ├── CCmdAction_WaitByFrame(1)
        │     │     └── CCmdAction_RotatePerFrame (with rotationVector)
        │     └── [Else]: CCmdAction_RotatePerFrame (single)
        └── [Registered to parent action list]
```

### 3. ConfigureDamageInfo — `sub_140F3AC10` (slot 79, shared)

```cpp
void ConfigureDamageInfo(this, damageInfo) {
    // First call base helper: sub_140DDFFA0
    //   → sub_140DDCAF0: base damage setup
    BaseConfigureDamage(this, damageInfo);  // sub_140DDFFA0
    // damageInfo fields set by sub_140DDCAF0:
    //   damageInfo->type = 1
    //   damageInfo->byte100 = 1
    //   damageInfo->flags104 |= 0x50  (enables knockback + stagger)
    //   if (ReadParam(hash=964487181) == 1): damageInfo->byte144 = 1
    
    // Then sub_140DDFFA0 additionally:
    //   damageInfo->byte433 = 0   (disable detonation flag)
    
    // BeamJavelin-specific overrides:
    damageInfo->field104 = 130;     // damage power (0x82 = "medium-high melee")
    damageInfo->field152 = 1;       // hit reaction type (stagger/knockdown)
}
```

### 4. Slot 84 Override (001) — `sub_140F3B000` (ConfigureHitArea)

```cpp
void ConfigureHitArea_001(this, hitArea) {
    int64* paramKeyPtr = GetParamKeyPtr();  // *(this + 11808) + 56
    
    // Initialize hit detection area (type = 3 → "large melee")
    // Type 3 defaults: radius = 3.0f, halfHeight = 2.2f
    InitHitArea(hitArea, 3, paramKeyPtr);  // sub_14066F920
    
    // Set custom hit offset: {15.0, 0.0, 0.0, 0.0}
    // This extends the hit detection 15 units forward (X-axis)
    *(xmmword*)(hitArea + 16) = {15.0f, 0.0f, 0.0f, 0.0f};
    
    // Clear hit sub-type
    *(hitArea + 8) = 0;
}
```

**Note:** The 15.0f forward offset matches a javelin's long reach — hit detection extends ahead of the projectile origin.

### 5. Slot 89 Override (001) — `sub_140F3AB00` (ConfigureActionAnimation)

```cpp
void ConfigureActionAnimation_001(this, actionCtx) {
    int64 paramBlock = *(this + 11808);  // parameter store
    
    // Read initial action state from params
    uint32 hash1 = 0xD8F10F7B;  // -655195141
    float actionState;
    ReadParam(GetDataStore() + 2904, &actionState, paramBlock + 56, &hash1);
    
    uint32 savedState = (uint32)actionState;
    
    // Configure action with 001-specific animation hashes:
    uint32 actionHashA = 1784347271;   // 0x6A468A87 — 001 motion set A
    uint32 actionHashB = 0xE5E4AC06;   // -438805498 — 001 motion set B
    
    SetActionAnimation(actionCtx, 0, 0, &actionHashA, &savedState, &actionHashB, 0);
    // sub_14062B180: configures motion blend entry in action table
    
    // Read uniform scale factor
    uint32 scaleHash = 0x8D86E94A;  // -1918742070
    float scale;
    ReadParam(GetDataStore() + 2904, &scale, paramBlock + 56, &scaleHash);
    
    // Apply uniform scale {scale, scale, scale, 0} to action context
    __m128 scaleVec = {scale, scale, scale, 0.0};
    SetActionScale(actionCtx + 16, 0, 0, &scaleVec);  // sub_1401AB970
    
    // Reset hit count on action result
    *(*(actionCtx + 280) + 72) = 0;
}
```

### 6. Slot 89 Override (002) — `sub_140F3B040` (ConfigureActionAnimation)

```cpp
void ConfigureActionAnimation_002(this, actionCtx) {
    int64 paramBlock = *(this + 11808);
    
    // Same initial read as 001:
    uint32 hash1 = 0xD8F10F7B;  // -655195141 (SAME)
    float actionState;
    ReadParam(GetDataStore() + 2904, &actionState, paramBlock + 56, &hash1);
    
    uint32 savedState = (uint32)actionState;
    
    // 002-SPECIFIC animation hashes (DIFFERENT from 001):
    uint32 actionHashA = 0xD77C91C9;   // -678390199 — 002 motion set A
    uint32 actionHashB = 0xE7095E21;   // -419013855 — 002 motion set B
    
    SetActionAnimation(actionCtx, 0, 0, &actionHashA, &savedState, &actionHashB, 0);
    
    // Same scale logic as 001:
    uint32 scaleHash = 0x8D86E94A;  // -1918742070 (SAME)
    float scale;
    ReadParam(GetDataStore() + 2904, &scale, paramBlock + 56, &scaleHash);
    
    __m128 scaleVec = {scale, scale, scale, 0.0};
    SetActionScale(actionCtx + 16, 0, 0, &scaleVec);
    
    *(*(actionCtx + 280) + 72) = 0;
}
```

### BeamJavelin 001 vs 002 Differences

| Aspect | 001 | 002 |
|--------|-----|-----|
| CmdMgr Factory | Same (`sub_140DDFF20`) | Same |
| Execute behavior | Same (ThrowMortar) | Same |
| ConfigureDamageInfo | Same | Same |
| Slot 84 (HitArea) | Same (`sub_140F3B000`) | Same (shares 001's override) |
| Slot 89 Motion Hash A | `0x6A468A87` (1784347271) | `0xD77C91C9` (-678390199) |
| Slot 89 Motion Hash B | `0xE5E4AC06` (-438805498) | `0xE7095E21` (-419013855) |
| Slot 89 Scale/State read | Same hashes | Same hashes |

**Conclusion:** The only difference is the **animation motion set** used during the throw. This likely corresponds to different visual animations (e.g., overhand throw vs side throw, or different javelin models requiring different motion data).

---

## NapalmBomb (Detonator Archetype)

### Class Hierarchy

```
CCmdActionManager_Throw (VDK::GAM)
  └── CCmdActionManager_Detonator (VDK::GAM)
        ├── vtable: 0x1415D4C38
        ├── Execute: sub_140DEDB20
        │
        ├── CCmdActionManager_001GUNDAM_001GUNDAM_001_NapalmBomb (EXVS2)
        │     ├── vtable: 0x141639DC8
        │     └── Execute override: sub_140F97AC0 (calls base + appends Blank)
        │
        └── CCmdActionManager_001GUNDAM_001GUNDAM_002_NapalmBomb (EXVS2)
              ├── vtable: 0x14163A058
              └── Execute override: sub_140F97D90 (calls base + appends Blank)
```

### 1. CreateCmdActionManager (001) — `sub_140F3AC40` (slot 81)

```cpp
CmdActionManager* CreateCmdActionManager_001(this, parent, size) {
    void* mem = AllocateObject(0x130);  // 304 bytes
    if (!mem) return nullptr;
    memset(mem, 0, 0x130);
    
    // Constructor chain: base → Throw → Detonator
    ConstructDetonator(mem);  // sub_140DDFFC0
    
    // Apply 001_NapalmBomb vtable
    mem->vtable = CCmdActionManager_001GUNDAM_001GUNDAM_001_NapalmBomb::vftable;
    mem[6] = CCmdActionManager_001GUNDAM_001GUNDAM_001_NapalmBomb::vftable_secondary;
    return mem;
}
```

### 2. CreateCmdActionManager (002) — `sub_140F3B200` (slot 81)

```cpp
CmdActionManager* CreateCmdActionManager_002(this, parent, size) {
    void* mem = AllocateObject(0x130);  // 304 bytes (same size)
    if (!mem) return nullptr;
    memset(mem, 0, 0x130);
    
    ConstructDetonator(mem);  // sub_140DDFFC0 (same base)
    
    // Apply 002_NapalmBomb vtable (DIFFERENT from 001)
    mem->vtable = CCmdActionManager_001GUNDAM_001GUNDAM_002_NapalmBomb::vftable;
    mem[6] = CCmdActionManager_001GUNDAM_001GUNDAM_002_NapalmBomb::vftable_secondary;
    return mem;
}
```

**Detonator Constructor (`sub_140DDFFC0`):**
```cpp
void ConstructDetonator(obj) {
    ConstructThrowBase(obj);                             // sub_140DDC790
    obj->vtable = CCmdActionManager_Throw::vftable;     // intermediate
    obj[34] = 0; obj[35] = 0;
    InitLinkedList(&obj[34]);
    obj->vtable = CCmdActionManager_Detonator::vftable; // Detonator layer
    obj[36] = 0; obj[37] = 0;                           // extra detonator list
    InitLinkedList(&obj[36]);                            // for detonation actions
}
```

### 3. Detonator Execute (Base) — `sub_140DEDB20`

This builds the bomb drop + detonation behavior pipeline.

```cpp
void Execute_Detonator(this, parent, context) {
    // === Phase 1: Create physics body ===
    PhysicsBody* body = new PhysicsBody(0x80, context);  // sub_14068DAF0
    
    // === Phase 2: Create main action group (for bomb flight) ===
    CCmdActionGroup_Series* flightGroup = new CCmdActionGroup_Series(context);
    flightGroup->repeatMode = 1;
    
    // Register flight group to parent's action manager
    RegisterToParent(this, flightGroup, context);  // vtable[3]
    
    // Add flight group to physics body's action list
    body->AddAction(flightGroup);
    
    // === Phase 3: Create detonation action group ===
    CCmdActionGroup_Series* detonationGroup = new CCmdActionGroup_Series(context);
    detonationGroup->repeatMode = 1;
    
    // --- Action: Disable collision initially ---
    CCmdAction_SetInteractEnableModeAll* disableCollision = 
        new CCmdAction_SetInteractEnableModeAll(context);
    disableCollision->mode = 0;  // DISABLE collision
    detonationGroup->AddAction(disableCollision);
    
    // --- Action: Wait for detonation timer ---
    float lifetime;
    ReadParam(hash=1280698941, &lifetime, context->paramBlock + 56);
    // hash 0x4C4B7A3D = detonation delay timer
    if (lifetime <= 0.000001) lifetime = 10.0;  // default 10 frames
    
    CCmdAction_WaitByFrame* waitDetonation = new CCmdAction_WaitByFrame(context);
    waitDetonation->frameCount = (int)lifetime;
    detonationGroup->AddAction(waitDetonation);
    
    // --- Action: Enable collision (bomb becomes active) ---
    CCmdAction_SetInteractEnableModeAll* enableCollision = 
        new CCmdAction_SetInteractEnableModeAll(context);
    enableCollision->mode = 1;  // ENABLE collision
    detonationGroup->AddAction(enableCollision);
    
    // Register detonation group to physics body
    body->AddAction(detonationGroup);
    
    // === Phase 4: Register physics body to this manager ===
    // GetInstanceKeyValuePtr → add body to action list
    thisKeyValue = GetInstanceKeyValuePtr(this);
    thisKeyValue->AddAction(body);
    
    // === Phase 5: Add TerminateSeriesEnd marker ===
    CCmdAction_TerminateSeriesEnd* terminator = new CCmdAction_TerminateSeriesEnd(context);
    thisKeyValue->AddAction(terminator);
    
    // === Phase 6: Optional ShotBullet (sub-munition spawn) ===
    float shotTimer;
    ReadParam(hash=1094933478, &shotTimer, context->paramBlock + 56);
    // hash 0x41400C66 = sub-munition spawn delay
    
    if (shotTimer != 0.0) {
        CCmdAction_ShotBullet* shotAction = new CCmdAction_ShotBullet(context);
        shotAction->timer = shotTimer;
        thisKeyValue->AddAction(shotAction);
        LinkBulletToAction(this + 288, shotAction, thisKeyValue);
    }
}
```

### 4. Execute Override (001 NapalmBomb) — `sub_140F97AC0`

```cpp
void Execute_001_NapalmBomb(this, parent, context) {
    // Call base Detonator Execute first
    Execute_Detonator(this, parent, context);  // sub_140DEDB20
    
    // Append a CCmdAction_Blank node to the action list
    CCmdAction_Blank* blank = new CCmdAction_Blank(context);
    
    thisKeyValue = GetInstanceKeyValuePtr(this);
    thisKeyValue->AddAction(blank);
    
    // Link blank to sub-action at offset 232
    LinkToSubAction(this + 232, blank, thisKeyValue);
}
```

### 5. Execute Override (002 NapalmBomb) — `sub_140F97D90`

```cpp
void Execute_002_NapalmBomb(this, parent, context) {
    // Call base Detonator Execute first (SAME as 001)
    Execute_Detonator(this, parent, context);  // sub_140DEDB20
    
    // Append a CCmdAction_Blank node (IDENTICAL logic to 001)
    CCmdAction_Blank* blank = new CCmdAction_Blank(context);
    
    thisKeyValue = GetInstanceKeyValuePtr(this);
    thisKeyValue->AddAction(blank);
    
    // Link blank to sub-action at offset 232 (SAME offset as 001)
    LinkToSubAction(this + 232, blank, thisKeyValue);
}
```

**Note:** The 001 and 002 Execute overrides are **functionally identical**. The only purpose of having separate classes is to have distinct RTTI types for the runtime type system — the actual behavior is the same.

### 6. ConfigureDamageInfo — `sub_140E3DBF0` (slot 79, shared)

```cpp
void ConfigureDamageInfo_NapalmBomb(this, damageInfo) {
    // Call base: sub_140DE0070 → sub_140DDCAF0
    // sub_140DDCAF0 sets:
    //   damageInfo->type = 1
    //   damageInfo->byte100 = 1
    //   damageInfo->flags104 |= 0x50
    //   if (ReadParam(hash=964487181) == 1): byte144 = 1
    //
    // sub_140DE0070 additionally:
    //   damageInfo->flags104 &= ~0x10  (CLEARS one of the flags set by base!)
    //   damageInfo->field148 = 1       (explosion-type reaction)
    
    // NapalmBomb-specific overrides:
    damageInfo->field408 = 9;       // damage category = 9 (explosion/area)
    damageInfo->field108 = 1;       // area effect flag
    damageInfo->byte433 = 0;        // disable instant detonation
}
```

**Damage comparison:**

| Field | BeamJavelin | NapalmBomb |
|-------|-------------|------------|
| type | 1 | 1 |
| flags104 | 0x50 (knockback+stagger) | 0x40 (knockback only, ~0x10 cleared) |
| field104 (power) | 130 | (inherited from base) |
| field108 | (default) | 1 (area effect) |
| field148 | (default) | 1 (explosion reaction) |
| field152 | 1 (stagger) | (default) |
| field408 | (default) | 9 (explosion category) |
| byte433 | 0 (no detonation) | 0 (no instant detonation) |

### 7. Slot 84 Override (shared) — `sub_140DDCAC0` (ConfigureHitArea)

```cpp
void ConfigureHitArea_NapalmBomb(this, hitArea) {
    int64* paramKeyPtr = GetParamKeyPtr();  // *(this + 11808) + 56
    
    // Initialize hit area (type = 3 → "large melee")
    // Defaults: radius = 3.0f, halfHeight = 2.2f
    // Optionally reads custom radius from hash -1419743842
    InitHitArea(hitArea, 3, paramKeyPtr);  // sub_14066F920
    
    // Clear hit sub-type
    *(hitArea + 8) = 0;
    
    // NOTE: Unlike BeamJavelin, NO hit offset is applied.
    // NapalmBomb hits at its own position (centered explosion).
}
```

### NapalmBomb 001 vs 002 Differences

| Aspect | 001 | 002 |
|--------|-----|-----|
| CmdMgr Factory | `sub_140F3AC40` | `sub_140F3B200` |
| Manager vtable | `0x141639DC8` | `0x14163A058` |
| Execute logic | Base Detonator + Blank | Base Detonator + Blank (IDENTICAL) |
| ConfigureDamageInfo | Same (shared) | Same (shared) |
| Slot 84 (HitArea) | Same (shared) | Same (shared) |
| Actual behavior | **Identical** | **Identical** |

**Conclusion:** The 001 and 002 NapalmBomb variants have **no functional differences**. The separate classes exist purely for RTTI distinction in the game's type system, allowing the engine to identify which unit variant spawned the bomb (for things like assist tracking, kill credit, or UI display).

---

## Action Pipeline Diagrams

### BeamJavelin Pipeline
```
CCmdActionManager_ThrowMortar::Execute
│
├── CCmdActionGroup_Series (flight group)
│     ├── [Linked to Physics Body]
│     ├── CCmdAction_TerminateSeriesEnd
│     ├── [If params+435]: CCmdAction_Blank + physics link
│     └── [Throw Motion Block (sub_1406A1610)]:
│           ├── CCmdAction_RotateOffsetBoneForUpvectorZ (if params+433)
│           └── CCmdAction_RotatePerFrame (if rotation vector non-zero)
│                 [With optional CCmdAction_WaitByFrame(1) loop if params+432]
│
└── Slot 89 configures: animation blend + uniform scale
```

### NapalmBomb Pipeline
```
CCmdActionManager_Detonator::Execute (+ 001/002 override)
│
├── PhysicsBody
│     ├── CCmdActionGroup_Series (flight group)
│     │     └── [Registered to parent, receives throw motion]
│     │
│     └── CCmdActionGroup_Series (detonation group)
│           ├── CCmdAction_SetInteractEnableModeAll(mode=0)  [disable collision]
│           ├── CCmdAction_WaitByFrame(lifetime)              [wait for arm timer]
│           └── CCmdAction_SetInteractEnableModeAll(mode=1)  [enable collision]
│
├── CCmdAction_TerminateSeriesEnd
├── [Optional] CCmdAction_ShotBullet(timer)  [sub-munition spawn]
└── CCmdAction_Blank  [added by 001/002 override, linked to offset 232]
```

---

## Parameter Hash Reference

### BeamJavelin Parameters

| Hash (signed) | Hash (hex) | Used In | Purpose |
|---|---|---|---|
| 1261973028 | 0x4B3E4224 | ThrowMortar Execute | Rotation X (degrees) |
| 1010769586 | 0x3C3E6AB2 | ThrowMortar Execute | Rotation Y (degrees) |
| -1523167480 | 0xA5621E08 | ThrowMortar Execute | Rotation Z (degrees) |
| 964487181 | 0x397FAB0D | ConfigureDamageInfo | Damage mode selector |
| -655195141 | 0xD8F10F7B | Slot 89 | Initial action state |
| 1784347271 | 0x6A468A87 | Slot 89 (001 only) | Motion set A hash |
| -438805498 | 0xE5E4AC06 | Slot 89 (001 only) | Motion set B hash |
| -678390199 | 0xD77C91C9 | Slot 89 (002 only) | Motion set A hash |
| -419013855 | 0xE7095E21 | Slot 89 (002 only) | Motion set B hash |
| -1918742070 | 0x8D86E94A | Slot 89 (both) | Uniform scale factor |
| -1419743842 | 0xAB5F609E | Slot 84 (InitHitArea) | Custom collision radius |

### NapalmBomb Parameters

| Hash (signed) | Hash (hex) | Used In | Purpose |
|---|---|---|---|
| 1280698941 | 0x4C4B7A3D | Detonator Execute | Detonation delay (frames) |
| 1094933478 | 0x41400C66 | Detonator Execute | Sub-munition spawn timer |
| 964487181 | 0x397FAB0D | ConfigureDamageInfo | Damage mode selector |
| -1419743842 | 0xAB5F609E | Slot 84 (InitHitArea) | Custom collision radius |

---

## Key Function Address Reference

| Address | Name | Role |
|---------|------|------|
| `0x140DDFF20` | BeamJavelin CreateCmdActionManager | slot 81 factory |
| `0x140DEA2C0` | ThrowMortar Execute | Main behavior builder |
| `0x140F3AC10` | BeamJavelin ConfigureDamageInfo | slot 79 |
| `0x140F3B000` | BeamJavelin ConfigureHitArea (001) | slot 84 |
| `0x140F3AB00` | BeamJavelin ConfigureActionAnim (001) | slot 89 |
| `0x140F3B040` | BeamJavelin ConfigureActionAnim (002) | slot 89 |
| `0x140F3AC40` | 001_NapalmBomb CreateCmdActionManager | slot 81 factory |
| `0x140F3B200` | 002_NapalmBomb CreateCmdActionManager | slot 81 factory |
| `0x140DEDB20` | Detonator Execute | Detonation pipeline builder |
| `0x140F97AC0` | 001_NapalmBomb Execute override | Appends Blank |
| `0x140F97D90` | 002_NapalmBomb Execute override | Appends Blank |
| `0x140E3DBF0` | NapalmBomb ConfigureDamageInfo | slot 79 |
| `0x140DDCAC0` | NapalmBomb ConfigureHitArea | slot 84 |

---

## Design Insights

1. **BeamJavelin** is a mortar/throw projectile that spins along a rotation vector as it travels. The hit detection extends 15 units forward (javelin length). The 001/002 difference is purely in the animation blend sets — likely different throwing animations for the two Gundam costume variants.

2. **NapalmBomb** is a detonator-type projectile: it disables collision during flight, waits for an arming timer, then enables collision (becomes hittable/explodes on contact). It optionally spawns sub-munitions via `CCmdAction_ShotBullet`. The 001/002 variants are functionally identical — the class split is for RTTI/type-system purposes only.

3. Both weapons share the **CCmdActionManager_Throw** base, which provides the throw trajectory and rotation infrastructure. The specialization happens through:
   - **ThrowMortar**: Adds mortar-like arc with rotation per frame
   - **Detonator**: Adds timed arming/detonation with collision toggling
