# EXVS2 Unit Weapons Tree — CUnitTaskAutomata System

## System Architecture Overview

```
CUnitTaskAutomata (Entity Layer)
  └── CCmdActionManager (Behavior Layer) ← vtable[81] factory
        └── CCmdAction / CCmdActionGroup (Action Layer) ← composable pipeline
```

Each unit's weapons are implemented as `CUnitTaskAutomata_{SeriesID}_{UnitID}_{Variant}_{WeaponName}@EXVS2`.

---

## VDK Base Archetype Reference

| Archetype | Motion Pattern | Typical Usage |
|-----------|---------------|---------------|
| FreeFall | Gravity projectile | Bombs, dropped objects |
| Throw | Directed throw + tracking | Thrown weapons, beam rifles |
| ThrowMortar | Mortar arc trajectory | Javelins, grenades |
| Boomerang | Out + return dual-phase | Boomerangs, returning weapons |
| Detonator | Timed/triggered explosion | Mines, napalm, timed bombs |
| ShockHalo | Expanding shockwave ring | Shockwaves, pressure waves |
| PutObj | Static placement | Mines, traps |
| Sticker | Attach to target on contact | Lock-on bombs, attached charges |
| Anchor | Hook/grapple (extend + retract) | Chain weapons, grapples |
| Radicon | Player-controlled remote | Funnels, wire-guided missiles |
| Funnel* | Autonomous flying bit variants | Funnels, bits, DRAGOONs |
| Summon* | Assist (appear + act + leave) | Striker assists, support calls |
| Attach | Attached to parent entity | Mounted sub-weapons |

---

## Analyzed Units — Weapon Trees

### 001GUNDAM / 001GUNDAM — RX-78-2 Gundam

```
RX-78-2 Gundam (2 variants: 001=Base, 002=G-Armor)
│
├── BeamJavelin (ビームジャベリン)
│   ├── Archetype: ThrowMortar
│   ├── Motion: Mortar arc + rotation
│   ├── Damage: type=1 (projectile), power=130, piercing=conditional
│   ├── Hit Zone: type=3 (large melee), offset=15.0 forward
│   ├── 001 vs 002: Animation hashes only (behavior identical)
│   └── Pipeline:
│       └── Series[ TerminateSeriesEnd, RotationVector(deg→rad), MainMortarMotion ]
│
├── NapalmBomb (ナパーム・ボム)
│   ├── Archetype: Detonator
│   ├── Motion: Timed fuse flight → delayed detonation
│   ├── Damage: type=1 (projectile), explosion_mode=9
│   ├── Special: Collision disabled during flight, enabled at detonation
│   ├── 001 vs 002: Functionally identical
│   └── Pipeline:
│       └── Parallel[
│             Series[ ThrowMotion, TerminateSeriesEnd ],
│             Series[ SetCollision(OFF), WaitByFrame(fuse), SetCollision(ON) ]
│           ] + optional ShotBullet (sub-munition)
│
├── ThrowShield (シールド投げ)
│   ├── Archetype: Throw (via Radicon chain)
│   ├── Motion: Directed throw + secondary tracking
│   ├── Damage: type=1 (projectile), power=138, secondary_tracking=ON
│   ├── Special: Returns to owner (offset+433=1)
│   ├── 001 vs 002: Behavior pipeline identical
│   └── Pipeline:
│       └── Series[
│             Blank,
│             Series[ ThrowMotion, StickingMatrix, WaitForRelease, WaitByFrame ],
│             Series[ ReleaseStick, Cleanup ]
│           ]
│
└── HammerShot (ガンダムハンマー)
    ├── Archetype: CUSTOM (Chain/Anchor weapon)
    ├── Motion: SIMD chain arc dynamics (extend → swing → retract)
    ├── Damage: type=chain(4), chain_physics_hash
    ├── Object Size: 0x3540 (+16 bytes for collision tracking)
    ├── Override Count: 18 slots (most complex weapon in RX-78-2)
    ├── Special:
    │   ├── Only hits during active swing arc (slot 73 gate)
    │   ├── Auto-retraction after 1 second timeout
    │   └── Per-frame SIMD chain curvature calculation
    ├── 001 vs 002: Hit effect hashes only (Gundam Hammer vs Hyper Hammer)
    └── Pipeline:
        └── Custom chain physics (NOT using any standard CCmdActionManager template)
            ├── Anchor extend phase
            ├── SIMD arc calculation per frame
            ├── Collision: active during swing only
            ├── On hit: trigger retraction
            └── Timeout: 1 second → auto-retract
```

