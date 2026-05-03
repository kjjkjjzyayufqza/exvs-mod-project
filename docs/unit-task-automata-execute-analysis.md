# CCmdActionManager Execute() Analysis

## Summary Table

| Manager Type | Vtable | Execute Addr | Status |
|---|---|---|---|
| CCmdActionManager_Summon | 0x1415D4E08 | 0x140DEFA00 | Decompiled |
| CCmdActionManager_SummonRush | 0x1415D4EB0 | 0x140DEFA00 | Same as Summon |
| CCmdActionManager_Anchor | 0x1415D4CF0 | 0x140DEDF40 | Decompiled |
| CCmdActionManager_AnchorReturn | N/A | N/A | No own vtable (abstract/inherited) |
| CCmdActionManager_AnchorThrow | N/A | N/A | No own vtable (abstract/inherited) |
| CCmdActionManager_Radicon | 0x1415D3F38 | _purecall | Abstract (pure virtual) |
| CCmdActionManager_ShockHalo | 0x1415D47A8 | 0x140DEC7E0 | Decompiled |
| CCmdActionManager_Detonator | 0x1415D4C38 | 0x140DEDB20 | Decompiled |
| CCmdActionManager_FreeFly | 0x1415D4980 | 0x140DECAC0 | Decompiled |

---

## 1. CCmdActionManager_Summon (& SummonRush)

**Vtable**: 0x1415D4E08 (Summon), 0x1415D4EB0 (SummonRush)  
**Execute**: 0x140DEFA00 (shared by both)  
**Differentiator**: SummonRush overrides vtable slot[5] with sub_140DF2360

### Execute Pipeline (0x140DEFA00)

```
1. sub_140DEFB20(this, keyValuePtr, a2)  — "Setup" phase
2. this->vfunc[4](this, keyValuePtr, a2)  — "Motion/Aiming" phase (sub_140DF0BB0)
3. sub_140DF0970(this, keyValuePtr, a2)  — "Rotation" phase
4. this->vfunc[6](this, keyValuePtr, a2)  — "Line/Overlap" phase (sub_140DF0500)
5. CCmdAction_Blank → appended to keyValuePtr action list
6. this->vfunc[7](this, keyValuePtr, a2)  — "Disappear/Terminate" phase (sub_140DF02E0)
7. Conditional (flag at offset+532): sub_140DF0DC0 — TerminateSeriesEnd + Blank + WaitByFrame(4)
```

### Phase 1: Setup (sub_140DEFB20)

Reads from param struct at `*(v7 + 13472)`:

| Offset | Type | Usage |
|--------|------|-------|
| +544 | bool | Enable vernier/effect pre-launch setup |
| +548 | int | GlobalEffect ID |
| +560 | float[4] | GlobalEffect scale (xyz) |
| +576 | bool | Enable BulletFlyFunction (chase camera) |
| +580 | int | Chase camera / SE ID parameter |
| +585 | bool | Enable orientation control (sub_1406A2760) |
| +588 | int | Orientation parameter |
| +640 | bool | Enable VernierController |
| +644 | int | Vernier start param |
| +648 | int | Vernier second param |

**CCmdAction nodes created**:
- `CCmdAction_GlobalEffect` — with effect ID from +548, scale from +560
- BulletFlyFunction (via sub_14069BF40) — SE ID from +580
- `CCmdAction_VernierController_Start` — mode=3, params from +644/+648
- `CCmdActionGroup_Series` containing:
  - Orientation action (sub_1406A2760) or sub_1406A13E0(waitFrames=10)
  - `CCmdAction_DisableMotionLoop` (conditional on +452/+453)
  - group mode = 2
- BulletFlyFunction stop action (sub_140DEF7E0)

### Phase 2: Motion/Aiming (sub_140DF0BB0, vtable[4])

| Offset | Type | Usage |
|--------|------|-------|
| +456 | int | Motion ID (-1 = skip) |
| +460 | float | Motion speed rate (skip if == 1.0) |
| +576 | bool | Enable aiming rotation |
| +580 | int | Aiming speed |
| +588 | int | WaitByFrame count for aiming |

**CCmdAction nodes created**:
- `sub_1406A2620` (motion start action) — motion ID from +456
- `CCmdAction_SetMotionSpeedRate` — rate from +460 (if != 1.0)
- If aiming enabled: `CCmdAction_AimingRotateByFrameToUpdateTarget` — frames from +588, speed from +580
- Else: `CCmdAction_WaitByFrame` — frames from +588

### Phase 3: Rotation (sub_140DF0970)

| Offset | Type | Usage |
|--------|------|-------|
| +16 | int | Rotation mode (nonzero → nested series) |
| +36 | int | Alt rotation mode |

