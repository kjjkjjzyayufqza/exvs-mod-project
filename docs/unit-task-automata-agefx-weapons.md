# 033GNDAGE_004GAGEFX (Gundam AGE-FX) Complete Weapons Analysis

## Overview

Gundam AGE-FX has **23 UnitTaskAutomata classes** — the most complex unit analyzed so far.
17 are concrete (instantiable), 6 are abstract base classes (no `??_7` vtable).

**Weapon Family Count**: 7 distinct weapon families, 14 unique CCmdActionManager types.

### Inheritance Hierarchy

```
CUnitTaskAutomataAbstract@GAM@VDK (0x1413446a0, 93 slots)
  └── [EXVS2 Intermediate Framework] (+7 framework slots = 100 total)
        │
        ├── FunnelFlyswordAbstract (ABSTRACT — no ??_7)
        │     ├── FunnelFlyswordNormal      (0x1414749C0)  25 overrides
        │     ├── FunnelFlyswordHasei       (0x141474CE8)  25 overrides
        │     └── FunnelFlyswordBurst       (0x141477CD8)  25 overrides
        │
        ├── FunnelFlySwordThrowAbstract (ABSTRACT — no ??_7)
        │     ├── FunnelFlySWordThrowFxBurst    (0x141475010)  25 overrides
        │     └── FunnelFlySWordThrowHissatsu   (0x141475340)  25 overrides
        │
        ├── StickerFunnelAbstract (ABSTRACT — no ??_7)
        │     ├── StickerFunnelHissatsu     (0x141475670)  20 overrides
        │     └── StickerFunnelWinLose      (0x1414759A8)  20 overrides
        │
        ├── FunnelAttachChangeWeaponAbstract (ABSTRACT — no ??_7)
        │     ├── FunnelAttachChangeWeaponDefenseformMayu  (0x141475CE0)  20 overrides
        │     ├── FunnelAttachChangeWeaponDefenseformGurd  (0x141476010)  20 overrides
        │     └── FunnelAttachChangeAutomata               (0x141476340)  18 overrides
        │
        ├── TransparentSlasherAbstract (ABSTRACT — no ??_7)
        │     ├── TransparentSlasher01      (0x141476668)  26 overrides
        │     └── TransparentSlasher04      (0x1414769A0)  26 overrides
        │
        ├── FunnelCommonDefense (no UnitTask ??_7 — CmdMgr only)
        │     ├── FunnelSelfDefense         (0x141476CD8)  21 overrides
        │     └── FunnelMateDefense         (0x141477018)  21 overrides
        │
        ├── SpAssistAge1                    (0x141477358)  27 overrides
        ├── SpPlasmaDiverMissile            (0x141477688)  22 overrides
        └── ThrowDarkhoundMA                (0x1414779B0)  22 overrides
```

---

## All 23 VTable Addresses & Override Counts

### Concrete Classes (17)

