# SceneEdit stage pack crash — `0x4D1F5138` (201stage201)

Scope: InRepoWork; OB stage `201stage201` / hash `0x4D1F5138`. User-reported in-game
crash after packing with Scene Editor.

## Finding

1. **Placement / sky index drift** — After DAE imports (`zzzz_import_1111`,
   `zzzz_import_noa`), `info/placement.csv` kept `VDK_TYPE,SKY` at
   `VDK_OBJECTNUMBER,64` while an `VDK_TYPE,OBJECT` row also used `64`
   (import at ~200,10,200). Rust `load_stage_bundle_impl` assigns sky
   `object_index = model_folder_count` (65 for this pack: 65 non-sky folders).
   SKY and a placed object sharing the same number can crash native load.

2. **Save pipeline gap** — `ensureSkyPlacementObjectNumber` used
   `subModels.filter(non-sky).length` instead of the sky entry's
   `objectIndex`, and placement CSV was not rewritten when placement was not
   marked dirty (`persistPlacementCsv === false`) even though sky was stale.

3. **Weak import assets** — Both `zzzz_import_*` folders have **0-byte
   `.jnttbl`**. Repack validation only checked file presence, not size.

4. **Not a generic FHM2D repack defect** — `stage_texture_roundtrip_check` and
   `mbon_stage_port rehearse` pass on extracted content; user file size matches
   Scene Editor `repack_stage_fhm2d_preserving_shared_textures` (~339 MB).

## Evidence (local, gitignored)

- Extract / roundtrip: `tmp/fhm2d-extract/0x4D1F5138-stage-*`
- User sample (read-only): `0x4D1F5138.fhm2d` (Tencent recv path)

## Fix track (this session)

| Item | Change |
|------|--------|
| Sky number source | `resolveSkyPlacementObjectNumber()` from bundle sky `objectIndex` |
| Save | Reload bundle before sky sync; write `placement.csv` when sky mismatches |
| Validate | `exvs_stage_check_placement` + empty `.jnttbl` rejection |
| Tests | TS + Rust unit coverage for sky collision |

## User workaround (until rebuild)

Open stage in Scene Editor → save folder (or save FHM2D) so placement SKY
becomes **65** and no OBJECT uses **65**; or remove `zzzz_import_*` placements
and re-pack.
