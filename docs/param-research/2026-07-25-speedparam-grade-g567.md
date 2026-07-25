# speedparam field-hash grading — group G567

Date: 2026-07-25
Table: MSC id `0x60006` = `speedparam.bin`
Assigned hashes: `5481ccf4`, `58313ef7`, `5e8caf43`, `5ef705b7`, `607c25bc`,
`6c640897`, `6f6f1bf6`, `7242066a`, `737d64f4`, `77749dd2`, `7bf44a41`,
`7c2572a1`, `7c3cf4dd`, `7cd3a712`, `7d79f6fa`, `7e5878a3`

## Method

Every prior name in `docs/speedparam-semantic-ledger.md` was treated as a
hypothesis carrying no evidentiary weight, because those names came from the
label list in `docs/command_mapping.md` and not from a proven consumer. Primary
input was the per-hash evidence dump in
`tmp/param-evidence/full/fields/t60006_<hash>.txt`, mechanically extracted from
the ~609-unit / 1827-file MSC corpus under `E:\XB\mod\040msc`; for each hash the
arithmetic role was first taken from the CALL and USE lines alone. Where the
extraction window (±40 lines) cut the consumer chain, the cited `2.c` was then
read read-only to recover the surrounding accumulator, timer and emission
structure; those observations are marked `[src]` with their own line citations
and every one of them was cross-checked against the machine-extracted line
numbers before use. Nothing outside `docs/param-research/` was modified and no
disassembler was used. The clone-collapse rule applies throughout: a call shape
replicated across hundreds of unit scripts is **one** observation, and each
hash's `duplicate_clone_sites` figure is stated below. MSC arithmetic alone caps
any of these at grade B; proposed keys describe role only and carry no action or
gameplay attribution.

Three shorthands are used. `S(h)` means `sys_0(0x60006, global142, h)`.
**Timer convention:** `global162`–`global165` are countdown registers seeded as
`param * 0x64`, decremented by `func_274()` each update, and gated on
`<= 0`; `func_274()` is therefore the elapsed time in hundredths of a frame, so
a value written into that register is a duration in frames.
**Emission convention:** `sys_46(0x1, 0x1|0x2, yaw, pitch, magnitude)` publishes
a movement vector — argument 3 is a heading and argument 4 an elevation, both in
hundredths of a degree (`0` level, `0x2328` = +90.00°, `0xFFFFDCD8` = −90.00°),
and argument 5 is the magnitude. `sys_46(0, delta)` applies a rotation, and
`func_102(target, amount, mode)` is the convergence helper (`amount` is an
angular step when mode is `0x1`, and the **remaining time** when mode is `0`).

## Verdict table

