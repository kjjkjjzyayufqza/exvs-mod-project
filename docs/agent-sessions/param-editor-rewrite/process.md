# Param Editor Rewrite — Reverse Engineering Analysis

## Session Goal

Reverse-engineer the EXVS2 Over Boost game executable (`vsac27_Release.exe`) to extract
the **actual game algorithms** for processing all 9 param types, then use these findings
to rewrite the editors with game-accurate logic and simulation.

## Param System Architecture (from IDA)

### Global Singleton & Entry Access

```
qword_1421155D0  ← global param manager singleton
sub_1405AA780()  → returns the singleton pointer

Param tables live at fixed offsets from the singleton:
  singleton + 0xB58 (2904)      — command table param system (bulletparam, characterparam, etc.)
  singleton + 0x268E60 (2526432) — secondary param set (weapon action tables)
```

### Entry Lookup: sub_1405B2870

```c
// FNV-1a hash of 4-byte entry_id → hash map lookup
// Returns: 16-byte struct { ptr_to_entry_data, entry_data_length }
_QWORD *sub_1405B2870(_QWORD *param_table, _QWORD *result, int entry_id)
{
    // FNV-1a constants: offset=0xCBF29CE484222325, prime=0x100000001B3
    uint64_t h = FNV1a_32(entry_id);
    // lookup in hash map at param_table[13..18]
    // returns entry data pointer + size as 128-bit pair
}
```

### Field Getter: sub_1405B2980

```c
// Reads a 4-byte field from an entry by command hash
// entry = {ptr, size} from sub_1405B2870
__int64 sub_1405B2980(__int64 table, _DWORD *out_value, __int64 *entry, unsigned int *hash)
{
    descriptor = LookupCommandDescriptorByHash(entry.ptr, &desc, *hash);
    offset = descriptor.entry_offset;
    *out_value = *(DWORD*)(entry.data + offset);
    return 0; // success
}
```

### LookupCommandDescriptorByHash (0x1401A8BD0)

Binary search over a **sorted** hash array at `entry_ptr + 32`:
- Array size at `entry_ptr + 20`
- After the hash array: descriptor records with `(offset_in_entry, flags, kind)`
- Returns pointer to the descriptor for the matched hash

---

## Per-Param Type Analysis

---

### 1. bulletparam.bin — Projectile System

**Critical Functions:**

| Address | Name | Role |
|---------|------|------|
| `sub_14043C200` | EntityCommandQuery | **Command query dispatcher** — 8488 bytes, NOT bullet physics. Switch with 83 command IDs (513–595) that return entity state values. Incorrectly identified as BulletTick. |
| `sub_1405C5090` | BulletSpawnPosition | Orchestrates spawn position calculation |
| `sub_1405C4400` | ComputeSpawnOffset | Deg→rad conversion, 3D positional offset from source |
| `sub_1405C42E0` | BallisticAngleSolver | Quadratic equation for launch angle |
| `sub_1405B5040` | BallisticTrajectory | Gravity-based trajectory using gravity_rate + turn_rate |
| `sub_140606BB0` | GravityTargetOffset | Applies gravity to target position prediction |
| `sub_14060A910` | TargetPositionResolver | Virtual dispatch per unit type |
| `sub_1405B5180` | RaycastHitTest | Traces bullet ray against scene, returns hit ratio |
| `sub_1405B5560` | DistanceCalculator | Packed coordinate conversion + distance lookup |

**Algorithm: BallisticAngleSolver (sub_1405C42E0)**

```typescript
function ballisticAngleSolver(
  source: Vec3, target: Vec3,
  initialSpeed: number, gravity: number,
  highArc: boolean
): number {
  const delta = sub(target, source);
  const dist = max(0.0001, length(delta));
  const gTerm = (dist * dist * gravity) / (2 * initialSpeed * initialSpeed);
  const dy = delta.y;

  const discriminant = max(0, dist*dist - (dy + gTerm) * gTerm * 4);

  const maxAngle = highArc ? 1.5 : 0.8; // radians (~86° / ~46°)
  const sign = highArc ? 1.0 : -1.0;

  const sqrtDisc = discriminant >= 0 ? sqrt(discriminant) : 0;
  return min(maxAngle, atan2(sqrtDisc * sign + dist, 2 * gTerm));
}
```

**Algorithm: GravityTargetOffset (sub_140606BB0)**

