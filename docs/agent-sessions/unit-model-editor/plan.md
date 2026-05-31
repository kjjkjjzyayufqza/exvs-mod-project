# Unit Model Editor Implementation Plan

## Goal

Add a Unit Model Editor page for EXVS unit model FHM2D packages. The page reuses
the existing SSBH 3D preview feature set and gates unit model repack behind
structure validation tailored to character/unit packages.

## Scope

- Move the TestEditor SSBH 3D preview implementation into a shared component
  location and reuse it from Unit Model Editor.
- Remove the TestEditor 3D View entry points after the move.
- Keep TestEditor Folder Structure in TestEditor.
- Add a validation-first Unit Model repack flow.

## Validation Rules

- Resolve the sibling structure JSON from the selected folder:
  `<parent>/<folderName>_structure.json`.
- Validate unit model groups from `_structure.json`, not physical `0/1` texture
  directories.
- Each model group must include `.nusktb`, at least two `.numatb`, `__maya__`
  `.numatb`, `__nust__` `.numatb`, `.numshb`, `.numdlb`, `.jnttbl`, and exactly
  two texture container folders.
- Required `unk2` tags:
  - `.nusktb` -> `10000000`
  - `.numatb` -> `21000000`
  - `.numshb` -> `30000000`
  - `.numdlb` -> `40000000`
  - `.jnttbl` -> `50000000`
  - `.nutexb` -> `00000000`
- Texture container folders must be `unk3=32, unk5=1`.
- Regular model folders must be `unk3=0, unk5=0`.
- `.numatb` item `unk3=1` is allowed for unit model packages.
- Each texture container is validated against the `.numatb` item that immediately
  follows it. Unit packages may order `__maya__` and `__nust__` pairs differently
  per model group.
- `.nuhlpb` count must equal the model group count.
- A `shell_*.shl` file must exist; its `SHLL` header model count must equal the
  model group count.
- Do not validate stage-only `info`, `base`, `sky`, HKT, CSV, or SPBIN rules.

## Frontend Requirements

- Unit Model Editor exposes the unchanged 3D viewport UI.
- Add adjacent tool controls for selecting a unit folder, validating, repacking,
  displaying validation summary/errors, and copying an AI review payload.
- Repack is blocked when validation fails. No auto-repair is performed.

## Verification

- Run Rust tests for the new validator.
- Run the validator against:
  - `E:\XB\解包\com\file\0xAF73362C`
  - `E:\XB\解包\com\file\0xAF73362C_structure.json`
- Run targeted TypeScript checks/tests for the new frontend service.
