# speedparam complete semantic ledger

> **SUPERSEDED as a source of names — 2026-07-25.**
>
> The names in the tables below are **pre-audit historical claims**. Many of them
> were inherited from the label list in `docs/command_mapping.md` and were
> recorded here at grade A on the strength of an MSC *function number*, which
> locates a read but does not prove a meaning. A mechanical audit over 1827
> decompiled MSC files contradicted 46 of the 64 readable fields.
>
> The authoritative name for a hash is the canonical key in
> `src-tauri/src/format/speedparam.rs`. The authoritative evidence state is
> `docs/param-evidence-registry.tsv`. The arithmetic is in
> `docs/speedparam-msc-consumer-evidence.md` and `docs/param-research/`.
>
> Do not quote a name from this file as current. Run
> `python tools/check_param_name_evidence.py` after touching any of these files.

Date: 2026-07-14  
Scope: all 74 descriptors in the OB 304-byte `speedparam` row  
Status: **historical** — pre-audit claim record, retained for provenance only

## Evidence model

The binary ABI is the field hash, kind, descriptor offset, and selected row.
English names in `src-tauri/src/format/speedparam.rs` are editor metadata and
must not be treated as format truth.

Grades used below:

- **A**: the movement action is routed and the field's arithmetic role is
  explicit in MSC.
- **B**: the action/subsystem is known, but the exact native meaning of a
  `sys_46` mode or an edge case is still unresolved.
- **C**: a consumer exists, but this sample does not establish a safe semantic
  replacement.
- **U**: the Gyan common MSC sample does not read the field.
- **S**: structural string-field identity is confirmed by binary parsing and
  round-trip tests.

`A` does not automatically mean the physical unit is known. For example, a
field can be proven to be a convergence term without proving whether one unit
equals one frame, one percent, or an engine-specific fixed-point step.

## Complete descriptor ledger

