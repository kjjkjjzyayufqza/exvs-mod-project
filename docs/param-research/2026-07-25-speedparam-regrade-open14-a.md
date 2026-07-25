# speedparam re-grade of the OPEN fields — shard A

Date: 2026-07-25
Table: MSC id `0x60006` = `speedparam.bin`
Assigned hashes (7 of the 14 re-opened): `06d1922d`, `086b475d`, `0e682ba8`,
`3bf9e21e`, `77749dd2`, `7bf44a41`, `7cd3a712`

## Method

These seven were graded OPEN in an earlier pass whose evidence dump had two
defects that have since been fixed: an assignment target was recorded only when
`=` sat immediately before the syscall, and consumer collection stopped at the
next function header, which discarded the cross-function globals that MSC uses to
carry a loaded value from the handler that reads it to the handler that spends it.
The dump at `tmp/param-evidence/full/fields/t60006_<hash>.txt` was regenerated
with both fixed, `--window 60`, and every `USE` line annotated with its enclosing
function, so it is strictly richer than the input to the earlier verdicts.
Grading here is against the **shipped canonical key** in
`src-tauri/src/format/speedparam.rs`, not against the superseded names in
`docs/speedparam-semantic-ledger.md`; for several of these hashes the shipped key
already differs from the name the earlier pass rejected, which changes what the
verdict has to test. Per the brief, the multi-megabyte `2.c` sources were not
opened; where a fact is quoted that only a source read could produce, it is taken
from the in-repo prior reports under `docs/param-research/` and labelled as a
cross-reference, and no verdict rests on such a quote alone. Two shorthands are
used: `S(h)` means `sys_0(0x60006, global142, h)`, and `func_274()` is the
per-update time step, so `(0x64 - func_274()) / 0x64` is an ease term. The
clone-collapse rule is applied throughout: one call shape replicated across
hundreds of unit scripts is one independent observation, and each hash's
`duplicate_clone_sites` count is stated below. One caveat about the regenerated
dump: because `USE` lines are now collected across function boundaries, lines
that mention a *local* name (`var0`, `var3`) can be harvested from an unrelated
later function that happens to reuse that name — visible in
`t60006_0e682ba8.txt`, where the `USE` block after `return var0;` belongs to
`func_1085`. Only same-function local lines and genuinely file-scope globals were
used for the reasoning below.

## Verdict table

| hash | shipped key | arithmetic shape (literal) | role class | verdict | proposed key | citation |
|---|---|---|---|---|---|---|
| `0x06D1922D` | `walk_speed_forward` | `sys_46(0x4, 0x4, S(0x6d1922d));` — sole argument, no arithmetic anywhere in 609 sites | `sys_46` argument | OPEN | — (unresolved mode `(0x4, 0x4)`) | `001gundam_001gundam_001 2.c:10716 func_448` |
| `0x086B475D` | `step_turn_mid_speed_threshold` | `if (var2 > S(0x7d79f6fa) * 0x64) var3 = S(0x4d601e55) * 0x64; else if (var2 > S(0x86b475d) * 0x64) var3 = S(0xec580bcc) * 0x64; else if (var2 > (S(0x86b475d) - 0xa) * 0x64) var3 = 0x186 + 0x118 * var0 / S(0x86b475d); else var3 = 0x3e8;` then `global265 = global265 - var3;` / `global265 = global265 + var3;` | comparison threshold (secondary: divisor) | OPEN | — | `001gundam_001gundam_001 2.c:9949 func_424` |
| `0x0E682BA8` | `air_step_speed_terminal` | `global509 = S(0xe682ba8);` (branch alternative `global509 = S(0x41dabec5);`) then `global509 += func_418(); global509 += func_420();`, and in the same unit's ramp `global507 = global507 + global508; if (global507 < global509) global507 = global509;` — second shape, a state-keyed getter: `var0 = S(0xe682ba8); … var0 = S(0x5481ccf4); … var0 = S(0x459455ea); return var0;` | clamp bound (lower bound of the emitted movement magnitude) | CONFIRM | — (terminal / speed role upheld; `air` rests on the shared branch bit, see below) | `001gundam_001gundam_001 2.c:9799 func_423`; `005vgundm_013gedlav_001 2.c:30030 func_1083` |
| `0x3BF9E21E` | `max_ground_speed` | `sys_46(0x4, 0x4, S(0x3bf9e21e));` — sole argument, no arithmetic anywhere in 1223 sites | `sys_46` argument | OPEN | — (unresolved mode `(0x4, 0x4)`) | `001gundam_001gundam_001 2.c:8936 func_403` |
| `0x77749DD2` | `speed_decay_base` | `func_300((0x64 - S(0x77749dd2)) * (0x64 - func_274()) / 0x64 + S(0x77749dd2));` where `func_300(value) -> sys_46(0x3, 0x4, value, value, value)` | summand (end term of a percent ramp) | REJECT | `uniform_axis_motion_retention_ramp_end` | `001gundam_001gundam_001 2.c:10549 func_445`; `043orphan_003gsonre_001 2.c:10411 func_437` |
| `0x7BF44A41` | `alternate_free_flight_speed_initial` | `global507 = S(0x7bf44a41);` then `global507 = global507 + global508; if (global507 < global509) global507 = global509;` with `global508 = S(0xcf37ad7)` and `global509 = S(0x95fa2b6d)` written by the entry handler — second shape `var1 = S(0x7bf44a41); … sys_46(0x1, 0x1, 0, 0x2328, var1);` — third shape `… \|\| global245 > S(0x7bf44a41) * 0x64 \|\| …` | counter initialiser (magnitude accumulator seed / re-seed) | CONFIRM | — (`initial` and magnitude role upheld; `alternate_free_flight` unverified) | `007gundmx_006bertig_001 2.c:31070 func_1074`; `042grecon_004garcan_001 2.c:24988 func_851` |
| `0x7CD3A712` | `boost_consumption_base` | `sys_46(0x4, 0x4, S(0x7cd3a712));` — sole argument, no arithmetic anywhere in 609 sites | `sys_46` argument | OPEN | — (unresolved mode `(0x4, 0x4)`) | `001gundam_001gundam_001 2.c:10515 func_444` |

