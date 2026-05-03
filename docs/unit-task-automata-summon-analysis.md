# UnitTaskAutomata Summon/Assist System Deep Analysis

## Overview

The Summon system handles all "assist call" mechanics in EXVS2 — when a player summons an ally unit to perform an action (rush attack, shooting, defense, follow, grapple, etc.).

---

## Summon CCmdActionManager Hierarchy

```
CCmdActionManagerAbstract
  └── CCmdActionManager_Summon (base summon: 0x1415d4e08)
        │
        ├── CCmdActionManager_SummonRush (rush toward target)
        │     ├── CCmdActionManager_SummonRushShot (rush + shoot)
        │     ├── CCmdActionManager_SummonRushAttackNormal (rush + melee: 0x1415d50e8)
        │     │     └── CCmdActionManager_SummonRushAttackTaiatari (body slam)
        │     ├── CCmdActionManager_SummonRushGround (ground rush)
        │     └── CCmdActionManager_SummonRushShotMachinegun (rush + sustained fire)
        │
        ├── CCmdActionManager_SummonSlide (sliding approach: 0x1415d5218)
        │
        ├── CCmdActionManager_SummonGrap (grab/grapple attack: 0x1415dda40)
        │     └── CCmdActionManager_SummonGrapHitStart
        │
        ├── CCmdActionManager_SummonDefence (passive defense: 0x14163d010)
        │
        ├── CCmdActionManager_SummonDefenceFormation (formation defense: 0x1415d5810)
        │     └── CCmdActionManager_SummonDefenceFormationFriend
        │
        ├── CCmdActionManager_SummonTukimatoi (follow/escort: 0x14163e4c0)
        │     ├── CCmdActionManager_SummonTukimatoiAndAction (follow + attack: 0x1416f9b30)
        │     └── CCmdActionManager_SummonTukimatoiAndActionSimple
        │
        └── [EXVS2 Specific]
              CCmdActionManager_023CROSGN_002CROSFC_001_SummonVigna2
              CCmdActionManager_059NEXTGN_004NEXTGS_001_SummonRock
              CCmdActionManager_059NEXTGN_004NEXTGS_001_SummonRockEffect
              CCmdActionManager_059NEXTGN_004NEXTGS_001_SummonRockEntry
```

---

## CCmdActionManager_Summon vtable Interface (10 slots)

| Slot | Offset | Base Implementation | Purpose |
|------|--------|------|------|
| 0 | +0 | Destructor | Cleanup |
| 1 | +8 | sub_140DEFA00 | **Execute** (template method - shared across all summon types) |
| 2 | +16 | sub_1406728A0 | Base cleanup |
| 3 | +24 | nop | Reserved hook |
| 4 | +32 | sub_140DF0BB0 | **SharedInit** - called by Execute |
| 5 | +40 | nop (base) | **ConfigureMovement** - KEY OVERRIDE POINT per variant |
| 6 | +48 | sub_140DF0500 | **SetupActions** - shared action config |
| 7 | +56 | sub_140DF02E0 | **PostSetup** - final configuration |
| 8 | +64 | nop | Reserved hook |
| 9 | +72 | sub_140DF1970 | Additional processing |

### Slot 5 Overrides (defines the summon behavior variant):

| Type | Function | Behavior |
|------|------|------|
| Summon (base) | nop | Static appearance (no movement) |
| SummonRushAttackNormal | sub_140DF2360 | 3-phase: Rush → Attack → Retreat |
| SummonTukimatoi | sub_1411AB4B0 | Follow player continuously |
| SummonSlide | (TBD) | Sliding approach to target |
| SummonGrap | (TBD) | Grab and hold target |

---

## Execute Template Method Pattern (sub_140DEFA00)

The shared Execute method orchestrates the summon lifecycle:

```
Execute(this, actionGroup, context):
    1. pre_setup = sub_140DEFB20(...)         // Read base parameters
    2. call vtable[4](actionGroup, context)    // SharedInit - physics/spawn
    3. mid_setup = sub_140DF0970(...)          // Create physics + movement
           └── calls vtable[5](physicsBody)    // ConfigureMovement (per-type!)
           └── adds CCmdAction_RotateOffsetBoneForUpvectorZ
    4. call vtable[6](actionGroup, context)    // SetupActions - animation/effect
    5. add CCmdAction_Blank                    // Separator
    6. call vtable[7](actionGroup, context)    // PostSetup - finalization
    7. if params+532 flag:
           call sub_140DF0DC0(...)             // Special post-processing
```

---

## SummonRushAttackNormal: 3-Phase Pipeline (sub_140DF2360)

