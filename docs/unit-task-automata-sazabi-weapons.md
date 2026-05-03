# 017GYAKCH_002SAZABI (Sazabi) Complete Weapons Analysis

Decompiled from `vsac27_Release.exe` via IDA Pro.

---

## Overview

Sazabi has **3 UnitTaskAutomata weapon classes** (single variant):

| Weapon | UnitTaskAutomata VTable | CCmdActionManager VTable | Archetype |
|--------|-------------------------|--------------------------|-----------|
| ThrowHissatsuAxis | 0x141432CC8 | 0x141651538 | Throw (axis-guided tomahawk) |
| FunnelFly | 0x141432FF0 | 0x141651698 | Radicon (remote funnel) |
| FunnelSwarm | 0x141433318 | 0x1416517E0 | Radicon (funnel swarm) |

### RTTI Discovery Chain

| Class | RTTI Name Addr | type_info | COL | vtable[-1] | vtable[0] |
|-------|---------------|-----------|-----|------------|-----------|
| UTA\_ThrowHissatsuAxis | 0x1420791E0 | 0x1420791D0 | 0x141C02C80 | 0x141432CC0 | 0x141432CC8 |
| UTA\_FunnelFly | 0x142079240 | 0x142079230 | 0x141C02D58 | 0x141432FE8 | 0x141432FF0 |
| UTA\_FunnelSwarm | 0x142079290 | 0x142079280 | 0x141C02E48 | 0x141433310 | 0x141433318 |
| CAM\_ThrowHissatsuAxis | 0x1420CA3C0 | 0x1420CA3B0 | 0x141CA69D8 | 0x141651530 | 0x141651538 |
| CAM\_FunnelFly | 0x1420CA420 | 0x1420CA410 | 0x141CA6AA8 | 0x141651690 | 0x141651698 |
| CAM\_FunnelSwarm | 0x1420CA470 | 0x1420CA460 | 0x141CA6B98 | 0x1416517D8 | 0x1416517E0 |

### Override Count vs FreeFall EXVS2 Base (0x1413E1E18)

All three weapons have **15 overrides** each from the FreeFall base.

---

## 1. ThrowHissatsuAxis (必殺技軸投げ — Tomahawk Axis Throw)

**Archetype**: Throw (axis-guided thrown projectile with multi-point collision)
**Complexity**: High — custom OnUpdate with SIMD axis tracing

### 1.1 Override Map (15 slots)

| Slot | Function | FreeFall Base | Purpose |
|------|----------|---------------|---------|
| 0 | `sub_14092A200` | `sub_14092A3E0` | Destructor |
| 2 | `sub_140F66190` | `sub_140F76310` | **OnInit** — ground height detection + terrain snap |
| 12 | `sub_140F65DD0` | `sub_1406A5B30` | **OnUpdate** — multi-point axis collision (SIMD) |
| 25 | `sub_140034940` | `sub_1400394F0` | Registration |
| 49 | `sub_140F65DB0` | `sub_14097E6F0` | Internal |
| 58 | `sub_140F65D00` | `sub_14063C080` | Internal |
| 76 | `sub_140DDCAA0` | nop | Throw behavior hook |
| 78 | `sub_14094E8C0` | `sub_14094DF60` | Factory |
| 79 | `sub_140F66560` | `sub_140DDC8C0` | **ConfigureDamageInfo** |
| 81 | `sub_140F65BA0` | `sub_140F387C0` | **CreateCmdActionManager** |
| 84 | `sub_140F66470` | `sub_140DDC890` | Hit zone / collision config |
| 86 | `sub_140F66440` | `sub_140674F00` | Extended behavior |
| 87 | `sub_140F53F50` | nop | Axis-specific hook A |
| 88 | `sub_140F65D80` | nop | Axis-specific hook B |
| 89 | `sub_140F664C0` | `sub_140DDCDF0` | Animation override |

### 1.2 GetClassId (slot 28)

Returns **465** (inherited from FreeFall base — `sub_1406A5170`).
ThrowHissatsuAxis reuses the FreeFall class ID; differentiation happens via
the RTTI registration system, not the class ID.

### 1.3 OnInit (slot 2, `sub_140F66190`)