## Confirmations

**`0x0E682BA8` — `air_step_speed_terminal`.** The regenerated dump resolves the
slot identity that the earlier pass could not settle. In each unit the hash is
written to exactly the register that the same unit's magnitude ramp uses as its
lower clamp bound: `001gundam_001gundam_001` writes `global509` and its ramp
tests `if (global507 < global509)`; `001gundam_003acguy0_001` writes `global510`
against `if (global508 < global510)`; `003zzgndm_004zak3cm_001` writes
`global717` against `if (global715 < global717)`; `018ggundm_004spiegl_001`
writes `global709` against `if (global707 < global709)`. Cross-reading
`t60006_0e682ba8.txt` against `t60006_95fa2b6d.txt` this correspondence holds in
27 of 27 units that appear in both dumps, with each unit's globals independently
renumbered — so the identification is not an artefact of one numbering. That
register is the `terminal` slot of the pool's established
`*_speed_{initial,delta,terminal}` triple convention, and the value is
dimensionally a movement magnitude: it receives the same external bonus addends
(`func_418()`, `func_420()`) as the magnitude it bounds, and the bounded register
is emitted as the magnitude argument of a movement-channel write. The second,
structurally different shape in `005vgundm_013gedlav_001 2.c:30030 func_1083` is
new in this dump — the earlier extractor's stop-at-next-function rule discarded
it — and it is a state-keyed getter whose other arms are `S(0x5481CCF4)`
(`boost_dash_speed_terminal`) and `S(0x459455EA)`
(`transform_forward_speed_terminal`), i.e. every arm of that selector is a
`*_speed_terminal` field. Value spread corroborates the family placement: 11
distinct values for this hash, 11 for its branch counterpart `0x41DABEC5`, 12 for
`0x5481CCF4` (`docs/param-evidence-registry.tsv`), which is per-unit tuning as a
terminal speed should be. Residual, recorded rather than resolved: `air` versus
`ground` is decided by the branch bit `global24 & 0x1000000`, whose set branch
takes this hash and whose clear branch takes `0x41DABEC5`
(`ground_step_speed_terminal`) — a cross-reference from
`docs/param-research/2026-07-25-speedparam-grade-g01.md`. That one bit splits a
six-field family the same way (`0x37D1D056` / `0x8D0A9843` for the delta slot,
`0x4F705BAD` / `0x7C3CF4DD` for the timer), so the polarity is a single
family-wide decision, not a per-field one; it is supported by the clear branch
being the fallthrough default and by the Gedlav selector grouping this hash with
two airborne-mode terminals and no ground member. Basis: two independent shapes
in two unrelated units (548 clone sites collapsed on the first shape) plus the
27-unit register-identity check.

