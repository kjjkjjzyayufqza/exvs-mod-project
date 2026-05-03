# UnitTaskAutomata Deep Analysis - Process Log

## Session 2026-05-03 (continued from Claude agent analysis)

### Source Materials
- Previous Claude agent analysis: `docs/unit-task-automata-vtable-reference.md`, `docs/unit-task-automata-process.md`
- Binary strings: `FIND_STRING.MD` (69780 lines, 1597 UnitTaskAutomata RTTI entries)
- IDB: `E:\OBHK0.3_v27\vsac27_Release.exe.i64`
- IDA Pro MCP: Connected and operational

### IDA Analysis Session Results

#### Phase 1: VTable Verification
- Read base vtable at 0x1413446a0 (93 slots confirmed)
- Read FreeFall EXVS2 vtable at 0x1413E1E18 (100 slots, 7 extended)
- Confirmed slot assignments match Claude agent analysis
- Extended slots 93-99 verified at correct function addresses

#### Phase 2: CCmdActionManager Execute Decompilations
Decompiled 6 unique Execute functions:
- FreeFall (sub_140DE9BD0): gravity+velocity physics body + WaitForLifeTimeEnd + optional spin
- Throw (sub_140DEA280): thin wrapper to vtable[3], delegates to subclass
- PutObj (sub_140DEAD10): vernier/dust effects + rotation bone + WaitByFrame(1800) safety
- Sticker (sub_140DEBEB0): CauseStick + Blank terminator
- Boomerang (sub_140DEBFF0): dual-phase Series + PlayLoopSE/StopLoopSE + deg→rad rotation
- FreeFall_Interaction (sub_140DEB820): physics body + matrix-transformed velocity + bounce

#### Phase 3: CRITICAL DISCOVERY - Shared Execute Template
Found that Anchor, Summon, SummonRush, Radicon, ShockHalo, FreeFly, Detonator ALL share:
- Same Execute function: sub_14068E280
- Template Method pattern with vtable[3]/[4]/[5]/[8] hooks
- Common pipeline: setup → stick → wait → release
- Two execution models identified (Direct Override vs Template Method)

#### Phase 4: Parameter System
- Decompiled sub_1405B2980 (ParamLookup) and LookupCommandDescriptorByHash (sub_1401A8BD0)
- Binary search on sorted hash array → offset into data block
- Mapped 15 hash constants to parameter names
- New hash discovered: 1737628893 (0x678B5CDD) = wait_before_action_frames

#### Phase 5: Combat Functions
- CanHitTarget (sub_1406A5980): 3D distance < range from parameter table
- ShouldCancel (sub_1406A57D0): 3D distance >= range (inverse of CanHitTarget)
- ConfigureDamageInfo (sub_140DDC8C0): type=1, flags=1, power=256/258, stun=0
- FindNearestTarget (sub_1406A56E0): 12-slot search, prefer type=1 over type=2, closest distance

#### Phase 6: System Functions
- Registration (sub_140921530): global table with 0x220-byte records, constructor at offset 520
- OnInit (sub_1406A5BA0): read target tracking flag, spawn hit effects loop
- OnUpdate (sub_1406A5B30 → sub_14066D910 → sub_140673170): hit effects → collision bitmask → base tick
- Hit dispatch (sub_14066D730): recursive tree search with hash 0x0D6A5CD5, priority at data+160

### Output Documents
1. `docs/unit-task-automata-deep-analysis.md` — Complete type taxonomy + lifecycle + composition guide
2. `docs/unit-task-automata-ida-analysis.md` — All IDA decompilation results + hash mapping + pipeline analysis

### Remaining Work (subagents still running)
- 3 background subagents analyzing additional details (Summon series specifics, full OnUpdate chain, more slot decompilations)
- Summon vtable[3] specialization (sub_14068DFD0) not yet decompiled
- ThrowPillar, ThrowMortar managers not yet analyzed
- Full Anchor pipeline (extend→grab→retract phases) needs vtable[3]/[4]/[5] analysis