---

### 017GYAKCH / 002SAZABI — MSN-04 Sazabi

```
MSN-04 Sazabi (single variant)
│
├── ThrowHissatsuAxis (必殺技軸投げ — Tomahawk Axis Throw)
│   ├── Archetype: Throw (axis-guided)
│   ├── ClassId: 465 (inherited from FreeFall)
│   ├── Motion: Standard throw + multi-point axis collision tracing
│   ├── Damage: type=0x03 (HIT+STUN, no DOWN), multiplier=0
│   │   └── Actual damage via sub-munition spawn (hash 0x41435BE6)
│   ├── Special:
│   │   ├── Ground height detection (10 bands × 70 units, starting 200 above)
│   │   ├── Starts hidden, snaps to terrain
│   │   ├── 8-point axis collision scan (4 segment pairs)
│   │   ├── Returns to owner
│   │   └── "Trap" weapon: tomahawk itself does 0 damage
│   ├── Hit Zone: Sphere r=50, h=35, ±25 vertical sub-zones
│   └── Pipeline:
│       └── Series[ TerminateSeriesEnd, optional RotationVector, MainThrowMotion ]
│           + OnUpdate: axis-trace → sub-munition spawn
│
├── FunnelFly (ファンネル飛行 — Single Funnel)
│   ├── Archetype: Radicon (remote-controlled)
│   ├── ClassId: 977
│   ├── Motion: Multi-phase (approach → attack → loop? → return)
│   ├── Damage: type=0x80 (DOWN), funnel_mode=1, auto_track=1
│   ├── Hit Effects: 2 entries (beam + stun beam)
│   ├── Effect Hash A: 0x27917FAB (FunnelFly exclusive)
│   ├── Effect Hash B: 0x504436F6 (shared with FunnelSwarm)
│   ├── CmdMgr Size: 0x110 (272 bytes)
│   └── Pipeline (Radicon multi-phase):
│       ├── Phase 1 — Approach:
│       │   └── Series[ SetCollision(OFF), RadiconMovementInit, CreateDepiction,
│       │              conditional WaitForTargetKilled+Return, SetCollision(ON) ]
│       ├── Phase 2 — Attack:
│       │   └── Series[ CustomMovement, CustomAttack ]
│       ├── Phase 3 — Loop (conditional):
│       │   └── Series[ PhysicsBody, CustomLoopMovement, Return, Jump→Phase2 ]
│       └── Phase 4 — Return:
│           └── Series[ ReturnMovement, PhysicsConfig, optional PlaySE ]
│
└── FunnelSwarm (ファンネル群 — Funnel Swarm)
    ├── Archetype: Radicon (remote-controlled swarm)
    ├── ClassId: 977 (same as FunnelFly)
    ├── Motion: Same Radicon pipeline as FunnelFly
    ├── Damage: type=0x80 (DOWN), funnel_mode=1, auto_track=1
    ├── Hit Effects: 1 entry (beam only, no separate stun)
    ├── Effect Hash B: 0x504436F6 (shared with FunnelFly)
    ├── Swarm Spatial Params:
    │   ├── spread_distance = 5.0
    │   ├── spread_angle = 5° (0.0873 rad)
    │   ├── radius = 18.0
    │   └── mode = circular (0)
    ├── CmdMgr Size: 0x110 (272 bytes)
    └── Pipeline: Same as FunnelFly (behavioral diff via swarm spatial params at runtime)
```

---

### 033GNDAGE / 004GAGEFX — AGE-FX (Gundam AGE-FX)