**`0x7BF44A41` — `alternate_free_flight_speed_initial`.** The hash occupies the
seed slot of the floored magnitude ramp, and the regenerated dump now shows the
whole trio in one place: `007gundmx_006bertig_001` writes it to `global507`
(`2.c:31070 func_1074`), the entry handler writes `global508 = S(0x0CF37AD7)` and
`global509 = S(0x95FA2B6D)` (`2.c:30956-30957 func_1072`), and the update does
`global507 = global507 + global508; if (global507 < global509) global507 =
global509;`. `042grecon_004garcan_001` repeats the shape with its own numbering —
seed `global509`, delta `global510` from `S(0x0CF37AD7)` (`2.c:24879 func_849`),
floor `global511` (`2.c:24988-24998 func_851`). `duplicate_clone_sites` is 0 for
this hash, so these are two genuinely independent observations rather than one
cloned shape. The seed reading is what the arithmetic fixes: the register is
*written from* this hash and then advanced and clamped, which excludes the delta
and bound readings, and is unaffected by whether the write sits inside the ramp's
`if (global507 < global509)` re-seed guard — a re-seed is still an initialiser.
The magnitude dimension is independently supported by
`005vgundm_013gedlav_001 2.c:27842-27854 func_994`, where the value is passed
straight through as the fifth argument of `sys_46(0x1, 0x1, 0, 0x2328, var1)`,
the same argument position the ramp's output occupies, and by
`013gndmsm_001gp01fb_001 2.c:28075 func_986`, where it is compared as
`global245 > S(0x7bf44a41) * 0x64` under the whole-unit-to-centi-unit convention.
The prior grade-A claim `initial + delta = terminal` (`30 + 320 = 350`) is not
needed and is not asserted here: that identity is about whether `0x95FA2B6D` is a
floor or a cap, which is a separate hash. Not verified: the `alternate` and
`free_flight` qualifiers. They rest only on the fact that the four consuming units
(`005vgundm_013gedlav`, `007gundmx_006bertig`, `013gndmsm_001gp01fb`,
`042grecon_004garcan`) are the same set that drives
`alternate_free_flight_speed_delta` and reuses `free_flight_magnitude_bound` as
this ramp's floor, which makes the label internally consistent but not proven.

## Rejections

**`0x77749DD2` — `speed_decay_base` → `uniform_axis_motion_retention_ramp_end`.**
The value is one endpoint of a linear interpolation whose other endpoint is the
literal `0x64` and whose ease shares that same `0x64` as its denominator
(`(0x64 - P) * (0x64 - func_274()) / 0x64 + P`), so `P` lives on the 0–100 percent
scale, not in speed units; a speed cannot be subtracted from the ease's
normalising constant and re-added to the result. The consumer settles what the
percent means: `func_300(value)` is documented in
`docs/msc-research/sys46-script-parameter-atlas.md` as
`sys_46(0x3, 0x4, value, value, value)`, i.e. the movement-speed-scale wrapper
applied uniformly to all three components with `0x64` as the neutral value, and
the shipped pool already annotates the constant-valued sibling `0xDD7720EB` on
the same `func_300` as *retained* percent. That fixes the polarity and is the
second contradiction: the ramp runs between 100 % and `P` %, so a larger `P` means
*less* damping, while a name of the form `*_decay_*` reads as more. This is
exactly the inversion the pool comment on `0xDD7720EB` records as having already
been corrected once ("the former decay-rate name had inverted polarity"), and the
vertical-axis analogue `0xA55D6C5E` — identical ease shape through `func_302`,
which the atlas gives as `sys_46(0x3, 0x4, 0x64, value, 0x64)` — was renamed to
`vertical_axis_motion_retention` for the same reason. The proposed key is the
uniform-axis counterpart of that name, with `ramp_end` distinguishing it from the
constant-path `uniform_axis_motion_retention` already held by `0xDD7720EB`.
Supporting, not load-bearing: the field has a single distinct value across the
whole corpus (`docs/param-evidence-registry.tsv`), which is what a fixed
retention percent looks like and not what per-unit speed tuning looks like. Basis:
one call shape, 1171 clone sites collapsed; the shape recurs with the unit-local
callee renumbered (`func_437`, `func_439`, `func_413`, and `func_297` with
`func_271` as its ease in `043orphan_003gsonre_001`), which shows the pattern is
the same code emitted per unit rather than two independent designs.