| hash | prior key | prior grade | arithmetic shape (literal) | role class | verdict | proposed key | citation |
|---|---|---|---|---|---|---|---|
| `0x5481CCF4` | `boost_dash_distance` | A (demoted to open 2026-07-22) | `global509 = S(0x5481ccf4); if (global23 != 0) global509 += func_436(); if (sys_0(0xc000b)) global509 += func_422();` then per update `sys_46(0x1, 0x2, global265, 0, global507); global507 = global507 + global508; if (global507 < global509) global507 = global509;` `[src]` | clamp bound (lower) | REJECT | `moveMagnitudeFloor` | `001gundam_001gundam_001 2.c:10267 func_437`; `[src] 2.c:10310-10315 func_438` |
| `0x58313EF7` | `step_type` | A (demoted to open 2026-07-22) | `global508 = S(0x58313ef7);` then `global507 = global507 + global508; if (global508 >= 0) { if (global507 > global509) global507 = global509; } else if (global507 < global509) global507 = global509;` with `global509 = S(0xfec6069f)` `[src]` | summand | REJECT | `signClampedMoveMagnitudeDelta` | `001gundam_001gundam_001 2.c:8665 func_395`; `[src] 2.c:8700-8711 func_395` |
| `0x5E8CAF43` | `air_dash_duration_frame` | A (demoted to open 2026-07-22) | `global507 = S(0x5e8caf43); global508 = S(0xff7a9c8b); global509 = S(0x459455ea);` then per update `global507 = global507 + global508 * func_274() / 0x64;` sign-selected clamp against `global509`, then `sys_46(0x1, 0x1, 0, global167, global507);` `[src]` — variant `global248 = S(0x5e8caf43) - S(0xff7a9c8b) * 0x1e; sys_46(0x1, 0x1, 0, 0, global248); global248 += global249;` | counter initialiser (magnitude accumulator seed) | REJECT | `timeIntegratedMoveMagnitudeInitial` | `001gundam_001gundam_001 2.c:10822 func_452`; `[src] 2.c:10883-10895 func_453`; `002zgundm_003mesala_001 2.c:27578 func_977`; `014gndm00_017kyrios_001 2.c:29758 func_1075` |
| `0x5EF705B7` | `boost_dash_type` | A (demoted to open 2026-07-22) | `var2 = S(0x5ef705b7); if ((global24 & 0x3) != 0) var2 = var2 * 0x32 / 0x64; var1 = func_102(global265, var2, 0x1); sys_46(0, var1);` | summand (angular step amount, applied through `func_102` → `sys_46(0, …)`) | REJECT | `headingStepAmountPhase2` | `001gundam_001gundam_001 2.c:9295 func_409`; `[src] 2.c:9296-9301 func_409` |
| `0x607C25BC` | `air_speed_base` | A (demoted to open 2026-07-22) | `global512 = S(0x607c25bc);` then per update `sys_46(0x1, 0x1, 0, 0xffffdcd8, global510); global510 += global511; if (global510 > global512) global510 = global512;` — also `if (global510 > S(0x607c25bc)) global510 = S(0x607c25bc);` and `var6 = S(0x607c25bc); sys_1(0xe0001, 0x3, var6);` | clamp bound (upper) | REJECT | `verticalMoveMagnitudeCeiling` | `001gundam_001gundam_001 2.c:9132 func_407`; `2.c:9194 func_408`; `[src] 2.c:9214-9219 func_409`; `2.c:2557 func_40` |
| `0x6C640897` | `fall_speed` | A (demoted to open 2026-07-22) | `global508 = S(0x6c640897);` then `sys_46(0x1, 0x2, global265, 0, global507); global507 = global507 + global508; if (global507 < global509) global507 = global509;` with `global509 = S(0x5481ccf4)` `[src]` | summand | REJECT | `moveMagnitudeFloorApproachDelta` | `001gundam_001gundam_001 2.c:10363 func_440`; `[src] 2.c:10310-10315 func_438` |
| `0x6F6F1BF6` | `guard_move_speed` | A (demoted to open 2026-07-22) | `var1 = func_102(global265, var0, 0x1); var1 = var1 * S(0x6f6f1bf6) / 0x64; sys_46(0, var1); global265 -= var1;` | multiplier | REJECT | `headingStepScalePercent` | `001gundam_001gundam_001 2.c:10972 func_455`; `2.c:11016 func_456`; `[src] 2.c:10970-10974 func_455` |
| `0x7242066A` | `air_dash_distance` | B | `global507 = 0; global508 = S(0xe2fd1bfb); global509 = S(0x7242066a);` then per update `if (global507 < global509) { global507 = S(0x95fa2b6d); } global507 = global507 + global508; if (global507 < global509) global507 = global509;` and `sys_46(0x1, 0x2, global265 - var2, 0, global507);` `[src]` | clamp bound (lower, also the re-seed threshold) | REJECT | `moveMagnitudeFloorAndReseedThreshold` | `001gundam_001gundam_001 2.c:11363 func_467`; `[src] 2.c:11458-11471 func_469`; `[src] 2.c:11402 func_468` |
| `0x737D64F4` | `air_speed_max` | A (demoted to open 2026-07-22) | `global163 = S(0x737d64f4) * 0x64;` (branch `(global24 & 0x1000000) != 0`; else branch writes `S(0x4031cb84) * 0x64`) then `if ((global24 & 0x200000) != 0) global163 = global163 * 0x64 / 0x96;` then per update `global163 -= func_274();` with exit gate `global163 <= 0` and progress divisor `var8 = (sys_47(0x1, sys_4B(0x1)) - 0xa28) * 0x64 / global163;` `[src]` | counter initialiser (countdown timer, frames) | REJECT | `secondaryPhaseDurationFrames` | `001gundam_001gundam_001 2.c:9820 func_423`; `[src] 2.c:10034 func_424`; `[src] 2.c:10025 func_424`; `[src] 2.c:10048 func_424` |
| `0x77749DD2` | `speed_decay_base` | B | `func_300((0x64 - S(0x77749dd2)) * (0x64 - func_274()) / 0x64 + S(0x77749dd2));` — value is `S(…)` at a full frame and `0x64` at zero elapsed time | summand (base endpoint of a per-frame percentage blend toward `0x64`) | OPEN | — | `001gundam_001gundam_001 2.c:10549 func_445` |
| `0x7BF44A41` | `air_steer_limit` (ledger-migrated `alternateFreeFlightSpeedInitial`) | A (one of the two hashes still at A) | `if (global507 < global509) { global507 = S(0x7bf44a41); } global507 = global507 + global508; if (global507 < global509) global507 = global509;` — `global508`/`global509` are opaque in the evidence file; `[src]` shows `global508 = S(0xcf37ad7); global509 = S(0x95fa2b6d);` — plus `sys_46(0x1, 0x1, 0, 0x2328, var1)` and `global245 > S(0x7bf44a41) * 0x64` | counter initialiser (re-seed of a floored magnitude ramp); competing roles: `sys_46` argument, comparison threshold | OPEN | — | `007gundmx_006bertig_001 2.c:31070 func_1074`; `[src] 2.c:30956-30957 func_1072`; `042grecon_004garcan_001 2.c:24988 func_851`; `005vgundm_013gedlav_001 2.c:27842 func_994`; `013gndmsm_001gp01fb_001 2.c:28075 func_986` |
| `0x7C2572A1` | `rotation_speed` | A (demoted to open 2026-07-22) | `global162 = (global266 * S(0x97be8dfc) / 0x4650 + S(0x7c2572a1)) * 0x64;` then per update `global162 -= func_274(); var1 = func_102(global265, global162, 0); sys_46(0, var1);` with expiry `if (global162 <= 0) func_65();` `[src]` | summand (base term of a countdown duration, frames) | REJECT | `headingConvergenceBaseDurationFrames` | `001gundam_001gundam_001 2.c:8577 func_392`; `[src] 2.c:8615-8617 func_393`; `[src] 2.c:8628-8631 func_393` |
| `0x7C3CF4DD` | `gauge_recovery_rate` | A (demoted to open 2026-07-22) | `global162 = S(0x7c3cf4dd) * 0x64;` (else branch of `(global24 & 0x1000000) != 0`; the set branch writes `S(0x4f705bad) * 0x64`) then `if ((global24 & 0x200000) != 0) global162 = global162 * 0x64 / 0x96;` then per update `global162 -= func_274();` with `if (global162 <= 0) { … func_65(); }` `[src]` | counter initialiser (countdown timer, frames) | REJECT | `primaryPhaseDurationFrames` | `001gundam_001gundam_001 2.c:9824 func_423`; `[src] 2.c:10013-10032 func_424` |
| `0x7CD3A712` | `boost_consumption_base` | B | `sys_46(0x4, 0x4, S(0x7cd3a712));` — the same call slot elsewhere receives the literal `0x64` | `sys_46` argument | OPEN | — (unresolved mode `(0x4, 0x4)`) | `001gundam_001gundam_001 2.c:10515 func_444`; `[src] 2.c:9183 func_408` (literal `0x64`) |
| `0x7D79F6FA` | `boost_dash_max_speed` | A (demoted to open 2026-07-22) | `var2 = sys_0(0x40003, 0x1); if (var2 > S(0x7d79f6fa) * 0x64) var3 = S(0x4d601e55) * 0x64; else if (var2 > S(0x86b475d) * 0x64) …; else if (var2 > (S(0x86b475d) - 0xa) * 0x64) var3 = 0x186 + 0x118 * var0 / S(0x86b475d); …` then `global265 -= var3` / `global265 += var3` `[src]` | comparison threshold | OPEN | — | `001gundam_001gundam_001 2.c:9945 func_424`; `[src] 2.c:9944-9980 func_424` |
| `0x7E5878A3` | `turning_speed` | A (demoted to open 2026-07-22) | `global507 = S(0x7e5878a3); global508 = S(0x58313ef7); global509 = S(0xfec6069f);` then per update `var0 = S(0xcf452d59); var1 = func_102(global265, var0, 0x1); sys_46(0, var1); global265 -= var1; global507 = global507 + global508;` sign-selected clamp, then `sys_46(0x1, 0x1, global181, 0, global507);` `[src]` | counter initialiser (magnitude accumulator seed) | REJECT | `signClampedMoveMagnitudeInitial` | `001gundam_001gundam_001 2.c:8650 func_394`; `[src] 2.c:8692-8720 func_395` |