```
Gundam AGE-FX (23 UnitTaskAutomata classes, 7 weapon families)
│
├── Family 1: FunnelFlysword (C-Funnel Sword Bits — Attack + Defense composite)
│   ├── Architecture: Defense Execute + StandardHomingMoveSet overlay
│   │   └── C-Funnels are DUAL-PURPOSE: defense pipeline + homing attack
│   │
│   ├── FunnelFlyswordNormal (Standard C-Funnel attack)
│   │   ├── Archetype: FunnelFlysword composite
│   │   ├── Damage: type=1, power_flags=0x80, sub_effect=10
│   │   ├── funnel_attack_hash: 0xD60D83C5
│   │   ├── burst=1, keepAlive=1
│   │   └── Shared CmdMgr with Hasei
│   │
│   ├── FunnelFlyswordHasei (Enhanced C-Funnel, charged?)
│   │   ├── Archetype: FunnelFlysword composite
│   │   ├── Damage: type=1, power_flags=0x80, sub_effect=13
│   │   ├── funnel_attack_hash: 0xD60D83C5
│   │   └── Shared CmdMgr with Normal (only sub_effect differs)
│   │
│   └── FunnelFlyswordBurst (Burst C-Funnel, all-out attack)
│       ├── Archetype: FunnelFlysword composite
│       ├── Damage: type=1, sub_effect=10
│       └── Separate CmdMgr
│
├── Family 2: FunnelFlySWordThrow (C-Funnel Thrown Mode — projectile form)
│   │
│   ├── FunnelFlySWordThrowFxBurst (Burst throw mode)
│   │   ├── Archetype: FunnelFlysword composite
│   │   ├── Damage: type=1, sub_effect=10
│   │   └── Shared ConfigDamageInfo with Hissatsu
│   │
│   └── FunnelFlySWordThrowHissatsu (Special attack throw)
│       ├── Archetype: FunnelFlysword composite
│       └── Shared ConfigDamageInfo with FxBurst
│
├── Family 3: StickerFunnel (Attach-to-Target Funnels — lock-on attack)
│   │
│   ├── StickerFunnelHissatsu (Special attack sticker)
│   │   ├── Archetype: StickerFunnel (homing + stick on contact)
│   │   ├── Damage: type=1, sticker_mode=1, sub_effect=9
│   │   ├── Enhanced execute: adds SIMD position offset (mode=3)
│   │   └── Pipeline: HomingMoveSet → CauseStick → extra Hissatsu action
│   │
│   └── StickerFunnelWinLose (Win/Lose condition sticker)
│       ├── Archetype: StickerFunnel
│       ├── Damage: type=1, sticker_mode=1, sub_effect=9
│       └── Pipeline: HomingMoveSet → CauseStick → Blank
│
├── Family 4: FunnelAttachChangeWeapon (Defense Form Change)
│   │
│   ├── FunnelAttachChangeWeaponDefenseformMayu (繭 Cocoon defense)
│   │   ├── Archetype: FunnelAttachChange (weapon change + homing)
│   │   ├── Damage: type=1, detect=1, sub_effect=9, collisionGroup=6
│   │   ├── defense_collision_hash: 0x50436EF6
│   │   └── Pipeline: WeaponChangeInit → FormConfig → HomingMoveSet
│   │
│   ├── FunnelAttachChangeWeaponDefenseformGurd (ガード Guard defense)
│   │   ├── Archetype: FunnelAttachChange
│   │   ├── Damage: same as Mayu but byte+513=0 (guard form flag)
│   │   └── Pipeline: same structure as Mayu
│   │
│   └── FunnelAttachChangeAutomata (Autonomous mode change)
│       ├── Archetype: FunnelAttachChange
│       ├── Damage: type=1, sub_effect=13
│       ├── Special: hash-based weapon-type switch, paramRead×3
│       └── defense_hash: 0x50436EF6
│
├── Family 5: TransparentSlasher (Invisible Melee Strikes)
│   │  *** MELEE TYPE (type=2) — unlike all other funnels ***
│   │
│   ├── TransparentSlasher01 (Slash pattern 1)
│   │   ├── Archetype: SummonFormation
│   │   ├── Damage: type=2 (MELEE), scale=1.0, sub_effect=13
│   │   ├── Override Count: 26 (extra slots: 18, 30, 42, 46, 72, 90)
│   │   ├── rotation_param: hash 0x41F53E41
│   │   └── CmdMgr Size: 0x120
│   │
│   └── TransparentSlasher04 (Slash pattern 4)
│       ├── Archetype: SummonFormation
│       ├── Damage: type=2 (MELEE), scale=1.0, sub_effect=13
│       └── Shared ConfigDamageInfo with Slasher01
│
├── Family 6: FunnelDefense (Protective Formation — shield around self/partner)
│   │
│   ├── FunnelSelfDefense (Self-protection)
│   │   ├── Archetype: FunnelDefense (multi-phase defense pipeline)
│   │   ├── Damage: type=1, sub_effect=11, defense=1
│   │   ├── collision_hash: 0x50436EF6
│   │   ├── Uses embedded FunnelCommonDefense sub-object for rotation
│   │   │   └── RotateOffsetBone with 3-axis rotation (hash-based deg→rad)
│   │   └── CmdMgr Size: 0x120
│   │
│   └── FunnelMateDefense (Partner-protection)
│       ├── Archetype: FunnelDefense
│       ├── Damage: type=1, sub_effect=11, defense=1
│       ├── Shared ConfigDamageInfo with SelfDefense
│       └── Same architecture as SelfDefense
│
└── Family 7: Standalone Weapons
    │
    ├── SpAssistAge1 (Special Assist — Summon AGE-1)
    │   ├── Archetype: SummonFormation
    │   ├── Damage: type=2 (MELEE), active=0, scale=1.0
    │   ├── Override Count: 27 (HIGHEST in AGE-FX)
    │   ├── Custom OnUpdate: sub_140DE1770 (only class with unique update)
    │   ├── Param hashes: 0x41F53E41, 0x36F95ED7, 0xA8AF2774
    │   └── CmdMgr Size: 0x120
    │
    ├── SpPlasmaDiverMissile (Plasma Diver Missile)
    │   ├── Archetype: Standard EXVS2 projectile
    │   ├── Damage: type=1, power=70, standard piercing check
    │   └── Uses base EXVS2 common damage config
    │
    └── ThrowDarkhoundMA (Throw Darkhound MA)
        ├── Archetype: Throw (standard directed throw)
        ├── Damage: type=1, power_flags=0, no_tracking, no_pierce, special+5=1
        └── Pipeline: Standard Throw motion via sub_140DEA280
```