| # | Class | VTable Address | Overrides | Override Slots |
|---|-------|---------------|-----------|----------------|
| 1 | FunnelFlyswordNormal | `0x1414749C0` | **25** | 0,2,3,12,21,23,28,43,52,54,55,69,70,71,73,76,77,78,79,80,81,84,87,88,91 |
| 2 | FunnelFlyswordHasei | `0x141474CE8` | **25** | 0,2,3,12,21,23,28,43,52,54,55,69,70,71,73,76,77,78,79,80,81,84,87,88,91 |
| 3 | FunnelFlySWordThrowFxBurst | `0x141475010` | **25** | 0,2,3,12,21,23,28,43,52,54,55,69,70,71,73,76,77,78,79,80,81,84,87,88,91 |
| 4 | FunnelFlySWordThrowHissatsu | `0x141475340` | **25** | 0,2,3,12,21,23,28,43,52,54,55,69,70,71,73,76,77,78,79,80,81,84,87,88,91 |
| 5 | StickerFunnelHissatsu | `0x141475670` | **20** | 0,2,3,12,21,23,28,54,55,70,71,73,77,78,79,80,81,84,88,91 |
| 6 | StickerFunnelWinLose | `0x1414759A8` | **20** | 0,2,3,12,21,23,28,54,55,70,71,73,77,78,79,80,81,84,88,91 |
| 7 | FunnelAttachChangeWeaponDefenseformMayu | `0x141475CE0` | **20** | 0,2,3,12,21,23,28,54,55,70,71,73,77,78,79,80,81,84,88,91 |
| 8 | FunnelAttachChangeWeaponDefenseformGurd | `0x141476010` | **20** | 0,2,3,12,21,23,28,54,55,70,71,73,77,78,79,80,81,84,88,91 |
| 9 | FunnelAttachChangeAutomata | `0x141476340` | **18** | 0,2,3,12,21,23,28,54,55,70,71,73,77,78,79,80,81,84 |
| 10 | TransparentSlasher01 | `0x141476668` | **26** | 0,2,3,12,18,21,23,28,30,42,46,54,55,70,71,72,73,77,78,79,80,81,84,87,88,90 |
| 11 | TransparentSlasher04 | `0x1414769A0` | **26** | 0,2,3,12,18,21,23,28,30,42,46,54,55,70,71,72,73,77,78,79,80,81,84,87,88,90 |
| 12 | FunnelSelfDefense | `0x141476CD8` | **21** | 0,2,3,12,21,23,28,43,54,55,70,71,73,77,78,79,80,81,84,88,91 |
| 13 | FunnelMateDefense | `0x141477018` | **21** | 0,2,3,12,21,23,28,43,54,55,70,71,73,77,78,79,80,81,84,88,91 |
| 14 | SpAssistAge1 | `0x141477358` | **27** | 0,2,3,12,18,21,23,28,30,42,46,54,55,69,70,71,72,73,77,78,79,80,81,84,87,88,90 |
| 15 | SpPlasmaDiverMissile | `0x141477688` | **22** | 0,2,3,12,21,22,23,28,54,55,70,71,73,76,77,78,79,80,81,84,87,88 |
| 16 | ThrowDarkhoundMA | `0x1414779B0` | **22** | 0,2,3,12,21,22,23,28,54,55,70,71,73,76,77,78,79,80,81,84,87,88 |
| 17 | FunnelFlyswordBurst | `0x141477CD8` | **25** | 0,2,3,12,21,23,28,43,52,54,55,69,70,71,73,76,77,78,79,80,81,84,87,88,91 |

### Abstract Classes (6 — no ??_7 vtable)

| # | Class | RTTI Name Addr | CCmdActionManager VTable |
|---|-------|---------------|-------------------------|
| 18 | FunnelFlyswordAbstract | `0x1420815E0` | `0x1415DE3E0` |
| 19 | FunnelFlySWordThrowAbstract | `0x142081700` | `0x1415DE570` |
| 20 | StickerFunnelAbstract | `0x142081850` | `0x1415DE818` |
| 21 | FunnelAttachChangeWeaponAbstract | `0x142081970` | — |
| 22 | TransparentSlasherAbstract | `0x142081B30` | — |
| 23 | FunnelCommonDefense | `0x142081C60` | `0x1415DECB8` |

---

## Weapon Classification — VDK Archetype Mapping

### OnUpdate (Slot 12) Grouping

**16 of 17** classes share the same OnUpdate: `sub_1406A5B30`
Only **SpAssistAge1** has its own: `sub_140DE1770`

### CCmdActionManager Execute Archetype Groups

| Execute Function | Archetype | Classes Using It |
|-----------------|-----------|-----------------|
| `sub_140FFD600` | **FunnelFlysword** (Defense+Homing composite) | FunnelFlyswordAbstract, FunnelFlySWordThrowAbstract, FunnelFlySWordThrowFxBurst, FunnelFlyswordBurst |
| `sub_140DFB7D0` | **FunnelDefense** (multi-phase defense pipeline) | FunnelSelfDefense, FunnelMateDefense |
| `sub_140DEFA00` | **SummonFormation** (summon + defense formation) | TransparentSlasher01, TransparentSlasher04, SpAssistAge1 |
| `sub_140DEBEB0` | **StickerFunnel** (attach-on-hit sticker) | StickerFunnelAbstract (base for WinLose) |
| `sub_140E47A10` | **StickerFunnelHissatsu** (enhanced sticker) | StickerFunnelHissatsu |
| `sub_140DF6340` | **FunnelAttachChange** (weapon form change + motion) | FunnelAttachChangeWeaponDefenseformMayu |
| `sub_140E48540` | **FunnelCommonDefense** (rotate + orbit bone) | FunnelCommonDefense |
| `sub_140DEA280` | **Throw** (standard directed throw) | ThrowDarkhoundMA |

### Key Architectural Discovery: FunnelFlysword = Defense + Homing Composite

```
sub_140FFD600 (FunnelFlysword Execute):
  1. CALL sub_140DFB7D0 (Defense Execute)  ← inherits full defense pipeline
  2. CALL sub_14068E160 (StandardHomingMoveSet) ← adds homing flight on top
```