| Hash | Offset | Pre-audit Rust key | Evidence-based working role | Grade / consumer |
|---|---:|---|---|---|
| `0x06D1922D` | `0x000` | `walk_speed_forward` | unresolved parameter passed to `sys_46(4,4,...)` in `func_448` | C |
| `0x086B475D` | `0x004` | `walk_speed_base` | step-turn middle speed threshold | A / `func_424` |
| `0x0B6480D5` | `0x008` | `walk_speed_backward` | not read by Gyan common MSC | U |
| `0x0B9EBECE` | `0x00C` | `boost_gauge_capacity` | auxiliary movement speed seed; used as conditional BD vertical speed and free-flight quick-move speed | B / `func_440`, `func_471` |
| `0x0CF37AD7` | `0x010` | `boost_recovery_delay_frame` | alternate free-flight speed delta; `initial + delta = terminal` in Bertigo/G-Arcane | A / Bertigo `func_1072..1074`, G-Arcane `func_849..851` |
| `0x0D5BB2EF` | `0x014` | `boost_recovery_speed` | not read by Gyan common MSC | U |
| `0x0E682BA8` | `0x018` | `ground_run_speed` | air-step terminal/minimum linear speed | A / `func_423..424` |
| `0x11FFDDB4` | `0x01C` | `boost_dash_initial_speed` | boost-ascent vertical speed seed; also increment in one entry path | A / `func_407..409` |
| `0x17A9D82D` | `0x020` | `step_distance` | sustained-ascent horizontal speed delta | A / `func_409` |
| `0x18895A55` | `0x024` | `jump_initial_velocity` | transform-flight roll/bank neutral-input retention | A / `func_457` |
| `0x29AA8A04` | `0x028` | `gravity_modifier` | not read by Gyan common MSC | U |
| `0x2C76D0A7` | `0x02C` | `movement_class` | not read by Gyan common MSC | U |
| `0x2D28CC4B` | `0x030` | `air_dash_startup_frame` | transform-flight roll/bank convergence gain | A / `func_457` |
| `0x2DF7AF95` | `0x034` | `step_startup_frame` | boost-dash loop timer/gate | A / `func_439`, `func_446` |
| `0x2EAE942B` | `0x038` | `boost_dash_sustained_speed` | not read by Gyan common MSC | U |
| `0x32FD1EDC` | `0x03C` | `dash_cancel_type` | boost-dash yaw convergence amount | A / `func_440`, `func_447` |
| `0x37D1D056` | `0x040` | `fall_gravity` | air-step per-update speed delta | A / `func_423..424` |
| `0x3BF9E21E` | `0x044` | `max_ground_speed` | ground-boost/start movement-engine parameter | B / `func_403` |
| `0x4031CB84` | `0x048` | `boost_dash_startup_frame` | ground-step secondary/maximum timer | A / `func_423..424` |
| `0x41DABEC5` | `0x04C` | `boost_dash_recovery_frame` | ground-step terminal/minimum linear speed | A / `func_423..424` |
| `0x459455EA` | `0x050` | `landing_recovery_frame` | transform-flight forward terminal/cap speed | A / `func_452..453` |
| `0x4D4B65EA` | `0x054` | `air_brake_speed` | transform-flight roll/bank target magnitude and cap | A / `func_457` |
| `0x4D601E55` | `0x058` | `step_speed` | step-turn adjustment at high movement speed | A / `func_424` |
| `0x4F705BAD` | `0x05C` | `step_recovery_frame` | air-step primary/hold timer | A / `func_423..424` |
| `0x5481CCF4` | `0x060` | `boost_dash_distance` | boost-dash terminal/minimum linear speed | A / `func_437..447` |
| `0x56C51E87` | `0x064` | `air_dash_end_speed` | not read by Gyan common MSC | U |
| `0x58313EF7` | `0x068` | `step_type` | ground-walk per-update speed delta | A / `func_394..395` |
| `0x5E8CAF43` | `0x06C` | `air_dash_duration_frame` | transform-flight forward speed seed | A / `func_450`, `func_452` |
| `0x5EF705B7` | `0x070` | `boost_dash_type` | sustained-ascent yaw convergence amount | A / `func_409` |
| `0x607C25BC` | `0x074` | `air_speed_base` | boost-ascent vertical terminal/cap speed; also exported to shared runtime state | A / `func_40`, `func_407..409` |
| `0x6C640897` | `0x078` | `fall_speed` | boost-dash per-update speed delta | A / `func_437..447` |
| `0x6F6F1BF6` | `0x07C` | `guard_move_speed` | transform-flight yaw response scale | A / `func_455..456` |
| `0x7242066A` | `0x080` | `air_dash_distance` | free-flight directional terminal/minimum speed | B / `func_467..470` |
| `0x737D64F4` | `0x084` | `air_speed_max` | air-step secondary/maximum timer | A / `func_423..424` |
| `0x77749DD2` | `0x088` | `speed_decay_base` | alternate BD-start motion retention/blend factor | B / `func_445` |
| `0x7BF44A41` | `0x08C` | `air_steer_limit` | alternate free-flight initial speed; converges through `0x0CF37AD7` toward `0x95FA2B6D` | A / Bertigo `func_1072..1074`, G-Arcane `func_849..851` |
| `0x7C2572A1` | `0x090` | `rotation_speed` | base term in ground-walk entry turn-convergence time | A / `func_392..393` |
| `0x7C3CF4DD` | `0x094` | `gauge_recovery_rate` | ground-step primary/hold timer | A / `func_423..424` |
| `0x7CD3A712` | `0x098` | `boost_consumption_base` | alternate BD-start movement-engine parameter | B / `func_444` |
| `0x7D79F6FA` | `0x09C` | `boost_dash_max_speed` | high-speed threshold for step turn adjustment | A / `func_424` |
| `0x7E5878A3` | `0x0A0` | `turning_speed` | ground-walk loop initial linear speed | A / `func_394..395` |
| `0x8173DA19` | `0x0A4` | `jump_type` | not read by Gyan common MSC | U |
| `0x84043A2D` | `0x0A8` | `fall_type` | boost-dash entry direction-convergence timer | A / `func_437..445` |
| `0x8D0A9843` | `0x0AC` | `aerial_correction` | ground-step per-update speed delta | A / `func_423..424` |
| `0x8EDC8D6E` | `0x0B0` | `air_efficiency` | walk-stop motion retention/blend factor | A / `func_401..402` |
| `0x9297EF74` | `0x0B4` | `air_gravity` | free-flight quick-move speed delta | B / `func_471` |
| `0x95FA2B6D` | `0x0B8` | `air_dash_max_distance` | free-flight directional speed seed | B / `func_469` |
| `0x97BE8DFC` | `0x0BC` | `step_cancel_frame` | angle-scaled term in ground-walk entry turn-convergence time | A / `func_392..393` |
| `0x9A378388` | `0x0C0` | `guard_recovery_frame` | unresolved duration/scale passed to `sys_46(0xF,4,...)` in `func_448` | C |
| `0x9EAA4E96` | `0x0C4` | `vertical_move_speed` | ground-walk entry horizontal speed seed | A / `func_392..393` |
| `0x9FD06227` | `0x0C8` | `boost_startup_frame` | transform-flight pitch-to-pose scale passed to `func_104` | A / `func_454`, `func_462` |
| `0xA49287B9` | `0x0CC` | `boost_dash_duration_frame` | boost-dash initial linear speed | A / `func_437..447` |
| `0xA55D6C5E` | `0x0D0` | `dash_end_speed` | air-boost sustained motion Y-axis blend/retention factor | B / `func_407` |
| `0xA7CBBC07` | `0x0D4` | `fixed_step_distance` | not read by Gyan common MSC | U |
| `0xB20B67C9` | `0x0D8` | `air_boost_efficiency` | walk-stop movement-engine parameter | B / `func_401` |
| `0xBC0127E1` | `0x0DC` | `guard_speed_rate` | air-boost entry motion Y-axis scale | B / `func_406` |
| `0xC6157381` | `0x0E0` | `air_dash_speed` | air-step initial linear speed | A / `func_423..424` |
| `0xC6BBC347` | `0x0E4` | `fall_speed_rate` | angle-scaled steering-duration term during boost ascent | A / `func_409` |
| `0xCD5DF17C` | `0x0E8` | `air_dash_type` | sustained-ascent horizontal speed seed | A / `func_409` |
| `0xCF452D59` | `0x0EC` | `guard_step_type` | ground-walk loop yaw convergence amount | A / `func_395` |
| `0xD68023A4` | `0x0F0` | `dash_range` | residual horizontal air-drift speed cap | A / `func_411`, `func_413` |
| `0xDD7720EB` | `0x0F4` | `speed_decay_rate` | ground-boost/start motion retention/blend factor | B / `func_403..404` |
| `0xDE1EF15A` | `0x0F8` | `boost_consumption_type` | residual horizontal air-drift speed delta | A / `func_411`, `func_413` |
| `0xE2FD1BFB` | `0x0FC` | `air_deceleration` | free-flight directional speed delta | B / `func_467..470` |
| `0xE590DFE2` | `0x100` | `boost_dash_count` | free-flight no-direction vertical speed | B / `func_468` |
| `0xE6213731` | `0x104` | `action_label` | absolute offset to obfuscated action-label string | S |
| `0xEC580BCC` | `0x10C` | `turn_rate` | step-turn adjustment at middle movement speed | A / `func_424` |
| `0xF3B9AD85` | `0x110` | `air_steer_speed` | transform-flight pitch convergence gain | A / `func_460` |
| `0xF3C4CAE9` | `0x114` | `resource_label` | absolute offset to obfuscated resource-label string | S |
| `0xF44C9D4E` | `0x11C` | `boost_efficiency_air` | sustained-ascent horizontal terminal/cap speed | A / `func_409` |
| `0xF559DCF1` | `0x120` | `boost_extension_rate` | ground-step initial linear speed | A / `func_423..424` |
| `0xF8B9B46E` | `0x124` | `boost_cap_rate` | transform-flight pitch neutral-input retention | A / `func_460` |
| `0xFEC6069F` | `0x128` | `boost_dash_distance_max` | ground-walk terminal/cap linear speed | A / `func_394..395` |
| `0xFF7A9C8B` | `0x12C` | `gravity_air_modifier` | transform-flight forward speed delta/acceleration | A / `func_452..453` |

