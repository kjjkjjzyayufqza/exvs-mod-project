# 001GUNDAM ThrowShield & HammerShot Weapon Analysis

Decompiled from `vsac27_Release.exe` via IDA Pro.

---

## 1. ThrowShield (Shield Throw Weapon)

ThrowShield is a **Throw-archetype** weapon. Both 001 and 002 costumes share the
same `ConfigureDamageInfo` but use different `CCmdActionManager` vftables.

### 1.1 CreateCmdActionManager — 001 (sub\_140F3AD10, slot 81)

```
001_ThrowShield::CreateCmdActionManager(a1, a2, a3):
  alloc 0x120 bytes, zero-fill
  → sub_140F3ACA0(ptr):
      CCmdActionManager_Radicon::ctor(ptr)       // sub_14068D390
      set vftable = CCmdActionManager_Radicon
      set offset[224] = -1, offset[228] = 0
      init linked-list at offset 232 (16 bytes)   // sub_1406BF3C0
      init linked-list at offset 248 (16 bytes)
      ─── override to CCmdActionManager_Throw vftable ───
      set offset[272] = 0, offset[280] = 0
      init linked-list at offset 272 (16 bytes)
      ─── override to CCmdActionManager_001GUNDAM_001_ThrowShield vftable ───
  return ptr
```

**Inheritance chain**: `CCmdActionManager` → `CCmdActionManager_Radicon` → `CCmdActionManager_Throw` → `001_ThrowShield`

**Object size**: 0x120 bytes (288 bytes)

### 1.2 CreateCmdActionManager — 002 (sub\_140F3B2D0, slot 81)

Structurally identical to 001. Only the final vftable differs:

| Field | 001 | 002 |
|---|---|---|
| vftable[0] | `CCmdActionManager_001GUNDAM_001_ThrowShield` | `CCmdActionManager_001GUNDAM_002_ThrowShield` |
| vftable[6] | same (secondary vftable) | same pattern |

### 1.3 ConfigureDamageInfo — Shared (sub\_140E382A0, slot 79)

```
ThrowShield::ConfigureDamageInfo(weapon, damageInfo):
  ── base call: sub_140DDCAF0 ──
    damageInfo[0]     = 1            // damage enabled
    damageInfo.b[100] = 1            // active flag
    read param hash 0x39760C0D from weapon params
    damageInfo[104]  |= 0x50         // hit flags (0x40 | 0x10)
    if param_value == 1:
      damageInfo.b[144] = 1          // penetration/pierce flag
  ── unit-specific overrides ──
  damageInfo.b[100] = 1              // confirm active
  damageInfo.b[433] = 1              // throw-specific: returns to owner
  damageInfo[104]   = 138 (0x8A)     // hit type flags (replaces base 0x50)
  damageInfo[152]   = 1              // hit count / damage multiplier
```

**Key behaviors**:
- The `0x8A` hit flags = `0x80 | 0x08 | 0x02` — likely `DOWN | STUN | HIT`
- `damageInfo.b[433] = 1` — this is the "returns to owner" flag for Throw weapons
- Reads one param hash (`0x39760C0D`) to check if piercing is enabled

---

## 2. HammerShot (Gundam Hammer — Chain Weapon)

HammerShot is a **chain/anchor weapon** with unique physics. It overrides far more
vtable slots than typical weapons because it manages a tethered projectile with
collision-based return mechanics.

### 2.1 CreateCmdActionManager — 001 (sub\_140F3AD60, slot 81)

```
001_HammerShot::CreateCmdActionManager(a1, a2, a3):
  alloc 0x120 bytes, zero-fill
  CCmdActionManager_Radicon::ctor(ptr)           // sub_140DDC790
  ptr[34] = 0                                     // offset 272
  ptr[35] = 0                                     // offset 280
  set vftable = CCmdActionManager_001GUNDAM_001_HammerShot
```

**Inheritance chain**: `CCmdActionManager` → `CCmdActionManager_Radicon` → `001_HammerShot`

**Critical difference from ThrowShield**: HammerShot does **NOT** inherit from
`CCmdActionManager_Throw`. It branches directly from `CCmdActionManager_Radicon`,
confirming it uses a completely different projectile management system (anchor/chain
vs throw/return).

