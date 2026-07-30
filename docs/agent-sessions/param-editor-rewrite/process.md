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
    0: 0x08ECF0BE, // red_lock_distance — PROVISIONAL; user 2026-07-11 红锁 is lockOnDistanceMax+alertRangeDistance (docs/characterparam-field-notes.md)
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

---

## 2026-07-26 Further-IDA Backlog Pass (live OB v27 instance, base 0x140000000)

Scope: the "Further IDA Analysis Needed" checklist in todo.md, worked in priority order
against the live IDA instance on vsac27_Release.exe (OB v27). Every claim is graded with
the project evidence scale (A/B/C/U/S/R). Query discipline: exact-address decompiles,
tight disasm ranges, direct xrefs, and LE hash-immediate byte signatures only.

### Item 1 - sub_1405C5090 full spawn transform pipeline (CLOSED)

`sub_1405C5090(out mat4* a1, int a2, entry* a3, vec4* targetPos a4, char aimFlag a5,
mat4* altBasis a6, u32* rngState a7, mat4* callerBasis a8)` produces the full 4x4 world
spawn TRANSFORM (orientation + position), not just a point. Pipeline, with addresses:

1. Base transform select (0x1405C5105..0x1405C5195). Reads two bulletparam fields from
   table `singleton+0xB58`: hash 0xEDD1C108 at 0x1405C510F and hash 0xD32D39ED at
   0x1405C5135 (both via sub_1405B2980). If a8 != 0 the caller-passed 64-byte matrix is
   used directly; else `sub_1405C4D20(out, a3, a2, value(0xEDD1C108), value(0xD32D39ED))`.
   [A for control flow; see step 2 for the two values' roles]

2. `sub_1405C4D20` (0x1405C4D20) = spawn-source bone transform resolver. Resolves an
   entity from `value(0xEDD1C108)` (0x1405C4D43..0x1405C4D7C, fallback `*(ctx+64)`),
   takes model object `v9 = *(entity+104)`, looks `value(0xD32D39ED)` up in the
   unordered_map at `v9[23..29]` (default key 1 when absent, 0x1405C4DB1), maps it to a
   matrix index, and copies the 64-byte matrix at `v9[14] + index*64` (0x1405C4EE5..
   0x1405C4F0E), then orthonormalizes via sub_1403872E0. So the default spawn base is a
   BONE WORLD TRANSFORM selected by the bullet's hitgroup value; the entity to spawn from
   is selected by the interaction value. [B: the map's key domain (hitgroup id vs bone
   name hash) is unproven; the map fill site (writer of v9+0xB8) is the exact next
   address class to pursue via xrefs on the model object type]

3. `sub_1405C4F50` (0x1405C4F50) = orientation mode dispatch. Reads hash 0x3CDF1516
   (pool: homing_type, [D:0-3]) at 0x1405C4F75. mode 0 -> keep source basis; mode 1 ->
   use caller-provided matrix (a5 param); mode 2/3 (target pointer present) ->
   `sub_1405C4820(pos_row3, target, mode==2)` builds a look-at basis, falling back to the
   caller matrix on failure. [A for the mode dispatch itself: explicit compare chain
   0x1405C4F97/0x1405C4FA0/0x1405C4FBD. sub_1405C4820's interior (the look-at math) was
   not decompiled this pass - exact next address 0x1405C4820]

4. `sub_1405C4400` (0x1405C4400) = ComputeSpawnOffset, now fully read. Five field reads
   (hash immediates in disasm at 0x1405C4472, 0x1405C4498, 0x1405C44BE, 0x1405C44E4,
   0x1405C4523):
   - 0x55C77696 -> local X (right-axis) positional offset, NO deg->rad
   - 0x0594D6D4 -> local Y (up-axis) positional offset, NO deg->rad
   - 0x9C9D876E -> local Z (forward-axis) positional offset, NO deg->rad
     Translation: `row3 += x*row0 + y*row1 + z*row2` (0x1405C45F6..0x1405C4659), gated
     on any |component| >= 1e-6. The offsets are distances in the muzzle basis. [A:
     arithmetic role proven; negative check: none of the three passes the pi/180 pair,
     ruling out the angle reading their pool names imply]
   - 0x58435AD9 -> deg->rad (pi = dword_141B4EB1C = 0x40490FDB, 180 = dword_141B4EC08 =
     0x43340000) -> Euler element 0 = X-axis rotation = PITCH (vertical)
   - 0x2F446A4F -> deg->rad -> Euler element 1 = Y-axis rotation = YAW (horizontal)
     Euler order selector 0; converted by sub_14013DD10 and composed onto the basis via
     sub_14006A5C0. [A: axis mapping proven at 0x14013DD61/0x14013DD9D/0x14013DDCD -
     element 0/1/2 are masked by unit vectors 0x141B4EE00=(1,0,0,0), 0x141B4EF60=
     (0,1,0,0), 0x141B4F1B0=(0,0,1,0); sub_14013DD10 is EulerToQuaternion(angles, order)
     with a 6-case rotation-order switch at 0x14013DDF0]

