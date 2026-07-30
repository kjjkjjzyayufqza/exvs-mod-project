# 002ZGUNDM (Zeta Gundam Group) Complete Weapons Analysis

Binary: vsac27_Release.exe (OB v27, base 0x140000000), live IDA instance ida-50652.
Method: vtable located via slot-81 (CreateCmdActionManager) data xref, then verified by reading
the RTTI CompleteObjectLocator at vtable-8 and the TypeDescriptor name string. Every vtable
address below was confirmed this way at address level unless noted.

Evidence grades: **A** = address-level proof + corroboration, **B** = consumer known / details open,
**C** = weak, **U** = not found, **S** = structural only, **R** = prior claim rejected.

## Overview

The 002ZGUNDM series group contains **19 UnitTaskAutomata classes** across 9 sub-units.
The Phase 4 priority weapons (BeamConfuse, ThrowRifleSaber) belong to sub-unit 001ZGUNDM
(the Zeta Gundam itself) and are analyzed in depth. The other 17 received a census pass
(vtable identity, manager class, manager base, Execute identity).

### Class Census (all vtable addresses RTTI-verified, grade A)

| Sub-unit | Weapon | UnitTask vtable | Archetype (RTTI base) | CreateCAM (slot 81) |
|---|---|---|---|---|
| 001ZGUNDM | **BeamConfuse** | 0x1413F0548 | Detonator (via Throw) | 0x140F40D80 |
| 001ZGUNDM | **ThrowRifleSaber** | 0x1413F0870 | 000COMMON ThrowSaber (via Throw) | 0x140F38FD0 (shared) |
| 002HYAKUS | Dodai | 0x1413F0EC8 | Throw | 0x140F41290 |
| 002HYAKUS | Mega | 0x1413F11F0 | RadiconParentActor | 0x140F41310 |
| 002HYAKUS | Methuss | 0x1413F0B98 | Summon | 0x140F41190 |
| 004THEO00 | AssistBolinoakSammahn | 0x14163CCE0 | SummonDefence | 0x140F41B30 |
| 004THEO00 | AssistPalaceAthene | 0x14163C890 | SummonRush | 0x140F41720 |
| 005GUNMK2 | GDefenserBody | 0x1413F1B68 | Throw | 0x140F41E10 |
| 005GUNMK2 | GDefenserKatu | 0x1413F1840 | Throw | 0x140F41D20 |
| 005GUNMK2 | ThrowKatu | 0x1413F1518 | Throw | 0x140F41C30 |
| 006HAMBRB | AssistHambrabi | 0x1413F1E90 | SummonTukimatoi | 0x140F41F80 |
| 006HAMBRB | UmihebiExplosion | 0x1413F21C0 | Sticker | 0x140F422E0 |
| 006HAMBRB | UmihebiModoki | 0x1413F24F8 | Throw | 0x140F424C0 |
| 011RKDIAS | MochiLauncher | 0x1413F2820 | Throw | 0x140F42730 |
| 013MARASI | AssistMarasai | 0x1413F2B48 | SummonTukimatoiAndActionSimple | 0x140F42A10 |
| 014GABTLY | AssistGabthley | 0x1413F31B0 | SummonRushAttackNormal | 0x140DE1B80 (shared) |
| 014GABTLY | ExplosionSaber | 0x1413F2E78 | Sticker | 0x140F42A70 |
| 018DIJEH0 | BeamRifleThrow | 0x1413F34E0 | ThrowStopRotateOnStick | 0x140F42D40 |
| 018DIJEH0 | Dodai | 0x1413F3808 | Throw | 0x140F42FA0 |

UnitTask vtables use the standard 100-slot layout (93 base + 7 framework slots); consecutive
vtables are 0x328 bytes apart (100 slots + COL pointer). Slot 81 sits at vtable+0x288.

### Key Architectural Difference vs 001GUNDAM

