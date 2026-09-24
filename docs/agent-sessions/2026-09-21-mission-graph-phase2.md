# Mission graph phase 2 (control-flow research)

- Goal: evidence-grade Go / Research only / No-Go for Blueprint-like mission
  control flow on OB. Independent of Phase 1 UI.
- Cluster: `mission-script`. Owner note:
  `docs/mission-research/mission-graph-control-flow-go-nogo.md` (upgraded 2026-09-21).
- Catalog match: `python tools/msc_research_catalog.py --match "mission script branch variable coroutine 0x601 0x802"`.
- Falsified-negatives: `0x349` always 0; dead `0x400` params; G4 Identical /
  `f013_001` refused. No `0x601`/`0x802` authoring E3-. Unit `func_35` /
  `global24` hits are a different script class.
- Corrections vs the draft: A-30-1 tick is `func_16` (not architecture §9.3
  `func_14`); `func_25` is inside `func_17`; `func_19` owns private array row
  `0x3c` every live tick; official `0x802` is exactly two starts / one `0x803`;
  `0x607..0x609` have zero official callers; a `func_35` fork is Research only
  (not a tick cannot-exit No-Go).
- Verdict: **nothing is Go.** No graph v2, no branching UI, no blackboard, no
  loop/parallel author nodes. IDA was not attached; fiber cap and native event
  types stay E0. No in-game run (no `Status: E3`).
- H/P/F for later user packs: H-branch, H-var (row ≠ `0x3c`), H-loop, H-802
  (not `0x9de`/`0x97d`), H-event observe-only. One variable per pack.
- Not done: MSC `X.c` edits, Tauri UI, compiler guard changes, registry rows.
