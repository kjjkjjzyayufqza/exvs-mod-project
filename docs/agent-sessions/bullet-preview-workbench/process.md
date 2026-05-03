# Bullet Preview Workbench Process Log

## 2026-05-03

### Context gathered
- Read project constraints from `AGENTS.md` and `.cursor/rules/custom-rules.mdc`.
- Reviewed workflow and reverse-engineering docs related to action hash, moveType, UnitTask families, and hitEffectHash mapping:
  - `docs/exvs-msc-input-action-weapon-pipeline.md`
  - `docs/unit-task-automata-process.md`
  - `docs/unit-task-automata-vtable-reference.md`
  - `docs/unit-task-automata-001gundam-weapons.md`
  - `docs/unit-task-automata-agefx-weapons.md`
  - `docs/001gundam-throwshield-hammershot-analysis.md`
  - `docs/unit-task-automata-sazabi-weapons.md`

### Current implementation problems observed
- Bullet preview depends on Param Editor tab pushing one selected row into store.
- Bullet 3D tab cannot independently load/select weapon-shot entries.
- Store model is too narrow (`entry + scenario.targetDistance`) for commercial-level workflow.
- Page layout is playback-first, not authoring-first.

### Implementation direction
- Rebuild store as a unified workbench state:
  - bulletparam dataset
  - filter/search model
  - selected weapon/shot row
  - physics overrides and scenario parameters
  - playback + visualization
- Rebuild controls into a left authoring panel in the Bullet 3D tab.
- Keep realtime simulation and scene updates from a single page.

### Changes implemented
- Added `src/page/TestEditor/components/bullet-preview/bulletPreviewTypes.ts`:
  - shared scenario/filter/dataset/row/override types
  - hitEffect hash segment parser
  - physics override merge helpers and digest utility
- Rebuilt `bulletPreviewStore.ts`:
  - state now includes dataset rows, filtered rows, selected row, external fallback row, physics overrides, and playback
  - supports single-page selection flow via `setDataset`, `setFilter`, `selectFilteredRow`, `setPhysicsOverride`
  - keeps backward compatibility with Param Editor via `setEntry` external entry fallback
- Updated `TrajectorySimulator.ts`:
  - scenario input now supports `targetDistance`, `targetHeight`, `targetOffsetX`
  - anchor simulation now uses 3D target offset instead of Z-only
- Updated `BulletPreviewScene.tsx`:
  - target dummy, distance line, and max-range sphere now follow 3D target scenario values
- Rebuilt `BulletPreviewControls.tsx` into a single-page workbench panel:
  - bulletparam file load in-tab
  - moveType/series/unit/variant filters + search
  - row selection list with hash labels
  - live tuning controls for key projectile fields
  - scenario controls for X/Y/Z target placement
- Added `BulletPreviewTimelineControls.tsx`:
  - playback, timeline scrub, speed presets, visual layer toggles
- Updated `BulletPreviewViewport.tsx`:
  - split layout to left workbench + right viewport
  - bottom timeline controls
  - camera orbit target adapts to scenario offset

### Verification
- IDE lint diagnostics for edited bullet-preview files: no errors.
- Command:
  - `pnpm -s tsc --noEmit`
  - Result: exit code `0`.

### Follow-up fixes (Bullet 3D debug)
- Added a new `resetWorkbench` store action to reset:
  - filter/search selections
  - scenario fields
  - visualization toggles
  - physics overrides
  - playback state/speed
- Added enemy lateral movement fields to scenario:
  - `enemyLateralMotionEnabled`
  - `enemyLateralAmplitude`
  - `enemyLateralPeriodFrames`
  - `enemyLateralPhaseDeg`
- Added `computeScenarioTargetPosition()` in `bulletPreviewTypes.ts` as shared target-motion resolver.
- Updated simulator to:
  - use moving target position per frame for homing computation
  - output `targetPositions` in trajectory results for viewport playback sync
  - clamp/sanitize unsafe numeric inputs
  - auto-flip negative gravity for preview stability
  - truncate simulation with warning if non-finite values occur
- Updated scene to render target dummy / distance line / range sphere at dynamic target position per playback frame.
- Updated controls with:
  - top-level `Reset All` button
  - enemy lateral motion toggle + amplitude/period/phase inputs
  - warning panel now shows multiple simulator warnings (not only first line)

### Follow-up verification
- IDE lint diagnostics for edited files: no errors.
- Command:
  - `pnpm -s tsc --noEmit`
  - Result: exit code `0`.
