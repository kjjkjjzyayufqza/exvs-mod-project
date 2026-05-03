# UnitTaskAutomata Complete System Analysis

## Part 1: Complete Type Taxonomy

### 1.1 VDK Base UnitTaskAutomata Classes (from RTTI)

These are the VDK framework-level base classes. Each defines a distinct motion/collision archetype.

| # | VDK Class | Motion Archetype | CCmdActionManager Pair |
|---|-----------|-----------------|----------------------|
| 1 | `CUnitTaskAutomataAbstract` | Abstract base (93 vtable slots) | N/A (pure virtual slot 81) |
| 2 | `CUnitTaskAutomataFreeFall` | Gravity projectile | `CCmdActionManager_FreeFall` |
| 3 | `CUnitTaskAutomataThrow` | Directed throw with tracking | `CCmdActionManager_Throw` |
| 4 | `CUnitTaskAutomataBoomerang` | Dual-phase out+return | `CCmdActionManager_Boomerang` |
| 5 | `CUnitTaskAutomataBoomerangSpline` | Spline-curve boomerang | `CCmdActionManager_BoomerangSpline` |
| 6 | `CUnitTaskAutomataPutObj` | Static placement (mine/trap) | `CCmdActionManager_PutObj` |
| 7 | `CUnitTaskAutomataSticker` | Attach to target on contact | `CCmdActionManager_Sticker` |
| 8 | `CUnitTaskAutomataThrowStopRotateOnStick` | Thrown→stick on contact | `CCmdActionManager_ThrowStopRotateOnStick` |
| 9 | `CUnitTaskAutomataFreeFall_Interaction` | Gravity + bounce on terrain | `CCmdActionManager_FreeFall_Interaction` |
| 10 | `CUnitTaskAutomataThrowBlade` | Blade throw (Throw variant) | Inherits Throw |
| 11 | `CUnitTaskAutomataThrowPillar` | Pillar throw | `CCmdActionManager_ThrowPillar` |
| 12 | `CUnitTaskAutomataThrowPillarLaunchJointYAxis` | Pillar from joint Y-axis | Inherits ThrowPillar |
| 13 | `CUnitTaskAutomataThrowMortar` | Mortar arc trajectory | `CCmdActionManager_ThrowMortar` |
| 14 | `CUnitTaskAutomataShockHalo` | Expanding shockwave | `CCmdActionManager_ShockHalo` |
| 15 | `CUnitTaskAutomataFreeFly` | Free flight (funnel base) | `CCmdActionManager_FreeFly` |
| 16 | `CUnitTaskAutomataDetonator` | Timed/triggered explosion | `CCmdActionManager_Detonator` |
| 17 | `CUnitTaskAutomataAnchor` | Hook/grapple base | `CCmdActionManager_Anchor` |
| 18 | `CUnitTaskAutomataAnchorReturn` | Hook return phase | `CCmdActionManager_AnchorReturn` |
| 19 | `CUnitTaskAutomataAnchorThrow` | Hook throw phase | `CCmdActionManager_AnchorThrow` |
| 20 | `CUnitTaskAutomataRadicon` | Player-controlled (radio) | `CCmdActionManager_Radicon` |
| 21 | `CUnitTaskAutomataRadiconParentActor` | Parent actor for radicon | `CCmdActionManager_RadiconParentActor` |
| 22 | `CUnitTaskAutomataFunnel` | Funnel base class | `CCmdActionManager_Funnel` |
| 23 | `CUnitTaskAutomataFunnelFly` | Flying funnel | `CCmdActionManager_FunnelFly` |
| 24 | `CUnitTaskAutomataFunnelFlySword` | Sword-type funnel | `CCmdActionManager_FunnelFlySword` |
| 25 | `CUnitTaskAutomataFunnelFlySwordPenetrate` | Penetrating sword funnel | `CCmdActionManager_FunnelFlySwordPenetrate` |
| 26 | `CUnitTaskAutomataFunnelMawarikomi` | Orbiting funnel | `CCmdActionManager_FunnelMawarikomi` |
| 27 | `CUnitTaskAutomataFunnelMawarikomi_ShotOrder` | Orbit→shoot on command | `CCmdActionManager_FunnelMawarikomi_ShotOrder` |
| 28 | `CUnitTaskAutomataFunnelShiftPos` | Position-shifting funnel | (variant) |
| 29 | `CUnitTaskAutomataFunnelShotImmediate` | Immediate fire funnel | `CCmdActionManager_FunnelShotImmediate` |
| 30 | `CUnitTaskAutomataFunnelShotStayShift` | Stay+shift fire funnel | `CCmdActionManager_FunnelShotStayShift` |
| 31 | `CUnitTaskAutomataFunnelSwarm` | Multi-entity swarm | (specialized vtable) |
| 32 | `CUnitTaskAutomataFunnelFlyScatter` | Scatter-pattern funnel | (variant) |
| 33 | `CUnitTaskAutomataFunnelFlyStick` | Stick-to-target funnel | `CCmdActionManager_FunnelFlyStick` |
| 34 | `CUnitTaskAutomataFunnelFlyStickOnMyself` | Stick-to-self funnel | `CCmdActionManager_FunnelFlyStickOnMyself` |
| 35 | `CUnitTaskAutomataFunnelFlyStickOnTarget` | Stick-to-target funnel | `CCmdActionManager_FunnelFlyStickOnTarget` |
| 36 | `CUnitTaskAutomataSummon` | Assist/summon base | `CCmdActionManager_Summon` |
| 37 | `CUnitTaskAutomataSummonRush` | Rush-type assist | `CCmdActionManager_SummonRush` |
| 38 | `CUnitTaskAutomataSummonRushGround` | Ground rush assist | `CCmdActionManager_SummonRushGround` |
| 39 | `CUnitTaskAutomataSummonRushShot` | Rush+shoot assist | `CCmdActionManager_SummonRushShot` |
| 40 | `CUnitTaskAutomataSummonRushAttack` | Rush+attack assist | `CCmdActionManager_SummonRushAttack` |
| 41 | `CUnitTaskAutomataSummonRushAttackNormal` | Normal rush attack | `CCmdActionManager_SummonRushAttackNormal` |
| 42 | `CUnitTaskAutomataSummonSlide` | Sliding assist | `CCmdActionManager_SummonSlide` |
| 43 | `CUnitTaskAutomataSummonTukimatoi` | Pursuit/follow assist | `CCmdActionManager_SummonTukimatoi` |
| 44 | `CUnitTaskAutomataSummonTukimatoiAndAction` | Pursuit+action assist | `CCmdActionManager_SummonTukimatoiAndAction` |
| 45 | `CUnitTaskAutomataSummonDefence` | Defence formation | `CCmdActionManager_SummonDefenceFormation` |
| 46 | `CUnitTaskAutomataAttach` | Attached to parent entity | `CCmdActionManager_Attach` |
| 47 | `CUnitTaskAutomataAttachAbstract` | Abstract attach base | `CCmdActionManager_AttachAbstract` |
| 48 | `CUnitTaskAutomataResident` | Persistent/resident entity | (specialized) |
| 49 | `CUnitTaskAutomataRelay` | Relay point (beam redirect) | `CCmdActionManager_Relay` |