```
ThrowHissatsuAxis::OnInit(weapon):
  base_OnInit(weapon)                       // sub_1406A5BA0
  spawnPos = weapon.params->position         // params+32 (float3)
  ── ground height detection ──
  if RaycastDown(spawnPos, &hitY, collision_system, -1035468800):
    groundY = hitY
  else:
    for i = 0..9:
      topY = 200.0 - i * 70.0               // scan from 200 above down
      bottom = spawnPos.y + topY - 70.0
      top = spawnPos.y + topY
      RaycastVertical(collision_system, {x, z, bottom}, {x, z, top})
      if hit found AND entity at hit is alive (byte+8 set):
        groundY = hit.y
        break
  ── adjust spawn position ──
  weapon.params->position.y += groundY       // snap to terrain
  weapon.data[12216] = 0                     // clear counter
  SetVisibility(weapon, HIDDEN)              // sub_14063D180(a1, 0)
```

**Key behavior**: The tomahawk scans up to 10 height bands (each 70 units,
starting 200 units above spawn) to find terrain/ground. It adjusts its Y
position to sit on the ground plane and starts hidden.

### 1.4 OnUpdate (slot 12, `sub_140F65DD0`)

```
ThrowHissatsuAxis::OnUpdate(weapon):
  base_OnUpdate(weapon)                      // sub_1406A5B30
  if weapon.byte[14048]:                     // pending detonation flag
    weapon.data[13528]->byte[66] = 1         // trigger detonation
    weapon.byte[14048] = 0                   // clear flag
  if weapon.byte[13616]:                     // already completed axis scan
    return
  ── multi-point axis collision scan ──
  Transform 8 static axis points (from xmmword_142141D30) into world space
    via matrix at weapon+1168
  For each of 4 axis segment pairs:
    RaycastSegment(collision_system, pointA, pointB)
    if hit found:
      entity = LookupEntity(hit.id)
      if entity AND entity.alive (byte+101):
        Record hit position + direction
  ── process valid hits ──
  For each recorded hit:
    direction = normalize(hitA - hitB)       // SSE distance + normalize
    if distance > 0.01:                      // not degenerate
      Store normalized direction and positions
  ── trace axis to final target ──
  For last valid hit: reverse-trace from hit direction
    if finds alive entity at endpoint:
      Read param hash 0x41435BE6             // sub-munition spawn hash
      SpawnSubEffect(timeline, hash_value)   // sub_14063C3E0
      TriggerPhysics(weapon.physics)         // sub_140ED8AD0
      weapon.byte[13616] = 1                 // mark: axis scan complete
```

**Key behavior**: This is a **multi-point axis tracer** — the tomahawk travels
along a line defined by 4 segment pairs (8 points from static data), checking
collision at each segment. When it finds a valid target along the axis, it spawns
a sub-munition effect (hash `0x41435BE6`, the same sub-munition hash used by
NapalmBomb) and activates physics for the impact.

### 1.5 ConfigureDamageInfo (slot 79, `sub_140F66560`)

```
ThrowHissatsuAxis::ConfigureDamageInfo(weapon, damageInfo):
  ── base call: sub_140DDCAF0 ──
    damageInfo[0]     = 1           // damage enabled
    damageInfo.b[100] = 1           // active flag
    damageInfo[104]  |= 0x50        // base hit flags (0x40 | 0x10)
    Hash 0x397CE80D → if value==1: damageInfo.b[144] = 1 (pierce)
  ── ThrowHissatsuAxis overrides ──
  damageInfo.b[433] = 1             // returns to owner
  damageInfo.b[419] = 1             // axis-tracking flag
  damageInfo[104]   = 3             // hit type: 0x03 (HIT + STUN, no DOWN)
  damageInfo[108]   = 1             // damage scale
  damageInfo.b[435] = 0             // no secondary rotation
  damageInfo.b[127] = 1             // special collision mode
  damageInfo[152]   = 0             // damage multiplier = 0 (damage via sub-munition)
```

**Key insight**: The damage multiplier is 0 — the tomahawk itself does not deal
direct damage. Instead, the `sub_14063C3E0` call in OnUpdate spawns a separate
damage-dealing sub-munition (hash `0x41435BE6`) when the axis scan hits a target.
This is consistent with Sazabi's tomahawk being a "trap" weapon.

### 1.6 Slot 84 — Hit Zone Configuration (`sub_140F66470`)