This reveals that AGE-FX's C-Funnels are **dual-purpose weapons**: they inherit the
entire defense behavior pipeline (collision resolve, target kill tracking, series control)
AND add homing attack flight. This is consistent with the anime — AGE-FX's C-Funnels
can both attack enemies and form defensive barriers.

---

## Slot Function Sharing Analysis

### Slot 81 (CreateCmdActionManager) — 16 Unique Functions

| Function | CmdMgr Size | Classes |
|----------|------------|---------|
| `sub_140E00720` | 0x110 | FunnelFlyswordNormal, FunnelFlyswordHasei |
| `sub_140E00A60` | — | FunnelFlySWordThrowHissatsu |
| `sub_140E00BB0` | — | FunnelFlySWordThrowFxBurst |
| `sub_140E00C20` | — | StickerFunnelWinLose |
| `sub_140E00D40` | 0x110 | StickerFunnelHissatsu |
| `sub_140E01010` | — | FunnelAttachChangeWeaponDefenseformMayu |
| `sub_140DE3690` | — | FunnelAttachChangeWeaponDefenseformGurd |
| `sub_140DE3980` | — | FunnelAttachChangeAutomata |
| `sub_140E01A60` | 0x120 | TransparentSlasher01 |
| `sub_140E01B90` | — | TransparentSlasher04 |
| `sub_140E01E20` | 0x120 | FunnelSelfDefense |
| `sub_140E01EA0` | — | FunnelMateDefense |
| `sub_140E01F40` | — | SpAssistAge1 |
| `sub_140DDC8E0` | — | SpPlasmaDiverMissile |
| `sub_140E02210` | — | ThrowDarkhoundMA |
| `sub_140E02320` | — | FunnelFlyswordBurst |

### Slot 79 (ConfigureDamageInfo) — 13 Unique Functions

| Function | Classes |
|----------|---------|
| `sub_140E009C0` | FunnelFlyswordNormal |
| `sub_140E00A30` | FunnelFlyswordHasei |
| `sub_140E00C10` → `sub_140E00B60` | FunnelFlySWordThrowFxBurst, FunnelFlySWordThrowHissatsu |
| `sub_140E00DA0` → `sub_140E00D10` | StickerFunnelHissatsu, StickerFunnelWinLose |
| `sub_140E01230` | FunnelAttachChangeWeaponDefenseformMayu |
| `sub_140E01660` | FunnelAttachChangeWeaponDefenseformGurd |
| `sub_140E01760` | FunnelAttachChangeAutomata |
| `sub_140E01D20` → `sub_140E019E0` | TransparentSlasher01, TransparentSlasher04 |
| `sub_140E01F10` | FunnelSelfDefense, FunnelMateDefense |
| `sub_140E02070` | SpAssistAge1 |
| `sub_140E02180` | SpPlasmaDiverMissile |
| `sub_140E022F0` | ThrowDarkhoundMA |
| `sub_140E02420` | FunnelFlyswordBurst |

---

## ConfigureDamageInfo Decompiled Summary

### Damage Configuration Chain Architecture

All ConfigureDamageInfo functions follow a chain pattern:

```
Leaf class ConfigDmg
  → Family base ConfigDmg
    → EXVS2 common ConfigDmg (sub_140DDCAF0 or sub_140DE14B0 or sub_140DDD2B0)
```

### Common Base Functions

**sub_140DDCAF0** — Standard EXVS2 projectile base:
```c
type = 1 (projectile)
active = 1 (byte+100)
power_flags |= 0x50 (adds DOWN + HIT flags)
Hash 964487181 (0x397A280D) → if value==1: piercing = true (byte+144)
```

**sub_140DE14B0** — FunnelFlysword/Defense base:
```c
type = 1, disabled = false (byte+115)
active = 1 (byte+100)
power_flags = 128 (0x80) — funnel projectile flag
power+108 = 1, power+120 = 1
word+4 = 256
sub_effect = 4 (offset+408)
Hash -305020664 (0xEDCF1D08) → hit_effect_id (offset+452)
Hash -752010771 (0xD32FF96D) → hit_effect_param (offset+456)
```

**sub_140DDD2B0** — StickerFunnel base:
```c
type = 1, power_flags = 0, power+152 = 0
byte+419 = 1 (sticker mode)
```

### Per-Class ConfigureDamageInfo Details

