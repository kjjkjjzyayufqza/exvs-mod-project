# Timeline (append-only)

## 2026-08-29T12:13:40.5986516+08:00 | lead | init
- action: case-init
- command_or_ref: skills/scripts/case-init.ps1
- result_summary: case directory created; scope pending auth
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- next: route MSC catalog and inspect only in-scope local source

## 2026-08-29T00:00:00+08:00 | lead | scope-signoff
- action: review offline scope
- command_or_ref: scope.md
- result_summary: auth granted; cre assigned; later-than-OB research and vanilla modification excluded; ready_for_act=true
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- next: run MSC catalog match before source discovery

## 2026-08-29T01:20:00+08:00 | cre | pre-edit-audit
- action: pre-register the single handler-mapping change
- command_or_ref: EW ACTION_AB_SUB comparison and target selector trace
- result_summary: |
    H: Mapping 0x53554243 to the preserved EW ACTION_AB_SUB restores the original normal front/back sub-shot while leaving 0x23df217e SUB_SHOT_CUSTOM untouched.
    P: Front/back plays target motion 0xdce9175f and reaches EW global200=1/sys_51 slot 4; N/left/right still enters SUB_SHOT_CUSTOM.
    F: Front/back still immediate-exits, or any N/left/right input stops entering SUB_SHOT_CUSTOM, falsifies H.
- artifacts: [scope.md, workitems.md]
- evidence_ids: []
- next: edit only the 0x53554243 func_241 registration and its local comments

## 2026-08-29T01:30:00+08:00 | cre | implementation-and-static-gates
- action: rewire front/back normal sub-shot and verify source contracts
- command_or_ref: E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c
- result_summary: 0x53554243 now maps to ACTION_AB_SUB; N/left/right 0x23df217e remains SUB_SHOT_CUSTOM; 0.c logic is unchanged and only its stale comment was aligned; all relevant static guards passed
- artifacts: [evidence/E-001.md, report/report.md]
- evidence_ids: [E-001]
- next: user-authorized legacy repack followed by the pre-registered in-game front/back versus N/left/right matrix
