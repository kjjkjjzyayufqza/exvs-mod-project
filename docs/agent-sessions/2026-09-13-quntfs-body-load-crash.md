# Qan[T] Full Saber body load crash

Scope: InRepoWork; read-only diagnostics of the user-supplied edited and
original model directories plus OBHK0.3_v27 crash logs. No MSC work.

## Finding

The replacement body uses material labels `01`, `02`, `04`, `06`, but its
unchanged `_m001__nust__` and `_m002__nust__` variants still contain only
`emiMtl` and `pbr1Mtl`. Each variant misses all 11 new mesh bindings.

The OB IDA initialization path looks up additional materials by the base
material label, passes an empty handle onward on failure, then dereferences
the null material's string. The resulting read at `0x88` matches the
2026-09-13 22:08:50 event at `RVA 0x6DB57`. Additional variants are prepared
at load time, before a special state needs to be displayed.

## Evidence and handoff

- Detailed analysis: `tmp/quntfs-body-crash/report.md`.
- Native identity: `E:/OBHK0.3_v27/vsac27_Release.exe`, IDA base
  `0x140000000`; input identity retained in the local report.
- One diagnostic passed:
  `rtk proxy python -X utf8 tmp/quntfs-body-crash/check_material_contract.py`.
- Source assets and IDA annotations remain unchanged; no repaired package
  or in-game retest was produced.
- Next repair: synchronize all four labels and new texture bindings in
  both numbered variants while retaining their intended state parameters.
- The supplied original's base Maya/Nust filenames disagree with shader
  content; select profiles by content during repair. This is separate from
  the proven material-label mismatch.
- The actual loaded FHM2D has not been independently matched to the source
  directory. Confirm the repair in game before claiming runtime resolution.