```typescript
function gravityTargetOffset(unit: Unit, targetPos: Vec3): Vec3 {
  const entry = getParamEntry(unit.bulletParamId); // sub_1405B2870
  const hitEffectHash = getField(entry, 0x0D6A5CD5);  // hit_effect_hash
  const gravityRate   = getField(entry, 0x74F469FA);   // gravity_rate
  const turnRate      = getField(entry, 0x90423264);   // turn_rate

  const launchAngle = ballisticAngleSolver(unit.pos, targetPos, ...);
  const tanAngle = tan(launchAngle);

  const delta = sub(targetPos, unit.pos);
  const horizontalDist = sqrt(delta.x*delta.x + delta.z*delta.z);

  targetPos.y = tanAngle * horizontalDist + unit.pos.y;
  return targetPos;
}
```

**Algorithm: ComputeSpawnOffset (sub_1405C4400)**

Reads 5 hash fields, converts 2 of them from degrees to radians:
- `spawn_offset_forward` (0x2F446A4F) → converted deg→rad
- `horizontal_aim_angle` (0x58435AD9) → converted deg→rad
- Plus 3 offset values for X/Y/Z positioning

Then applies 3D rotation matrix to compute bullet spawn position relative to the unit.

**CORRECTION (2026-05-07): Move Type System**

`sub_14043C200` is NOT a bullet physics function. It is a **command query dispatcher**
(getter) accessed via vtable. The 513–595 cases are entity command/query IDs that
return different state values, NOT projectile physics behaviors.

`sub_14043E3A0` is the corresponding **command action dispatcher** (setter), also
accessed via vtable, with a second switch on the same 518-591 range.

The actual `moveType` field in bulletparam uses **small integer values 0–7 and 255**:
- **0**: Missile — Standard straight-line projectile
- **1**: Throw — Gravity-arc projectile (FreeFall/ThrowMortar physics)
- **2**: Funnel — Orbiting funnel/bit
- **3**: Funnel Approach — Funnel attacking target
- **4**: Anchor — Anchor/chain grapple
- **5**: Funnel Flysword — Funnel melee mode
- **6**: Attach Change — Transformation-linked projectile
- **7**: Funnel Throw — Thrown funnel deployment
- **255**: Generic — Default behavior

Source: hitEffectLabels.ts BULLETPARAM_FIELD_DESCRIPTIONS.moveType field, confirmed
by actual bulletparam.bin data analysis.

---

### 2. characterparam.bin — Character Stats & Combat

**Critical Functions:**

| Address | Name | Role |
|---------|------|------|
| `sub_1405F9010` | DamageDispatcher | switch(attack_type, 0–18) → returns damage value |
| `sub_1405F9180` | CostDispatcher | switch(attack_type, 0–18) → returns ammo/gauge cost |
| `sub_1405F8600` | LockDistanceGetter | 6 lock distance tiers (red, green, etc.) |
| `sub_1405F8E70` | GutsCorrection | HP-based damage reduction (10 bands × 5%) |
| `sub_1405F8D40` | AttackCategoryCorrection | Float multiplier per attack category |
| `sub_1405F8DF0` | StaticArrayReader | Reads from static integer array at 0x14133F258 |
| `sub_1405F8C00` | FieldReader | Generic characterparam field reader by hash |

**Algorithm: DamageDispatcher (sub_1405F9010)**

```typescript
function getDamage(entry: CharacterEntry, attackType: number): number {
  switch (attackType) {
    case 0: case 1:  return getField(entry, 0xEB30FE24); // ranged_damage
    case 2: case 14: return getField(entry, 0x333722B6); // melee_damage
    case 3: case 15: case 18: return getField(entry, 0x9054ACF0); // sub_damage
    case 4: case 5: case 12:
      return Math.floor(getField(entry, 0xE301E496) * entry.correctionRate);
    case 6: case 7:  return getField(entry, 0x1D6EA3F1); // assist_damage
    case 8:          return getField(entry, 0x00D7CEDB); // max_hp
    case 9:
      return Math.floor(getField(entry, 0x7765F2E9) * entry.correctionRate);
    case 10:         return getField(entry, 0x539BE76D); // ranged_special_damage
    case 11:         return getField(entry, 0x2DA8874F); // special_melee_damage
    case 13:         return getField(entry, 0xE301E496); // same as 4/5/12 but no correction
    default:         return 0;
  }
}
```

**Algorithm: CostDispatcher (sub_1405F9180)**

