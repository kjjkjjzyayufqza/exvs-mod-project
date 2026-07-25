# speedparam field-hash grading — group GCDEF

Date: 2026-07-25
Table: MSC id `0x60006` = `speedparam.bin`
Assigned hashes: `c6157381`, `c6bbc347`, `cd5df17c`, `cf452d59`, `d68023a4`,
`dd7720eb`, `de1ef15a`, `e2fd1bfb`, `e590dfe2`, `ec580bcc`, `f3b9ad85`,
`f44c9d4e`, `f559dcf1`, `f8b9b46e`, `fec6069f`, `ff7a9c8b`

## Method

Every prior name in `docs/speedparam-semantic-ledger.md` was treated as a
hypothesis carrying no evidentiary weight, because those names were inherited
from a label list rather than from proven consumers. The grading input was the
per-hash evidence dump in `tmp/param-evidence/full/fields/t60006_<hash>.txt`,
built from the ~609-unit / 1827-file MSC corpus under `E:\XB\mod\040msc`; each
dump lists at most 30 of its reported `distinct_call_shapes`, so every primary
shape was re-read read-only in the base unit
`E:\XB\mod\040msc\001gundam_001gundam_001\2.c` to recover the branch structure
the dump flattens (the dump's `USE` lines are later raw lines mentioning the
same symbol, not a data-flow chain, and in several cases they merged mutually
exclusive `if` / `else` arms). Nothing outside `docs/param-research/` was
modified and no disassembler was used. Shorthands: `S(h)` means
`sys_0(0x60006, global142, h)`; `func_274()` is the per-update time step in
hundredths of a frame (timers are seeded as `param * 0x64` and decremented by
`func_274()`); `func_101(x)` normalises an angle and `func_102(target, amount,
mode)` returns a per-update angular step. Angles in this script family are
hundredths of a degree (`0x2328` = 90.00°, `0x4650` = 180.00°, `0xDAC` = 35.00°),
which is what fixes several verdicts below. Movement is emitted as
`sys_46(0x1, 0x1, heading, elevation, magnitude)` or
`sys_46(0x1, 0x2, heading, 0, magnitude)`; argument five is the magnitude slot,
established from sibling call sites where arguments three and four carry known
angle constants. The clone-collapse rule was applied throughout: a call shape
replicated across hundreds of unit scripts is one observation, and each hash's
`duplicate_clone_sites` count is stated in the notes. Proposed keys describe role
only and carry no action attribution; MSC arithmetic alone caps any of them at
grade B.

## Verdict table