001GUNDAM weapons instantiate the **generic VDK managers directly** (CCmdActionManager_Throw,
_Detonator, etc.). In the 002ZGUNDM group, **nearly every weapon has its own named EXVS2
CCmdActionManager subclass** (RTTI-visible, e.g. `EXVS2::CCmdActionManager_002ZGUNDM_002HYAKUS
_001_Dodai`), even when the subclass adds no code (Execute fully inherited). Grade A
(factory/constructor decompiles list the vftable symbols). Only AssistGabthley uses a plain
VDK generic manager (CCmdActionManager_SummonRushAttackNormal), and ThrowRifleSaber reuses the
COMMON ThrowSaber manager.

### Manager Census (grade A on identity, from factory + ctor decompiles)

| Weapon | Manager class (EXVS2 unless noted) | Mgr vftable | Alloc | Derives (ctor chain) | Execute (slot 1) |
|---|---|---|---|---|---|
| BeamConfuse | CCmdActionManager_..._BeamConfuse | 0x14163C540 | 0x130 | Detonator (ctor 0x140DDFFC0) | **0x140FA3890 (custom)** |
| ThrowRifleSaber | CCmdActionManager_000COMMON_000COMMON_001_ThrowSaber | 0x1415E78B0 | 0x120 | Throw 0x1415D4048 | 0x140DEA280 (inherited Throw) |
| Dodai (HYAKUS) | CCmdActionManager_002ZGUNDM_002HYAKSK_001_Dodai | 0x14163C730 | 0x120 | Throw | 0x140DEA280 (inherited) |
| Mega | CCmdActionManager_002ZGUNDM_002HYAKSK_001_Mega | 0x14163C7E8 | 0x110 | root mgr (ctor 0x140DDC790) | **0x140FA3E20 (custom)** |
| Methuss | CCmdActionManager_002ZGUNDM_002HYAKSK_001_Methuss | 0x14163C630 | 0x120 | Summon 0x1415D4E08 | 0x140DEFA00 (inherited Summon) |
| AssistBolinoakSammahn | CCmdActionManager_..._AssistBolinoakSammahn | 0x14163D0E8 | 0x120 | VDK SummonDefence 0x14163D010 (ctor 0x140F41A40) | 0x140DEFA00 (inherited) |
| AssistPalaceAthene | CCmdActionManager_..._AssistPalaceAthene | 0x14163CBC0 | 0x120 | VDK SummonRush 0x1415D4EB0 (ctor 0x140DE1670) | 0x140DEFA00 (inherited) |
| GDefenserBody | CCmdActionManager_..._GDefenserBody | 0x14163D3D8 | 0x120 | Throw | 0x140DEA280 (inherited) |
| GDefenserKatu | CCmdActionManager_..._GDefenserKatu | 0x14163D2F8 | 0x120 | Throw | 0x140DEA280 (inherited) |
| ThrowKatu | CCmdActionManager_..._ThrowKatu | 0x14163D218 | 0x120 | Throw | 0x140DEA280 (inherited) |
| AssistHambrabi | CCmdActionManager_..._AssistHambrabi | 0x14163D498 | **0x2C0** | VDK::GAM CCmdActionManager_..._AssistHambrabiAbstract 0x14166DB58 (ctor 0x140FA7070) | **0x140FA81C0 (custom)** |
| UmihebiExplosion | CCmdActionManager_..._UmihebiExplosion | 0x14163D580 | 0x120 | root mgr (ctor 0x140DDC790) | **0x140FAD070 (custom)** |
| UmihebiModoki | CCmdActionManager_..._UmihebiModoki | 0x14163D648 | 0x120 | Throw | 0x140DEA280 (inherited) |
| MochiLauncher | CCmdActionManager_..._MochiLauncher | 0x14163D730 | 0x120 | Throw | **0x140FADB50 (custom)** |
| AssistMarasai | CCmdActionManager_..._AssistMarasai | 0x14163D7E8 | 0x1F0 | SummonTukimatoiAndAction family (ctor 0x1411AA5C0) | **0x1411AA680 (custom)** |
| AssistGabthley | VDK CCmdActionManager_SummonRushAttackNormal | 0x1415D50E8 | 0x130 | VDK SummonRush (ctor 0x140DE1670) | 0x140DEFA00 (inherited) |
| ExplosionSaber | CCmdActionManager_..._ExplosionSaber | 0x14163D8E0 | 0x110 | root mgr (ctor 0x140DDC790) | 0x140DEBEB0 (inherited **Sticker** Execute) |
| BeamRifleThrow | CCmdActionManager_..._BeamRifleThrow | 0x14163D988 | 0x120 | VDK ThrowStopRotateOnStick 0x1415D44F8 (ctor 0x140DDCC80) | 0x140DEA280 (inherited) |
| Dodai (DIJEH0) | CCmdActionManager_002ZGUNDM_018DIJEH0_001_Dodai | 0x14163DA68 | 0x120 | Throw | 0x140DEA280 (inherited) |

