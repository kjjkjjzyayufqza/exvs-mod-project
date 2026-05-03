# AGE-FX Deep Analysis — FunnelFlysword, Defense, StickerFunnel, TransparentSlasher, FunnelCommonDefense, FunnelAttachChangeWeapon

## Table of Contents

1. [FunnelFlysword Execute Deep Dive](#1-funnelflysword-execute-deep-dive)
2. [FunnelFlyswordAbstract CCmdActionManager VTable Resolution](#2-funnelflyswordabstract-ccmdactionmanager-vtable-resolution)
3. [Defense Pipeline Full Decompilation](#3-defense-pipeline-full-decompilation)
4. [StandardHomingMoveSet](#4-standardhomingmoveset)
5. [FunnelFlyswordNormal CreateCmdActionManager](#5-funnelflyswordnormal-createcmdactionmanager)
6. [StickerFunnelHissatsu Enhanced Execute](#6-stickerfunnelhissatsu-enhanced-execute)
7. [TransparentSlasher Detailed Analysis](#7-transparentslasher-detailed-analysis)
8. [FunnelCommonDefense Full Execute](#8-funnelcommondefense-full-execute)
9. [FunnelAttachChangeWeapon Execute](#9-funnelattachchangeweapon-execute)
10. [Hash Parameter Master Reference](#10-hash-parameter-master-reference)
11. [CCmdAction Types Discovered](#11-ccmdaction-types-discovered)

---

## 1. FunnelFlysword Execute Deep Dive

### sub_140FFD600 — FunnelFlysword Composite Execute

```c
void FunnelFlysword_Execute(CCmdActionManager* this, int64 a2) {
    // Phase 1: Run the full Defense pipeline
    Defense_Execute(this, a2);                           // sub_140DFB7D0

    // Phase 2: Configure homing flight on top of defense
    uint64* keyValuePtr = this->GetInstanceKeyValuePtr();
    StandardHomingMoveSet(this + 48, keyValuePtr, a2);   // sub_14068E160
}
```

**Architecture**: This is a 3-line composite function. The FunnelFlysword behavior is:
1. Inherit the ENTIRE defense behavior pipeline (collision, effects, phases, physics)
2. Overlay homing flight on top

This confirms AGE-FX's C-Funnels are **dual-purpose**: they get the full defense infrastructure AND homing attack capability.

---

## 2. FunnelFlyswordAbstract CCmdActionManager VTable Resolution

### VTable at `0x1415DE3E0` — 22 Primary Slots

| Slot | Byte Offset | Address | Function Name / Purpose |
|------|-------------|---------|------------------------|
| 0 | +0 | `0x140F844C0` | destructor |
| 1 | +8 | `0x140FFD600` | **Execute** (FunnelFlysword composite) |
| 2 | +16 | `0x1406728A0` | base framework function |
| 3 | +24 | `0x140E46A90` | **InitPhysicsBody + RotateBone** — Defense hook: creates PhysicsBody, reads rotation hashes, creates CCmdAction_CreateProjectileDepiction |
| 4 | +32 | `0x140DFC460` | **GlobalEffect** — if params+444 != 0: creates CCmdAction_GlobalEffect with hit effect ID |
| 5 | +40 | `0x1411A4E00` | **PhysicsBody + CollisionShell** — creates PhysicsBody, calls vtable+152/160/168/176 sub-hooks |
| 6 | +48 | `0x1411A6040` | **Delegate** → calls `sub_140DFBF80` → calls vtable+56 (slot 7) |
| 7 | +56 | `0x140DFC870` | **DeleteProjectileDepiction** — conditional depiction cleanup + vtable+104/112/120 |
| 8 | +64 | `0x140033290` | **nop** (nu::SetVirtualDebugValue) |
| 9 | +72 | `0x140DFC540` | **Effect config** — hit_effect params+452/456, scale, hash 0xD5550E07 |
| 10 | +80 | `0x140E46D90` | **RotateOffsetBone** (mode=1, submode=1, count=8) + calls sub_140DFC670 |
| 11 | +88 | `0x140DFC820` | **Conditional CollisionResolve** — if params+438: SetCollisionResolveType(4) |
| 12 | +96 | `0x1411A6170` | **ChangeBulletParam + IntersectMode + StageCollision** |
| 13 | +104 | `0x1411A5280` | **AlertInfo + RestartHomingTarget + UpdateRotate + WaitTargetKilled** series |
| 14 | +112 | `0x1411A6460` | **AlertInfo + SetContents + CollisionShell + InteractAttack + IntersectMode** full cleanup series |
| 15 | +120 | `0x140DFCAF0` | **WaitByFrame** (hash 0x4B3CE424) + WaitForTargetKilled |
| 16 | +128 | `0x140DFBF90` | **WaitForLifeTimeEnd** (mode=2) + WaitForTargetKilled (mode=2) |
| 17 | +136 | `0x1411B0260` | **GetParentEntity** (thunk → sub_14068D4F0) |
| 18 | +144 | `0x1411A4B80` | **TransformPositionToWorld** — matrix multiply position vector by parent rotation matrix |
| 19 | +152 | `0x1411A5750` | **FunnelHomingMove + Burst Series** — CCmdAction_FunnelHomingMove, WaitByFrame(20), WaitAimDir, burst sub-pipeline |
| 20 | +160 | `0x140033290` | **nop** |
| 21 | +168 | `0x1411A4C70` | **FunnelTargetMagnetLimit** — creates CCmdAction_FunnelTargetMagnetLimit, conditional BulletFlyFunction |

### Secondary VTable at `0x1415DE4B0` — 8 slots

| Slot | Address | Purpose |
|------|---------|---------|
| 0 | `0x140DDC870` | base |
| 1 | `0x14068E280` | — |
| 2 | `0x14068E880` | — |
| 3 | `0x140E46D00` | — |
| 4-7 | `0x140033290` | nop (×4) |

---

## 3. Defense Pipeline Full Decompilation

### sub_140DFB7D0 — Defense Execute (Full Pseudocode)

```c
void Defense_Execute(CCmdActionManager* this, int64 a2) {
    int64 parentEntity = GetParentEntity(this);           // sub_14068D4F0
    int64* keys = *(a2 + 10688) + 56;                    // parameter key array
    uint64* kvPtr = this->GetInstanceKeyValuePtr();

    // ═══════════════════════════════════════════════════
    // GROUP 1: Main Action Series
    // ═══════════════════════════════════════════════════
    CCmdActionGroup_Series* mainGroup = new CCmdActionGroup_Series(a2);
    mainGroup->byte38 = 1;  // series mode = 1

    // Action 1: Disable collision initially
    CCmdAction_SetCollisionResolveType* collOff = new CCmdAction_SetCollisionResolveType(a2);
    collOff->value = 0;
    mainGroup->addAction(collOff);

    // Hook: vtable+24 (slot 3) — custom init
    this->vtable[3](this, mainGroup, a2);

    // Conditional: Wait for target killed
    if (*(*(parentEntity + 13472) + 439)) {
        CCmdAction_WaitForTargetKilled* waitKill = new CCmdAction_WaitForTargetKilled(a2);
        CCmdAction_Return* ret = new CCmdAction_Return(a2);
        sub_14069ED40(mainGroup, a2, waitKill, ret, 0);  // conditional branch
    }

    // Action 2: Set collision from params
    CCmdAction_SetCollisionResolveType* collOn = new CCmdAction_SetCollisionResolveType(a2);
    collOn->value = *(*(parentEntity + 13472) + 120);     // params.collisionResolveType
    mainGroup->addAction(collOn);

    // Conditional: Delay frames
    int delayFrames = HashLookup(keys, 0xD47EF2BB);      // delay_frames hash
    if (delayFrames != 0) {
        CCmdAction_WaitByFrame* wait = new CCmdAction_WaitByFrame(a2, delayFrames);
        mainGroup->addAction(wait);
    }

    // Hook: vtable+32 (slot 4) — GlobalEffect
    this->vtable[4](this, mainGroup, a2);

    // Add mainGroup to action manager
    kvPtr->addAction(mainGroup);

    // ═══════════════════════════════════════════════════
    // GROUP 2: Secondary Series
    // ═══════════════════════════════════════════════════
    CCmdActionGroup_Series* secondaryGroup = new CCmdActionGroup_Series(a2);
    secondaryGroup->byte38 = 1;

    // Hook: vtable+40 (slot 5) — PhysicsBody + CollisionShell
    this->vtable[5](this, secondaryGroup, a2);
    // Hook: vtable+48 (slot 6) — Delegate → vtable+56
    this->vtable[6](this, secondaryGroup, a2);

    kvPtr->addAction(secondaryGroup);

    // ═══════════════════════════════════════════════════
    // CONDITIONAL GROUP 3: Physics (if params+440)
    // ═══════════════════════════════════════════════════
    if (*(*(parentEntity + 13472) + 440)) {
        CCmdActionGroup_Series* physicsGroup = new CCmdActionGroup_Series(a2);
        physicsGroup->byte38 = 1;

        // Create physics body (0x80 bytes)
        PhysicsBody* body = new PhysicsBody(a2);          // sub_14068DAF0

        // Hook: vtable+128 (slot 16) — WaitForLifeTimeEnd + WaitForTargetKilled
        this->vtable[16](this, body, a2);

        CCmdAction_Return* ret2 = new CCmdAction_Return(a2);
        sub_14069ED40(physicsGroup, a2, body, ret2, 0);

        // Hook: vtable+136 (slot 17) — GetParentEntity (thunk)
        this->vtable[17](this, physicsGroup, a2);

        // Jump back to secondaryGroup
        CCmdAction_Jump* jump = new CCmdAction_Jump(a2);
        jump->target = secondaryGroup;
        jump->kvPtr = kvPtr;
        physicsGroup->addAction(jump);

        kvPtr->addAction(physicsGroup);
    }

    // ═══════════════════════════════════════════════════
    // CCmdAction_Return (end marker)
    // ═══════════════════════════════════════════════════
    CCmdAction_Return* endReturn = new CCmdAction_Return(a2);
    kvPtr->addAction(endReturn);

    // Hook: vtable+96 (slot 12) — ChangeBulletParam + IntersectMode
    int64 result96 = this->vtable[12](this, kvPtr, a2);
    unknown_libname_23(this + 232, result96, kvPtr);       // store anchor

    // ═══════════════════════════════════════════════════
    // GROUP 4: Cleanup Series
    // ═══════════════════════════════════════════════════
    CCmdActionGroup_Series* cleanupGroup = new CCmdActionGroup_Series(a2);
    cleanupGroup->byte38 = 1;

    // Hook: vtable+64 (slot 8) — nop for FunnelFlysword, custom for others
    this->vtable[8](this, cleanupGroup, a2);

    // Create physics body for cleanup
    PhysicsBody* body2 = new PhysicsBody(a2);

    // Hook: vtable+72 (slot 9) — Effect config
    this->vtable[9](this, body2, a2);

    cleanupGroup->addAction(body2);

    // Hook: vtable+80 (slot 10) — RotateOffsetBone + SendMessageEffect
    this->vtable[10](this, cleanupGroup, a2);

    // Conditional: Play sound effect
    int soundId = HashLookup(keys, 0xA38A1E2D);          // sound_effect_id hash
    if (soundId != 0) {
        CCmdAction_PlaySE_OnParentVisible* playSE = new CCmdAction_PlaySE_OnParentVisible(a2, soundId);
        cleanupGroup->addAction(playSE);
    }

    kvPtr->addAction(cleanupGroup);

    // ═══════════════════════════════════════════════════
    // CONDITIONAL: Terminate Series (if params+436)
    // ═══════════════════════════════════════════════════
    if (*(*(parentEntity + 13472) + 436)) {
        CCmdAction_TerminateSeriesEnd* terminate = new CCmdAction_TerminateSeriesEnd(a2);
        kvPtr->addAction(terminate);

        CCmdAction_Blank* blank = new CCmdAction_Blank(a2);
        kvPtr->addAction(blank);

        unknown_libname_23(this + 248, blank, kvPtr);      // store second anchor

        // Conditional: if params+437, call vtable+96 again
        if (*(*(parentEntity + 13472) + 437)) {
            this->vtable[12](this, kvPtr, a2);
        }

        // Hook: vtable+88 (slot 11) — Conditional CollisionResolve
        this->vtable[11](this, kvPtr, a2);
    }
}
```

### Defense Pipeline Flow Diagram

```
Defense Execute (sub_140DFB7D0)
│
├── GROUP 1: Main Action Series ─────────────────────────
│   ├── CCmdAction_SetCollisionResolveType(0)        [disable collision]
│   ├── [vtable+24] InitPhysicsBody+RotateBone       → sub_140E46A90
│   ├── [IF params+439]: WaitForTargetKilled → Return [conditional branch]
│   ├── CCmdAction_SetCollisionResolveType(params+120) [set collision mode]
│   ├── [IF hash 0xD47EF2BB != 0]: WaitByFrame(N)    [delay]
│   └── [vtable+32] GlobalEffect                     → sub_140DFC460
│
├── GROUP 2: Secondary Series ───────────────────────────
│   ├── [vtable+40] PhysicsBody+CollisionShell        → sub_1411A4E00
│   │     ├── PhysicsBody(0x80)
│   │     ├── [vtable+152] sub-hook
│   │     ├── SetCollisionEnableModeForShell(1)
│   │     ├── PhysicsBody(0x80) #2
│   │     ├── [vtable+168] sub-hook
│   │     └── [vtable+176] sub-hook
│   └── [vtable+48] Delegate → vtable+56              → sub_140DFC870
│         ├── [IF params+441]: DeleteProjectileDepiction
│         ├── [vtable+104] AlertInfo+HomingTarget+Rotate → sub_1411A5280
│         ├── [vtable+112] AlertInfo+Collision+Intersect → sub_1411A6460
│         ├── [IF params+443]: DeleteProjectileDepiction
│         ├── PhysicsBody(0x80) #3
│         └── [vtable+120] WaitByFrame+WaitTargetKilled  → sub_140DFCAF0
│
├── [IF params+440]: GROUP 3 Physics ────────────────────
│   ├── PhysicsBody(0x80)
│   ├── [vtable+128] WaitForLifeTimeEnd+WaitTargetKilled → sub_140DFBF90
│   ├── [vtable+136] GetParentEntity (thunk)
│   ├── CCmdAction_Return
│   ├── CCmdAction_Jump → GROUP 2
│   └── (loops back to secondary group)
│
├── CCmdAction_Return (end marker)
│
├── [vtable+96] ChangeBulletParam+IntersectMode        → sub_1411A6170
│     ├── sub_140DFC080: SetCollisionShell(0) + InteractAll(0) + [IF+442]DeleteDepiction + AlertInfo(0)
│     ├── [IF hash 0xF63C0B7F]: CCmdAction_ChangeBulletParam(bulletID, 1)
│     ├── [IF params+536==0 && params+36]: SetIntersectEnableMode(0)
│     ├── [IF params+536==1]: SetIntersectEnableMode(0)
│     └── [IF params+532]: SetCollisionEnableModeForStage(1)
│
├── GROUP 4: Cleanup Series ─────────────────────────────
│   ├── [vtable+64] nop (for FunnelFlysword)
│   ├── PhysicsBody(0x80) — hit effect + scale config
│   │     └── [vtable+72] Effect config                → sub_140DFC540
│   ├── [vtable+80] RotateOffsetBone(1,1,8) + SendMessageEffect → sub_140E46D90
│   └── [IF hash 0xA38A1E2D]: PlaySE_OnParentVisible(N)
│
└── [IF params+436]: Terminate Series ───────────────────
    ├── CCmdAction_TerminateSeriesEnd
    ├── CCmdAction_Blank (anchor)
    ├── [IF params+437]: [vtable+96] repeat
    └── [vtable+88] Conditional CollisionResolve(4)    → sub_140DFC820
```

---

## 4. StandardHomingMoveSet

### sub_14068E160 — Homing Flight Configuration

```c
void StandardHomingMoveSet(void* homingState, uint64* kvPtr, int64 a3) {
    int64 entity = *(*(a3 + 10704) + 8);
    int64 params = *(entity + 13472);

    // Copy homing parameters from params to homingState
    homingState->dword32  = *(params + 16);     // moveType
    homingState->dword36  = *(params + 20);     // homingType
    homingState->dword40  = *(params + 24);     // turnRate
    homingState->dword44  = *(params + 28);     // accelRate
    homingState->dword48  = *(params + 32);     // maxSpeed
    homingState->dword52  = *(params + 36);     // trackingMode
    homingState->dword56  = *(params + 40);     // lifeTime
    homingState->byte60   = *(params + 44);     // enableTracking
    homingState->byte61   = *(params + 45);     // enableGravity
    homingState->byte62   = *(params + 46);     // enableCollision
    homingState->oword64  = *(params + 48);     // position (float4)
    homingState->oword80  = *(params + 64);     // direction (float4)
    homingState->qword96  = *(params + 80);     // target reference
    homingState->byte104  = *(params + 88);     // flags
    homingState->dword108 = *(params + 92);     // extra param

    // If moveType != 0, set primary homing target
    if (homingState->dword32 != 0) {
        goto SET_TARGET;
    }
    if (homingState->dword52 == 0) return;      // no tracking = skip

    if (homingState->dword32 != 0) {
SET_TARGET:
        int64 selfRef = homingState->vtable[1](homingState);  // get self reference
        *(homingState->ptr16 + 192) = {selfRef, kvPtr};       // set primary target
    }

    // If trackingMode != 0, set secondary target
    params = *(entity + 13472);
    if (*(params + 36) != 0) {
        int64 secondaryRef = homingState->vtable[2](homingState, kvPtr, a3);
        *(homingState->ptr16 + 208) = {secondaryRef, kvPtr};  // set secondary target
    }
}
```

**Key fields copied** (offsets 16-92 of params → homingState):
- moveType, homingType, turnRate, accelRate, maxSpeed
- trackingMode, lifeTime, enableTracking, enableGravity, enableCollision
- position(float4), direction(float4), target reference, flags

---

## 5. FunnelFlyswordNormal CreateCmdActionManager

### sub_140E00720 — Shared by FunnelFlyswordNormal & FunnelFlyswordHasei

```c
CCmdActionManager* CreateCmdActionManager_FunnelFlyswordNormal(int64 a1, int64 a2, uint64 a3) {
    CCmdActionManager* mgr = alloc(0x110);
    if (!mgr) return NULL;

    memset(mgr, 0, 0x110);
    CCmdActionManager_base_init(mgr);       // sub_140DDC790

    // Set the FunnelFlyswordAbstract CCmdActionManager vtable
    mgr->vtable = &EXVS2::CCmdActionManager_033GNDAGE_004GAGEFX_001_FunnelFlyswordAbstract::vftable;
    mgr->vtable2 = &EXVS2::CCmdActionManager_033GNDAGE_004GAGEFX_001_FunnelFlyswordAbstract::vftable;

    return mgr;
}
```

**Key insight**: Both Normal and Hasei create a 0x110-byte object with the **same** FunnelFlyswordAbstract vtable (`0x1415DE3E0`). All behavioral differences are expressed through ConfigureDamageInfo parameters, not through different CmdActionManagers.

---

## 6. StickerFunnelHissatsu Enhanced Execute

### sub_140E47A10 — StickerFunnelHissatsu Execute

```c
void StickerFunnelHissatsu_Execute(CCmdActionManager* this, int64 a2) {
    // Phase 1: Run the base StickerFunnel behavior
    StickerFunnelAbstract_Execute(this, a2);     // sub_140DEBEB0

    // Phase 2: Create CCmdAction_ScaleOffsetBone for hissatsu mode
    CCmdAction_ScaleOffsetBone* scale = new CCmdAction_ScaleOffsetBone(a2);
    // sub_1406A2760: sets vtable, mode=1, submode=5, oword48=0

    // Set scale data from xmmword_141602890
    scale->oword48 = {0.05f, 0.05f, 0.05f, 0.0f};  // position offset data
    scale->dword40 = 3;                              // special hissatsu mode = 3

    // Add to action manager
    uint64* kvPtr = this->GetInstanceKeyValuePtr();
    kvPtr->addAction(scale);
}
```

### xmmword_141602890 Decoded

```
Address: 0x141602890
Raw bytes: CD CC 4C 3D  CD CC 4C 3D  CD CC 4C 3D  00 00 00 00
Decoded:   { 0.05f,      0.05f,      0.05f,      0.0f }
```

This is a uniform scale offset of 0.05 applied to all three axes (X, Y, Z). The hissatsu mode (mode=3) likely makes the attached sticker funnel pulsate or grow/shrink with this small offset.

### StickerFunnelAbstract Execute (sub_140DEBEB0) — Base Behavior

```c
void StickerFunnelAbstract_Execute(CCmdActionManager* this, int64 a2) {
    uint64* kvPtr = this->GetInstanceKeyValuePtr();
    int64 parentEntity = GetParentEntity(this);

    // Conditional: if vtable[100](parentEntity) < 0 → attach mode
    int* stickerParam = parentEntity->vtable[100](parentEntity);
    if (*stickerParam < 0) {
        CCmdAction_CauseStick* stick = new CCmdAction_CauseStick(a2);
        stick->value = *stickerParam;   // negative = stick mode
        kvPtr->addAction(stick);
    }

    // Homing flight toward target
    StandardHomingMoveSet(this + 48, kvPtr, a2);

    // Blank separator + anchor
    CCmdAction_Blank* blank = new CCmdAction_Blank(a2);
    kvPtr->addAction(blank);
    unknown_libname_23(this + 232, blank, kvPtr);  // store anchor
}
```

---

## 7. TransparentSlasher Detailed Analysis

### 7.1 TransparentSlasher01 CreateCmdActionManager (sub_140E01A60)

```c
CCmdActionManager* CreateCmdActionManager_TransparentSlasher01(int64 a1, int64 a2, uint64 a3) {
    CCmdActionManager* mgr = alloc(0x120);
    if (!mgr) return NULL;

    memset(mgr, 0, 0x120);

    // Initialize with SummonGrap base
    sub_140DFF3A0(mgr);  // sets CCmdActionManager_SummonGrap vtable + BulletFly init

    // Override with TransparentSlasher01 vtable
    mgr->vtable = &EXVS2::CCmdActionManager_033GNDAGE_004GAGEFX_001_TransparentSlasher01::vftable;
    mgr->vtable2 = &EXVS2::CCmdActionManager_033GNDAGE_004GAGEFX_001_TransparentSlasher01::vftable;

    return mgr;
}
```

**Key discovery**: TransparentSlasher01 is built on top of **CCmdActionManager_SummonGrap**, which is itself built on CCmdActionManager_Summon. The inheritance chain is:
```
CCmdActionManager_base → CCmdActionManager_Summon → CCmdActionManager_SummonGrap → TransparentSlasher01
```

### 7.2 CmdMgr Base Init (sub_140DFF3A0)

```c
CCmdActionManager* SummonGrap_Init(CCmdActionManager* mgr) {
    CCmdActionManager_base_init(mgr);
    mgr->vtable = &CCmdActionManager_Summon::vftable;
    mgr->vtable2 = &CCmdActionManager_Summon::vftable;
    mgr->qword34 = 0;   // BulletFly state
    mgr->qword35 = 0;
    BulletFlyInit(mgr + 34);    // sub_1406BF3C0

    // Upgrade to SummonGrap
    mgr->vtable = &CCmdActionManager_SummonGrap::vftable;
    mgr->vtable2 = &CCmdActionManager_SummonGrap::vftable;
    return mgr;
}
```

### 7.3 TransparentSlasher01 CCmdActionManager VTable (`0x1415DEA58`)

| Slot | Byte Offset | Address | Function / Purpose |
|------|-------------|---------|-------------------|
| 0 | +0 | `0x140F8B6F0` | destructor |
| 1 | +8 | `0x140DEFA00` | **Execute** (SummonFormation) |
| 2 | +16 | `0x1406728A0` | base |
| 3 | +24 | `0x140033290` | nop |
| 4 | +32 | `0x140DF0BB0` | custom formation hook |
| 5 | +40 | `0x1411A7A30` | — |
| 6 | +48 | `0x140DF0500` | custom phase hook |
| 7 | +56 | `0x140DF02E0` | custom finalize hook |
| 8 | +64 | `0x140033290` | nop |
| 9 | +72 | `0x140DF1970` | — |
| 10 | +80 | `0x1411A7800` | — |
| 11 | +88 | `0x1411A7720` | — |
| 12 | +96 | `0x1411A7E10` | — |
| 13 | +104 | `0x140E48070` | — |
| 14 | +112 | `0x1411A79B0` | — |
| 15 | +120 | `0x140E47C20` | — |
| 16 | +128 | `0x140033290` | nop |
| 17 | +136 | `0x140E48130` | — |
| 18 | +144 | `0x141C6F4D8` | — |
| 19 | +152 | `0x140DDC870` | base |
| 20 | +160 | `0x14068E280` | — |
| 21 | +168 | `0x14068E880` | — |

### 7.4 TransparentSlasher01 Execute (sub_140DEFA00) — SummonFormation

```c
void SummonFormation_Execute(CCmdActionManager* this, int64 a2) {
    int64 parentEntity = GetParentEntity(this);
    uint64* kvPtr = this->GetInstanceKeyValuePtr();

    // Phase 1: Init formation
    sub_140DEFB20(this, kvPtr, a2);

    // Phase 2: Custom formation hook (vtable+32, slot 4)
    this->vtable[4](this, kvPtr, a2);

    // Phase 3: Configure formation
    sub_140DF0970(this, kvPtr, a2);

    // Phase 4: Custom phase hook (vtable+48, slot 6)
    this->vtable[6](this, kvPtr, a2);

    // Phase 5: Blank anchor
    CCmdAction_Blank* blank = new CCmdAction_Blank(a2);
    unknown_libname_23(this + 232, blank, kvPtr);  // store anchor
    kvPtr->addAction(blank);

    // Phase 6: Custom finalize hook (vtable+56, slot 7)
    this->vtable[7](this, kvPtr, a2);

    // Phase 7: Extended formation mode
    if (*(*(parentEntity + 13472) + 532)) {
        sub_140DF0DC0(this, kvPtr, a2);
    }
}
```

### 7.5 TransparentSlasher01 UnitTask Extra Overrides

| Slot | Address | Function | Decompiled Behavior |
|------|---------|----------|-------------------|
| **18** | `0x140DE0CC0` | **OnCollisionResolve** | If params+504: check scale >= 0.000001, compare entity state change (dword+1296 vs dword+13616). On first contact: calls v4+12368 with args(255, 0, offset+1120). On repeat: calls sub_140DE0E40. Then falls through to base sub_140672B10. |
| **30** | `0x140DE0D90` | **OnStateEnter** | If params+504 && params+505: calls sub_140DE13A0 (transparent slash visual effect). |
| **42** | `0x140602360` | — | (framework function) |
| **46** | `0x14097E6E0` | — | (framework function) |
| **72** | `0x140DE11E0` | **OnHit** | If params+36 (trackingMode): calls sub_140672A90 with entity+13480's offset+272 data. Then calls base sub_140674410. |
| **90** | `0x140DE0F20` | **OnTerminate** | If params+472 != dword_141FF41F8 (global state): calls sub_14069BC60 (reset/cleanup). Otherwise nop. |

### 7.6 Why TransparentSlasher is Mechanically Different

TransparentSlasher is **melee type = 2**, unlike all other funnel classes which are **projectile type = 1**. Key mechanical differences:

1. **No projectile flight**: Uses SummonFormation Execute, not Defense+Homing. The slasher spawns at a position and attacks, it doesn't fly toward a target.
2. **Collision handling (slot 18)**: Has custom collision resolve that tracks state changes (contact count). First contact triggers a specific behavior (args 255, 0 = invisible attack), repeat contacts trigger a different function.
3. **OnHit (slot 72)**: Custom hit processing that uses the tracking mode to route hit data to a secondary entity (entity+13480).
4. **OnTerminate (slot 90)**: Checks a global state variable (dword_141FF41F8) against params+472 — this likely gates whether the slasher can be terminated based on game state.
5. **Object size 0x120**: Larger than FunnelFlysword (0x110) due to SummonGrap base with BulletFly state data.
6. **SummonGrap inheritance**: The slasher has embedded BulletFly capability (for formation movement), while FunnelFlysword uses StandardHomingMoveSet (for target tracking).
7. **Rotation-based position**: ConfigureDamageInfo sets rotation via hash `0x41F53E41` at offset+472, meaning the slasher's position is defined by angle, not by a target entity.

---

## 8. FunnelCommonDefense Full Execute

### sub_140E48540 — FunnelCommonDefense Execute

```c
void FunnelCommonDefense_Execute(int64 a1, int64 a2, int64 a3) {
    // Phase 1: Clear defense position
    sub_1411A99F0(a1, a2, a3);       // creates CCmdAction_ClearDefensePos

    // Phase 2: Create RotateOffsetBone for orbit
    int64* keys = *(a3 + 10688) + 56;

    CCmdAction_RotateOffsetBone* rotate = new CCmdAction_RotateOffsetBone(a3);
    rotate->mode = 1;
    rotate->submode = 1;
    rotate->rotation_count = 3;      // 3 rotation axes
    rotate->float4_rotation = {0, 0, 0, 0};   // initially zero

    // Read rotation angles from hash parameters
    float rotX = HashLookup(keys, 0x14A93870);   // defense_rotation_X (degrees)
    float rotY = HashLookup(keys, 0x8D8099CA);   // defense_rotation_Y (degrees)
    float rotZ = HashLookup(keys, 0xFAA9265C);   // defense_rotation_Z (degrees)

    // Convert degrees to radians
    rotX = rotX * 3.1415927f / 180.0f;
    rotY = rotY * 3.1415927f / 180.0f;
    rotZ = rotZ * 3.1415927f / 180.0f;

    // Pack as SIMD float4: {Z, X, Y, 0}
    rotate->rotation = _mm_unpacklo_ps(
        _mm_unpacklo_ps({rotZ}, {rotX}),
        _mm_unpacklo_ps({rotY}, {0.0f})
    );
    // Result vector: {rotZ, rotX, rotY, 0.0f}

    // Add to action manager
    a2->addAction(rotate);
}
```

### sub_1411A99F0 — Defense System Init (ClearDefensePos)

```c
void DefenseSystemInit(int64 a1, int64 a2, uint64 a3) {
    CCmdAction_ClearDefensePos* clearDef = new CCmdAction_ClearDefensePos(a3);
    clearDef->contextRef = a3;

    // Set both primary and secondary vtable
    clearDef->vtable = &CCmdAction_ClearDefensePos::vftable;
    clearDef->vtable2 = &CCmdAction_ClearDefensePos::vftable;

    a2->addAction(clearDef);
}
```

**Game meaning**: FunnelCommonDefense creates a rotating shield formation. The `ClearDefensePos` action resets the defense formation state, then `RotateOffsetBone` defines the orbit — the funnels rotate around a bone with per-axis rotation angles read from hash parameters.

---

## 9. FunnelAttachChangeWeapon Execute

### sub_140DF6340 — FunnelAttachChangeWeapon Execute

```c
void FunnelAttachChange_Execute(CCmdActionManager* this, int64 a2) {
    // Phase 1: Weapon change system init
    sub_140DF57B0(this, a2);

    // Phase 2: Custom form-specific hook (vtable+64, slot 8)
    int64 vtable = *this;
    uint64* kvPtr = this->GetInstanceKeyValuePtr();
    vtable[8](this, kvPtr, a2);   // form-specific configuration

    // Phase 3: Homing flight
    kvPtr = this->GetInstanceKeyValuePtr();
    StandardHomingMoveSet(this + 48, kvPtr, a2);
}
```

### sub_140DF57B0 — Weapon Change Init

```c
void WeaponChangeInit(CCmdActionManager* this, int64 a2) {
    uint64* kvPtr = this->GetInstanceKeyValuePtr();

    // Hook: vtable+32 (slot 4) — initial setup
    this->vtable[4](this, kvPtr, a2);

    // Create blank anchor
    CCmdAction_Blank* blank = new CCmdAction_Blank(a2);
    kvPtr->addAction(blank);

    unknown_libname_23(this + 232, blank, kvPtr);  // store anchor
}
```

### FunnelAttachChangeWeaponDefenseformMayu CmdMgr VTable (`0x1415DE960`)

| Slot | Byte Offset | Address | Function / Purpose |
|------|-------------|---------|-------------------|
| 0 | +0 | `0x140F844C0` | destructor |
| 1 | +8 | `0x140DF6340` | **Execute** (FunnelAttachChange) |
| 2 | +16 | `0x1406728A0` | base |
| 3 | +24 | `0x140DF5CE0` | **WaitByFrame + MoveRelative** |
| 4 | +32 | `0x140DF63A0` | init hook |
| 5-7 | +40/48/56 | `0x140033290` | nop (×3) |
| 8 | +64 | `0x140DF9100` | **vtable+64 hook** (PhysicsBody + SendMessageEffect + PlaySE + Blank) |
| 9 | +72 | `0x140E47B80` | — |
| 10 | +80 | `0x140DF9540` | — |
| 11 | +88 | `0x141C6F2C0` | — |
| 12 | +96 | `0x140DDC870` | base |
| 13 | +104 | `0x14068E280` | — |
| 14 | +112 | `0x14068E880` | — |
| 15 | +120 | `0x14068DFD0` | — |
| 16 | +128 | `0x140E47AC0` | — |
| 17-19 | +136/144/152 | `0x140033290` | nop (×3) |
| 20 | +160 | `0x1406897B0` | — |
| 21 | +168 | sentinel (0xFFFFFFFF) | end marker |

### sub_140DF9100 — vtable+64 Hook (Form-Specific Configuration)

```c
void FunnelAttachChange_FormConfig(CCmdActionManager* this, uint32* a2, int64 a3) {
    int64 parentEntity = GetParentEntity(this);
    int64* keys = GetKeyArray(this) + 56;

    // Create physics body
    PhysicsBody* body = new PhysicsBody(a3);

    // Hook: vtable+72 (slot 9) — configure physics
    this->vtable[9](this, body, a3);

    a2->addAction(body);

    // Hook: vtable+80 (slot 10) — additional config
    this->vtable[10](this, a2, a3);

    // Conditional: SendMessageEffectRequest (if params+568 != 0)
    if (*(*(parentEntity + 13472) + 568)) {
        int* params = *(parentEntity + 13472);
        int effectA = params[140];    // offset 560
        int effectB = params[139];    // offset 556
        int effectC = params[142];    // offset 568

        CCmdAction_SendMessageEffectRequest* effect = new CCmdAction_SendMessageEffectRequest(a3);
        effect->paramA = effectC;
        effect->paramB = effectB;
        effect->paramC = effectA;
        effect->scale = xmmword_141AA43E0;    // default scale
        a2->addAction(effect);
    }

    // Conditional: PlaySE (if hash 0xA38A1E2D != 0)
    int soundId = HashLookup(keys, 0xA38A1E2D);
    if (soundId != 0) {
        CCmdAction_PlaySE_OnParentVisible* playSE = new CCmdAction_PlaySE_OnParentVisible(a3, soundId);
        a2->addAction(playSE);
    }

    // Conditional: Blank anchor (if params+564 enabled — detect mode)
    if (*(*(parentEntity + 13472) + 564)) {
        CCmdAction_Blank* blank = new CCmdAction_Blank(a3);
        a2->addAction(blank);
        unknown_libname_23(this + 248, blank, a2);  // store second anchor
    }
}
```

### sub_140DF5CE0 — WaitByFrame + MoveRelative (vtable+24 hook)

```c
void FunnelAttachChange_InitHook(int64 a1, int64 a2, int64 a3) {
    int64 parentEntity = GetParentEntity(a1);
    int waitFrames = *(*(parentEntity + 13472) + 452);   // params.waitFrames

    if (waitFrames >= 0) {
        CCmdActionGroup_Series* series = new CCmdActionGroup_Series(a3);
        series->byte38 = 1;

        // WaitByFrame action
        CCmdAction_WaitByFrame* wait = new CCmdAction_WaitByFrame(a3);
        wait->frames = waitFrames;
        series->addAction(wait);

        // MoveRelative action
        CCmdAction_MoveRelative* move = new CCmdAction_MoveRelative(a3);
        move->value = *(a1->ptr16 + 196);    // relative position from context
        move->mode = 1;
        series->addAction(move);

        series->dword7 = 1;  // loop mode
        // Add to parent action manager
        a2->vtable[16](a2, series);
    }
}
```

---

## 10. Hash Parameter Master Reference

### Defense Pipeline Hashes

| Hash (signed) | Hash (hex) | Name (deduced) | Used In | Read Type |
|---------------|-----------|----------------|---------|-----------|
| -731733189 | `0xD47EF2BB` | `delay_frames` | Defense Execute main group | int → WaitByFrame count |
| -1553624147 | `0xA38A1E2D` | `sound_effect_id` | Defense cleanup, FunnelAttachChange | int → PlaySE param |
| -163096961 | `0xF63C0B7F` | `bullet_param_change` | ChangeBulletParam (slot 12) | int → if nonzero: change bullet |
| 1261973028 | `0x4B3CE424` | `wait_before_kill_frames` | WaitByFrame in cleanup (slot 15) | int → WaitByFrame count |

### Rotation Hashes

| Hash (signed) | Hash (hex) | Name (deduced) | Used In |
|---------------|-----------|----------------|---------|
| 346751088 | `0x14A93870` | `defense_rotation_X` | FunnelCommonDefense, InitPhysicsBody (slot 3) |
| -1918742070 | `0x8D8099CA` | `defense_rotation_Y` | FunnelCommonDefense, InitPhysicsBody (slot 3) |
| -89824932 | `0xFAA9265C` | `defense_rotation_Z` | FunnelCommonDefense, InitPhysicsBody (slot 3) |

### InitPhysicsBody (slot 3) Additional Hashes

| Hash (signed) | Hash (hex) | Name (deduced) | Used In |
|---------------|-----------|----------------|---------|
| -1410480326 | `0xABFFF44A` | `rotation_W` | InitPhysicsBody — read as float → rotation param B |
| -1523167480 | `0xA546EC08` | `bone_radius` | sub_1411A49F0 — read as int → converted to float for radius |

### Effect Config (slot 9) Hashes

| Hash (signed) | Hash (hex) | Name (deduced) | Used In |
|---------------|-----------|----------------|---------|
| -715342969 | `0xD5550E07` | `effect_blend_mode` | sub_140DFC540 — effect rendering config |

---

## 11. CCmdAction Types Discovered

### New Types Found in Deep Analysis

| CCmdAction Type | VTable Symbol | Purpose | Created In |
|----------------|--------------|---------|------------|
| `CCmdAction_ClearDefensePos` | VDK::GAM | Reset defense formation state | sub_1411A99F0 |
| `CCmdAction_GlobalEffect` | VDK::GAM | Spawn global visual effect | sub_140DFC460 (slot 4) |
| `CCmdAction_CreateProjectileDepiction` | VDK::GAM | Create projectile visual representation | sub_140E46A90 (slot 3) |
| `CCmdAction_DeleteProjectileDepiction` | VDK::GAM | Remove projectile visual | sub_140DFC870 (slot 7) |
| `CCmdAction_SetCollisionEnableModeForShell` | VDK::GAM | Enable/disable shell collision | sub_1411A4E00 (slot 5) |
| `CCmdAction_SetCollisionEnableModeForStage` | VDK::GAM | Enable/disable stage collision | sub_1411A6170 (slot 12) |
| `CCmdAction_SetInteractEnableModeAll` | VDK::GAM | Set all interaction modes | sub_140DFC080 |
| `CCmdAction_SetInteractEnableModeAttack` | VDK::GAM | Set attack interaction mode | sub_1411A6050, sub_1411A6460 |
| `CCmdAction_SetIntersectEnableMode` | VDK::GAM | Enable/disable intersect testing | sub_1411A6170 |
| `CCmdAction_SetAlertInfoEnableMode` | VDK::GAM | Enable/disable alert info display | sub_1411A5280, sub_1411A6460 |
| `CCmdAction_SetAlertInfoContents` | VDK::GAM | Set alert info display contents | sub_1411A6460 |
| `CCmdAction_ChangeBulletParam` | VDK::GAM | Change bullet parameters at runtime | sub_1411A6170 (slot 12) |
| `CCmdAction_WaitForLifeTimeEnd` | VDK::GAM | Wait until lifetime expires | sub_140DFBF90 (slot 16) |
| `CCmdAction_SendMessageEffectRequest` | VDK::GAM | Send effect request message | sub_140DFC670, sub_140DF9100 |
| `CCmdAction_FunnelHomingMove` | VDK::GAM | Funnel-specific homing movement | sub_1411A5750 (slot 19) |
| `CCmdAction_UpdateRotate` | VDK::GAM | Update rotation per frame | sub_1411A5280 (slot 13) |
| `CCmdAction_RestartUpdateHomingTarget` | VDK::GAM | Restart homing target tracking | sub_1411A5280 (slot 13) |
| `CCmdAction_WaitForAimDirToTarget` | VDK::GAM | Wait until aim direction reaches target | sub_1411A5750 (slot 19) |
| `CCmdAction_FunnelTargetMagnetLimit` | VDK::GAM | Funnel target magnet attraction limit | sub_1411A4C70 (slot 21) |
| `CCmdAction_BulletFlyFunctionAbstract` | VDK::GAM | Base bullet fly function | sub_1411A5280, sub_1411A5750 |
| `CCmdAction_MoveRelative` | VDK::GAM | Move relative to current position | sub_140DF5CE0 |
| `CCmdAction_ScaleOffsetBone` | VDK::GAM | Scale offset on bone | sub_1406A2760 (StickerFunnelHissatsu) |

### Previously Known Types (Updated)

| CCmdAction Type | Purpose |
|----------------|---------|
| `CCmdAction_SetCollisionResolveType` | Set collision resolve mode (0=off, 4=defense) |
| `CCmdAction_WaitForTargetKilled` | Wait for target death |
| `CCmdAction_Return` | Return to caller |
| `CCmdAction_Jump` | Jump to another action group |
| `CCmdAction_PlaySE_OnParentVisible` | Play sound when parent visible |
| `CCmdAction_TerminateSeriesEnd` | Mark end of series |
| `CCmdAction_Blank` | No-op anchor |
| `CCmdAction_CauseStick` | Attach to target |
| `CCmdAction_RotateOffsetBone` | Rotate around bone |
| `CCmdAction_WaitByFrame` | Wait N frames |
| `CCmdActionGroup_Series` | Sequential action container |

---

## Appendix A: Decompiled Slot Functions — FunnelFlyswordAbstract

### Slot 3 (vtable+24) — sub_140E46A90 — InitPhysicsBody + RotateBone

```c
void InitPhysicsBody_RotateBone(int64 a1, int64 a2, int64 a3) {
    int parentRef = a1;
    int64* keys = *(*(a1 + 16) + 10688) + 56;

    // Pre-init: disable attack interaction
    sub_1411A6050(a1, a2, a3);
    // → SetInteractEnableModeAttack(0)
    // → if params+536==1 or (params+536==0 && params+36): SetIntersectEnableMode(0)

    // Create PhysicsBody
    PhysicsBody* body = new PhysicsBody(a3);   // 0x80 bytes

    // Read rotation parameters
    float4 rotationOffset = {0, 0, 0, 0};
    rotationOffset.x = HashLookup(keys, 0xEDCF1D08);  // hit_effect_id hash reused
    rotationOffset.y = HashLookup(keys, 0xABFFF44A);   // rotation_W
    rotationOffset.z = HashLookup(keys, 0xFAA9265C);   // rotation_Z

    float rotX_deg = HashLookup(keys, 0x14A93870);     // rotation_X
    float rotY_deg = HashLookup(keys, 0x8D8099CA);     // rotation_Y

    // Convert degrees to radians
    float rotX_rad = rotX_deg * PI / 180.0f;
    float rotY_rad = rotY_deg * PI / 180.0f;

    // Configure physics body with rotation + radius
    sub_1411A49F0(parentRef, body, a3, &rotationOffset, rotX_rad, rotY_rad, 4);

    // Add PhysicsBody to action group
    a2->addAction(body);

    // Create projectile depiction
    CCmdAction_CreateProjectileDepiction* depiction = new CCmdAction_CreateProjectileDepiction(a3);
    a2->addAction(depiction);
}
```

### Slot 4 (vtable+32) — sub_140DFC460 — GlobalEffect

```c
void GlobalEffect_Hook(int64 a1, int64 a2, int64 a3) {
    int64 parentEntity = GetParentEntity(a1);

    if (*(*(parentEntity + 13472) + 444) != 0) {
        int effectId = *(*(parentEntity + 13472) + 444);

        CCmdAction_GlobalEffect* gfx = new CCmdAction_GlobalEffect(a3);
        gfx->effectId = effectId;
        gfx->enabled = 1;
        gfx->oword3 = 0;     // position offset
        gfx->oword4 = 0;     // rotation offset
        gfx->oword5 = xmmword_141AA43E0;  // scale (default 1.0)

        a2->addAction(gfx);
    }
}
```

### Slot 9 (vtable+72) — sub_140DFC540 — Effect Config

```c
void EffectConfig(int64 a1, int64 a2, int64 a3) {
    int64 parentEntity = GetParentEntity(a1);

    // Init effect struct
    int effectStruct[...] = {0};
    // Add 3 effect entries
    for (int i = 0; i < 3; i++) {
        effectEntry[i].value = -1;
        sub_14069CA70(&effectEntry[i]);  // init default
    }

    // Read hit effect params
    sub_14069D020(&effectStruct,
        *(*(parentEntity + 13472) + 452),   // params.hitEffectId
        *(*(parentEntity + 13472) + 456));   // params.hitEffectParam

    // Read blend mode hash
    int blendMode = HashLookup(keys, 0xD5550E07);
    effectConfig[0] = blendMode;

    // Set fixed scale values
    effectConfig[2] = 1082130432;   // 4.0f
    effectConfig[1] = 1080033280;   // 3.75f

    // Apply effect to physics
    sub_14069D730(a2, a3, effectConfig);
}
```

### Slot 10 (vtable+80) — sub_140E46D90 — RotateOffsetBone + SendMessageEffect

```c
void RotateOffsetBone_SendMessage(int64 a1, int64 a2, uint64 a3) {
    CCmdAction_RotateOffsetBone* rotate = new CCmdAction_RotateOffsetBone(a3);
    rotate->mode = 1;
    rotate->submode = 1;
    rotate->count = 8;          // 8 rotation steps (overrides initial 60)
    rotate->rotation = {0,0,0,0};

    a2->addAction(rotate);

    // Then call SendMessageEffect config
    sub_140DFC670(a1, a2, a3);
    // → reads params+452/456 (hit effect), params+497 (byte flag)
    // → sub_14069D980 for effect rendering
    // → if params+448 != 0: creates SendMessageEffectRequest
}
```

### Slot 13 (vtable+104) — sub_1411A5280 — AlertInfo + Homing + Rotate Series

```c
void AlertInfo_Homing_Rotate(int64 a1, int64 a2, int64 a3) {
    int64 parentEntity = GetParentEntity(a1);

    // Create series group
    CCmdActionGroup_Series* series = new CCmdActionGroup_Series(a3);

    // Enable alert info
    CCmdAction_SetAlertInfoEnableMode* alertOn = new CCmdAction_SetAlertInfoEnableMode(a3);
    alertOn->enabled = 1;
    series->addAction(alertOn);

    // Create physics body
    PhysicsBody* body = new PhysicsBody(a3);

    // Conditional: restart homing target
    if (*(*(parentEntity + 13472) + 463)) {
        CCmdAction_RestartUpdateHomingTarget* restart = new CCmdAction_RestartUpdateHomingTarget(a3);
        body->addAction(restart);
    }

    // Conditional: update rotate
    if (*(*(parentEntity + 13472) + 463)) {
        CCmdAction_UpdateRotate* rotate = new CCmdAction_UpdateRotate(a3);
        rotate->speed = 1070141403;         // ~1.8f
        rotate->rotateSpeed = 1048971922;   // ~0.26f
        if (*(*(parentEntity + 13472) + 464) < PI/2)
            rotate->speed = *(*(parentEntity + 13472) + 464);
        rotate->mode = 1;
        body->addAction(rotate);
    }

    // vtable+184 sub-hook
    this->vtable[23](a1, body, a3);

    // Wait for target killed
    CCmdAction_WaitForTargetKilled* waitKill = new CCmdAction_WaitForTargetKilled(a3);
    waitKill->mode = 2;
    body->addAction(waitKill);

    series->addAction(body);

    // Disable alert info
    CCmdAction_SetAlertInfoEnableMode* alertOff = new CCmdAction_SetAlertInfoEnableMode(a3);
    alertOff->enabled = 0;
    series->addAction(alertOff);

    a2->addAction(series);
}
```

### Slot 14 (vtable+112) — sub_1411A6460 — Full Cleanup Series

```c
void FullCleanupSeries(int64 a1, int64 a2, int64 a3) {
    int64 parentEntity = GetParentEntity(a1);

    CCmdActionGroup_Series* series = new CCmdActionGroup_Series(a3);

    // Enable alert info
    SetAlertInfoEnableMode(series, a3, enabled=1);

    // Set alert contents
    CCmdAction_SetAlertInfoContents* contents = new CCmdAction_SetAlertInfoContents(a3);
    contents->mode = 1;
    contents->param = 0;
    series->addAction(contents);

    // Disable shell collision
    SetCollisionEnableModeForShell(series, a3, enabled=0);

    // Conditional: disable stage collision
    if (*(*(parentEntity + 13472) + 532))
        SetCollisionEnableModeForStage(series, a3, enabled=0);

    // Enable attack interaction
    SetInteractEnableModeAttack(series, a3, enabled=1);

    // Conditional: enable intersect mode
    if (params+536 == 0 && params+36 != 0) || (params+536 == 1):
        SetIntersectEnableMode(series, a3, enabled=1);

    // Create physics body for combat
    PhysicsBody* combatBody = new PhysicsBody(a3);
    this->vtable[24](a1, combatBody, a3);    // vtable+192 sub-hook
    series->addAction(combatBody);

    // Disable attack interaction
    SetInteractEnableModeAttack(series, a3, enabled=0);

    // Conditional: disable intersect mode
    if (params+536 == 0 && params+36 != 0) || (params+536 == 1):
        SetIntersectEnableMode(series, a3, enabled=0);

    a2->addAction(series);
}
```

### Slot 16 (vtable+128) — sub_140DFBF90 — LifeTime + TargetKilled Wait

```c
void WaitForLifeTimeEnd_TargetKilled(int64 a1, int64 a2, int64 a3) {
    // Wait for lifetime to end
    CCmdAction_WaitForLifeTimeEnd* waitLife = new CCmdAction_WaitForLifeTimeEnd(a3);
    waitLife->mode = 2;
    a2->addAction(waitLife);

    // Wait for target to be killed
    CCmdAction_WaitForTargetKilled* waitKill = new CCmdAction_WaitForTargetKilled(a3);
    waitKill->mode = 2;
    a2->addAction(waitKill);
}
```

### Slot 19 (vtable+152) — sub_1411A5750 — FunnelHomingMove + Burst

```c
void FunnelHomingMove_Burst(int64 a1, int64 a2, int64 a3) {
    int64 parentEntity = GetParentEntity(a1);

    // Create FunnelHomingMove action
    CCmdAction_FunnelHomingMove* homing = new CCmdAction_FunnelHomingMove(a3);
    homing->speed = 0;       // initial speed
    homing->active = 1;
    homing->mode = 2;
    a2->addAction(homing);

    // Conditional burst sequence (if params+496)
    if (*(*(parentEntity + 13472) + 496)) {
        CCmdActionGroup_Series* burstSeries = new CCmdActionGroup_Series(a3);
        burstSeries->byte38 = 1;

        // Wait 20 frames
        CCmdAction_WaitByFrame* wait20 = new CCmdAction_WaitByFrame(a3);
        wait20->frames = 20;
        burstSeries->addAction(wait20);

        // Create physics body for burst
        PhysicsBody* burstBody = new PhysicsBody(a3);

        // Create special burst fly function
        int64 burstFly = sub_140E47540(alloc(0xA0), a3);
        sub_1406AEAE0(burstFly);
        burstBody->addAction(burstFly);

        // Wait for aim direction to reach target
        CCmdAction_WaitForAimDirToTarget* aimWait = new CCmdAction_WaitForAimDirToTarget(a3);
        aimWait->threshold = 1057360530;  // ~0.5f
        aimWait->mode = 2;
        burstBody->addAction(aimWait);

        // Wait 15 more frames
        CCmdAction_WaitByFrame* wait15 = new CCmdAction_WaitByFrame(a3);
        wait15->frames = 15;
        wait15->mode = 2;
        burstBody->addAction(wait15);

        burstSeries->addAction(burstBody);
        a2->addAction(burstSeries);
    }
}
```

### Slot 21 (vtable+168) — sub_1411A4C70 — FunnelTargetMagnetLimit

```c
void FunnelTargetMagnetLimit_Hook(int64 a1, int64 a2, int64 a3) {
    int64 parentEntity = GetParentEntity(a1);

    // Create magnet limit action
    CCmdAction_FunnelTargetMagnetLimit* magnet = new CCmdAction_FunnelTargetMagnetLimit(a3);
    magnet->byte104 = 0;

    // Set magnet strength based on params+512
    if (*(*(parentEntity + 13472) + 512))
        magnet->dword11 = 1082130432;   // 4.0f (strong magnet)
    else
        magnet->dword11 = 1065353216;   // 1.0f (weak magnet)

    // Conditional: enable magnet mode
    if (*(*(parentEntity + 13472) + 462))
        magnet->byte80 = 1;

    a2->addAction(magnet);

    // Conditional: Bullet fly function (if params+461)
    if (*(*(parentEntity + 13472) + 461)) {
        int64 bulletFly = sub_14069BF40(alloc(0xB0), a3, *(a3 + 10688) + 24);
        sub_1406AEAE0(bulletFly);

        // Set direction vector from params+480
        float4 dir = *(*(parentEntity + 13472) + 480);
        float len = sqrt(dir.x*dir.x + dir.y*dir.y + dir.z*dir.z);
        if (len > threshold)
            *(bulletFly + 128) = dir;

        *(bulletFly + 28) = 1;   // mode
        a2->addAction(bulletFly);
    }
}
```

---

## Appendix B: Param Offset Reference

Key parameter offsets from `*(parentEntity + 13472)`:

| Offset | Type | Used In | Meaning |
|--------|------|---------|---------|
| +16 | dword | StandardHomingMoveSet | moveType |
| +20 | dword | StandardHomingMoveSet | homingType |
| +24 | dword | StandardHomingMoveSet | turnRate |
| +28 | dword | StandardHomingMoveSet | accelRate |
| +32 | dword | StandardHomingMoveSet | maxSpeed |
| +36 | dword | StandardHomingMoveSet, IntersectMode | trackingMode |
| +40 | dword | StandardHomingMoveSet | lifeTime |
| +44 | byte | StandardHomingMoveSet | enableTracking |
| +45 | byte | StandardHomingMoveSet | enableGravity |
| +46 | byte | StandardHomingMoveSet | enableCollision |
| +48 | oword | StandardHomingMoveSet | position (float4) |
| +64 | oword | StandardHomingMoveSet | direction (float4) |
| +80 | qword | StandardHomingMoveSet | target reference |
| +88 | byte | StandardHomingMoveSet | flags |
| +92 | dword | StandardHomingMoveSet | extra param |
| +120 | dword | Defense Execute | collisionResolveType |
| +436 | byte | Defense Execute | enableTerminateSeries |
| +437 | byte | Defense Execute | enableExtraVtable96 |
| +438 | byte | Slot 11 | enableCollisionResolve4 |
| +439 | byte | Defense Execute | enableWaitTargetKilled |
| +440 | byte | Defense Execute | enablePhysicsGroup |
| +441 | byte | Slot 7 | enableDeleteDepiction |
| +442 | byte | Slot 12 sub | enableDeleteDepiction2 |
| +443 | byte | Slot 7 | enableDeleteDepiction3 |
| +444 | dword | Slot 4 | globalEffectId |
| +448 | dword | Slot 10 sub | messageEffectFlag |
| +452 | dword | Slots 9, FunnelAttach | hitEffectId / waitFrames |
| +456 | dword | Slot 9 | hitEffectParam |
| +461 | byte | Slot 21 | enableBulletFly |
| +462 | byte | Slot 21 | enableMagnetMode |
| +463 | byte | Slot 13 | enableHomingRestart |
| +464 | float | Slot 13 | maxRotateSpeed |
| +472 | dword | TransparentSlasher slot 90 | terminateStateCheck |
| +480 | float4 | Slot 21 | bulletFlyDirection |
| +496 | byte | Slot 19 | enableBurstSequence |
| +497 | byte | Slot 10 sub | effectFlag |
| +504 | byte | TransparentSlasher slot 18 | collisionResolveEnabled |
| +505 | byte | TransparentSlasher slots 18, 30 | transparentSlashVisual |
| +512 | byte | Slot 21 | strongMagnet |
| +532 | byte | Slots 12, 14, SummonFormation | enableStageCollision/extendedMode |
| +536 | dword | Slots 12, 14 | intersectModeType (0/1) |
| +556 | dword | FunnelAttach slot 8 | effectParamB |
| +560 | dword | FunnelAttach slot 8 | effectParamA |
| +564 | byte | FunnelAttach slot 8 | detectMode |
| +568 | dword | FunnelAttach slot 8 | effectParamC / defense_collision_hash |

---

## Summary of Architectural Discoveries

### 1. Defense Pipeline = 22-Slot Virtual Dispatch Machine
The FunnelFlyswordAbstract CCmdActionManager vtable has 22 primary slots, with sub-functions calling further sub-hooks at vtable offsets up to +192 (slot 24). The Defense Execute (sub_140DFB7D0) alone dispatches through **11 distinct virtual calls** (slots 3,4,5,6,8,9,10,11,12,16,17), creating a highly configurable behavior pipeline.

### 2. Burst Sub-Pipeline Discovery
Slot 19 (sub_1411A5750) reveals a **burst attack sub-pipeline**: after normal FunnelHomingMove, if params+496 is enabled, the funnel waits 20 frames, fires a special burst fly function, waits for aim direction alignment (threshold ~0.5 radians), then waits 15 more frames. This is the C-Funnel's "burst attack mode" timing.

### 3. FunnelTargetMagnetLimit — New CCmdAction
The magnet system (slot 21) creates `CCmdAction_FunnelTargetMagnetLimit` with two strength levels:
- Strong magnet (4.0f): when params+512 is set
- Weak magnet (1.0f): default
This controls how strongly the funnels are attracted to their target.

### 4. TransparentSlasher = SummonGrap Architecture
TransparentSlasher01's CmdMgr inherits from CCmdActionManager_SummonGrap (not from the Defense pipeline). This gives it BulletFly state and formation management, making it a "summoned melee entity" rather than a "guided projectile."

### 5. 32 Total CCmdAction Types in AGE-FX
This deep analysis brings the total discovered CCmdAction types to 32 (21 new + 11 previously known), revealing the full scope of the VDK action system used by AGE-FX's weapon automata.

---

## 12. Normal vs Hasei vs Burst — Precise VTable Diff

Only **6 of 100 slots** differ between the three FunnelFlysword variants:

| Slot | Normal | Hasei | Burst | Purpose |
|------|--------|-------|-------|---------|
| **2** (OnInit) | `sub_140E007E0` (shared) | `sub_140E007E0` (shared) | `sub_140E01DA0` (UNIQUE) | Burst has custom init with collision setup |
| **79** (DamageInfo) | `sub_140E009C0` | `sub_140E00A30` | `sub_140E02420` | **All different** — see below |
| **81** (CmdMgr) | `sub_140E00720` (shared) | `sub_140E00720` (shared) | `sub_140E02320` (UNIQUE) | Burst creates different CmdMgr |
| **88** | `sub_140E00780` (shared) | `sub_140E00780` (shared) | `sub_140E02380` (UNIQUE) | Burst has extended config |
| **91** | `sub_140E009A0` | `sub_140E00A10` (UNIQUE) | `sub_140E009A0` (shared with Normal) | Hasei has different spawn offset |
| **96** | `sub_140E00980` | `sub_140E009F0` (UNIQUE) | `sub_1406A5200` (base) | Different alive checks |

### Slot 79 Differences (ConfigureDamageInfo)

**Normal** (`sub_140E009C0`):
```cpp
sub_140E00830();  // FunnelFlysword base damage setup
active = 1;  // byte+100
sub_effect = 10;  // dword+412
funnel_attack_hash = 0xD60D83C5;  // dword+444
```

**Hasei** (`sub_140E00A30`):
```cpp
sub_140E00830();  // same base
active = 1;
sub_effect = 13;  // ← DIFFERENT: 13 instead of 10
funnel_attack_hash = 0xD60D83C5;  // same hash
```

**Burst** (`sub_140E02420`):
```cpp
sub_140DE1930();  // ← DIFFERENT BASE (includes keepAlive/burst params)
byte+125 = 0;
dword+432 = -1;  // collision group = ALL
byte+436 = 1;    // enable terminate
byte+496 = 1;    // enable BURST MODE
byte+532 = 1;    // enable stage collision
active = 1;
sub_effect = 10;
funnel_attack_hash = 0xD60D83C5;
```

### Key Mechanical Differences

| Feature | Normal | Hasei | Burst |
|---------|--------|-------|-------|
| sub_effect mode | 10 | **13** (enhanced) | 10 |
| Burst mode (params+496) | OFF | OFF | **ON** |
| Terminate enabled (+436) | OFF | OFF | **ON** |
| Stage collision (+532) | OFF | OFF | **ON** |
| Collision group (+432) | default | default | **-1 (ALL)** |
| Spawn offset Z (slot 91) | **1.7** | **2.0** | **1.7** |
| OnInit | standard | standard | **custom** (collision setup) |
| Alive check (slot 96) | bit 2 at +80 | bit 2 at **+104** | base (always alive) |

**Interpretation**: Normal and Hasei are nearly identical — Hasei only has slightly higher sub_effect mode (13 vs 10, more hit effects) and a different spawn height (2.0 vs 1.7). **Burst** is fundamentally different: it enables burst mode flag, stage collision, uses ALL collision groups, and has a custom OnInit that connects to the collision system.

---

## 13. Slot 84 Analysis — All 17 Classes

Slot 84 configures **hit zone / interaction parameters**. 9 unique functions grouped:

### Group A: FunnelFlysword Family (sub_140F75250 → sub_140E2BFD0)
**Used by**: FunnelFlyswordNormal, Hasei, Burst
```cpp
// Thunk to sub_140E2BFD0 — standard funnel hit zone setup
void slot84_funnel_standard() { return sub_140E2BFD0(); }
```

### Group B: FunnelFlySWordThrow (sub_140F847F0)
**Used by**: FunnelFlySWordThrowFxBurst, FunnelFlySWordThrowHissatsu
```cpp
void slot84_throw(int64 a1, int64 a2) {
    sub_140E2BFD0();  // standard funnel setup
    *(a2 + 8) = 0;   // clear collision ID (thrown mode = no persistent hit)
}
```

### Group C: StickerFunnel + Attach + Defense (sub_140E28260)
**Used by**: StickerFunnelHissatsu, StickerFunnelWinLose, FunnelAttachAutomata, FunnelSelfDefense, FunnelMateDefense
```cpp
void slot84_sticker(int64 a1, int64 a2) {
    int64* entityRef = GetEntityRef(a1);  // sub_14063BE40
    SetHitZone(a2, 0, entityRef);  // sub_14066F920: mode=0, linked to entity
}
```

### Group D: TransparentSlasher01 (sub_140E01AC0)
**Used by**: TransparentSlasher01 only
```cpp
void slot84_slasher01(int64 a1, int64 a2) {
    sub_140E019D0();  // slasher base setup
    dword+288 = 751078663;     // hash: 0x2CC56B07 — slash pattern 01
    // 4 repeating blocks of melee hit zone data:
    // Each block: 2×float4 position data + height(10.5) + depth(9.0)
    // Block offsets: [32-84], [304-356], [576-628], [848-900]
    // position float4: (0, 0, 12.5, 0) and (0, 0, 23.5, 0) — Z-axis strike positions
    // + hash references at offsets 560, 832, 1104 for each strike phase
}
```
Hit zone constants: position Z = **12.5** and **23.5** (forward strike reach), height = **10.5**, depth = **9.0**

### Group E: TransparentSlasher04 (sub_140E01BF0)
**Used by**: TransparentSlasher04 only
```cpp
void slot84_slasher04(int64 a1, int64 a2) {
    sub_140E019D0();
    byte+1 = 0;
    dword+8 = 0;  // clear collision ID
    dword+288 = 2088247172;  // hash: 0x7C7B3784 — slash pattern 04
    // 6 repeating blocks (vs 4 for Slasher01!)
    // Same position data but more strike phases
    // Additional blocks at offsets [1120-1172] and [1392-1444]
    // Extra hash refs at offsets 1376, 1648
}
```
**Slasher04 has 6 strike zones vs Slasher01's 4** — more hits per slash sequence.

### Group F: FunnelAttach Mayu/Gurd (sub_140DE1E80)
**Used by**: FunnelAttachChangeWeaponDefenseformMayu, FunnelAttachChangeWeaponDefenseformGurd
```cpp
void slot84_attach(int64 a1, int64 a2) {
    if (!*(*(a1 + 13472) + 512))  // params+512: strongMagnet flag
        SetHitZone(a2, 0, NULL);   // mode=0, no entity link
    else {
        SetHitZone(a2, 3, NULL);   // mode=3 (defense barrier mode)
        *a2 = 0;                   // clear base type
    }
}
```

### Group G: SpAssistAge1 (sub_140DE1820)
```cpp
void slot84_assist(int64 a1, byte* a2) {
    sub_140F47E30();  // assist-specific setup
    *a2 = 0;          // clear hit zone type (melee entity, no projectile zone)
}
```

### Group H: SpPlasmaDiverMissile (sub_140E02140)
```cpp
void slot84_missile(int64 a1, int64 a2) {
    int64* entityRef = GetEntityRef(a1);
    SetHitZone(a2, 4, entityRef);  // mode=4 (missile type)
    *(a2 + 16) = float4(15.0, 0, 0, 0);  // blast radius = 15.0
    *(a2 + 8) = 0;
}
```

### Group I: ThrowDarkhoundMA (sub_140E022B0)
```cpp
// Uses sub_14066F920 with entityRef — standard throw hit zone
```

---

## 14. SpAssistAge1 Unique Slot Analysis

### Slot 18 — Component Setup (sub_140DE0CC0)
```cpp
void SpAssist_ComponentSetup(int64 this) {
    if (!*(*(this + 13472) + 504))  // assist_enabled flag
        goto base;
    
    int currentState = *(this + 1296);  // current animation state
    if (currentState == *(this + 13616))  // same as cached state
        goto base;
    
    if (currentState != 0) {
        if (*(*(this + 13472) + 505))  // secondary flag
            sub_140DE0E40();  // play appear effect
    } else {
        if (*(*(this + 13472) + 505))
            sub_140DE0DB0();  // play disappear effect
        
        if (*(this + 12368))  // has collision component
            SetupCollision(this + 12368, 255, 0, this + 1120, this + 12136);
    }
    *(this + 13616) = currentState;  // cache state
    
base:
    return sub_140672B10(this);  // base component setup
}
```
**Purpose**: Manages AGE-1 assist visibility — plays appear/disappear effects on state change and reconfigures collision.

### Slot 30 — Data Binding (sub_140DE0D90)
```cpp
void SpAssist_DataBind(int64 this) {
    if (*(*(this + 13472) + 504) && *(*(this + 13472) + 505))
        sub_140DE13A0();  // bind assist data to parent
}
```

### Slot 69 — Conditional Effect (sub_140DE17B0)
```cpp
void SpAssist_ConditionalEffect(int64 this, int64 a2, uint64 a3) {
    if (*(*(this + 13472) + 708) == 1) {  // assist mode check
        void* effect = Alloc(0x20);
        if (effect) effect = sub_140B07C10(effect);  // create assist effect
        
        // Replace existing effect at this + 13632
        void* old = *(this + 13632);
        *(this + 13632) = effect;
        if (old) Free(old, 0x20);
    }
}
```
**Purpose**: Creates/replaces the visual effect for AGE-1 assist, only when in assist mode 1.

### Slot 72 — OnHit (sub_140DE11E0)
```cpp
void SpAssist_OnHit(int64 this) {
    if (*(*(this + 13472) + 36))  // has tracking data
        ResetPhysicsMotion(*(this + 13480), *(this + 13480) + 272);  // reset on hit
    
    return base_OnHit(this);  // sub_140674410
}
```
**Purpose**: Resets physics motion on hit — stops the assist's current movement to react to being hit.

### Slot 90 — Termination Check (sub_140DE0F20)
```cpp
int64 SpAssist_TermCheck(int64 this, int64 a2) {
    if (*(*(this + 13472) + 472) != dword_141FF41F8)  // global termination flag
        return sub_14069BC60(a2);  // force terminate
    return *(this + 13472);  // continue
}
```
**Purpose**: Checks against a global termination flag — allows external kill commands to override the assist's lifecycle.
