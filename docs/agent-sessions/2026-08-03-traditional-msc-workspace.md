# Traditional MSC Workspace

## Goal

Add a Traditional MSC mode to TestEditor alongside the existing Unit MSC workflow, including arbitrary `.bin` names, independent folder selection, compilation, FHM2D repack, and an optional compile-then-repack flow.

## Implementation

- Added Unit MSC and Traditional MSC tabs with independent selected folders.
- Traditional mode maps any `.bin` to same-basename `.c` and `.txt` files, and any `.c` back to a same-basename `.bin`.
- Preserved Unit MSC-only slot status, overlay resolution, and round-trip verification.
- Added a persisted `Auto-repack .fhm2d` setting. Individual compilation triggers FHM2D repack immediately; batch compilation does so only when every MSC file succeeds.
- Routed manual and automatic FHM2D outputs to the Tauri-configured `obModPath` through the shared repack runner. Success toasts report the final output path; missing configuration blocks repack with an explicit error.

## Verification

- MSC-focused Vitest suite: 4 files, 37 tests passed.
- Real traditional input `000triad_battle_b004_001_r2.bin` decompiled and recompiled successfully under `tmp/msc-traditional-validation/`; the recompiled size matched the original at 11280 bytes, but the SHA-256 did not match.
- Full frontend build remains blocked by pre-existing type errors in `BulletPropertyPanel.tsx` and `motionFolderService.ts`.
- Full Vitest run reached 728 passing tests and 3 unrelated failures in `Fhm2dMemoryPreviewModal.test.tsx` and `ListeningRepackDialog.test.tsx`.
