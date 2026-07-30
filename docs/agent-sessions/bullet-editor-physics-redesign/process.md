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

## 2026-07-26 Phase 0 closure session (IDA instance ida-50652, OB v27, base 0x140000000)

Method: find_bytes on little-endian hash immediates from the bulletparam command pool,
lookup_funcs to map hits to functions, then targeted decompile/disasm of known addresses
only. No whole-DB searches. Evidence grades A/B/C/U/S/R per project convention.

### Architecture result (grade A): movement is CCmdAction strategy classes, with RTTI names

The binary contains full MSVC RTTI. Bullet movement behaviors are named classes in
VDK::GAM / EXVS2 namespaces, composed into per-bullet action programs
(CCmdActionGroup_Series) by builder functions. Verified class names (RTTI type
descriptor strings, .data):
- CCmdAction_StandardHomingMoveSet (vftable 0x1415d6ef8) : the standard bullet mover
- CCmdAction_MoveTransAsMortar (vftable 0x1415d7c20) : ballistic mortar mover
- CCmdAction_MoveAhead / CCmdAction_MoveAheadAccel / CCmdAction_MoveStraightAbstract
- CCmdAction_FunnelHomingMove family (FunnelHomingMoveBase, FunnelHomingMoveToTarget,
  FunnelTargetMagnet, FunnelSwarm_*, plus many EXVS2 unit-specific subclasses)
- CCmdAction_MoveMagnet* family (MoveMagnetToTarget, MoveMagnetToParentBone, ...)
- CCmdAction_BulletFlyFunctionAbstract / CCmdAction_BulletFlyFunction_ForBullet
- CCmdAction_ShotBullet / ShotBulletIfValidate (firing side)
Builder example sub_140EEC7D0 (0x5df bytes) constructs the STANDARD bullet program:
StandardHomingMoveSet + WaitForLifeTimeEnd + SendMessageProjectileOrder + WaitByFrame +
SetIntersectEnableMode(0) + TerminateSeriesEnd + SetInteractEnableModeAttack(0) +
SetInteractEnableModeReceive(0) + SetShellVisible(0) + WaitByFrame(1).
Builder sub_140EA9300 constructs a unit-specific mortar program (MoveTransAsMortar +
CCmdAction_057BUILDD_002ZEROMR_001_WaitUntilHighestPoint), proving unit code picks the
mover class, not a moveType switch.
Note: the 0x142b3xxxx "data xrefs" on these functions are .pdata RUNTIME_FUNCTION
records (begin/end/unwind RVA triplets), not vtables. Real vtables live at 0x1415dxxxx.

### Item 1 CLOSED (grade A): per-frame projectile update / homing integrator

sub_1406AA110 (0x1406AA110, size 0x6ed) is a per-frame projectile motion update.
Called by:
- sub_1406AB580 = CCmdAction_MoveTransAsMortar vtable slot 12 (Update), slot address
  0x1415d7c80 inside vftable 0x1415d7c20. It loads velocity from *(entity+10696)+16,
  calls the integrator, stores velocity back.
- sub_140DD71D0 = Update slot of two EXVS2 bank-B mover classes (vftables 0x1415d23a8
  and 0x1415d25d0), which pre-feeds a speed ramp before delegating (see item 4).

Hash immediates confirmed in raw disasm (not only decompiler float-literal decode):
  0x1406aa169 7B4AA25E effective_range   -> v10 = (val * 0.5) * pi / 180
  0x1406aa1b3 AF2B7098 tracking_angle    -> v12 = val * pi / 180
  0x1406aa1eb 7696F452 speed_scale       -> drop-rate MIN clamp
  0x1406aa20f BA9B8F5D turn_acceleration -> drop-rate MAX clamp
  0x1406aa233 74F469FA gravity_rate      -> default drop rate when not homing
  0x1406aa257 8DBD5433 homing_strength   -> drop-rate slew limit per update