| Class | Chain | Key Fields |
|-------|-------|-----------|
| **FunnelFlyswordNormal** | DE14B0→DE1570→DE1930→E00830→**E009C0** | sub_effect=10, hash=0xD60D83C5(offset+444), active=1, burst=1(+496,+532), keepAlive=1(+439) |
| **FunnelFlyswordHasei** | same chain→**E00A30** | sub_effect=**13**, same hash, same flags |
| **FunnelFlySWordThrow** | DE1930→**E00B60** | simplified: active=1, sub_effect=10, hash=0xD60D83C5 |
| **StickerFunnelHissatsu/WinLose** | DDD2B0→**E00D10** | sticker_mode=1(+113), active=1, collisionGroup=0(+432), sub_effect=9(+408) |
| **FunnelAttachMayu** | DE37D0→E00EB0→**E01230** | active=1, detect=1(+564), sub_effect=9, collision_hash=0x50436EF6(+568), collisionGroup=6(+432) |
| **FunnelAttachGurd** | same chain→**E01660** | same as Mayu but byte+513=0 (guard form flag) |
| **FunnelAttachAutomata** | DE3A50→**E01760** | sub_effect=13, complex hash-based weapon-type switch, defense hash=0x50436EF6(+484), paramRead×3 |
| **TransparentSlasher01/04** | DE3170→**E019E0** | type=2 (melee!), scale=1.0f(+96), hash 0x41F53E41→rotation(+472), sub_effect=13 |
| **FunnelSelfDefense/MateDefense** | DE32C0→E01DF0→**E01F10** | active=1, sub_effect=11, defense=1(+436), collision_hash=0x50436EF6(+448) |
| **SpAssistAge1** | DE1460→**E02070** | type=2 (melee!), active=0, scale=1.0f(+96), hash×3(0x41F53E41, 0x36F95ED7, 0xA8AF2774)→offsets+436,+456,+724 |
| **SpPlasmaDiverMissile** | DDCAF0→**E02180** | standard EXVS2 base, active=1, power=70(+108) |
| **ThrowDarkhoundMA** | DDCAF0→**E022F0** | standard EXVS2 base, power_flags=0(+104), no_tracking(+433=0), no_pierce(+144=0), special=1(+5) |
| **FunnelFlyswordBurst** | DE1930→**E02420** | identical to FunnelFlysword chain but with active=1, sub_effect=10, hash=0xD60D83C5 |

---

## Decompiled Behavior Pipelines

### 1. FunnelFlysword Family (Normal/Hasei/Burst + Throw variants)

**Execute: sub_140FFD600** — Composite: Defense + Homing

```
FunnelFlysword Execute:
  ├── Phase 1: CALL Defense Execute (sub_140DFB7D0)
  │     └── Full defense pipeline (see Defense section below)
  │
  └── Phase 2: CALL StandardHomingMoveSet (sub_14068E160)
        └── Homing flight toward target with tracking
```

**Defense Pipeline (sub_140DFB7D0) — Shared by all FunnelFlysword & Defense classes:**

```
CCmdActionGroup_Series (main action group):
  ├── CCmdAction_SetCollisionResolveType(0)     — disable collision initially
  ├── [vtable+24] custom init hook
  │
  ├── [IF params+439]: CCmdAction_WaitForTargetKilled + CCmdAction_Return
  │     └── Conditional: wait for target to die before continuing
  │
  ├── CCmdAction_SetCollisionResolveType(params+120) — set collision mode from params
  │
  ├── [IF hash -731733189 (0xD47EF2BB) returns non-zero]:
  │     └── CCmdAction_WaitByFrame(N)            — delay before next phase
  │
  ├── [vtable+32] custom phase hook
  │
  └── Add to action manager

CCmdActionGroup_Series (secondary group):
  ├── [vtable+40] custom action hook
  ├── [vtable+48] custom action hook
  └── Add to action manager

[IF params+440 enabled]:
  CCmdActionGroup_Series (physics group):
    ├── Physics Body (0x80 bytes via sub_14068DAF0)
    ├── [vtable+128] custom physics hook
    ├── CCmdAction_Return
    ├── CCmdAction_Jump(back to secondary group)
    ├── [vtable+136] post-physics hook
    └── Add to action manager

CCmdAction_Return (end marker)

[vtable+96] → CCmdAction via virtual call

CCmdActionGroup_Series (cleanup group):
  ├── [vtable+64] custom cleanup hook
  ├── Physics Body (another 0x80 bytes)
  ├── [vtable+72] physics config hook
  ├── [vtable+80] final cleanup hook
  │
  ├── [IF hash -1553624147 (0xA38A1E2D) returns non-zero]:
  │     └── CCmdAction_PlaySE_OnParentVisible(N) — play sound effect
  │
  └── Add to action manager

[IF params+436 enabled]:
  ├── CCmdAction_TerminateSeriesEnd
  ├── CCmdAction_Blank (anchor point)
  │
  ├── [IF params+437]: [vtable+96] extra action
  └── [vtable+88] final action
```