```typescript
function getCost(entry: CharacterEntry, attackType: number, extraCtx?: any): number {
  switch (attackType) {
    case 0:  return getField(entry, 0x8199A311); // main_cost
    case 1:  return getField(entry, 0xD8F4FBD2); // sub_main_cost
    case 2:  return getField(entry, 0x22823596); // special_cost
    case 3:  return getField(entry, 0x0872029D); // sub_shot_cost
    case 4: case 5: case 12: return getField(entry, 0xAE7FF94F); // melee_cost
    case 6: case 7:  return getField(entry, 0xFEE76495); // assist_cost
    case 9:  return getField(entry, 0x1EA3FAE1); // burst_cost
    case 10: return getField(entry, 0xC6A88D7F); // special_ranged_cost
    case 13: return getField(entry, 0x5E0DDDD8); // charge_cost
    case 14: case 15: return getField(entry, 0x04371326); // base_unit_cost
    case 18: // base_unit_cost * character_list correction factor
      const base = getField(entry, 0x04371326);
      const factor = characterList.getFloat(extraCtx, 0xCAE69E45);
      return Math.ceil(base * factor);
    default: return 0;
  }
}
```

**Algorithm: Guts System (sub_1405F8E70)**

```typescript
function gutsCorrection(entry: CharacterEntry, hpPercent: number): number {
  if (hpPercent > 0.50) return 1.0;

  // 10 HP bands, each 5% wide
  const bands: [number, number][] = [
    [0.45, 0x6679A0B1], [0.40, 0x9B8F7954], [0.35, 0xE1EDDE72],
    [0.30, 0xBB3C2E2F], [0.25, 0xC1E4C2A9], [0.20, 0x3CB45DEC],
    [0.15, 0x46E5D07A], [0.10, 0x6F1F8D68], [0.05, 0x157CC9FE],
  ];
  let hash = 0xE8A1EF1B; // 0-5% band
  for (const [threshold, h] of bands) {
    if (hpPercent > threshold) { hash = h; break; }
  }

  return getFloatField(entry, hash) * 0.01; // convert percentage to multiplier
}
```

**Algorithm: Lock Distance (sub_1405F8600)**

```typescript
function getLockDistance(entry: CharacterEntry, distType: number): number {
  const hashByType: Record<number, number> = {
    0: 0x08ECF0BE, // red_lock_distance
    1: 0x9271BEB4, // mid_lock_distance
    2: 0xE69AD372, // far_lock_distance
    3: 0x78903491, // max_lock_distance
    4: 0x0F8134A7, // green_lock_distance
  };
  return getFloatField(entry, hashByType[distType] ?? 0x55EECE85);
}
```

---

### 3. speedparam.bin — Movement System

**Key Hash Groups by System:**

- **Ground movement**: walk_speed_forward/backward/base, ground_run_speed, max_ground_speed
- **Air movement**: air_speed_base/max, air_dash_speed/distance/duration, air_brake_speed
- **Boost system**: boost_gauge_capacity, boost_dash_speed/distance/duration, boost_consumption
- **Step/dodge**: step_distance/speed/startup_frame/recovery_frame
- **Gravity**: gravity_modifier, fall_gravity, fall_speed, air_gravity

These fields are consumed by the character movement state machine (functions in 0x14037xxxx range).
The movement system uses `movement_class` as a tier selector, and most speed values are raw integers
interpreted as fixed-point or direct frame/distance units.

**Processing pattern**: Most speed param values are read directly and used as-is in physics
calculations. The movement state machine switches on `movement_class`, `dash_cancel_type`,
`jump_type`, `fall_type`, etc. to select behavior branches, then applies the numeric values
as velocity/acceleration/duration parameters.

---

### 4. armsparam.bin — Weapon Action System

**Key Hash Groups by System:**

- **Ammo**: ammo_count, reload_time_total, reload_type, reload_start_frame, reload_per_shot_frame
- **Timing**: startup_frame, active_frame, recovery_frame, total_duration_frame, cooldown_frame
- **Combat**: damage, down_value, stun_value, shot_type, bullet_type
- **Corrections**: damage_correction_rate, down_correction_rate, stun_correction_rate, boost_consumption_rate
- **Homing**: homing_angle, induction_rate, homing_start_rate, homing_end_rate, tracking_speed_rate
- **Charge**: charge_frame, full_charge_frame, charge_weapon_type

Arms param entries are loaded via a **different param table offset** (`singleton + 0x268E60`)
compared to bullet/character params (`singleton + 0xB58`).

The weapon action system (functions at 0x14066xxxx, 0x140DDxxxx, 0x140Fxxxxx) initializes
weapon state from armsparam entries. Key function `sub_14066AC90` loads an entry by ID and
resets weapon state. The 24+ callers represent different weapon action initializers.