**Key collision note.** `moveMagnitudeFloor` (`0x5481CCF4`) and
`moveMagnitudeFloorAndReseedThreshold` (`0x7242066A`) are floors of *different*
handlers, and `0x0E682BA8`, `0x41DABEC5`, `0x95FA2B6D` occupy equivalent slots in
yet others; `moveMagnitudeFloorApproachDelta` (`0x6C640897`) is adjacent in
meaning to group G01's proposed `flooredMoveMagnitudeDelta` (`0x0CF37AD7`). Final
key selection must dedupe across groups before any rename lands in
`src-tauri/src/format/speedparam.rs`.

## Rejections

**`0x5481CCF4` — `boost_dash_distance` → `moveMagnitudeFloor`.** The field is
loaded into the third register of a `(seed, delta, floor)` triple
(`global507 = S(0xA49287B9)`, `global508 = S(0x6C640897)`,
`global509 = S(0x5481CCF4)`) and is the lower clamp applied to the magnitude that
`sys_46(0x1, 0x2, global265, 0, global507)` publishes on the same tick, so it is
dimensionally the emitted magnitude, not a travelled distance; a distance would
be an integrated position or a range compared against a limit. It also receives
the same runtime bonus adders as the seed (`func_436()`, `func_422()` against
`func_435()`, `func_421()`), which is the pattern used for the other magnitude
bounds in the file. Evidence is one shape family with 4805 clone sites collapsed
across 609 units, i.e. effectively one independent observation, but the
contradiction is intrinsic to that shape.

