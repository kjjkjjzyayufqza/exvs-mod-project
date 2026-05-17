# Scene DAE SSBH Save Todo

- [x] Read repository agent rules and Cursor project rules.
- [x] Search and read relevant SceneEdit and SSBH/DAE documentation.
- [x] Inspect SceneEdit gizmo configuration, imported DAE transform flow, and save/export wiring.
- [x] Add regression tests for config normalization and imported DAE save behavior where feasible.
- [x] Implement persistent SceneEdit gizmo size via Tauri store.
- [x] Fix imported DAE transform editing.
- [x] Add SceneEdit support for saving imported DAE files to SSBH output.
- [x] Register saved imported DAE objects as direct stage model folders and append matching OBJECT placement rows.
- [x] Generate repack-ready stage structure JSON for hash-named stage pack folders after imported DAE conversion.
- [x] Create an empty `.jnttbl` alongside converted imported DAE SSBH model files.
- [x] Repack the hash-named stage pack automatically after imported DAE save generates the structure JSON.
- [x] Run focused verification and update this session record.

- [x] Extract save orchestration (saveImportedDaeObjectsAsSsbh, collectStagePackFiles, writeStagePackStructureJson, handleSave core) from page.tsx into sceneSavePipeline.ts.
- [x] Parallelize DAE conversion with Promise.all after serial folder name pre-allocation.
- [x] Add partial failure handling (successful conversions proceed; failures reported separately).
- [x] Add progress callback for save toast updates during multi-DAE conversion.
- [x] Write pipeline unit tests (createBakedImportedDaeExportObject bake/skinned/empty/transform).
- [x] Verify: 12 test files / 50 tests pass, tsc clean, vite build clean.

## Remaining Notes

- Imported DAE SSBH save supports rigid meshes. Skinned imported DAE meshes now fail with an explicit error instead of silently exporting the wrong transform.
- Imported DAE save now converts new models into direct stage root folders, reloads the stage bundle to get backend object indices, writes placement rows that match the existing placement CSV shape, and reloads the saved stage.
- For repack mapping, SceneEdit now resolves the nearest hash-named pack folder such as `16F73C97`, writes a sibling `0x16F73C97_structure.json`, and scans only game-ready file types so editor intermediates such as `.dae` and `.log` are excluded.
- The save flow reuses the existing app repack runner after writing `0xHASH_structure.json`; repack failures surface as save errors.
- Save pipeline extracted to `sceneSavePipeline.ts` — page.tsx reduced by ~170 lines. DAE conversion runs in parallel via `Promise.all` after serial folder name allocation. Partial failures report which objects succeeded/failed without aborting the entire save.