This is the most common assist pattern in EXVS2 (e.g., Dom assist, Gundam assist attacks).

```
Phase 1: APPROACH (priority 1)
├── CCmdActionGroup_Series
│   └── Configured by vtable[10] (offset 80)
│       - Sets approach movement (rush toward target)
│       - Defines approach speed, curve, timing
└── Added to physics body's action queue

Phase 2: ATTACK (priority 2)
├── CCmdActionGroup_Series
│   ├── Configured by vtable[11] (offset 88)
│   │   - Sets attack animation/behavior
│   └── sub_140DF2770: additional attack effects
└── Added to physics body's action queue

Phase 3: RETREAT (conditional, priority 2)
├── CCmdActionGroup_Series
│   ├── New physics body created
│   ├── Configured by vtable[12] (offset 96)
│   │   - Sets exit/retreat movement
│   └── sub_140DF1DD0: exit parameters
│       - params+672: retreat speed
│       - params+676: retreat direction
│       - params+680: retreat duration
│       - params+684: retreat flags
│       - params+688: enable flag
└── Added to physics body's action queue
```

---

## Key CCmdAction Types Used by Summon

| Action Type | Purpose |
|---|---|
| `CCmdAction_RotateOffsetBoneForUpvectorZ` | Keeps summoned unit upright during movement |
| `CCmdAction_Blank` | Phase separator / sequence marker |
| `CCmdActionGroup_Series` | Sequential action container for each phase |
| `CCmdAction_StandardHomingMoveSet` | Homing movement (used in rush approach) |
| `CCmdAction_WaitForLifeTimeEnd` | Phase duration timer |

---

## UnitTaskAutomata Summon-Specific Vtable Differences

Compared to Throw/FreeFall types, Summon UnitTasks override additional slots in the 80-92 range:

| Slot | Summon Override | Purpose |
|------|------|------|
| 81 | Different factory | Creates CCmdActionManager_Summon* variant |
| 84 | sub_140F80C50 | Summon-specific configuration |
| 87 | sub_140F6BA80 | Summon entry animation setup |
| 88 | sub_140F80BD0 | Summon positioning |
| 89 | sub_140F80C80 | Summon targeting |

---

## Parameter Data Layout for Summon Types

```
Parameter block (accessible via this+13472 pointer):
  +0x010 (16): approach_mode
  +0x024 (36): attack_mode
  +0x064 (100): config_byte_A
  +0x1A3 (435): has_rotation_flag
  +0x1B0 (432): base_config_flags
  +0x1B1 (433): config_byte_B
  +0x214 (532): post_processing_flag
  +0x2A0 (672): retreat_speed
  +0x2A4 (676): retreat_direction
  +0x2A8 (680): retreat_duration
  +0x2AC (684): retreat_flags
  +0x2B0 (688): retreat_enabled
```

---

## Template: Creating a New Summon UnitTask

### Step 1: Create EXVS2 UnitTask class
Override the standard 15 vtable slots. For slot 81, create a custom CCmdActionManager that inherits from CCmdActionManager_Summon.

### Step 2: Create custom CCmdActionManager
```cpp
class CCmdActionManager_MySummon : public CCmdActionManager_Summon {
    // Only need to override slot 5 (ConfigureMovement)
    virtual void ConfigureMovement(physicsBody, context) {
        // Phase 1: Create approach action group
        auto approach = new CCmdActionGroup_Series();
        // ... configure approach
        
        // Phase 2: Create attack action group  
        auto attack = new CCmdActionGroup_Series();
        // ... configure attack
        
        // Phase 3 (optional): Create retreat
        auto retreat = new CCmdActionGroup_Series();
        // ... configure retreat
    }
};
```

### Step 3: Register to global table
Call the registration function pattern to add to the UnitTask constructor table.

---

## Game Examples

| Unit | Assist Type | CCmdActionManager | Behavior |
|---|---|---|---|
| Dom (017DOM000) | AssistDomGrap | SummonRushAttackNormal or SummonGrap | Rush → Grab → Hold |
| Dom (017DOM000) | AssistDomShot | SummonRushShot | Rush → Beam shot |
| Dom (017DOM000) | AssistDomShotSlide | SummonSlide | Slide approach → Shot |
| Dom (017DOM000) | AssistDomTsukimatoiShot | SummonTukimatoi | Follow → Periodic shots |
| Methuss (002HYAKUS) | Methuss | Summon (base) | Static appearance + heal |
| GDefenser (005GUNMK2) | GDefenserKatu | SummonDefence | Formation defense shield |