### 2.2 CreateCmdActionManager — 002 (sub\_140F3B390, slot 81)

Identical structure, different vftable: `CCmdActionManager_001GUNDAM_002_HammerShot`.

### 2.3 ConfigureDamageInfo — 001 (sub\_140F3AFA0, slot 79)

```
001_HammerShot::ConfigureDamageInfo(weapon, damageInfo):
  ── base call chain: sub_140DE0B90 → sub_140DE0A90 ──
    damageInfo[0]     = 1             // damage enabled
    damageInfo.b[179] = 1             // anchor/chain flag
    damageInfo[104]   = 0             // clear hit flags
    damageInfo[152]   = 1             // damage count
    read param hash 0xA5678B08 → damageInfo[468]   // chain reach distance
  ── outer base overrides ──
    damageInfo.b[179] = 1             // confirm anchor mode
    damageInfo.b[464] = 0             // anchor NOT auto-active on spawn
    damageInfo[408]   = 4             // lifetime timer slot index
    damageInfo[324]   = 1             // damage state = initial
  ── 001-specific effect hashes ──
  damageInfo.b[100]   = 1            // active
  damageInfo[436]     = 0xFA57B5DA   // hit effect hash A
  damageInfo[432]     = 0xD606A1AD   // hit effect hash B (primary)
  damageInfo[484]     = 0xFA57B5DA   // return hit effect hash A (same)
  damageInfo[480]     = 0xD606A1AD   // return hit effect hash B (same)
  damageInfo.b[440]   = 1            // dual-phase damage enabled
  damageInfo[324]     = 1            // confirm damage state
```

### 2.4 ConfigureDamageInfo — 002 (sub\_140F3B530, slot 79)

Identical structure to 001, but with **different effect hashes**:

| Field | 001 Hash | 002 Hash |
|---|---|---|
| Effect Hash A (offset 436) | `0xFA57B5DA` | `0x49C2B789` |
| Effect Hash B (offset 432) | `0xD606A1AD` | `0x3D2522AE` |
| Return Effect A (offset 484) | `0xFA57B5DA` | `0x49C2B789` |
| Return Effect B (offset 480) | `0xD606A1AD` | `0x3D2522AE` |

The different hashes correspond to different visual hit effects for each costume
(likely Gundam Hammer vs Hyper Hammer visual variants).

### 2.5 OnInit (sub\_140DE0460, slot 2) — Why It's Different

```
HammerShot::OnInit(weapon):
  base_OnInit(weapon)                    // sub_1406A5BA0 — standard weapon init
  SetVisibility(weapon, HIDDEN)          // sub_14063D160(a1, 0) — HIDE the hammer
  ownerUnit = GetOwnerUnit(weapon)       // sub_14066E6B0
  if ownerUnit:
    if ownerUnit->GetTypeFlags() has bit 1:
      anchorData = ownerUnit->data[11920]
      if anchorData.byte[20]:            // anchor is initialized
        weapon.byte[13620] = 1           // mark: needs chain return
      if weapon.damageInfo.byte[464]:    // if anchor auto-active
        anchorData.int[16] = 2           // set chain state = EXTENDING
```

**Why different from default OnInit** (`sub_1406A5BA0`):
1. **Hides the hammer on spawn** — the hammer starts invisible and only becomes
   visible when the chain extends
2. **Synchronizes with the owner unit's anchor system** — reads anchor initialization
   state and sets chain extension state
3. Default OnInit only reads params and creates CCmdAction nodes

### 2.6 OnUpdate (sub\_140DE0B10, slot 12) — Why It's Different

```
HammerShot::OnUpdate(weapon):
  ── base update: sub_140DE01B0 ──
    standard_OnUpdate(weapon)            // sub_1406A5B30 — execute cmdActions
    if damageInfo.byte[464]:             // anchor mode active
      UpdateChainPosition(weapon)        // sub_140DE0260 — SSE chain dynamics
    CheckCollisionTracking(weapon)       // update global collision IDs
    if needsReturn || collisionPending:
      CreateCollisionEffect(weapon, mode=1)    // sub_140DE06A0(a1, 1)
      ClearReturnFlags()
  ── anchor completion check ──
  if AnchorTimerComplete(weapon[1691]):  // sub_140671900: byte[64] && byte[66]
    weapon->vftable->OnComplete(weapon)  // vftable+752
  ── timeout check ──
  if damageInfo[324] != 1:              // not in initial state
    if timer[1476].elapsed > 1000ms:    // exceeded 1 second timeout
      AutoReturn(cmdActionMgr)           // sub_1406898E0 — force return
```