```
ThrowHissatsuAxis::Slot84(weapon, config):
  config.b[0]  = 0                  // type = default
  config[4]    = 50.0f              // collision radius
  config[8]    = 35.0f              // collision height
  config[48]   = 1                  // zone type = sphere
  config[52]   = 50.0f              // secondary radius
  config[32..47] = {0, 0, 25.0, 0}  // offset A: 25 units up
  config[84]   = 50.0f              // tertiary radius
  config[64..79] = {0, 0, -25.0, 0} // offset B: 25 units down
  config[288]  = 0x918D2C88         // collision effect hash
```

**Hit zone**: Large sphere (radius 50, height 35) centered on the tomahawk,
with two sub-zones offset ±25 units vertically. This creates a tall cylindrical
collision volume around the embedded tomahawk.

### 1.7 CreateCmdActionManager (slot 81, `sub_140F65BA0`)

```
ThrowHissatsuAxis::CreateCmdActionManager(a1, a2, a3):
  alloc 0x130 bytes (304), zero-fill
  → sub_140F65B10(ptr):
      CCmdActionManager_Radicon::ctor(ptr)           // sub_140DDC790
      set vftable = CCmdActionManager_Throw           // VDK base
      init linked-lists at offset 272, 288            // sub_1406BF3C0
      set vftable = CCmdActionManager_ThrowHissatsuAxis  // EXVS2 derived
      init linked-lists at offset 288, 296
  return ptr
```

**Inheritance**: `CCmdActionManager` → `Radicon` → `Throw` → `ThrowHissatsuAxis`
**Object size**: 0x130 (304 bytes)

### 1.8 CCmdActionManager Execute Pipeline

The CCmdActionManager's slot[1] (`sub_140DEA280`) dispatches to slot[3]
(`sub_140DEA2C0`), which builds the standard Throw pipeline:

```
CCmdActionGroup_Series (main):
  ├── vtable[4]: sub_14068E160 (sub-movement init at a1+48)
  ├── CCmdAction_TerminateSeriesEnd (end marker)
  ├── [Optional: sub_140DEAAF0] if params.b[435] (not set for Sazabi)
  └── Main throw motion: sub_1406A1610
      Reads params: enable(+432), bone_mode(+100), secondary(+433)
      If params.b[434]:
        Rotation X = hash 0x4B382E24 → degrees→radians
        Rotation Y = hash 0x3C3F1EB2 → degrees→radians
        Rotation Z = hash 0xA5364F08 → degrees→radians
```

This is the **same Throw motion template** used by 001GUNDAM ThrowShield.
The unique behavior comes from the overridden OnUpdate axis-tracing, not the
throw motion itself.

---

## 2. FunnelFly (ファンネル飛行 — Single Funnel Deployment)

**Archetype**: Radicon (remote-controlled funnel)
**Complexity**: Medium — uses base Radicon pipeline with funnel-specific params

### 2.1 Override Map (15 slots)

| Slot | Function | FreeFall Base | Purpose |
|------|----------|---------------|---------|
| 0 | `sub_14092A700` | `sub_14092A3E0` | Destructor (0x3540 bytes) |
| 2 | `sub_140F75740` | `sub_140F76310` | **OnInit** — hide on spawn |
| 22 | `sub_1406733C0` | `sub_140DDC880` | Uses base init (no extended) |
| 25 | `sub_140034940` | `sub_1400394F0` | Registration |
| 28 | `sub_14094F070` | `sub_1406A5170` | **GetClassId** = 977 |
| 43 | `sub_140034940` | `sub_140602370` | Registration B |
| 49 | `sub_14063C370` | `sub_14097E6F0` | Internal |
| 69 | `sub_140DE1590` | nop | Funnel tracking update |
| 78 | `sub_14094E050` | `sub_14094DF60` | Factory |
| 79 | `sub_140F66610` | `sub_140DDC8C0` | **ConfigureDamageInfo** |
| 81 | `sub_140F665B0` | `sub_140F387C0` | **CreateCmdActionManager** |
| 84 | `sub_140DDCDC0` | `sub_140DDC890` | Generic config |
| 87 | `sub_140DE1480` | nop | Funnel-specific hook |
| 88 | `sub_140F66780` | nop | Funnel-specific hook B |
| 89 | nop | `sub_140DDCDF0` | Disabled (base behavior cleared) |

