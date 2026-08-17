# Bullet Editor Physics Redesign — TODO

Topic: Re-architect the TestEditor Bullet Editor (page + calculation engine) so the
3D trajectory preview matches the real EXVS game physics, reverse-engineered from
`vsac27_Release.exe` (IDA idb at `E:\OBHK0.3_v27\vsac27_Release.exe.i64`).

Reference data the user loads at runtime:
`E:\XB\解包\com\file\0x31A97FD4\bulletparam.bin.param_export.json` (124 entries).

## Decisions locked
- Physics source of truth = reverse engineering from the game binary via IDA (user
  reconnected ida-pro-mcp and directed RE path). NOT invented constants.
- Scope = calculation engine rewrite + Bullet Editor page redesign.
- Validation = match the decompiled game logic (RE-accurate), not just visual plausibility.

## Status legend: [ ] todo  [~] in progress  [x] done  [!] blocked

## Phase 0 — Context & RE ground truth
- [x] Read AGENTS.md + .cursor rules.
- [x] Map current bullet code (TrajectorySimulator, bulletPreviewTypes, bullet-editor/*).
- [x] Confirm bulletparam field semantics from `src-tauri/src/format/bulletparam.rs` command pool.
- [x] Read existing ida-dumps for ballistic helpers (sub_1405C42E0/sub_140606BB0/sub_1405B5040/sub_1405C4400).
- [x] RE the actual per-frame projectile update / homing integrator (CORE missing piece).
      -> FOUND, grade A: sub_1406AA110 (pos += vel, traveled += |vel|, yaw steer
      clamped by tracking_angle deg/update, engage cone = effective_range/2 deg,
      vertical drop controller from gravity_rate/homing_strength/speed_scale/
      turn_acceleration). Update slots: sub_1406AB580 = CCmdAction_MoveTransAsMortar
      slot 12 (vftable 0x1415d7c20); standard bullet = CCmdAction_StandardHomingMoveSet
      Update sub_1406ABD30 (vftable 0x1415d6ef8). Homing gate sub_1406A9A10.
      See process.md 2026-07-26.
- [x] RE the moveType (0x06E90346) dispatch into movement behaviors (0-7, 255).
      -> PREMISE REJECTED, grade A per site: no physics dispatch exists. move_type is
      a category tag (spawn counters sub_1406101B0; net replication gate 255=skip
      sub_14068D580/sub_14068D750/sub_1406A5E10; count queries sub_140637AD0/F10;
      per-unit effect bitset bit = moveType+7 via sub_140EEDC70 in sub_140E2E5C0).
      Mover class is chosen by the unit action program (CCmdAction chain builders,
      e.g. sub_140EEC7D0). Universal negative is grade B until getter callers
      sub_140F33C50/D40/DC0 are decompiled (exact next query).
- [~] RE homing: turn_rate / tracking_angle / homing_type / homing_range / homing_duration / min_homing_distance / tracking_start_distance.
      -> CLOSED grade A: turn_rate = SPEED domain (solver speed slot + base of speed
      formula sub_1406A7050, never angular); tracking_angle = yaw step deg/update;
      homing_range = max TRAVELED distance (gate sub_1406A9A10); min_homing_distance
      = pitch cone half-angle*2 in degrees (sub_1406AEE00, R vs name);
      tracking_start_distance = speed MAX clamp (sub_1406A7050, R vs name).
      Still B: homing_type = spawn-orientation mode selector (next: name the a3/a5
      matrices in sub_1405C4F50 + sub_1405C4820); homing_duration = frame count in
      funnel programs (next: decompile sub_14068E280, reads at 0x14068e4b4/552).
- [~] RE speed chain: initial_speed / speed_acceleration / acceleration_value / speed_scale; resolve coordinate units + fps.
      -> Formula CLOSED grade A (sub_1406A7050): speed = clamp(base + turn_rate +
      speed_acceleration * max(0, age - 0x59332F69), min 0x28BA5665, max 0xFF51E424),
      units per UPDATE. acceleration_value 0x4C55EA3D is NOT acceleration: signed
      frame count in end-phase actions (sub_140EEC7D0/sub_140EA9300), grade A + R.
      speed_scale = min clamp of the rate quartet (sub_1406A6F70/sub_1406AA110),
      grade A + R vs "multiplier". initial_speed = grade B (three consumers, see
      process.md). OPEN: update tick rate (60 Hz unproven, grade C) and
      sub_14069CDE0 steering units (exact next queries in process.md).
- [x] Resolve the hash-label swap noted between sub_140606BB0 and sub_1405B5040 dumps.
      -> RESOLVED grade A: both functions pass SPEED = turn_rate 0x90423264, GRAVITY
      = gravity_rate 0x74F469FA (disasm 0x1405b5080/0x1405b50a8/0x1405b50d5). The
      sub_1405B5040 dump doc has them swapped and its peak formula wrong (correct:
      (sin(angle)*speed)^2 / (2*gravity)). bulletparam.rs names confirmed correct.

## Phase 1 — Calculation engine rewrite
- [ ] Port RE-accurate physics into `src/lib/gameAlgorithms/` (frame-stepped, real fields).
- [ ] Replace `bullet-preview/TrajectorySimulator.ts` dispatch; delete dead 513-595 code.
- [ ] Unit/coordinate scale mapping for Three.js viewport.
- [ ] Tests against known entries from the param export.

## Phase 2 — Bullet Editor page redesign
- [ ] Redesign BulletEditorView / property panels / 3D canvas / scenario / DPS per /redesign-existing-projects.
- [ ] Wire new engine; keep Tauri v2 fs APIs; useTransition for heavy recompute.

## Phase 3 — Verify
- [ ] `pnpm -s tsc --noEmit` clean.
- [ ] Spot-check trajectories vs decompiled behavior for representative moveTypes.

## Confirmed / ruled out
- Ballistic aim math (sub_1405C42E0) verified; ballisticSolver.ts already correct
  (arc shots: speed slot = turn_rate, gravity slot = gravity_rate).
- sub_14043C200 = MSC query syscall dispatcher (NOT physics). The old 513-595
  "move type" physics in TrajectorySimulator.ts is bogus -> delete in rewrite.
- LOCK STATE gates induction (user, 2026-05-31): red=homing on; green/yellow=off;
  blue=special. Must be a first-class engine input + a UI selector. Threshold from
  homing_range / effective_range / tracking_start_distance / unit red-lock distance.

## Phase 1 DONE (2026-05-31) — calculation engine rewrite
- Rewrote bullet-preview/TrajectorySimulator.ts: clean RE-grounded engine, all dead
  513-595 code deleted. Unified projectile integrator (moveType 0/6/255), exact ballistic
  solver (moveType 1), funnel (2/3/5) + anchor (4/7) documented approximations.
- Induction gated by lock state + homing_type + tracking_angle cone + turn_rate angular
  step + homing distance band + homing_duration. Centralized CALIBRATION constants.
- bulletPreviewTypes.ts: BulletLockState, isInductionActive, scenario.lockState +
  scenario.launchSpeed (base velocity is NOT a bulletparam field — exposed as scenario input).
- ScenarioPanel.tsx: lock-state selector (Red/Green/Yellow/Blue) + base-launch-speed input.
- BulletEditorStore.ts: auto-syncs launchSpeed from selected entry initial_speed.
- Verify: `pnpm tsc --noEmit` -> ZERO errors in bullet files (remaining errors are
  pre-existing SceneEdit/ssbh DdsFormat issues, unrelated to this task).

## Phase 2 DONE (2026-05-31) — lock-state + induction visualization
- TrajectoryResult gains inductionActive + inductionRange.
- BulletTrajectoryCanvas: projectile/trail colored by induction (warm=on, cool=off);
  green induction-range ring around the player when induction is active.
- BulletEditorView timeline: "Induction ON / No induction" badge.
- Confirmed ScenarioPanel (lock-state + launch-speed) renders via InfoPanel "Target Scenario".
- Verify: tsc clean for all bullet/InfoPanel files (only pre-existing SceneEdit/ssbh errors remain).

## Remaining / optional
- Deeper visual "premium" pass on the panels (typography/spacing) if desired.
- Bit-exact calibration of turn_rate->deg/frame and accel units via deeper action-VM RE
  (PhysicsBody task scheduler sub_14068A6F0 + MSC action handlers) or in-game capture.
  All such tunables live in CALIBRATION in TrajectorySimulator.ts.
- 2026-07-26 update: the turn_rate->deg/frame question is now MOOT (grade A: turn_rate
  is a speed-domain field; the angular step is tracking_angle deg/update and the engage
  cone is effective_range). This is a FIELD-ROLE change, not a constant recalibration,
  so CALIBRATION.turnRateToDegPerFrame was intentionally left untouched; the Phase 1
  engine needs a targeted revision to adopt the proven roles: homing yaw step from
  tracking_angle, cone from effective_range/2, speed from
  clamp(base + turn_rate + speed_acceleration*(age - startFrame), 0x28BA5665,
  0xFF51E424), acceleration_value excluded from speed, homing gate windows from
  sub_1406A9A10 (traveled-distance based). See process.md 2026-07-26 for addresses.