---

## VDK Summon/Assist System (Generic — shared across all units)

```
Summon System (Assist Call Mechanics)
│
├── CCmdActionManager_Summon (Base — appear → act → leave)
│   └── Pipeline template:
│       └── Execute[ PreSetup, SharedInit, CreatePhysics+Movement, SetupActions, Blank, PostSetup ]
│
├── CCmdActionManager_SummonRush (Rush toward target)
│   ├── CCmdActionManager_SummonRushShot (Rush + shoot)
│   ├── CCmdActionManager_SummonRushAttackNormal (Rush + melee)
│   │   └── CCmdActionManager_SummonRushAttackTaiatari (Body slam)
│   ├── CCmdActionManager_SummonRushGround (Ground rush)
│   └── CCmdActionManager_SummonRushShotMachinegun (Rush + sustained fire)
│
├── CCmdActionManager_SummonSlide (Sliding approach)
│
├── CCmdActionManager_SummonGrap (Grab/grapple attack)
│   └── CCmdActionManager_SummonGrapHitStart (Grab → hit sequence)
│
├── CCmdActionManager_SummonDefence (Passive defense)
│
├── CCmdActionManager_SummonDefenceFormation (Formation defense)
│   └── CCmdActionManager_SummonDefenceFormationFriend (Friendly formation)
│
└── CCmdActionManager_SummonTukimatoi (Follow/escort)
    ├── CCmdActionManager_SummonTukimatoiAndAction (Follow + attack)
    └── CCmdActionManager_SummonTukimatoiAndActionSimple (Simplified)
```

---

## VDK Funnel System (Generic — shared across all units)

```
Funnel System (Autonomous Bit Weapons)
│
├── CUnitTaskAutomataFunnel (Base funnel)
│
├── CUnitTaskAutomataFunnelFly (Flying funnel)
│   ├── CUnitTaskAutomataFunnelFlySword (Sword-type funnel)
│   │   └── CUnitTaskAutomataFunnelFlySwordPenetrate (Penetrating sword)
│   ├── CUnitTaskAutomataFunnelFlyScatter (Scatter-pattern funnel)
│   ├── CUnitTaskAutomataFunnelFlyStick (Stick-to-target funnel)
│   │   ├── CUnitTaskAutomataFunnelFlyStickOnMyself (Stick-to-self)
│   │   └── CUnitTaskAutomataFunnelFlyStickOnTarget (Stick-to-target)
│   └── CUnitTaskAutomataFunnelSwarm (Multi-entity swarm)
│
├── CUnitTaskAutomataFunnelMawarikomi (Orbiting funnel)
│   └── CUnitTaskAutomataFunnelMawarikomi_ShotOrder (Orbit → shoot on command)
│
├── CUnitTaskAutomataFunnelShiftPos (Position-shifting funnel)
│
├── CUnitTaskAutomataFunnelShotImmediate (Immediate fire funnel)
│
└── CUnitTaskAutomataFunnelShotStayShift (Stay + shift fire funnel)
```

