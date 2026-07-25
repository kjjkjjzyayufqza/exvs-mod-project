# speedparam field-hash grading — group G01

Date: 2026-07-25
Table: MSC id `0x60006` = `speedparam.bin`
Assigned hashes: `06d1922d`, `086b475d`, `0b9ebece`, `0cf37ad7`, `0e682ba8`,
`11ffddb4`, `17a9d82d`, `18895a55`

## Method

Every prior name in `docs/speedparam-semantic-ledger.md` was treated as a
hypothesis with no evidentiary weight, because those names were inherited from a
label list rather than from proven consumers. Grading input was the per-hash
evidence dump in `tmp/param-evidence/full/fields/t60006_<hash>.txt`, built from
the ~609-unit / 1827-file MSC corpus under `E:\XB\mod\040msc`. For each hash the
role was extracted from the CALL and USE lines and then verified read-only
against the cited `2.c` sources so that the surrounding accumulator, clamp and
emission structure could be seen; nothing outside `docs/param-research/` was
modified and no disassembler was used. Two shorthands are used below: `S(h)`
means `sys_0(0x60006, global142, h)`, and `func_274()` is the per-update time
step in hundredths of a frame (timers are seeded as `param * 0x64` and
decremented by `func_274()`, and every ease term has the form
`(0x64 - func_274()) / 0x64`). The clone-collapse rule was applied throughout: a
call shape replicated across hundreds of unit scripts is one observation, and the
`duplicate_clone_sites` count for each hash is stated in the notes below.
Proposed keys describe role only; they deliberately carry no action or gameplay
attribution, and MSC arithmetic alone caps any of them at grade B.

## Verdict table

| hash | prior key | prior grade | arithmetic shape (literal) | role class | verdict | proposed key | citation |
|---|---|---|---|---|---|---|---|
| `0x06D1922D` | `walk_speed_forward` | C | `sys_46(0x4, 0x4, S(0x6d1922d))` — the field is the sole argument; the same call slot is elsewhere given the literal `0x64` (`sys_46(0x4, 0x4, 0x64)`) | `sys_46` argument | OPEN | — (unresolved mode `(0x4, 0x4)`) | `001gundam_001gundam_001 2.c:10716 func_448` |
| `0x086B475D` | `walk_speed_base` | A | `var2 = sys_0(0x40003, 0x1);` … `else if (var2 > S(0x86b475d) * 0x64) var3 = S(0xec580bcc) * 0x64; else if (var2 > (S(0x86b475d) - 0xa) * 0x64) var3 = 0x186 + 0x118 * var0 / S(0x86b475d);` then `global265 -= var3` / `global265 += var3` | comparison threshold (secondary: divisor) | OPEN | — | `001gundam_001gundam_001 2.c:9949 func_424` |
| `0x0B9EBECE` | `boost_gauge_capacity` | B | `global507 = S(0xb9ebece);` (entry, with `global265` set to `0` / `0x2328` / `0x4650`) then per update `global507 += S(0x9297ef74); if (global507 < 0) global507 = 0; sys_46(0x1, 0x2, global265, 0, global507);` — second shape `sys_46(0x1, 0x1, 0, 0x2328, S(0xb9ebece))` | counter initialiser (magnitude accumulator seed) | REJECT | `decayingMoveMagnitudeInitial` | `001gundam_001gundam_001 2.c:11550 func_471` |
| `0x0CF37AD7` | `boost_recovery_delay_frame` | A | `global508 = S(0xcf37ad7); global509 = S(0x95fa2b6d);` then per update `if (global507 < global509) global507 = S(0x7bf44a41); global507 = global507 + global508; if (global507 < global509) global507 = global509; sys_46(0x1, 0x2, global265 - var2, 0, global507);` | summand | REJECT | `flooredMoveMagnitudeDelta` | `007gundmx_006bertig_001 2.c:31077 func_1074`; `042grecon_004garcan_001 2.c:24995 func_851` |
| `0x0E682BA8` | `ground_run_speed` | A | `if ((global24 & 0x1000000) != 0) global509 = S(0xe682ba8); else global509 = S(0x41dabec5);` then `global509 += func_418(); global509 += func_420();` and per update `sys_46(0x1, 0x2, global181, 0, var0); global507 = global507 + global508; if (global507 < global509) global507 = global509;` | clamp bound (lower) | OPEN | — | `001gundam_001gundam_001 2.c:9799 func_423`; `001gundam_001gundam_001 2.c:10004 func_424` |
| `0x11FFDDB4` | `boost_dash_initial_speed` | A | `global510 = S(0x11ffddb4); global511 = S(0x11ffddb4); global512 = S(0x607c25bc);` then per update `sys_46(0x1, 0x1, 0, 0xffffdcd8, global510); global510 += global511; if (global510 > global512) global510 = global512;` — also `global510 += S(0x11ffddb4) / 0x2` and `sys_46(0x1, 0x1, 0, 0xffffdcd8, S(0x11ffddb4) * 0x32 / 0x64)` | summand (and accumulator initialiser) | REJECT | `cappedMoveMagnitudeSeedAndDelta` | `001gundam_001gundam_001 2.c:9192 func_408`; `001gundam_001gundam_001 2.c:9215 func_409`; `001gundam_001gundam_001 2.c:9131 func_407` |
| `0x17A9D82D` | `step_distance` | A | `global507 = global507 + S(0x17a9d82d); if (global507 > S(0xf44c9d4e)) global507 = S(0xf44c9d4e);` — same accumulator is seeded `global507 = S(0xcd5df17c)` and emitted `sys_46(0x1, 0x2, global265, 0, global507)` | summand | REJECT | `cappedMoveMagnitudeDelta` | `001gundam_001gundam_001 2.c:9247 func_409` |
| `0x18895A55` | `jump_initial_velocity` | A | `global166 = global166 * ((0x64 - S(0x18895a55)) * (0x64 - func_274()) / 0x64 + S(0x18895a55)) / 0x64;` | multiplier | REJECT | `neutralInputRetentionPercent` | `001gundam_001gundam_001 2.c:11050 func_457` |

