# speedparam field-hash grading — group G89AB

Date: 2026-07-25
Table: MSC id `0x60006` = `speedparam.bin`
Assigned hashes: `84043a2d`, `8d0a9843`, `8edc8d6e`, `9297ef74`, `95fa2b6d`,
`97be8dfc`, `9a378388`, `9eaa4e96`, `9fd06227`, `a49287b9`, `a55d6c5e`,
`b20b67c9`, `bc0127e1`

## Method

Every prior name in `docs/speedparam-semantic-ledger.md` was treated as an
unweighted hypothesis, because those names were inherited from a label list
(`docs/command_mapping.md`) rather than from proven consumers; the 2026-07-22
audit had already demoted the arithmetic behind them. Grading input was the
per-hash evidence dump in `tmp/param-evidence/full/fields/t60006_<hash>.txt`,
extracted from the 609-unit / 1827-file MSC corpus under `E:\XB\mod\040msc`.
Each role was first read off the CALL and USE lines, then re-checked read-only
against the cited `2.c` source so that the enclosing register triple, timer,
clamp and emission could be seen; no `.c` or `.bin` file was modified, nothing
outside `docs/param-research/` was written, and no disassembler was used.
Shorthand: `S(h)` means `sys_0(0x60006, global142, h)`; `func_274()` is the
per-update time step in hundredths of a frame, so every timer is seeded as
`param * 0x64` and every ease term has the form `(0x64 - func_274()) / 0x64`.
Angle constants are hundredths of a degree (`0x4650` = 180.00, `0x2328` = 90.00,
`0xffffdcd8` = -90.00, `0xdac` = 35.00). Three emission channels recur and are
used throughout as discriminators: `sys_46(0x1, 0x2, yaw, 0, magnitude)` is the
in-plane movement emission (its yaw slot carries `0`, `±0x2328`, `0x4650` from
the four stick directions in `func_471`, and `global166 * 0x2328` in `func_424`),
`sys_46(0x1, 0x1, 0, 0xffffdcd8, magnitude)` is the out-of-plane emission, and
`sys_46(0x3, 0x4, x, y, z)` is a three-component percent channel with `0x64` as
its neutral value, written through the one-line wrappers `func_300` (uniform),
`func_301` (`x`,`z` only) and `func_302` (`y` only) at `2.c:7237..7251`.
The clone-collapse rule was applied: a shape replicated across unit scripts is
one observation, and each hash's `duplicate_clone_sites` count is given in the
notes after the table. Proposed keys describe role only and carry no action or
gameplay attribution; MSC arithmetic alone caps any of them at grade B.

## Verdict table