**Reload System**: The reload algorithm uses `reload_type` (0–3 enum) to select behavior:
- 0: Standard clip reload
- 1: Per-shot reload (like shotguns)
- 2: Overheat-based
- 3: Charge-based

Frame-based values (startup_frame, active_frame, etc.) define the weapon's action timeline
and are used directly as frame counters in the game loop.

---

### 5. grapparam.bin — Melee/Grapple System

**Fields:**
- **Combo**: damage, damage_2nd, damage_last, is_multi_hit
- **Stagger**: down_value, down_value_last, stun_value
- **Timing**: startup_frame, tracking_frame, grap_total_frame, recovery_frame, cancel_frame
- **Properties**: grap_priority, reach, correction_pct, charge_frame

Melee combat uses `grap_priority` for clash resolution (higher priority wins).
`tracking_frame` determines how long the melee tracks the target.
`reach` defines the melee attack range (signed, can be negative for pull attacks).
The `correction_pct` is a 0–100 integer representing damage scaling percentage.

---

### 6. interactionid.bin — Hit Interaction System

**Fields:**
- **Hit reaction**: interact_type (40 types), knockback_type (5 types), knockback_force/distance
- **Damage**: damage, damage_rate, correction_pct
- **Stagger**: down_value, stun_value, stun_frame, hitstop_frame
- **Defense**: guard_type, guard_break_level, block_level, can_tech
- **Properties**: hit_effect_id (9 types), attack_property (4 types), priority (6 levels)

The interaction system is consumed by `sub_1406066A0` (hit processing loop).
When a projectile hits, the game reads the bullet's `interaction_hash` field from bulletparam,
then uses that hash as the entry_id to look up the full interaction definition.

**Cross-param reference chain:**
```
bulletparam.interaction_hash → interactionid entry
bulletparam.hitgroup_hash    → hitgroupiddef entry
```

---

### 7. hitgroupiddef.bin — Collision Volume Definition

**Fields:**
- **Geometry**: offset_x/y/z, scale_x/y/z, radius, joint_offset
- **Hierarchy**: bone_hash, parent_bone_hash, model_hash
- **Properties**: hit_type (4 types), enable_state, collision_flags (3 types), group_id

Hit groups define collision volumes attached to bones. The game uses `bone_hash` to attach
the collision volume to a specific bone in the character model, and `parent_bone_hash`
for hierarchical collision chains.

**Processing**: `sub_1403643B0` and `sub_140379EA0` resolve entity positions by looking up
hit group entries and computing bone transforms. These functions use the standard param
entry system with hash 0xF63F4A7F for parent entity resolution.

---

### 8. chrsysparam.csyspm — Character System Parameters

**Format**: Different from command table — uses magic `0xB4ACACAF`, entries are 20 bytes each:
`[hash: u32, value_a: u32, value_b: u32, value_c: u32, value_d: u32]`

This is a simpler key-value store compared to the command table format.
Values are looked up by hash at runtime, similar to the command table but with a different
binary structure. The 4 value slots (a/b/c/d) likely represent different data types or contexts.

---

### 9. projectile_depiction_table.bin — Projectile Visual Definition

**Fields:**
- **Rendering**: model_hash, material_hash, render_mode (15 types), scale, z_offset
- **Effects**: main_effect_hash, sub_effect_hash, trail_effect_hash, spawn_effect_hash, destroy_effect_hash
- **Properties**: depiction_type, has_hit_effect, sound_effect_hash, trail_length, behavior_flags

**Cross-param reference chain:**
```
bulletparam.bullet_resource_hash → projectile_depiction_table entry
```

The depiction table is purely visual — it defines how a projectile looks and sounds.
The game's rendering system reads these entries to instantiate particle effects, 3D models,
and sound cues when a bullet is created/hits/expires.

---

## Cross-Param Reference Map

```
                    ┌──────────────────────┐
                    │   characterparam.bin  │
                    │  (stats, cost, guts)  │
                    └──────────┬───────────┘
                               │ unit stats
                               ▼
┌─────────────┐    ┌──────────────────────┐    ┌───────────────────┐
│ armsparam   │───▶│    Weapon Action      │───▶│  bulletparam.bin   │
│ (ammo,frame)│    │    State Machine      │    │  (trajectory,     │
└─────────────┘    └──────────────────────┘    │   physics)        │
                                                └────┬────┬────────┘
                              ┌───────────────────────┘    │
                              ▼                            ▼
                   ┌──────────────────┐    ┌───────────────────────┐
                   │ interactionid.bin │    │ projectile_depiction  │
                   │ (hit reaction,   │    │ (visual, effects,     │
                   │  knockback)      │    │  model, sound)        │
                   └──────────────────┘    └───────────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │ hitgroupiddef.bin │
                   │ (collision vols, │
                   │  bone attach)    │
                   └──────────────────┘

┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ speedparam  │    │   grapparam.bin   │    │ chrsysparam.csyspm│
│ (movement)  │    │   (melee combo)   │    │ (system params)   │
└─────────────┘    └──────────────────┘    └──────────────────┘
```

