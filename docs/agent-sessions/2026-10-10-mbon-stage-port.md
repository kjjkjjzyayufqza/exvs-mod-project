# 2026-10-10 — MBON stage port to Over Boost

Goal: research MBON (PS4 CUSA15006) stage data, port a stage into the Over
Boost mod `E:\XB\mod\001stage`, register it in `012list/stage_list`, and hand
it to the owner for the in-game test.

## Current truth

* Report: `docs/mbon-gvs/stage-port.md` (formats, decisions, test plan).
* Tool: `mbon_stage_port` (`src-tauri/src/mbon/stage_port/`); MBON readers
  `exvs_mbon::{stage, vcl}`; NUD vertex-clump offset fixed in
  `exvs_mbon::nud`; NTP3 cube maps in `exvs_mbon::ntp3`.
* Tests: `cargo test -p exvs_mbon` (the `package::named_extraction...` failure
  is older than this work: Windows separators in a `String`),
  `cargo test --test mbon_stage_port_test`. `[lib] test = false`, and the lib
  test target does not compile today (`effect_folder.rs` `meta_parsed`), so the
  bridge tests live in `tests/`.
* Local evidence and scripts: `local-note/mbon-stage/` (excluded in
  `.git/info/exclude`), including `RESEARCH_LOG.md`, all 42 extracted stages,
  per-stage surveys, the batch port and renders.
* Mod backups taken before editing: `local-note/mbon-stage/backup/20261010/`
  (`stage_list.bin`, `resource_registry.json`).
* Batch: all 42 archives port with exit 0 (report section 8.3 table).
* Delivered (report section 9.1): `001stage/mbon_practice` (`0x230207D2`,
  stage row `2111950099`) and `001stage/mbon_heliopolis` (`0xA5071A4F`, row
  `2111950100`), both with structure JSON and registry entries. The owner
  repacks them in the Scene Editor and runs the in-game test.
* Second delivery after the owner's Scene Editor review (report section 9.2):
  `obj` scale dropped (the MBON eboot never applies it, `sub_714640`
  0x716BA7), `_o` opaque texture copies, and the Scene Editor's
  case-sensitive `"trans"` check fixed in `meshFromSsbh.ts`.

## Restart conditions

* In-game result of the delivered packs (see the report's section 9.3).
* Objects still misplaced in game → OB `VDK_ROTATION` order (report 10, 6a)
  or an MBON program id (`pid`) that moves objects.
* A crash on load → compare the packed structure with a shipped stage first
  (role tags, texture containers, info order), then materials.
* Wrong spawn positions → revisit the `STPP` → `plan_param.spbin` mapping
  (marker word unresolved).

## Not done

Lighting from `STGP`, animated objects (VBN/OMO → nusktb/nuanmb), breakables,
stage effects, VCL surface kinds, cube-map IBL — listed in the report's
section 10.