### 1.2 CCmdActionManager Complete Catalog

**VDK Framework Managers (generic, reusable):**

| Manager | Behavior Pattern | Key Parameters |
|---------|-----------------|----------------|
| `_FreeFall` | Gravity drop: init velocity + gravity vector | velocity XYZ, gravity XYZ, lifetime, rotation |
| `_Throw` | Directed throw: launch angle + speed + tracking | rotation XYZ (deg→rad), config flags |
| `_Boomerang` | Out+Return dual-phase | homing factor, lifetime, return timing |
| `_BoomerangSpline` | Spline-curve boomerang | spline control points, timing |
| `_PutObj` | Static placement, no movement | position only |
| `_Sticker` | Attach on contact | stick matrix |
| `_StickerConnectLazer` | Stick + laser beam | stick + beam params |
| `_ThrowStopRotateOnStick` | Throw→stop+stick | throw params + stick params |
| `_FreeFall_Interaction` | Gravity + terrain bounce | velocity, gravity, bounce factor |
| `_ThrowPillar` | Vertical pillar launch | joint Y-axis, angle |
| `_ThrowMortar` | Mortar arc | arc angle, gravity, distance |
| `_ShockHalo` | Expanding ring | expansion speed, radius, duration |
| `_Detonator` | Timed explosion | delay, trigger conditions |
| `_Anchor` | Hook base | extend speed, max distance |
| `_AnchorReturn` | Hook retract | retract speed |
| `_AnchorThrow` | Hook extend | throw vector |
| `_Radicon` | Player input steering | turn rate, speed, fuel |
| `_RadiconParentActor` | Parent actor for radicon | control link |
| `_StickAdapter` | Adapter: make anything stickable | wraps another manager |
| `_Funnel` | Autonomous bit base | flight params |
| `_FunnelFly` | Flying funnel | speed, altitude, orbit radius |
| `_FunnelFlySword` | Sword-dash funnel | dash speed, attack timing |
| `_FunnelFlySwordPenetrate` | Penetrating sword funnel | penetration depth |
| `_FunnelMawarikomi` | Orbiting around target | orbit radius, speed, period |
| `_FunnelMawarikomi_ShotOrder` | Orbit→shoot on command | orbit + shot timing |
| `_FunnelFlyStick` | Fly→stick to entity | flight + stick params |
| `_FunnelFlyStickOnMyself` | Fly→stick to owner | flight + self-attach |
| `_FunnelFlyStickOnTarget` | Fly→stick to target | flight + target-attach |
| `_FunnelShot` | Funnel fires beam/shot | firing interval, shot type |
| `_FunnelShotImmediate` | Immediate funnel fire | instant shot |
| `_FunnelShotStayShift` | Stay→shift→shoot | position shift + shot |
| `_Summon` | Assist appear→act→leave | appear timing, action, leave |
| `_SummonRush` | Rush toward target | rush speed, distance |
| `_SummonRushGround` | Ground-level rush | rush + ground clamp |
| `_SummonRushShot` | Rush→shoot | rush + shot params |
| `_SummonRushAttack` | Rush→melee attack | rush + attack timing |
| `_SummonRushAttackNormal` | Normal rush attack | standard attack |
| `_SummonRushAttackTaiatari` | Body slam rush | collision damage |
| `_SummonRushShotMachinegun` | Rush→machinegun fire | rapid fire params |
| `_SummonSlide` | Sliding approach | slide vector, speed |
| `_SummonTukimatoi` | Follow/pursue target | pursuit speed, duration |
| `_SummonTukimatoiAndAction` | Pursue+action | pursuit + action trigger |
| `_SummonGrap` | Grab attack | grab range, hold time |
| `_SummonGrapHitStart` | Grab→hit sequence | grab + damage timing |
| `_SummonDefenceFormation` | Shield formation | formation positions |
| `_SummonDefenceFormationFriend` | Friendly shield formation | friend targeting |
| `_Attach` | Attached to parent | offset, bone attachment |
| `_AttachAbstract` | Abstract attach | base attach logic |
| `_AttachReturn` | Detach→return | return trajectory |
| `_AttachToRadicon` | Attach to radicon entity | radicon link |
| `_AttachToRadiconReturn` | Detach from radicon→return | return from radicon |
| `_AttachReturnCancelReturn` | Cancel→return attach | cancel state handling |
| `_ThrowReturn` | Throw→return (like boomerang) | throw + return params |
| `_Relay` | Relay/redirect point | relay position |

### 1.3 CCmdAction Node Classification

