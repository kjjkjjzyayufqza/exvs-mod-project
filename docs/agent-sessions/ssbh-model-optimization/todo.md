# SSBH Model Optimization Analysis

- [x] Read project rules and relevant SSBH/Scene Editor documentation.
- [x] Trace StudioSB model optimization and serialization behavior.
- [x] Compare StudioSB behavior with this project's core SSBH logic.
- [x] Write an implementation-ready `plan.md`.
- [x] Verify every plan claim against source evidence and update handoff notes.

## Implementation (2026-06-13)

- [x] Task 1: semantic comparator + buffer helpers + comparator self-tests.
- [x] Task 2: explicit `MeshWriteProfile` API; legacy callers byte-identical.
- [x] Task 3: canonical profile omits the v1.8/v1.9 dummy buffer2
  (stride2 kept at 32 per StudioSB canonical evidence; see process.md).
- [x] Task 4: lossless 16/32-bit index width selection with boundary tests.
- [x] Task 5: locked the current EXVS2 v1.8 ten-attribute layout in tests.
- [x] Task 6: application `.numshb` write uses `Vs2Canonical`; export test added.
- [x] Task 7: benchmark matrix on three local real files (20-22% smaller).
- [ ] Task 8: push fork commit `212e317c` to `origin/wmmt2`, repin
  `Cargo.lock`, commit application change (blocked on push approval).
- [x] Task 9: fork and app verification commands run green.
- [ ] In-game validation of a representative canonical export.

## Result

- Plan: `docs/agent-sessions/ssbh-model-optimization/plan.md`
- Handoff evidence: `docs/agent-sessions/ssbh-model-optimization/process.md`
- Fork commit (local, wmmt2): `212e317cc317865afbe682d76ff268b919b9bf5f`