| hash | prior key | prior grade | arithmetic shape (literal) | role class | verdict | proposed key | citation |
|---|---|---|---|---|---|---|---|
| `0xC6157381` | `air_dash_speed` | A | `if ((global24 & 0x1000000) != 0) { global507 = S(0xc6157381); global508 = S(0x37d1d056); global509 = S(0xe682ba8); } else { global507 = S(0xf559dcf1); … }` then `global507 += func_417(); global507 += func_419();` and per update `sys_46(0x1, 0x2, global181, 0, global507); global507 += global508; if (global507 < global509) global507 = global509;` | summand (accumulator seed) | OPEN | — | `001gundam_001gundam_001 2.c:9797 func_423`; `001gundam_001gundam_001 2.c:10004 func_424` |
| `0xC6BBC347` | `fall_speed_rate` | A | `global162 = global266 * S(0xc6bbc347) / 0xb4;` then per update `global162 = global162 - func_274(); var1 = func_102(global265, global162, 0); sys_46(0, var1);` and `if (global162 <= 0) global159 = 0x2;` | counter initialiser | REJECT | `turnDurationFramesPer180Deg` | `001gundam_001gundam_001 2.c:9264 func_409`; `003zzgndm_004zak3cm_001 2.c:14056 func_546` |
| `0xCD5DF17C` | `air_dash_type` | A | `if (global158 == 0) { global507 = global507 * 0x5e / 0x64; if (global263 != 0x3039) { global158 = 0x1; global507 = S(0xcd5df17c); } } else { global507 = global507 + S(0x17a9d82d); if (global507 > S(0xf44c9d4e)) global507 = S(0xf44c9d4e); }` then `sys_46(0x1, 0x2, global265, 0, global507);` | summand (accumulator seed) | REJECT | `cappedMoveMagnitudeInitial` | `001gundam_001gundam_001 2.c:9242 func_409`; `007gundmx_001gndmdx_001_9dfbf226 2.c:12482 func_522` |
| `0xCF452D59` | `guard_step_type` | A | `var0 = S(0xcf452d59); if ((global24 & 0x3) != 0) var0 = var0 * 0x32 / 0x64; var1 = func_102(global265, var0, 0x1); sys_46(0, var1); global265 -= var1;` | summand (per-update angular step via `func_102`) | REJECT | `perUpdateTurnStepAmount` | `001gundam_001gundam_001 2.c:8692 func_395`; `022astray_006astrki_001 2.c:14067 func_535` |
| `0xD68023A4` | `dash_range` | A | `if (global263 != 0x3039) { if (global598 != global263) { global598 = global263; global507 = 0; } global507 = global507 + S(0xde1ef15a); if (global507 > S(0xd68023a4)) global507 = S(0xd68023a4); global500 = global265; } else { global507 = global507 * (0x2 * (0x64 - func_274()) / 0x64 + 0x62) / 0x64; }` then `if (global507 > 0) sys_46(0x1, 0x2, global500, 0, global507);` | clamp bound (upper) | REJECT | `inputRampMagnitudeLimit` | `001gundam_001gundam_001 2.c:9349 func_411`; `001gundam_001gundam_001 2.c:9474 func_413` |
| `0xDD7720EB` | `speed_decay_rate` | B | `if (global158 == 0) func_300((0x64 - S(0xdd7720eb)) * (0x64 - func_274()) / 0x64 + S(0xdd7720eb)); else func_300(0x1 * (0x64 - func_274()) / 0x64 + 0x63);` with `void func_300(int arg0) { sys_46(0x3, 0x4, arg0, arg0, arg0); }` | multiplier (per-frame retained fraction) | REJECT | `motionRetentionPercent` | `001gundam_001gundam_001 2.c:8971 func_404`; `001gundam_001gundam_001 2.c:7237 func_300`; `013gndmsm_001gp01fb_001 2.c:28035 func_986` |
| `0xDE1EF15A` | `boost_consumption_type` | A | `global507 = global507 + S(0xde1ef15a); if (global507 > S(0xd68023a4)) global507 = S(0xd68023a4);` then `if (global507 > 0) sys_46(0x1, 0x2, global500, 0, global507);` | summand | REJECT | `inputRampMagnitudeDelta` | `001gundam_001gundam_001 2.c:9346 func_411`; `003zzgndm_013qub2bl_001 2.c:14376 func_550` |
| `0xE2FD1BFB` | `air_deceleration` | B | `global507 = 0; global508 = S(0xe2fd1bfb); global509 = S(0x7242066a);` then per update `if (global507 < global509) global507 = S(0x95fa2b6d); global507 = global507 + global508; if (global507 < global509) global507 = global509;` and `sys_46(0x1, 0x2, global265 - var2, 0, global507);` | summand (per-update delta) | OPEN | — | `001gundam_001gundam_001 2.c:11362 func_467`; `001gundam_001gundam_001 2.c:11468 func_469` |
| `0xE590DFE2` | `boost_dash_count` | B | `var1 = S(0xe590dfe2);` … `sys_46(0x1, 0x1, 0, 0x2328, var1);` — no arithmetic on the value; Gedlav-only second shape `global507 += S(0xe590dfe2); if (global507 < 0) global507 = 0; sys_46(0x1, 0x2, global166, 0, global507);` | `sys_46` argument | OPEN | — (unresolved mode `(0x1, 0x1)`, elevation `0x2328`) | `001gundam_001gundam_001 2.c:11390 func_468`; `005vgundm_013gedlav_001 2.c:28035 func_997` |
| `0xEC580BCC` | `turn_rate` | A | `var2 = sys_0(0x40003, 0x1); if (var2 > S(0x7d79f6fa) * 0x64) var3 = S(0x4d601e55) * 0x64; else if (var2 > S(0x86b475d) * 0x64) var3 = S(0xec580bcc) * 0x64; else if (var2 > (S(0x86b475d) - 0xa) * 0x64) var3 = 0x186 + 0x118 * var0 / S(0x86b475d); else var3 = 0x3e8;` then `if (global502 & 0x10) global265 = global265 - var3; else if (global502 & 0x20) global265 = global265 + var3; global265 = func_101(global265);` | summand (heading offset) | CONFIRM | — | `001gundam_001gundam_001 2.c:9951 func_424`; `043orphan_003gsonre_001 2.c:9827 func_416` |
| `0xF3B9AD85` | `air_steer_speed` | A | `var0 = 0xdac - global167; var0 = var0 * (S(0xf3b9ad85) * 0xa) / 0xdac; global167 += var0 * func_274() / 0x64; if (global167 > 0xdac) global167 = 0xdac;` (mirror arm uses `0xfffff254`) | multiplier (proportional gain) | REJECT | `elevationConvergenceGain` | `001gundam_001gundam_001 2.c:11127 func_460`; `049orphn2_003gnbael_001 2.c:15912 func_593` |
| `0xF44C9D4E` | `boost_efficiency_air` | A | `if (global507 > S(0xf44c9d4e)) global507 = S(0xf44c9d4e);` on the accumulator seeded `global507 = S(0xcd5df17c)` and advanced `global507 = global507 + S(0x17a9d82d)`, then `sys_46(0x1, 0x2, global265, 0, global507);` | clamp bound (upper) | REJECT | `cappedMoveMagnitudeLimit` | `001gundam_001gundam_001 2.c:9248 func_409`; `014gndm00_007rebons_001 2.c:15701 func_563` |
| `0xF559DCF1` | `boost_extension_rate` | A | `else { global507 = S(0xf559dcf1); global508 = S(0x8d0a9843); global509 = S(0x41dabec5); }` then `global507 += func_417(); global507 += func_419();` and per update `sys_46(0x1, 0x2, global181, 0, global507); global507 += global508; if (global507 < global509) global507 = global509;` | summand (accumulator seed) | REJECT | `moveMagnitudeInitialAltBranch` | `001gundam_001gundam_001 2.c:9803 func_423`; `001gundam_001gundam_001 2.c:10004 func_424` |
| `0xF8B9B46E` | `boost_cap_rate` | B | `if (global168 == 0) global167 = global167 * ((0x64 - S(0xf8b9b46e)) * (0x64 - func_274()) / 0x64 + S(0xf8b9b46e)) / 0x64;` where `global167` is bounded to `±0xdac` and emitted as `sys_46(0x1, 0x1, 0, global167, global507)` | multiplier (per-frame retained fraction) | REJECT | `elevationNeutralRetentionPercent` | `001gundam_001gundam_001 2.c:11122 func_460`; `001gundam_001gundam_001 2.c:10895 func_453` |
| `0xFEC6069F` | `boost_dash_distance_max` | A | `global507 = S(0x7e5878a3); global508 = S(0x58313ef7); global509 = S(0xfec6069f);` then `global507 = global507 + global508; if (global508 >= 0) { if (global507 > global509) global507 = global509; } else if (global507 < global509) global507 = global509;` then `sys_46(0x1, 0x1, global181, 0, global507);` | clamp bound (signed terminal) | REJECT | `signedMoveMagnitudeTerminal` | `001gundam_001gundam_001 2.c:8666 func_395`; `001gundam_001gundam_001 2.c:11818 func_476` |
| `0xFF7A9C8B` | `gravity_air_modifier` | A | `global507 = S(0x5e8caf43); global508 = S(0xff7a9c8b); global509 = S(0x459455ea);` then per update `global507 = global507 + global508 * func_274() / 0x64; if (global508 >= 0) { if (global507 > global509) global507 = global509; } else if (global507 < global509) global507 = global509; sys_46(0x1, 0x1, 0, global167, global507);` — second shape `global248 = S(0x5e8caf43) - S(0xff7a9c8b) * 0x1e; … global248 += S(0xff7a9c8b);` | summand (time-scaled per-update delta) | REJECT | `timeScaledMagnitudeDelta` | `001gundam_001gundam_001 2.c:10881 func_453`; `014gndm00_017kyrios_001 2.c:29758 func_1075` |

