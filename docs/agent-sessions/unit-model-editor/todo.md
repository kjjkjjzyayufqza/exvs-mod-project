# Unit Model Editor TODO

- [x] Review project rules and relevant FHM2D documentation.
- [x] Inspect the real unit model sample layout.
- [x] Add Rust unit model validation module and Tauri command.
- [x] Add Rust tests, including real-sample validation when the sample path exists.
- [x] Move SSBH 3D preview components to a shared location.
- [x] Add Unit Model Editor route and page.
- [x] Add Unit Model validation/repack frontend tools.
- [x] Remove TestEditor 3D View entry points.
- [x] Run targeted verification and record results.

## Next Actions

Resolve the unrelated SceneEdit TypeScript errors before expecting full-project
`tsc --noEmit` to pass.

## 2026-06-12 Texture/Preview Pass

- [x] Add Unit Model `.nutexb` inventory command backed by `_structure.json`.
- [x] Add Unit Model `.nutexb` add/remove commands that update disk and `SubFileData`.
- [x] Add Unit Model Editor Textures tab with list, preview, export, add, replace, remove, refresh, and path copy actions.
- [x] Reuse Scene Editor texture add/replace/preview/export flows for Unit textures.
- [x] Invalidate stale Unit validation/repack result after texture edits.
- [x] Fix 3D preview resize sharpness by reasserting DPR after panel resize settles.
- [x] Force canvas invalidation after texture decode/material binding changes.
- [x] Improve bone picking with adjustable joint size and non-depth-tested joint handles.
- [x] Run narrow frontend/Rust verification and record outcomes.

## Remaining Follow-up

- [ ] Full `npx tsc --noEmit` is still blocked by unrelated SceneEdit test type errors.
- [ ] Full `cargo test` is still blocked by unrelated bin target `CollisionSimplifyOptions` initializer errors.

## 2026-06-12 Follow-up Fixes

- [x] Force material remount when decoded texture data arrives so white meshes do not require hide/show.
- [x] Add decoded texture identity to GPU texture-pool keys to avoid stale same-path/same-size texture reuse.
- [x] Make Skeleton display default off and reset-to-default off.
- [x] Hide bone joint handles and transform gizmo when Skeleton display is off.
- [x] Stop model load/append from auto-activating the first/last preview item.
- [x] Keep preview collection selected IDs empty after load.
- [x] Make non-motion canvas DPR stay at device/base DPR instead of adaptive low DPR after resize.
- [x] Add ResizeObserver-based canvas sharpness guard for panel size changes.

## 2026-06-12 Texture Detail / AI Payload Follow-up

- [x] Add Unit texture batch PNG export.
- [x] Stop Unit texture inventory refresh from auto-selecting the first texture.
- [x] Make texture preview fit the modal area by default instead of showing a fixed-size preview.
- [x] Add texture preview wheel zoom, toolbar zoom in/out, and reset.
- [x] Remove the selected texture metric strip from the bottom of Unit texture panel.
- [x] Expand Copy AI review payload with validation rules, validation judgement, result, preview state, texture inventory, parsed SSBH/nutexb/jnttbl assets, and structure JSON data.
- [x] Compact Copy AI review payload by summarizing heavy numshb mesh data and skeleton bone data.