#### Category A: Wait/Timing Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_WaitByFrame` | Wait N frames |
| `CCmdAction_WaitForLifeTimeEnd` | Wait until lifetime expires |
| `CCmdAction_WaitForLeaved` | Wait until entity has left area |
| `CCmdAction_WaitForShellStatus` | Wait for shell state change |
| `CCmdAction_WaitForMotionStateEnd` | Wait for animation to finish |
| `CCmdAction_WaitForMotionStateFrame` | Wait for specific animation frame |
| `CCmdAction_WaitForShotResult` | Wait for shot hit/miss result |
| `CCmdAction_WaitForOrderedReleaseSticks` | Wait for stick release order |
| `CCmdAction_WaitForProjectileOrder` | Wait for projectile command |
| `CCmdAction_CannotMoveInTime` | Timeout guard for movement |
| `CCmdAction_Blank` | No-op separator/placeholder |

#### Category B: Movement Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_BulletFlyFunctionAbstract` | Straight-line flight base |
| `CCmdAction_BulletFlyFunction_ForBullet` | Bullet straight-line flight |
| `CCmdAction_MortarFlyFunctionAbstract` | Mortar arc flight base |
| `CCmdAction_MortarFlyFunction_ForBullet` | Mortar arc for bullet |
| `CCmdAction_StandardHomingMoveSet` | Full homing/tracking movement |
| `CCmdAction_FunnelHomingMoveBase` | Funnel-specific homing |
| `CCmdAction_MoveAhead` | Move forward |
| `CCmdAction_MoveAheadAccel` | Move forward with acceleration |
| `CCmdAction_MoveSlide` | Slide movement |
| `CCmdAction_MoveSpline` | Spline-path movement |
| `CCmdAction_MoveRotSpline` | Spline-path + rotation |
| `CCmdAction_MoveDirection` | Move in specified direction |
| `CCmdAction_MoveRelative` | Relative position movement |
| `CCmdAction_MoveMagnet` | Magnetic attraction toward point |
| `CCmdAction_MoveMagnetOffset` | Magnet with offset |
| `CCmdAction_MoveMagnetOffsetRelative` | Magnet with relative offset |
| `CCmdAction_MoveMagnetToTarget` | Magnet toward target entity |
| `CCmdAction_MoveMagnetToParentBone` | Magnet to parent's bone |
| `CCmdAction_MoveMagnetToParentMultiBone` | Magnet to parent's multi-bone |
| `CCmdAction_MoveMagnetToProjectileAbstract` | Magnet to projectile |
| `CCmdAction_MoveMagnetToProjectileWithBone` | Magnet to projectile bone |
| `CCmdAction_MoveTransStickingMatrix` | Move via stick transform |
| `CCmdAction_MoveTransStickingIntersectMatrix` | Move via stick+intersect transform |
| `CCmdAction_MoveTransAsMortar` | Move as mortar projectile |
| `CCmdAction_MoveStraightAbstract` | Abstract straight movement |
| `CCmdAction_SynchronizedMove` | Synchronized with parent |
| `CCmdAction_SynchronizedMoveAbstract` | Sync move base |
| `CCmdAction_SynchronizedMoveDrift` | Sync move with drift |
| `CCmdAction_SynchronizedMoveDriftOnTargetRef` | Sync drift referencing target |
| `CCmdAction_SynchronizedMoveDriftOnTargetRefParentHeight` | Sync drift at parent height |
| `CCmdAction_SynchronizedMoveStay` | Sync stay position |
| `CCmdAction_SynchronizedMoveOnTarget` | Sync move on target |
| `CCmdAction_SynchronizedMoveOnAttackTarget` | Sync move on attack target |
| `CCmdAction_SynchronizedMoveAttachParentDir` | Sync move attach to parent dir |
| `CCmdAction_DiscreteMoveAbstract` | Teleport/warp base |
| `CCmdAction_DiscreteMoveToTopowner` | Warp to top owner |
| `CCmdAction_DiscreteMoveToStatusTargetPos` | Warp to target position |

#### Category C: Rotation Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_UpdateRotate` | Update rotation each frame |
| `CCmdAction_WorldRotate` | Set world rotation |
| `CCmdAction_WorldRotate3AxisAbstract` | 3-axis rotation base |
| `CCmdAction_WorldRotate3AxisZYX` | ZYX euler rotation |
| `CCmdAction_RotateOffsetBone` | Rotate with bone offset |
| `CCmdAction_RotateOffsetBoneForUpvectorZ` | Rotate bone for Z-up |
| `CCmdAction_RotateOffsetBoneForPreserveY` | Rotate bone preserving Y |
| `CCmdAction_RotOffsetBoneContinuous` | Continuous bone rotation |
| `CCmdAction_RotateFront` | Face movement direction |
| `CCmdAction_RotateFrontOnTargetInvalid` | Face front when no target |
| `CCmdAction_RotateToTargetFront` | Rotate to face target |
| `CCmdAction_RotateToMatrixAbstract` | Rotate to matrix base |
| `CCmdAction_RotateToParentBoneAbstract` | Rotate to parent bone |
| `CCmdAction_RotateToParentMultiBone` | Rotate to parent multi-bone |
| `CCmdAction_RotateToStatusTargetMovePos` | Rotate toward target move pos |
| `CCmdAction_RotateWorldMatContinue` | Continue world matrix rotation |
| `CCmdAction_AimingRotate` | Aim rotation |
| `CCmdAction_AimingRotateAbstract` | Aim rotation base |
| `CCmdAction_AimingRotateTarget` | Aim at target |
| `CCmdAction_AimingRotateParentLockonTarget` | Aim at parent's lock-on |
| `CCmdAction_AimingRotateTukimatoiBase` | Aim for pursuit mode |
| `CCmdAction_MoveRotCombinateAbstract` | Combined move+rotate |

