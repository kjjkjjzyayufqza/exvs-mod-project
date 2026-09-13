# Unit Model Editor extraction and replacement fixes

Scope: InRepoWork, model assets only. Unit 25002001 (OB model package
`0x4222D007.fhm2d`); original game/workspace assets remain read-only.

## Findings before edits

- Generic character extraction of the original OB package reproduces
  `Invalid nutexb footer magic`. Texture records 10, 19, and 23 use the older
  HBSS/TEX header layout. The naming transaction rolls back on this error,
  leaving numeric names even for successfully parsed model/control records.
- `split_maya_nust_numatbs` counts every filename containing `__nust__`,
  including `_m001__nust__` variants. Both source and target resolution use
  this function for mesh/material replacement, including its FBX entry point.

## Plan

1. Add legacy texture name handling using the existing parser where possible;
   preserve decoded file contents and reject malformed names.
2. Select the base Maya/Nust material pair, excluding numbered special Nust
   variants. Keep preview and commit consistent; preserve target variants.
3. Add focused regression coverage for real OB extraction/source integrity
   and multi-material replacement, including missing/ambiguous base profiles.
4. Run one scoped Cargo regression command covering the affected tests.

## Evidence and progress

- Pre-fix extraction: `tmp/fhm2d-extract/unit-model-bugs-25002001/before`.
- Source: `E:/OBHK0.3_v27/data/x64/dplcache_release/0x4222d007.fhm2d`.
- Plan recorded before implementation; implementation and verification complete.
- Added a bounded HBSS/TEX v1.0 name reader shared by FHM2D naming and
  on-disk texture-reference validation. It validates the relative string
  pointer, version, UTF-8, termination, and file bounds without decoding
  image data. Image bytes are never converted.
- Mesh/material preview and commit ignore numbered `_mNNN__nust__` profiles
  on both source and target. Missing or ambiguous base profiles still fail.
  This includes the mesh replacement path that starts with FBX conversion.
- Verification command (passed):
  `cargo test --manifest-path src-tauri/Cargo.toml --test fhm2d_extract_cli_test --test replace_unit_model_numshb unit_model_regression -- --nocapture`
- Six tests passed. The actual 25002001 sample ran: all 119 decoded payloads
  match, all 11 model preview bundles load, all texture names resolve through
  the name reader, and the original archive checksum remains unchanged.
- Retained editor fixture:
  `tmp/fhm2d-extract/unit-model-bugs-25002001/after-OUaEhx/hildol`.
- Log: `tmp/fhm2d-extract/unit-model-bugs-25002001/regression.log`.
- GUI interaction and legacy image decoding were not tested. The legacy
  addition handles names only; it does not add image decoding support.