5. Aim-at-target clamp branch (0x1405C522B..0x1405C53C8, only when a5 flag set). Reads
   0x138B3675 at 0x1405C5235 and 0xFD855759 at 0x1405C526B, both deg->rad; branch taken
   when either > 0. `sub_1403888D0` (0x1403888D0) decomposes the muzzle matrix to
   (roll = atan2(m00.y, m11.y), yaw = atan2(fwd.x, fwd.z), pitch = atan2(-fwd.y, h)).
   `sub_1405C4A30` (0x1405C4A30) then, with delta = targetPos - spawnPos:
   - if limitYaw (arg xmm2 = 0x138B3675 rad) > 0: targetYaw = atan2f(dx, dz); diff
     wrapped to (-pi, pi] via fmodf (0x1405C4A7F..0x1405C4AB7); diff clamped to
     [-limitYaw, +limitYaw]; added to euler yaw (element 1).
   - if limitPitch (arg xmm3 = 0xFD855759 rad) > 0: targetPitch = atan2f(-dy,
     sqrt(dx^2+dz^2)); diff clamped to [-limitPitch, +limitPitch]; added to euler pitch
     (element 0).
   Rebuilt as quaternion (order 2) -> matrix. So the spawn basis is rotated toward the
   target, with independent horizontal and vertical clamp angles. [A: clamp arithmetic
   and axis roles proven; ms-x64 xmm2/xmm3 arg order confirmed in caller disasm at
   0x1405C52DE..0x1405C52E4]

6. Random dispersion branch (0x1405C53E5..0x1405C5631). Reads 0x13662C98 at 0x1405C53EF,
   deg->rad. If nonzero: xorshift128 RNG over caller state a7[2..5] (0x1405C5450..
   0x1405C54D3, classic `x ^= x<<11; ... >>8` lattice) produces u1 in [-pi, pi) and
   u2 in [0, dispersionRad); Euler(u2, u1, 0) order 0 -> quaternion -> matrix composed
   onto the muzzle basis (sub_14006A5C0 call at 0x1405C55BB). Net effect: bounded random
   tilt up to the dispersion angle with uniform random azimuth = scatter cone. [A for the
   RNG + bounded-angle arithmetic; B for the exact cone axis (depends on order-0
   composition order, not re-derived)]

7. Output normalization (0x1405C5640..end): each basis row divided by its length;
   translation w forced to 1.0 via lane-3 select (0x141B4F480 = int (0,0,0,1) mask
   source, 0x141B4F7C0 = (1,1,1,1)); if any row length < 1e-6 the basis is rebuilt from
   the sub_1400C8440 fallback direction. [A]

R-grade findings against the canonical bulletparam pool (report only, NO renames):
- 0x138B3675 `hitbox_height` -> consumed as HORIZONTAL AIM CLAMP ANGLE in degrees
  (deg->rad at 0x1405C5251..0x1405C525C, clamp at 0x1405C4AC6..0x1405C4AD6). A hitbox
  height would not be multiplied by pi/180; pool range [D:0~360] fits degrees. R.
- 0x13662C98 `hitbox_width` -> consumed as RANDOM DISPERSION CONE HALF-ANGLE in degrees
  (deg->rad at 0x1405C5421..0x1405C5426, RNG-scaled at 0x1405C54F9). [D:0~25] fits a
  scatter angle. R.
- 0x55C77696 `vertical_launch_angle` -> local RIGHT-axis positional offset (distance,
  no deg->rad, multiplies basis row 0). R.
