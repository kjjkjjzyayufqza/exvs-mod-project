# EW Zero Normal Front/Back Sub-Shot Port

## Scope

Offline comparison of the in-scope EW Zero and Rebellion MSC sources. Only the
Rebellion `2.c` action registration changed behavior; `0.c` logic was untouched
and its nearby selector comment was aligned. Later-than-OB evidence,
vanilla-source edits, and unrelated assets were excluded.

## Finding

### F-001
- title: Rebellion already preserves the complete EW normal sub-shot handler
- severity: info
- category: reverse_algo
- status: validated
- evidence_ids: [E-001]
- location: E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c:30954
- impact: The former front/back empty stub can be replaced without copying or altering the N/left/right homemade action.
- confidence: high for source structure; runtime behavior remains E1 until in-game verification
- repro_steps:
  1. Compare EW and target ACTION_AB_SUB, func_908, and func_909.
  2. Trace target 0.c front/back and N/left/right selector hashes.
  3. Inspect target func_241 registrations.
- remediation: Register 0x53554243 to ACTION_AB_SUB; retain 0x23df217e on SUB_SHOT_CUSTOM.
- optional_attack:

## Path

### P-001
- title: Normal sub-shot direction dispatch
- path_type: callflow
- start: normal-form input bit 0x80
- goal: direction-specific action handler
- steps:
  1. action: 0.c global2 & 0xc selects 0x53554243 for front/back; evidence: E-001; finding: F-001
  2. action: 2.c func_241 maps 0x53554243 to ACTION_AB_SUB; evidence: E-001; finding: F-001
  3. action: all other directions select 0x23df217e and retain SUB_SHOT_CUSTOM; evidence: E-001; finding: F-001
- residual_risks: EW assist spawn behavior requires the pre-registered in-game H/P/F run; no repack was authorized in this task.

## Verification

- `check_msc_ai_blocks.py`: pass for modified `0.c` and `2.c`
- `check_msc_opaque_func_ptrs.py`: pass for modified `0.c` and `2.c`, 0 warnings
- `check_msc_action_shape.py`: pass, 0 errors; one unrelated informational bird-CS note
- Compile/repack: not run; user authorization not given