### 2.2 GetClassId (slot 28)

Returns **977** (`sub_14094F070`). Shared with FunnelSwarm.

### 2.3 OnInit (slot 2, `sub_140F75740`)

```
FunnelFly::OnInit(weapon):
  base_OnInit(weapon)             // sub_1406A5BA0 — standard param read
  SetVisibility(weapon, HIDDEN)   // sub_14063D160(a1, 0) — funnel starts invisible
```

Very simple — just hides the funnel on spawn. The funnel becomes visible when
the Radicon Execute activates it.

### 2.4 ConfigureDamageInfo (slot 79, `sub_140F66610`)

```
FunnelFly::ConfigureDamageInfo(weapon, damageInfo):
  ── funnel base: sub_140DE1570 → sub_140DE14B0 ──
    damageInfo[0]     = 1           // damage enabled
    damageInfo.b[115] = 0           // (will be overridden)
    damageInfo.b[100] = 1           // active
    damageInfo[104]   = 128 (0x80)  // hit type: DOWN
    damageInfo[108]   = 1           // damage scale
    damageInfo[120]   = 1           // collision type
    damageInfo.w[4]   = 256         // sub-type (0x100)
    damageInfo[408]   = 4           // lifetime timer slot index
    Hash 0xEDD1C108 → damageInfo[452]   // beam damage value
    Hash 0xD32D39ED → damageInfo[456]   // beam stun value
    damageInfo.b[439] = 1           // funnel auto-track enabled
  ── FunnelFly-specific overrides ──
  damageInfo.b[436] = 1             // funnel mode enabled
  damageInfo[444]   = 0x27917FAB    // effect hash A (FunnelFly only)
  damageInfo[448]   = 0x504436F6    // effect hash B (shared with FunnelSwarm)
  damageInfo.b[438] = 0             // no burst mode
  damageInfo[432]   = -1 (0xFFFFFFFF) // no primary effect override
  damageInfo.b[115] = 1             // override: enable tracking
  damageInfo.b[125] = 0             // no lock-on assist
  ── hit_effect_id_array population ──
  Read hash 0xEDD1C108 → value A    // beam type
  Read hash 0xD32D39ED → value B    // beam stun type
  hit_effect_array[count++] = {A, B} // 2 hit effect entries
```

**Key behavior**: FunnelFly populates **2 hit effect entries** from param hashes,
enabling the funnel to fire two types of beam (primary beam + stun beam).

### 2.5 CreateCmdActionManager (slot 81, `sub_140F665B0`)

```
FunnelFly::CreateCmdActionManager(a1, a2, a3):
  alloc 0x110 bytes (272), zero-fill
  CCmdActionManager_Radicon::ctor(ptr)       // sub_140DDC790
  set vftable = CCmdActionManager_FunnelFly  // primary + secondary
  return ptr
```

**Inheritance**: `CCmdActionManager` → `Radicon` → `FunnelFly`
**Object size**: 0x110 (272 bytes)

### 2.6 CCmdActionManager Execute Pipeline

The Execute function (`sub_140DFB7D0`) is the **full Radicon multi-phase pipeline**:

```
Phase 1 — Approach:
  CCmdActionGroup_Series:
    ├── CCmdAction_SetCollisionResolveType(0)    // collision OFF
    ├── vtable[3] → sub_141026400:               // weapon-specific phase
    │   ├── sub_140DFC2B0(a1)                    // base Radicon movement init
    │   └── CCmdAction_CreateProjectileDepiction  // create funnel visual
    ├── [if params.b[439]]:                      // funnel auto-track
    │   ├── CCmdAction_WaitForTargetKilled       // wait until target dies
    │   └── CCmdAction_Return                    // then return
    ├── CCmdAction_SetCollisionResolveType(params+120) // collision ON
    └── [if hash 0xD462A33B non-zero]:
        └── CCmdAction_WaitByFrame(value)        // wait N frames

Phase 2 — Main Attack:
  CCmdActionGroup_Series:
    ├── vtable[5]: custom movement setup
    ├── vtable[6]: custom attack pattern
    └── (registered to main action group)

Phase 3 — Loop (if params.b[440]):
  CCmdActionGroup_Series:
    ├── Physics body (sub_14068DAF0, 0x80 bytes)
    ├── vtable[16]: custom loop movement
    ├── CCmdAction_Return
    └── CCmdAction_Jump → back to Phase 2       // infinite loop

Phase 4 — Return Path:
  CCmdActionGroup_Series:
    ├── vtable[8]: return movement setup
    ├── Physics body (0x80 bytes)
    ├── vtable[10]: return physics config
    └── [if hash 0xA36593AD non-zero]:
        └── CCmdAction_PlaySE_OnParentVisible    // return sound effect

Terminal (if params.b[436] = 1):
  CCmdAction_TerminateSeriesEnd
  CCmdAction_Blank
  → stored for restart jump
  [if params.b[437]]: restart via vtable[12]
  vtable[11]: final cleanup
```