**CCmdAction nodes created**:
- `CCmdAction_RotateOffsetBoneForUpvectorZ` — mode param=1, groupType=1
- If nested mode: wraps in `CCmdActionGroup_Series` containing secondary group

### Phase 4: Line/Overlap (sub_140DF0500, vtable[6])

| Offset | Type | Usage |
|--------|------|-------|
| +488 | int | Line motion ID (-1 = skip entire phase) |
| +492 | float | Line motion speed rate |
| +496 | float | Motion state frame threshold |
| +500 | bool | Enable motion pause sequence |

**CCmdAction nodes created** (all in a `CCmdActionGroup_Series`):
- `CCmdAction_SetMotionPause(false)` (if +500 flag)
- `CCmdAction_DisableMotionLoop` (if +500 flag)
- `CCmdAction_WaitForOverlapLineEnd` (if +500 flag)
- `CCmdAction_SetEnableDefaultLine(false)` (if threshold <= 0)
- `sub_1406A2620` (motion action) — ID from +488
- `CCmdAction_SetMotionSpeedRate` — rate from +492 (if != 1.0)
- If threshold > 0: `CCmdAction_WaitForMotionStateFrame` + `CCmdAction_SetMotionPause(true)`
- Else: `CCmdAction_WaitForOverlapLineEnd`

### Phase 5: Disappear/Terminate (sub_140DF02E0, vtable[7])

| Offset | Type | Usage |
|--------|------|-------|
| +608 | bool | Enable simple disappear |
| +609 | bool | Enable summon disappear effect check |

**CCmdAction nodes created**:
- `CCmdAction_Blank`
- `CCmdAction_IsEnableDisappearSummonEffect`
- `CCmdAction_TerminateSeriesEnd`
- sub_140DF0480 (final cleanup)

### SummonRush-specific Phase (sub_140DF2360, vtable[5])

Only present in SummonRush. Creates 3 `CCmdActionGroup_Series`:

| Offset | Type | Usage |
|--------|------|-------|
| +672 | int | Rush parameter 1 |
| +676 | int | Rush parameter 2 |
| +680 | int | Rush parameter 3 |
| +684 | bool | Rush flag |
| +688 | bool | Set group mode = 2 |

**CCmdAction nodes created**:
- Series 1: vtable[10] virtual call (mode=1)
- Series 2: vtable[11] virtual call + sub_140DF2770 (mode=2)
- Series 3: CCmdActionGroup with GoAhead + sub_140DF1DD0 (rush movement params)

---

## 2. CCmdActionManager_Anchor

**Vtable**: 0x1415D4CF0  
**Execute**: 0x140DEDF40

### Execute Pipeline

```
1. Conditional (!flag+464): CCmdAction_SetCollisionEnableModeForShell(0)
2. Create base CCmdActionGroup (sub_14068DAF0)
3. Conditional (flag+464): CCmdAction_AnchorJumpToBack (groupType=2)
4. Hash 0x32ACABFB lookup → CCmdAction_WaitForLifeTimeEnd (if value > 0)
5. this->vfunc[3](this, group, a2) — StandardHomingMoveSet + RotateOffset
6. Append group to keyValuePtr
7. CCmdAction_Blank
8. Conditional (!flag+464): CCmdAction_SetCollisionEnableModeForStage(0)
9. this->vfunc[4] & vfunc[5] — (NOP stubs in base)
10. Hash 0xA36593AD lookup → CCmdAction_PlaySE_OnParentVisible (if nonzero)
11. CCmdAction_TerminateSeriesEnd
12. Conditional (flag+440): link TerminateSeriesEnd to termination ref
13. Conditional (flag+464): "Return" CCmdActionGroup_Series:
    - CCmdAction_WaitByFrame(1)
    - CCmdAction_AnchorStop
    - CCmdAction_AnchorRelease
    - CCmdAction_Return
14. Conditional (flag+464): "Kyuchaku" CCmdActionGroup_Series:
    - CCmdAction_WaitByFrame(1)
    - CCmdAction_AnchorKyuchaku (data from offset+448)
    - CCmdAction_AnchorRelease
    - CCmdAction_Return
```

### Hash Keys

| Hash (hex) | Hash (decimal) | Purpose |
|---|---|---|
| 0x32ACABFB | 850177019 | Lifetime wait frames |
| 0xA36593AD | -1553624147 (signed) | SE (sound effect) ID |

### Anchor vtable[3] (sub_140DEE770) — Movement Setup

**CCmdAction nodes created**:
- `CCmdAction_StandardHomingMoveSet` (derived from BulletFlyFunctionAbstract)
  - speed = π/2 (1.5707963 radians), groupType=2
- `CCmdAction_RotateOffsetBoneForUpvectorZ` — mode from offset+100, groupType=1

### Key Param Struct Offsets

