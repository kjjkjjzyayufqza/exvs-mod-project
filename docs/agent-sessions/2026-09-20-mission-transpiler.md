# Mission authoring workbench

- Scope: InRepoWork. Lua <-> MSC C authoring, sidebar footer page, embedded
  `000triad_battle_a030_001.c` template, no source-file/hash dependency.
- Reference: user-selected `E:/XB/mod/051mission/000triad_battle_a030_001`.
  Read `mission.lua`, `example.lua`, and the complete C source. Catalog cluster:
  `mission-script`; owner: `docs/mission-research/exvs2-ob-triad-mission-architecture.md`.
- Evidence: E1 source translation; existing owner notes supply the mission ABI.
  No gameplay claim or game-directory write is authorized by this implementation.
- Lifecycle inspected: ENTER main -> func_33 -> func_32; opening func_34 waits,
  loads and deploys; ACTIVE func_16 -> func_17/func_19 -> global0 callback;
  EXIT switches to func_18; INTERRUPT / death and RESPAWN use unchanged
  func_17/19 and func_15/20 event coroutines. REINITIALIZE uses func_33 resets.
- Ownership: global0 is the callback, temporarily saved/restored by func_11;
  global20/global24 are phase/timer state, reset by setup and phase advancement;
  team costs, win/lose flags, target/loss limits and BGM are initialized by
  configuration, then owned by the unchanged runtime. Slot parameters retain
  the embedded template defaults; authored values replace only explicit fields.
- The falsified registry's matching low function/global numbers refer to unit
  scripts, not this mission namespace. Toolchain G4 applies: compilation must
  use the Mission profile and the existing byte-identity guard. Preserve the
  fixed prefix and assert func_20=0x97d, func_15=0x9de after compilation.
- Resource boundary: baseline map/unit/message/BGM IDs are present in the
  supplied source. New user IDs require target assets and in-game validation;
  the workbench cannot prove resource availability from a source file.
- Rollback: additive service/page and narrow router/command integration. Leave
  existing dirty files and game assets intact. Export standalone files only.
- Verification pending: parser/generator/reverse conversion/debugger, UI flow,
  mission compiler/offset invariants, required Rust warning gate.
