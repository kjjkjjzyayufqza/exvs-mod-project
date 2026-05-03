# UnitTaskAutomata Deep Analysis - TODO

## Goal
1. Fully understand all logic: lifecycle, value conversion, value mapping behavior, actual code behavior
2. Full logic proxy: create new types, apply/recombine existing logic, rewrite from scratch

## Status: ALL PHASES COMPLETE

## Phase A: Complete Type Taxonomy
- [x] Enumerate all VDK base UnitTaskAutomata classes (49+ from RTTI)
- [x] Enumerate all CCmdActionManager types (40+ from RTTI)
- [x] Enumerate all CCmdAction node types (100+ from RTTI, sizes documented)
- [x] Enumerate all CCmdActionGroup types (4 from RTTI)
- [x] Map inheritance hierarchy

## Phase B: Lifecycle Deep Dive
- [x] Trace MSC syscall → UnitTask spawn (682-case switch registration → 937-return factory)
- [x] Analyze construction chain (allocate 0x3530 → memset → 4-layer C++ ctor → set vtable)
- [x] Analyze initialization sequence (PreInit → OnInit → CreateCmdActionManager)
- [x] Analyze per-frame update chain (10-step pipeline: physics→collision→actions→hit)
- [x] Analyze collision/hit response system (bitset-driven, mode-based destruction)
- [x] Analyze destruction/cleanup sequence

## Phase C: Value System Analysis
- [x] Document hash-based parameter lookup (sub_1405B2980 → binary search on sorted hash array)
- [x] Map 21 hash → parameter name relationships (velocity, gravity, lifetime, spin, bounce, etc.)
- [x] Document degrees → radians conversion in Throw/Boomerang/Detonator pipeline
- [x] Document frame/lifetime conversion (negative = absolute frames)
- [x] Document object memory layout (0x3530 bytes + param data block)
- [x] Document param struct offsets per manager type

## Phase D: Behavior Composition Analysis
- [x] Classify CCmdAction nodes by function (9 categories, 100+ nodes with sizes)
- [x] Document CCmdActionGroup_Series vs Parallel semantics (type 1 vs type 2)
- [x] Analyze existing pipeline compositions (FreeFall, Throw, Boomerang, Summon, Anchor, etc.)
- [x] Identify two execution models (Direct Override vs Template Method)
- [x] Document composable behavior primitives

## Phase E: Implementation Templates
- [x] Template: New UnitTask from scratch (15 vtable slots + CCmdActionManager)
- [x] Template: New CCmdActionManager with custom pipeline (both models)
- [x] Template: Proxy/hook existing UnitTask (3 approaches)
- [x] Template: Recombining existing behaviors into new patterns (3 examples)

## Output Documents
1. `docs/unit-task-automata-deep-analysis.md` — Type taxonomy + lifecycle + composition guide
2. `docs/unit-task-automata-ida-analysis.md` — IDA decompilations + hash mapping + pipeline analysis
3. `docs/unit-task-automata-decompiled-analysis.md` — 22 vtable methods annotated pseudocode
4. `docs/unit-task-automata-spawn-trace.md` — Full spawn flow (registration → factory → construction)
5. `docs/unit-task-automata-execute-analysis.md` — All CCmdActionManager Execute() pipelines
6. `docs/unit-task-automata-vtable-reference.md` — Original Claude agent vtable reference
7. `docs/unit-task-automata-process.md` — Original Claude agent process log
