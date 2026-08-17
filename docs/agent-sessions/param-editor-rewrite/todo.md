# Param Editor Rewrite — Implementation Plan

> **STATUS (2026-07-26 audit + wiring pass):** Phase 1 library shipped as `src/lib/gameAlgorithms/`
> (tested modules; some planned filenames were superseded — see notes below). Phase 2.1's
> 83-move-type premise was RE-invalidated (`moveTypes.ts:8`: 513-595 are entity command IDs;
> real move types are 0-7/255). Wired this pass: 2.3 cross-references (`BulletCrossRefPanel`),
> 2.4 corrected validation (`bulletValidation.ts`), 3.1-3.3 character visualizers
> (`AttackTypeBreakdownTable` / `GutsBandChart` / `LockRangeRings`), 4.1 action/reload timeline
> (`ActionReloadTimelinePanel`). `damageCalculation.ts` hash maps were synced to the canonical
> CHARACTERPARAM_COMMAND_POOL (previous maps contained audit-rejected lock hashes).
> "Further IDA Analysis" section remains blocked: no live IDA instance.

## Overview

Rewrite all 9 param editors to use game-accurate algorithms reverse-engineered from
`vsac27_Release.exe`. Each editor will simulate the actual game behavior rather than
being a generic field editor.

See `process.md` for the full reverse engineering analysis.

---

## Phase 1: Shared Infrastructure

### 1.1 Game Algorithm Library (`src/lib/gameAlgorithms/`)

Create a TypeScript library implementing the core game algorithms:

- [ ] `paramSystem.ts` — FNV-1a hash lookup, command descriptor binary search (mirrors LookupCommandDescriptorByHash) → not shipped under this name; hash/descriptor lookup lives in the Rust command pools (`src-tauri/src/format/*`)
- [x] `ballisticSolver.ts` — Ballistic angle solver (sub_1405C42E0), trajectory calculator (sub_1405B5040) → shipped + tested
- [ ] `spawnPosition.ts` — Deg→rad conversion, 3D spawn offset (sub_1405C4400) → not shipped under this name; see `vec3.ts` / `shootingLoop.ts`
- [x] `damageCalculation.ts` — Damage dispatcher, cost dispatcher, guts correction (sub_1405F9010/9180/8E70) → shipped + tested; hash maps synced to canonical pool 2026-07-26
- [ ] `movementPhysics.ts` — Speed/acceleration/gravity formulas from movement state machine → superseded by `movementParamSemantics.ts`
- [x] `reloadSystem.ts` — 4 reload types (standard, per-shot, overheat, charge) → shipped + tested
- [x] `collisionGeometry.ts` — Hit volume computation from bone + offset + scale → shipped + tested

### 1.2 Cross-Param Reference Resolver

- [x] `crossParamResolver.ts` — Resolves hash references between param types: → shipped + tested; wired into UI 2026-07-26 (`BulletCrossRefPanel`)
  - bulletparam.interaction_hash → interactionid entry
  - bulletparam.hitgroup_hash → hitgroupiddef entry
  - bulletparam.bullet_resource_hash → projectile_depiction_table entry
  - bulletparam.child_bullet_hash → another bulletparam entry

### 1.3 Shared Editor Components

- [x] `GameAccuratePropertyPanel.tsx` — Property panel that shows both raw values AND computed game values → shipped
- [x] `CrossReferencePanel.tsx` — Shows linked entries from other param files → shipped; wired 2026-07-26 with loadedKinds/navigableKinds states
- [x] `TimelineVisualizer.tsx` — Frame-based timeline (startup → active → recovery → cooldown) → shipped; wired 2026-07-26 (`ActionReloadTimelinePanel`)

---

## Phase 2: bulletparam Editor (Priority: Highest)

### 2.1 Move Type Simulation Engine

> **SUPERSEDED (RE-invalidated):** 513-595 are entity command IDs, not move types
> (`src/lib/gameAlgorithms/moveTypes.ts:8`). Real move types are 0-7/255; the
> TrajectorySimulator was rewritten RE-grounded (2026-05-31) and the dead 513-595
> code deleted. Do not implement the items below as written.

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

- [x] Load and display linked interactionid entry (from interaction_hash) → 2026-07-26 `BulletCrossRefPanel` + sibling file slots in `BulletEditorStore`
- [x] Load and display linked hitgroupiddef entry (from hitgroup_hash) → same
- [x] Load and display linked depiction entry (from bullet_resource_hash) → same
- [x] Show child_bullet_hash chain (recursive bullet spawning) → `followChildBulletChain` with depth/hash/move-type + Go-to navigation

### 2.4 Validation with Game Constants

- [ ] Validate initial_speed against game engine clamp (max 640 from data) → REJECTED 2026-07-26: no evidence for a 640 clamp in process.md; the pre-existing unsubstantiated `speed > 640` store error was removed and a test pins no speed message
- [x] Validate move_type against known valid range (513–595) → implemented CORRECTED 2026-07-26 in `bulletValidation.ts`: valid set is {0-7, 255}; 513-595 are entity command IDs (tests pin 513/560/595 as unknown)
- [ ] Validate homing parameters against game constraints
- [ ] Show warnings for PHANTOM fields (not used in any real file)

---

## Phase 3: characterparam Editor (Priority: High)

### 3.1 Damage/Cost Calculator

- [x] Implement full DamageDispatcher with all 19 attack types → `damageCalculation.ts` (types 16/17 have no field mapping; rendered as explicit "unavailable")
- [x] Implement full CostDispatcher with all 19 attack types (including case 18 factor) → incl. case-18 character_list factor input (ceil semantics)
- [x] Interactive table: select attack type → show damage AND cost simultaneously → 2026-07-26 `AttackTypeBreakdownTable.tsx`
- [x] Show correction_rate multiplication for cases 4/5/9/12 → correction-rate slider with "x corr" marker