This is a sophisticated **remote-control weapon pipeline** with:
- Target tracking and auto-return on target kill
- Multi-phase attack with optional looping
- Return-to-owner path with sound effects
- Terminal phase with restart capability

---

## 3. FunnelSwarm (ファンネル群 — Funnel Swarm Deployment)

**Archetype**: Radicon (remote-controlled funnel swarm)
**Complexity**: Medium — nearly identical to FunnelFly with swarm spatial params

### 3.1 Override Map (15 slots)

| Slot | Function | FreeFall Base | Purpose |
|------|----------|---------------|---------|
| 0 | `sub_140929E00` | `sub_14092A3E0` | Destructor |
| 2 | `sub_140F75740` | `sub_140F76310` | **OnInit** — same as FunnelFly |
| 22 | `sub_1406733C0` | `sub_140DDC880` | Uses base init |
| 25 | `sub_140034940` | `sub_1400394F0` | Registration |
| 28 | `sub_14094F070` | `sub_1406A5170` | **GetClassId** = 977 (same) |
| 43 | `sub_140034940` | `sub_140602370` | Registration B |
| 49 | `sub_14063C370` | `sub_14097E6F0` | Internal |
| 69 | `sub_140DE1590` | nop | Funnel tracking update |
| 78 | `sub_14094E2F0` | `sub_14094DF60` | Factory |
| 79 | `sub_140F667F0` | `sub_140DDC8C0` | **ConfigureDamageInfo** |
| 81 | `sub_140F66720` | `sub_140F387C0` | **CreateCmdActionManager** |
| 84 | `sub_140DDCDC0` | `sub_140DDC890` | Generic config (same as FunnelFly) |
| 87 | `sub_140DE1480` | nop | Funnel-specific hook (same) |
| 88 | `sub_140F66780` | nop | Funnel-specific hook B (same!) |
| 89 | nop | `sub_140DDCDF0` | Disabled (same) |

### 3.2 Shared Functions with FunnelFly

FunnelFly and FunnelSwarm share **11 of 15 overridden functions**:

| Slot | Shared? | Notes |
|------|---------|-------|
| 0 | **Different** | Different destructors (different alloc sizes) |
| 2 | Same (`sub_140F75740`) | Both hide on spawn |
| 22, 25, 43, 49, 69 | Same | Infrastructure/registration |
| 28 | Same (`sub_14094F070`) | Both return class ID 977 |
| 78 | **Different** | Different factories |
| 79 | **Different** | Different ConfigureDamageInfo |
| 81 | **Different** | Different CreateCmdActionManager |
| 84, 87 | Same | Shared config/hooks |
| 88 | Same (`sub_140F66780`) | Same funnel hook B |

### 3.3 ConfigureDamageInfo (slot 79, `sub_140F667F0`)

```
FunnelSwarm::ConfigureDamageInfo(weapon, damageInfo):
  ── funnel base: sub_140DE1570 → sub_140DE14B0 ──
    (identical to FunnelFly base)
    damageInfo[0]     = 1           // damage enabled
    damageInfo[104]   = 128 (0x80)  // hit type: DOWN
    damageInfo[108]   = 1, [120] = 1, .w[4] = 256
    damageInfo[408]   = 4           // lifetime timer slot
    Hash 0xEDD1C108 → damageInfo[452]
    Hash 0xD32D39ED → damageInfo[456]
    damageInfo.b[439] = 1           // auto-track
  ── FunnelSwarm-specific overrides ──
  damageInfo.b[436] = 1             // funnel mode
  damageInfo[448]   = 0x504436F6    // effect hash B (shared with FunnelFly)
  damageInfo.b[438] = 0
  damageInfo[432]   = -1 (0xFFFFFFFF)
  damageInfo.b[115] = 1
  damageInfo.b[125] = 0
  ── SWARM SPATIAL PARAMS (unique to FunnelSwarm) ──
  damageInfo[528]   = 5.0f          // swarm spread distance
  damageInfo[532]   = 0.087266f     // swarm spread angle (5° in radians)
  damageInfo[540]   = 18.0f         // swarm radius
  damageInfo.b[550] = 0             // swarm mode = circular
  ── hit_effect_id_array population ──
  Read hash 0xEDD1C108 → value A
  hit_effect_array[count++] = {A, -1}  // only 1 hit effect entry (vs 2 for FunnelFly)
```