#### Category D: Homing/Tracking Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_StandardHomingMoveSet` | Standard homing with tracking factor |
| `CCmdAction_TurnHomingForRush` | Homing turn for rush attacks |
| `CCmdAction_RotHomingOnGround` | Ground-level homing rotation |
| `CCmdAction_RestartUpdateHomingTarget` | Refresh homing target |
| `CCmdAction_RegisterStatusTargetPosToNowMoveDirection` | Register current move dir as target |
| `CCmdAction_RegisterStatusTargetPosFromHere` | Register current pos as target ref |
| `CCmdAction_LimitDistance_FromTarget` | Distance limiter from target |
| `CCmdAction_LimitDistance_FromActionStatusMoveTargetPos` | Distance limiter from action target |
| `CCmdAction_DistCheckerFarToTarget` | Check if too far from target |
| `CCmdAction_DistCheckerNearToTarget` | Check if close enough to target |
| `CCmdAction_DistCheckerNearToParentBone` | Check distance to parent bone |
| `CCmdAction_DistCheckerNearToParentMultiBone` | Check distance to parent multi-bone |
| `CCmdAction_DistCheckerNearToStatusTargetMovePos` | Check distance to target position |

#### Category E: State/Mode Control Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_SetIntersectEnableMode` | Enable/disable collision |
| `CCmdAction_SetInteractEnableModeAttack` | Enable attack interaction |
| `CCmdAction_SetInteractEnableModeAll` | Enable all interactions |
| `CCmdAction_SetInteractEnableModeAttackSub` | Enable sub-attack interaction |
| `CCmdAction_SetAlertInfoEnableMode` | Enable/disable alert display |
| `CCmdAction_SetCollisionEnableModeForStage` | Enable stage collision |
| `CCmdAction_DisableLifeKill` | Prevent death |
| `CCmdAction_SetShellVisible` | Show/hide visual shell |
| `CCmdAction_SetMotionPause` | Pause animation |
| `CCmdAction_SetMotionSpeedRate` | Set animation speed |
| `CCmdAction_ClearMotionStateLoop` | Clear animation loop |
| `CCmdAction_RegisterMotionState` | Register animation state |
| `CCmdAction_ChangeBulletParam` | Change bullet parameters mid-flight |
| `CCmdAction_ResetPastInteractSendRecord` | Reset interaction history |
| `CCmdAction_ResetProjectileOrder` | Reset projectile command |
| `CCmdAction_InterpolationValue` | Interpolate between values |
| `CCmdAction_TransitionAutomataIntersectRadius` | Transition collision radius |
| `CCmdAction_TransitionInteractionSphereRadius` | Transition interaction sphere |
| `CCmdAction_TransitionBarrierRadius` | Transition barrier radius |

#### Category F: Combat/Effect Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_ShotBullet` | Fire a bullet/projectile |
| `CCmdAction_GlobalEffect` | Spawn global visual effect |
| `CCmdAction_AttachedEffect` | Manage attached effect |
| `CCmdAction_AttachedEffect_Start` | Start attached effect |
| `CCmdAction_AttachedEffect_Stop` | Stop attached effect |
| `CCmdAction_Jump` | Jump action |
| `CCmdAction_ReleaseStick` | Release stuck state |

#### Category G: Communication/Coordination Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_UpdateProjectileOrderFromParent` | Receive order from parent |
| `CCmdAction_WaitForProjectileOrder` | Wait for projectile order |
| `CCmdAction_SendMessageProjectileFormation` | Send formation message |
| `CCmdAction_SynchronizeParentTargetAttack` | Sync parent's attack target |
| `CCmdAction_SynchronizeParentTargetLockon` | Sync parent's lock-on target |
| `CCmdAction_SendMessageShellVisibilityRequest` | Request shell visibility |

#### Category H: Termination Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_TerminateStop` | Stop and terminate |
| `CCmdAction_TerminateSeriesEnd` | Mark end of action series |
| `CCmdAction_Return` | Return to owner/parent |

#### Category I: Special Control Nodes
| Node | Purpose |
|------|---------|
| `CCmdAction_Radicon` | Player input processing |
| `CCmdAction_RadiconAbstract` | Radicon base |
| `CCmdAction_RadiconAbstract_ParentActorOnly` | Radicon parent only |
| `CCmdAction_RadiconParentActor` | Radicon parent actor node |

### 1.4 CCmdActionGroup Types

| Group | Execution Model |
|-------|----------------|
| `CCmdActionGroupAbstract` | Base class |
| `CCmdActionGroup_Series` | Execute actions **sequentially** (one after another) |
| `CCmdActionGroup_Parallel` | Execute actions **concurrently** (all at once) |
| `CCmdActionGroup_SeriesInverseEnd` | Sequential, but terminated from the **end** backwards |

---

## Part 2: Complete Lifecycle Analysis

### 2.1 Birth: From MSC Script to Living Entity

```
MSC Script (bytecode)
  │
  ▼ syscall → game engine
Registration System (startup)
  │  Each class calls sub_140921530() at static init
  │  Stores constructor fn pointer at offset 520 in a 0x220-byte record
  │  Global table indexed by class type ID
  │
  ▼ runtime lookup
Constructor Chain
  │  1. allocate(0x3530)        // ~13616 bytes for the entity object
  │  2. memset(0)               // zero-initialize all fields
  │  3. sub_1406A4CF0()         // base class init (set base vtable, init members)
  │  4. Set EXVS2 vtable        // overwrite vtable ptr with derived class vtable
  │
  ▼ vtable[3]
ConstructorHelper (slot 3)
  │  Called during construction to init base members.
  │  Often thunks to base implementation.
  │
  ▼ vtable[21]
PreInit (slot 21)
  │  Early initialization. Sets up sub-components.
  │  Initializes physics, collision, and parameter components.
  │
  ▼ vtable[2]
OnInit (slot 2)
  │  Post-construction init:
  │  1. Reads parameter block from data store
  │  2. Sets up hit effects (reads count, IDs, params via vtable[96][97][98])
  │  3. Calls vtable[99] (ResetActions) to configure initial action state
  │
  ▼ vtable[81]
CreateCmdActionManager (slot 81) ← PURE VIRTUAL, MUST OVERRIDE
  │  Factory method that creates the CCmdActionManager.
  │  This determines the entity's ENTIRE movement/action behavior.
  │  Returns a newly allocated CCmdActionManager subclass.
  │
  ▼ CCmdActionManager::Execute (slot 1 of manager)
Build Action Pipeline
    1. Allocate physics body (0x80 bytes for FreeFall-type)
    2. Read parameters from data store via hash lookup
    3. Create CCmdAction_* node instances
    4. Create CCmdActionGroup_* containers
    5. Register all actions to the manager
    6. ENTITY IS NOW ALIVE AND TICKING
```