---

## Key IDA Functions Reference Table

| Address | Proposed Name | Param Type | Purpose |
|---------|--------------|------------|---------|
| `sub_1405AA780` | GetParamManager | all | Returns global singleton |
| `sub_1405B2870` | GetEntryById | all | FNV-1a entry lookup |
| `sub_1405B2980` | GetFieldByHash | all | Read field from entry by hash |
| `LookupCommandDescriptorByHash` | FindFieldDesc | all | Binary search for field descriptor |
| `sub_14043C200` | EntityCommandQuery | all | Command query dispatcher (83 query commands, NOT move types) |
| `sub_14043E3A0` | EntityCommandAction | all | Command action dispatcher (110+74 cases, setter) |
| `sub_1405C5090` | BulletSpawnPos | bulletparam | Spawn position calculation |
| `sub_1405C4400` | ComputeSpawnOffset | bulletparam | Deg→rad, 3D offset |
| `sub_1405C42E0` | BallisticAngleSolver | bulletparam | Launch angle from quadratic eq |
| `sub_1405B5040` | BallisticTrajectory | bulletparam | Gravity trajectory calculation |
| `sub_140606BB0` | GravityTargetOffset | bulletparam | Gravity-based target prediction |
| `sub_1405F9010` | DamageDispatcher | characterparam | switch(attackType) → damage hash |
| `sub_1405F9180` | CostDispatcher | characterparam | switch(attackType) → cost hash |
| `sub_1405F8600` | LockDistanceGetter | characterparam | 6-tier lock distance |
| `sub_1405F8E70` | GutsCorrection | characterparam | HP-band damage reduction |
| `sub_1405F8D40` | AttackCategoryMult | characterparam | Per-category correction |
| `sub_14066AC90` | WeaponStateInit | armsparam | Load weapon entry, reset state |
| `sub_1406066A0` | HitProcessingLoop | interactionid | Collision → interaction lookup |
| `sub_1403643B0` | EntityPosResolver | hitgroupiddef | Bone transform from hit group |

---

## 2026-05-08 Shooting Loop Workbench Slice

Implemented the first verified bullet editor slice as a manual pairing workbench:

- Added `src/lib/gameAlgorithms/shootingLoop.ts` as a pure TypeScript core that combines an `armsparam` entry, a `bulletparam` entry, and preview scenario data into a fire timeline, spawn frames, per-shot trajectory, and hit/despawn reason.
- Added `src/lib/gameAlgorithms/shootingLoop.test.ts` covering single-shot startup spawn, burst spawn spacing, ammo limiting, hit classification, lifetime end, and effective-range despawn.
- Fixed `src/lib/gameAlgorithms/crossParamResolver.ts` to resolve typed param entries through the real `entryId` field via `readTypedEntryId()` instead of the stale `__entryId` field.
- Added `src/lib/gameAlgorithms/crossParamResolver.test.ts` for `entryId` lookup, fallback index lookup, bullet cross references, reverse maps, and child bullet chains.
- Extended `BulletEditorStore` to hold optional `armsparam` data, selected arms entry index, and `ShootingLoopResult<TrajectoryResult>`.
- Added manual armsparam loading and arms entry selection in `BulletEditorView`; no automatic arms-to-bullet binding is attempted in this slice.
- Added `ShootingLoopPanel` to show startup, active/recovery/cooldown boundaries, ammo change, spawn frames, end frames, and end reasons.
- Adjusted `BulletTrajectoryCanvas` so playback waits until the selected arms startup spawn frame before drawing the first shot trajectory.

Verification:

- `pnpm test "src/lib/gameAlgorithms/shootingLoop.test.ts" "src/lib/gameAlgorithms/crossParamResolver.test.ts" "src/lib/gameAlgorithms/moveTypes.test.ts" "src/lib/gameAlgorithms/ballisticSolver.test.ts"` → 4 files passed, 39 tests passed.
- `pnpm exec tsc --noEmit` → passed.
- Cursor lints on edited TypeScript/TSX files → no linter errors.
