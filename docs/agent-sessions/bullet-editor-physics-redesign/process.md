# Bullet Editor Physics Redesign — Process Log

## 2026-05-31

### Goal
Redesign TestEditor Bullet Editor page + calculation engine. Current Three.js
trajectory preview is wrong because the simulator uses invented physics constants
and the wrong param fields. Rebuild around real EXVS game logic reverse-engineered
from `vsac27_Release.exe`.

### IDA instance
- port 13337, pid 21868, binary `vsac27_Release.exe`,
  idb `E:\OBHK0.3_v27\vsac27_Release.exe.i64`, reachable + active.

### Diagnosis of current implementation (why preview != game)
File: `src/page/TestEditor/components/bullet-preview/TrajectorySimulator.ts`
1. Uses `entry.initialSpeed` as the main speed, but in the 124-entry sample it is
   nonzero in only 7/124. Most bullets would have zero motion.
2. Homing branch requires `homingStrength > 0`, but that field is 0 in all 124
   entries -> homing never triggers. Real homing is driven by `homing_type`,
   `turn_rate`, `tracking_angle`, `homing_range`, etc.
3. ~520 lines of dead code keyed on IDs 513-595 (simulateBeam/Unique/Boomerang/
   Formation/AdvancedHoming/GravityAffected/Special/Spread). The file's own header
   says 513-595 are entity command IDs, NOT moveType values. Dead/misleading.
4. Magic constants with no game basis (orbitSpeed = speed*0.02, *0.01 nudges,
   corkRadius = speed*0.15, etc.).

### Authoritative field semantics
Source: `src-tauri/src/format/bulletparam.rs` BULLETPARAM_COMMAND_POOL
(data-verified against 432 files / 10681 entries). Key entries:
- 0x06E90346 move_type            [D:0~255] enum, 9 unique (0-7, 255 in sample)
- 0xAB606D9E initial_speed        [D:0~640]
- 0xEF44FC6B speed_acceleration   [D:-2~30]
- 0x4C55EA3D acceleration_value   [D:-360~3000]
- 0x7696F452 speed_scale          [D:0~2.0] multiplier
- 0x6481E0F7 speed_internal       [D:0~2147483646] 18 unique — likely hash/special, NOT velocity
- 0x74F469FA gravity_rate         [V:sub_140606BB0,sub_1405B5040] ballistic param [D:0~0.5]
- 0x90423264 turn_rate            [V:sub_140606BB0,sub_1405B5040] projectile turning speed [D:0~1000]
- 0x8DBD5433 homing_strength      [D:0~1.0] (all 0 in sample)
- 0x3CDF1516 homing_type          [D:0~3] enum, 4 types
- 0xAF2B7098 tracking_angle       [D:0~180] degrees
- 0x20FEDE31 homing_range         [D:0~10000]
- 0x67921CDD homing_duration      [D:0~10000] frames
- 0xB306BEE8 min_homing_distance  [D:0~360]
- 0xFF51E424 tracking_start_distance [D:0~1000]
- 0x52CA3B01 homing_start_distance [D:0~5000]
- 0xBA9B8F5D turn_acceleration    [D:0~15]
- 0x32ACABFB lifetime             [D:0~100000] frames
- 0x846DDC39 max_distance         [D:0~9000]
- 0x05D5D30D max_range            [D:0~10000]
- 0x7B4AA25E effective_range      [D:0~360]
- spawn/launch positioning angles handled by sub_1405C4400 (deg->rad).

Sample distribution (0x31A97FD4, 124 entries):
- moveType: {0:1, 1:1, 2:5, 3:5, 4:14, 5:36, 6:12, 7:13, 255:37}
- homingType: {0:77, 1:37, 2:8, 3:2}; bulletShape {0:108,1:12,3:4};
  collisionType {0:107,1:8,2:9}.

### Known ballistic helpers (from docs/ida-dumps, prior partial RE)
- sub_1405C42E0 BallisticAngleSolver — solves launch angle:
  gTerm = dist^2*gravity/(2*speed^2); disc = dist^2 - 4*gTerm*(dy+gTerm);
  angle = atan2(+-sqrt(disc)+dist, 2*gTerm); highArc clamp 1.5rad, lowArc 0.8rad.