**`0x58313EF7` — `step_type` → `signClampedMoveMagnitudeDelta`.** A `_type` enum
must appear in `==` or switch tests; this field is added to the magnitude
accumulator every update and its **sign** is tested to decide whether
`S(0xFEC6069F)` acts as a ceiling or a floor, which is arithmetic use of the
value, not enumeration. The register it advances is the one published as the
magnitude argument of `sys_46(0x1, 0x1, global181, 0, global507)`. Two arithmetic
shapes (load-only, and accumulate-then-sign-clamp), 1797 clone sites collapsed;
the accumulate-and-sign-clamp form recurs in unrelated units (`001gundam`,
`003zzgndm`, `007gundmx`, `014gndm00`).

**`0x5E8CAF43` — `air_dash_duration_frame` → `timeIntegratedMoveMagnitudeInitial`.**
The field seeds the magnitude register that is then advanced by
`S(0xFF7A9C8B) * func_274() / 0x64`, clamped against `S(0x459455EA)` in the
direction chosen by the delta's sign, and emitted as argument 5 of
`sys_46(0x1, 0x1, 0, global167, global507)`; the timers of the very same handler
are the separate `global162`–`global165` registers seeded as `param * 0x64`, so a
duration would not be written here. The Mesala and Kyrios variant makes the
dimension explicit: `S(0x5E8CAF43) - S(0xFF7A9C8B) * 0x1E` subtracts thirty
updates' worth of delta from the field, so the field shares dimension with
`delta × frames` and the only frame count in the expression is the literal
`0x1E`. Those two units are unrelated and are not clones of each other.