The two four-byte holes at row offsets `0x108` and `0x118` are real layout
facts associated with the two kind-7 fields. A builder must preserve the file's
descriptor offsets rather than deriving offsets from `index * 4`.

## Transform-unit cross-check

The real OB Hyaku Shiki file supplies a positive/negative control pair:

| Row | Action label | Transform status | Ten transform-control fields |
|---|---|---|---|
| `0xC2B19D12` | `SKL_MOVE` | normal state; transform actions enabled | all ten non-zero |
| `0xC67DA7B2` | `SKL_MOVE_RESURRECTION` | revival state; transform actions disabled in MSC | all ten zero |

The normal row values are `330, -5, 280, 30, 30, 200, 93, 95, 24, 35` for
`5E8C, FF7A, 4594, 6F6F, 4D4B, 2D28, 1889, F8B9, F3B9, 9FD0` respectively.
Gyan has zero for the same ten fields in both rows. This correlation supports
the subsystem grouping; the arithmetic in `func_450..460` establishes each
field's individual role.

## Migration status

The grade-A migration is implemented. Canonical keys are emitted on output,
every pre-audit camelCase key remains accepted on input, and unresolved B/C/U
fields retain provisional names. The complete mapping and compatibility
contract are in `docs/param-field-name-migration.md`.

The schema generator also now advances eight bytes for kind-7 row fields,
matching both verified holes. Real parsed files always remain driven by their
descriptor offsets.

The cross-unit pass additionally migrated `0x7BF44A41` to
`alternateFreeFlightSpeedInitial` and `0x0CF37AD7` to
`alternateFreeFlightSpeedDelta`. The rejected `airSteerLimit` and
`boostRecoveryDelayFrame` keys remain input-only compatibility aliases.

## Alternate free-flight cross-check

Bertigo and G-Arcane independently implement the same explicit curve:

```text
speed = 0x7BF44A41
speed = speed + 0x0CF37AD7
speed = min(speed, 0x95FA2B6D)
```

Three read-only real OB rows (`DIJEH0`, `PHARCT`, and `DABALD`) contain the
same values: initial `30`, delta `320`, terminal `350`. Their one-step closure
supports the arithmetic roles without assigning an unproven physical unit.
Gedlav and GP01FB also consume the two hashes in special free-flight handlers,
but their unit-specific branches do not justify a narrower universal name.

## Evidence sources

- Gyan common movement MSC:
  `E:\XB\mod\040msc\001gundam_005gyan00_001\2.c`
- Hyaku Shiki original movement MSC:
  `E:\XB\解包\com\file\040msc\0x43BB8719\2.c`
- Gyan and Hyaku Shiki original `speedparam.bin` files under
  `E:\XB\解包\com\file\041cpm\`
- Action routing: `docs/msc-research/func1044-slot-callback-atlas.md`
- Detailed formulas: `docs/speedparam-msc-consumer-audit.md`