## Rejections

**`0x0B9EBECE` — `boost_gauge_capacity` → `decayingMoveMagnitudeInitial`.** The
field is the initial value of the accumulator `global507`, which is then advanced
every update by `S(0x9297EF74)`, floored at `0` and handed to
`sys_46(0x1, 0x2, global265, 0, global507)`; the same entry block sets
`global265` to `0`, `0x2328` or `0x4650`, i.e. the direction argument of that
call is an angle in hundredths of a degree, so slot five is a movement
magnitude. A capacity would appear as an upper clamp bound or as the right side
of a `>=` test against a running resource, never as the lower-clamped seed of a
per-update movement magnitude. Evidence is two call shapes with 1116 clone sites
collapsed; the shapes recur in unrelated units (`001gundam`, `003zzgndm`,
`005vgundm`, `007gundmx`, `014gndm00`, `018ggundm`).

**`0x0CF37AD7` — `boost_recovery_delay_frame` → `flooredMoveMagnitudeDelta`.**
Bertigo and G-Arcane implement the same three-term ramp independently, with zero
clone collapse across the hash's seven sites: the field is loaded once at entry
into the delta register and then added to the emitted magnitude on every update,
with `S(0x95FA2B6D)` acting as a floor (`if (x < floor) x = floor`, not a `min`)
and `S(0x7BF44A41)` as the re-seed. It is never a counter: no timer is
initialised from it, it is never decremented, and it never appears on either side
of a comparison against a running counter, so the `_frame` reading has no
support. In Gedlav and GP01FB the same hash is passed directly as the magnitude
argument of `sys_46(0x1, 0x1, 0, 0xffffdcd8, …)` and `sys_46(0x2, 0x4, …)`, which
is consistent with a magnitude and not with a duration.

**`0x11FFDDB4` — `boost_dash_initial_speed` → `cappedMoveMagnitudeSeedAndDelta`.**
At entry the field is written into both the accumulator and its increment
register (`global510 = global511 = S(0x11FFDDB4)`), so it is simultaneously the
seed and the per-update delta of a magnitude that rises until capped by
`S(0x607C25BC)`; a second path uses it as a half-scale increment
(`+= field / 2`) and as an immediate half-scale magnitude
(`field * 0x32 / 0x64`). No "initial speed" reading covers the increment role.
The dash-style handler in the same script already fills the initial slot from a
different hash (`if (global507 < S(0xA49287B9)) global507 = S(0xA49287B9);` with
delta `S(0x6C640897)` and floor `S(0x5481CCF4)`, `2.c:10324 func_439`), and that
accumulator decays to a floor and is emitted through the yaw-carrying
`sys_46(0x1, 0x2, …)` form, whereas this one rises to a cap and is emitted
through `sys_46(0x1, 0x1, 0, 0xffffdcd8, …)`. Four shapes, 2216 clone sites
collapsed.

**`0x17A9D82D` — `step_distance` → `cappedMoveMagnitudeDelta`.** The single
observed shape adds the field to `global507` once per update and clamps the
result against `S(0xF44C9D4E)`; the same accumulator is decayed by `* 0x5e / 0x64`
while gated off, re-seeded with `S(0xCD5DF17C)` when the gate opens, and passed
as the magnitude of `sys_46(0x1, 0x2, global265, 0, global507)`. A distance would
be an accumulated position or range compared against a limit, not a per-update
addend to the value that is fed to the movement call on the same tick. This rests
on one call shape (546 clone sites collapsed), so it is one independent
observation, but the contradiction is intrinsic to that shape.