- 0x0594D6D4 `initial_angle` -> local UP-axis positional offset (distance). R.
- 0x9C9D876E `offset_angle_horizontal` -> local FORWARD-axis positional offset
  (distance). R.
- 0x58435AD9 `horizontal_aim_angle` -> X-axis Euler = PITCH = the VERTICAL rotation
  offset. The existing name has inverted polarity. R.
- 0x2F446A4F `spawn_offset_forward` -> Y-axis Euler = YAW = the HORIZONTAL rotation
  offset in degrees (pool comment already knew it was angular; the name is still a
  positional-offset name). R.
- 0xFD855759 `induction_angle` -> at this site it is the VERTICAL aim clamp for spawn
  orientation, not homing induction. Name-compatible (it is an angle) but the implied
  homing role is unproven here. B-refinement, flagged.
- 0xEDD1C108 `interaction_hash` / 0xD32D39ED `hitgroup_hash` additionally select the
  spawn-source entity and bone transform in sub_1405C4D20. Does not contradict the hit
  pipeline use; recorded as a second consumer. B.

### Item 2 - projectile_depiction_table render_mode consumers (CLOSED)

Entry path: LE byte signature for hash 0xBA4BBA9D (`9D BA 4B BA`) hits exactly once in
code, at 0x14066DB91 inside `sub_14066DB70`.

- `sub_14066DB70` (0x14066DB70) = render_mode getter: reads hash 0xBA4BBA9D via
  sub_1405B2980 from table `singleton+0xC0` (192) and returns the u32 (0 on failure).
  This pins the depiction table's runtime table slot: `singleton+0xC0`, distinct from
  bulletparam/characterparam (`+0xB58`) and the weapon action table (`+0x268E60`). [A]

- Sole code consumer: `sub_140689D60` (0x140689D60, size 0x530) = the projectile
  depiction FACTORY. It resolves the depiction entry (sub_14066DE00), reads render_mode,
  also fetches a second param entry by id from `singleton+0x268E60` (sub_1405B2870 at
  0x140689DB9), then `switch (render_mode)` at 0x140689DDA allocates and constructs one
  C++ object per mode. render_mode does NOT select a shader directly; it selects the
  `VDK::GAM::CEfxProjectileDepiction*` subclass, i.e. the projectile render-path class.
  [A: switch explicit; ctor-to-class binding proven by the data xref of each class
  vftable inside its constructor; corroborated by RTTI strings; negative check below]

  render_mode -> class (ctor addr, alloc size):
  |  1 | CEfxProjectileDepictionFixedShape         | sub_140697940, 0x140 |
  |  2 | CEfxProjectileDepictionExpand             | sub_140696FC0, 0x190 |
  |  3 | CEfxProjectileDepictionFixedRot           | sub_140697ED0, 0x148 |
  |  4 | CEfxProjectileDepictionNormalLine         | sub_140698370, 0x1A0 |
  |  5 | CEfxProjectileDepictionDivideLine         | sub_140699290, 0x250 |
  |  6 | CEfxProjectileDepictionExpand             | (same ctor as 2)     |
  |  7 | CEfxProjectileDepictionDivideStraightLine | sub_140698AD0, 0x300 |
  |  8 | CEfxProjectileDepictionExpand             | (same ctor as 2)     |
  |  9 | UNHANDLED - no switch case, factory returns null                 |
  | 10 | CEfxProjectileDepictionFunnel             | sub_14069A420, 0x140 |
  | 11 | CEfxProjectileDepictionGroundStripLine    | sub_140699B30, 0x2C0 |
  | 12 | CEfxProjectileDepictionPillar             | sub_140699E70, 0x148 |
  | 13 | CEfxProjectileDepictionShotgun            | sub_14069A2C0, 0x140 |
  | 14 | CEfxProjectileDepictionShotgunBeam        | sub_14069A350, 0x190 |
  | 15 | CEfxProjectileDepictionDivideMobileCurve  | sub_14069A790, 0x270 |
  | 16 | CEfxProjectileDepictionExpandDirection    | Expand ctor + vftable swap at 0x14068A152 |
  | 17 | CEfxProjectileDepictionFollowShell        | sub_14069B230, 0x140 |
  | 18 | CEfxProjectileDepictionFixedNoDir         | sub_140698210, 0x62-byte ctor, alloc 0x140 |

  vftable-installation xrefs used for the binding (constructor addr -> vftable write):
  0x140697005 Expand, 0x140697985 FixedShape, 0x140697F15 FixedRot, 0x140698255
  FixedNoDir, 0x1406983B5 NormalLine, 0x140698B24 DivideStraightLine, 0x1406992D5
  DivideLine, 0x140699B75 GroundStripLine, 0x140699EB5 Pillar, 0x14069A2F7 Shotgun,
  0x14069A387 ShotgunBeam, 0x14069A465 Funnel, 0x14069A7D5 DivideMobileCurve,
  0x14069B275 FollowShell. Base class CEfxProjectileDepictionAbstract vftable installed
  at 0x140696A20 (abstract base ctor).

  Negative check: mode 9 and mode 0 have no case and return null - matches the corpus
  observation in projectile_depiction_table.rs (`[D:1~18] enum, 15 types, never 0`;
  the three duplicate-Expand modes 2/6/8 plus 15 distinct classes explain "15 types"
  vs 17 handled ids).

  Pool name `render_mode` remains acceptable (it selects the render-path class); a more
  precise reading is "depiction_class_id". No rename performed.