### 2.2 Life: Per-Frame Update Chain

```
Game Loop (60fps)
  │
  ▼ vtable[12]
Derived::OnUpdate()
  │  1. Iterate hit effects array
  │  2. For each: check spawn conditions → call SpawnHitEffect
  │  3. Call sub_14066D910() (framework collision setup)
  │     │
  │     ├── Set collision bitmask
  │     └── Delegate to Base::OnUpdate (sub_140673170)
  │         │
  │         ├── UpdatePhysics (sub_14062A7B0)
  │         │     Physics simulation step
  │         │
  │         ├── vtable[65] → PreMotion hook
  │         │     Called before motion processing
  │         │
  │         ├── vtable[66] → IsAlive check
  │         │     Returns whether entity should continue updating
  │         │     If dead, skip remaining update
  │         │
  │         ├── If alive:
  │         │   ├── UpdateMotion
  │         │   │     CCmdActionManager processes action pipeline:
  │         │   │       - Series groups: advance to next action if current done
  │         │   │       - Parallel groups: tick all actions simultaneously
  │         │   │       - Each CCmdAction_* node updates its state
  │         │   │
  │         │   ├── vtable[67] → PostMotion hook
  │         │   │     Called after motion, before collision
  │         │   │
  │         │   ├── CheckCollision
  │         │   │     Test against all active collision volumes
  │         │   │
  │         │   └── vtable[72] → OnHit handler
  │         │         Process hit results from collision check
  │         │
  │         └── Additional processing if special data exists
  │
  ▼ (collision detected?)
vtable[73] → OnCollisionCheck
  │  Checks mode/state
  │  Conditionally triggers kill via vtable[94] (GetPhysicsComponent)
  │
  ▼ (target checking)
vtable[54] → CanHitTarget
  │  3D distance check: is projectile within hit range?
  │  Uses parameter-defined range value
  │
vtable[55] → ShouldCancel
  │  3D distance check: is projectile too far?
  │  If true, self-destruct
```

### 2.3 Death: Destruction Sequence

```
Trigger Conditions:
  - Lifetime expired (CCmdAction_WaitForLifeTimeEnd triggers)
  - Collision with target (OnCollisionCheck → kill)
  - Distance exceeded (ShouldCancel → true)
  - External kill command (from parent or system)

Destruction Chain:
  │
  ▼ Kill signal
vtable[94] → GetPhysicsComponent → deactivate physics
  │
  ▼ vtable[0]
Destructor(flags)
  │  1. Cleanup action pipeline (destroy all CCmdAction nodes)
  │  2. Destroy CCmdActionManager
  │  3. Release physics body
  │  4. Release collision components
  │  5. Release parameter references
  │  6. If (flags & 1): free(this)  // the 0x3530-byte object memory
  │     Size varies by class, but most are 0x3530
```

---

## Part 3: Value Conversion System

### 3.1 Hash-Based Parameter Lookup

All parameters are stored in a centralized data store and accessed by hash:

```cpp
// Core lookup function:
sub_1405B2980(dataStore + 2904, &output, keyPointer, &hashKey)

// Parameters:
//   dataStore + 2904: the parameter store base
//   &output: receives the looked-up value
//   keyPointer: internal key state
//   &hashKey: 32-bit hash identifying the parameter
```

**Known Hash → Parameter Mappings:**

| Hash (decimal) | Hash (hex) | Parameter Name (deduced) | Used By |
|----------------|-----------|-------------------------|---------|
| 225074389 | 0x0D6A5CD5 | hit_effect_type (dispatch key) | sub_14066D730 |
| 1261973028 | 0x4B3C50A4 | rotation_x_degrees | Throw pipeline |
| 1010769586 | 0x3C3F2AB2 | rotation_y_degrees | Throw pipeline |
| -1523167480 | 0xA5419B98 | rotation_z_degrees | Throw pipeline |
| 850177019 | 0x32ACB3FB | boomerang_config | Boomerang pipeline |
| 1280698941 | 0x4C5C363D | boomerang_lifetime | Boomerang pipeline |

### 3.2 Unit Conversion Patterns

**Degrees → Radians** (in Throw pipeline):
```cpp
// hash lookup returns degrees (float)
float degrees = paramLookup(hash_rotation_x);
float radians = degrees * (PI / 180.0f);  // standard deg→rad
// radians stored as rotation vector component
```

**Lifetime / Frame Counting:**
```cpp
// Positive lifetime: relative frames (from current time)
// Negative lifetime: ABSOLUTE frames (fixed duration)
// In CCmdAction_WaitForLifeTimeEnd:
if (lifetime < 0) {
    // Use absolute value as fixed frame count
    framesRemaining = -lifetime;
} else {
    // Use as relative/variable duration
    framesRemaining = lifetime;
}
```

**Distance Calculations:**
```cpp
// 3D Euclidean distance used in CanHitTarget / ShouldCancel
float dx = target.x - this.x;
float dy = target.y - this.y;
float dz = target.z - this.z;
float dist = sqrt(dx*dx + dy*dy + dz*dz);
return dist < threshold;  // threshold from parameter lookup
```

### 3.3 Object Memory Layout