**Why different from default OnUpdate** (`sub_1406A5B30`):
1. **Chain position dynamics** (`sub_140DE0260`) — uses SSE/SIMD math to calculate
   the hammer's position along the chain arc based on the owner's bone transforms
2. **Anchor timer management** — checks if the chain extension timer has completed
3. **Auto-return on timeout** — if the hammer has been extended for >1 second without
   hitting, it automatically retracts
4. **Collision tracking updates** — maintains a real-time collision state that the
   chain collision system uses

### 2.7 GetTypeFlags (sub\_140DE0590, slot 23) — Why It's Different

```
HammerShot::GetTypeFlags(weapon):
  BaseGetTypeFlags(weapon)              // 0x14066db00 — compute base type flags
  UpdateCollisionTracking(weapon)       // sub_140DE09F0
  CreateCollisionEffect(weapon, mode=0) // sub_140DE06A0(a1, 0) — outgoing mode
```

**Why different**:
- After computing base flags, it immediately **updates collision tracking** and
  creates a **mode=0 collision event** (outgoing/extending phase)
- `sub_140DE09F0` checks if the weapon's collision ID (`a1+13616`) has changed
  relative to its registered ID (`a1+1316`), comparing all 4 segments (lower 12 bits,
  middle 12 bits, upper flags, sign bit). If changed, it updates the global collision
  system and creates a new tracking entry via `sub_140DE05C0`

### 2.8 OnCollisionCheck (sub\_140DE0B80 → sub\_140DE0380, slot 73)

```
HammerShot::OnCollisionCheck(weapon, hitInfo):
  BaseCollisionCheck(weapon, hitInfo)    // sub_14066DA30
  if !damageInfo.byte[464]:              // anchor mode not active
    return                               // use default behavior
  ownerUnit = GetOwnerUnit(weapon)
  anchorData = ownerUnit->data[11920]
  if hitInfo.flags & 0x7000000:          // special hit type
    return                               // skip chain logic for special hits
  ── lookup hit in global collision system ──
  collisionIdx = LookupCollision(hitInfo.id)
  if collisionIdx == -1:                 // not found in system
    ── OR collision filter returns false ──
    if anchorData.state >= 2 AND hitInfo.value < 0:
      ── ANCHOR COLLISION: hammer hit something while extending ──
      weapon[13616] = hitInfo.id         // store collision
      ProcessAnchorHit(weapon, hitInfo)  // sub_140DE0770: mode=4 effect
      TriggerReturn(cmdActionMgr)        // sub_140DEE8A0: start retraction
    else:
      weapon->vftable->OnComplete(weapon)  // vftable+752: default response
```

**Why different**:
1. **Chain-aware collision** — only processes special chain collision logic when
   anchor mode is active (`damageInfo.byte[464]`)
2. **Anchor state gating** — requires `anchorData.state >= 2` (chain must be fully
   extended) before processing hits
3. **Negative hit value check** — `hitInfo.value < 0` indicates a valid enemy hit
   (as opposed to terrain or friendly collision)
4. **Chain return trigger** — on valid hit, stores the collision data and triggers
   the hammer retraction animation via `sub_140DEE8A0`
5. **Mode 4 collision effect** — creates a special collision event type (mode=4)
   with full 3D position data from the hit point, used for the impact visual effect

### 2.9 Slot 84 — 001 (sub\_140F3AE80) & 002 (sub\_140F3B410)

These functions read **chain attachment point offset parameters** from the weapon's
param data. Both are structurally identical, differing only in their static cache
variables.