### 2. StickerFunnel Family

**Execute: sub_140DEBEB0** (StickerFunnelAbstract)

```
StickerFunnel Execute:
  ├── [IF vtable[100](this) < 0]:     ← negative param = attach mode
  │     └── CCmdAction_CauseStick(param)  — stick to target on contact
  │
  ├── StandardHomingMoveSet (sub_14068E160)
  │     └── Homing flight toward target
  │
  ├── CCmdAction_Blank (separator)
  └── Store blank as anchor point
```

**Execute: sub_140E47A10** (StickerFunnelHissatsu — extends base)

```
StickerFunnelHissatsu Execute:
  ├── CALL StickerFunnelAbstract Execute (sub_140DEBEB0)
  │     └── All of the above sticker behavior
  │
  └── Extra: CCmdAction at (xmmword_141602890)
        ├── mode = 3 (special hissatsu mode)
        └── 16-byte SIMD position offset data
```

### 3. TransparentSlasher / SpAssistAge1 (SummonFormation)

**Execute: sub_140DEFA00**

```
SummonFormation Execute:
  ├── sub_14068D4F0 → get parent entity reference
  ├── sub_140DEFB20(this, keys, parent) — init formation
  ├── [vtable+32](this, keys, parent) — custom formation hook
  ├── sub_140DF0970(this, keys, parent) — configure formation
  ├── [vtable+48](this, keys, parent) — custom phase hook
  ├── CCmdAction_Blank → add to action manager
  ├── [vtable+56](this, keys, parent) — custom finalize hook
  │
  └── [IF params+532 enabled]:
        └── sub_140DF0DC0(this, keys, parent) — extended formation mode
```

### 4. FunnelCommonDefense (Rotate + Orbit)

**Execute: sub_140E48540**

```
FunnelCommonDefense Execute:
  ├── sub_1411A99F0() — defense system init
  │
  ├── CCmdAction_RotateOffsetBone:
  │     ├── mode = 1, submode = 1
  │     ├── rotation_count = 3
  │     ├── Hash 346751088 (0x14A93870) → rotation_X (degrees → radians)
  │     ├── Hash -1918742070 (0x8D8099CA) → rotation_Y (degrees → radians)
  │     ├── Hash -89824932 (0xFAA9265C) → rotation_Z (degrees → radians)
  │     └── rotation_vector = pack(Z, X, Y, 0) as SIMD float4
  │
  └── Add to action manager
```

### 5. FunnelAttachChangeWeapon (Form Change + Motion)

**Execute: sub_140DF6340** (FunnelAttachChangeWeaponDefenseformMayu)

```
FunnelAttachChange Execute:
  ├── sub_140DF57B0() — weapon change system init
  ├── [vtable+64](this, keys, parent) — form-specific configuration
  └── StandardHomingMoveSet (sub_14068E160) — homing flight
```

### 6. ThrowDarkhoundMA (Standard Throw)

**Execute: sub_140DEA280** — Simple delegation

```
ThrowDarkhoundMA Execute:
  └── CALL [vtable+24](this, keys, parent) — delegate to Throw base behavior
      └── Standard directed throw with rotation
```

---

## CCmdActionManager VTable Addresses

| Class | Primary VTable | Secondary VTable (_0) |
|-------|---------------|----------------------|
| FunnelFlyswordAbstract | `0x1415DE3E0` | `0x1415DE4B0` |
| FunnelFlySWordThrowAbstract | `0x1415DE570` | `0x1415DE640` |
| FunnelFlySWordThrowFxBurst | `0x1415DE6C0` | `0x1415DE790` |
| StickerFunnelAbstract | `0x1415DE818` | `0x1415DE838` |
| StickerFunnelHissatsu | `0x1415DE8B8` | `0x1415DE8D8` |
| FunnelAttachChangeWeaponDefenseformMayu | `0x1415DE960` | `0x1415DE9C0` |
| TransparentSlasher01 | `0x1415DEA58` | `0x1415DEAF0` |
| TransparentSlasher04 | `0x1415DEB98` | `0x1415DEC30` |
| FunnelCommonDefense | `0x1415DECB8` | — |
| FunnelSelfDefense | `0x1415DECF8` | `0x1415DEDE8` |
| FunnelMateDefense | `0x1415DEE68` | `0x1415DEF58` |
| SpAssistAge1 | `0x1415DEFD8` | `0x1415DF060` |
| ThrowDarkhoundMA | `0x1415DF120` | `0x1415DF158` |
| FunnelFlyswordBurst | `0x1415DF1E0` | `0x1415DF2B0` |

