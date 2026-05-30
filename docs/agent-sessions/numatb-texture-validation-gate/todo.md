# numatb-texture-validation-gate — TODO

## Current phase: Rust `numatb_format` module (delegated)

- [x] Revert inline rules patch in `fhm2d_stage_validate.rs` (coordinator)
- [x] Write `design-numatb-format-module.md` + `agent-handoff-gpt55.md`
- [x] **Subagent:** Implement `src-tauri/src/format/numatb_format.rs`
- [x] **Subagent:** Wire `exvs_stage_check_numatb_empty_params` to module
- [x] **Subagent:** Rust unit tests + `cargo check`
- [x] **Subagent:** Update `process.md`

## Prior work (unchanged)

- [x] Frontend: Use*-gated missing texture paths + validate all profile entries
- [x] `exvs_stage_validate_numatb_empty_params` Tauri command exists
- [x] Frontend/Rust parity on empty-path rules

## Next agent starts at

Review the final diff and continue with any coordinator-level integration or PR preparation.
