# speedparam field-hash grading — group G234

Date: 2026-07-25
Table: MSC id `0x60006` = `speedparam.bin`
Assigned hashes: `2d28cc4b`, `2df7af95`, `32fd1edc`, `37d1d056`, `3bf9e21e`,
`4031cb84`, `41dabec5`, `459455ea`, `4d4b65ea`, `4d601e55`, `4f705bad`

## Method

Every prior name in `docs/speedparam-semantic-ledger.md` was treated as a
hypothesis with no evidentiary weight, since those names came from a label list
rather than from proven consumers. Grading input was the per-hash evidence dump
in `tmp/param-evidence/full/fields/t60006_<hash>.txt`, extracted from the
~609-unit / 1827-file MSC corpus under `E:\XB\mod\040msc`; each shape was then
re-read read-only in the cited `2.c` so the surrounding accumulator, clamp,
timer and emission structure could be seen. Nothing outside
`docs/param-research/` was written and no disassembler was used. Shorthands:
`S(h)` means `sys_0(0x60006, global142, h)`; `func_274()` is the per-update time
step in hundredths of a frame (every timer register in this corpus is seeded as
`param * 0x64` and decremented by `func_274()`); `func_102(delta, time, mode)`
slices a heading delta over a remaining time, and `sys_46(0x1, sub, yaw, pitch,
magnitude)` is the movement emission whose slots 3/4 are angles in hundredths of
a degree. The clone-collapse rule was applied throughout: one call shape
replicated across hundreds of unit scripts is one independent observation, and
each hash's `duplicate_clone_sites` count is stated below. The adjudication
standard used: MSC arithmetic can decide a name's *dimensional* claim (frame
count vs magnitude vs ratio vs angle vs enum) and which component a value acts
on, so a contradicted dimension is a REJECT and a corroborated dimension is a
CONFIRM; the action and phase words inside a name (`step`, `boost_dash`,
`landing`, `air`) are attributions that arithmetic cannot decide in either
direction, so they are never used to reject and never treated as proven. Every
verdict here is therefore capped at grade B.

## Verdict table