**Key differences from FunnelFly**:
1. **No hash A** in damageInfo[444] — FunnelSwarm doesn't set it
2. **Swarm spatial params**: spread distance=5.0, angle=5°, radius=18.0
3. **Only 1 hit effect entry** (with second value = -1) vs FunnelFly's 2 entries
4. No second param hash read (only 0xEDD1C108, not 0xD32D39ED)

### 3.4 CreateCmdActionManager (slot 81, `sub_140F66720`)

```
FunnelSwarm::CreateCmdActionManager(a1, a2, a3):
  alloc 0x110 bytes (272), zero-fill
  CCmdActionManager_Radicon::ctor(ptr)       // sub_140DDC790
  set vftable = CCmdActionManager_FunnelSwarm
  return ptr
```

**Same pattern as FunnelFly.** Object size: 0x110 (272 bytes).

### 3.5 CCmdActionManager Execute Pipeline

FunnelSwarm uses the **same shared Radicon Execute** (`sub_140DFB7D0`) as FunnelFly.
The weapon-specific phase (vtable[3] = `sub_1410268A0`) is **structurally identical**
to FunnelFly's (`sub_141026400`):

```
vtable[3]:
  sub_140DFC2B0(a1)                          // base Radicon movement init
  CCmdAction_CreateProjectileDepiction       // create funnel swarm visual
```

The behavioral difference comes from the **swarm spatial params** set in
ConfigureDamageInfo, which the Radicon pipeline reads at runtime to position
multiple funnels in a spread pattern.

---

## 4. CCmdActionManager Comparison

| Property | ThrowHissatsuAxis | FunnelFly | FunnelSwarm |
|----------|-------------------|-----------|-------------|
| **Inheritance** | Radicon → Throw → unit | Radicon → unit | Radicon → unit |
| **Object size** | 0x130 (304 bytes) | 0x110 (272 bytes) | 0x110 (272 bytes) |
| **VTable** | 0x141651538 | 0x141651698 | 0x1416517E0 |
| **slot[0] destructor** | `sub_140F5B7A0` | `sub_140F844C0` | `sub_140F844C0` (same!) |
| **slot[1] Execute** | `sub_140DEA280` (dispatch) | `sub_140DFB7D0` (shared!) | `sub_140DFB7D0` (shared!) |
| **slot[2] cleanup** | `sub_1406728A0` | `sub_1406728A0` | `sub_1406728A0` (all same) |
| **slot[3] build** | `sub_140DEA2C0` (Throw) | `sub_141026400` | `sub_1410268A0` |

FunnelFly and FunnelSwarm share the same destructor AND the same Execute function.
Their only CCmdActionManager difference is the slot[3] build function (different
addresses but identical code — both just call the Radicon base + create depiction).

---

## 5. Comparative Summary