## Rejections

**`0xC6BBC347` — `fall_speed_rate` → `turnDurationFramesPer180Deg`.** The field
seeds the countdown register `global162`, which is decremented by `func_274()`
on every update and drives the state transition when it reaches `<= 0`; the seed
is `global266 * field / 0xb4`, where `global266` is an angle magnitude in
hundredths of a degree (it is assigned `global265` or `-global265` at
`2.c:8566`, and tested against `0x34bc` = 135.00° at `2.c:8560`). Dividing
centi-degrees by `0xb4` = 180 yields hundredths of a frame directly, so the
field is the frame count for a full 180° turn — the same script uses the literal
form `global162 = (global266 * 0xc / 0x4650 + 0x3) * 0x64` (12 frames per 180°
plus 3 frames) at `2.c:10783` for the identical construct. A fall speed cannot
be a duration that is counted down against the frame clock. One arithmetic
shape, 564 clone sites collapsed, but the timer semantics are intrinsic to that
shape.

**`0xCD5DF17C` — `air_dash_type` → `cappedMoveMagnitudeInitial`.** The field is
written into the movement-magnitude accumulator `global507` when the gate
`global158` opens, after which the accumulator is advanced by `S(0x17A9D82D)`,
capped by `S(0xF44C9D4E)`, decayed by `* 0x5e / 0x64` while the gate is closed,
and emitted every update as argument five of
`sys_46(0x1, 0x2, global265, 0, global507)` with `global265` a `func_101`
normalised heading. It never appears in an `==` test or a switch, which is the
only shape a genuine `_type` enum can take. This is the seed counterpart of the
delta that group G01 re-described as `cappedMoveMagnitudeDelta`; 546 clone sites
collapsed.