Per-update algorithm (decompiled, addresses in comments):
1. desiredYaw = atan2f(target.z - pos.z, target.x - pos.x)  (0x1406aa2ac; target from
   *(entity+10688)+32, pos = entity+96). Yaw stored at cmdAction+40, wrapped +-2pi.
2. Homing gate = sub_1406A9A10(...) AND sign bit set at *(paramBlock+0x18) (0x1406aa322)
   AND |yawError| <= effective_range/2 in radians (0x1406aa336..).
3. If homing: yawStep = clamp(yawError, -tracking_angle_rad, +tracking_angle_rad)
   (0x1406aa34b..0x1406aa35b); horizontal speed magnitude preserved, velocity xz rotated
   to newYaw (0x1406aa3a8/0x1406aa3c2). Vertical: requiredDrop
   v34 = 2*((T*vel.y) - dy)/T^2 with T = horizDistToTarget / horizSpeed (0x1406aa46e),
   target = clamp(v34, speed_scale, turn_acceleration), step toward target limited to
   +-homing_strength per update (0x1406aa49c..0x1406aa4b0), accumulated at cmdAction+44.
4. If not homing: drop target = (lastRequired >= speed_scale ? lastRequired :
   gravity_rate), same clamp and slew (0x1406aa4c6..0x1406aa51c).
5. pos += velocity (0x1406aa695, with NaN guard), orientation basis rebuilt from
   velocity direction (0x1406aa53f..0x1406aa77e), traveledDistance at
   *(*(entity+10752)+32) += |velocity| (0x1406aa7ae), then velocity.y -= drop
   (0x1406aa7c6..0x1406aa7cf).

Consequences (all grade A within this consumer):
- tracking_angle (0xAF2B7098) is the yaw turn step per update in DEGREES, not a cone.
- effective_range (0x7B4AA25E) is the homing engage cone FULL angle in degrees
  (halved to a half-angle), not a distance.
- gravity_rate / homing_strength / speed_scale / turn_acceleration form one
  "drop rate controller" quartet: rate targets gravity_rate (or the exact-hit solve
  while homing), is clamped to [speed_scale, turn_acceleration], and may change by at
  most homing_strength per update. Units: world units per frame per frame.
- Old CALIBRATION assumption "turn_rate = deg/frame yaw step" is REJECTED (grade R):
  turn_rate does not appear in this integrator at all; it is a speed-chain field.

Homing gate sub_1406A9A10 (0x1406A9A10, size 0x195), grade A, all reads verified:
  0x1406a9a3a 0x52CA3B01 ("homing_start_distance") -> float v21
  0x1406a9a60 0x4B492895 ("pierce_count")          -> int v23
  0x1406a9a86 0xF33F8630 ("duration_frame")        -> int v22
  0x1406a9aac 0x2E1E75E5 ("hit_effect_scale")      -> float v24
  0x1406a9ad2 0x20FEDE31 homing_range              -> float v25[0]
Logic (age = *(paramBlock+160), traveled = *(motionBlock+16 arg a3, field +16 = the
+32 accumulator written by sub_1406AA110), a5 = persistent enable flag byte):
  if (age < 8) return 1;                      // unconditional grace period
  if (!*a5) return 0;                         // once off, stays off
  if (0x52CA3B01 > 0 && distSq(pos, target) <= val^2) { *a5 = 0; return 0; }
  if (0xF33F8630 > 0) { if (age < 0x4B492895) return 0;
                        if (age > 0xF33F8630) { *a5 = 0; return 0; } }
  if (0x2E1E75E5 > 0) { if (traveled < 0x2E1E75E5) return 0;
                        if (traveled >= homing_range) { *a5 = 0; return 0; } }
  return 1;
Roles in this consumer (R against pool names where they conflict):
- 0x52CA3B01 = terminal blind radius: homing shuts off permanently once within this
  DISTANCE TO TARGET (name says "start", behavior is stop). Grade A.