### Item 3 - chrsysparam (.csyspm) runtime consumers (CLOSED)

Entry path: LE byte signature for the container magic 0xB4ACACAF (`AF AC AC B4`) hits
exactly once in code, at 0x14066C892.

Consumer chain, all addresses exact:

- `sub_14066C890` (0x14066C890) = magic check `*(u32*)blob == 0xB4ACACAF`. [A]
- `sub_14066C880` (0x14066C880) = version check `*(u32*)(blob+4) == 0x10000`. [A]
- `sub_140635B30` (0x140635B30) = character-instance init. At 0x140635F32..0x140635F56 it
  takes the loaded blob at `arg2 + 168`, runs both checks, and stores the pointer at
  `instance + 215592` (0x34A28). That instance offset IS the chrsysparam handle. [A]
- `sub_14066C8B0` (0x14066C8B0) = table-0 cell read; `sub_14066C900` (0x14066C900) =
  table-1 cell read. Both: `table = blob + *(u32*)(blob + 20 | 24)`; bounds-check
  `row < *(i32*)(table+4)` and `col < *(i32*)(table+8)`; return
  `*(u32*)(table + 16 + 4*(col + row*cols))`. Row-major, 4-byte cells. [A]
- `sub_140695820` (0x140695820) = thin dispatcher: `(instance+88)` holds the blob in this
  object; table index 0 -> sub_14066C8B0, 1 -> sub_14066C900, anything else -> fail. [A]
- `sub_1406958A0` (0x1406958A0) = the MSC syscall handler. `switch (*a4)` at 0x1406958B3:
  - 0x700000 -> generic cell read: args (tableIndex, row, col) -> cell value. [A]
  - 0x700001 -> table row count: returns `*(u32*)(blob + tableOffset + 4)`. [A]
  - 0x700002 -> `sub_140695450` action route/flags query. [A]
  - 0x700003 -> `sub_140665930` (a different subsystem, not chrsysparam). [S]
  This is the exact surface MSC scripts use to read .csyspm.
- `sub_140695450` (0x140695450) = the OB v27 native equivalent of the Python tool's
  `emulate_old_func_786`. For route==1 it reads three cells of table 0 at the SAME row
  index (the action row) and columns 44 (0x2C), 3, 110 (0x6E) - addresses 0x14069571F,
  0x140695754, 0x14069578D - then composes flags:
  `flags = (col44 ? 0x400 : 0) | (col3 > 300 ? 0x200 : 0x20000) | routeTable[3*group + (col110 && alt ? 2 : 1)]`
  For route==0 it returns `routeTable[3*group]` directly (0x1406957F0).
  [A: independent corroboration - `tools/research_chrsysparam_700002.py:66`
  `emulate_old_func_786` reads exactly row[0x2C], row[0x03] (>0x12C=300), row[0x6E] and
  emits the same 0x400 / 0x200 / 0x20000 flag bits. Two independently derived models of
  the same routine agree on all three column indices and both thresholds.]
  Note (behaviour delta, not a rejection): the Python model tests `row[0x2C] == 1`; OB v27
  native tests nonzero (0x1406957A4). Older-build vs OB v27 difference or an over-narrow
  Python condition; either way the Python tool is stricter than the engine.
  The group->route/base-flag table is assembled on the stack from 40 xmmword constants
  (first: xmmword_141B4EE90, then 0x14134BE20, 0x14134BDD0, 0x14134BE30, 0x141B4F490,
  0x141B4F060, 0x14134BE40, 0x14134BE70, 0x14134BDE0, 0x14134BDC0, ... through
  xmmword_14134BE50 / 0x14134BEF0), contiguous at rbp-0xC0 upward, 3 dwords per group.
  Sampled values are 0/1/2, matching the Python low flag bits 0x1/0x2/0x4 space. [B: the
  full 53-group table was not transcribed; exact next step is a 40-region get_bytes over
  the constant list above, reassembled in stack-slot order.]

