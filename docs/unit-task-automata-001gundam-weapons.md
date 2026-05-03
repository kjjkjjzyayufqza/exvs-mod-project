# 001GUNDAM (RX-78-2) Complete Weapons Analysis

## Overview

RX-78-2 Gundam has **2 variants** × **4 weapons** = **8 UnitTaskAutomata classes**:

| Variant | BeamJavelin | NapalmBomb | ThrowShield | HammerShot |
|---------|-------------|------------|-------------|------------|
| 001 (Base) | 0x1413E5A30 | 0x1413E5D58 | 0x1413E6080 | 0x1413E63A8 |
| 002 (G-Armor?) | 0x1413E66D0 | 0x1413E69F8 | 0x1413E6D20 | 0x1413E7048 |

### Inheritance from FreeFall EXVS2 Base

All weapons inherit from the EXVS2 intermediate framework class (same as FreeFall).
Override counts compared to FreeFall base:

| Weapon | Overrides | Archetype | Complexity |
|--------|-----------|-----------|------------|
| BeamJavelin | 13 | Throw (beam javelin throw) | Medium |
| NapalmBomb | 12 | FreeFall (napalm drop) | Medium |
| ThrowShield | 13 | Throw (shield throw) | Medium |
| HammerShot | **18** | **Custom** (chain weapon) | **High** |

### Shared vs Variant-Specific Functions

| Function | 001 vs 002 |
|----------|-----------|
| Destructor (slot 0) | Same for Javelin/Napalm/Shield, different for HammerShot |
| OnUpdate (slot 12) | Same for all; HammerShot has unique update |
| CreateCmdActionManager (slot 81) | BeamJavelin: SHARED. Others: DIFFERENT per variant |
| ConfigureDamageInfo (slot 79) | BeamJavelin/ThrowShield: SHARED. Napalm/Hammer: SHARED within type |
| slot 89 | BeamJavelin 001 ≠ 002. Others: same (nop) |

---

## 1. BeamJavelin (ビームジャベリン)

**Archetype**: ThrowMortar (NOT plain Throw — mortar arc trajectory)
**Base pattern**: Mortar-arc throw with rotation, simulates javelin length via hit offset

### VTable Overview
- slot 81: `sub_140DDFF20` (SHARED between 001 and 002)
- slot 79: `sub_140F3AC10` (SHARED)
- slot 84: `sub_140F3B000` (SHARED)
- slot 82: `sub_140DDFF70` (unique to BeamJavelin — extra setup)
- slot 89: `sub_140F3AB00` (001), `sub_140F3B040` (002) — DIFFERENT
- slot 91: `sub_140F3B150` (SHARED)

### ConfigureDamageInfo Chain
```
sub_140F3AC10 (BeamJavelin-specific):
  └── sub_140DDFFA0 (Throw base):
      └── sub_140DDCAF0 (EXVS2 common):
          type = 1 (projectile)
          flags = 1 (active)
          power |= 0x50 (adds flags 0x40 + 0x10)
          Hash 964487181 (0x397A280D) → if value==1: byte+144=1 (piercing?)
      flag+433 = 0 (disable secondary tracking)
  power+104 = 130
  power+152 = 1

Damage Profile: type=1, power_flags=0x50|130=0xD2, piercing conditional
```

### Behavior Pipeline (CCmdActionManager_ThrowMortar)
```
CCmdActionGroup_Series
  ├── CCmdAction_TerminateSeriesEnd (end marker)
  ├── [Optional rotation vector] (degrees→radians conversion)
  │   Uses hashes: velocity_x (0x4B382E24), velocity_y (0x3C3F1EB2), velocity_z (0xA5364F08)
  └── Main mortar throw motion (sub_1406A1610)
      Reads: params+432 (enable), params+100 (bone mode), params+433 (secondary)
```

### Slot 84: Hit Zone Configuration
```
Hit area type = 3 (large melee)
Hit offset = 15.0 units forward (simulates javelin reach/length)
```

### Key Difference: 001 vs 002
- slot 89 ONLY: animation motion hash sets differ
  - 001: `0x6A468A87` / `0xE5E4AC06` (standard throw animation)
  - 002: `0xD77C91C9` / `0xE7095E21` (G-Armor variant animation)
- **All other behavior is identical**

---

## 2. NapalmBomb (ナパーム・ボム)

**Archetype**: Detonator (timed explosion, NOT plain FreeFall)
**Base pattern**: Timed fuse → detonate → enable collision after delay

### VTable Overview
- slot 81: `sub_140F3AC40` (001), `sub_140F3B200` (002) — DIFFERENT
- slot 79: `sub_140E3DBF0` (SHARED)
- slot 74: `sub_140DE0050` (unique to NapalmBomb — extra collision hook?)
- slot 84: `sub_140DDCAC0` (shared generic)

