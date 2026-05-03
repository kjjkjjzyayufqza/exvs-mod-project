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