```
HammerShot::Slot84(weapon, output):
  InitOutputStruct(weapon, output)       // sub_140F40ED0: count=3
  paramPtr = weapon->data[11808] + 56    // param data block
  ── thread-safe lazy initialization ──
  read hash 0xD5611787 → v12             // X offset
  read hash 0xA2738311 → v11             // Y offset
  read hash 0x3B5352AB → v10             // Z offset
  pack as float4: { v12, v10, v11, 0.0 }
  output[16..32] = packed_vector         // 16-byte XMFLOAT3 + padding
```

**Purpose**: Returns a 3D offset vector (X, Y, Z) for the chain's attachment
point on the Gundam's body. This is used by the chain dynamics system to compute
the hammer's swinging arc relative to the unit's current position.

**Param hashes read**:

| Hash | Decimal | Likely Meaning |
|---|---|---|
| `0xD5611787` | -715342969 | Chain attach X offset |
| `0xA2738311` | -1571058927 | Chain attach Y offset |
| `0x3B5352AB` | 995285675 | Chain attach Z offset |

---

## 3. Object Size & Memory Layout Differences

| Property | Default Weapon | HammerShot Weapon |
|---|---|---|
| Object size | 0x3530 (13616 bytes) | 0x3540 (13632 bytes) |
| Extra bytes | — | +16 bytes |
| Destructor | `sub_14092A3E0` | `sub_14092A700` |

The extra 16 bytes (offsets 0x3530–0x353F / 13616–13631) store:
- **a1+13616** (DWORD): Current collision tracking ID — the active collision
  entry for chain hit detection
- **a1+13620** (BYTE): "needs return" flag — set when chain should retract
- **a1+13621** (BYTE): Alternate return flag — secondary retraction trigger

### Factory (sub\_14094DCE0)

The HammerShot uses a unique factory that allocates **0x1F0 bytes** for its parent
actor and initializes critical anchor parameters:

```
HammerShot::Factory(a1, a2, a3):
  alloc 0x1F0 bytes, zero-fill
  → sub_140929240(ptr):
      CUnitTaskAutomataRadiconParentActor::ctor(ptr)
      actor.offset[432] = 0              // effect hash B (unset)
      actor.offset[436] = -1             // effect hash A (invalid)
      actor.offset[440] = 0              // byte flag
      actor.offset[448..464] = 0         // 16 bytes cleared
      actor.offset[464] = 1              // ★ ANCHOR MODE ENABLED
      actor.offset[468] = 5.0f           // ★ CHAIN REACH = 5.0 units
      actor.offset[480] = 0
      actor.offset[484] = -1             // secondary hash (invalid)
      actor.offset[488] = 0
```

**Key values**:
- `offset[464] = 1` — **This is the anchor/chain mode flag** that enables all
  the special chain behavior
- `offset[468] = 5.0f` (0x40A00000) — **Chain reach distance** in game units

---

## 4. 001 vs 002 Comparison Summary

### ThrowShield Differences

| Aspect | 001 | 002 |
|---|---|---|
| CmdActionManager vftable | `001_ThrowShield` | `002_ThrowShield` |
| ConfigureDamageInfo | **Shared** (`sub_140E382A0`) | **Shared** |
| Inheritance | Both: Radicon → Throw → unit-specific | Same |
| Behavior | Identical | Identical |

ThrowShield 001 vs 002 differ **only in vftable** (and thus in which CCmdAction
nodes they create). The damage configuration and overall behavior are identical.

### HammerShot Differences

| Aspect | 001 | 002 |
|---|---|---|
| CmdActionManager vftable | `001_HammerShot` | `002_HammerShot` |
| Hit Effect Hash A | `0xFA57B5DA` | `0x49C2B789` |
| Hit Effect Hash B | `0xD606A1AD` | `0x3D2522AE` |
| Return Effect Hash A | `0xFA57B5DA` | `0x49C2B789` |
| Return Effect Hash B | `0xD606A1AD` | `0x3D2522AE` |
| All other behavior | **Identical** | **Identical** |

HammerShot 001 vs 002 differ in **vftable and visual effect hashes only**. The
chain physics, collision logic, damage behavior, and timing are all identical.
The different hashes produce different hit spark / impact effects, matching
the visual distinction between Gundam Hammer (001) and Hyper Hammer (002).