| hash | prior key | prior grade | arithmetic shape (literal) | role class | verdict | proposed key | citation |
|---|---|---|---|---|---|---|---|
| `0x84043A2D` | `fall_type` | A | `global162 = S(0x84043a2d) * 0x64;` then per update `global162 = global162 - func_274(); … if (global162 <= 0) <leave phase>`; in the dash loop the same value is the budget of `var1 = func_102(global265, global162, 0); sys_46(0, var1); global265 -= var1;` | counter initialiser | REJECT | `movePhaseDurationFrames` | `001gundam_001gundam_001 2.c:10281 func_437`; `001gundam_001gundam_001 2.c:12301 func_487`; `003zzgndm_004zak3cm_001 2.c:17093 func_624` |
| `0x8D0A9843` | `aerial_correction` | A | `if ((global24 & 0x1000000) != 0) { global507 = S(0xc6157381); global508 = S(0x37d1d056); global509 = S(0xe682ba8); } else { global507 = S(0xf559dcf1); global508 = S(0x8d0a9843); global509 = S(0x41dabec5); }` then per update `sys_46(0x1, 0x2, global181, 0, var0); global507 = global507 + global508; if (global507 < global509) global507 = global509;` | summand | REJECT | `branchedMoveMagnitudeDelta` | `001gundam_001gundam_001 2.c:9804 func_423`; `001gundam_001gundam_001 2.c:10002 func_424`; `018ggundm_004spiegl_001 2.c:14515 func_555` |
| `0x8EDC8D6E` | `air_efficiency` | A | `func_300((0x64 - S(0x8edc8d6e)) * (0x64 - func_274()) / 0x64 + S(0x8edc8d6e));` with `void func_300(int arg0) { sys_46(0x3, 0x4, arg0, arg0, arg0); }` — value `0x64` at `func_274() == 0`, `S(0x8edc8d6e)` at `func_274() == 0x64` | summand (ramp end term) | REJECT | `uniformAxisPercentRampEnd` | `001gundam_001gundam_001 2.c:8916 func_402`; `001gundam_001gundam_001 2.c:7237 func_300`; `049orphn2_003gnbael_001 2.c:13701 func_535` |
| `0x9297EF74` | `air_gravity` | B | entry `global507 = S(0xb9ebece);` with `global265` set to `0` / `0x2328` / `0xffffdcd8` / `0x4650` by stick direction, then per update `global507 += S(0x9297ef74); if (global507 < 0) global507 = 0; sys_46(0x1, 0x2, global265, 0, global507);` | summand | REJECT | `decayingMoveMagnitudeDelta` | `001gundam_001gundam_001 2.c:11571 func_471`; `007gundmx_006bertig_001 2.c:31267 func_1076` |
| `0x95FA2B6D` | `air_dash_max_distance` | B | `global265 = func_101(global264 + sys_0(0x40005)); if (global507 < global509) { global507 = S(0x95fa2b6d); sys_4C(0x8, 0x3); } … global507 = global507 + global508; if (global507 < global509) global507 = global509;` | counter initialiser (magnitude re-seed) | REJECT | `flooredMoveMagnitudeReseed` | `001gundam_001gundam_001 2.c:11460 func_469`; `018ggundm_006shinig_001 2.c:16736 func_608` |
| `0x97BE8DFC` | `step_cancel_frame` | A | `global162 = (global266 * S(0x97be8dfc) / 0x4650 + S(0x7c2572a1)) * 0x64;` where `global266` is the pending yaw magnitude (`global266 = ±global265`, tested against `0x34bc`); the same template appears fully literal as `global162 = (global266 * 0xc / 0x4650 + 0x3) * 0x64;` | multiplier | REJECT | `turnTimeFramesPer180Deg` | `001gundam_001gundam_001 2.c:8577 func_392`; `001gundam_001gundam_001 2.c:10783 func_450`; `022astray_006astrki_001 2.c:13952 func_532` |
| `0x9A378388` | `guard_recovery_frame` | C | `sys_46(0xf, 0x4, S(0x9a378388) * 0x64, 0x1);` — sole appearance; the field never enters arithmetic other than the `* 0x64` frame-to-hundredths scaling | `sys_46` argument | OPEN | — (unresolved mode `(0xf, 0x4)`, four-argument form) | `001gundam_001gundam_001 2.c:10724 func_448`; `043orphan_003gsonre_001 2.c:10577 func_440` |
| `0x9EAA4E96` | `vertical_move_speed` | A | `global507 = S(0x9eaa4e96);` (no delta or bound register set in this phase) then per update `global162 -= func_274(); var1 = func_102(global265, global162, 0); sys_46(0, var1); global181 = func_101(global265 - var1); sys_46(0x1, 0x2, global181, 0, global507);` | counter initialiser (magnitude seed, held constant) | REJECT | `turnPhaseMoveMagnitude` | `001gundam_001gundam_001 2.c:8576 func_392`; `001gundam_001gundam_001 2.c:8626 func_393`; `021destny_012stroug_001 2.c:13713 func_528` |
| `0x9FD06227` | `boost_startup_frame` | A | `var1 = S(0x9fd06227) * 0x64 * global167 / 0xdac;` then `func_104(var1, global166, 0)` / `func_104(var1, 0, global166)`, where `func_104` normalises each argument with `func_101` and emits `sys_47(0x10, global20, 0x1, …)`, and `global167` is the pitch-input state clamped to `[0xfffff254, 0xdac]` = ±35.00 degrees | multiplier | REJECT | `poseTiltDegreesAtFullPitchInput` | `001gundam_001gundam_001 2.c:10951 func_454`; `001gundam_001gundam_001 2.c:11129 func_460`; `018ggundm_004spiegl_001 2.c:15653 func_586` |
| `0xA49287B9` | `boost_dash_duration_frame` | A | `global507 = S(0xa49287b9); global508 = S(0x6c640897); global509 = S(0x5481ccf4);` with `global507 += func_435()/func_421()` bonuses, then per update `sys_46(0x1, 0x2, global265, 0, global507); global507 = global507 + global508; if (global507 < global509) global507 = global509;` and on phase change `if (global507 < S(0xa49287b9)) global507 = S(0xa49287b9);` | clamp bound (lower; also the accumulator seed) | REJECT | `flooredMoveMagnitudeInitial` | `001gundam_001gundam_001 2.c:10265 func_437`; `001gundam_001gundam_001 2.c:12326 func_487`; `003zzgndm_004zak3cm_001 2.c:15116 func_576` |
| `0xA55D6C5E` | `dash_end_speed` | B | `func_302((0x64 - S(0xa55d6c5e)) * (0x64 - func_274()) / 0x64 + S(0xa55d6c5e));` with `void func_302(int arg0) { sys_46(0x3, 0x4, 0x64, arg0, 0x64); }`; the sibling branch of the same `if` passes the all-literal blend ending at `0x50` | summand (ramp end term) | REJECT | `verticalAxisPercentRampEnd` | `001gundam_001gundam_001 2.c:9122 func_407`; `001gundam_001gundam_001 2.c:7247 func_302`; `013gndmsm_001gp01fb_001 2.c:28238 func_989` |
| `0xB20B67C9` | `air_boost_efficiency` | B | `sys_46(0x4, 0x4, S(0xb20b67c9));` — sole appearance; the same slot elsewhere receives the literals `0x32`, `0x50`, `0x64` and the hash `S(0x3bf9e21e)` | `sys_46` argument | OPEN | — (unresolved mode `(0x4, 0x4)`, single-argument form) | `001gundam_001gundam_001 2.c:8904 func_401`; `043orphan_003gsonre_001 2.c:8858 func_397` |
| `0xBC0127E1` | `guard_speed_rate` | B | `func_302(S(0xbc0127e1));` → `sys_46(0x3, 0x4, 0x64, S(0xbc0127e1), 0x64)`; the `sys_0(0x80004) > 0` branch of the same `if` passes the neutral literal `func_302(0x64)` | `sys_46` argument (via one-line wrapper) | OPEN | — (unresolved mode `(0x3, 0x4)`, `y` component) | `001gundam_001gundam_001 2.c:9034 func_406`; `001gundam_001gundam_001 2.c:7247 func_302`; `042grecon_005mntero_001 2.c:14502 func_549` |

