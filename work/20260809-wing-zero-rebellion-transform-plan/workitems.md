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