---

## Weapon Family Groupings

### Family 1: FunnelFlysword (C-Funnel Sword Bits)

**Game meaning**: AGE-FX's C-Funnels in beam sword mode — dual-purpose attack/defense.

| Class | Role | slot 79 | slot 81 | Unique Feature |
|-------|------|---------|---------|----------------|
| FunnelFlyswordNormal | Standard C-Funnel attack | `sub_140E009C0` | `sub_140E00720` (shared) | sub_effect=10 |
| FunnelFlyswordHasei | Enhanced C-Funnel (charge shot?) | `sub_140E00A30` | `sub_140E00720` (shared) | sub_effect=**13** |
| FunnelFlyswordBurst | Burst C-Funnel (all-out attack) | `sub_140E02420` | `sub_140E02320` | sub_effect=10, active=1 |

**Shared CmdMgr**: Normal and Hasei share `sub_140E00720` — identical movement, only damage differs.

### Family 2: FunnelFlySWordThrow (C-Funnel Thrown Mode)

**Game meaning**: C-Funnels thrown at the enemy (projectile mode, not attached).

| Class | Role | slot 79 | slot 81 |
|-------|------|---------|---------|
| FunnelFlySWordThrowFxBurst | Burst throw mode | `sub_140E00C10` (shared) | `sub_140E00BB0` |
| FunnelFlySWordThrowHissatsu | Special attack throw | `sub_140E00C10` (shared) | `sub_140E00A60` |

**Shared ConfigDamageInfo**: Both throw types share identical damage configuration.

### Family 3: StickerFunnel (Attach-to-Target Funnels)

**Game meaning**: Funnels that attach to the enemy on contact (lock-on attack).

| Class | Role | slot 79 | slot 81 |
|-------|------|---------|---------|
| StickerFunnelHissatsu | Special attack sticker | `sub_140E00DA0` (shared) | `sub_140E00D40` |
| StickerFunnelWinLose | Win/Lose condition sticker | `sub_140E00DA0` (shared) | `sub_140E00C20` |

### Family 4: FunnelAttachChangeWeapon (Defense Form Change)

**Game meaning**: C-Funnels that change form to create defensive barriers.

| Class | Role | slot 79 | slot 81 |
|-------|------|---------|---------|
| FunnelAttachChangeWeaponDefenseformMayu | Mayu defense form | `sub_140E01230` | `sub_140E01010` |
| FunnelAttachChangeWeaponDefenseformGurd | Guard defense form | `sub_140E01660` | `sub_140DE3690` |
| FunnelAttachChangeAutomata | Autonomous mode change | `sub_140E01760` | `sub_140DE3980` |

### Family 5: TransparentSlasher (Invisible Melee Strikes)

**Game meaning**: Melee-type attacks (type=2) with position-based rotation — likely the invisible slashing funnels.

| Class | Role | slot 79 | slot 81 |
|-------|------|---------|---------|
| TransparentSlasher01 | Slash pattern 1 | `sub_140E01D20` (shared) | `sub_140E01A60` |
| TransparentSlasher04 | Slash pattern 4 | `sub_140E01D20` (shared) | `sub_140E01B90` |

**Key**: These are **melee-type (type=2)**, unlike all other funnels which are projectile-type (type=1).

### Family 6: FunnelDefense (Protective Formation)

**Game meaning**: C-Funnels forming a protective shield around self or partner.

| Class | Role | slot 79 | slot 81 | Special |
|-------|------|---------|---------|---------|
| FunnelSelfDefense | Self-protection | `sub_140E01F10` (shared) | `sub_140E01E20` | FunnelCommonDefense vtable at CmdMgr[34] |
| FunnelMateDefense | Partner-protection | `sub_140E01F10` (shared) | `sub_140E01EA0` | FunnelCommonDefense vtable at CmdMgr[34] |

**Architecture**: Both create a compound CmdMgr object with `FunnelCommonDefense` vtable embedded at offset [34], enabling shared rotation/orbit behavior.

### Family 7: Standalone Weapons