```
CUnitTaskAutomata Object (~0x3530 = 13616 bytes)
╔══════════════════════════════════════════════════════════════╗
║ +0x0000  vtable pointer (8 bytes, points to class vtable)   ║
║ +0x0008  ... base framework fields ...                       ║
║          (inherited from CUnitTaskAutomataAbstract)          ║
╠══════════════════════════════════════════════════════════════╣
║ +0x0451  flags byte                                          ║
║          Bit flags controlling entity state                  ║
╠══════════════════════════════════════════════════════════════╣
║ +0x0BD8  some_pointer (offset 3032)                          ║
║          Internal framework reference                        ║
╠══════════════════════════════════════════════════════════════╣
║ +0x2E30  timeline/frame data (offset 11824)                  ║
║          Animation timeline state                            ║
╠══════════════════════════════════════════════════════════════╣
║ +0x2E50  component_pointer (offset 11856)                    ║
║          Points to sub-component                             ║
╠══════════════════════════════════════════════════════════════╣
║ +0x2F68  collision_component (offset 12136)                  ║
║          Collision detection component                       ║
╠══════════════════════════════════════════════════════════════╣
║ +0x3498  hit_effect_params* (offset 13472)                   ║
║          → Parameter data block (see below)                  ║
╠══════════════════════════════════════════════════════════════╣
║ +0x34A8  physics_component* (offset 13480)                   ║
║          Physics simulation component                        ║
║          Returned by vtable[94] (GetPhysicsComponent)        ║
╠══════════════════════════════════════════════════════════════╣
║ +0x34B8  collision_handler* (offset 13496)                   ║
║          Collision response handler                          ║
╠══════════════════════════════════════════════════════════════╣
║ +0x34D8  auxiliary_data* (offset 13528)                      ║
║          Additional data pointer                             ║
╠══════════════════════════════════════════════════════════════╣
║ +0x34F0  special_processing* (offset 13552)                  ║
║          Special processing handler                          ║
╠══════════════════════════════════════════════════════════════╣
║ +0x3518  timer/counter (offset 13592)                        ║
║          Written by OnParamChanged (vtable[70])              ║
╠══════════════════════════════════════════════════════════════╣
║ +0x3520  cached_param (offset 13600)                         ║
╠══════════════════════════════════════════════════════════════╣
║ +0x3530  additional_data (offset 13616)                      ║
║          Used by Boomerang for countdown, etc.               ║
╚══════════════════════════════════════════════════════════════╝

Parameter Data Block (pointed to by object+13472)
╔══════════════════════════════════════════════════════════════╗
║ +0x0148  mode/state (offset 328)                             ║
║          Read by vtable[93] (GetMode)                        ║
╠══════════════════════════════════════════════════════════════╣
║ +0x0150  hit_effect_id_array[8] (offset 336, 8 bytes each)  ║
║          Up to 8 hit effect IDs                              ║
║          Read by vtable[97] (GetHitEffectIdAt)               ║
╠══════════════════════════════════════════════════════════════╣
║ +0x0154  hit_effect_param_array (offset 340)                 ║
║          Hit effect parameters                               ║
║          Read by vtable[98] (GetHitEffectParamAt)            ║
╠══════════════════════════════════════════════════════════════╣
║ +0x0190  hit_effect_count (offset 400)                       ║
║          Read by vtable[96] (GetHitEffectCount)              ║
╠══════════════════════════════════════════════════════════════╣
║ +0x0198  hit_effect_info (offset 408+)                       ║
╠══════════════════════════════════════════════════════════════╣
║ +0x01A0  config_flags (offset 416)                           ║
║ +0x01A1  flag_useTargetTracking (offset 417)                 ║
║ +0x01A3  flag_disableRotation (offset 419)                   ║
║ +0x01A4  flag_spawnLocked (offset 420)                       ║
╠══════════════════════════════════════════════════════════════╣
║ +0x01B0  damage_data (offset 432)                            ║
║          Read by ConfigureDamageInfo (vtable[79])            ║
║          Contains: damage type, power values (256/258),      ║
║          hit stun, flags                                     ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Part 4: Behavior Pipeline Composition

### 4.1 Composition Rules

The action pipeline follows strict composition rules:

1. **One CCmdActionManager per UnitTask** — created by vtable[81]
2. **Manager creates ONE root action group** — usually Series or Parallel
3. **Action groups contain action nodes AND/OR nested groups**
4. **Series** executes sequentially: action1 → action2 → action3
5. **Parallel** executes concurrently: action1 ‖ action2 ‖ action3
6. **Nesting** creates complex patterns: Series(Parallel(A,B), C, Parallel(D,E))

### 4.2 Analyzed Pipeline Compositions

#### FreeFall Pipeline (Gravity Projectile)
```
CCmdActionManager_FreeFall::Execute()
  │
  ├── Allocate physics body (0x80 bytes)
  ├── Read params: velocity XYZ, gravity XYZ, lifetime, rotation
  │
  └── Build Pipeline:
      CCmdActionGroup_Series
        ├── CCmdAction_WaitForLifeTimeEnd(lifetime)
        │     [monitors expiration, triggers destroy on timeout]
        └── [Gravity spin action] (optional, based on rotation params)
              [applies continuous rotation during flight]

Behavior: Entity spawns with initial velocity, affected by gravity,
           destroys after lifetime expires or on collision.
```

#### Throw Pipeline (Directed Projectile)
```
CCmdActionManager_Throw::Execute()  (sub_140DEA2C0)
  │
  ├── Read params:
  │   - Rotation X (hash 1261973028) → degrees → radians
  │   - Rotation Y (hash 1010769586) → degrees → radians
  │   - Rotation Z (hash -1523167480) → degrees → radians
  │   - Config flags: params+432, params+100, params+433
  │
  └── Build Pipeline:
      CCmdActionGroup_Series
        ├── CCmdAction_TerminateSeriesEnd
        │     [end marker - terminates when reached]
        ├── [Optional: additional setup if params+435 flag set]
        └── [Main throw motion] (sub_1406A1610)
              [applies rotation vector + speed to create directed throw]

Behavior: Entity launches in specified direction with tracking.
           Can optionally curve toward target.
