# UnitTaskAutomata Reverse Engineering - TODO

## Overview
Goal: Reverse engineer all UnitTaskAutomata vtable implementations in EXVS2 (vsac27_Release.exe), abstract common patterns, and document them for creating/proxying new UnitTasks.

## Task List

### Phase 1: VDK Base Class vtable Structure Analysis
- [x] Locate UnitTaskAutomata base class vtable in memory (0x1413446a0, 93 slots)
- [x] Identify all virtual function slots and their signatures
- [x] Decompile and document each vtable method's purpose
- [x] Determine the base class lifecycle (init → update → destroy)
- [x] Document the interface contract every UnitTask must fulfill
- [x] Discover CCmdActionManager layer (Strategy pattern)
- [x] Map CCmdActionManager types and their vtables

### Phase 2: 000COMMON Generic Task Analysis
- [x] Analyze UnitTaskAutomataFreeFall (free fall behavior) — CCmdActionManager_FreeFall decompiled
- [x] Analyze UnitTaskAutomataThrow (throwing projectiles) — CCmdActionManager_Throw identified
      → done in unit-task-automata-ida-analysis.md §8.2 (commit 5b461ce)
- [x] Analyze UnitTaskAutomataBoomerang (boomerang weapons) — CCmdActionManager_Boomerang identified
      → done in unit-task-automata-ida-analysis.md §8.4 (commit 5b461ce)
- [x] Analyze UnitTaskAutomataAnchor (anchor/hook mechanics)
      → done in unit-task-automata-execute-analysis.md §2 (commit 5b461ce)
- [x] Analyze UnitTaskAutomataSticker (sticking objects) — CCmdActionManager_Sticker identified
      → done in unit-task-automata-ida-analysis.md §8.5 (commit 5b461ce)
- [x] Analyze UnitTaskAutomataPutObj (placing objects) — CCmdActionManager_PutObj identified
      → done in unit-task-automata-ida-analysis.md §8.3 (commit 5b461ce)
- [x] Analyze UnitTaskAutomataFreeFly (free fly / funnel)
      → done in unit-task-automata-execute-analysis.md §6 (commit 5b461ce)
- [x] Analyze UnitTaskAutomataDetonator (explosion trigger)
      → done in unit-task-automata-execute-analysis.md §5 (commit 5b461ce)
- [x] Analyze UnitTaskAutomataShockHalo (shock wave)
      → done in unit-task-automata-execute-analysis.md §4 (commit 5b461ce)
- [x] Analyze UnitTaskAutomataSummon* family (assist calls) → see summon-analysis.md
- [x] Abstract common function patterns from COMMON tasks (all share slots 80-99)

### Phase 3: Hash Dispatch & Creation Flow
- [x] Analyze hit_effect_hash 0x0D6A5CD5 dispatch function
      → 0x0D6A5CD5 is a PARAMETER LOOKUP KEY (not class ID)
      → Used to read "hit_effect_type" from centralized data store
      → sub_14066D730 recursively searches child objects matching type
- [x] Map hash → UnitTaskAutomata class creation relationship
      → Constructors registered to global table at startup (sub_140921530)
      → Entry stores constructor fn pointer at offset 520 in 0x220-byte records
      → Constructor pattern: allocate(0x3530) → memset(0) → base_init → set_vtable
- [x] Document the UnitTask instantiation pipeline
      → done in unit-task-automata-spawn-trace.md (registration → spawn flow, sections 1-2; commit 5b461ce)
- [x] Trace how vtable gets bound during construction
      → done in unit-task-automata-spawn-trace.md §2.5 constructor chain (vtable set bottom-up)

### Phase 4: Unit-Specific Task Sampling
- [x] Sample 001GUNDAM tasks (beam javelin, napalm, shield throw)
      → done in unit-task-automata-001gundam-weapons.md (2 variants × 4 weapons = 8 classes; commit 5b461ce)
- [x] Sample 002ZGUNDM tasks (beam confuse, rifle saber)
      → done in unit-task-automata-002zgundm-weapons.md (BeamConfuse + ThrowRifleSaber deep dive,
        19-weapon vtable/manager census, RTTI verified at address level; 2026-07-26)
- [x] Sample Summon/Assist patterns (Dom, Methuss, etc.)
      → done in unit-task-automata-summon-analysis.md (commit 5b461ce)
- [x] Identify unit-specific overrides vs base behavior
      → done in unit-task-automata-001gundam-weapons.md / -sazabi-weapons.md / -agefx-weapons.md
        (shared-vs-variant function tables, "Key Difference" sections; commit 5b461ce)

### Phase 5: Abstraction & Documentation
- [x] Create unified vtable function reference
      → done in unit-task-automata-vtable-reference.md (commit 5b461ce)
- [x] Document common behavioral primitives (motion, collision, damage, effect)
      → done in unit-task-automata-deep-analysis.md §4.3 (composable behavior primitives)
- [x] Create template for new UnitTask implementation
      → done in unit-task-automata-vtable-reference.md ("Template: Creating a New UnitTask")
- [x] Create guide for proxying existing UnitTask
      → done in unit-task-automata-vtable-reference.md ("Template: Proxying an Existing UnitTask")
- [x] Final consolidated reference document
      → done in unit-task-automata-deep-analysis.md;
        docs/agent-sessions/unit-task-deep-analysis/todo.md declares all phases complete

## Statistics
- Total RTTI strings found: 1597
- Estimated unique classes: ~800
- VDK base class types identified: ~20-30
- Hash 0x0D6A5CD5 references found: 11 locations

## Document Index

All sibling documents live in `docs/` and shipped in commit 5b461ce.

| Document | Scope |
|----------|-------|
| unit-task-automata-process.md | Session process log (commands, decisions, evidence trail) |
| unit-task-automata-ida-analysis.md | IDA decompilation results: parameter lookup system, CCmdActionManager Execute() for Throw/PutObj/Boomerang/Sticker (§8.2-8.5) |
| unit-task-automata-execute-analysis.md | CCmdActionManager Execute() pipelines: Summon/SummonRush, Anchor, Radicon, ShockHalo, Detonator, FreeFly |
| unit-task-automata-spawn-trace.md | Complete creation flow: registration table → spawn bridge → factory resolver → constructor chain → vtable binding → OnInit |
| unit-task-automata-decompiled-analysis.md | Decompiled pseudocode for all critical base-class vtable methods |
| unit-task-automata-deep-analysis.md | Consolidated system analysis: complete type taxonomy, architecture, composable behavior primitives |
| unit-task-automata-vtable-reference.md | Abstracted vtable reference plus templates for creating and proxying UnitTasks |
| unit-task-automata-summon-analysis.md | Summon/Assist system deep analysis (assist call mechanics) |
| unit-task-automata-001gundam-weapons.md | 001GUNDAM (RX-78-2) weapons: 2 variants × 4 weapons = 8 classes |
| unit-task-automata-002zgundm-weapons.md | 002ZGUNDM (Zeta Gundam group) weapons: BeamConfuse/ThrowRifleSaber deep dive + 19-weapon census |
| unit-task-automata-beamjavelin-napalmbomb-analysis.md | BeamJavelin and NapalmBomb weapon behavior deep dive |
| unit-task-automata-sazabi-weapons.md | 017GYAKCH_002SAZABI (Sazabi) complete weapons analysis |
| unit-task-automata-agefx-weapons.md | 033GNDAGE_004GAGEFX (AGE-FX) complete weapons analysis (23 classes) |
| unit-task-automata-agefx-deep-analysis.md | AGE-FX funnel/defense subsystem deep analysis (FunnelFlysword, StickerFunnel, etc.) |