### ConfigureDamageInfo Chain
```
sub_140E3DBF0 (NapalmBomb-specific):
  └── sub_140DE0070 (FreeFall variant):
      └── sub_140DDCAF0 (EXVS2 common):
          type = 1, flags = 1
          power |= 0x50
          Hash 964487181 → piercing check
      power+104 &= ~0x10 (CLEAR flag 0x10)
      power+148 = 1 (explosion type?)
  power+408 = 9 (sub-effect/explosion mode)
  power+108 = 1 (damage scale)
  flag+433 = 0

Damage Profile: type=1, power_flags=0x40 (0x50 with 0x10 cleared), explosion mode=9
```

### Behavior Pipeline (CCmdActionManager_Detonator)
```
Physics Body (0x80 bytes)
  ├── Flight Group (sub_14068DAF0):
  │   ├── Movement/Orientation Series (vtable[3]):
  │   │   ├── [Throw motion] with rotation vector (degrees→radians)
  │   │   └── CCmdAction_TerminateSeriesEnd
  │   │
  │   └── Detonation Timing Series:
  │       ├── CCmdAction_SetInteractEnableModeAll(0)  — disable collision
  │       ├── CCmdAction_WaitByFrame(fuse_timer)      — hash 0x4C55EA3D (1280698941)
  │       └── CCmdAction_SetInteractEnableModeAll(1)  — ENABLE collision (detonation!)
  │
  ├── CCmdAction_TerminateSeriesEnd (top-level)
  └── [Optional] CCmdAction_ShotBullet — hash 0x41435BE6 (sub-munition)
```

### Key Difference: 001 vs 002
- slot 81: Separate factories BUT create **identical** CCmdActionManager_Detonator
- **No functional difference** — RTTI split is for engine kill/assist attribution only

---

## 3. ThrowShield (シールド投げ)

**Archetype**: Throw (standard directed throw via Radicon→Throw chain)
**Base pattern**: Directed throw with secondary tracking, recoverable by owner

### VTable Overview
- slot 81: `sub_140F3AD10` (001), `sub_140F3B2D0` (002) — DIFFERENT
- slot 79: `sub_140E382A0` (SHARED)
- slot 86: `sub_140F3B320` (unique to ThrowShield)
- slot 91: `sub_140F3B350` (unique to ThrowShield)

### ConfigureDamageInfo Chain
```
sub_140E382A0 (ThrowShield-specific):
  └── sub_140DDCAF0 (EXVS2 common):
      type = 1, flags = 1
      power |= 0x50
      Hash 964487181 → piercing check
  flags+100 = 1 (active)
  flag+433 = 1 (ENABLE secondary tracking — differs from Javelin!)
  power+104 = 138 (different power than Javelin's 130)
  power+152 = 1

Damage Profile: type=1, power=138, secondary_tracking=ON
```

### Behavior Pipeline (CCmdActionManager_Throw via Shared Execute Template)
```
Shared Execute (sub_14068E280):
  ├── CCmdAction_Blank (anchor point)
  ├── CCmdActionGroup_Series (main action):
  │   ├── vtable[3] → Throw movement + rotation
  │   ├── Physics Body with CCmdAction_MoveTransStickingMatrix
  │   ├── CCmdAction_WaitForOrderedReleaseSticks
  │   └── CCmdAction_WaitByFrame or CCmdAction_TerminateStop
  ├── CCmdActionGroup_Series (release phase):
  │   ├── CCmdAction_ReleaseStick
  │   └── vtable[8] cleanup
  └── Damage flags: DOWN|STUN|HIT (0x8A), recovery to owner (offset+433=1)
```

### Key Difference: 001 vs 002
- slot 81: Different vftable only, **behavior pipeline is identical**
- ThrowShield has `offset+433 = 1` (shield return to owner) unlike BeamJavelin (`offset+433 = 0`)

---

## 4. HammerShot (ガンダムハンマー)

**Archetype**: CUSTOM (chain weapon — unique physics model)
**Base pattern**: Multi-phase chain weapon: extend → swing → retract

### HammerShot is UNIQUE — Most Complex Weapon

With **18 overrides**, HammerShot overrides nearly twice as many slots as other weapons:

| Override | Function | Purpose |
|----------|----------|---------|
| slot 0 | `sub_14092A700` | Custom destructor (chain physics cleanup) |
| slot 2 | `sub_140DE0460` | Custom OnInit (chain setup) |
| slot 11 | `sub_140DE0510` | Custom sub-update (chain physics tick) |
| slot 12 | `sub_140DE0B10` | Custom OnUpdate (chain rendering) |
| slot 18 | `sub_140DE00A0` | Custom component setup |
| slot 22 | Base (`sub_1406733C0`) | Uses base init (no extended init) |
| slot 23 | `sub_140DE0590` | Custom GetTypeFlags (chain type) |
| slot 72 | `sub_140F3ADE0` (001) | Custom OnHit (chain hit response) |
| slot 73 | `sub_140DE0B80` | Custom OnCollisionCheck (chain collision) |
| slot 76 | `sub_140DE04E0` | Custom behavior hook |
| slot 78 | `sub_14094DCE0` | Custom Factory (different object size) |
| slot 79 | `sub_140F3AFA0`/`sub_140F3B530` | Custom ConfigureDamageInfo |
| slot 81 | `sub_140F3AD60`/`sub_140F3B390` | Custom CreateCmdActionManager |
| slot 84 | `sub_140F3AE80`/`sub_140F3B410` | Custom config |