---

## Complete VDK Base Archetype Tree

```
CUnitTaskAutomataAbstract (93 vtable slots)
│
├── CUnitTaskAutomataFreeFall (Gravity projectile)
│   └── CUnitTaskAutomataFreeFall_Interaction (Gravity + terrain bounce)
│
├── CUnitTaskAutomataThrow (Directed throw + tracking)
│   ├── CUnitTaskAutomataThrowBlade (Blade throw variant)
│   ├── CUnitTaskAutomataThrowPillar (Pillar throw)
│   │   └── CUnitTaskAutomataThrowPillarLaunchJointYAxis (Pillar from joint Y-axis)
│   └── CUnitTaskAutomataThrowMortar (Mortar arc trajectory)
│
├── CUnitTaskAutomataBoomerang (Out + return dual-phase)
│   └── CUnitTaskAutomataBoomerangSpline (Spline-curve boomerang)
│
├── CUnitTaskAutomataPutObj (Static placement — mine/trap)
│
├── CUnitTaskAutomataSticker (Attach on contact)
│   └── CUnitTaskAutomataThrowStopRotateOnStick (Throw → stick on contact)
│
├── CUnitTaskAutomataShockHalo (Expanding shockwave)
│
├── CUnitTaskAutomataDetonator (Timed/triggered explosion)
│
├── CUnitTaskAutomataAnchor (Hook/grapple base)
│   ├── CUnitTaskAutomataAnchorReturn (Hook return phase)
│   └── CUnitTaskAutomataAnchorThrow (Hook throw phase)
│
├── CUnitTaskAutomataRadicon (Player-controlled remote)
│   └── CUnitTaskAutomataRadiconParentActor (Parent actor for radicon)
│
├── CUnitTaskAutomataFunnel* (See Funnel System tree above)
│
├── CUnitTaskAutomataSummon* (See Summon System tree above)
│
├── CUnitTaskAutomataAttach (Attached to parent)
│   └── CUnitTaskAutomataAttachAbstract (Abstract attach base)
│
├── CUnitTaskAutomataResident (Persistent/resident entity)
│
├── CUnitTaskAutomataRelay (Relay point — beam redirect)
│
└── CUnitTaskAutomataFreeFly (Free flight — funnel base)
```

---

## Cross-Unit Comparison

| Unit | Total Classes | Weapon Families | Max Override Count | Most Complex Weapon | Unique Feature |
|------|--------------|----------------|-------------------|--------------------|----|
| RX-78-2 Gundam | 8 (2 variants × 4 weapons) | 4 | 18 (HammerShot) | HammerShot (custom chain physics) | SIMD chain arc dynamics |
| MSN-04 Sazabi | 3 (single variant) | 3 | 15 (all equal) | ThrowHissatsuAxis (axis tracer) | Multi-point axis collision scan |
| AGE-FX | 23 (17 concrete + 6 abstract) | 7 | 27 (SpAssistAge1) | FunnelFlysword (Defense+Homing composite) | Dual-purpose C-Funnels |

### Shared Design Patterns

| Pattern | Units Using | Evidence |
|---------|-----------|----------|
| Sub-munition hash `0x41435BE6` | RX-78-2 (NapalmBomb), Sazabi (ThrowHissatsuAxis) | Generic "spawn sub-effect" parameter |
| Defense collision hash `0x50436EF6` | AGE-FX (FunnelAttach, FunnelDefense) | Shared defense barrier collision |
| Standard EXVS2 piercing check (hash `0x397A280D`) | RX-78-2, Sazabi, AGE-FX | Universal piercing flag |
| Radicon multi-phase pipeline | Sazabi (Funnels), AGE-FX (C-Funnels) | approach → attack → loop → return |
| SummonFormation pipeline | AGE-FX (TransparentSlasher, SpAssistAge1) | formation-based summon attacks |

---

## Custom Weapon Engineering via MinHook

### VDK Runtime Inheritance Hierarchy

The full RTTI chain from any `CUnitTaskAutomata` weapon to the engine root:

```
CUnitTaskAutomata{Archetype}@GAM@VDK
  └── CUnitTaskAutomataAbstract@GAM@VDK
        └── RadiconParentActor@GAM@VDK         ← universal VDK base (vtable 0x1413512E8)
              └── Radicon@GAM@VDK
                    └── Abstract@GAM@VDK
                          └── ActorProjectileAbstract@GAM@VDK
                                └── ActorAbstract@GAM@VDK
                                      └── BattleAbstract@GAM@VDK
                                            └── TaskAbstract@FWK@VDK
                                                  └── TaskEntityActAbstract@DEV@VDK
                                                        └── TaskEntityParAbstract@DEV@VDK
                                                              └── TaskEntityAbstract@DEV@VDK
                                                                    └── noncopyable@boost
```

`RadiconParentActor@GAM@VDK` is the most-derived class shared by ALL weapon archetypes. Overrides measured against this base give the true weapon-specific slot count (e.g., BeamJavelin = 12 overrides).

### Object Memory Layout Compatibility

Analysis of Factory (vtable slot 78) and Constructor functions across archetypes:

| Archetype Family | Object Size | Factory | Constructor | Layout Compatible |
|-----------------|-------------|---------|-------------|-------------------|
| Throw | 0x1C0 (448B) | `0x14094E8C0` | `0x1406A4D20` | YES — shared group |
| ThrowMortar | 0x1C0 (448B) | `0x14094E8C0` | `0x1406A4D20` | YES — shared group |
| Boomerang | 0x1C0 (448B) | `0x14094E8C0` | `0x1406A4D20` | YES — shared group |
| FreeFall | 0x1C0 (448B) | `0x14094E8C0` | `0x1406A4D20` | YES — shared group |
| Detonator | 0x1C0 (448B) | `0x14094E8C0` | `0x1406A4D20` | YES — shared group |
| Sticker | 0x1C0 (448B) | `0x14094E8C0` | `0x1406A4D20` | YES — shared group |
| HammerShot | 0x1F0 (496B) | unique | `0x140929240` | NO — incompatible |
| AnchorThrow | 0x1F0 (496B) | unique | different | NO — incompatible |

The 0x1C0 group shares identical memory layout: same Factory allocates the same-sized object, same Constructor initializes it. This means any function from one archetype can safely operate on another's object at runtime.

### MinHook Vtable Hijacking Approach

Custom weapons are created by composing existing archetype functions into a new vtable, then injecting it via a Factory hook.

**Step 1 — Build custom vtable:**
```
original_vtable = ReadProcessMemory(ThrowMortar_vtable, 100 * 8)
custom_vtable = copy(original_vtable)
custom_vtable[2]  = Throw::OnInit           // use Throw's init instead
custom_vtable[12] = Boomerang::OnUpdate      // use Boomerang's update loop
custom_vtable[79] = Detonator::ConfigDmg     // use Detonator's damage config
custom_vtable[81] = FreeFall::CreateCAM      // use FreeFall's action manager
custom_vtable[84] = Throw::Config            // use Throw's general config
```

**Step 2 — Hook Factory (slot 78):**
```
Factory(0x14094E8C0) is called when the game spawns a weapon projectile.
Hook this function with MinHook:
  1. Call original Factory → get allocated object (0x1C0 bytes)
  2. Overwrite object's vtable pointer: *(uint64_t*)object = &custom_vtable
  3. Return modified object
```

**Step 3 — Hook CreateCAM (slot 81) if needed:**
```
CCmdActionManager constructor chain (e.g., 0x140DDFE80):
  base_CAM_ctor()           → sets base vtable
  set_vtable(Throw_CAM)     → overwrites with Throw vtable
  set_vtable(ThrowMortar_CAM) → overwrites with final vtable

Custom CAM: hook the final set_vtable call to inject a custom CAM vtable
with mixed action pipeline slots.
```

### Key Vtable Slots for Custom Weapons