RTTI quirk (grade A): the manager classes of the 002HYAKUS weapons are named `002HYAKSK`
(Dodai, Mega, Methuss) while the UnitTask classes say `002HYAKUS`. This is a source-side
spelling inconsistency preserved in the binary, useful as a fingerprint.

---

## 1. BeamConfuse (001ZGUNDM)

**RTTI chain** (grade A, exvs2-unit-rtti-hierarchy.csv rows 990-1003, TypeDescriptor read at
0x142070AC0): `CUnitTaskAutomata_002ZGUNDM_001ZGUNDM_001_BeamConfuse@EXVS2` ->
`CUnitTaskAutomataDetonator@GAM@VDK` -> `CUnitTaskAutomataThrow` -> RadiconParentActor ->
Radicon -> Abstract.

**Archetype**: Detonator (timed-fuse thrown bomb, same family as 001GUNDAM NapalmBomb) plus a
unit-specific **external trigger continuation** that no other Detonator sampled so far has.

### VTable Overview (vtable 0x1413F0548, diff vs ThrowRifleSaber / COMMON ThrowSaber baseline)

| Slot | Function | Status |
|---|---|---|
| 2 (OnInit) | 0x140F40DE0 | override: framework OnInit 0x1406A5BA0 + writes hash 0xA6446195 |
| 71 (OnTrigger) | 0x140F6E870 | override: nop in Throw-family classes; thunk to vtable[94] |
| 74 | 0x140F40E10 | override: hit-record scan, forwards to 0x140DE0050 |
| 79 (ConfigureDamageInfo) | 0x140F40F90 | override, NapalmBomb-style chain |
| 81 (CreateCmdActionManager) | 0x140F40D80 | own manager subclass, alloc 0x130 |
| 84 | 0x140F40ED0 | override: hit area type 3, zero offset |
| 86 | 0x140F40E60 | override: param-gated mode flag (hash 0xAB606D9E) |
| 88 | 0x140DDC960 | base rotation setup (shared, NOT overridden) |
| 89 | 0x140F40F00 | override: motion set from hash 0xD8F283FB + pair 0x22EC98AC / 0xF39535B2 |
| 91 | nop | (ThrowSaber family overrides this; BeamConfuse does not) |

All grades A (raw vtable dump at 0x1413F0548, 800 bytes, decoded slot by slot).

### ConfigureDamageInfo (slot 79, sub_140F40F90) - grade A

```
sub_140F40F90(this, dmg):
  sub_140DE0070(this, dmg)        // same FreeFall/Detonator base as NapalmBomb:
                                  //   sub_140DDCAF0: type=1, flags=1, power|=0x50,
                                  //     piercing check via hash 0x397A280D
                                  //   then power+104 &= ~0x10, power+148 = 1
  dmg+408 = 9                     // explosion mode 9 (identical to NapalmBomb)
  dmg+104 &= 0xFFFFFFE3           // clears bits 0x1C (0x04|0x08|0x10)
  dmg+108 = 1                     // damage scale
  dmg+433 = 0                     // secondary tracking OFF
  dmg+148 = 1                     // explosion type (re-asserted)
  dmg+435 = 0                     // extra flag cleared (meaning open, grade S)
```