**`0xCF452D59` — `guard_step_type` → `perUpdateTurnStepAmount`.** The value is
conditionally halved (`if ((global24 & 0x3) != 0) var0 = var0 * 0x32 / 0x64`,
a condition the flat evidence dump hides) and then passed as the amount argument
of `func_102(global265, var0, 0x1)`, whose result is applied through
`sys_46(0, var1)` and subtracted from the heading `global265`. It is therefore a
per-update angular step magnitude, not an enum: an enum is never scaled by
`50/100` and never feeds an angle helper. Note `0x5EF705B7` fills the same slot
with the same conditional halving in the `func_409` loop (`2.c:9295`), so the
proposed key needs a handler qualifier if both hashes migrate. Secondary shapes
in unit-specific handlers only cache the field into a state global
(`001gundam_002chrgel_001_188a3f18 2.c:24943 func_850`).

**`0xD68023A4` — `dash_range` → `inputRampMagnitudeLimit`.** The clamped
quantity is not a displacement: `global507` is reset to `0` whenever the input
direction `global263` changes, incremented by `S(0xDE1EF15A)` while a direction
is held, decayed by a per-frame factor of `0x62`–`0x64` hundredths when the
direction is released, and emitted on the same tick as argument five of
`sys_46(0x1, 0x2, global500, 0, global507)`. A range would be an accumulated
position compared against a limit, never a per-tick emitted magnitude that
resets on direction change. The dump's apparent "clamp then scale" sequence is
in fact two mutually exclusive `if` / `else` arms. Two shapes in the same script
(`func_411` and `func_413`), 2208 clone sites collapsed.