Clone-collapse notes. Eight of the thirteen hashes rest on **one** call shape:
`0x8D0A9843` (546 clones collapsed), `0x8EDC8D6E` (1171), `0x97BE8DFC` (564),
`0x9A378388` (571), `0x9EAA4E96` (546), `0xA55D6C5E` (1172), `0xB20B67C9` (571),
`0xBC0127E1` (562). `0x9FD06227` has one shape at two sites per unit (1125
collapsed). `0x9297EF74` (545 collapsed) and `0x95FA2B6D` (545) each have one
common shape plus one single-unit variant (Gedlav `func_997` seeds the register
from `0x9297EF74` and takes `0xE590DFE2` as the delta; Bertigo `func_1072` reads
`0x95FA2B6D` with no visible use). Only `0x84043A2D` (1716 collapsed) and
`0xA49287B9` (4464 collapsed) show several genuinely different shapes. Where a
verdict rests on one shape, the contradiction is intrinsic to that shape rather
than to its repetition count.

## Rejections

**`0x84043A2D` — `fall_type` → `movePhaseDurationFrames`.** The field is loaded
once at phase entry as `param * 0x64`, i.e. a frame count converted to the
hundredths-of-a-frame timer convention, then decremented by `func_274()` on every
update until `<= 0` ends the phase; in the dash loop the same countdown is also
the time budget handed to the angle-convergence helper
`func_102(global265, global162, 0)`. A `_type` enum has to appear in an `==` test
or a switch; this hash is never compared for equality anywhere in the corpus, and
it is never an enum-like small-domain selector. Three shape families across
unrelated units (`001gundam`, `003zzgndm`, `005vgundm`, `007gundmx`, `014gndm00`)
show the same seed-decrement-exit structure.

**`0x8D0A9843` — `aerial_correction` → `branchedMoveMagnitudeDelta`.** In the
step-handler entry the field is written into the middle register of the standard
magnitude triple (`global507` initial, `global508` delta, `global509` floor), and
the loop applies exactly `global507 = global507 + global508` followed by the floor
clamp before the next in-plane emission, so its role is the per-update signed
change of the emitted movement magnitude. A "correction" name implies a factor
applied to some other quantity; this field multiplies nothing, scales nothing and
is never read outside the delta slot. The counterpart branch of the same `if` fills
the identical slot from `0x37D1D056`, so the two hashes are alternative deltas
selected by state bit `global24 & 0x1000000`, whose air/ground meaning is itself
still unproven — which means the "aerial" half of the prior name is not merely
unsupported by the arithmetic, it cannot be assigned to either hash from MSC alone.

