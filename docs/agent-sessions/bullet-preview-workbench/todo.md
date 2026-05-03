# Bullet Preview Workbench TODO

## Goal
- Replace temporary Bullet 3D flow with a single-page professional workbench.
- Remove cross-tab dependency for selecting bullet entry and adjusting shot details.
- Keep realtime trajectory and viewport updates while editing controls.

## Tasks
- [completed] Audit current bullet-preview state model and UI split problems.
- [completed] Redesign store shape to include data source, filters, selection, overrides, and playback.
- [completed] Rebuild controls UI into one-page workbench (file load, weapon/shot selection, tuning controls).
- [completed] Update simulator and scene to consume richer scenario inputs and live overrides.
- [completed] Verify TypeScript/lints for edited files and record outcomes.

## Notes
- Follow UnitTask docs naming semantics for moveType/action families.
- Preserve compatibility with Param Editor external selection as optional fallback.