### 3.2 Guts System Visualizer

- [x] Implement 10-band HP correction system (5% per band, >50% = 1.0) → `lowDurabilityIncomingDamageTable` (strict `>` band selection mirrors sub_1405F8E70)
- [x] Visual: HP bar with color-coded bands showing correction multiplier per band → 2026-07-26 `GutsBandChart.tsx` (missing bands render explicit "unavailable")
- [x] Interactive: drag HP slider, see effective damage multiplier in real-time → HP slider highlights active band + multiplier readout
- [ ] Show actual damage after guts correction for each attack type

### 3.3 Lock Distance Visualizer

- [x] Implement 6-tier lock distance system → `LOCK_DISTANCE_TYPES` / `getLockDistance`; hashes synced to canonical pool (previous four lock hashes were audit-rejected values)
- [x] Visual: concentric circles showing red/green/mid/far/max lock ranges → 2026-07-26 `LockRangeRings.tsx`; labels are neutral "Slot 0-4 / Default" because slot→HUD-color mapping is unproven per the lock audit
- [x] Show lock-on FOV angle overlay → `lockOnFovAngle` wedge overlay when field present

### 3.4 Stat Overview

- [x] Radar chart with game-meaningful categories (not raw field names): → shipped earlier (`StatRadarChart`)
  - Offense: melee_damage, ranged_damage, assist_damage
  - Defense: max_hp, guard_damage_rate, barrier_damage_rate
  - Mobility: movement_speed_base, boost_dash_speed_rate, step_speed_rate
  - Range: red_lock_distance (provisional IDA), green_lock_distance; **in-game 红锁 (2026-07-11):** lock_on_distance_max + alert_range_distance — see docs/characterparam-field-notes.md
- [ ] Unit cost breakdown (base + per-type costs)

---

## Phase 4: armsparam Editor (Priority: High)

### 4.1 Action Timeline Visualizer

- [x] Full frame-accurate timeline: startup → active → recovery → cooldown → 2026-07-26 `ActionReloadTimelinePanel.tsx` (`getActionTimeline` → `TimelineVisualizer` + `FrameTickRuler`)
- [x] Show reload timing overlay (reload_start_frame, reload_time_total, reload_per_shot_frame) → raw hash-labeled reload timeline (`getReloadTimeline`), preserving the 2026-06-19 evidence-boundary decision
- [ ] Show charge frame overlay for charge weapons → `fullChargeFrame` shown as raw duration field only, not a timeline overlay yet
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

> Shipped: `chrsys-editor/ChrSysEditorView.tsx` + `HashCategoryPanel.tsx` + `ChrSysPropertyPanel.tsx`.

### 9.1 Hash-Value Table View

- [ ] Clean table with hash → 4 value columns
- [ ] Known hash labeling (from game analysis)
- [ ] Value interpretation (u32/i32/f32 based on context)

---

## Phase 10: projectile_depiction_table Editor (Priority: Low)

> Shipped: `depiction-editor/DepictionEditorView.tsx` + `ProjectilePreview3D.tsx` + `DepictionPropertyPanel.tsx`.

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

- [x] ~~`sub_14043C200` — Full decompilation of all 83 move type cases~~ → **R (premise rejected)**:
      sub_14043C200 is an MSC query syscall dispatcher, not bullet physics, and 513-595 are
      entity command IDs, not move types (`src/lib/gameAlgorithms/moveTypes.ts:8`). Corroborated
      2026-07-26: moveType hash 0x06E90346 has NO physics dispatcher at any of its 16 immediate
      sites (see `docs/agent-sessions/bullet-editor-physics-redesign/process.md`). Nothing to
      decompile; item closed as rejected.
- [x] `sub_1405C5090` — Full spawn position logic (truncated) → CLOSED 2026-07-26, process.md
      "Item 1": it produces a full 4x4 world spawn TRANSFORM (orientation + position), not a
      point; base-transform select at 0x1405C5105..0x1405C5195 reads hashes 0xEDD1C108 /
      0xD32D39ED from table singleton+0xB58
- [ ] Speed param movement state machine functions (0x14037xxxx range) → NOT STARTED: the RE pass
      was killed by a session-quota error immediately after opening this item. Next step: enter
      via SPEEDPARAM_COMMAND_POOL hash immediates (`src-tauri/src/format/speedparam.rs`), treating
      its `[V:func_*]` / `[D:*]` annotations as hypotheses
- [ ] Arms param weapon action initializers (0x140DDxxxx range, 24+ functions) → NOT STARTED.
      Known anchor from Item 2: the weapon action table lives at runtime slot singleton+0x268E60
- [x] Chrsysparam runtime consumers (need to find which functions read .csyspm entries) → CLOSED
      2026-07-26, process.md "Item 3": magic/version checks sub_14066C890 / sub_14066C880, loaded
      by character-instance init sub_140635B30, handle stored at instance+215592 (0x34A28).
      Also surfaced an R-grade data-loss defect in `src-tauri/src/format/chrsysparam.rs`, now
      guarded (see the follow-up section in process.md)
- [x] Depiction table rendering consumers (how render_mode maps to shader selection) → CLOSED
      2026-07-26, process.md "Item 2": getter sub_14066DB70 reads hash 0xBA4BBA9D from table
      singleton+0xC0; sole consumer is the depiction factory sub_140689D60

These can be analyzed incrementally as each editor phase begins.