- sub_140606BB0 GravityTargetOffset — raises target Y by tan(angle)*horizDist.
- sub_1405B5040 BallisticTrajectoryMidpoint — arc apex/midpoint for preview.
- sub_1405C4400 ComputeSpawnOffset — quaternion spawn offset (5 fields, 2 angular).
NOTE: the two markdown notes disagree on which hash (0x74F469FA vs 0x90423264) is
gravity vs speed. Must re-decompile to resolve. bulletparam.rs naming says
0x74F469FA=gravity_rate, 0x90423264=turn_rate, but the angle solver takes (speed,
gravity); turn_rate (0~1000) being "speed" fits the speed slot. To verify in IDA.

### CORE GAP
The 4 known functions are ballistic AIM helpers, not the per-frame projectile
integrator. The homing/straight/funnel per-frame update loop (the thing that makes
trajectories look right) has NOT been reverse-engineered yet. That is the next RE target.

### Prior sessions
- bullet-preview-workbench (2026-05-03): built UI workbench + heuristic simulator
  (no accurate physics). Files later renamed in test-editor-redesign (2026-05-11)
  to param-editors/bullet-editor/*.

### RE findings (verified live in IDA, port 13337)
- sub_1405C42E0 BallisticAngleSolver — decompiled, EXACT. signature
  (src, tgt, a3=SPEED, a4=GRAVITY, a5=highArc). gTerm = dist^2*gravity/(2*speed^2);
  disc = max(0, dist^2 - (dy+gTerm)*(gTerm*4)); angle = min(maxAngle,
  atan2(sign*sqrt(disc)+dist, 2*gTerm)); high arc maxAngle=1.5 sign=+1,
  low arc maxAngle=0.8 sign=-1. -> matches existing ballisticSolver.ts exactly.
- sub_140606BB0 GravityTargetOffset — reads hit_effect_hash(0x0D6A5CD5),
  gravity_rate(0x74F469FA), turn_rate(0x90423264); calls the solver with
  SPEED=turn_rate, GRAVITY=gravity_rate, arc flag = *(unit+...+620). Then
  target.y = tan(angle)*horizDist + unit.y. RESOLVES the prior note's hash swap:
  in ballistic aim, turn_rate occupies the SPEED slot, gravity_rate the GRAVITY slot.
- sub_14060A910 — aim-point resolver on the FIRING UNIT (offsets a1+11800/11928,
  a1[83]=pos). Applies gravity offset for ballistic shots. Not the bullet integrator.
- sub_14043C200 (0x2128) — CONFIRMED: MSC script QUERY dispatcher, a giant switch on
  command id (a4[0]) returning one uint. IDs 512/513..595/0x10000/0x10001 are MSC
  syscalls querying game state (ammo 532/534, dist-to-target 571, angle-to-target
  552, landing predict 565/566, target velocity 569/570, ballistic-reach test 573,
  lead-intercept 576/577 using target_vel*frames). Uses FNV-1a (0xCBF29CE484222325 /
  0x100000001B3) handle lookup. NOT bullet physics. -> the old TrajectorySimulator's
  513-595 "move type" physics is entirely bogus; DELETE it in the rewrite.
  (Cross-ref: docs/exvs-msc-syscall-*.md.)

### Open RE target (keystone)
The per-frame projectile integrator (velocity init from initial_speed; homing steer
via turn_rate/tracking_angle/homing_type/homing_range/distances; accel via
acceleration_value/speed_acceleration; lifetime/max_distance cutoff) is NOT yet
located. Lead: sub_1405C5090 (0x8a9, calls ComputeSpawnOffset sub_1405C4400) is the
likely bullet spawn/init; from the spawned entity vtable, find its update/tick method.
Also sub_14066E550 / sub_14066E7F0 call ComputeSpawnOffset.

### Domain knowledge from user — LOCK STATES gate induction (homing)
EXVS induction (誘導) depends on the lock state at fire time. The simulator AND the
editor UI must model lock state as a first-class input:
- Red lock (红锁): target within induction range -> induction ACTIVE, bullets track.
- Green lock (绿锁): locked but BEYOND induction range -> NO induction; bullet keeps
  its launch-direction inertia and flies straight ("no induction inertia").
- Yellow lock (黄锁): not the locked target / forced lock -> NO induction.
- Blue lock (蓝锁): special state (e.g. awakening/specific mechanics).
Induction distance threshold is expected to come from per-bullet fields
(homing_range 0x20FEDE31, effective_range 0x7B4AA25E, tracking_start_distance
0xFF51E424, homing_start_distance 0x52CA3B01, min_homing_distance 0xB306BEE8) and/or
the unit's red-lock distance (see damageCalculation.getLockDistance / sub_1405F8600).
The per-frame integrator must check lock state + distance gating before applying any
turn toward the target. CONFIRM exact thresholds during integrator RE.

### ARCHITECTURE BREAKTHROUGH (verified live + docs/unit-task-automata-decompiled-analysis.md)
The projectile IS a CUnitTaskAutomata entity (~13616 bytes). Per-frame movement is NOT a
move_type switch; it is component/script driven:
- OnUpdate (vtable slot 12, sub_140673170): PreAction -> IsAlive -> PhysicsBody::Step
  (sub_14068D520) -> UpdateCollisionGeometry -> PhysicsBody::Recalculate (sub_140672A60)
  -> ActionController::ProcessActions (sub_14062A840) -> PostMotion -> HitTest -> Cleanup.
- PhysicsBody::Step (sub_14068D520) = thin wrapper applying pending force (+176, knockback).
- PhysicsBody::Recalculate -> sub_14068AF50 (frame counter) -> sub_14068A6F0 = a MUTEXED
  PHYSICS TASK SCHEDULER dispatching through vtable[40]/[32]/[88]. The actual pos+=vel
  integration lives inside data-driven physics tasks (another vtable indirection layer).
- Steering / homing is applied by ActionController (the MSC action VM) per the unit's
  bullet_action_hash / behavior_type script — confirms why bulletparam.rs found turn_rate
  only in the ballistic AIM helpers (the per-frame steer is script-driven, reads fields via
  the generic FNV-1a hash lookup which static xref analysis misses).
- Object layout: world position at entity+1216 (a1[76]); pPhysicsBody at +13480; params at
  +13472. Lifetime counter at pLifetimeData+152 (negative = active).
Lock bands (sub_1405F8600 LockDistanceGetter): unit reads 5 distance thresholds by hash —
redLock 0x08ECF0BE, midLock 0x9271BEB4, farLock 0xE69AD372, maxLock 0x78903491,
greenLock 0x0F8134A7. Red/green lock = distance vs these per-unit thresholds; induction
(homing) is gated by lock band.

### DECISION: stop the IDA descent (diminishing returns)
Bit-exact per-frame integration is dispatched through a generic mutexed task scheduler +
vtable indirection, and homing lives in the MSC action VM — extracting it bit-exactly is a
multi-day RE effort, the wrong abstraction for a trajectory PREVIEW. We have enough verified
truth to build a faithful, RE-grounded engine. Remaining single unknown: the turn_rate
(0~1000) -> angular-velocity (deg/frame) scaling and accel unit interpretation
(acceleration_value -360~3000 likely per-second; speed_acceleration -2~30 likely per-frame).
Handle these as ONE explicit, documented calibration constant each (NOT scattered magic),
with sensible defaults; refine via in-game capture or deeper action-VM RE later.

### Engine model to implement (RE-grounded)
- Fixed 60fps step; world units 1:1 with param distances.
- Spawn direction from launch_angle_horizontal/elevation_angle (+ ComputeSpawnOffset angular
  offsets + optional random spread via spread_angle). Initial speed = initial_speed.
- moveType 1 (throw) / gravity_rate>0: use ballisticAngleSolver (already ported) to set the
  launch pitch; integrate with gravity_rate per frame.
- Homing: gated by lockState (red=on; green/yellow=off; blue=special) AND distance band AND
  homing_type!=0 AND frame within homing_duration AND dist in [min_homing_distance,
  homing_range/tracking_start_distance]; each frame rotate velocity toward (lead) target by
  <= turnRateDegPerFrame, clamped to tracking_angle cone.
- Per frame: speed += accel terms; pos += vel; cutoffs lifetime / max_distance / effective_range.
- Delete all dead 513-595 code from TrajectorySimulator.ts.

### IDA functions catalog (for later deep RE if needed)
- sub_140673170 base OnUpdate; sub_14066D910 EXVS2 OnUpdate wrapper; sub_1406A5B30 FreeFall
  OnUpdate; sub_14068D520 PhysicsBody::Step; sub_140672A60 Recalculate -> sub_14068AF50 ->
  sub_14068A6F0 (task scheduler); sub_1406710E0 MotionCtrl::Update; sub_14062A840
  ActionController::ProcessActions; sub_1405F8600 LockDistanceGetter; sub_1405C5090 spawn
  orientation+spread; sub_1405C4400 ComputeSpawnOffset; ballistic: sub_1405C42E0/140606BB0/
  1405B5040. CanHitTarget slot54 sub_1406A5980 / ShouldCancel slot55 sub_1406A57D0 use
  hitRange = sub_1405F8720(damageData+215560, bulletParam[+10768]) vs dist.

### Velocity-source investigation (data-verified) -> design decision
Tested where bullet base SPEED comes from (the #1 accuracy issue):
- initial_speed nonzero in only 7/124 -> NOT the general speed source.
- speed_internal has only 4 distinct values in the sample: 0(x10), 1(x74), 10000(x4),
  1000000(x36) -> a MODE/SCALE enum, NOT a velocity and NOT a table index.
- speedparam.bin header: entryCount=2, cmdCount=74, entrySize=304 -> 2 entries only
  (character movement tiers), NOT a per-bullet speed table. So speed_internal does not
  index it.
- Many bullets (e.g. moveType 255) have initial_speed=0 AND acceleration_value=0 ->
  their motion cannot come from bulletparam at all.
CONCLUSION: bulletparam does NOT fully determine the trajectory. The BASE launch
velocity is supplied by the firing weapon/action (armsparam + MSC/UnitTask action),
NOT stored in bulletparam. bulletparam carries MODIFIERS: acceleration_value,
speed_acceleration, gravity_rate, homing_*, turn_rate, tracking_*, lifetime, ranges,
hitbox, blast.

DESIGN DECISION (no guessing, surfaced in UI): the Bullet Editor previews how the
bulletparam FIELDS shape a trajectory. Base launch speed is exposed as an explicit
SCENARIO input (`launchSpeed`, units/frame; default = initial_speed when nonzero, else a
documented default), and every bulletparam field is applied faithfully as a modifier on
top. This is honest (no fabricated hidden field) and matches how the data actually works.
speed_internal is surfaced as a read-only mode/scale indicator, not used as velocity.

### Engine inputs (final)
Scenario gains: lockState (red/green/yellow/blue), launchSpeed (base units/frame),
and the lock distance bands optionally. Per-frame model as in "Engine model" above,
with induction gated by lockState (red/blue=on, green/yellow=off).

### Implementation complete (2026-05-31)
Phase 1 (engine) + Phase 2 (lock-state/induction visualization) done; tsc clean for all
touched files (TrajectorySimulator, bulletPreviewTypes, ScenarioPanel, BulletEditorStore,
BulletEditorView, BulletTrajectoryCanvas). Pre-existing unrelated tsc errors remain in
SceneEdit (DdsFormat) and ssbh-model-preview (../../types) — out of scope.

Files changed:
- src/page/TestEditor/components/bullet-preview/bulletPreviewTypes.ts (lock state, launchSpeed)
- src/page/TestEditor/components/bullet-preview/TrajectorySimulator.ts (full RE-grounded rewrite)
- src/page/TestEditor/components/param-editors/bullet-editor/ScenarioPanel.tsx (lock + speed UI)
- src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorStore.ts (launchSpeed sync)
- src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorView.tsx (induction badge)
- src/page/TestEditor/components/param-editors/bullet-editor/BulletTrajectoryCanvas.tsx (induction color + range ring)

Decision recap honoring "no guessing": base launch speed is a surfaced scenario input
(not a fabricated field); the only unverified scalings (turn_rate->deg/frame, accel units)
are isolated, documented CALIBRATION constants, not scattered magic. Deeper bit-exact RE is
catalogued above (sub_14068A6F0 scheduler + MSC action VM) for a future pass.