## Still open

**`0x06D1922D` (`walk_speed_forward`), `0x3BF9E21E` (`max_ground_speed`),
`0x7CD3A712` (`boost_consumption_base`).** All three have exactly one consumer
shape in the whole corpus, `sys_46(0x4, 0x4, field)`, with the field as the sole
argument and no arithmetic, comparison or storage anywhere — 571, 1181 and 571
clone sites collapsed respectively, so one independent observation each. The
regenerated cross-function collection added nothing for them, which is itself the
finding. Because argument position in `sys_46` proves nothing on its own, the
unknown to record is **mode `(0x4, 0x4)`**: mode `0x4` is catalogued in
`docs/msc-research/sys46-script-parameter-atlas.md` as a "movement scale
baseline" with 46 corpus uses, typically paired with `sys_46(0xe, 0x4, 0x190)`
during runtime initialisation, but that entry is a candidate identification, not
a proven one. Discriminating evidence needed, in order of decisiveness: (a) the
native handler for `sys_46` mode `0x4` sub-argument `0x4`, which would say whether
the argument is a percent scale or a magnitude — if it is a percent scale, all
three shipped names are wrong, since a percent baseline is neither a walk speed
nor a ground-speed cap nor a boost consumption figure; (b) failing that, a
non-`sys_46` consumer of any of the three, which the corpus does not contain; (c)
for `0x7CD3A712` specifically, any site where the value multiplies or decrements a
gauge, as a `*_consumption_*` name requires — none exists, so the shipped name is
currently unsupported even though the brief's rule keeps the verdict at OPEN
rather than REJECT. Supporting context: the same call slot elsewhere receives the
literals `0x32`, `0x50` and `0x64`
(`docs/param-research/2026-07-25-speedparam-grade-g234.md`,
`…-g567.md`, `…-g89ab.md`), and the three fields carry only 1, 2 and 2 distinct
values across 609 units — a near-constant, percent-shaped value domain, which
points the same way as (a) without settling it.

**`0x086B475D` (`step_turn_mid_speed_threshold`).** The role is fully determined
and the shipped rename has already absorbed it: the field is the middle rung of a
descending four-way ladder in `func_424` whose top rung is `S(0x7D79F6FA)`
(`step_turn_high_speed_threshold`) and whose third rung is this field minus
`0xa`, each rung selecting a per-update heading delta `var3` that is then added to
or subtracted from the heading accumulator `global265`. The ladder is now fully
citable from the dumps alone: `2.c:9945` and `2.c:9947` for the top rung and its
adjustment `S(0x4D601E55) * 0x64`, `2.c:9949` and `2.c:9951` for this rung and
`S(0xEC580BCC) * 0x64`, `2.c:9953-9955` for the interpolated rung
`0x186 + 0x118 * var0 / S(0x86b475d)`, `2.c:9959` for the `0x3e8` floor case, and
`2.c:9974/9978` for the writes into `global265`. `turn`, `mid` and `threshold` are
therefore all supported. What is not supported is `speed`: the compared quantity
`var2` is never defined inside the 60-line window, the `* 0x64` scaling is the
generic whole-unit-to-centi-unit convention and is used identically for angles
(`var3 = S(0xec580bcc) * 0x64` feeds a centi-degree heading delta) and for
magnitudes (`global245 > S(0x7bf44a41) * 0x64`), so it does not fix the dimension,
and a `*_speed_*` name requires the field to be compared against a velocity
rather than against an unidentified scalar. Discriminating evidence needed: the
identity of the runtime accessor that produces `var2`, recorded by the earlier
source-reading pass as `sys_0(0x40003, 0x1)`
(`docs/param-research/2026-07-25-speedparam-grade-g01.md`,
`…-g567.md`) — specifically whether `sys_0(0x40003, 0x1)` returns current speed or
a heading error. A weaker second route: the per-unit data values of the ladder's
two adjustment fields `0xEC580BCC` and `0x4D601E55`, since the lowest rung emits a
fixed `0x3e8` (10.00°) and a controller that turns fastest when its input is
smallest is consistent with a speed input and not with an angle-error input —
that ordering can only be checked once the adjustment values are known. Whatever
resolves it resolves `0x7D79F6FA`, `0xEC580BCC` and `0x4D601E55` at the same
time, and `step` remains inferred from the `func_423`/`func_424` neighbourhood
rather than proven. Basis: one call shape, 1713 clone sites collapsed.