- 0x4B492895 = homing start FRAME (not a pierce count here). Grade A in this consumer.
- 0xF33F8630 = homing end FRAME (window active only when > 0). Grade A.
- 0x2E1E75E5 = minimum traveled distance before homing engages (not an effect scale
  here). Grade A in this consumer.
- 0x20FEDE31 homing_range = maximum TRAVELED distance for homing (not distance to
  target). Grade A: compared against the integrator's traveled-distance accumulator.

### Item 2 CLOSED (grade A per site, B for the universal negative): move_type dispatch

There is NO moveType switch that selects movement physics. All code-section immediate
consumers of 0x06E90346 were enumerated via find_bytes ("46 03 E9 06", 16 hits, 7 in
low .text + 9 in high .text banks) and each examined:
- 0x1406106fa in sub_1406101B0 (bullet fire-request builder, see item 5 notes): if
  move_type != 255, stores a unit id at record+180 and increments a per-moveType
  counter at (*(unit+11864))[640 + 4*moveType]. Bookkeeping only.
- sub_14060AB30: trivial getter (returns move_type of current bullet context, 255 if
  none). Callers sub_140F33C50 / sub_140F33D40 / sub_140F33DC0 (not yet decompiled).
- sub_14068D580 (0x14068d5a8) and sub_14068D750 (0x14068d772): network replication
  emitters (544-byte message slots tagged 0x2000000F / 0x2000000E). move_type == 255
  SKIPS replication; otherwise moveType is a message payload field.
- sub_1406A5E10 (0x1406a5edd): replication message 0x2000000C carrying hit_effect_hash
  + move_type. Payload only.
- sub_140637AD0 / sub_140637F10: active-bullet counters filtering by hit_effect_hash
  and optionally move_type; moveType argument 255 acts as a wildcard.
- sub_140DE21C0 (0x140de2207): per-frame helper that counts same-type bullets via
  sub_140637F10 and caches the count at entity+13668.
- sub_140E2E5C0 (0x140e2e612): OnUpdate wrapper (tail-calls sub_1406A5B30 FreeFall
  OnUpdate). Maps moveType through sub_140EEDC70 = moveType + 7 into a per-unit
  bitset<40> at (*(unit+11864))+80; when that bit is set, configures effect channels
  reading 0x64C1F4FF collision_height, 0xD8F283FB secondary_effect_hash, 0xA12E3B5F
  beam_type_hash, 0x46961658 muzzle_flash_hash, 0x319126CE inherit_speed_hash.
  So move_type selects a per-unit EFFECT flag bit, not physics. (moveType 255 would
  throw std::out_of_range here, so this path is only reached for real moveTypes.)
CONCLUSION: move_type = a bullet CATEGORY TAG consumed by counters, network
replication gating (255 = local-only/no counter), MSC-visible bullet-count queries,
and a per-unit effect bitset (bit = moveType + 7). Movement physics is selected by
which CCmdAction mover class the unit's action program instantiates (script side:
bullet_action_hash 0x4D6BF281 / behavior_type 0xA36593AD), consistent with the
2026-05-31 architecture finding. Grade A for every examined site; the universal
negative ("no physics consumer anywhere") is grade B until sub_140F33C50/D40/DC0
(callers of the getter) are also examined. Simulator impact: keep treating moveType
as a category label for preview presets, never as a physics switch.

### Item 3: homing fields, per-field consumer + arithmetic role

- turn_rate 0x90423264. THREE roles, none of them angular:
  (a) SPEED slot of the ballistic angle solver (sub_140606BB0 / sub_1405B5040, item 5).
  (b) sub_140DD71D0 (EXVS2 mortar Update, 0x140dd7208): per-update accumulator
      *(v1+40) += turn_rate, capped by fminf(.., max_range 0x05D5D30D at 0x140dd7258,
      value <= 0 treated as 1.0). Reads as arc progress: turn_rate = units advanced
      along the mortar trajectory per update, max_range = arc cap. Grade B (the
      reader of v1+40 inside the mortar path was not individually decompiled).
  (c) BASE term of the standard speed formula in sub_1406A7050 (item 4). Grade A.
  Verdict: turn_rate is the projectile SPEED parameter (units/frame), exactly as the
  ballistic solver's speed slot implied. Grade A for "speed-domain, not turn-domain".