| Offset | Type | Usage |
|--------|------|-------|
| +100 | byte | RotateOffset bone mode |
| +440 | bool | Enable terminate ref link |
| +448 | 16 bytes | AnchorKyuchaku data (OWORD) |
| +464 | bool | "Return mode" — enables AnchorJumpToBack + Return/Kyuchaku series |

---

## 3. CCmdActionManager_Radicon

**Vtable**: 0x1415D3F38  
**Execute**: `_purecall` (ABSTRACT)

This is a pure abstract base class. Derived classes must implement Execute.

---

## 4. CCmdActionManager_ShockHalo

**Vtable**: 0x1415D47A8  
**Execute**: 0x140DEC7E0

### Execute Pipeline

```
1. Create base CCmdActionGroup (sub_14068DAF0)
2. Conditional (angle > 0): Create rotation group (sub_1406A65E0)
   - Run virtual rotation init + sub_1406AE820
   - groupType = 1
3. Hash 0x41FBD241 lookup → effect ID for CCmdAction_AttachedEffect_Start
   - scale = (1,1,1,1), dword mode = 1
4. CCmdAction_WaitForLifeTimeEnd (groupType=2)
5. sub_1406A2710 action (dword+28 = 1) — likely return/cleanup
6. Append group to keyValuePtr
```

### Hash Keys

| Hash (hex) | Hash (decimal) | Purpose |
|---|---|---|
| 0x41FBD241 | 1107022401 | Attached effect ID |

### Key Param Struct Offsets (via parent chain)

| Offset | Type | Usage |
|--------|------|-------|
| +432 | float | Angle (degrees → radians, for initial rotation) |

---

## 5. CCmdActionManager_Detonator

**Vtable**: 0x1415D4C38  
**Execute**: 0x140DEDB20

### Execute Pipeline

```
1. Create base CCmdActionGroup (sub_14068DAF0)
2. Create CCmdActionGroup_Series (inner series):
   - this->vfunc[3](this, series, a2) — sub_140DEA2C0 (movement/orientation)
   - CCmdAction_TerminateSeriesEnd
3. Create CCmdActionGroup_Series (detonation timing):
   - CCmdAction_SetInteractEnableModeAll(0) — disable interaction
   - Hash 0x4C55EA3D lookup → CCmdAction_WaitByFrame(frames) — fuse timer
   - CCmdAction_SetInteractEnableModeAll(1) — re-enable interaction
4. Append both to base group, then to keyValuePtr
5. CCmdAction_TerminateSeriesEnd (top-level)
6. Hash 0x41435BE6 lookup → CCmdAction_ShotBullet (if value != 0)
   - Links to termination ref (this+288)
```

### Detonator vtable[3] (sub_140DEA2C0) — Movement/Orientation

Creates `CCmdActionGroup_Series`:
- Calls vtable[4] (sub_140DEABB0) for movement logic
- `CCmdAction_TerminateSeriesEnd`
- Conditional (flag+435): sub_140DEAAF0 (additional explosion logic)
- Conditional (flag+434): Reads 3 orientation hash keys for rotation:

| Hash (hex) | Hash (decimal) | Purpose |
|---|---|---|
| 0x4B382E24 | 1261973028 | Pitch angle (degrees → radians) |
| 0x3C3F1EB2 | 1010769586 | Yaw angle (degrees → radians) |
| 0xA5364F08 | -1523167480 (signed) | Roll angle (degrees → radians) |

Then calls `sub_1406A1610` with:
- orientation vector (pitch/yaw/roll in radians)
- flags from +432 (enable), +100 (bone mode), +433 (secondary flag)

### Top-Level Hash Keys

| Hash (hex) | Hash (decimal) | Purpose |
|---|---|---|
| 0x4C55EA3D | 1280698941 | Detonation fuse timer (frames) |
| 0x41435BE6 | 1094933478 | Shot bullet ID (0 = no shot) |

### Key Param Struct Offsets

| Offset | Type | Usage |
|--------|------|-------|
| +100 | byte | Bone mode |
| +432 | bool | Enable orientation |
| +433 | bool | Secondary orientation flag |
| +434 | bool | Enable 3-axis rotation from hashes |
| +435 | bool | Enable explosion sub-effect |

---

## 6. CCmdActionManager_FreeFly

**Vtable**: 0x1415D4980  
**Execute**: 0x140DECAC0

### Execute Pipeline