Delta vs NapalmBomb (001GUNDAM doc): NapalmBomb only clears 0x10 from dmg+104; BeamConfuse
clears 0x1C and additionally zeroes dmg+435. Everything else in the chain matches.

### Manager: CCmdActionManager_002ZGUNDM_001ZGUNDM_001_BeamConfuse - grade A

Factory sub_140F40D80: allocate 0x130, memset 0, Detonator ctor sub_140DDFFC0, set vftable
0x14163C540 (second vftable pointer at object+0x30 -> 0x14163C578).

Manager vtable diff vs CCmdActionManager_Detonator (0x1415D4C38): **only slot 1 (Execute)
differs** (0x140FA3890 vs 0x140DEDB20). Slots 2-5 (0x1406728A0, 0x140DEA2C0, 0x140DEABB0,
0x140DEA540) and the secondary interface slots are byte-identical. Grade A (both vtables read).

#### Execute (0x140FA3890) - grade A

```
BeamConfuse::Execute(this, ctx, a3):
  sub_140DEDB20(this, ctx, a3)    // FULL generic Detonator::Execute
                                  //   (fuse series: SetInteractEnableModeAll(0) ->
                                  //    WaitByFrame(hash 0x4C55EA3D, default 10 frames if
                                  //    param <= 1e-6) -> SetInteractEnableModeAll(1);
                                  //    optional ShotBullet from hash 0x41435BE6 anchored
                                  //    at mgr+288)
  blank = new CCmdAction_Blank (0x20)
  append blank to the instance action list (keyValuePtr slot, index at +240)
  unknown_libname_23(this+232, blank, keyValuePtr)   // store trigger anchor:
                                  //   mgr+232 = blank action, mgr+240 = action list
```

Fresh decompile of sub_140DEDB20 in this session confirms execute-analysis.md section 5
verbatim, and adds one detail: the fuse WaitByFrame defaults to 10 frames when the
0x4C55EA3D parameter is missing or <= 0.000001.

#### External Trigger Mechanism (the unit-specific behavior) - grade A on the chain

BeamConfuse is the only class in the sampled set that un-nops **slot 71 (OnTrigger)**:

```
slot 71 (0x140F6E870):  return this->vtable[94](this);           // thunk
slot 94 (0x14066DAF0):  return sub_1406899D0(*(this+13480));     // manager, see R-1 below
sub_1406899D0(mgr):
  ownerMode = owner->vtable[93]()          // GetMode via sub_14068D4F0(mgr)
  if (ownerMode != 0) { mgr+224 = ownerMode; return; }   // defer while in a mode
  if (mgr+228 == 0) {                       // one-shot latch
    mgr+228 = 1
    ... (timeline reset via sub_14066FCC0 when ctx+160 < 0)
    if (mgr+232 != 0) {                     // trigger anchor present?
      sub_140689AB0(ctx+10744, &tmp)
      unknown_libname_23(mgr+176, *(mgr+232), *(mgr+240))  // re-link the stored Blank
                                                           // into the live anchor at +176
      sub_14068D520(mgr)                    // advance action processing
    }
  }
```

The generic trigger path is inert unless something populates mgr+232. BeamConfuse::Execute is
exactly the code that populates it (same helper, same offsets 232/240). Interpretation: when an
external trigger fires, the manager fast-forwards its action sequence to the stored Blank
placed after the fuse series, i.e. **immediate detonation on trigger, bypassing the remaining
fuse wait**. Mechanism grade A; the in-game trigger source (canonically, shooting the thrown
saber to scatter beams) was not traced to its caller in this session, grade C on that
gameplay-level attribution.

### Other Overrides