- tracking_angle 0xAF2B7098 = yaw steer step per update, degrees (deg->rad conversion
  at 0x1406aa1d4/0x1406aa1d9 and again at 0x1406aee9c/0x1406aeea1). Two independent
  consumers (sub_1406AA110 mortar homing, sub_1406AE000 funnel steer via
  sub_1406AEE00) use it as the clamp on yaw error correction per update. Grade A.
- homing_type 0x3CDF1516. Consumers:
  (a) sub_1405C4F50 (0x1405c4f75): spawn orientation source selector.
      0 -> default matrix (a3); 1 -> alternate matrix (a5, aim-at-target);
      2 or 3 -> compute via sub_1405C4820(pos, ctx, flag = (type == 2)) with fallback
      to a5. Grade B (a3/a5 matrix identities not yet named).
  (b) sub_1406101B0 fire-request builder (0x1406105d9): homing_type in {2,3} plus a
      position test sub_1405C5940 clears a spawn flag byte before sub_1405C5090.
      Grade B.
  Verdict: homing_type shapes SPAWN AIMING mode, not the per-frame steer. The
  per-frame homing on/off is the gate of sub_1406A9A10 plus lock state. Grade B.
- homing_range 0x20FEDE31 = max traveled distance for homing (gate, grade A above).
- homing_duration 0x67921CDD: getter sub_14068DCE0 (hash at 0x14068dcff). Consumer
  sub_1411A8BC0 builds CCmdAction_WaitForOrderedReleaseSticks + CCmdAction_WaitByFrame
  (frames = homing_duration) in a funnel action program: a FRAME COUNT used as an
  action-phase duration. Also read twice inside shared vtable method sub_14068E280
  (0x14068e4b4 / 0x14068e552, not yet decompiled). Grade B: frames confirmed, exact
  phase semantics per program still open at sub_14068E280.
- min_homing_distance 0xB306BEE8: in sub_1406AEE00 (read at 0x1406aeee9) the value is
  multiplied by 0.5 and converted deg->rad (0x1406aef7d..0x1406aefa0) and passed to
  sub_1406AE000 as the PITCH cone half-angle (steer aborts when |pitchError| > it).
  In the same call, homing_angle 0x9375A247 (read at 0x1406aef0c) deg->rad is the max
  PITCH step per update, and effective_range*0.5 is the YAW cone. Grade A for the
  angular role in this consumer; grade R against the pool name "min_homing_distance"
  (data range 0..360 supports degrees). No distance-role consumer found this session.
- tracking_start_distance 0xFF51E424: single low-bank consumer sub_1406A7050 (read at
  0x1406a710b): it is the UPPER clamp of the computed speed (fminf(val, speed)).
  Grade A for "speed max" in this consumer; grade R against the name. The many high
  .text hits (0x140dd87e2 etc.) are additional bank-B consumers, unexamined.
- Steer enable oddity: sub_1406AED10 (funnel steer wrapper, 0x1406aed3a) reads
  0x397CE80D ("collision_type") and returns without steering when it is 0; value 1
  selects the sub_1406AE2C0 path, else sub_1406AE000 (branch in sub_1406AEE00 at
  0x1406aef26). So 0x397CE80D acts as a steer-mode selector {0 off, 1 mode A,
  2 mode B} for funnel movers. Grade B; R-warning against the "collision_type" name.
- First-8-frames boost: sub_1406AED10 passes step multiplier 1.25 (0x3FA00000) while
  age < 8, else 1.0 (0x1406aed9e..0x1406aeda8). Grade A (constant is in the code).

### Item 4: speed chain resolved