**`0x5EF705B7` — `boost_dash_type` → `headingStepAmountPhase2`.** The field is
halved when `(global24 & 0x3) != 0` and then passed as the `amount` argument of
`func_102(global265, var2, 0x1)`, whose result is applied as a rotation through
`sys_46(0, var1)` — arithmetic scaling plus an angular step, never an `==` test,
so a `_type` enum is contradicted. The same slot in sibling loops is filled by
`S(0xCF452D59)` (`func_395`) and `S(0x32FD1EDC)` (`func_440`), both with the
identical conditional halving, which fixes the role. One shape, 571 clone sites
collapsed across 609 units; note that the evidence dump drops the enclosing
`if ((global24 & 0x3) != 0)` guard and makes the halving look unconditional.

**`0x607C25BC` — `air_speed_base` → `verticalMoveMagnitudeCeiling`.** The field is
the upper clamp of the magnitude published by
`sys_46(0x1, 0x1, 0, 0xFFFFDCD8, global510)`, i.e. a vertical movement vector,
and it appears both as the register `global512` in the loop and inline as
`if (global510 > S(0x607C25BC)) global510 = S(0x607C25BC);`. The base of that same
ramp is a different hash — `global510 = global511 = S(0x11FFDDB4)` — so "base" is
occupied and contradicted; only the "ceiling" reading fits. The value is
additionally republished raw through `sys_1(0xE0001, 0x3, …)`, which is a second
consumer but says nothing about direction or units. Four call shapes per unit
(export, inline comparison, inline assignment, loop register), 2246 clone sites
collapsed.

**`0x6C640897` — `fall_speed` → `moveMagnitudeFloorApproachDelta`.** The field is
the per-update delta of the magnitude register, added after the emission and then
floored at `S(0x5481CCF4)`; a speed would be the magnitude itself, not its
increment. The direction argument of that emission is `pitch = 0`
(`sys_46(0x1, 0x2, global265, 0, global507)`), i.e. level movement, and the same
script contains the positive control for a vertical vector —
`sys_46(0x1, 0x1, 0, 0xFFFFDCD8, global510)` in `func_409` — so a "fall" reading
is contradicted, not merely unsupported. One shape family, 4658 clone sites
collapsed.

**`0x6F6F1BF6` — `guard_move_speed` → `headingStepScalePercent`.** The only shape
is `var1 = var1 * S(0x6F6F1BF6) / 0x64` applied to the output of
`func_102(global265, var0, 0x1)`, i.e. a dimensionless percentage that scales an
angular step before `sys_46(0, var1)` applies it and `global265` is updated. The
field never enters a magnitude slot, is never added to a velocity and is never
compared with a distance, so per the calibration rule a speed name is rejected.
One shape, 1163 clone sites collapsed across 608 units.

**`0x7242066A` — `air_dash_distance` → `moveMagnitudeFloorAndReseedThreshold`.**
The evidence file contains 610 sites and **no** USE lines at all — the value is
only ever stored — so the role comes from the cited source: the field is loaded
into `global509` as the floor of the magnitude ramp and doubles as the re-seed
threshold (`if (global507 < global509) global507 = S(0x95FA2B6D);`), with the
result emitted as argument 5 of `sys_46(0x1, 0x2, global265 - var2, 0, global507)`.
That is a magnitude bound, not a distance. This is also the corpus-standard
variant of the Bertigo/G-Arcane handler discussed under `0x7BF44A41`, where the
same three slots are filled by `0x0CF37AD7`, `0x95FA2B6D` and `0x7BF44A41`.

**`0x737D64F4` — `air_speed_max` → `secondaryPhaseDurationFrames`.** The field is
written as `param * 0x64` into `global163`, which the loop decrements by
`func_274()` every update, tests as `global163 <= 0` in the exit condition, and
uses as the divisor of a `0..0x64` progress percentage
(`(sys_47(0x1, sys_4B(0x1)) - 0xa28) * 0x64 / global163`). That is a countdown
duration in frames; a maximum speed would be a clamp bound on a magnitude
register, and this hash never touches one. Its branch counterpart for the same
register is `S(0x4031CB84)`, selected by `(global24 & 0x1000000)`. One shape, 564
clone sites collapsed.