| hash | prior key | prior grade | arithmetic shape (literal) | role class | verdict | proposed key | citation |
|---|---|---|---|---|---|---|---|
| `0x2D28CC4B` | `air_dash_startup_frame` | A | `var1 = -(S(0x4d4b65ea) * 0x64) - global166;` (mirror branch: `var1 = S(0x4d4b65ea) * 0x64 - global166;`) then `var1 = var1 * S(0x2d28cc4b) / (S(0x4d4b65ea) * 0x64); global166 += var1 * func_274() / 0x64;` | multiplier (proportional approach gain) | REJECT | `poseAngleApproachGain` | `001gundam_001gundam_001 2.c:11031 func_457` |
| `0x2DF7AF95` | `step_startup_frame` | A | `global162 = S(0x2df7af95) * 0x64;` then per update `if (global162 > 0) { global162 -= func_274(); if (global162 <= 0) { global162 = 0; global147 = 0x1; } }` | counter initialiser (frame timer seed) | CONFIRM | — (frame role upheld; `step` / `startup` unverified) | `001gundam_001gundam_001 2.c:10340 func_439`; `001gundam_001gundam_001 2.c:10421 func_440` |
| `0x32FD1EDC` | `dash_cancel_type` | A | `var1 = S(0x32fd1edc); if (var1 <= sys_0(0x6000e, 0x53e21b83)) var1 += sys_0(0x6000e, 0xeb24e527); if ((global24 & 0x3) != 0) var1 = var1 * 0x32 / 0x64; var2 = func_102(global265, var1, 0x1); sys_46(0, var2);` — second shape `global969 = S(0x32fd1edc) * 0x2;` | divisor (time argument of the heading-slicing helper) | REJECT | `headingConvergenceTimeArg` | `001gundam_001gundam_001 2.c:10375 func_440`; `007gundmx_001gndmdx_001_9dfbf226 2.c:28157 func_963` |
| `0x37D1D056` | `fall_gravity` | A | `if ((global24 & 0x1000000) != 0) global508 = S(0x37d1d056); else global508 = S(0x8d0a9843);` then per update `sys_46(0x1, 0x2, global181, 0, var0); global507 = global507 + global508; if (global507 < global509) global507 = global509;` | summand (per-update delta of the emitted magnitude) | REJECT | `moveMagnitudeDeltaBranchBitSet` | `001gundam_001gundam_001 2.c:9798 func_423`; `001gundam_001gundam_001 2.c:10002 func_424` |
| `0x3BF9E21E` | `max_ground_speed` | B | `sys_46(0x4, 0x4, S(0x3bf9e21e));` — the field is the sole argument; the same slot elsewhere receives the literals `0x50` and `0x64` | `sys_46` argument | OPEN | — (unresolved mode `(0x4, 0x4)`) | `001gundam_001gundam_001 2.c:8936 func_403` |
| `0x4031CB84` | `boost_dash_startup_frame` | A | `global163 = S(0x4031cb84) * 0x64;` … `if ((global24 & 0x200000) != 0) global163 = global163 * 0x64 / 0x96;` then per update `global163 -= func_274();` with the gates `global163 <= 0` and `var8 = (sys_47(0x1, sys_4B(0x1)) - 0xa28) * 0x64 / global163;` | counter initialiser (frame timer seed) | CONFIRM | — (frame role upheld; `boost_dash` / `startup` unverified) | `001gundam_001gundam_001 2.c:9825 func_423`; `001gundam_001gundam_001 2.c:10034 func_424` |
| `0x41DABEC5` | `boost_dash_recovery_frame` | A | `if ((global24 & 0x1000000) != 0) global509 = S(0xe682ba8); else global509 = S(0x41dabec5);` then `global509 += func_418(); global509 += func_420();` and per update `global507 = global507 + global508; if (global507 < global509) global507 = global509;` | clamp bound (lower) | REJECT | `moveMagnitudeFloorBranchBitClear` | `001gundam_001gundam_001 2.c:9805 func_423`; `001gundam_001gundam_001 2.c:10004 func_424` |
| `0x459455EA` | `landing_recovery_frame` | A | `global509 = S(0x459455ea);` then `global507 = global507 + global508 * func_274() / 0x64; if (global508 >= 0) { if (global507 > global509) global507 = global509; } else if (global507 < global509) global507 = global509; sys_46(0x1, 0x1, 0, global167, global507);` — also `sys_46(0x1, 0x2, 0, 0, S(0x459455ea))` and `sys_46(0x1, 0x1, 0, 0, S(0x459455ea))` | clamp bound (terminal, sign-selected by the delta) | REJECT | `moveMagnitudeTerminalLimit` | `001gundam_001gundam_001 2.c:10882 func_453`; `005vgundm_013gedlav_001 2.c:26588 func_928` |
| `0x4D4B65EA` | `air_brake_speed` | A | `if (S(0x4d4b65ea) * 0x64 == 0) global166 = 0;` … `if (global166 > S(0x4d4b65ea) * 0x64) global166 = S(0x4d4b65ea) * 0x64;` (mirror `-` branch) and denominator of `var1 * S(0x2d28cc4b) / (S(0x4d4b65ea) * 0x64)`; `global166` is consumed, inside this handler family, only as `func_104(var1, global166, 0)` / `func_104(var1, 0, global166)` | clamp bound (symmetric `±`; secondary: divisor) | REJECT | `poseAngleLimitMagnitude` | `001gundam_001gundam_001 2.c:11043 func_457`; `001gundam_001gundam_001 2.c:10954 func_454` |
| `0x4D601E55` | `step_speed` | A | `var2 = sys_0(0x40003, 0x1); if (var2 > S(0x7d79f6fa) * 0x64) var3 = S(0x4d601e55) * 0x64;` (sibling tiers `S(0xec580bcc) * 0x64`, `0x186 + 0x118 * var0 / S(0x86b475d)`, `0x3e8`) then `if (global502 & 0x10) global265 = global265 - var3; else if (global502 & 0x20) global265 = global265 + var3;` | summand (per-update heading delta) | REJECT | `headingDeltaTopSpeedTier` | `001gundam_001gundam_001 2.c:9947 func_424` |
| `0x4F705BAD` | `step_recovery_frame` | A | `global162 = S(0x4f705bad) * 0x64;` … `if ((global24 & 0x200000) != 0) global162 = global162 * 0x64 / 0x96;` then per update `if (global162 <= 0) { … if ((global87 & global502) == 0 \|\| global163 <= 0 \|\| var7) func_65(); } else global162 -= func_274();` | counter initialiser (frame timer seed) | CONFIRM | — (frame role upheld; `step` / `recovery` unverified) | `001gundam_001gundam_001 2.c:9819 func_423`; `001gundam_001gundam_001 2.c:10032 func_424` |