THE SPEED FORMULA: sub_1406A7050 (0x1406A7050, size 0x12d), grade A. Reads:
  0x1406a7073 0x59332F69 ("hit_interval_frame")       -> startFrame (int)
  0x1406a7099 0x90423264 turn_rate                    -> base
  0x1406a70bf 0xEF44FC6B speed_acceleration           -> gain
  0x1406a70e5 0x28BA5665 ("visual_scale")             -> speedMin
  0x1406a710b 0xFF51E424 ("tracking_start_distance")  -> speedMax
  speed(age) = clamp(baseIn + turn_rate
                     + speed_acceleration * max(0, age - startFrame),
                     speedMin, speedMax)
Caller sub_1406ABD30 = CCmdAction_StandardHomingMoveSet vtable slot 12 (Update; slot
address 0x1415d6f58 in vftable 0x1415d6ef8): every update it increments the age
counter (sub_140695B60: ++*(a1+16)), runs the steer pass (sub_1406A9CE0 ->
sub_1406A9D60, and sub_1406AEC90 -> sub_1406AED10/sub_1406AEE00), then stores the
formula result to *(*(entity+10696)+32) and *(*(entity+10752)+36) (speed scalar the
physics body consumes). So for the STANDARD bullet:
- turn_rate = base speed in world units per update. Grade A.
- speed_acceleration = linear speed gain per update, starting at frame 0x59332F69.
  Grade A for role and per-update units.
- 0x28BA5665 / 0xFF51E424 = min / max speed clamps in this formula. Grade A in this
  consumer; both pool names are wrong here (R notes).
TURN-RATE RAMP TWIN: sub_1406A6F70 (0x1406A6F70, size 0xd9), grade A for the formula:
  0x1406a6f8b 0x74F469FA gravity_rate      -> base
  0x1406a6fb1 0x8DBD5433 homing_strength   -> gain per update
  0x1406a6fd7 0x7696F452 speed_scale       -> min clamp
  0x1406a6ffd 0xBA9B8F5D turn_acceleration -> max clamp
  value(age) = clamp(gravity_rate + homing_strength * age, speed_scale,
                     turn_acceleration)
Used by sub_1406A9D60 which feeds it into steering executor sub_14069CDE0
(unexamined). Same quartet, same clamp pattern as the mortar drop controller in
sub_1406AA110, so the quartet is a generic rate controller: base gravity_rate,
ramp homing_strength/update, clamped to [speed_scale, turn_acceleration]. Grade A
for the quartet structure; grade B for the units inside sub_14069CDE0.
acceleration_value 0x4C55EA3D IS NOT AN ACCELERATION (grade A, R against the name):
find_bytes shows ZERO code consumers in the low bank; the verified consumers read it
as a SIGNED FRAME COUNT:
- sub_140EEC7D0 standard chain builder: CCmdAction_WaitForLifeTimeEnd frames =
  -(value) (0x140eec90f float-encoded hash 56076532.0 = 0x4C55EA3D, and 0x140eec932
  raw), and CCmdAction_WaitByFrame frames = +value (0x140eeca60). It also reads
  lifetime 0x32ACABFB (0x140eec8ec) for the same action.
- sub_140EA9300 mortar chain builder: stores value into the
  WaitUntilHighestPoint action (0x140ea9574).
So 0x4C55EA3D = flight-phase duration in frames (end-phase scheduling), range
-360..3000 frames. The simulator must NOT add it to per-frame speed.
initial_speed 0xAB606D9E consumers (all grade B):
- sub_14066F920 (0x14066fa06/0x14066fa3a): mode table init; when params present and
  value > 0, *(a1+4) = initial_speed * 0.5 overrides a per-mode default from the
  switch (defaults 1.0/0.6, 3.0/2.352, 5.0/3.0, 10.75/8.75, 14.5/12.5 for modes
  1..6): plausibly units/update of some mover mode.
- sub_140696A90 (0x140696b09): launch velocity multiplier: factor *= initial_speed
  when flag getter sub_14066DFA0(params) is true, then scales a direction row into
  the motion matrix.