### ConfigureDamageInfo Chain (HammerShot)
```
sub_140F3AFA0 (001_HammerShot):
  └── sub_140DE0B90 (Hammer base):
      └── sub_140DE0A90 (Hammer inner base)
      byte+179 = 1 (chain flag)
      byte+464 = 0 (no return mode)
      power+408 = 4 (chain sub-type)
      power+324 = 1 (hit mode)
  flags+100 = 1
  power+436 = -94969270 (0xFA5739CA) — hash/magic for chain physics
  power+432 = -703311315 (0xD5FA7A2D) — hash/magic for chain physics
  power+484 = -94969270 (same as +436)
  power+480 = -703311315 (same as +432)
  byte+440 = 1 (enable chain mode)
  power+324 = 1

Damage Profile: type=chain(4), chain_physics_hash=0xFA5739CA/0xD5FA7A2D
```

### Why HammerShot is Special

The Gundam Hammer is a **chain/anchor weapon** (鉄球付き鎖) branching from Radicon (NOT Throw):

1. **Object size**: **0x3540** (16 bytes larger than standard 0x3530) — extra space for collision tracking state
2. **Factory**: Sets `anchor_mode = 1` and `chain_reach = 5.0f`
3. **OnInit** (sub_140DE0460): Hides hammer head mesh + syncs with parent's anchor system
4. **OnUpdate** (sub_140DE0B10): **SIMD chain arc dynamics** — computes chain curvature each frame
5. **OnCollisionCheck** (sub_140DE0B80): **Anchor-state-gated** — only hits during active swing
6. **Auto-retraction**: 1-second timeout → automatic recall if no hit
7. **Slot 84**: Reads 3D chain connection point offset (X/Y/Z joint position)

### Behavior Pipeline (Custom — NOT using any standard manager template)
```
Chain Physics System:
  ├── Anchor extend phase (params+464 controls mode)
  ├── SIMD arc calculation per frame (slot 12)
  │   Chain curvature + gravity + centripetal force
  ├── Collision: only active during swing arc (slot 73 gate)
  ├── On hit: trigger retraction immediately (slot 72)
  └── Timeout: 1 second → auto-retract (slot 12 timer)
```

### Key Difference: 001 vs 002
- **Hit effect hashes ONLY**: Gundam Hammer vs Hyper Hammer visual effects
- All physics, collision, and chain behavior is identical

---

## Comparative Summary

| Property | BeamJavelin | NapalmBomb | ThrowShield | HammerShot |
|----------|-------------|------------|-------------|------------|
| **Archetype** | ThrowMortar | Detonator | Throw (via Radicon) | Custom Anchor/Chain |
| **Motion** | Mortar arc + rotation | Timed fuse flight | Directed + return tracking | SIMD chain arc swing |
| **Damage Type** | 1 (projectile) | 1 (projectile) | 1 (projectile) | Chain (4) |
| **Power Value** | 130 | (from hash) | 138 | (from chain config) |
| **Secondary Tracking** | OFF | N/A | ON | N/A |
| **Explosion Mode** | None | 9 (napalm) | None | None |
| **Has Piercing** | Conditional (hash) | Conditional (hash) | Conditional (hash) | No |
| **Shared Hash** | 964487181 | 964487181 | 964487181 | N/A |
| **001 vs 002 CmdMgr** | SAME | Different | Different | Different |
| **Unique Overrides** | slot 82,89,91 | slot 74 | slot 86,91 | 18 slots! |
| **Object Size** | Standard (0x3530) | Standard (0x3530) | Standard (0x3530) | **0x3540** (+16 bytes) |

### Common Hash: 964487181 (0x397A280D)
Used by BeamJavelin, NapalmBomb, and ThrowShield in ConfigureDamageInfo.
**Purpose**: Check if value == 1 → enable piercing flag (byte+144=1).
This appears to be a BulletParam-level "piercing_enabled" flag.

### New Hash Discovery
| Hash | Hex | Name | Used By |
|------|-----|------|---------|
| 964487181 | 0x397A280D | `piercing_enabled` | Javelin, Napalm, Shield |
| -94969270 | 0xFA5739CA | `chain_physics_A` | HammerShot |
| -703311315 | 0xD5FA7A2D | `chain_physics_B` | HammerShot |
