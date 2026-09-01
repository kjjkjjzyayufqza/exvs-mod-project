# Work Items

| ID | title | role | targets | surface | status | evidence | notes |
|----|-------|------|---------|---------|--------|----------|-------|
| WI-001 | Establish scope and auth | lead | case | process | complete | | offline scope ready |
| WI-002 | Trace Rebellion and Messala flight-sub lock ownership | cre | local MSC sources | static reverse | complete | E-001,E-002,E-003 | current source identities pinned |
| WI-003 | Validate new Rebellion roll-sub behavior in game | cre | user runtime | dynamic verification | awaiting_runtime | | stage-1 repack installed; requires user-run E3 matrix |
| WI-004 | Flight sub stage-1 native aim window | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | awaiting_runtime | E-001,E-002,E-003,E-004 | global689 0x6→0xA only; build installed |
| WI-005 | Flight sub stage-2 TV moving-shot profile | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | falsified | E-002,E-003,E-004 | E3- I9: no observable change; held-back SHOOT still drifts |
| WI-006 | Flight sub stage-3 SHOOT-only last-writer yaw | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | falsified | E-002,E-003,E-004 | E3- I10: no observable effect; branch-vs-native overwrite unresolved |
| WI-007 | Flight sub stage-4 SHOOT branch SE probe | cre | Rebellion 2.c/2.dscex | diagnostic repack | rejected | E-002,E-003,E-004 | user: no SE; action-only lock facing |
| WI-008 | Flight sub stage-5 SHOOT analog motor off | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | falsified | E-002,E-003,E-004 | E3- I11: ENTER-only 296(0); held stick still yaws off |
| WI-009 | Flight sub stage-6 per-tick SHOOT motor off | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | falsified | E-002,E-003,E-004 | E3- I12: free-fall fake bird; motor-off removed |
| WI-010 | Flight sub stage-7 analog leftover 454=0 | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | falsified | E-002,E-003,E-004 | E3- I13: no effect; mix reverted to 0x62 |
| WI-011 | Flight sub stage-8 sys_46(0x6) analog-input gate | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | withdrawn | E-002,E-003,E-004 | never E3; copied kind-0x35 global854 not roll hook |
| WI-012 | Flight sub hold-repeat (Hambrabi 1182) | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | complete | | E3 2026-09-01 user: auto 3-shot cancelled |
| WI-013 | Flight sub analog sys_4C(0x8,0x3) | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | withdrawn | E-002,E-003,E-004 | magnitude reseed, not reverse gate; never E3 |
| WI-014 | Flight sub analog 2026-08-28 clamp | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | awaiting_runtime | E-002,E-003,E-004 | Stage 13 installed 1CFD3810; SHOOT profile 0 every tick; 679 restores profile 2 (D10) |
| WI-015 | Flight sub START aim snap (Hambrabi 601) | cre | Rebellion 2.c/2.dscex | source edit + legacy repack | awaiting_runtime | E-002,E-003,E-004 | Stage 12: yaw before clamp, global184==1 only; analog judgement is hold-back during SHOOT |

## Coverage
- [x] Recon/analysis complete for in_scope assets
- [x] Critical/High candidates triaged (N/A for pure RE)
- [x] Validated findings have Evidence (E-*)
- [x] Path documented (callflow)
- [x] Timeline continuous across major phases
- [x] Report via docs-generator
- [x] field-journal anonymized

## Refs
- skills/ops/timeline-workitem.md
- skills/ops/evidence-finding-path.md