**`0x8EDC8D6E` — `air_efficiency` → `uniformAxisPercentRampEnd`.** The single
shape is a dimensionless ramp on the percent channel `sys_46(0x3, 0x4, x, y, z)`:
the argument equals `0x64` while `func_274()` is `0` and equals the field once
`func_274()` reaches `0x64`, so the field is the end value of a 100-to-P ramp
applied uniformly to all three components through `func_300`. An efficiency would
divide or scale a resource, and would appear next to a gauge query; this hash
never touches `sys_0` resource reads, never multiplies a speed, and lives in a
channel whose neutral value is demonstrably `100` (the same wrappers are called
with the literals `0x5a`, `0x62`, `0x63`, `0x64`). Nothing in the shape supports
"air" either: the identical template with literal arguments appears in ground and
transform handlers alike.

**`0x9297EF74` — `air_gravity` → `decayingMoveMagnitudeDelta`.** The field is the
per-update addend of the magnitude register that `0x0B9EBECE` seeds at entry, and
the register is floored at `0` — a clamp that only has an effect if the addend is
negative, so the field decays a burst to a standstill. The emission is in-plane,
not vertical: its direction argument is set from the four stick directions to `0`,
`0x2328` (+90.00 degrees), `0xffffdcd8` (-90.00 degrees) or `0x4650` (180.00
degrees), and the out-of-plane slot is the literal `0`, whereas the ascent
emissions in the same script use the other sub-mode
(`sys_46(0x1, 0x1, 0, 0xffffdcd8, …)`). A gravity term must act on the
out-of-plane component; this one cannot. Gedlav's special handler swaps the pair
(field as seed, `0xE590DFE2` as delta), which keeps it inside the same magnitude
register rather than any vertical channel.

**`0x95FA2B6D` — `air_dash_max_distance` → `flooredMoveMagnitudeReseed`.** The
guarded shape is `if (global507 < global509) global507 = S(0x95fa2b6d);` followed
by `global507 = global507 + global508; if (global507 < global509) global507 = global509;`
— the field is the value the movement magnitude is re-seeded to whenever it has
decayed below the floor supplied by a different hash, with the direction taken
from `func_101(global264 + sys_0(0x40005))`. A maximum distance would be compared
against an accumulated position or range, and a maximum of any kind would be the
right-hand side of a `>` clamp; this hash is on the assignment side and the bound
is a separate field. The existing ledger cross-check placed the same hash as the
`min()` bound of the Bertigo / G-Arcane alternate curve, where this extract shows
only a bare read (`007gundmx_006bertig_001 2.c:30957 func_1072`), so the
`Reseed` reading is asserted for the 609-unit common shape only.

**`0x97BE8DFC` — `step_cancel_frame` → `turnTimeFramesPer180Deg`** (brief's
calibration case, reproduced from its own evidence file and confirmed at source).
The one shape multiplies the field by the pending yaw magnitude `global266`,
divides by `0x4650` (180.00 degrees) and adds `S(0x7C2572A1)` before the `* 0x64`
timer conversion, so the field is an angle-proportional time term and
`0x7C2572A1` is the base time. The unit is settled by the fully literal twin of
the same template in the transform entry,
`global162 = (global266 * 0xc / 0x4650 + 0x3) * 0x64;` — 12 frames at a 180-degree
turn on top of 3 base frames. A cancel-window frame count would initialise or be
compared against a counter directly; this value is only ever one term inside the
expression that produces such a counter, and it scales with the input angle, so
the prior name is wrong even though the dimension is indeed frames.

**`0x9EAA4E96` — `vertical_move_speed` → `turnPhaseMoveMagnitude`.** The field
seeds `global507` at entry with no delta and no bound register set, and the loop
emits it unchanged on every update through the in-plane channel
`sys_46(0x1, 0x2, global181, 0, global507)`, where `global181` is the residual yaw
after `func_102`/`sys_46(0, var1)` have consumed part of the pending rotation and
the out-of-plane slot is the literal `0`. The walk loop that follows this phase
re-seeds the same register from `0x7E5878A3` and installs the full triple, so this
hash is specifically the constant magnitude of the turning entry phase. Nothing
vertical is involved: the only out-of-plane emissions in this script use the other
sub-mode with a `±90.00`-degree angle, and this hash appears in none of them.

**`0x9FD06227` — `boost_startup_frame` → `poseTiltDegreesAtFullPitchInput`.** The
product `field * 0x64 * global167 / 0xdac` is fed to `func_104`, which normalises
its three arguments as angles (`func_101`) and pushes them as a pose triple, and
`global167` is the pitch-input state that `func_460` converges toward and clamps
at exactly `±0xdac`; at full deflection the expression therefore equals
`field * 0x64` hundredths of a degree, i.e. the field is the tilt amplitude in
whole degrees. No counter, no decrement and no comparison exists anywhere for this
hash, so a `_frame` reading has no support; the read-only control value already
recorded in the ledger (Hyaku Shiki `35`, Gyan `0`) is consistent with a
degrees-of-tilt reading.