```
1. CCmdAction_VernierController_Start (vernierObj from context, mode=3)
2. CCmdAction_SetCollisionEnableModeForStage(0) — disable stage collision
3. Conditional (flag+432): 
   - CCmdAction_WaitByFrame(1)
   - sub_1406A2760 (orientation) with scale=(1,1,1,0), mode=1, type=0
4. Create "Forward Flight" CCmdActionGroup (sub_14068DAF0):
   - CCmdAction_WaitForLifeTimeEnd (groupType=2)
   - CCmdAction_GoAhead (speed=π/2, frame=-1=infinite)
   - CCmdActionGroup_Series (sub-group):
     * Inner CCmdActionGroup with sub_1406A2150(speedX from +408, speedY from +436, maxFrame=600)
     * group mode = 2
5. Create "Return/Stop" CCmdActionGroup (sub_14068DAF0):
   - CCmdAction_GoAhead (speed=π/2, frame=-1=infinite)
   - CCmdActionGroup_Series:
     * Conditional (flag+433): CCmdAction_GlobalEffect (hash=0xC1FF820C, mode=1)
     * Hash 0xD55CBB87 lookup → sub_1406A13E0 (WaitByFrame with looked-up value)
     * group mode = 2
6. CCmdAction_VernierController_Stop (flag byte[44]=1)
```

### Hash Keys

| Hash (hex) | Hash (decimal) | Purpose |
|---|---|---|
| 0xD55CBB87 | -715342969 (signed) | Return phase wait frames |
| 0xC1FF820C | -1040219636 (signed) | GlobalEffect ID for return phase |

### Key Param Struct Offsets

| Offset | Type | Usage |
|--------|------|-------|
| +408 | int | Forward flight speed X component |
| +432 | bool | Enable initial orientation setup |
| +433 | bool | Enable return-phase global effect |
| +436 | int | Forward flight speed Y component |

---

## Common Patterns

### Action Group Structure
- `sub_14068DAF0` creates a base `CCmdActionGroup` (0x80 bytes) — parallel action container
- `CCmdActionGroup_Series` (0x118 bytes) — sequential action container with sub_14069B580/sub_14068AAD0 init
- Group types: 1 = sequential within parent, 2 = parallel/concurrent

### Hash Lookup Function
`sub_1405B2980(base+2904, &output, contextPtr, &hashKey)` calls `LookupCommandDescriptorByHash` to resolve parameter values from a hash-indexed command descriptor table.

### Common CCmdAction Types
| Action | Size | Description |
|--------|------|-------------|
| CCmdAction_Blank | 0x20 | No-op placeholder |
| CCmdAction_WaitByFrame | 0x28 | Wait N frames |
| CCmdAction_WaitForLifeTimeEnd | 0x28 | Wait until lifetime expires |
| CCmdAction_GoAhead | 0x30 | Move forward (speed, frame count) |
| CCmdAction_Return | 0x20 | Return to parent |
| CCmdAction_TerminateSeriesEnd | 0x20 | Mark end of series |
| CCmdAction_GlobalEffect | 0x60 | Play global VFX |
| CCmdAction_AttachedEffect_Start | 0x80 | Attach VFX to entity |
| CCmdAction_SetMotionSpeedRate | 0x28 | Change animation speed |
| CCmdAction_SetMotionPause | 0x28 | Pause/resume animation |
| CCmdAction_DisableMotionLoop | 0x20 | One-shot animation |
| CCmdAction_RotateOffsetBoneForUpvectorZ | 0x28 | Bone rotation correction |
| CCmdAction_StandardHomingMoveSet | 0x28 | Homing movement (from BulletFlyFunctionAbstract) |
| CCmdAction_VernierController_Start | 0x30 | Start vernier effect |
| CCmdAction_VernierController_Stop | 0x30 | Stop vernier effect |
| CCmdAction_ShotBullet | 0x28 | Fire a sub-bullet |
| CCmdAction_SetCollisionEnableModeForShell | 0x28 | Toggle shell collision |
| CCmdAction_SetCollisionEnableModeForStage | 0x28 | Toggle stage collision |
| CCmdAction_SetInteractEnableModeAll | 0x28 | Toggle interaction |
| CCmdAction_AnchorJumpToBack | 0x20 | Anchor: jump behind target |
| CCmdAction_AnchorStop | 0x20 | Anchor: stop movement |
| CCmdAction_AnchorRelease | 0x20 | Anchor: release connection |
| CCmdAction_AnchorKyuchaku | 0x30 | Anchor: attraction/suction |
| CCmdAction_PlaySE_OnParentVisible | 0x28 | Play SE when parent visible |
| CCmdAction_AimingRotateByFrameToUpdateTarget | 0x40 | Rotate toward target |
| CCmdAction_SetEnableDefaultLine | 0x28 | Toggle default line visibility |
| CCmdAction_WaitForOverlapLineEnd | 0x20 | Wait for line overlap end |
| CCmdAction_WaitForMotionStateFrame | 0x28 | Wait for motion frame |
| CCmdAction_IsEnableDisappearSummonEffect | 0x20 | Check disappear effect state |
| CCmdAction_BulletFlyFunctionAbstract | 0x28 | Base fly function |

### Constant: π/2 = 1070141403 (0x3FC90FDB as IEEE754 float)
Used as default angular speed in homing/GoAhead actions.
