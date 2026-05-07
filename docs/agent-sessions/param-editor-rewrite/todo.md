# Param Editor Rewrite — Implementation Plan

## Overview

Rewrite all 9 param editors to use game-accurate algorithms reverse-engineered from
`vsac27_Release.exe`. Each editor will simulate the actual game behavior rather than
being a generic field editor.

See `process.md` for the full reverse engineering analysis.

---

## Phase 1: Shared Infrastructure

### 1.1 Game Algorithm Library (`src/lib/gameAlgorithms/`)

Create a TypeScript library implementing the core game algorithms:

- [ ] `paramSystem.ts` — FNV-1a hash lookup, command descriptor binary search (mirrors LookupCommandDescriptorByHash)
- [ ] `ballisticSolver.ts` — Ballistic angle solver (sub_1405C42E0), trajectory calculator (sub_1405B5040)
- [ ] `spawnPosition.ts` — Deg→rad conversion, 3D spawn offset (sub_1405C4400)
- [ ] `damageCalculation.ts` — Damage dispatcher, cost dispatcher, guts correction (sub_1405F9010/9180/8E70)
- [ ] `movementPhysics.ts` — Speed/acceleration/gravity formulas from movement state machine
- [ ] `reloadSystem.ts` — 4 reload types (standard, per-shot, overheat, charge)
- [ ] `collisionGeometry.ts` — Hit volume computation from bone + offset + scale

### 1.2 Cross-Param Reference Resolver

- [ ] `crossParamResolver.ts` — Resolves hash references between param types:
  - bulletparam.interaction_hash → interactionid entry
  - bulletparam.hitgroup_hash → hitgroupiddef entry
  - bulletparam.bullet_resource_hash → projectile_depiction_table entry
  - bulletparam.child_bullet_hash → another bulletparam entry

### 1.3 Shared Editor Components

- [ ] `GameAccuratePropertyPanel.tsx` — Property panel that shows both raw values AND computed game values
- [ ] `CrossReferencePanel.tsx` — Shows linked entries from other param files
- [ ] `TimelineVisualizer.tsx` — Frame-based timeline (startup → active → recovery → cooldown)

---

## Phase 2: bulletparam Editor (Priority: Highest)

### 2.1 Move Type Simulation Engine

The game has **83 move types** (IDs 513–595). Each implements a different projectile behavior.
The editor must simulate the correct behavior for each move type.

- [ ] Categorize all 83 move types into groups:
  - Straight shots (513–519)
  - Homing variants (521–531)
  - Ballistic/arc (532–538) — uses BallisticAngleSolver + BallisticTrajectory
  - Spread/scatter (539–544)
  - Special (beam, funnel, etc.) (545–552)
  - Advanced homing with turn acceleration (553–567)
  - Gravity-affected (568–575)
  - Unique patterns (boomerang, mine, etc.) (576–595)
- [ ] Implement per-move-type physics in `bulletMoveTypes.ts`
- [ ] Update TrajectorySimulator to use game-accurate algorithms per move type
- [ ] Implement `BulletTrajectoryCanvas` with move-type-specific rendering

### 2.2 Spawn Position Preview

- [ ] Implement game-accurate spawn offset calculation (deg→rad, 3D rotation)
- [ ] Visual: show spawn point relative to unit with direction indicators
- [ ] Show muzzle_offset_horizontal/vertical as visual offset from gun bone

### 2.3 Cross-Reference Integration

- [ ] Load and display linked interactionid entry (from interaction_hash)
- [ ] Load and display linked hitgroupiddef entry (from hitgroup_hash)
- [ ] Load and display linked depiction entry (from bullet_resource_hash)
- [ ] Show child_bullet_hash chain (recursive bullet spawning)

### 2.4 Validation with Game Constants

- [ ] Validate initial_speed against game engine clamp (max 640 from data)
- [ ] Validate move_type against known valid range (513–595)
- [ ] Validate homing parameters against game constraints
- [ ] Show warnings for PHANTOM fields (not used in any real file)

---

## Phase 3: characterparam Editor (Priority: High)

### 3.1 Damage/Cost Calculator

- [ ] Implement full DamageDispatcher with all 19 attack types
- [ ] Implement full CostDispatcher with all 19 attack types (including case 18 factor)
- [ ] Interactive table: select attack type → show damage AND cost simultaneously
- [ ] Show correction_rate multiplication for cases 4/5/9/12

### 3.2 Guts System Visualizer

- [ ] Implement 10-band HP correction system (5% per band, >50% = 1.0)
- [ ] Visual: HP bar with color-coded bands showing correction multiplier per band
- [ ] Interactive: drag HP slider, see effective damage multiplier in real-time
- [ ] Show actual damage after guts correction for each attack type

### 3.3 Lock Distance Visualizer

- [ ] Implement 6-tier lock distance system
- [ ] Visual: concentric circles showing red/green/mid/far/max lock ranges
- [ ] Show lock-on FOV angle overlay

### 3.4 Stat Overview

- [ ] Radar chart with game-meaningful categories (not raw field names):
  - Offense: melee_damage, ranged_damage, assist_damage
  - Defense: max_hp, guard_damage_rate, barrier_damage_rate
  - Mobility: movement_speed_base, boost_dash_speed_rate, step_speed_rate
  - Range: red_lock_distance, green_lock_distance
- [ ] Unit cost breakdown (base + per-type costs)

---

## Phase 4: armsparam Editor (Priority: High)

### 4.1 Action Timeline Visualizer

- [ ] Full frame-accurate timeline: startup → active → recovery → cooldown
- [ ] Show reload timing overlay (reload_start_frame, reload_time_total, reload_per_shot_frame)
- [ ] Show charge frame overlay for charge weapons
- [ ] Playback animation: see the action timeline play out in real-time