---

## 5. Why HammerShot Needs So Many Unique Overrides

HammerShot (Gundam Hammer) is a **chain/flail weapon** — a tethered projectile
that swings on a chain attached to the Gundam's hand. This requires fundamentally
different behavior from standard projectiles:

| Override | Reason |
|---|---|
| **OnInit** (slot 2) | Must **hide the hammer initially** and **sync with the owner's anchor system** — standard weapons are visible on spawn |
| **OnUpdate** (slot 12) | Must compute **chain arc dynamics via SIMD math** (position = f(owner_bone, chain_length, time)), manage **anchor timers**, and handle **auto-retraction on timeout** (>1s) |
| **GetTypeFlags** (slot 23) | Must **continuously update collision tracking** and emit collision events for the chain's current position — standard weapons don't track this |
| **OnCollisionCheck** (slot 73) | Must implement **anchor-state-gated collision** — only processes hits when chain is fully extended (state≥2), triggers chain **retraction on hit**, creates **position-accurate hit effects** (mode=4) |
| **Factory** (slot varies) | Must allocate **extra 16 bytes** for chain collision tracking state and initialize **anchor mode = enabled**, **chain reach = 5.0** |
| **Destructor** | Must free **0x3540** bytes instead of standard **0x3530** |
| **Slot 84** | Must provide **3D attachment point offsets** (X/Y/Z) for where the chain connects to the Gundam's body |

The chain weapon model:
```
[Gundam Hand] ──chain(5.0 units max)──→ [Hammer Head]
     │                                        │
     ├─ attachment offset (slot 84)           ├─ collision check (slot 73)
     ├─ anchor system sync (OnInit)           ├─ chain dynamics (OnUpdate)
     └─ collision tracking (GetTypeFlags)     └─ hit retraction (OnCollisionCheck)
```

### Collision Event Modes

The chain system uses different collision event modes for different phases:

| Mode | Created By | Phase |
|---|---|---|
| 0 | GetTypeFlags | Chain outgoing / extending |
| 1 | OnUpdate | Collision tracking update / return initiated |
| 3 | OnUpdate (sub_140DE0260→sub_140DE08C0) | Chain position update during swing |
| 4 | OnCollisionCheck (sub_140DE0770) | Anchor hit — full 3D position data |

---

## 6. Param Hash Reference

| Hash | Decimal | Function | Meaning |
|---|---|---|---|
| `0x39760C0D` | 964487181 | ThrowShield ConfigureDamageInfo | Pierce enable flag |
| `0xA5678B08` | -1523167480 | HammerShot ConfigureDamageInfo | Chain reach / radius param |
| `0xD5611787` | -715342969 | HammerShot Slot 84 | Chain attach X offset |
| `0xA2738311` | -1571058927 | HammerShot Slot 84 | Chain attach Y offset |
| `0x3B5352AB` | 995285675 | HammerShot Slot 84 | Chain attach Z offset |

---

## 7. DamageInfo Field Reference (Offsets from damageInfo struct base)

| Offset | Type | ThrowShield | HammerShot | Meaning |
|---|---|---|---|---|
| 0 | DWORD | 1 | 1 | Damage enabled |
| 100 | BYTE | 1 | 1 | Active flag |
| 104 | DWORD | 0x8A | 0 | Hit type flags |
| 144 | BYTE | conditional | — | Pierce flag |
| 152 | DWORD | 1 | 1 | Damage multiplier |
| 179 | BYTE | — | 1 | Anchor/chain mode |
| 324 | DWORD | — | 1 | Damage state |
| 408 | DWORD | — | 4 | Lifetime timer slot |
| 432 | DWORD | — | effect hash B | Primary effect hash B |
| 433 | BYTE | 1 | — | Returns-to-owner flag |
| 436 | DWORD | — | effect hash A | Primary effect hash A |
| 440 | BYTE | — | 1 | Dual-phase damage |
| 464 | BYTE | — | 0 (factory sets 1) | Anchor active flag |
| 468 | DWORD | — | from param | Chain reach distance |
| 480 | DWORD | — | effect hash B | Return effect hash B |
| 484 | DWORD | — | effect hash A | Return effect hash A |
