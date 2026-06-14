# Unit Model FBX/DAE Import TODO

- [x] Read project rules and relevant Unit Model / Scene import documentation.
- [x] Audit the current Add Folder validation and Unit Model mutation pipeline.
- [x] Audit the Scene Editor FBX/DAE analysis, configuration, and direct SSBH conversion flow.
- [x] Define the Unit-specific import contract and output layout.
- [x] Add failing tests for Add Folder completeness and FBX/DAE import orchestration.
- [x] Reuse the Scene import configuration UI with Unit-specific behavior.
- [x] Convert FBX/DAE to SSBH under the Unit Model models area.
- [x] Automatically create and register an empty NUHLPB for every added model.
- [x] Refresh Unit Model structure, model list, textures, validation, and preview.
- [x] Run frontend, Rust, and real-sample verification.

## Verification Notes

- Rust unit tests and the real-sample DAE pipeline pass when local sample assets are present.
- Targeted frontend Vitest coverage for the Unit model service and reused SSBH import panel passes.
- Full TypeScript checking still has unrelated pre-existing errors in Scene test fixtures and registry tests.
- A broader dae-import/UnitModelEdit Vitest run still has one unrelated pre-existing text expectation mismatch in `DaeImportAnalysisPanel.test.tsx`.

## Acceptance Requirements

- Add supports at least two explicit choices: FBX/DAE import and existing SSBH folder.
- Existing-folder import rejects incomplete model folders before mutation.
- Required SSBH model assets are one NUMSHB, one NUMDLB, one NUSKTB, one JNTTBL,
  and at least two NUMATB profiles including Maya and Nust.
- FBX/DAE import reuses the Scene Editor analysis and detailed SSBH configuration UI.
- Unit-specific orchestration writes generated model assets into the Unit Model
  models area and then integrates them into the canonical structure/shared texture pool.
- Every successful add has an empty NUHLPB registered in the Unit Model NUHLPB group.
- Failed conversion or validation does not partially mutate the Unit Model structure.