| Property | ThrowHissatsuAxis | FunnelFly | FunnelSwarm |
|----------|-------------------|-----------|-------------|
| **Archetype** | Throw (axis-guided) | Radicon (single funnel) | Radicon (swarm) |
| **ClassId** | 465 (FreeFall) | 977 | 977 |
| **Motion** | Standard Throw + axis trace | Radicon multi-phase | Radicon multi-phase |
| **Damage Type** | 0x03 (HIT+STUN) | 0x80 (DOWN) | 0x80 (DOWN) |
| **Direct Damage** | No (multiplier=0, via sub-munition) | Yes (via beam params) | Yes (via beam params) |
| **Returns to Owner** | Yes (byte+433=1) | No | No |
| **Auto-Track** | No (byte+439=0) | Yes (byte+439=1) | Yes (byte+439=1) |
| **Funnel Mode** | No | Yes (byte+436=1) | Yes (byte+436=1) |
| **Effect Hash A** | — | 0x27917FAB | — |
| **Effect Hash B** | — | 0x504436F6 | 0x504436F6 |
| **Hit Effects** | Sub-munition spawn | 2 entries (beam + stun) | 1 entry (beam only) |
| **Swarm Params** | — | — | 5.0/5°/18.0 |
| **Starts Hidden** | Yes | Yes | Yes |
| **Custom OnUpdate** | Yes (axis tracing) | No (base) | No (base) |
| **Custom OnInit** | Yes (ground snap) | Simple (hide) | Simple (hide) |
| **Override Count** | 15 | 15 | 15 |
| **Unique Slots** | 12, 49, 58, 76, 86, 88 | 69, 88 | 69, 88 |

---

## 6. hitEffectHash to UnitTask Mapping Table

Based on BulletParam data and decompiled behavior:

| hitEffectHash | Decimal | moveType | Mapped UnitTask | Evidence |
|---------------|---------|----------|-----------------|----------|
| **170020102** | 170020102 | 4 (thrown) | **ThrowHissatsuAxis** | moveType=4 matches Throw archetype, initialAngle=500 consistent with axis throw |
| **170020103** | 170020103 | 0,1,2 (funnel) | **FunnelFly / FunnelSwarm** | Multiple moveTypes for funnel deployment phases |
| 0x27917FAB | 663846827 | — | FunnelFly internal effect | Stored in damageInfo[444], FunnelFly only |
| 0x504436F6 | 1346647798 | — | Shared funnel effect | Stored in damageInfo[448], both funnels |

### hitEffectHash Pattern: 17002XXYY

```
17 = 017 (series: GYAKCH / Char's Counterattack)
002 = 002SAZABI (unit: Sazabi)
XX  = variant
YY  = weapon index
  02 → ThrowHissatsuAxis (tomahawk)
  03 → FunnelFly / FunnelSwarm (funnels)
```

### Generic hitEffectHash Values (from BulletParam)

| Hash | Likely Usage |
|------|-------------|
| 1 | Standard beam shot |
| 3 | Melee hit |
| 4 | Sub-weapon |
| 40 | Burst shot |
| 60 | Charged shot |
| 104 | Special attack |

---

## 7. Param Hash Reference

| Hash (Hex) | Hash (Decimal) | Used By | Purpose |
|------------|----------------|---------|---------|
| 0x397CE80D | 964487181 | ThrowHissatsuAxis | Pierce enable flag (if value==1) |
| 0x4B382E24 | 1261973028 | ThrowHissatsuAxis | Throw rotation X (degrees) |
| 0x3C3F1EB2 | 1010769586 | ThrowHissatsuAxis | Throw rotation Y (degrees) |
| 0xA5364F08 | -1523167480 | ThrowHissatsuAxis | Throw rotation Z (degrees) |
| 0x41435BE6 | 1094933478 | ThrowHissatsuAxis OnUpdate | Sub-munition spawn hash |
| 0x918D2C88 | -1853019000 | ThrowHissatsuAxis Slot84 | Collision effect hash |
| 0xEDD1C108 | -305020664 | FunnelFly, FunnelSwarm | Beam damage value / hit_effect param |
| 0xD32D39ED | -752010771 | FunnelFly only | Beam stun value / hit_effect param |
| 0xD462A33B | -731733189 | Radicon Execute | WaitByFrame duration |
| 0xA36593AD | -1553624147 | Radicon Execute | Return SE (sound effect) hash |

---

## 8. DamageInfo Field Reference

