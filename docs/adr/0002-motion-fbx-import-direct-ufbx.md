# MotionFbxImport reads DCC FBX directly via ufbx, without Blender or a manifest

Status: accepted (2026-07-26)

MotionFbxImport turns a mod developer's edited FBX (typically a re-exported
CompleteMotionFbx) back into a single NUANMB. The import path loads the FBX
directly in Rust with ufbx, validates bones against the active model's NUSKTB
(canonical names, ExactHierarchy default), samples reference-hierarchy local
TRS at 60 Hz with unit/axis normalization (DccSpaceNormalize), and writes the
NUANMB through the existing template-merge writer. No bridge.json manifest and
no Blender install are required for import; export keeps its Blender 5.1
dependency per ADR 0001.

## Considered options

- Direct ufbx import, manifest-free (chosen)
- Blender headless decompose before reading — adds a hard Blender dependency
  and latency to import, and makes unit tests require Blender
- Reviving the bridge.json manifest — redundant next to the always-available
  NUSKTB reference and reintroduces retired user-facing friction

## Consequences

- Import works offline and is fully unit-testable with synthetic FBX files
- DCC compatibility (Blender armature object, `_end` leaf bones, namespaces,
  unit scale) is owned by our DccSpaceNormalize/RigBind stages; a gated
  Blender 5.1 round-trip integration test is the empirical ground truth
- The bridge-era `fbx.rs` reader remains internal until the generalized
  `dcc_fbx.rs` subsumes its round-trip test coverage
- **`ATH_*` helper bones are never written into the output NUANMB.** Homemade
  motions must not modify or convert ATH tracks; the writer omits whole
  Transform nodes (not rest/identity bake). Policy:
  `docs/nuanmb-ath-helper-bone-policy.md`
- **In-game body/shot layout** (uncompressed CompScale/Visibility shell,
  Translate on every Transform bone, indexed multi-frame `0x4300`, hold snap):  
  `docs/nuanmb-exvs2-import-in-game-layout.md`