**`0xDD7720EB` — `speed_decay_rate` → `motionRetentionPercent`.** The blend
evaluates to `0x64` when `func_274()` is `0` and to the field when `func_274()`
is `0x64`, so the field is the fraction *retained* per full frame, and it is
passed to `func_300`, which is `sys_46(0x3, 0x4, arg0, arg0, arg0)` — three
per-axis percentages, with the sibling wrappers `func_301` (`arg0, 0x64, arg0`)
and `func_302` (`0x64, arg0, 0x64`) isolating the horizontal and vertical axes.
The same slot elsewhere takes the literals `0` (full stop at state entry),
`0x5a`, `0x5e`, `0x63` and `0x64`, confirming a `0..100` scale. The prior name
inverts the polarity of the observed quantity — field `0` means an immediate
stop and field `0x64` means no decay at all — which would mislead any editor UI,
and the field never touches a speed field in MSC. Note `0x8EDC8D6E`
(`2.c:8916`) and `0x77749DD2` (`2.c:10549`) occupy the same slot in other
handlers, so a handler qualifier is needed if several migrate. One shape, 1174
clone sites collapsed.

**`0xDE1EF15A` — `boost_consumption_type` → `inputRampMagnitudeDelta`.** The
field is added to the emitted movement magnitude once per update while an input
direction is held, with `S(0xD68023A4)` as the upper clamp; there is no `==`
test, no switch and no gauge arithmetic anywhere in its 1218 sites. A
`_type` enum cannot be an addend of a ramp that is handed to
`sys_46(0x1, 0x2, …)` on the same tick. 1104 clone sites collapsed; the shape
recurs in unrelated units (`001gundam`, `003zzgndm`, `007gundmx`, `014gndm00`,
`015gndmuc`).

**`0xF3B9AD85` — `air_steer_speed` → `elevationConvergenceGain`.** The field is a
dimensionless gain with denominator `0xdac`: the code forms the error
`0xdac - global167` (or `0xfffff254 - global167` in the mirror arm), multiplies
it by `field * 0xa / 0xdac`, scales the result by the frame step
`func_274() / 0x64`, and clamps `global167` at `±0xdac`. `global167` is an angle
in hundredths of a degree — it is bounded at `±35.00°` and consumed as the
elevation argument of `sys_46(0x1, 0x1, 0, global167, global507)` at
`2.c:10895` and as the first argument of `func_104` at `2.c:11340`. A speed is
summed into a magnitude or emitted as one, never used as the proportional gain
of an angular convergence. One shape, 1178 clone sites collapsed.

**`0xF44C9D4E` — `boost_efficiency_air` → `cappedMoveMagnitudeLimit`.** The
field is the right-hand side of `if (global507 > field) global507 = field;` and
is then assigned into the accumulator itself, so it is dimensionally identical
to the movement magnitude that is emitted as
`sys_46(0x1, 0x2, global265, 0, global507)` a few lines later. An efficiency is
a percentage applied to a resource; it cannot be a hard ceiling expressed in the
units of the quantity it bounds. Two shapes in the same script (the test and the
assignment), 1092 clone sites collapsed.

**`0xF559DCF1` — `boost_extension_rate` → `moveMagnitudeInitialAltBranch`.** In
`func_423` the field is the accumulator seed selected when
`(global24 & 0x1000000) == 0`, the complementary branch of `0xC6157381`, and it
receives the same external bonus addends (`func_417()`, `func_419()`) that the
floor register receives through `func_418()` / `func_420()`; `func_424` then
emits the accumulator as the movement magnitude. It multiplies nothing, is never
compared against a resource, and never touches a gauge, so a "rate" that extends
boost has no support. The proposed key is deliberately branch-relative because
the meaning of state bit `global24 & 0x1000000` is still open (see
`0xC6157381`). 546 clone sites collapsed.