| Class | Archetype | slot 79 | slot 81 | Description |
|-------|-----------|---------|---------|-------------|
| SpAssistAge1 | SummonFormation | `sub_140E02070` | `sub_140E01F40` | Summon AGE-1 assist (melee type=2) |
| SpPlasmaDiverMissile | Standard (EXVS2 common) | `sub_140E02180` | `sub_140DDC8E0` | Plasma Diver missiles (power=70) |
| ThrowDarkhoundMA | Throw | `sub_140E022F0` | `sub_140E02210` | Throw Darkhound MA (special+5=1) |

---

## hitEffectHash → UnitTask Mapping Table

Pattern: `33004XXYY` = series 033 (GNDAGE), unit 004 (GAGEFX), XX=01 (variant), YY=weapon index.

| hitEffectHash | Decimal | Likely UnitTask Class | Evidence |
|--------------|---------|----------------------|----------|
| **330040101** | — | FunnelFlyswordNormal | moveType 2,3 = projectile flight |
| **330040102** | — | FunnelAttachChangeAutomata | moveType 6 = attach change mode |
| **330040103** | — | FunnelFlySWordThrowAbstract | moveType 7 = thrown sword mode |
| **330040104** | — | TransparentSlasher01/04 | moveType 255 + negative angle = melee slash |
| **330040105** | — | FunnelCommonDefense | moveType 255 = defense formation |
| **330040106** | — | FunnelFlyswordAbstract (shared) | moveType 255, very common = base funnel |
| **330040107** | — | StickerFunnelAbstract (WinLose) | moveType 4 = sticker mode |
| **330040108** | — | StickerFunnelHissatsu | moveType 4 = sticker special |
| **330040109** | — | FunnelSelfDefense / FunnelMateDefense | moveType 6 = defense formation |
| **330040110** | — | FunnelAttachChangeWeaponDefenseformMayu/Gurd | weapon form change |
| **330040111** | — | FunnelAttachChangeAutomata (unique effect) | unique |
| **330040112** | — | FunnelFlyswordNormal (variant) | moveType 5, very common |
| **330040113** | — | FunnelFlyswordHasei (variant) | moveType 5, very common |
| **330040114** | — | SpPlasmaDiverMissile | moveType 0 = standard missile |
| **330040115** | — | SpAssistAge1 (unique effect) | unique |
| **330040116** | — | ThrowDarkhoundMA | moveType 1 = throw projectile |
| **330040117** | — | FunnelFlySWordThrowFxBurst | moveType 7 = burst throw |
| **1** | — | (generic hit) | shared generic effect |
| **60** | — | (generic beam) | shared generic effect |
| **100** | — | (generic explosion) | shared generic effect |
| **101** | — | (generic impact) | shared generic effect |

---

## Hash Parameter Reference

### ConfigureDamageInfo Hashes

| Hash (signed) | Hash (hex) | Name (deduced) | Used By |
|---------------|-----------|----------------|---------|
| 964487181 | `0x397A280D` | `piercing_enabled` | DDCAF0 (standard EXVS2 base) |
| -305020664 | `0xEDCF1D08` | `hit_effect_id` | DE14B0, E00830, E00EB0, E02070 |
| -752010771 | `0xD32FF96D` | `hit_effect_param` | DE14B0, E00830, E00EB0, E02070 |
| -701637291 | `0xD60D83C5` | `funnel_attack_hash` | FunnelFlysword family (offset+444) |
| 1346647798 | `0x50436EF6` | `defense_collision_hash` | Defense/Attach families (offset+448/+568) |
| 1107022401 | `0x41F53E41` | `rotation_param` | TransparentSlasher, SpAssistAge1 |
| 922542807 | `0x36F95ED7` | `assist_param_A` | SpAssistAge1 |
| -1466402956 | `0xA8AF2774` | `assist_param_B` | SpAssistAge1 |

### Behavior Pipeline Hashes

| Hash (signed) | Hash (hex) | Name (deduced) | Used In |
|---------------|-----------|----------------|---------|
| -731733189 | `0xD47EF2BB` | `delay_frames` | Defense Execute (sub_140DFB7D0) |
| -1553624147 | `0xA38A1E2D` | `sound_effect_id` | Defense Execute (PlaySE) |
| 346751088 | `0x14A93870` | `defense_rotation_X` | FunnelCommonDefense Execute |
| -1918742070 | `0x8D8099CA` | `defense_rotation_Y` | FunnelCommonDefense Execute |
| -89824932 | `0xFAA9265C` | `defense_rotation_Z` | FunnelCommonDefense Execute |

---

## Damage Type Classification