## Rejections

**`0x2D28CC4B` — `air_dash_startup_frame` → `poseAngleApproachGain`.** The single
observed shape is a proportional-approach gain: the signed gap between
`global166` and the bound `±(S(0x4D4B65EA) * 0x64)` is multiplied by this field
and divided by that same bound, and the product is integrated by the time step
(`global166 += var1 * func_274() / 0x64`), so at `global166 == 0` the per-frame
increment is exactly this field's value. A frame count is never a multiplier
inside a convergence term, is never divided by another parameter, and here the
field is never seeded into a timer nor decremented nor compared with a running
counter. Evidence is one shape with 1178 of 1216 sites collapsed as clones, so it
is one independent observation, but the contradiction is intrinsic to that shape;
the Hyaku Shiki control value `200` against a bound of `30` is consistent with a
`2.00`-per-frame approach step rather than with two hundred frames.

**`0x32FD1EDC` — `dash_cancel_type` → `headingConvergenceTimeArg`.** The field is
loaded into a plain integer, conditionally increased by a system-table bonus when
it falls at or below `sys_0(0x6000e, 0x53e21b83)`, halved when `global24 & 0x3`
is set, and then passed as the **second** argument of
`func_102(global265, var1, 0x1)` — the slot that elsewhere in the same script
receives the literal `0xf` (`2.c:9983 func_424`) and, in the documented idiom, a
phase timer. It is therefore a numeric time/step argument of the heading-slicing
helper, not an enum: no `==` test and no `switch` on this hash appears in any
observed shape, and the second idiom scales it by two into a movement
overlay bank (`global969 = S(0x32fd1edc) * 0x2`, alongside `S(0x5481CCF4)` and
`S(0x6C640897)` scaled by `0x8c/0x64` and `0xfa/0x64`), which no enum tolerates.
Two idioms (the loop argument and the overlay copy), 1307 of 1371 sites collapsed
as clones. Note
this also refines the ledger's working role, which called it a convergence
*amount*; it is the time term, while the amount is `global265`.

**`0x37D1D056` — `fall_gravity` → `moveMagnitudeDeltaBranchBitSet`.** The field
is written into the per-update delta register `global508` in the
`(global24 & 0x1000000) != 0` branch of the entry (the other branch fills the
same slot from `S(0x8D0A9843)`), and the loop adds `global508` to the magnitude
`global507` once per update, floors it at `global509`, and emits it as
`sys_46(0x1, 0x2, global181, 0, var0)`. The pitch slot of that call is the
literal `0`, whereas the vertical emissions in the same script carry
`0xffffdcd8` (`-9000` = `-90.00°`, e.g. `2.c:10397`), so this delta acts on the
horizontal magnitude only and cannot be a fall or gravity term. The proposed key
records the branch key rather than an action; 546 of 609 sites are collapsed
clones, and the shape is a single idiom.

