# Batch Static Mesh Import - TODO

## Current phase

- [x] Read project rules and relevant SSBH/HKT documentation
- [x] Trace the existing direct-to-disk static mesh conversion pipeline
- [x] Add failing tests for batch defaults and per-file geometry mapping
- [x] Add a batch entry to the Scene Editor toolbar
- [x] Reuse the Static Mesh import modal and full NUMATB configuration
- [x] Force direct-to-disk SSBH and required HKT generation
- [x] Block unresolved texture references before conversion
- [x] Remove the incorrect independent page and sidebar route
- [x] Verify focused tests, build, typecheck, and formatting

## Next actions

- Resolve the unrelated pre-existing SceneEdit test fixture errors before using
  full `npx tsc --noEmit` as a clean repository-wide gate.