### 4.2 Reload System Simulator

- [ ] Implement 4 reload types:
  - Type 0: Standard clip reload
  - Type 1: Per-shot reload
  - Type 2: Overheat system (overheat_frame)
  - Type 3: Charge-based
- [ ] Interactive ammo counter simulation: fire → reload → fire cycle
- [ ] Show effective DPS accounting for reload downtime

### 4.3 Damage Output Calculator

- [ ] Per-shot damage with all correction rates applied
- [ ] DPS calculation: damage × fire_rate, accounting for reload/cooldown
- [ ] Sustained DPS vs burst DPS comparison
- [ ] Show weapon slot diagram with ammo state

### 4.4 Homing Parameter Preview

- [ ] Homing angle cone visualization
- [ ] Induction rate graph (homing_start_rate → homing_end_rate over time)
- [ ] Tracking speed visualization

---

## Phase 5: speedparam Editor (Priority: Medium)

### 5.1 Movement State Machine Visualizer

- [ ] Show movement class tier and its implications
- [ ] State diagram: ground → jump → air → boost_dash → step
- [ ] Per-state speed values with visual speed bars

### 5.2 Speed Curve Visualization (Game-Accurate)

- [ ] Ground movement: walk → run speed transition
- [ ] Boost dash: initial_speed → sustained_speed → end_speed curve
- [ ] Air dash: speed → duration → distance relationship
- [ ] Step: distance vs speed vs recovery tradeoff
- [ ] Apply gravity_modifier and fall_gravity to fall speed

### 5.3 Movement Radius Canvas (Game-Accurate)

- [ ] Boost dash radius = dash_distance × dash_count
- [ ] Step radius = step_distance × step_cancel potential
- [ ] Air dash coverage map
- [ ] Overlay all movement options on a single top-down view

### 5.4 Boost Economy Calculator

- [ ] Boost gauge: capacity → consumption per action → recovery
- [ ] Show "boost budget": how many dashes/steps per full gauge
- [ ] Recovery timeline: consumption → delay → recovery_speed

---

## Phase 6: grapparam Editor (Priority: Medium)

### 6.1 Melee Combo Visualizer

- [ ] Combo damage chain: damage → damage_2nd → damage_last
- [ ] Cumulative down/stun value per hit
- [ ] Frame data timeline: startup → tracking → total → recovery → cancel
- [ ] Show priority for clash resolution

### 6.2 Reach & Tracking Preview

- [ ] Visual: reach circle around unit (supports negative for pull attacks)
- [ ] Tracking frame window visualization
- [ ] Show correction_pct as damage scaling indicator

---

## Phase 7: interactionid Editor (Priority: Medium)

### 7.1 Hit Reaction Simulator

- [ ] Knockback visualization: force × distance × type
- [ ] Hitstop frame display
- [ ] Guard interaction: guard_type × guard_break_level × block_level
- [ ] Tech window: can_tech × untechable_frame

### 7.2 Interaction Chain Viewer

- [ ] Show which bulletparam entries reference this interaction
- [ ] Damage pipeline: base_damage → correction → damage_rate → final
- [ ] Hit stun/down accumulation preview

---

## Phase 8: hitgroupiddef Editor (Priority: Medium)

### 8.1 Collision Volume 3D Preview

- [ ] 3D wireframe view of collision volumes (sphere/capsule based on hit_type)
- [ ] Bone attachment visualization (bone_hash → bone position)
- [ ] Parent chain visualization (parent_bone_hash hierarchy)
- [ ] Scale/offset applied to show actual collision shape

### 8.2 Group Organization View

- [ ] Group by group_id
- [ ] Show enable_state and collision_flags per group
- [ ] Highlight model_hash references

---

## Phase 9: chrsysparam Editor (Priority: Low)

### 9.1 Hash-Value Table View

- [ ] Clean table with hash → 4 value columns
- [ ] Known hash labeling (from game analysis)
- [ ] Value interpretation (u32/i32/f32 based on context)

---

## Phase 10: projectile_depiction_table Editor (Priority: Low)

### 10.1 Visual Configuration Preview

- [ ] Render mode selector with visual examples
- [ ] Effect hash reference chain display
- [ ] Scale/offset preview
- [ ] Trail length visualization

### 10.2 Asset Reference Viewer

- [ ] Model hash → 3D model preview (if available)
- [ ] Effect hashes → effect name resolution
- [ ] Sound effect hash → sound reference

---

## Implementation Order (Recommended)

1. **Phase 1** — Shared infrastructure (game algorithm library + cross-ref)
2. **Phase 2** — bulletparam (most complex, biggest impact)
3. **Phase 3** — characterparam (critical for modding workflow)
4. **Phase 4** — armsparam (directly tied to bullet system)
5. **Phase 5** — speedparam (movement tuning)
6. **Phase 6** — grapparam (melee tuning)
7. **Phase 7** — interactionid (hit reaction tuning)
8. **Phase 8** — hitgroupiddef (collision tuning)
9. **Phase 9** — chrsysparam (system params)
10. **Phase 10** — projectile_depiction_table (visual params)

---

## Further IDA Analysis Needed

For full implementation, these functions need deeper reverse engineering:

- [ ] `sub_14043C200` — Full decompilation of all 83 move type cases (currently truncated at 1433 chars)
- [ ] `sub_1405C5090` — Full spawn position logic (truncated)
- [ ] Speed param movement state machine functions (0x14037xxxx range)
- [ ] Arms param weapon action initializers (0x140DDxxxx range, 24+ functions)
- [ ] Chrsysparam runtime consumers (need to find which functions read .csyspm entries)
- [ ] Depiction table rendering consumers (how render_mode maps to shader selection)

These can be analyzed incrementally as each editor phase begins.