**`0x41DABEC5` — `boost_dash_recovery_frame` → `moveMagnitudeFloorBranchBitClear`.**
The field is the lower clamp bound of the emitted movement magnitude in the
`(global24 & 0x1000000) == 0` branch (`if (global507 < global509) global507 =
global509;`), and it receives the same external speed bonuses (`func_418()`,
`func_420()`) as its counterpart `S(0x0E682BA8)` in the opposite branch. It is
never seeded into a timer register, never decremented by `func_274()`, and never
compared against a running counter, so the `_frame` reading has no support; the
actual timers of the same handler are seeded separately from `S(0x4F705BAD)` /
`S(0x7C3CF4DD)` and `S(0x737D64F4)` / `S(0x4031CB84)` with the `* 0x64` scale
that this field does not receive. One idiom, 546 of 608 sites collapsed as
clones.

**`0x459455EA` — `landing_recovery_frame` → `moveMagnitudeTerminalLimit`.** The
field is the terminal limit of a linear magnitude ramp: `global507` is advanced
by `global508 * func_274() / 0x64` each update and then clamped to this field
from above when the delta is non-negative and from below when the delta is
negative, before being emitted as
`sys_46(0x1, 0x1, 0, global167, global507)`. The read-only Hyaku Shiki control
row makes the closure explicit — seed `S(0x5E8CAF43) = 330`, delta
`S(0xFF7A9C8B) = -5`, this field `280` — i.e. a ramp down to a floor, not a
duration; the timer of the same handler is the literal `global162 = 0x3e8`
(`2.c:10833 func_452`). Independent unrelated shapes emit the hash directly as
the magnitude argument of `sys_46(0x1, 0x1, 0, 0, …)` and
`sys_46(0x1, 0x2, 0, 0, …)`, once as `field - global773 * 0x5`, and one unit
returns it from a state-keyed magnitude getter, so this rests on several
independent observations (142 shapes, 1106 of 1248 sites collapsed as clones).

