# EXVS2 Parameter Visual Editors — Design Specification

> Date: 2026-05-03  
> Status: Design Complete  
> Tech Stack: React 19 + React Three Fiber + Zustand + Radix UI + Tailwind CSS

---

## Overview

Design and implement 9 commercial-quality visual parameter editors for EXVS2 game modding. Each editor replaces the legacy plaintext form with domain-specific interactive UI that reflects actual game logic, including hidden runtime algorithms discovered via reverse engineering.

**Key Principle**: Parameters in EXVS2 are NOT simple key-value pairs. The game applies complex transformations at runtime:
- `eventA = eventB + eventC + realtime_calculation`
- Hash-based dispatch selects processing paths
- SIMD acceleration for physics calculations
- State-machine gated processing (e.g., collision only when state >= 2)
- Composite patterns (Defense + HomingMoveSet combined)

---

## Development Priority

| Batch | Files | Rationale |
|-------|-------|-----------|
| 1 | bulletparam → armsparam → speedparam | Core combat; bullet preview exists as foundation |
| 2 | characterparam → chrsysparam → grapparam | Character system layer |
| 3 | projectile_depiction_table → hitgroupiddef → interactionid | Visual/collision definition layer |

---

## Shared Architecture

### Layout Pattern (All Editors)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Tab: Editor Name]                                    [Save] [Export]    │
├────────────┬────────────────────────────────────────────────────────────┤
│            │                                                            │
│  ENTRY     │              VISUAL CANVAS                                 │
│  LIST      │     (3D/2D domain-specific visualization)                  │
│            │                                                            │
│  ┌──────┐  │                                                            │
│  │ #000 │  │                                                            │
│  │ #001 │  │                                                            │
│  │ #002 │  │                                                            │
│  │ ...  │  │                                                            │
│  └──────┘  │                                                            │
│            ├────────────────────────────────────────────────────────────┤
│  [Filter]  │              PROPERTY PANEL                                │
│  [Search]  │     (Context-aware parameter groups)                       │
│            │                                                            │
├────────────┴────────────────────────────────────────────────────────────┤
│ STATUS BAR: [Entry Count] [Modified] [Validation Warnings]              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Shared Components

- **EntryListPanel**: Filterable/searchable entry list with virtual scrolling
- **VisualCanvas**: Domain-specific R3F or 2D canvas
- **PropertyPanel**: Grouped parameter editors with validation
- **StatusBar**: Entry count, modification state, warnings
- **UndoRedoStack**: Zustand middleware for full undo/redo
- **DiffView**: Before/after comparison when values change
- **CrossRefPanel**: Shows which other params reference this entry

### State Management Pattern

```
paramEditorStore (Zustand)
├── entries: TypedParamEntry[]
├── selectedEntryId: number
├── modifiedFields: Set<string>
├── undoStack / redoStack
├── validationErrors: Map<string, string>
└── visualState: EditorSpecificState
```

---

## Editor 1: BulletParam Editor (Enhanced)

### Purpose
Edit projectile behavior parameters. The game processes these through `CCmdActionManager` pipelines with 49+ VDK base classes.

### Game Logic (Runtime Processing Chain)
```
Raw Param → MoveType Dispatch → Physics Pipeline → Per-Frame Update
                │
                ├─ Type 0 (Straight): velocity + gravity accumulation
                ├─ Type 1 (Missile): StandardHomingMoveSet(turnRate, accelRate, maxSpeed)
                ├─ Type 2 (Throw/Mortar): parabolic arc = initial_vel + gravity * t²/2
                ├─ Type 3 (Funnel): orbit_radius + angular_velocity + detach_homing
                ├─ Type 4 (Anchor): SIMD arc from owner bone + state-gated collision
                ├─ Type 5 (Boomerang): forward + reverse with tracking toggle
                ├─ Type 6 (Radicon): remote-control input mapping
                ├─ Type 7 (Spline): bezier curve with rotation sync
                └─ Type 255 (Generic): raw velocity vector
```

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Bullet Parameter Editor                              [▶ Play] [⏸] [⏹]  │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── 3D TRAJECTORY VIEWPORT ──────────────────────────┐   │
│ BULLET     │  │                                                     │   │
│ LIST       │  │    [Player]─────── trajectory ──────→ [Enemy]       │   │
│            │  │         \  ghost positions  /                       │   │
│ ┌────────┐ │  │          ·  ·  ·  ·  ·  ·                          │   │
│ │▸ #000  │ │  │     hitbox[█]  blast(○)  range(◎)                   │   │
│ │  #001  │ │  │                                                     │   │
│ │  #002  │ │  │  Camera: [Orbit] [Top] [Side] [Follow]              │   │
│ │  #003  │ │  └─────────────────────────────────────────────────────┘   │
│ └────────┘ │                                                            │
│            │  ┌─── PROPERTY GROUPS ─────────────────────────────────┐   │
│ [MoveType] │  │ ┌────────────┐ ┌────────────┐ ┌───────────────┐    │   │
│ [Series]   │  │ │ Movement   │ │ Homing     │ │ Collision     │    │   │
│ [Unit]     │  │ │            │ │            │ │               │    │   │
│            │  │ │ speed: 2.5 │ │ turnRate:  │ │ hitWidth: 1.0 │    │   │
│ ────────── │  │ │ accel: 0.1 │ │   0.05     │ │ hitHeight:1.5 │    │   │
│ TIMELINE   │  │ │ maxSpd:5.0 │ │ trackMode: │ │ hitDepth: 0.5 │    │   │
│ ┌────────┐ │  │ │ gravity:   │ │   [Full▼]  │ │ group: [A▼]   ��    │   │
│ │▓▓▓░░░░░│ │  │ │  0,-9.8,0  │ │ delay: 10f │ │ pierce: [✓]   │    │   │
│ │Frame 23│ │  │ └────────────┘ └────────────┘ └───────────────┘    │   │
│ └────────┘ │  │ ┌────────────┐ ┌────────────┐ ┌───────────────┐    │   │
│            │  │ │ Damage     │ │ Lifetime   │ │ Effects       │    │   │
│            │  │ │            │ │            │ │               │    │   │
│            │  │ │ power: 70  │ │ frames:120 │ │ hitEffect:    │    │   │
│            │  │ │ type:      │ │ mode:      │ │  [BeamHit▼]   │    │   │
│            │  │ │ [Proj▼]    │ │ [Relative] │ │ sound: 0x3A.. │    │   │
│            │  │ │ flags:     │ │            │ │ spawn:        │    │   │
│            │  │ │ DOWN+HIT   │ │ -120=fixed │ │  [OnHit▼]     │    │   │
│            │  │ └────────────┘ └────────────┘ └───────────────┘    │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ Entry #000 │ MoveType: Missile │ Modified: 3 fields │ ⚠ turnRate > 0.1 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **MoveType-Aware Property Panel**: Shows/hides parameter groups based on moveType selection
   - Missile shows Homing group; Straight hides it
   - Anchor shows Chain Physics group
   - Funnel shows Orbit Parameters group