**`0xF8B9B46E` — `boost_cap_rate` → `elevationNeutralRetentionPercent`.** The
field is the low endpoint of a per-frame retention blend applied multiplicatively
to `global167`, taken only in the neutral-input arm `global168 == 0`; the other
two arms converge `global167` toward `±0xdac` with gain `S(0xF3B9AD85)`. Since
`global167` is the elevation angle fed to `sys_46(0x1, 0x1, 0, global167, …)`,
the field is a percentage that decays an angle, not a cap on anything: it never
bounds a value and never appears in a comparison. This is the same construct
that group G01 re-described as `neutralInputRetentionPercent` for `0x18895A55`,
which acts on the sibling channel `global166`. The ledger's read-only control
values (Hyaku Shiki `95`, Gyan `0`) sit inside the `0..100` range this reading
requires. One shape, 1171 clone sites collapsed.

**`0xFEC6069F` — `boost_dash_distance_max` → `signedMoveMagnitudeTerminal`.**
The field is loaded into the limit register `global509` beside the seed
`S(0x7E5878A3)` and the delta `S(0x58313EF7)`, and the clamp direction is chosen
by the sign of the delta (`if (global508 >= 0)` upper clamp, else lower clamp),
which only makes sense for a signed terminal value in the units of the
accumulator; that accumulator is emitted as
`sys_46(0x1, 0x1, global181, 0, global507)` on the same tick. A maximum distance
would bound accumulated displacement, not a per-tick emitted magnitude. Two
independent handlers in the base unit show the same role (`func_394`/`func_395`
and `func_476` with its own clamp at `2.c:11862`), plus a state-keyed getter in
Gedlav (`005vgundm_013gedlav_001 2.c:30022 func_1083`) that returns it as a bare
magnitude; 1797 clone sites collapsed.

**`0xFF7A9C8B` — `gravity_air_modifier` → `timeScaledMagnitudeDelta`.** The
field is the per-update delta of the magnitude ramp seeded by `S(0x5E8CAF43)`
and terminated by `S(0x459455EA)`, explicitly scaled by the frame step
(`global507 + field * func_274() / 0x64`) with the clamp direction chosen by
`if (global508 >= 0)`, i.e. the value is signed by design. The independent
Mesala and Kyrios shape `S(0x5E8CAF43) - field * 0x1e` followed by
`global248 += field` pre-rolls the same ramp by 30 frames, which is only
coherent for a per-frame delta of that ramp. Neither reading leaves room for a
gravity term: there is no vertical axis in the expression, the emitted call is
`sys_46(0x1, 0x1, 0, global167, global507)` whose elevation argument comes from
the separate `global167` channel, and the ledger's own read-only control pair
shows the field is `-5` for Hyaku Shiki but `0` for Gyan in both rows, so it is
not populated for units that never enter this handler. "Modifier" is also wrong
in kind, since the field is an addend and not a multiplier.

## Confirmations

**`0xEC580BCC`** (prior `turn_rate`, prior A, CONFIRM at grade B). The field is
scaled by `0x64` and then added to or subtracted from the heading `global265`,
which is re-normalised by `func_101` and forwarded as the direction argument of
the movement call, so the value is a turn magnitude expressed in whole degrees
(the sibling branches of the same ladder use the literals `0x3e8` = 10.00° and
`0xfffffa24` = -15.00°). Two caveats bound the grade: the observed use is a
one-shot angular offset applied when the step direction changes, not a per-frame
rate, and the field is only the middle tier of a three-tier ladder on
`sys_0(0x40003, 0x1)` (upper tier `S(0x4D601E55)`, lower tiers a speed-dependent
formula and the literal `0x3e8`), so `turn_rate` is under-specified rather than
wrong. The evidence rests on one arithmetic shape with 571 clone sites collapsed;
the independent support is cross-field, since the same `global265` is consumed as
the `func_102` target in `0xCF452D59`'s shape and as the `sys_46` direction
argument in `0xF44C9D4E`'s shape.

