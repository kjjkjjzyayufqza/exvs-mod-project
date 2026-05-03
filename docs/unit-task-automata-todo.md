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
- [ ] Analyze UnitTaskAutomataThrow (throwing projectiles) — CCmdActionManager_Throw identified
- [ ] Analyze UnitTaskAutomataBoomerang (boomerang weapons) — CCmdActionManager_Boomerang identified
- [ ] Analyze UnitTaskAutomataAnchor (anchor/hook mechanics)
- [ ] Analyze UnitTaskAutomataSticker (sticking objects) — CCmdActionManager_Sticker identified
- [ ] Analyze UnitTaskAutomataPutObj (placing objects) — CCmdActionManager_PutObj identified
- [ ] Analyze UnitTaskAutomataFreeFly (free fly / funnel)
- [ ] Analyze UnitTaskAutomataDetonator (explosion trigger)
- [ ] Analyze UnitTaskAutomataShockHalo (shock wave)
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
- [ ] Document the UnitTask instantiation pipeline
- [ ] Trace how vtable gets bound during construction

### Phase 4: Unit-Specific Task Sampling
- [ ] Sample 001GUNDAM tasks (beam javelin, napalm, shield throw)
- [ ] Sample 002ZGUNDM tasks (beam confuse, rifle saber)
- [ ] Sample Summon/Assist patterns (Dom, Methuss, etc.)
- [ ] Identify unit-specific overrides vs base behavior

### Phase 5: Abstraction & Documentation
- [ ] Create unified vtable function reference
- [ ] Document common behavioral primitives (motion, collision, damage, effect)
- [ ] Create template for new UnitTask implementation
- [ ] Create guide for proxying existing UnitTask
- [ ] Final consolidated reference document

## Statistics
- Total RTTI strings found: 1597
- Estimated unique classes: ~800
- VDK base class types identified: ~20-30
- Hash 0x0D6A5CD5 references found: 11 locations