**`0x7C2572A1` — `rotation_speed` → `headingConvergenceBaseDurationFrames`.** The
sum `(global266 * S(0x97BE8DFC) / 0x4650 + S(0x7C2572A1)) * 0x64` is written into
`global162`, and `global162` is then decremented by `func_274()` each update,
passed to `func_102(global265, global162, 0)` as the **remaining time**, and
triggers `func_65()` at `<= 0`. The sum is therefore a duration in frames, this
field is its input-independent base term in frames, and the per-update rotation
*rate* in the same script is a different hash (`S(0xCF452D59)`, `S(0x32FD1EDC)`,
`S(0x5EF705B7)`), so a `_speed` name is contradicted. `0x97BE8DFC` is the
companion coefficient in frames per `0x4650` (180.00°) of heading error. One
shape, 564 clone sites collapsed.

**Pairing note (`0x7C2572A1` ↔ `0x97BE8DFC`).** The pairing **undermines** the
ledger name `rotation_speed` rather than supporting it, for three reasons. First,
it adds no independent observation: both hashes occur only in that one expression
(609 sites, 564 collapsed clones, one arithmetic shape), so the partner's REJECT
and this hash's grading rest on the same single line — the pairing cannot
corroborate anything. Second, within the pair this field is the
**input-independent** term while the heading-error-scaled term is the partner, so
of the two it is the partner, not this field, that carries the per-angle
behaviour a "rotation speed" name would imply. Third, and decisively, the
destination register is a countdown timer, which makes the sum a duration and
this field a base **time**, so the ledger's own working role for the sum
("turn-convergence *time*") and its name for the base term ("rotation *speed*")
cannot both be right. One correction to the calibration text follows from the
same lines: the sum is not "a rate", so the partner `0x97BE8DFC` is best described
as *frames added per 180.00° of heading error* rather than as a gain on a rate.
That does not reinstate `step_cancel_frame` — the partner is a per-angle
coefficient rather than a plain frame count, and nothing ties either hash to a
step cancel — but the stated reason for that REJECT should be amended.

**`0x7C3CF4DD` — `gauge_recovery_rate` → `primaryPhaseDurationFrames`.** The field
is written as `param * 0x64` into `global162` in the `else` branch of
`(global24 & 0x1000000)` (the set branch uses `S(0x4F705BAD)`), and the loop
decrements it by `func_274()` and calls `func_65()` when it reaches zero — a
countdown duration in frames. No gauge is read, written or compared anywhere in
the hash's 608 sites, and the register it seeds is the same one that receives the
heading-error-derived duration in `func_392`, which places the field in the
movement-timer path rather than a resource path. One shape, 564 clone sites
collapsed.

**`0x7E5878A3` — `turning_speed` → `signClampedMoveMagnitudeInitial`.** The field
is the seed of the magnitude register (`global507`) of a `(seed, delta, bound)`
triple whose delta is `S(0x58313EF7)`, and the register is published as argument 5
of `sys_46(0x1, 0x1, global181, 0, global507)`. Turning in that same loop is
driven by a different hash — `var0 = S(0xCF452D59); var1 = func_102(global265,
var0, 0x1); sys_46(0, var1);` — so the script itself supplies the positive control
that separates the two roles and contradicts a turn-rate name. The evidence file
alone shows only stores (1237 clone sites collapsed, no USE lines), so the role
rests on the `[src]` read plus the `0x58313EF7` file, which shares the register
and the adjacent line numbers.

## Open

**`0x77749DD2`** (prior `speed_decay_base`, prior B). Settled role: the base
endpoint of a per-frame percentage blend, `func_300(field + (0x64 - field) *
(0x64 - func_274()) / 0x64)`, which equals `field` at a full frame and `0x64` at
zero elapsed time. What the arithmetic cannot decide is *what* is being scaled:
the handler that calls it (`func_445`) emits no movement magnitude at all — it
only converges the heading and runs the `S(0x84043A2D)` timer — and sibling calls
pass literals in the `0x5C..0x64` range (`func_300(0x8 * (0x64 - func_274()) /
0x64 + 0x5c)`, `2.c:10083 func_426`) into the same setter, alongside `func_301`
and `func_302` taking similar percentages. So "retention percentage" is proven and
"speed" is not. One shape, 1171 clone sites collapsed. Discriminating evidence
needed: the identity of the native setter behind `func_300` (versus `func_301` /
`func_302`), or a unit where the same hash feeds a magnitude slot.