2. **Real-Time Trajectory Simulation** (Enhanced from existing):
   - Frame-accurate physics matching game engine
   - Gravity accumulation: `pos += vel * dt; vel += gravity * dt`
   - Homing: `dir = lerp(dir, toTarget, turnRate); vel = dir * speed`
   - Visual frame markers every N frames on trajectory

3. **DPS Calculator Panel**:
   ```
   Effective DPS = (damage * hitCount) / (lifetime_frames / 60)
   With homing accuracy factor applied
   ```

4. **Comparison Mode**: Side-by-side two bullets for balancing

5. **Validation Rules**:
   - turnRate > 0.1 → warning (may feel broken in-game)
   - lifetime < 0 → info (absolute mode)
   - speed > 600 → error (engine clamp)

---

## Editor 2: ArmsParam Editor

### Purpose
Define weapon slot configurations: ammo, reload, cooldown, weapon switching, and slot assignments per unit.

### Game Logic (Runtime Processing Chain)
```
Input Command → MSC Syscall Dispatch → Action Hash Lookup → Weapon Slot Resolve
                                              │
                          ┌───────────────────┼──────────────────────┐
                          │                   │                      │
                    setupMainShot      setupSubShot          setupMeleeAction
                          │                   │                      │
                    ┌─────┴─────┐       ┌────┴────┐           ┌────┴────┐
                    │ ammo--    │       │ ammo--  │           │ gauge-- │
                    │ cooldown  │       │ reload  │           │ frames  │
                    │ bulletRef │       │ link    │           │ hitRef  │
                    └───────────┘       └─────────┘           └─────────┘
```

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Arms Parameter Editor                        [Save] [Export] [Compare]   │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── WEAPON SLOT DIAGRAM ─────────────────────────────┐   │
│ ENTRY      │  │                                                     │   │
│ LIST       │  │          ┌─────────────────────┐                    │   │
│            │  │          │    UNIT SILHOUETTE   │                    │   │
│ ┌────────┐ │  │          │                     │                    │   │
│ │▸ #000  │ │  │   [MainA]│─→  ╔═══╗  ←─│[SubA]                    │   │
│ │  #001  │ │  │   [MainB]│─→  ║   ║  ←─│[SubB]                    │   │
│ │  #002  │ │  │  [Melee] │─→  ╚═══╝  ←─│[Special]                 │   │
│ │  ...   │ │  │          │                     │                    │   │
│ └────────┘ │  │          └─────────────────────┘                    │   │
│            │  │                                                     │   │
│ Sort By:   │  │  Selected Slot: [Main Shot A] ────────────────────  │   │
│ [Unit ▼]   │  │  Bullet Link: → bulletparam #023 (BeamRifle)        │   │
│            │  │  DPS Output: 245 dmg/sec @ max rate                 │   │
│            │  └─────────────────────────────────────────────────────┘   │
│            │                                                            │
│            │  ┌─── SLOT PROPERTIES ─────────────────────────────────┐   │
│            │  │                                                     │   │
│            │  │ ┌──────────────────┐  ┌──────────────────────────┐  │   │
│            │  │ │ Ammo & Reload    │  │ Timing & Cooldown        │  │   │
│            │  │ │                  │  │                          │  │   │
│            │  │ │ maxAmmo:    8    │  │ cooldownFrames:    20    │  │   │
│            │  │ │ reloadTime: 180f │  │ inputBuffer:       5f    │  │   │
│            │  │ │ reloadType:      │  │ cancelWindow:     12f    │  │   │
│            │  │ │  [AllAtOnce▼]    │  │ chainDelay:        8f    │  │   │
│            │  │ │ ammoPerShot: 1   │  │                          │  │   │
│            │  │ └──────────────────┘  └──────────────────────────┘  │   │
│            │  │                                                     │   │
│            │  │ ┌──────────────────┐  ┌──────────────────────────┐  │   │
│            │  │ │ Slot Behavior    │  │ Cost & Gauge             │  │   │
│            │  │ │                  │  │                          │  │   │
│            │  │ │ inputAction:     │  │ boostCost:       15      │  │   │
│            │  │ │  [0xf48d2d49]    │  │ overHeatPenalty: 60f     │  │   │
│            │  │ │ weaponState:     │  │ gaugeType:               │  │   │
│            │  │ │  [Normal▼]       │  │  [SharedAmmo▼]           │  │   │
│            │  │ │ bulletParamRef:  │  │ costMultiplier:  1.0     │  │   │
│            │  │ │  [#023 ▼]       │  │                          │  │   │
│            │  │ └──────────────────┘  └──────────────────────────┘  │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ Entry #000 │ Slots: 6/8 defined │ Total DPS: 485 │ Ammo Economy: Good  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Weapon Slot Diagram**: Visual unit silhouette showing weapon slot positions
   - Click slot to select and edit its properties
   - Color-coded by weapon type (beam=blue, physical=orange, melee=red)
   - Shows ammo gauge bars next to each slot

2. **Cross-Reference Links**: Click bulletParamRef to jump to BulletParam editor entry

3. **Ammo Economy Visualizer**:
   ```
   Timeline bar showing:
   [Fire][Fire][Fire][──Reload──][Fire][Fire]...
   With DPS output graph overlay
   ```

4. **Action Hash Resolver**: Displays known action hashes with human-readable names
   - 0xf48d2d49 → "Main Shot"
   - Lookup table from MSC analysis

5. **Weapon Balance Overview**: Table view comparing all weapon slots' DPS, ammo efficiency

---

## Editor 3: SpeedParam Editor

### Purpose
Define movement parameters: walk/run/dash speeds, boost properties, step/jump/fall physics, and momentum curves.

### Game Logic (Runtime Processing Chain)
```
Input State → Movement Mode Resolve → Speed Calculation → Position Update
                    │
     ┌──────────────┼──────────────────────────┐
     │              │                           │
  Walking        Boosting                   Step/Dash
     │              │                           │
  baseSpeed    boostSpeed * dirFactor      dashSpeed * curve(frame)
     │              │                           │
  +gravity     +boostAccel (capped)        +inertia decay
     │              │                           │
  Final pos    Gauge drain per frame       Recovery frames
```

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Speed Parameter Editor                       [Save] [Export] [Simulate]  │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── MOVEMENT VISUALIZATION ──────────────────────────┐   │
│ ENTRY      │  │                                                     │   │
│ LIST       │  │   TOP-DOWN VIEW              SPEED CURVE GRAPH      │   │
│            │  │   ┌─────────────┐            ┌─────────────────┐    │   │
│ ┌────────┐ │  │   │      ↑      │            │    ╱──────╲     │    │   │
│ │▸ #000  │ │  │   │      │walk  │            │   ╱        ╲    │    │   │
│ │  #001  │ │  │   │  ←───●───→  │            │  ╱    dash   ╲  │    │   │
│ │  #002  │ │  │   │   boost│    │            │ ╱              ╲ │    │   │
│ │  ...   │ │  │   │      ↓     │            │╱     walk       ╲│    │   │
│ └────────┘ │  │   │  range:220  │            │──────────────────│    │   │
│            │  │   └─────────────┘            │0f    30f    60f  │    │   │
│ Sort:      │  │                              └─────────────────┘    │   │
│ [Cost ▼]   │  │   Movement Radius: ◎ walk  ◎ boost  ◎ dash         │   │
│            │  └─────────────────────────────────────────────────────┘   │
│            │                                                            │
│            │  ┌─── PARAMETER GROUPS ────────────────────────────────┐   │
│            │  │                                                     │   │
│            │  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │   │
│            │  │ │ Ground Move  │ │ Boost/Dash   │ │ Air/Fall     │ │   │
│            │  │ │              │ │              │ │              │ │   │
│            │  │ │ walkSpeed:   │ │ boostSpd:    │ │ fallSpeed:   │ │   │
│            │  │ │   1.2        │ │   3.8        │ │   2.0        │ │   │
│            │  │ │ runSpeed:    │ │ dashSpd:     │ │ jumpHeight:  │ │   │
│            │  │ │   2.0        │ │   5.5        │ │   8.0        │ │   │
│            │  │ │ turnRate:    │ │ boostAccel:  │ │ airDashSpd:  │ │   │
│            │  │ │   0.15       │ │   1.2        │ │   4.2        │ │   │
│            │  │ │ backSpeed:   │ │ boostDrain:  │ │ fallAccel:   │ │   │
│            │  │ │   0.8        │ │   2.5/f      │ │   0.5        │ │   │
│            │  │ └──────────────┘ └──────────────┘ └──────────────┘ │   │
│            │  │                                                     │   │
│            │  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │   │
│            │  │ │ Step/Dodge   │ │ Recovery     │ │ Inertia      │ │   │
│            │  │ │              │ │              │ │              │ │   │
│            │  │ │ stepDist:    │ │ landLag:     │ │ groundFric:  │ │   │
│            │  │ │   6.0        │ │   8f         │ │   0.85       │ │   │
│            │  │ │ stepFrames:  │ │ knockdownRec:│ │ airFric:     │ │   │
│            │  │ │   12         │ │   45f        │ │   0.95       │ │   │
│            │  │ │ iFrames:     │ │ wallBounce:  │ │ momentumCap: │ │   │
│            │  │ │   6-10       │ │   12f        │ │   8.0        │ │   │
│            │  │ └──────────────┘ └──────────────┘ └──────────────┘ │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ #000 │ Cost: 2000 │ Mobility Score: B+ │ Boost: 4.2sec @ full drain    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Top-Down Movement Radius Visualizer**:
   - Concentric circles showing walk/boost/dash ranges in 1 second
   - Animated unit dot showing movement with current params
   - Directional speed differences (forward vs backward)

2. **Speed Curve Graph**:
   - X-axis: frames, Y-axis: speed
   - Shows acceleration curves for dash/step
   - Overlay multiple movement modes for comparison

3. **Boost Gauge Simulator**:
   ```
   [████████████░░░░] 75% — 3.2 sec remaining
   Drain rate: 2.5/frame | Regen: 0.8/frame (grounded)
   ```

4. **Mobility Score Calculator**: Weighted rating based on:
   - Max ground speed, air mobility, step distance, recovery frames
   - Compared against game's unit cost tier

5. **Frame Data Table**: Step/dash startup, active, recovery frames in fighting-game notation

---

## Editor 4: CharacterParam Editor

### Purpose
Define unit base stats: HP, boost gauge, defense modifiers, armor properties, size class, and state thresholds.

### Game Logic (Runtime Processing Chain)
```
Unit Spawn → CharacterParam Load → State Machine Init → Per-Frame Stat Check
                    │
     ┌──────────────┼──────────────────────────────────────┐
     │              │                    │                  │
   HP System    Boost System        Defense Calc       Size/Armor
     │              │                    │                  │
  maxHP         maxBoost            damageReduction     hitboxScale
  redHP timer   regenRate           armorThreshold      weight class
  yellowHP      regenDelay          guardFrames         flinch resist
```

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Character Parameter Editor                   [Save] [Export] [Balance]   │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── UNIT STAT RADAR ─────────────────────────────────┐   │
│ ENTRY      │  │                                                     │   │
│ LIST       │  │         HP                   STAT BARS              │   │
│            │  │         ╱╲                  ┌─────────────────┐     │   │
│ ┌────────┐ │  │    Def╱    ╲Boost           │ HP:  ████████░░ │     │   │
│ │▸ #000  │ │  │      │      │               │ Boost:██████░░░ │     │   │
│ │  #001  │ │  │  Size─┤      ├─Speed         │ Def:  ███░░░░░░ │     │   │
│ │  #002  │ │  │      │      │               │ Spd:  █████░░░░ │     │   │
│ │  ...   │ │  │    Arm╲    ╱Atk             │ Atk:  ██████░░░ │     │   │
│ └────────┘ │  │         ╲╱                  │ Arm:  ████░░░░░ │     │   │
│            │  │        Weight                └─────────────────┘     │   │
│ Filter:    │  │                                                     │   │
│ [Cost ▼]   │  │  Unit Class: [2000 Cost] [Medium Weight] [Standard] │   │
│ [HP Range] │  │  Effective Durability: 847 (HP×DefMod+Armor)        │   │
│            │  └─────────────────────────────────────────────────────┘   │
│            │                                                            │
│            │  ┌─── PARAMETER GROUPS ────────────────────────────────┐   │
│            │  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │   │
│            │  │ │ Hit Points   │ │ Boost Gauge  │ │ Defense      │ │   │
│            │  │ │              │ │              │ │              │ │   │
│            │  │ │ maxHP: 620   │ │ maxBoost:    │ │ defMod: 1.0  │ │   │
│            │  │ │ redHP: 45f   │ │   100        │ │ guardMod:    │ │   │
│            │  │ │ downHP: 200  │ │ regenRate:   │ │   0.7        │ │   │
│            │  │ │ deathAnim:   │ │   0.8/f      │ │ armorHP: 0   │ │   │
│            │  │ │  [Explode▼]  │ │ regenDelay:  │ │ flinchThres: │ │   │
│            │  │ │              │ │   30f        │ │   100        │ │   │
│            │  │ └──────────────┘ └──────────────┘ └──────────────┘ │   │
│            │  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │   │
│            │  │ │ Size & Weight│ │ Awakening    │ │ Misc Flags   │ │   │
│            │  │ │              │ │              │ │              │ │   │
│            │  │ │ hitboxW: 2.0 │ │ awakeHP%: 30 │ │ canStep: [✓] │ │   │
│            │  │ │ hitboxH: 4.0 │ │ awakeBoost:  │ │ canGuard:[✓] │ │   │
│            │  │ │ weight: 1.5  │ │   +50%       │ │ canAirDash:  │ │   │
│            │  │ │ pushback:    │ │ awakeDef:    │ │   [✓]        │ │   │
│            │  │ │   1.2        │ │   0.8        │ │ hasArmor:[✗] │ │   │
│            │  │ └──────────────┘ └──────────────┘ └──────────────┘ │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ #000 │ 2000 Cost │ Durability: 847 │ Boost: 6.2s │ Tier: Mid-range     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Radar Chart**: 6-axis stat visualization (HP, Boost, Defense, Speed, Attack, Armor)
   - Overlay comparison with another unit

2. **Effective Durability Calculator**:
   ```
   EHP = maxHP / (1 - defMod) + armorHP × armorEfficiency
   Awakening EHP = (maxHP × awakeHP%) / (1 - awakeDef)
   ```

3. **Damage Taken Simulator**: Input a damage value → show how many hits to kill

4. **Cost-Tier Balance View**: Show where this unit sits relative to cost bracket averages

5. **Awakening Phase Visualizer**: HP bar showing awakening trigger point and stat changes

---

## Editor 5: ChrSysParam Editor

### Purpose
Edit character system parameters (hash-based key-value store). These control global character behaviors referenced by hash at runtime.

### Game Logic
```
Hash Lookup → qword_1421155D0 + 2904 → Value Retrieved → Context Application
                                              │
                    ┌─────────────────────────┼────────────────────┐
                    │                         │                    │
              Physics Params           Animation Params       System Params
              (rotation speed,         (blend times,          (invuln frames,
               gravity mult)            cancel windows)        state durations)
```

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ChrSysParam Editor (Hash-Based)              [Save] [Export] [Decode]    │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── HASH MAP VISUALIZATION ──────────────────────────┐   │
│ HASH       │  │                                                     │   │
│ ENTRIES    │  │  ┌─────────────────────────────────────────────┐    │   │
│            │  │  │  CATEGORY GRAPH (Force-directed)            │    │   │
│ ┌────────┐ │  │  │                                             │    │   │
│ │0x397A28│ │  │  │    [Physics]──┬──[Rotation]                 │    │   │
│ │0x0D6A5C│ │  │  │              ├──[Gravity]                  │    │   │
│ │0xD47EF2│ │  │  │              └──[Velocity]                 │    │   │
│ │0xA38A1E│ │  │  │                                             │    │   │
│ │0xFA5739│ │  │  │    [Combat]───┬──[Damage]                   │    │   │
│ │...     │ │  │  │              ├──[Stun]                     │    │   │
│ └────────┘ │  │  │              └──[HitEffect]                │    │   │
│            │  │  │                                             │    │   │
│ Search:    │  │  │    [Animation]─┬──[Cancel]                  │    │   │
│ [hash/name]│  │  │               └──[Blend]                   │    │   │
│            │  │  └─────────────────────────────────────────────┘    │   │
│ Category:  │  └─────────────────────────────────────────────────────┘   │
│ [All ▼]    │                                                            │
│            │  ┌─── ENTRY DETAIL ────────────────────────────────────┐   │
│            │  │                                                     │   │
│            │  │ Hash: 0x397A280D   Decoded: "piercing_enabled"      │   │
│            │  │ Category: [Combat]  Sub: [HitFlags]                 │   │
│            │  │                                                     │   │
│            │  │ ┌─────────────────────────────────────────────────┐ │   │
│            │  │ │ Value 1 (F32): 1.0        │ Interpreted: TRUE   │ │   │
│            │  │ │ Value 2 (U32): 0x00000000 │ Interpreted: —      │ │   │
│            │  │ │ Value 3 (F32): 0.0        │ Interpreted: —      │ │   │
│            │  │ │ Value 4 (U32): 0x00000000 │ Interpreted: —      │ │   │
│            │  │ └─────────────────────────────────────────────────┘ │   │
│            │  │                                                     │   │
│            │  │ Referenced By: BulletParam #005, #012, #044         │   │
│            │  │ Game Usage: Enables bullet piercing through targets │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ 147 entries │ 23 decoded │ 124 unknown │ Category: Combat (34 entries)  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Hash Decoder Database**: Known hashes with human-readable names and descriptions
   - User can add custom hash decodings
   - Auto-categorization based on value patterns

2. **Category Graph**: Force-directed graph grouping related hashes by category
   - Click node to select entry
   - Visual clustering of unknown hashes by value similarity

3. **Cross-Reference Panel**: Shows which other param files reference this hash

4. **Batch Edit Mode**: Modify all entries in a category simultaneously

5. **Value Interpreter**: Context-aware display (F32 as bool for 0.0/1.0, as degrees for angle-range values, as frames for integer-range values)

---

## Editor 6: GrapParam Editor

### Purpose
Define grab/throw mechanics: grab range, grab speed, throw damage, throw trajectory, and tech-recovery windows.

### Game Logic (Runtime Processing Chain)
```
Grab Input → Range Check → Grab Connect → Throw Sequence → Release
                │                │              │              │
           3D distance      hitbox overlap   animation      trajectory calc
           + height check   + state check    + damage       + victim physics
                                             + direction    + knockdown state
```

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Grap Parameter Editor                        [Save] [Export] [Preview]   │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── GRAB RANGE VISUALIZER ───────────────────────────┐   │
│ ENTRY      │  │                                                     │   │
│ LIST       │  │   TOP VIEW              SIDE VIEW                   │   │
│            │  │   ┌─────────┐           ┌─────────┐                 │   │
│ ┌────────┐ │  │   │    ╭╮   │           │   ╭╮    │                 │   │
│ │▸ #000  │ │  │   │   ╭╯╰╮  │           │  ╭╯╰╮   │                 │   │
│ │  #001  │ │  │   │  │ ●  │ │           │  │ ●│   │                 │   │
│ │  #002  │ │  │   │   ╰╮╭╯  │           │  ╰╮╭╯   │                 │   │
│ │  ...   │ │  │   │    ╰╯   │           │   ╰╯    │                 │   │
│ └────────┘ │  │   └─────────┘           └─────────┘                 │   │
│            │  │   range: 3.5             height: ±2.0                │   │
│            │  │                                                     │   │
│            │  │   THROW ARC                                         │   │
│            │  │   ┌────────────────────────────────────────┐        │   │
│            │  │   │      ·  ·                              │        │   │
│            │  │   │   ·        ·                           │        │   │
│            │  │   │  ·           ·                         │        │   │
│            │  │   │ ●              · · · ×(land)           │        │   │
│            │  │   └────────────────────────────────────────┘        │   │
│            │  └─────────────────────────────────────────────────────┘   │
│            │                                                            │
│            │  ┌─── PARAMETERS ──────────────────────────────────────┐   │
│            │  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │   │
│            │  │ │ Grab Hitbox  │ │ Throw Props  │ │ Recovery     │ │   │
│            │  │ │              │ │              │ │              │ │   │
│            │  │ │ range: 3.5   │ │ throwDmg: 80│ │ techWindow:  │ │   │
│            │  │ │ height: 2.0  │ │ throwDir:    │ │   12f        │ │   │
│            │  │ │ width: 2.5   │ │  [Forward▼]  │ │ untechDown:  │ │   │
│            │  │ │ startup: 5f  │ │ throwForce:  │ │   60f        │ │   │
│            │  │ │ active: 3f   │ │   8.0        │ │ groundBounce:│ │   │
│            │  │ │ whiff: 20f   │ │ throwAngle:  │ │   [Yes▼]     │ │   │
│            │  │ │              │ │   45°        │ │              │ │   │
│            │  │ └──────────────┘ └──────────────┘ └──────────────┘ │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ #000 │ Range: 3.5 │ Dmg: 80 │ Tech: 12f │ Advantage: +48f on no-tech   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Grab Range Visualizer**: Top-down and side-view showing grab hitbox cone/sphere
   - Animated preview of grab startup → active → recovery
   - Shows distance at which grab will connect

2. **Throw Arc Preview**: Parabolic trajectory of thrown victim
   - Landing position marker
   - Wall/floor bounce calculation

3. **Frame Advantage Calculator**:
   ```
   On hit (no tech): throwRecovery - victimDownTime = advantage frames
   On tech: throwRecovery - techWindow = disadvantage frames
   ```

4. **Matchup Context**: "At this range, these weapons can punish the whiff"

---

## Editor 7: ProjectileDepictionTable Editor

### Purpose
Define visual presentation of projectiles: model, particle effects, trail, scale, color, and render properties.

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Projectile Depiction Table Editor            [Save] [Export] [Preview]   │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── VISUAL PREVIEW ──────────────────────────────────┐   │
│ ENTRY      │  │                                                     │   │
│ LIST       │  │              3D PROJECTILE PREVIEW                   │   │
│            │  │                                                     │   │
│ ┌────────┐ │  │          ════════●═══▶                              │   │
│ │▸ #000  │ │  │          trail  body  tip                           │   │
│ │  #001  │ │  │                                                     │   │
│ │  #002  │ │  │   [Wireframe] [Solid] [With Effects] [Dark BG]     │   │
│ │  ...   │ │  │                                                     │   │
│ └────────┘ │  │   Scale: ─────●──── 1.5x                           │   │
│            │  │   Rotation: [Auto-align to velocity]                │   │
│            │  └─────────────────────────────────────────────────────┘   │
│ Group By:  │                                                            │
│ [Effect▼]  │  ┌─── DEPICTION PROPERTIES ───────────────────────────┐   │
│            │  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │   │
│            │  │ │ Model/Shape  │ │ Trail/Particle│ │ Rendering    │ │   │
│            │  │ │              │ │              │ │              │ │   │
│            │  │ │ modelHash:   │ │ trailType:   │ │ blendMode:   │ │   │
│            │  │ │  0xAB12..   │ │  [Beam▼]     │ │  [Additive▼] │ │   │
│            │  │ │ scale:       │ │ trailLength: │ │ zWrite: [✗]  │ │   │
│            │  │ │  1.0,1.0,1.0│ │   12         │ │ cullMode:    │ │   │
│            │  │ │ rotation:    │ │ particleHash:│ │  [None▼]     │ │   │
│            │  │ │  [Velocity▼] │ │  0xCD34..   │ │ drawOrder:   │ │   │
│            │  │ │              │ │ color: ■████ │ │   100        │ │   │
│            │  │ └──────────────┘ └──────────────┘ └──────────────┘ │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ #000 │ Type: Beam │ Trail: 12f │ Blend: Additive │ Linked: Bullet #023 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **3D Projectile Preview**: Real-time R3F preview showing:
   - Body shape (sphere, cylinder, custom mesh placeholder)
   - Trail effect simulation
   - Particle system approximation
   - Multiple viewing modes (wireframe, solid, effects)

2. **Color Picker with Presets**: Common EXVS beam colors (green beam, red beam, yellow physical)

3. **Linked Bullet Preview**: Click to see this depiction applied to the actual bullet trajectory

4. **Effect Library**: Searchable catalog of known effect hashes with visual previews

---

## Editor 8: HitGroupIdDef Editor

### Purpose
Define collision interaction groups: which attacks can hit which targets, shield interactions, piercing rules.

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ HitGroup ID Definition Editor                [Save] [Export] [Matrix]    │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── INTERACTION MATRIX ──────────────────────────────┐   │
│ GROUP      │  │                                                     │   │
│ LIST       │  │        Target Groups →                              │   │
│            │  │        A    B    C    D    E    F    G              │   │
│ ┌────────┐ │  │   A  │ ��  │ ✓  │ ✗  │ ✓  │ ✗  │ ✓  │ ✗  │       │   │
│ │▸ Grp A │ │  │   B  │ ✓  │ ✗  │ ✓  │ ✓  │ ✓  │ ✗  │ ✓  │       │   │
│ │  Grp B │ │  │   C  │ ✗  │ ✓  │ ✗  │ ✗  │ ✓  │ ✓  │ ✗  │       │   │
│ │  Grp C │ │  │  Src D  │ ✓  │ ✓  │ ✗  │ ✗  │ ✗  │ ✓  │ ✓  │       │   │
│ │  Grp D │ │  │   ↓  │    │    │    │    │    │    │    │       │   │
│ │  ...   │ │  │   E  │ ✗  │ ✓  │ ✓  │ ✗  │ ✓  │ ✗  │ ✓  │       │   │
│ └────────┘ │  │                                                     │   │
│            │  │  Legend: ✓=Hit  ✗=Pass  ◐=Conditional               │   │
│ [Add Group]│  │                                                     │   │
│ [Remove]   │  └─────────────────────────────────────────────────────┘   │
│            │                                                            │
│            │  ┌─── GROUP DETAIL ────────────────────────────────────┐   │
│            │  │                                                     │   │
│            │  │ Group A: "Player Projectile"                        │   │
│            │  │ ┌────────────────────────────────────────────────┐  │   │
│            │  │ │ Hits:    [B: Enemy Body] [D: Enemy Proj]       │  │   │
│            │  │ │ Blocked: [C: Shield] [E: Barrier]             │  │   │
│            │  │ │ Ignores: [F: Ally Body] [G: Terrain]          │  │   │
│            │  │ └────────────────────────────────────────────────┘  │   │
│            │  │                                                     │   │
│            │  │ Members: Bullet #001-#045, #100-#120                │   │
│            │  │ Priority: 5 (lower wins clash)                      │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ 8 groups defined │ 64 interactions │ 12 conditional rules               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Interaction Matrix**: NxN grid showing hit/pass/conditional between all groups
   - Click cell to toggle or set conditional
   - Color-coded (green=hit, red=blocked, yellow=conditional)

2. **Group Membership View**: Which bullet/weapon entries belong to each group

3. **Conflict Detector**: Highlights impossible or contradictory configurations

4. **Scenario Simulator**: "If Player fires Type A at Enemy with Shield Group C → result?"

---

## Editor 9: InteractionId Editor

### Purpose
Map interaction IDs to event chains: what happens when specific interactions occur (hit reactions, counter triggers, special conditions).

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Interaction ID Editor                        [Save] [Export] [Graph]     │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │  ┌─── EVENT CHAIN VISUALIZER ──────────────────────────┐   │
│ ID LIST    │  │                                                     │   │
│            │  │   ┌──────┐     ┌──────┐     ┌──────┐               │   │
│ ┌────────┐ │  │   │Input │────▶│Check │────▶│React │               │   │
│ │▸ ID 00 │ │  │   │Event │     │State │     │Event │               │   │
│ │  ID 01 │ │  │   └──────┘     └──┬───┘     └──┬───┘               │   │
│ │  ID 02 │ │  │                   │            │                    │   │
│ │  ID 03 │ │  │              ┌────▼────┐  ┌───▼────┐               │   │
│ │  ...   │ │  │              │CondTrue │  │Trigger │               │   │
│ └────────┘ │  │              │→ Path A │  │Effects │               │   │
│            │  │              └────┬────┘  └───┬────┘               │   │
│ Search:    │  │                   │           │                    │   │
│ [event/id] │  │              ┌────▼────┐  ┌───▼────┐               │   │
│            │  │              │SubEvent │  │Spawn   │               │   │
│ Type:      │  │              │B + C    │  │Child   │               │   │
│ [All ▼]    │  │              └─────────┘  └────────┘               │   │
│            │  │                                                     │   │
│            │  └─────────────────────────────────────────────────────┘   │
│            │                                                            │
│            │  ┌─── INTERACTION DEFINITION ──────────────────────────┐   │
│            │  │                                                     │   │
│            │  │ ID: 0x0012   Type: [HitReaction▼]                   │   │
│            │  │                                                     │   │
│            │  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │   │
│            │  │ │ Trigger Cond │ │ Event Output │ │ Modifiers    │ │   │
│            │  │ │              │ │              │ │              │ │   │
│            │  │ │ srcGroup:    │ │ reaction:    │ │ priority: 5  │ │   │
│            │  │ │  [PlayerAtk] │ │  [Stagger▼]  │ │ duration: 30f│ │   │
│            │  │ │ tgtState:    │ │ subEvents:   │ │ canCancel:   │ │   │
│            │  │ │  [Any▼]      │ │  [SFX, VFX]  │ │  [After 15f] │ │   │
│            │  │ │ minDamage:   │ │ chainTo:     │ │ overrides:   │ │   │
│            │  │ │   50         │ │  [ID 0x0015] │ │  [None▼]     │ │   │
│            │  │ └──────────────┘ └──────────────┘ └──────────────┘ │   │
│            │  └─────────────────────────────────────────────────────┘   │
├────────────┴────────────────────────────────────────────────────────────┤
│ 156 interactions │ 12 chains │ Max depth: 4 │ Orphaned: 3 (⚠ warning)  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Event Chain Visualizer**: Node-graph showing event flow
   - Drag to rearrange nodes
   - Shows branching (conditional) and merging paths
   - Highlights the "eventA = eventB + eventC + realtime_calc" decomposition

2. **Chain Builder**: Visual node editor for creating event sequences
   - Drag from output to input to connect
   - Type-safe connections (only compatible event types)

3. **Orphan Detector**: Flags interaction IDs not referenced by any other param

4. **Simulation Mode**: Step through event chain with mock game state

---

## Cross-Editor Features

### 1. Global Cross-Reference System
Every entry shows which other param files reference it:
- BulletParam #023 → referenced by ArmsParam #005 (slot: MainShot)
- HitGroupDef #A → referenced by BulletParam #001-#045

### 2. Unified Search
`Ctrl+K` opens global search across all loaded params:
- By entry ID, field value, hash, or decoded name
- Jump to any editor + entry

### 3. Comparison Mode
Side-by-side diff of two entries (same or different files):
- Highlights value differences
- Shows gameplay impact of differences

### 4. Batch Operations
Select multiple entries → apply formula-based modifications:
- "Set all missile turnRate to current × 0.8"
- "Copy hitGroup from entries #100-#120 to #200-#220"

### 5. Validation Engine
Per-editor rules + cross-file consistency checks:
- "BulletParam references ArmsParam entry that doesn't exist"
- "Speed values exceed engine clamp limits"
- "Circular interaction chain detected"

### 6. Export/Import
- JSON export for version control
- CSV export for spreadsheet analysis
- Clipboard copy of single entries

---

## Implementation Architecture

```
src/page/TestEditor/components/param-editors/
├── shared/
│   ├── EntryListPanel.tsx          — Virtual-scrolled filterable list
│   ├── PropertyGroup.tsx           — Collapsible parameter group
│   ├── PropertyField.tsx           — Type-aware field editor (U32/I32/F32/Hash/Enum)
│   ├── VisualCanvas.tsx            — R3F canvas wrapper with shared controls
│   ├── CrossRefPanel.tsx           — Cross-reference display
│   ├── StatusBar.tsx               — Editor status bar
│   ├── ComparisonView.tsx          — Side-by-side diff
│   ├── ValidationEngine.ts         — Shared validation rules
│   └── paramEditorStore.ts         — Base Zustand store factory
├── bullet-editor/
│   ├── BulletEditorView.tsx        — Main layout
│   ├── BulletTrajectoryCanvas.tsx  — Enhanced 3D trajectory (from existing)
│   ├── BulletPropertyPanel.tsx     — MoveType-aware property groups
│   ├── BulletDpsCalculator.tsx     — DPS output panel
│   ├── bulletEditorStore.ts        — Bullet-specific state
│   └── bulletValidation.ts         — Bullet-specific rules
├── arms-editor/
│   ├── ArmsEditorView.tsx
│   ├── WeaponSlotDiagram.tsx       — SVG unit silhouette with slots
│   ├── AmmoEconomyTimeline.tsx     — Ammo/reload timeline
│   ├── ArmsPropertyPanel.tsx
│   ├── armsEditorStore.ts
│   └── armsValidation.ts
├── speed-editor/
│   ├── SpeedEditorView.tsx
│   ├── MovementRadiusCanvas.tsx    — Top-down movement range
│   ├── SpeedCurveGraph.tsx         — Acceleration curves
│   ├── BoostGaugeSimulator.tsx     — Gauge drain/regen display
│   ├── SpeedPropertyPanel.tsx
│   ├── speedEditorStore.ts
│   └── speedValidation.ts
├── character-editor/
│   ├── CharacterEditorView.tsx
│   ├── StatRadarChart.tsx          — 6-axis radar
│   ├── DurabilityCalculator.tsx    — EHP calculator
│   ├── CharacterPropertyPanel.tsx
│   ├── characterEditorStore.ts
│   └── characterValidation.ts
├── chrsys-editor/
│   ├── ChrSysEditorView.tsx
│   ├── HashCategoryGraph.tsx       — Force-directed category graph
│   ├── HashDecoderDatabase.ts      — Known hash → name mappings
│   ├── ChrSysPropertyPanel.tsx
│   ├── chrsysEditorStore.ts
│   └── chrsysValidation.ts
├── grap-editor/
│   ├── GrapEditorView.tsx
│   ├── GrabRangeVisualizer.tsx     — 3D grab hitbox preview
│   ├── ThrowArcPreview.tsx         — Throw trajectory
│   ├── GrapPropertyPanel.tsx
│   ├── grapEditorStore.ts
│   └── grapValidation.ts
├── depiction-editor/
│   ├── DepictionEditorView.tsx
│   ├── ProjectilePreview3D.tsx     — 3D projectile with effects
│   ├── DepictionPropertyPanel.tsx
│   ├── depictionEditorStore.ts
│   └── depictionValidation.ts
├── hitgroup-editor/
│   ├── HitGroupEditorView.tsx
│   ├── InteractionMatrix.tsx       — NxN collision matrix
│   ├── GroupMembershipView.tsx
│   ├── HitGroupPropertyPanel.tsx
│   ├── hitgroupEditorStore.ts
│   └── hitgroupValidation.ts
└── interaction-editor/
    ├── InteractionEditorView.tsx
    ├── EventChainVisualizer.tsx    — Node graph
    ├── ChainBuilder.tsx            — Visual node editor
    ├── InteractionPropertyPanel.tsx
    ├── interactionEditorStore.ts
    └── interactionValidation.ts
```

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 3D Engine | React Three Fiber (existing) | Already in project, proven with bullet preview |
| 2D Graphs | SVG + D3-lite (custom) | Keep bundle small, graphs are simple |
| State | Zustand per-editor store | Matches existing pattern, lightweight |
| Undo/Redo | Zustand temporal middleware | Proven pattern, works with immer |
| Validation | Zod schemas + custom rules | Already in project |
| Node Graph | Custom SVG (interaction editor only) | No heavy dependency for one feature |
| Virtual Scroll | tanstack-virtual | Better than react-window for dynamic heights |

---

## IDA Pro Integration Notes

During implementation, use IDA Pro MCP to verify:
1. **Bullet processing**: Decompile functions near `StandardHomingMoveSet` RTTI refs to extract exact turn rate formula
2. **Speed calculation**: Find functions referencing `maxSpeed` string at 0x141550db0 for exact acceleration curves
3. **Damage formula**: Trace `DamageInfo` struct usage for exact modifier calculations
4. **Hash dispatch**: Map qword_1421155D0+2904 accessor patterns to confirm ChrSysParam layout
5. **Grab range**: Find grab-state functions to confirm 3D distance check formula

Each editor's simulation code must be validated against decompiled game logic, not approximations.