**`0xA49287B9` — `boost_dash_duration_frame` → `flooredMoveMagnitudeInitial`.**
The field seeds the magnitude register, receives the same external bonus addends
as the other magnitude terms (`func_435`, `func_421`), and is re-applied as a lower
clamp when the handler advances phase (`if (global507 < field) global507 = field;`),
while the delta `0x6C640897` and the floor `0x5481CCF4` occupy the neighbouring
slots. The duration of that very handler is a *different* hash: the state machine
seeds `global162 = S(0x84043A2D) * 0x64` two lines later and leaves the phase when
that counter reaches zero, which leaves no room for a second duration field. The
prior name is therefore contradicted by the handler's own structure, not merely
unsupported.

**`0xA55D6C5E` — `dash_end_speed` → `verticalAxisPercentRampEnd`.** The one shape
is the same 100-to-P ramp as `0x8EDC8D6E` but routed through `func_302`, which
writes only the `y` component of the `sys_46(0x3, 0x4, …)` percent triple and pins
`x` and `z` to the neutral `0x64`; the sibling branch of the same `if` passes an
all-literal ramp ending at `0x50`, confirming the 0-to-100 domain. Movement speeds
in this script are emitted in engine units through mode `0x1` (values of order
`280`-`330` in the real rows), so a percent-domain ramp endpoint in a per-axis
scale channel is not a speed. What the channel physically drives is still
unresolved, so the proposed key names the slot and the ramp position only.

## Open

**`0x9A378388`** (prior `guard_recovery_frame`, prior C). All 609 sites are the
single shape `sys_46(0xf, 0x4, field * 0x64, 0x1)` — 571 clone sites collapsed,
one independent observation — and the field never enters any other arithmetic in
the corpus. The `* 0x64` scaling is the same frame-to-hundredths conversion used
by every timer in these scripts (`global162 = S(0x84043A2D) * 0x64`,
`global163 = 0x7d0`), which makes a duration dimension likely, but argument
position alone cannot establish that, and nothing in MSC connects the call to a
guard state or to a recovery window. Unresolved `sys_46` mode: **`(0xf, 0x4)`,
four-argument form with trailing `0x1`**. Discriminating evidence needed: the
native handler for mode `0xf` sub-mode `0x4` (which engine field it writes and in
what units), or any unit whose script compares or decrements this hash.

**`0xB20B67C9`** (prior `air_boost_efficiency`, prior B). All 609 sites are the
single shape `sys_46(0x4, 0x4, field)` — 571 clone sites collapsed — with no
arithmetic anywhere. The only additional structure is the literal traffic in the
same slot: `0x32` at `2.c:8556 func_392`, `0x50` at `2.c:8932 func_403`, `0x64` at
`2.c:9027 func_406`, plus the sibling hash `S(0x3BF9E21E)` at `2.c:8936 func_403`,
which places the field in a 0-to-100 domain whose neutral value is `100`. That is
consistent with a rate but says nothing about which quantity is rated, and nothing
ties the call to air state or to boost consumption. Unresolved `sys_46` mode:
**`(0x4, 0x4)`, single-argument form** — the same unresolved mode as `0x06D1922D`.
Discriminating evidence needed: the native handler for mode `0x4` sub-mode `0x4`,
or a unit that derives this hash arithmetically before the call.

**`0xBC0127E1`** (prior `guard_speed_rate`, prior B). All 609 sites pass the field
unmodified into the one-line wrapper `func_302`, i.e.
`sys_46(0x3, 0x4, 0x64, field, 0x64)` — 562 clone sites collapsed, one
observation, and no arithmetic is applied to the value at any site. The sibling
branch of the same `if` passes the neutral literal `0x64` into the same slot, and
the sustained phase of the same handler ramps that slot from `0x64` down to
`0xA55D6C5E`, so the field is the entry value of the `y` component of a percent
channel. Because the prior name asserts a *rate* rather than a speed value, the
percent domain does not contradict it the way it contradicts `0xA55D6C5E`'s
`dash_end_speed`; what remains unproven is both the quantity the channel scales
and the "guard" attribution. Unresolved `sys_46` mode: **`(0x3, 0x4)`,
three-component percent form, `y` slot**. Discriminating evidence needed: the
native handler for mode `0x3` sub-mode `0x4` (whether the triple scales velocity,
animation rate or model transform), plus the action routing of the handler that
reads it; if the channel turns out to be a velocity scale, this row becomes a
CONFIRM candidate for the "rate" half of the name only.