R-grade finding against `src-tauri/src/format/chrsysparam.rs` (report only, NO edit made):
The Rust module models the file as `entry_count = *(u32*)0x10` followed by 20-byte
`[hash, value_a..value_d]` records at 0x1C. The engine layout proven above is: 0x14 and
0x18 are u32 offsets to TABLE 0 and TABLE 1; each table is
`{marker u32, rows u32, cols u32, pad u32, cells u32[rows*cols]}` starting at its offset.
Validated on real data (`E:\XB\mod\041cpm\654gexvs2_003glfunl_001\chrsysparam.csyspm`,
17984 bytes): header = `b4acacaf 00010000 26fb4b39 0 00000002 0000001c 0000462c`; table 0
at 0x1C has marker 0xA8BBBAB9, rows=35, cols=128 -> 16 + 4*35*128 = 17936 bytes, landing
exactly on 0x462C where table 1 (1x1, 20 bytes) ends the 17984-byte file.
The value the Rust parser reads at 0x10 is the TABLE COUNT (always 2), not an entry count.
Consequence: `parse_chrsysparam` reads only 2 twenty-byte pseudo-entries and
`build_chrsysparam` re-emits a 68-byte file, silently discarding ~17.9 KB for any
non-empty chrsysparam. The existing round-trip test passes only because its sample is the
degenerate 68-byte two-empty-tables file. This is a data-loss defect, not a naming issue;
fixing it needs a separate reviewed pass. R.

### Follow-up action taken on the chrsysparam R-grade finding (2026-07-26)

The data-loss defect above was independently re-verified against two real files before
any code change:

- `E:\XB\mod\041cpm\654gexvs2_003glfunl_001\chrsysparam.csyspm` (17984 bytes): header
  `b4acacaf 00010000 26fb4b39 00000000 00000002 0000001c 0000462c`; table 0 at 0x1C has
  marker 0xA8BBBAB9, rows=35, cols=128 -> 16 + 4*35*128 = 17936 bytes, ending exactly at
  0x462C where table 1 (marker 0xA8BAA9BA, 1x1, 20 bytes) closes the file at 17984.
- `E:\XB\解包\com\file\0x08248A8D\chrsysparam.csyspm` (68 bytes): both tables 1x1, so the
  flat entry model happens to be byte-faithful. This is the sample the old test used, which
  is why the defect was invisible.

Reading 0x10 as an entry count yields 2 on BOTH files, confirming it is the table count.
The old `build_chrsysparam` therefore re-emitted 68 bytes for the 17984-byte file,
destroying 17916 bytes.

Fix applied this pass (guard only, NOT table-aware editing):
`src-tauri/src/format/chrsysparam.rs` now validates the real container
(table count at 0x10, table offsets at 0x14/0x18, per-table
`{marker, rows, cols, pad, cells[rows*cols]}`) and REJECTS any file whose tables are not
1x1, because the flat entry model cannot represent them. `build_chrsysparam` re-validates
its own output so a pseudo-entry insert or delete can never reach disk. This follows the
project rule that unsupported input must raise an error instead of silently degrading.

Tests (`cargo test --lib chrsysparam`, 5 passed): degenerate real sample round-trips
byte-exact; synthetic 1x1 container round-trips; a synthetic 35x128 container (exactly
17984 bytes, the real shape) is rejected with a message naming the dimensions and the bytes
at risk; an entry-count change is refused at build time; a table offset pointing into the
header is rejected.

STILL OPEN (separate reviewed scope): real table-aware read/write plus the ChrSys editor UI
that would expose rows/cols cells. Until then the ChrSys editor can only open degenerate
files, which is intended: refusing to open is strictly safer than opening and destroying.