- **OnInit (slot 2, 0x140F40DE0)** - grade A: runs framework OnInit sub_1406A5BA0, then writes
  constant **0xA6446195** to `*(this+13512) + 180`. Semantics of the +13512 component field are
  open (grade S); the constant looks like a name/effect hash (grade C).
- **Slot 74 (0x140F40E10)** - grade A: scans up to 32 records (stride 112 bytes, first field at
  +100) of the passed array for a record with state == 1; on match tail-calls sub_140DE0050,
  which forwards `mgr = *(this+13480)` and `mgr+288` to sub_140672840. sub_140DE0050 is the
  exact function NapalmBomb installs directly in its slot 74 (001GUNDAM doc); BeamConfuse adds
  the state==1 gate in front of it.
- **Slot 84 (0x140F40ED0)** - grade A: hit area type = 3 (same "large melee" type as
  BeamJavelin), but offset byte+1 = 0 and dword+8 = 0 (no forward hit offset, unlike
  BeamJavelin's 15.0).
- **Slot 86 (0x140F40E60)** - grade A structure: reads float param hash **0xAB606D9E**; if
  `value * 0.5 > 0` calls sub_14066F900(out) and sets out[0] = 1. Parameter meaning open
  (grade U on semantics).
- **Slot 89 (0x140F40F00)** - grade A structure: reads param hash **0xD8F283FB** (same motion
  id key the ThrowSaber family uses) and calls sub_14062B180(out, 0, 0, &0x22EC98AC, [value],
  &0xF39535B2, 0). Matches the 001GUNDAM finding that slot 89 selects animation/motion hash
  sets; the pair 0x22EC98AC / 0xF39535B2 is BeamConfuse's set.

---

## 2. ThrowRifleSaber (001ZGUNDM)

**RTTI chain** (grade A, CSV rows 1004-1017, TypeDescriptor read at 0x142070B20):
`CUnitTaskAutomata_002ZGUNDM_001ZGUNDM_001_ThrowRifleSaber@EXVS2` ->
`CUnitTaskAutomata_000COMMON_000COMMON_001_ThrowSaber@EXVS2` -> `CUnitTaskAutomataThrow` -> ...

**Archetype**: the COMMON thrown-saber template. This is the "rifle saber" move (saber thrown
together with the beam rifle). Its entire unit-specific code surface is **two vtable slots**.

### VTable Diff vs COMMON ThrowSaber (0x1413E2790) - grade A (both 800-byte dumps compared)

| Slot | COMMON ThrowSaber | ThrowRifleSaber | Meaning |
|---|---|---|---|
| 83 | 0x140674D00 (base) | **0x140F40FE0** | adds an effect/SE registration |
| 88 | 0x140DDC960 (base rotation) | **0x140F41020** | adds extra per-channel rotations |
| all other 98 slots | identical | identical | including slot 79/84/89/91 and factory 78 |

Slot 81 (0x140F38FD0) is the **shared ThrowSaber manager factory** used by 17 vtables across
units (xref count, grade A): allocate 0x120, ctor sub_140E0D3C0 which builds
CCmdActionManager_Throw then rebinds to `EXVS2::CCmdActionManager_000COMMON_000COMMON_001_
ThrowSaber` (vftable 0x1415E78B0). Consequence: per-unit differences of all rifle/saber throw
weapons flow through the unit's parameter namespace, not through manager code.

### Manager: COMMON ThrowSaber manager - grade A

Vtable diff vs CCmdActionManager_Throw (0x1415D4048): primary slots 0-5 identical
(Execute = 0x140DEA280, the documented thin wrapper that dispatches to primary slot 3 =
0x140DEA2C0, the standard Throw pipeline builder). The only override is **secondary interface
slot [3]** (vftable+0x38+0x18): base 0x14068DFD0 vs ThrowSaber 0x140F970F0.

```
base   0x14068DFD0: if (params+114) append CCmdAction_ResetOffsetBoneForUpvectorZ (0x40)
saber  0x140F970F0: always append CCmdAction_DeleteProjectileDepiction (0x28)
```

Grade A on both bodies; grade B on the invocation point (the secondary interface's slot [1] is
the shared execute template sub_14068E280 documented for ThrowShield in the 001GUNDAM doc, and
slot [3] is its per-class hook). Net effect: thrown-saber projectiles delete their visual
depiction in the release/cleanup phase instead of resetting bone orientation.

### Shared ThrowSaber Family Functions (identical addresses in TRS and COMMON ThrowSaber)

- **Slot 79 ConfigureDamageInfo (0x140F391A0)** - grade A:
  ```
  sub_140DDCAF0(this, dmg)      // EXVS2 common: type=1, flags=1, power|=0x50,
                                //   piercing check hash 0x397A280D
  dmg+104 = 130                 // power 130 (assignment, same value as BeamJavelin)
  dmg+108 = 2                   // damage scale 2
  dmg+100 = 1 (byte)            // active
  dmg+433 = 0                   // secondary tracking OFF
  if (param[0x67921CDD] > 0) dmg+152 = 1    // conditional, vs BeamJavelin's unconditional
  ```
- **Slot 84 (0x140F39070)** - grade A: generic base sub_140DDCAC0, then reads lifetime hash
  **0x4C55EA3D** and stores vector (lifetime + 10.0, 0, 0, 0) at out+16.
- **Slot 88 base (0x140DDC960)** - grade A: reads three Euler angles in degrees, converts to
  radians, applies to channel/mode constant 1 (dword_1415D4014) of sub-object 0:
  X from hash **0xD55CBB87**, Y from **0xA25B8B11**, Z from **0x3B52DAAB**.
  Note: 0xD55CBB87 also appears in FreeFly Execute as a wait-frames key; keys are per-unit
  parameter names, so cross-archetype reuse of the same hash with different meaning is
  expected (grade B note, not a contradiction).
- **Slot 89 (0x140E36F40)** - grade A structure: builds TWO motion phases via sub_140F39A50
  (phase 0 and phase 1), each from a hashed parameter set, with all float params scaled by
  0.01 (percent to fraction):
  - Phase 0: id 0x36FCE2D7, effect 0x41FBD241 (the documented attached-effect-ID key),
    motion 0xD8F283FB, floats 0xFAA5615C / 0xABEDC73A / 0xDCEAF7AC.
  - Phase 1: id 0xDF9F47E2, aux 0xA8987774, motion 0xD8F283FB, floats 0x13C6C469 /
    0x8ACF95D3 / 0xFDC8A545 / 0x63AC30E6 / 0x14AB0070 / 0x8DA251CA.
  Float-encoded hash constants were recovered from the decompiler's IEEE754 literals
  (bit-exact reconstruction, verified round-trip).
- **Slot 91 (0x140F390E0)** - present in both, not decompiled this session (grade U).

### ThrowRifleSaber Unique Slots

- **Slot 83 (0x140F40FE0)** - grade A structure: base sub_140674D00, then
  `sub_14068B110(ctx, 0x6C223882)` and `sub_14068B0F0(ctx, 0x6C223882, &0x721D4A5F, 0)`.
  Registration helpers with an id pair; semantics (effect/SE binding for the rifle prop)
  grade B.
- **Slot 88 (0x140F41020)** - grade A structure: base rotation setup 0x140DDC960 first, then
  two extra rotation registrations on sub-object 0 and a final action:
  ```
  sub_140334920(obj, &0xBFED0531, 0.0, 0.0, pi/2, 0, 0, -1, 0)      // +90 deg Z
  sub_140334920(obj, &0x70E96EC0, 0.0, -1.6929694, 0, 0, 0, -1, 0)  // -97 deg Y (radians)
  sub_1403349C0(obj, &0xE0BCC747, ...)
  ```
  The base call uses frame arg 1, these use -1 (persistent). Interpretation as orientation
  offsets for the combined rifle+saber prop: grade B.

### Key Difference Summary: BeamConfuse vs ThrowRifleSaber

| Property | BeamConfuse | ThrowRifleSaber |
|---|---|---|
| Base archetype | Detonator (fuse bomb) | COMMON ThrowSaber (directed throw) |
| Manager | own subclass, Execute override | shared COMMON ThrowSaber manager, no Execute code |
| External trigger (slot 71) | YES (only sampled class with it) | no (nop) |
| Damage | explosion mode 9, scale 1, power from hash | power 130, scale 2 |
| Secondary tracking | OFF | OFF |
| Piercing | conditional (hash 0x397A280D) | conditional (same hash) |
| Unique slots | 2, 71, 74, 79, 81, 84, 86, 89 | 83, 88 only |

---

## 3. Breadth Notes on the Other 17 (grade as marked)

- **Throw-family clones** (Dodai x2, GDefenserBody/Katu, ThrowKatu, UmihebiModoki,
  MochiLauncher pattern): managers derive CCmdActionManager_Throw via the standard ctor
  sequence (root ctor 0x140DDC790 -> Throw vftable -> zero a1[34]/a1[35] + sub_1406BF3C0 ->
  own vftable). All except MochiLauncher inherit Execute 0x140DEA280 unchanged (grade A);
  their behavior differences live in UnitTask-side slots and parameters (not diffed this
  session, grade U).
- **MochiLauncher** overrides Execute (0x140FADB50, not decompiled, grade U on contents).
- **Mega** (RadiconParentActor archetype): manager derives the root manager directly and
  overrides Execute (0x140FA3E20, not decompiled). Consistent with Radicon base Execute being
  pure virtual (execute-analysis section 3).
- **Summon family**: Methuss (Summon), Bolinoak (SummonDefence), PalaceAthene (SummonRush),
  Gabthley (SummonRushAttackNormal) all inherit the documented generic Summon Execute
  0x140DEFA00 (grade A); per-phase deltas beyond slot 1 not analyzed (grade U).
- **AssistHambrabi**: largest manager in the group (0x2C0). Its base is itself a unit-named
  class in the VDK namespace (`VDK::GAM::CCmdActionManager_002ZGUNDM_006HAMBRB_001_
  AssistHambrabiAbstract`, vftable 0x14166DB58, Execute = Summon 0x140DEFA00), and the ctor
  initializes a 12-entry x 32-byte tracking array at +288 (fields: -32, 0, 1, null, null) plus
  a counter/list at +672/+680 (grade A structure). The EXVS2 subclass overrides Execute
  (0x140FA81C0, not decompiled, grade U).
- **Sticker pair**: ExplosionSaber inherits the generic Sticker Execute 0x140DEBEB0
  (documented in ida-analysis section 8.5), while UmihebiExplosion overrides Execute
  (0x140FAD070, not decompiled). Both derive the root manager ctor directly.
- **BeamRifleThrow** (Dijeh): manager derives VDK ThrowStopRotateOnStick (ctor 0x140DDCC80)
  and inherits the Throw Execute wrapper; the stop-rotate-on-stick behavior therefore comes
  from the base class's non-Execute overrides (not diffed, grade U).

## 4. New Hash Discoveries

| Hash | Where | Role | Grade |
|---|---|---|---|
| 0xA6446195 | BeamConfuse OnInit | constant written to component(+13512)+180 | S |
| 0xAB606D9E | BeamConfuse slot 86 | float param, halved, > 0 gates a mode flag | B |
| 0xD8F283FB | BeamConfuse + ThrowSaber slot 89 | motion set id (both phases) | A (usage) |
| 0x22EC98AC / 0xF39535B2 | BeamConfuse slot 89 | motion hash pair (BeamConfuse set) | B |
| 0x67921CDD | ThrowSaber slot 79 | conditional damage flag (+152) | B |
| 0x3B52DAAB / 0xA25B8B11 / 0xD55CBB87 | slot 88 base | initial rotation Z / Y / X (degrees) | A (usage) |
| 0x36FCE2D7, 0xFAA5615C, 0xABEDC73A, 0xDCEAF7AC | ThrowSaber slot 89 phase 0 | id + 3 scaled floats | B |
| 0xDF9F47E2, 0x13C6C469, 0x8ACF95D3, 0xFDC8A545, 0x63AC30E6, 0x14AB0070, 0x8DA251CA, 0xA8987774 | ThrowSaber slot 89 phase 1 | id + aux + 6 scaled floats | B |
| 0x6C223882 (+ id 0x721D4A5F) | ThrowRifleSaber slot 83 | effect/SE registration pair | B |
| 0xBFED0531, 0x70E96EC0, 0xE0BCC747 | ThrowRifleSaber slot 88 | rotation channel ids for rifle+saber prop | B |
| 0x41FBD241 | ThrowSaber slot 89 phase 0 | attached effect ID (same key as ShockHalo doc) | A (cross-ref) |

## 5. R-Grade Findings (contradictions with existing docs; source docs NOT edited)

- **R-1: object at UnitTask+13480 is the CCmdActionManager, not a physics component.**
  - Contradicted claims: unit-task-automata-deep-analysis.md memory map ("+0x34A8
    physics_component*, Physics simulation component, returned by vtable[94]") and
    unit-task-automata-ida-analysis.md slot 94 row ("GetPhysicsBody(this->physics_13480)");
    unit-task-automata-vtable-reference.md slot 94 ("Returns physics subsystem from
    object+13480").
  - Proof: unit-task-automata-spawn-trace.md section 2.9 step 4 already records
    `this+13480 = vtable[81](this)` (the CreateCmdActionManager result), and this session's
    trigger chain closes it at address level: BeamConfuse manager Execute (0x140FA3890) writes
    mgr+232/mgr+240 via unknown_libname_23, and sub_1406899D0 (reached via slot 94 on
    `*(this+13480)`) reads exactly +232/+240 and re-links via the same helper at +176.
    The two docs disagree with spawn-trace; spawn-trace is correct. Grade R against the
    "physics component" label; the slot-94/OnTrigger BEHAVIOR descriptions remain valid.
- **R-2 (minor): unit-task-automata-deep-analysis.md line ~608 labels sub_140DEA2C0 as
  "CCmdActionManager_Throw::Execute()".** The Execute slot is sub_140DEA280 (thin wrapper);
  sub_140DEA2C0 is the primary-vtable slot 3 pipeline builder it dispatches to.
  ida-analysis section 8.2 and the Sazabi doc state this correctly.

## 6. Not Reached / Unresolved

- Custom manager Execute bodies NOT decompiled (breadth cutoff): Mega 0x140FA3E20,
  AssistHambrabi 0x140FA81C0, UmihebiExplosion 0x140FAD070, MochiLauncher 0x140FADB50,
  AssistMarasai 0x1411AA680. Identified as overrides (grade A) with contents open (grade U).
- UnitTask-side 100-slot vtable diffs were performed only for BeamConfuse and ThrowRifleSaber;
  the 17 census classes have verified vtable addresses but undiffed slot tables.
- BeamConfuse slot 86 parameter semantics (hash 0xAB606D9E) and the +13512 component field
  written by OnInit: unresolved (U).
- ThrowSaber family slot 91 (0x140F390E0): not decompiled (U).
- The runtime caller that fires BeamConfuse's slot 71 OnTrigger (gameplay-side detonation
  source) was not traced (U); only the in-object mechanism is proven.
- IDA query-class failures this session: one decompile timeout (sub_1406899D0, succeeded on a
  single retry) and one disasm timeout (0x140E36F40, not retried; float-encoded hash
  immediates were recovered locally from the decompiler output instead). Both attributed to
  queue contention from a concurrent agent on the same instance; no broad queries were run.