| Offset | Type | ThrowHissatsuAxis | FunnelFly | FunnelSwarm | Meaning |
|--------|------|-------------------|-----------|-------------|---------|
| 0 | DWORD | 1 | 1 | 1 | Damage enabled |
| 4 | WORD | — | 256 | 256 | Sub-type (funnel) |
| 100 | BYTE | 1 | 1 | 1 | Active flag |
| 104 | DWORD | 3 | 128 | 128 | Hit type flags |
| 108 | DWORD | 1 | 1 | 1 | Damage scale |
| 115 | BYTE | — | 1 | 1 | Tracking enabled |
| 120 | DWORD | — | 1 | 1 | Collision resolve type |
| 125 | BYTE | — | 0 | 0 | Lock-on assist |
| 127 | BYTE | 1 | — | — | Special collision mode |
| 144 | BYTE | conditional | — | — | Pierce flag (from hash) |
| 152 | DWORD | 0 | — | — | Damage multiplier |
| 408 | DWORD | — | 4 | 4 | Lifetime timer slot |
| 419 | BYTE | 1 | — | — | Axis-tracking flag |
| 432 | DWORD | — | -1 | -1 | Primary effect override |
| 433 | BYTE | 1 | — | — | Returns to owner |
| 435 | BYTE | 0 | — | — | Secondary rotation |
| 436 | BYTE | — | 1 | 1 | Funnel mode enabled |
| 438 | BYTE | — | 0 | 0 | Burst mode |
| 439 | BYTE | — | 1 | 1 | Funnel auto-track |
| 444 | DWORD | — | 0x27917FAB | — | Effect hash A |
| 448 | DWORD | — | 0x504436F6 | 0x504436F6 | Effect hash B |
| 452 | DWORD | — | (from hash) | (from hash) | Beam damage value |
| 456 | DWORD | — | (from hash) | (from hash) | Beam stun value |
| 528 | float | — | — | 5.0 | Swarm spread distance |
| 532 | float | — | — | 0.0873 (5°) | Swarm spread angle |
| 540 | float | — | — | 18.0 | Swarm radius |
| 550 | BYTE | — | — | 0 | Swarm mode (circular) |

---

## 9. Weapon Behavior Summary

### ThrowHissatsuAxis — "Embedded Tomahawk Trap"
Sazabi throws a tomahawk that **snaps to the ground** (OnInit terrain detection),
starts hidden, then performs an **axis-guided collision scan** (OnUpdate) along 4
segments. When a target crosses the axis, the tomahawk spawns a **sub-munition
effect** (hash `0x41435BE6`) that deals the actual damage, while the tomahawk
itself has a damage multiplier of 0. The tomahawk returns to the owner after
activation. Hit flags are minimal (0x03 = HIT+STUN, no DOWN).

### FunnelFly — "Single Funnel Beam Attack"
A single funnel deployed as a Radicon (remote-controlled) unit. It starts hidden,
then the Radicon pipeline phases it through approach → attack → return. The funnel
has **2 hit effect types** (beam + stun beam), **DOWN hit type** (0x80), and
**auto-tracks** the target. It reads beam damage and stun values from param hashes
at runtime.

### FunnelSwarm — "Multi-Funnel Spread Attack"
A funnel swarm that behaves identically to FunnelFly at the code level but uses
**swarm spatial parameters** (spread=5.0, angle=5°, radius=18.0) to position
multiple funnels in a formation. It has **only 1 hit effect type** (beam only,
no separate stun beam) and lacks the secondary effect hash (0x27917FAB).
The swarm mode byte (offset 550) is 0, indicating circular spread pattern.

---

## 10. Architecture Comparison with 001GUNDAM Weapons

| Aspect | 001GUNDAM Weapons | 002SAZABI Weapons |
|--------|-------------------|-------------------|
| **Variant count** | 2 per weapon (001/002 costumes) | 1 per weapon (single variant) |
| **Total classes** | 8 UTA + 8 CAM | 3 UTA + 3 CAM |
| **Throw types** | ThrowShield, BeamJavelin | ThrowHissatsuAxis only |
| **Radicon types** | HammerShot (chain) | FunnelFly, FunnelSwarm |
| **Custom OnUpdate** | HammerShot only | ThrowHissatsuAxis only |
| **Sub-munition** | NapalmBomb | ThrowHissatsuAxis |
| **Shared sub-munition hash** | `0x41435BE6` | `0x41435BE6` (same!) |
| **Max override count** | 18 (HammerShot) | 15 (all weapons) |
| **Funnel system** | None | Yes (FunnelFly + FunnelSwarm) |
| **Chain system** | Yes (HammerShot) | None |

The `0x41435BE6` sub-munition hash is shared between 001GUNDAM's NapalmBomb
and 002SAZABI's ThrowHissatsuAxis, suggesting it's a generic "spawn sub-effect"
parameter rather than a weapon-specific identifier.