| Slot | Name | Purpose | Hook Priority |
|------|------|---------|--------------|
| 0 | Destructor | Cleanup + dealloc | LOW — keep original |
| 2 | OnInit | One-time initialization | HIGH — set initial state |
| 12 | OnUpdate | Per-frame logic | HIGH — core behavior |
| 28 | GetClassId | Type identification | MEDIUM — affects game logic checks |
| 54 | CanHit | Hit detection gate | MEDIUM — enable/disable hits |
| 55 | Cancel | Interrupt handling | LOW — keep original |
| 78 | Factory | Object allocation | CRITICAL — injection point |
| 79 | ConfigDmg | Damage parameters | HIGH — defines damage output |
| 81 | CreateCAM | Action manager factory | HIGH — defines behavior pipeline |
| 84 | Config | General configuration | HIGH — defines movement/tracking |

### Cross-Archetype Safety Matrix

| Source → Target | 0x1C0 Group | HammerShot (0x1F0) | AnchorThrow (0x1F0) |
|----------------|-------------|-------------------|---------------------|
| **0x1C0 Group** (Throw, ThrowMortar, Boomerang, FreeFall, Detonator, Sticker) | SAFE — identical layout | CRASH — field offset mismatch beyond 0x1C0 | CRASH — field offset mismatch |
| **HammerShot** | CRASH — reads past 0x1C0 boundary | SAFE — same size | UNKNOWN — different constructor |
| **AnchorThrow** | CRASH — reads past 0x1C0 boundary | UNKNOWN — different constructor | SAFE — same archetype |

**Safe mixing rule**: only mix vtable functions between archetypes that share the same `(Factory, Constructor, Size)` triple. Within the 0x1C0 group, any slot from any archetype can be freely swapped.

### Practical Example: Custom BeamJavelin Variant

Goal: BeamJavelin that returns like a boomerang after hitting.

```
Base:     ThrowMortar vtable (mortar arc trajectory)
Modify:   slot[12] = Boomerang::OnUpdate    (return phase after apex)
          slot[79] = custom ConfigDmg        (new damage values)
          slot[84] = ThrowMortar::Config     (keep mortar arc params)
Inject:   Hook Factory → swap vtable pointer on BeamJavelin spawn
```

Both ThrowMortar and Boomerang are in the 0x1C0 group → safe to mix. The Boomerang OnUpdate reads the same field offsets for position/velocity that ThrowMortar writes during init → behavior composition works without memory corruption.

### Limitations and Risks

1. **ClassId conflicts**: `GetClassId` (slot 28) returns a fixed integer used by the game for type checks. A hybrid weapon returning ThrowMortar's ClassId may fail Boomerang-specific checks, or vice versa.
2. **CCmdAction node compatibility**: Action nodes read specific field offsets. Mixing a CAM from archetype A with an entity vtable from archetype B can cause action nodes to read wrong fields.
3. **Hash parameter dependencies**: Many weapon configs reference hash-keyed parameters (e.g., `0x397A280D` for piercing). Custom weapons must provide all expected hash parameters or the game will read garbage/zero.
4. **Online desync**: Vtable modifications are local. In networked play, the opponent's client will instantiate the original weapon, causing simulation divergence.
5. **Version fragility**: All addresses are for a specific EXVS2 build. Any game update shifts vtable addresses, Factory/Constructor addresses, and potentially object layouts.

---

## Naming Convention Decoder

```
UnitTaskAutomata_{SeriesID}_{UnitID}_{Variant}_{WeaponName}@EXVS2@@

SeriesID (anime series):
  000COMMON  = Shared/generic weapons
  001GUNDAM  = Mobile Suit Gundam (0079)
  002ZGUNDM  = Zeta Gundam
  017GYAKCH  = Char's Counterattack
  033GNDAGE  = Gundam AGE
  ...

UnitID (specific mobile suit):
  001GUNDAM  = RX-78-2 Gundam
  017DOM000  = Dom
  002SAZABI  = Sazabi
  004GAGEFX  = Gundam AGE-FX
  ...

Variant: 001, 002, ... (costume/loadout variant)

hitEffectHash pattern: {SeriesID}{UnitID}{VariantXX}{WeaponYY}
  e.g. 170020102 = series 017, unit 002SAZABI, variant 01, weapon 02 (ThrowHissatsuAxis)
  e.g. 330040114 = series 033, unit 004GAGEFX, variant 01, weapon 14 (SpPlasmaDiverMissile)
```

---

## RTTI Statistics

- Total UnitTaskAutomata RTTI strings: **~1597**
- Estimated unique EXVS2 derived classes: **~800**
- VDK base archetypes: **49**
- CCmdActionManager types: **~40** (VDK) + unit-specific
- CCmdAction node types: **~120+**