**`0x4D4B65EA` — `air_brake_speed` → `poseAngleLimitMagnitude`.** The field
appears three ways in one function: as the symmetric clamp bound
`±(field * 0x64)` of the signed state `global166`, as the divisor that normalises
the approach gain `S(0x2D28CC4B)`, and as a zero test that forces `global166 = 0`
when the field is `0`. Inside this handler family `global166` is consumed only by
the pose call `func_104(var1, global166, 0)` / `func_104(var1, 0, global166)`
(the unrelated `func_423` / `func_424` handler reuses the same register as a lane
index, `global166 * 0x2328`, which is not this field's consumer), and the branch
that drives it is chosen by the residual heading error
(`global265 > 0x44c` / `< 0xfffffbb4`, i.e. `±11.00°`), so the bounded quantity
is an angle and this field is its limit in the same hundredths-of-a-degree scale
(`30 * 0x64 = 30.00°` for the Hyaku Shiki control row). Nothing in any observed
shape decelerates a speed by this value, so "brake speed" has no arithmetic
footing. One idiom, 5126 of 5472 sites collapsed as clones.

**`0x4D601E55` — `step_speed` → `headingDeltaTopSpeedTier`.** The field is the
top tier of a four-way ladder on the runtime query `sys_0(0x40003, 0x1)` that
selects the per-update heading delta `var3`, which is then subtracted from or
added to the heading accumulator `global265` and finally wrapped by
`func_101()`. Its sibling tiers are `S(0xEC580BCC) * 0x64`, the interpolation
`0x186 + 0x118 * var0 / S(0x86B475D)`, and the literals `0x3e8` / `-0x5dc` /
`0xfffffa24`, so the field carries the same unit as those angle constants
(hundredths of a degree per update), not a linear speed: the linear magnitude in
this very block is a different register (`var0 = global507`) and appears only as
the numerator `0x118 * var0` of the interpolated tier. One idiom, 571 of 609
sites collapsed as clones.

## Confirmations

**`0x2DF7AF95`** (prior `step_startup_frame`). The field is seeded as
`param * 0x64` into `global162`, which the paired loop decrements by
`func_274()` and, on reaching zero, clamps to `0` and raises the permission flag
`global147` — the textbook frame-timer idiom, in hundredths of a frame. Two
independent entry functions in the same script seed it (`func_439` at
`2.c:10340`, `func_446` at `2.c:10578`) and both loops implement the decrement
(`func_440` at `2.c:10421`, `func_447` at `2.c:10678`); the same register is
elsewhere seeded with the bare literals `0x258`, `0x4b0` and `0x7d0`
(`2.c:10061 func_425`, `2.c:10432 func_441`, `2.c:10714 func_448`), which fixes
the register's unit without reference to any parameter. 1146 of 1218 sites are
collapsed clones, so the corroboration is structural rather than cross-unit;
`step` and `startup` remain unverified attributions, and the handler that reads
this hash is the same one that seeds the dash-style magnitude accumulator
(`S(0xA49287B9)` / `S(0x6C640897)` / `S(0x5481CCF4)`).

**`0x4031CB84`** (prior `boost_dash_startup_frame`). Seeded as `param * 0x64`
into the secondary timer `global163`, optionally shortened to two thirds
(`* 0x64 / 0x96`) under `global24 & 0x200000`, decremented unconditionally by
`func_274()` every update, tested as `global163 <= 0` in the exit condition and
used as the denominator of the progress ramp
`(sys_47(0x1, sys_4B(0x1)) - 0xa28) * 0x64 / global163` handed to `func_110()`.
Only a duration satisfies all four uses, so the `_frame` dimension is upheld;
what the arithmetic shows more precisely is an upper/hold window rather than a
lead-in, and the `boost_dash` attribution is unverified — the field sits in the
`(global24 & 0x1000000) == 0` branch whose counterpart slot is `S(0x737D64F4)`.
564 of 608 sites are collapsed clones (one idiom).

**`0x4F705BAD`** (prior `step_recovery_frame`). Seeded as `param * 0x64` into the
primary timer `global162` in the `(global24 & 0x1000000) != 0` branch
(counterpart `S(0x7C3CF4DD)`), shortened to two thirds under
`global24 & 0x200000`, and decremented by `func_274()` on every update in which
it is still positive; while it is positive the handler cannot terminate, and only
after it reaches zero can the exit test
`(global87 & global502) == 0 || global163 <= 0 || var7` call `func_65()`. That is
a minimum-duration frame counter, so the `_frame` dimension is upheld; `step` and
`recovery` remain unverified, and the same caveat about the branch key applies.
564 of 609 sites are collapsed clones (one idiom).

## Open

**`0x3BF9E21E`** (prior `max_ground_speed`, prior B). All 1223 sites are the
single shape `sys_46(0x4, 0x4, field)` (1181 collapsed clones, one independent
observation); the hash never enters arithmetic, is never compared, and is never
stored. The only extra structure available is that the same call slot takes the
literal `0x50` in the sibling branch of the very same function
(`001gundam_001gundam_001 2.c:8932 func_403`), the literal `0x64` in another
entry (`2.c:10435 func_441`), and another speedparam hash `S(0xB20B67C9)` in a
neighbouring entry (`2.c:8904 func_401`) — a pattern that suggests a
percentage-like scalar with neutral value `100` rather than a speed in speed
units, but that is an inference, not a proof. Unresolved `sys_46` mode:
**`(0x4, 0x4)`, single-argument form**. Discriminating evidence needed: the
native handler for `sys_46` mode `0x4` sub-mode `0x4` (which engine field it
writes and in what unit), or any unit whose script performs arithmetic on this
hash, or a per-unit value comparison against measured ground speed. The same mode
is also the sole consumer of `0x06D1922D` and is fed by `0xB20B67C9`, so
resolving it would close three fields at once.
