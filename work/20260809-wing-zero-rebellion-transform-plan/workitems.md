# Work Items

| ID | title | role | targets | surface | status | evidence | notes |
|----|-------|------|---------|---------|--------|----------|-------|
| WI-001 | Establish scope and routing | lead | case | process | complete | | R0 reverse-engineering + docs-generator |
| WI-002 | Inventory relevant docs and local resources | cre | target and reference assets | local_files | complete | E-001,E-003 | Read-only; no FHM2D extraction |
| WI-003 | Map transformation dependencies and migration phases | cre | MSC, motion, model, params, effects | documentation | complete | E-002,E-003 | Proven current gaps separated from source-dependent work |
| WI-004 | Write complete Chinese implementation plan | doc | docs | documentation | complete | E-001,E-002,E-003 | Includes Evidence → Finding → Path and Mermaid flowchart |
| WI-005 | Deep-audit exact 28001001 transform closure | cre | MSC, FHM manifests, speedparam | local_files | complete | E-004,E-005,E-006 | Corrected source availability and proved the minimal target graft |
| WI-006 | Rewrite plan as execution-grade specification | doc | docs | documentation | complete | E-004,E-005,E-006 | Function/state/resource mappings, diagnostics, gates, and diff budget |
| WI-007 | Correct source inventory using canonical names | cre | named source model/motion/effect/MSC/param/sound | local_files | complete | E-007 | Supersedes legacy hash-path missing-resource conclusion |
| WI-008 | Resolve direct motions, SHL model names, and skeleton compatibility | cre | motion structure, model structure, SHL, NUSKTB | local_files | complete | E-008 | Reduced core Bird closure to four named model groups and three direct NUANMB items |
| WI-009 | Share normal/bird main-shot charge state | cre | target 2.c armsparam slot 0 adapters | decompiled_msc | complete | E-009 | Paired ENTER and EXIT sys_4F bindings like TV Wing |
| WI-010 | Charge bird double shot once | cre | target 2.c bird main-shot callback | decompiled_msc | complete | E-009 | Projectile 1 uses the real slot; projectile 2 uses slot 5 |
| WI-011 | Add bird-origin melee air pursuit adapter | cre | target 2.c func_41/func_937 path | decompiled_msc | complete | E-009 | Normal func_937 preserved; origin state resets on other actions and respawn |
| WI-012 | Run MSC staged verification | cre | target 2.c and tmp compile output | verification | complete | E-009 | Static test, lifecycle audit, AI blocks, opaque pointers, compile, resource proof passed; in-game matrix unrun |
| WI-013 | Correct bird melee no-forward/no-fall regression | cre | target 2.c func_937/938 | decompiled_msc | complete | E-010 | Restore func_489; keep 0x68C7334E and air-state teardown adapter; user confirmed no falling in game |
| WI-014 | Wire flight CSA clone | cre | target 0.c/2.c | decompiled_msc | complete | E-010 | 0x800 -> 0x2194F05D -> bird-main alias; form preserved |
| WI-015 | Wire flight CSB to normal Zero System | cre | target 0.c/2.c | decompiled_msc | complete | E-010 | 0x1000 -> 0x616971CE; forced teardown before func_1031 |
| WI-016 | Verify revised MSC lifecycle and resources | cre | target MSC/Param and tmp compile | verification | complete | E-010 | 6 tests, both checkers, both compiles, Param rows and exact diffs passed; runtime unrun |
| WI-017 | Reconstruct bird-melee failure history from Git | cre | E:\XB\mod\040msc history and working snapshots | documentation | complete | E-010 | Commit-level V1→revert→side-path→func_502 failure→runtime-confirmed final chain recorded |
| WI-018 | Correct bird charge/ammo adapter and CSA/CSB transitions | cre | target 0.c/2.c | decompiled_msc | complete | E-011 | mode-4 keeps 10/2 ammo independent while sharing charge; CSA uses bird-main selector class; bird CSB resets body rotation |
| WI-019 | Verify charge/ammo/CSA/CSB correction | cre | target MSC/Param and tmp compile | verification | complete | E-011 | RED 3 failures, GREEN 6 tests; AI blocks, opaque pointers, both compiles, Param/resource proof pass; runtime pending |
| WI-020 | Repack final target 0/2 MSC binaries | cre | target 0.bscex/2.dscex | decompiled_msc | complete | E-011 | 0.bscex replaced after backup; 2.dscex already byte-identical; decompile recovered all three fixes |
| WI-021 | Consume charge state at every Rebellion CS action entry | cre | target 2.c | decompiled_msc | complete | E-012 | normal/directional/bird CSA clear slot 0 once; existing CSB slot-4 consumption retained |
| WI-022 | Repack and verify CS consumption | cre | target 2.dscex | verification | complete | E-012 | RED three subcases, GREEN seven tests; decompile recovers exactly three entry clears; runtime pending |

## Coverage
- [x] Relevant in-scope local assets inventoried
- [x] Canonical-name source resource paths frozen
- [x] Transformation dependency path documented
- [x] Evidence and confidence labels included
- [x] Final Markdown plan written
- [x] Previous source-availability claim superseded with exact path evidence
- [x] Common controller semantic equivalence proven
- [x] Cross-schema speedparam merge specified
- [x] Legacy hash-path availability conclusion superseded
- [x] Three direct transform motion Items resolved by canonical filename
- [x] Bird SHL model closure and skeleton incompatibilities resolved
- [x] Normal/bird main-shot charge state inherits in both directions in source
- [x] Bird double shot consumes only the first projectile in source
- [x] Bird-origin melee uses the air pursuit adapter without changing normal func_937
- [x] MSC staged static and compile gates pass
- [x] Failed func_502 bird-melee design is documented as superseded
- [x] Flight CSA and CSB have selector, registry, handler, form, and reset policies
- [x] Bird-melee no-fall fix has direct user runtime confirmation
- [x] Git commits and uncommitted exact snapshots preserve the repeated-failure chronology
- [x] Normal/bird main-shot ammo states remain independent while CSA charge is inherited
- [x] Bird CSA uses the complete bird-main selector/action class
- [x] Bird-origin CSB resets both body rotation layers before normal Zero System
- [x] Final 0.bscex and 2.dscex both contain the corrected source behavior
- [x] Every Rebellion CSA consumes shared slot-0 charge at action entry
- [x] CSB retains its existing slot-4 action-entry consumption chain
