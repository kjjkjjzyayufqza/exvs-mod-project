# numatb-template-config - TODO

## Current phase

- [x] Fix texture-path validation refresh after applying a template
- [x] Prune stale fill rows after removing/disabling texture slots or export profiles
- [x] Keep bulk-fill selection synchronized when templates add texture slots
- [x] Validate that exported NUMATB texture references resolve to existing `.nutexb` files
- [x] Block static mesh conversion and show the exact profile, material, parameter, and invalid value
- [x] Apply the same validation to direct conversion, preview import, model replacement, and standalone SSBH conversion
- [x] Add frontend and Rust regression tests for unresolved texture references
- [x] Run focused tests and typecheck
- [x] Read project rules and relevant numatb docs
- [x] Inspect existing template editor and Tauri store usage
- [x] Persist numatb template library through Tauri store config
- [x] Ensure both template UIs load, save, delete, and apply persisted templates
- [x] Run focused verification

## Next actions

- Resolve the unrelated pre-existing TypeScript fixture errors before using
  full `npx tsc --noEmit` as a clean repository-wide gate.
- Resolve the unrelated Rust bin initializer errors before using full
  `cargo check` as a clean repository-wide gate.
