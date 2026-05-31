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
- [~] RE the actual per-frame projectile update / homing integrator (CORE missing piece).
- [ ] RE the moveType (0x06E90346) dispatch into movement behaviors (0-7, 255).
- [ ] RE homing: turn_rate / tracking_angle / homing_type / homing_range / homing_duration / min_homing_distance / tracking_start_distance.
- [ ] RE speed chain: initial_speed / speed_acceleration / acceleration_value / speed_scale; resolve coordinate units + fps.
- [ ] Resolve the hash-label swap noted between sub_140606BB0 and sub_1405B5040 dumps.

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