```

#### Boomerang Pipeline (Dual-Phase)
```
CCmdActionManager_Boomerang::Execute()  (sub_140DEC4F0)
  │
  ├── Read params:
  │   - Config: hash 850177019
  │   - Lifetime/distance: hash 1280698941
  │
  └── Build Pipeline:
      ┌── Phase 1 (Outward):
      │   Physics Body
      │     ├── CCmdAction_StandardHomingMoveSet
      │     │     [homing toward target with tracking factor]
      │     └── CCmdAction_WaitForLifeTimeEnd(negative = fixed duration)
      │           [outward phase duration]
      │
      └── Phase 2 (Return):
          CCmdActionGroup_Series
            ├── CCmdAction_WaitByFrame(N)
            │     [pause before return]
            ├── CCmdAction_Blank
            │     [separator]
            ├── [Return motion link]
            │     [reverse trajectory back to owner]
            └── CCmdAction_SetIntersectEnableMode(0)
                  [disable collision during return to prevent self-hit]

Behavior: Entity flies toward target (homing), then returns to owner.
           Collision disabled during return phase.
```

#### Summon/Assist Pipeline Pattern
```
CCmdActionManager_Summon::Execute()
  │
  └── Build Pipeline:
      CCmdActionGroup_Series
        ├── [Appear phase]
        │     Spawn animation/effect → wait for appear duration
        │
        ├── [Action phase] (varies by subtype):
        │     SummonRush: CCmdAction_StandardHomingMoveSet toward target
        │     SummonRushShot: Rush → CCmdAction_ShotBullet
        │     SummonRushAttack: Rush → melee trigger
        │     SummonSlide: CCmdAction_MoveSlide
        │     SummonTukimatoi: CCmdAction_MoveMagnetToTarget (pursuit)
        │     SummonGrap: Close range → grab trigger
        │
        └── [Leave phase]
              CCmdAction_WaitForLifeTimeEnd → destroy

Behavior: Assist unit appears, performs one action, then leaves.
```

### 4.3 Composable Behavior Primitives

These are the fundamental "building blocks" that can be freely recombined:

| Primitive | Nodes Involved | Effect |
|-----------|---------------|--------|
| **Straight Flight** | `BulletFlyFunction_ForBullet` | Constant velocity in one direction |
| **Gravity Drop** | Physics body + gravity vector | Parabolic trajectory |
| **Homing** | `StandardHomingMoveSet` | Track and pursue target |
| **Orbit** | `FunnelMawarikomi` actions | Circle around target |
| **Slide** | `MoveSlide` | Linear slide with friction |
| **Spline Path** | `MoveSpline` + `MoveRotSpline` | Follow bezier/spline curve |
| **Magnetic Pull** | `MoveMagnet*` variants | Attract toward a point/entity |
| **Teleport** | `DiscreteMove*` variants | Instant position change |
| **Synchronized** | `SynchronizedMove*` variants | Lock to parent movement |
| **Wait** | `WaitByFrame` / `WaitForLifeTimeEnd` | Timing control |
| **Fire** | `ShotBullet` | Spawn child projectile |
| **Collision Toggle** | `SetIntersectEnableMode` | Turn hit on/off |
| **Effect** | `GlobalEffect` / `AttachedEffect_*` | Visual FX spawn |
| **Terminate** | `TerminateSeriesEnd` / `TerminateStop` | End action chain |

---

## Part 5: Implementation Templates

### 5.1 Template: Creating a Completely New UnitTask

```
STEP 1: Define the class identity
  - Choose a unique GetClassId (slot 28) return value
  - Decide the object size (0x3530 for standard, may need more)
  - Choose which VDK base class to inherit from (or create fresh)

STEP 2: Implement the 15 mandatory vtable overrides
  slot  0: Destructor — free all allocated resources
  slot  2: OnInit — read params, setup hit effects, call ResetActions
  slot  3: ConstructorHelper — init base members
  slot 12: OnUpdate — main tick: iterate hit effects → delegate to base
  slot 21: PreInit — early init, setup sub-components
  slot 23: GetTypeFlags — return type info
  slot 28: GetClassId — return UNIQUE_ID
  slot 54: CanHitTarget — 3D distance < hit_range
  slot 55: ShouldCancel — 3D distance > cancel_range
  slot 70: OnParamChanged — store param update to object+13592
  slot 71: OnTrigger — delegate to vtable[94]
  slot 73: OnCollisionCheck — check mode → trigger kill
  slot 77: OnSpawnHitEffects — iterate effects via vtable[96][97][98]
  slot 78: Factory — allocate(size) → construct chain → return instance
  slot 79: ConfigureDamageInfo — fill damage struct (type, power, stun)
  slot 81: CreateCmdActionManager — CREATE YOUR BEHAVIOR (see below)

STEP 3: Create a CCmdActionManager subclass
  - Override slot 1 (Execute) to build the action pipeline
  - In Execute():
    a. Allocate physics body if needed
    b. Read parameters via hash lookup
    c. Create CCmdAction_* nodes
    d. Create CCmdActionGroup_* containers
    e. Wire everything together
    f. Register to manager

STEP 4: Register the class
  - Call the registration function (sub_140921530-pattern)
  - Store constructor fn pointer at offset 520 in the global table
  - This makes the class available for runtime instantiation
```

### 5.2 Template: Recombining Existing Behaviors

**Example: "Homing Mortar" — mortar arc + homing correction**

```
New CCmdActionManager_HomingMortar::Execute():
  │
  └── CCmdActionGroup_Series
        ├── Phase 1: Initial Arc (from Mortar primitives)
        │   CCmdAction_MortarFlyFunction_ForBullet
        │     [initial parabolic arc, reads arc angle + gravity]
        │
        ├── Transition:
        │   CCmdAction_WaitByFrame(30)  // ~0.5 second arc phase
        │     [let the mortar reach peak of arc]
        │
        ├── Phase 2: Homing Descent (from Homing primitives)
        │   CCmdActionGroup_Parallel
        │     ├── CCmdAction_StandardHomingMoveSet
        │     │     [engage homing toward target for descent]
        │     └── CCmdAction_WaitForLifeTimeEnd(120)
        │           [destroy after 2 seconds total]
        │
        └── Cleanup:
            CCmdAction_TerminateSeriesEnd