**`0x18895A55` — `jump_initial_velocity` → `neutralInputRetentionPercent`.** The
only shape is a dimensionless blend with denominator `0x64`: the factor equals
`1` when `func_274()` is `0` and `P / 0x64` when `func_274()` is `0x64`, i.e. the
field is the fraction of `global166` retained per full frame in the branch taken
when the `func_457` argument is neither `0x1` nor `0x2` (the observed caller
passes `func_457(0)`, `2.c:11013`). The other branches of the
same function converge `global166` toward `±(S(0x4D4B65EA) * 0x64)` with gain
`S(0x2D28CC4B)`, so `global166` is a signed state variable and this field only
scales it. A velocity would be summed into a velocity or emitted as a magnitude,
never used as a per-frame percentage multiplier; the read-only control values
already recorded in the ledger (Hyaku Shiki `24`, Gyan `0`, against neighbouring
speeds of `280`–`330`) are consistent with a `0..100` percentage. One call shape,
1171 clone sites collapsed.

**Ledger wording correction.** The existing ledger describes the `0x7BF44A41` /
`0x0CF37AD7` / `0x95FA2B6D` closure as `min(initial + delta, terminal)`. The code
applies a floor clamp (`if (x < floor) x = floor`) after the addition, so the
observed `30 + 320 = 350` agreement in real rows is a value coincidence, not the
effect of a `min`.

## Open

**`0x06D1922D`** (prior `walk_speed_forward`, prior C). Every one of the 609
sites is the same single shape `sys_46(0x4, 0x4, field)` — 571 clone sites
collapsed, one independent observation, and the field never enters arithmetic
anywhere in the corpus. The only additional structure available is that other
call sites pass the literal `0x64` into the same slot
(`001gundam_001gundam_001 2.c:9183 func_408`, `2.c:10072 func_425`), which hints
at a percentage-scaled quantity whose neutral value is `100`. Unresolved
`sys_46` mode: **`(0x4, 0x4)`, single-argument form**. Discriminating evidence
needed: the native handler for `sys_46` mode `0x4` sub-mode `0x4` (which engine
field it writes), or a unit whose script performs arithmetic on this hash before
the call.

**`0x086B475D`** (prior `walk_speed_base`, prior A). The role is settled — it is
the middle tier of a three-tier threshold ladder on the runtime query
`sys_0(0x40003, 0x1)` (upper tier `S(0x7D79F6FA)`, lower tier
`field - 0xa`), selecting the per-update heading delta `var3` that is then added
to or subtracted from `global265` — and the field is dimensionally a linear
speed, because the third branch divides the movement magnitude `var0` by it
(`0x186 + 0x118 * var0 / field`). What the arithmetic cannot decide is whether
the value is this unit's walking speed or an unrelated tier boundary: across all
1827 sites (3 shapes, 1713 clone sites collapsed) the hash never seeds or
increments a velocity, and it is read only by the `func_424` handler family.
Discriminating evidence needed: the identity of `sys_0(0x40003, 0x1)`, or any
consumer that applies this hash as a walk velocity, or a per-unit value
comparison against measured walking speed.

**`0x0E682BA8`** (prior `ground_run_speed`, prior A). Proven role: the lower
clamp bound of the emitted movement magnitude in `func_424`
(`global507 = global507 + global508; if (global507 < global509) global507 = global509;`),
selected in the `(global24 & 0x1000000) != 0` branch of the entry, where the
counterpart branch uses `S(0x41DABEC5)` for the same slot; it is in speed units
because it receives the same external bonus addends (`func_418`, `func_420`) as
the initial magnitude. A second shape in Gedlav (`005vgundm_013gedlav_001
2.c:30030 func_1083`) returns it from a state-keyed speed getter alongside
`S(0x5481CCF4)` and `S(0x459455EA)`, again as a bare magnitude. Two shapes, 548
clone sites collapsed. What is undecided is the branch attribution, and therefore
whether a "ground" name is contradicted: the discriminating evidence is the
meaning of state bit `global24 & 0x1000000` — set by `func_167(0x1000000)` in the
ascent-style entry (`2.c:9182 func_408`) and cleared by `func_168(0x1000000)` in
`func_424` when `sys_0(0x60000) <= 0` (`2.c:10015-10018`) — i.e. the identity of
`sys_0(0x60000)` and of the `func_167` / `func_168` bit family. Independently of
that, the hash is never read by the walk-magnitude handler, so the prior name is
unsupported even in the branch reading that would favour it.