- sub_140DD71D0 (0x140dd72a8): stored to mortar state +44 (value <= 0 -> 1.0f);
  reader not yet identified.
Frame rate: every counter observed increments once per behavior UPDATE
(sub_140695B60). Units above are therefore per-update. Whether behavior updates are
60 Hz was not proven this session (grade C assumption, unchanged from 2026-05-31).

### Item 5 CLOSED (grade A): hash-label swap between the two ballistic dumps

Raw disasm of sub_1405B5040:
  0x1405b5080  mov [arg_8], 90423264h   ; turn_rate -> out arg_0
  0x1405b50a8  mov [arg_8], 74F469FAh   ; gravity_rate -> out arg_10
  0x1405b50d5  movss xmm2, [arg_0]      ; SPEED slot   = turn_rate
  0x1405b50db  movaps xmm3, xmm7        ; GRAVITY slot = gravity_rate
  0x1405b50e6  call sub_1405C42E0       ; highArc = 1
  0x1405b50eb  call sinf; mulss xmm0, [arg_0]  ; sin(angle) * SPEED
  0x1405b50fe  call powf                        ; ^2
  0x1405b5106  addss xmm7, xmm7 ; 2 * gravity
  0x1405b511f  divss xmm0, xmm7 ; peakY = (sin(angle)*speed)^2 / (2*gravity)
RESOLUTION: both sub_140606BB0 and sub_1405B5040 pass SPEED = turn_rate 0x90423264
and GRAVITY = gravity_rate 0x74F469FA. The table in
docs/ida-dumps/sub_1405B5040_BallisticTrajectoryMidpoint.md has the two hashes
swapped (it labels 0x90423264 gravityRate and 0x74F469FA turnRate) and its peak
formula "(sin * gravityRate)^2" is wrong; the correct expression is the classic
v0y^2 / 2g with v0y = sin(angle) * turn_rate. bulletparam.rs naming is confirmed
correct. Grade A (raw immediates + register routing + physics identity + agreement
with the already-verified sub_140606BB0).

### Failed query classes (this session)
- Two decompile calls issued in parallel (sub_140DE21C0 + sub_140E2E5C0) both timed
  out; sequential retries succeeded. Lesson recorded: issue decompiles ONE at a time
  on this shared instance.
- Single decompile timeouts (queue contention, each succeeded on one sequential
  retry): sub_140EEDC70, sub_140696A90, sub_1405C4F50.
- list_globals glob filter "*MoveTrans*" was ignored by the server (returned the
  unfiltered global list). Workaround that worked: find_regex over the string list
  for RTTI type descriptor names (".?AVCCmdAction_...").
- No whole-DB search_text, no bulk decompiles attempted (per anti-crash rules).
  find_bytes on 4-byte hash immediates stayed bounded and fast throughout.

### Open leads with exact next queries
1. Chain-builder selection: how bullet_action_hash 0x4D6BF281 / behavior_type
   0xA36593AD choose a builder (sub_140EEC7D0 vs sub_140EA9300 vs funnel builders).
   Next: xrefs_to 0x140EEC7D0, then decompile its registration site.
2. sub_14069CDE0: applies the sub_1406A6F70 rate value to steering for
   StandardHomingMoveSet; needed to fix yaw/pitch units of the quartet in the
   standard (non-mortar) path. Next: decompile 0x14069CDE0.
3. sub_14068E280 (shared vtable method, homing_duration reads at 0x14068e4b4 and
   0x14068e552). Next: decompile 0x14068E280.
4. sub_140F33C50 / sub_140F33D40 / sub_140F33DC0 (GetMoveType callers) to upgrade the
   item-2 universal negative from B to A. Next: decompile each (one at a time).
5. Update tick rate (60 Hz assumption) for per-update -> per-second conversion.
6. Reader of mortar state +44 (initial_speed) set by sub_140DD71D0 at 0x140dd72d8.