| Type Value | Meaning | Classes Using |
|-----------|---------|---------------|
| **1** (projectile) | Ranged projectile hit | FunnelFlysword family, StickerFunnel, FunnelAttach, Defense, SpPlasmaDiver, ThrowDarkhound |
| **2** (melee) | Melee strike hit | TransparentSlasher01/04, SpAssistAge1 |

### Power Flag Analysis

| Flag Value | Hex | Meaning | Used By |
|-----------|-----|---------|---------|
| 0x50 | DOWN+HIT | Standard projectile knockdown | DDCAF0 (standard base) |
| 0x80 | FUNNEL | Funnel-type projectile | DE14B0 (funnel base) |
| 0 | NONE | No special flags | StickerFunnel, ThrowDarkhound |

---

## Complexity Comparison

| Class | Override Count | CmdMgr Size | Damage Type | Archetype |
|-------|---------------|------------|-------------|-----------|
| SpAssistAge1 | **27** (highest) | 0x120 | Melee (2) | SummonFormation |
| TransparentSlasher01/04 | **26** | 0x120 | Melee (2) | SummonFormation |
| FunnelFlyswordNormal/Hasei/Burst | **25** | 0x110 | Projectile (1) | FunnelFlysword |
| FunnelFlySWordThrowFx/Hissatsu | **25** | 0x110 | Projectile (1) | FunnelFlysword |
| SpPlasmaDiverMissile | **22** | — | Projectile (1) | Standard EXVS2 |
| ThrowDarkhoundMA | **22** | — | Projectile (1) | Throw |
| FunnelSelfDefense/MateDefense | **21** | 0x120 | Projectile (1) | FunnelDefense |
| StickerFunnelHissatsu/WinLose | **20** | 0x110 | Projectile (1) | StickerFunnel |
| FunnelAttachMayu/Gurd | **20** | — | Projectile (1) | FunnelAttachChange |
| FunnelAttachChangeAutomata | **18** (lowest) | — | Projectile (1) | FunnelAttachChange |

---

## CCmdAction Types Discovered in AGE-FX

| CCmdAction | VTable Symbol | Purpose |
|-----------|--------------|---------|
| `CCmdAction_SetCollisionResolveType` | VDK | Set/change collision resolve mode |
| `CCmdAction_WaitForTargetKilled` | VDK | Wait until target entity dies |
| `CCmdAction_Return` | VDK | Return to caller/previous phase |
| `CCmdAction_Jump` | VDK | Jump to another action group |
| `CCmdAction_PlaySE_OnParentVisible` | VDK | Play sound effect when parent is visible |
| `CCmdAction_TerminateSeriesEnd` | VDK | Mark end of action series |
| `CCmdAction_Blank` | VDK | No-op separator/anchor point |
| `CCmdAction_CauseStick` | VDK | Attach to target entity (sticker) |
| `CCmdAction_RotateOffsetBone` | VDK | Rotate around offset bone (orbit/defense) |
| `CCmdActionGroup_Series` | VDK | Sequential action container |

---

## Key Architectural Insights

### 1. FunnelFlysword = Defense + Attack Composite
The most important discovery: `sub_140FFD600` (FunnelFlysword Execute) calls the Defense
Execute first, then adds homing flight. This means C-Funnels inherit the full defense
pipeline infrastructure (collision resolve, target tracking, phase control) AND overlay
attack behavior on top. This is a Strategy Pattern composition, not inheritance.

### 2. CmdMgr Object Embedding (Defense Family)
FunnelSelfDefense and FunnelMateDefense create CmdMgr objects with FunnelCommonDefense
vtable embedded at offset [34]. This is a form of object composition where the defense
rotation behavior is delegated to the embedded sub-object.

### 3. Melee vs Projectile Split
TransparentSlasher and SpAssistAge1 are the only melee-type (type=2) classes among the
23. All other weapons are projectile-type (type=1). The melee types also have the highest
override counts (26-27), additional slots 18, 30, 42, 46, 72, 90 not seen in others.

### 4. Abstract Class Usage
6 of 23 classes are abstract — they provide shared CCmdActionManager vtables and behavior
but don't have their own UnitTask vtable. The concrete classes set their family's abstract
CmdMgr vtable in the CreateCmdActionManager factory.

### 5. Single OnUpdate for All
16 of 17 classes share the exact same OnUpdate function (`sub_1406A5B30`), meaning
all behavioral differences are expressed purely through the CmdActionManager pipeline,
not through per-frame update logic. Only SpAssistAge1 needs custom frame processing.