```

**Example: "Sticky Boomerang" — boomerang + stick on contact**

```
New CCmdActionManager_StickyBoomerang::Execute():
  │
  └── CCmdActionGroup_Series
        ├── Phase 1: Outward Flight (from Boomerang)
        │   CCmdAction_StandardHomingMoveSet
        │     [fly toward target with tracking]
        │
        ├── Contact Detection:
        │   CCmdAction_DistCheckerNearToTarget
        │     [when close to target, transition to stick]
        │
        ├── Phase 2: Stick (from Sticker)
        │   CCmdAction_MoveTransStickingMatrix
        │     [attach to target surface]
        │
        ├── Attached Phase:
        │   CCmdAction_WaitByFrame(180)  // stick for 3 seconds
        │
        ├── Phase 3: Return (from Boomerang)
        │   CCmdAction_ReleaseStick
        │   [return motion to owner]
        │
        └── CCmdAction_TerminateSeriesEnd
```

**Example: "Multi-Shot Funnel Swarm" — funnel orbit + rapid fire**

```
New CCmdActionManager_MultiShotFunnel::Execute():
  │
  └── CCmdActionGroup_Series
        ├── Phase 1: Deploy (from Funnel)
        │   CCmdAction_SynchronizedMoveDrift
        │     [drift to formation position]
        │
        ├── Phase 2: Orbit + Shoot (PARALLEL combination)
        │   CCmdActionGroup_Parallel
        │     ├── [Orbit action] (from FunnelMawarikomi)
        │     │     [orbit around target]
        │     ├── CCmdActionGroup_Series (firing loop)
        │     │     ├── CCmdAction_WaitByFrame(10)
        │     │     ├── CCmdAction_ShotBullet
        │     │     ├── CCmdAction_WaitByFrame(10)
        │     │     ├── CCmdAction_ShotBullet
        │     │     └── ... (repeat)
        │     └── CCmdAction_WaitForLifeTimeEnd(300)
        │           [5 second orbit duration]
        │
        └── Phase 3: Return
            CCmdAction_Return
            CCmdAction_TerminateSeriesEnd
```

### 5.3 Template: Hooking/Proxying an Existing UnitTask

**Approach 1: VTable Replacement (Runtime Patching)**
```
Target: Modify FreeFall to add homing mid-flight

1. Find FreeFall vtable address (from RTTI)
2. Replace vtable[81] (CreateCmdActionManager) pointer
3. New function:
   - Call original CCmdActionManager_FreeFall factory
   - BUT inject additional actions into the pipeline
   - Add CCmdAction_StandardHomingMoveSet after initial velocity phase

Result: FreeFall entities now curve toward target mid-flight
```

**Approach 2: Parameter Override (Data-Only Mod)**
```
Target: Change Throw projectile behavior

1. Identify hash keys used by CCmdActionManager_Throw
2. Override parameter values in the data store:
   - rotation_x_degrees → different angle
   - tracking_factor → higher value for more homing
   - lifetime → longer or shorter

Result: Same code, different behavior via data changes
```

**Approach 3: CCmdActionManager Swap**
```
Target: Replace Boomerang behavior with Anchor behavior

1. In the UnitTask class, override slot 81 (CreateCmdActionManager)
2. Instead of creating CCmdActionManager_Boomerang,
   create CCmdActionManager_Anchor
3. Ensure parameter compatibility (anchor reads different hashes)

Result: Entity that looked like a boomerang now behaves like a grapple
```

---

## Part 6: Quick Reference — Decision Matrix

### "I want to create X, which base should I use?"

| Desired Behavior | Recommended Base | CCmdActionManager | Key Difference |
|-----------------|-----------------|-------------------|----------------|
| Simple projectile, straight line | FreeFall | _FreeFall | No homing, gravity only |
| Projectile that tracks target | Throw | _Throw | Homing with configurable tracking |
| Projectile that returns to owner | Boomerang | _Boomerang | Dual-phase with return |
| Static trap/mine | PutObj | _PutObj | No movement at all |
| Stick to target on hit | Sticker | _Sticker | Attach on contact |
| Expanding shockwave | ShockHalo | _ShockHalo | Radius expansion |
| Player-controlled drone | Radicon | _Radicon | Takes player input |
| Autonomous flying bit | FunnelFly | _FunnelFly | AI-driven flight |
| Orbiting attack drone | FunnelMawarikomi | _FunnelMawarikomi | Circles target |
| Assist unit (appear→act→leave) | Summon | _Summon* | One-shot assist |
| Attached to parent unit | Attach | _Attach | Moves with parent |
| Grapple/hook | Anchor | _Anchor | Extend→grab→retract |
| Mortar/grenade arc | ThrowMortar | _ThrowMortar | Parabolic arc |
| Timed explosion | Detonator | _Detonator | Delayed detonation |
| Relay/redirect point | Relay | _Relay | Beam redirection |

### "I want behavior X, which action nodes do I need?"

| Desired Behavior | Action Node Combination |
|-----------------|------------------------|
| Fly straight then explode | `BulletFlyFunction` → `WaitForLifeTimeEnd` → `TerminateSeriesEnd` |
| Track target then stick | `StandardHomingMoveSet` → `DistCheckerNearToTarget` → `MoveTransStickingMatrix` |
| Wait then shoot | `WaitByFrame(N)` → `ShotBullet` |
| Orbit and shoot periodically | Parallel(`FunnelMawarikomi`, Series(`WaitByFrame` → `ShotBullet` → repeat)) |
| Phase 1 → Phase 2 transition | Series(Phase1_actions, `WaitByFrame`, Phase2_actions) |
| Enable damage after delay | `WaitByFrame(N)` → `SetIntersectEnableMode(1)` |
| Disable damage before return | `SetIntersectEnableMode(0)` → return_actions |
| Spawn sub-projectile mid-flight | movement_action, `ShotBullet`, continue_movement |
| Follow parent unit | `SynchronizedMove` or `SynchronizedMoveDrift` |
| Rush toward target, attack, leave | `StandardHomingMoveSet` → combat_trigger → `Return` → `TerminateSeriesEnd` |