**`0x7BF44A41`** (prior `air_steer_limit`, ledger-migrated
`alternateFreeFlightSpeedInitial`, prior A — the grade is **not** sustained). The
claimed relation `initial + delta = terminal` is **not visible** in the evidence
file: the consumer lines contain only `global508` and `global509`, whose
assignments lie outside the extraction window, so on the evidence file alone the
hash is simply a value re-loaded into a register that is then advanced by an
opaque term and lower-clamped by another. Three further problems keep it open
even after the `[src]` read confirmed `global508 = S(0x0CF37AD7)` and
`global509 = S(0x95FA2B6D)` (`007gundmx_006bertig_001 2.c:30956-30957 func_1072`).
First, the composition is a **floor** (`if (x < bound) x = bound`), not the `min`
the ledger records, and it is a per-update re-seed rather than a convergence: the
sequence only re-enters `S(0x7BF44A41)` on updates where the register has fallen
below the bound. Second, the equality `30 + 320 = 350` satisfies a floor and a
cap identically, so the value cross-check cannot discriminate the two readings —
and none of the three labels cited for it corresponds to a consumer of this hash:
`DIJEH0` matches `002zgundm_018dijeh0_001`, and neither it nor `PHARCT` /
`DABALD` appears in the hash's four-unit consumer set (Gedlav, Bertigo, GP01FB,
G-Arcane), so the value relation was measured on rows this handler never reads.
Third, the hash has only five sites, zero clone
collapse, and **three** different roles among them: re-seed
(Bertigo `2.c:31070 func_1074`, G-Arcane `2.c:24988 func_851`), `sys_46(0x1, 0x1,
0, 0x2328, var1)` magnitude argument (Gedlav `2.c:27842 func_994`), and a ×`0x64`
comparison threshold inside a compound guard (GP01FB `2.c:28075 func_986` and
`2.c:28279 func_989`). Note that the pre-audit key `air_steer_limit` is
positively unsupported: in the Bertigo expression the *limit* slot is
`0x95FA2B6D`, not this hash. Discriminating evidence needed: the sign and value of
`0x0CF37AD7` in the four consumer units' own rows (a positive delta with only a
floor would make the magnitude grow without bound, which would falsify the
"terminal" reading outright), plus a native read of `sys_46` mode `(0x1, 0x2)`
argument 5.

**`0x7CD3A712`** (prior `boost_consumption_base`, prior B). Every one of the 609
sites is the single shape `sys_46(0x4, 0x4, field)` — 571 clone sites collapsed,
one independent observation — and the field never enters arithmetic anywhere in
the corpus. The only extra structure is that other call sites pass the literal
`0x64` into the same slot (`2.c:9183 func_408`, `2.c:10072 func_425`,
`2.c:10435 func_441`), which suggests a percentage whose neutral value is 100.
Unresolved `sys_46` mode: **`(0x4, 0x4)`, single-argument form** — the same
unresolved mode as `0x06D1922D` (group G01, also OPEN). Discriminating evidence
needed: the native handler for mode `0x4` sub-mode `0x4`, or a unit that performs
arithmetic on this hash before the call.

**`0x7D79F6FA`** (prior `boost_dash_max_speed`, prior A). Settled role: the top
tier of a three-tier threshold ladder tested against the runtime query
`sys_0(0x40003, 0x1)`, selecting the per-update heading delta `var3` that is then
added to or subtracted from `global265`; the middle tier is `S(0x86B475D)` and the
bottom tier is `S(0x86B475D) - 0xa`. The ladder's dimension is that of a movement
magnitude, because the third branch divides the current magnitude by the middle
tier (`0x186 + 0x118 * var0 / S(0x86B475D)`, with `var0 = global507`), so a speed
threshold is *compatible* — but the ladder input is unidentified, the hash never
clamps or seeds a magnitude anywhere in its 609 sites (571 clone sites collapsed,
one shape), and "the unit's maximum speed" and "an arbitrary tier boundary above
which turning is retuned" both fit. This mirrors group G01's OPEN verdict on the
middle tier `0x86B475D`. Discriminating evidence needed: the identity of
`sys_0(0x40003, 0x1)`, or a per-unit comparison of this field against measured
top speed, or any consumer that applies it as a clamp.