## Open

**`0xC6157381`** (prior `air_dash_speed`, prior A). The dimension is settled: the
field is the initial value of the movement-magnitude accumulator in the
`(global24 & 0x1000000) != 0` branch of `func_423`, it takes the same external
bonus addends as the floor register, and `func_424` emits the accumulator as
argument five of `sys_46(0x1, 0x2, global181, 0, var0)` — so it is a linear
movement magnitude, consistent with the "speed" half of the prior name. What the
arithmetic cannot decide is the action attribution, because the handler serves
both branches and `0xF559DCF1` fills the same slot when the bit is clear. This is
the same unresolved bit that group G01 recorded for `0x0E682BA8`. Discriminating
evidence needed: the meaning of state bit `global24 & 0x1000000`, which the
`func_167` / `func_168` / `func_169` family sets and clears in roughly a hundred
places in this one script — including `func_167(0x1000000)` in the ascent-style
entry (`2.c:9182`) and `func_168(0x1000000)` inside `func_424` (`2.c:10018`) — so
the identity of that bit family, and of the `sys_0(0x60000)` query that gates the
clear, is what would settle the attribution. One arithmetic shape plus a
state-keyed getter in Gedlav (`005vgundm_013gedlav_001 2.c:30026 func_1083`),
546 clone sites collapsed.

**`0xE2FD1BFB`** (prior `air_deceleration`, prior B). Proven role: `func_467`
loads the field into the delta register `global508` beside the limit register
`S(0x7242066A)`, and `func_469` runs `global507 = global507 + global508` with a
lower clamp against that limit and a re-seed to `S(0x95FA2B6D)` whenever the
accumulator falls below it; the accumulator is emitted as
`sys_46(0x1, 0x2, global265 - var2, 0, global507)`. Because the ramp has a floor
and no ceiling, the construct only terminates if the delta is negative, which is
consistent with the prior name but is an inference from structure rather than an
observation — group G01 already showed that a floor clamp does not by itself
prove a negative delta (`0x0CF37AD7` is `+320` in real rows). Discriminating
evidence needed: the sign of this field in several real `speedparam.bin` rows
(one read of `0xE2FD1BFB` versus `0x95FA2B6D` and `0x7242066A` per unit settles
it), plus the routing evidence that would justify or refute the "air" qualifier
for the `func_467`/`func_468`/`func_469` handler. One entry-load shape, 545 clone
sites collapsed, plus a second Gedlav site (`2.c:27812 func_993`).

**`0xE590DFE2`** (prior `boost_dash_count`, prior B). In the dominant shape the
field enters no arithmetic at all: `func_468` reads it in the no-direction arm
and passes it straight through as argument five of
`sys_46(0x1, 0x1, 0, 0x2328, var1)`. Unresolved `sys_46` mode: **`(0x1, 0x1)`,
with elevation argument `0x2328`** (= 90.00°, the same slot that carries
`0xffffdcd8` = -90.00° and the `±0xdac` pitch channel elsewhere). Argument five
is the magnitude slot in every sibling call, which already leaves the "count"
reading without support, but the field's own quantity cannot be pinned from MSC
alone. The only arithmetic anywhere in its 612 sites is a single Gedlav handler
(`2.c:28035 func_997`) where it is added to an accumulator floored at `0`, i.e.
used as a signed delta; that is one unit and cannot carry a universal name.
Discriminating evidence needed: the native handler for `sys_46` mode `0x1`
sub-mode `0x1` (which engine field argument five writes), or a unit that performs
arithmetic on this hash in the shared library path. 570 clone sites collapsed.
