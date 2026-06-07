# VDK Break Substitute Analysis Process

## Context

The user asked how a breakable `VDK_TYPE,OBJECT` placement in
`E:\XB\解包\com\map\0xBAAFF3FD\0\0\info\placement.csv` relates to in-game and
Three.js behavior. The specific row is a large rock with `VDK_HITPOINT,MEDIUM`,
shockwave fields, and repeated `VDK_SUBSTITUTE_PLACEMENT` fields.

## Commands And Findings

- Read `AGENTS.md` and `.cursor/rules/custom-rules.mdc`.
- Searched `docs/` for placement and VDK references.
- Used CodeGraph to inspect SceneEdit placement parsing and VDK-related code.
  - `src-tauri/src/format/fhm2d_stage.rs` parses flat placement rows into
    `PlacementEntry`, preserving all raw fields.
  - `src/utils/vdkParser.ts` treats repeated `VDK_SUBSTITUTE_PLACEMENT` and
    `VDK_CAMERA_BIND_PLACEMENT` values as arrays.
  - Current SceneEdit/Three.js preview renders placement models but does not
    implement runtime destruction or substitute spawning.
- Inspected the target CSV:
  - Total rows: 175.
  - Target breakable rock is 0-based placement index `173`, line `174`,
    `VDK_OBJECTNUMBER,11`, `VDK_HITPOINT,MEDIUM`.
  - `VDK_SUBSTITUTE_PLACEMENT,174` maps to 0-based placement index `174`,
    line `175`: `VDK_TYPE,PROP`, `VDK_OBJECTNUMBER,12`, hidden initial spawn,
    disappear/break effects, lifetime, and SE.
  - `VDK_SUBSTITUTE_PLACEMENT,163` maps to 0-based placement index `163`,
    line `164`: hidden explosion `EFFECT` using `EFF_015STAGE015_EXP_001`.
  - `VDK_SUBSTITUTE_PLACEMENT,172` maps to 0-based placement index `172`,
    line `173`: hidden `OBJECT`, `VDK_OBJECTNUMBER,10`.
- Object folder mapping by sorted sub-model order:
  - `10`: `015stage015_object_rockmountain_after`
  - `11`: `015stage015_object_rockmountain_before`
  - `12`: `015stage015_object_rockmountain_break`
- The `rockmountain_break` folder has a much larger `map_hit.hkt` than the
  before/after variants, consistent with many fragment bodies or volumes.

## Conclusion

The evidence strongly indicates `VDK_SUBSTITUTE_PLACEMENT` values are 0-based
placement row indices. When the visible `rockmountain_before` object is destroyed,
the game hides/removes it and activates the hidden substitute placements:
`rockmountain_break` PROP fragments, explosion effect, and `rockmountain_after`
static residual object. Three.js currently previews the objects from CSV/model
data only; it does not run the game's break/destruction state machine unless a
custom simulation layer is added.

## Copy-To-Another-Map Notes

- For the object-only transfer, copy these three sub-model folders:
  - `015stage015_object_rockmountain_before`
  - `015stage015_object_rockmountain_after`
  - `015stage015_object_rockmountain_break`
- Each folder includes `map_hit.hkt`, `numdlb`, `numshb`, `nusktb`, `jnttbl`,
  and two `numatb` files. The break folder has a large mesh/skeleton/HKT payload,
  consistent with fragment bodies.
- The destination `placement.csv` needs three rows:
  - visible breakable `OBJECT` using the new object number for `before`
  - hidden `OBJECT` using the new object number for `after`
  - hidden `PROP` using the new object number for `break`
- Recompute `VDK_SUBSTITUTE_PLACEMENT` as the destination 0-based placement row
  indices. If omitting effects, remove the explosion effect substitute.

## Prop Lifetime Evidence

- Searched unpacked map placement files under `E:\XB\解包\com\map`.
- Found `VDK_PROP_LIFE_MAX` values:
  - `90`: 18 rows, likely 1.5 seconds at 60fps.
  - `120`: 13 rows, likely 2 seconds at 60fps.
  - `360`: 2 rows, likely 6 seconds at 60fps.
  - `1800`: 1 row, the rockmountain break row, likely 30 seconds at 60fps.
- No native decompiled handler for prop lifetime was found in the current docs/code.
  The frame-count interpretation is a high-confidence inference from common
  values and EXVS-style 60Hz game timing.

## Fragment Count Evidence

- Converted `rockmountain_before`, `rockmountain_after`, and `rockmountain_break`
  `.nusktb`, `.numshb`, and `.numdlb` files to JSON with `tools/ssbh_data_json.exe`.
- Counts:
  - `before`: `bones=0`, `meshObjects=4`, `modlEntries=4`, `uniqueModlMeshNames=2`.
  - `after`: `bones=0`, `meshObjects=3`, `modlEntries=3`, `uniqueModlMeshNames=1`.
  - `break`: `bones=239`, `fragmentLikeBones=237`, `meshObjects=454`,
    `modlEntries=454`, `uniqueModlMeshNames=238`.
- For `rockmountain_break`, `object_rockmountain_break_all` has 77 direct
  child bones named like `object_rockmountain_break_all__C0`, `__C1`, etc.
  There are 162 leaf bones and 238 unique parent bones used by mesh objects.
- Interpretation: placement only activates the `PROP`. The visible/physical
  fragment count is authored inside the `rockmountain_break` SSBH/HKT resources.
  To change the amount of small rocks, edit or replace the break resource itself;
  placement fields do not expose a "fragment count" parameter.

## HKT Destruction Evidence

- Inspected `src-tauri` HKT handling:
  - `src-tauri/src/havok_cli.rs` uses Havok Content Tools
    `hctStandAloneFilterManager.exe` to convert HKT bytes to XML and XML back to
    HKT through embedded HKO filter configs.
  - `src-tauri/src/havok_mesh_export.rs` exports HKT collision OBJ by searching
    XML `meshTree` records.
  - `src-tauri/src/havok_mesh_encode.rs` builds or patches
    `hknpCompressedMeshShape` / `meshTree` collision data.
  - `src/utils/havokXmlParser.ts` also parses XML by extracting `meshTree`
    records for Three.js collision preview.
- Converted
  `E:\XB\解包\com\map\0xBAAFF3FD\0\0\015stage015_object_rockmountain_break\map_hit.hkt`
  to XML with Havok Content Tools. The original HKT is `1,300,928` bytes and
  the XML is `29,648,375` bytes.
- This break HKT is not the normal compressed collision mesh format currently
  handled by the editor:
  - `hknpCompressedMeshShape`: `0`
  - `meshTree`: `0`
- The XML contains Havok destruction data:
  - `hkndDestructionSystemData` for `object_rockmountain_break_all`
  - `hkndHierarchy`
  - `fracturePieces` array count: `238`
  - `hkndConnection` records: `272`
  - breakable connection flags: `272`
  - fracture shape pointers: `239`
- The `238` HKT fracture pieces match the previously observed
  `rockmountain_break` SSBH-side count of `238` unique mesh parent bones.
  This strongly indicates the custom break behavior is coordinated between:
  fragment meshes, fragment skeleton/bone names, and the `hknd` hierarchy in
  `map_hit.hkt`.
