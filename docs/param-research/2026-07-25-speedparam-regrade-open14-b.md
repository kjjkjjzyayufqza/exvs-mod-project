# speedparam re-grade of the OPEN fields — shard B

Date: 2026-07-25
Table: MSC id `0x60006` = `speedparam.bin`
Assigned hashes (7 of the 14 re-opened): `7d79f6fa`, `9a378388`, `b20b67c9`,
`bc0127e1`, `c6157381`, `e2fd1bfb`, `e590dfe2`

## Method

These seven were graded OPEN in an earlier pass whose evidence dump had two
defects that have since been fixed: the assignment target was recorded only when
`=` sat immediately before the syscall, and consumer collection stopped at the
next function header, which discarded the file-scope globals MSC uses to carry a
value from the handler that loads it to the handler that spends it. The dump at
`tmp/param-evidence/full/fields/t60006_<hash>.txt` was regenerated with both
fixed, `--window 60`, and every `USE` line annotated with its enclosing function,
so it is strictly richer than the input to the earlier verdicts. Grading here is
against the **shipped canonical key** in `src-tauri/src/format/speedparam.rs`, not
against the superseded names in `docs/speedparam-semantic-ledger.md` or
`docs/command_mapping.md`. Per the brief the multi-megabyte `2.c` sources were not
opened; two kinds of outside fact are quoted and both are labelled as
cross-references and are never the sole basis of a verdict — the `sys_46`
sub-command map in `docs/msc-research/sys46-script-parameter-atlas.md`, and the
per-field value spread in `docs/param_field_analysis.md` plus
`docs/param-evidence-registry.tsv`. Shorthand: `S(h)` means
`sys_0(0x60006, global142, h)`, and `func_274()` is the per-update time step, so
`(0x64 - func_274()) / 0x64` is an ease term. The clone-collapse rule is applied
throughout and each hash's `duplicate_clone_sites` count is stated. One caveat
about the regenerated dump, confirmed on my own set: because `USE` lines now cross
function boundaries, a line naming a *local* (`var0`, `var1`) can be harvested
from a later unrelated function — visible in `t60006_c6157381.txt`, where the
`USE` block after `return var0;` at `2.c:30044` belongs to `func_1085`. Only
same-function local lines and genuinely file-scope `globalNNN` were used for
reasoning; where a line's *text and enclosing function* are used purely as
"this line exists in that function" context, that is said explicitly.

## Verdict table

| hash | shipped key | arithmetic shape (literal) | role class | verdict | proposed key | citation |
|---|---|---|---|---|---|---|
| `0x7D79F6FA` | `step_turn_high_speed_threshold` | `if (var2 > S(0x7d79f6fa) * 0x64) var3 = S(0x4d601e55) * 0x64; else if (var2 > S(0x86b475d) * 0x64) var3 = S(0xec580bcc) * 0x64; else if (var2 > (S(0x86b475d) - 0xa) * 0x64) var3 = 0x186 + 0x118 * var0 / S(0x86b475d); else var3 = 0x3e8;` then `global265 = global265 - var3;` / `global265 = global265 + var3;` | comparison threshold | OPEN | — | `001gundam_001gundam_001 2.c:9945 func_424`; `043orphan_003gsonre_001 2.c:9821 func_416` |
| `0x9A378388` | `guard_recovery_frame` | `sys_46(0xf, 0x4, S(0x9a378388) * 0x64, 0x1);` — no other appearance in 609 sites | `sys_46` argument | OPEN | — (unresolved mode `(0xf, 0x4)`, 4-argument form, trailing literal `0x1`) | `001gundam_001gundam_001 2.c:10724 func_448`; `043orphan_003gsonre_001 2.c:10577 func_440` |
| `0xB20B67C9` | `air_boost_efficiency` | `sys_46(0x4, 0x4, S(0xb20b67c9));` — sole argument, no arithmetic in 609 sites | `sys_46` argument | OPEN | — (unresolved mode `(0x4, 0x4)`) | `001gundam_001gundam_001 2.c:8904 func_401`; `043orphan_003gsonre_001 2.c:8858 func_397` |
| `0xBC0127E1` | `guard_speed_rate` | `func_302(S(0xbc0127e1));` where `func_302(v) -> sys_46(0x3, 0x4, 0x64, v, 0x64)` — value passed flat, no ease | `sys_46` argument (y component of a three-component percent tuple whose x and z are pinned to the neutral `0x64`) | REJECT | `vertical_axis_motion_retention_base` | `001gundam_001gundam_001 2.c:9034 func_406`; `702zgundm_005barzam_001 2.c:12058 func_514` |
| `0xC6157381` | `air_step_speed_initial` | `global507 = S(0xc6157381);` (branch alternative `global507 = S(0xf559dcf1);`) then `global507 += func_417(); global507 += func_419();`, and the same triple's update `sys_46(0x1, 0x2, global265, 0, global507); global507 = global507 + global508; if (global507 < global509) global507 = global509;` with `global508 = S(0x37d1d056)` and `global509 = S(0xe682ba8)` — second shape, a state-keyed getter `var0 = S(0xc6157381); … var0 = S(0xe682ba8); … var0 = S(0x5481ccf4); … var0 = S(0x459455ea); return var0;` | counter initialiser (magnitude-register seed) | CONFIRM | — (`initial` and the step-magnitude role upheld; `air` vs `ground` inherited, see below) | `001gundam_001gundam_001 2.c:9797 func_423`; `003zzgndm_004zak3cm_001 2.c:14589 func_560`; `005vgundm_013gedlav_001 2.c:30026 func_1083` |
| `0xE2FD1BFB` | `air_deceleration` | `global508 = S(0xe2fd1bfb);` in the entry handler, then in the update `if (global507 < global509) global507 = S(0x95fa2b6d); global507 = global507 + global508; if (global507 < global509) global507 = global509;` with `global509 = S(0x7242066a)`, and `global507 = global507 * (0x5 * (0x64 - func_274()) / 0x64 + 0x5f) / 0x64;` in the next handler | summand (per-update delta on a movement magnitude) | CONFIRM | — | `001gundam_001gundam_001 2.c:11362 func_467` + `2.c:11467 func_469`; `001gundam_003acguy0_001 2.c:11366 func_467` + `2.c:11471 func_469` |
| `0xE590DFE2` | `boost_dash_count` | `var1 = S(0xe590dfe2); … sys_46(0x1, 0x1, 0, 0x2328, var1);` — second shape `global507 += S(0xe590dfe2); if (global507 < 0) global507 = 0; sys_46(0x1, 0x2, global166, 0, global507);` | `sys_46` argument (magnitude position) in shape 1, summand in shape 2 | REJECT | `free_flight_vertical_magnitude` | `001gundam_001gundam_001 2.c:11390 func_468` + `2.c:11401 func_468`; `005vgundm_013gedlav_001 2.c:28035 func_997` + `2.c:28040 func_997` |

## Confirmations

**`0xC6157381` — `air_step_speed_initial`.** The regenerated dump places the field
in the seed slot of the pool's established `*_speed_{initial,delta,terminal}`
triple. In `func_423` the three registers are loaded consecutively —
`global507 = S(0xc6157381)`, `global508 = S(0x37d1d056)`,
`global509 = S(0xe682ba8)` at `2.c:9797-9799` — and the branch alternative
overwrites the same three slots with `S(0xf559dcf1)`, `S(0x8d0a9843)`,
`S(0x41dabec5)` at `2.c:9803-9805`. Only the seed and the floor then receive
external addends (`global507 += func_417()`, `global507 += func_419()` at
`2.c:9809/9814`; `global509 += func_418()`, `global509 += func_420()` at
`2.c:9810/9815`, each resolving to sums over table `0x6000e`), while the middle
register receives none — a same-dimension bonus applied to the two endpoints of a
ramp and not to its rate, which is what a speed pair looks like and not what a
rate does. The register identification is not a single-unit accident: the
per-unit global renumbering tracks it exactly, `001gundam_003acguy0_001` writing
`global508/509/510`, `001gundam_008charzk_001` writing `global509/510/511`,
`001gundam_004zeong0_001` writing `global510/511/512`, and
`003zzgndm_004zak3cm_001` writing `global715/716/717`. The ramp mechanics come
from the structurally identical triple in the same units,
`global507 = S(0xa49287b9)`, `global508 = S(0x6c640897)`,
`global509 = S(0x5481ccf4)` at `001gundam_001gundam_001 2.c:10265-10267
func_437`, whose update at `2.c:10310-10314 func_438` is
`sys_46(0x1, 0x2, global265, 0, global507); global507 = global507 + global508;
if (global507 < global509) global507 = global509;` — so the seed slot is the
initial value of a magnitude that is written to a movement channel, decays by a
negative delta and is floored. Both directions of that reading are corroborated
by the value spreads: seed 200–360 over 13 distinct values, delta −20…−10, floor
100–180 (`docs/param_field_analysis.md`), i.e. seed above floor with a negative
delta, which fixes `initial` against `terminal` and excludes the cap reading. The
second, genuinely different shape at
`005vgundm_013gedlav_001 2.c:30026 func_1083` is new in this dump — the old
stop-at-next-function rule discarded it — and it is a state-keyed getter whose
other arms are `S(0x0E682BA8)` (this field's own floor), `S(0x5481CCF4)`
(`boost_dash_speed_terminal`) and `S(0x459455EA)`
(`transform_forward_speed_terminal`): every arm is a movement magnitude, so the
field is interchangeable with other members of the speed family. Note that the
`USE` lines in that record from `2.c:30054` onward belong to `func_1085` and were
discarded as local-name false positives. Residual, recorded rather than resolved:
`air` versus `ground`. The selector in `func_423` reads `var0 = global9` and
tests `if ((global24 & 0x200000) != 0 && var0 == 0x2)` and `if (var0 == 0x2)`
(lines present at `001gundam_001gundam_001 2.c:9661/9678/9686`, harvested as
context, not as uses), and neither `global9` nor that mask is resolved here. The
same one selector splits a six-field family the same way — seed
`0xC6157381`/`0xF559DCF1`, delta `0x37D1D056`/`0x8D0A9843`, floor
`0x0E682BA8`/`0x41DABEC5`, plus the timers `0x4F705BAD`/`0x7C3CF4DD` and
`0x737D64F4`/`0x4031CB84` — so the polarity is one family-wide decision, not a
per-field one, and shard A records the same residual for `0x0E682BA8`. Basis: one
dominant call shape with 546 clone sites collapsed, plus the one genuinely
independent Gedlav shape.

**`0xE2FD1BFB` — `air_deceleration`.** This is the hash the second extractor fix
was made for. Its own file shows an assignment and no uses at all, because the
consumer sits two function boundaries and ~105 lines past the load; the role is
recoverable only through the file-scope global, which is exactly the case the
parent's caveat says is trustworthy. `func_467` loads
`global508 = S(0xe2fd1bfb)` and `global509 = S(0x7242066a)` at
`001gundam_001gundam_001 2.c:11362-11363`, and `func_469` runs the floored ramp
at `2.c:11460-11470`: `global507 = S(0x95fa2b6d);` inside the re-seed guard, then
`global507 = global507 + global508; if (global507 < global509)
global507 = global509;`. So the field is the per-update addend of a movement
magnitude that is floored and then scaled by `global507 * (0x5 * (0x64 -
func_274()) / 0x64 + 0x5f) / 0x64` in `func_470` at `2.c:11515`. Two things make
the slot identity safe rather than lucky. First, the per-unit renumbering tracks
it across four units with independent global tables:
`001gundam_003acguy0_001` has the field in `global509` and its update reads
`global508 = global508 + global509; if (global508 < global510)`;
`001gundam_008charzk_001` has it in `global510` against
`global509 = global509 + global510; if (global509 < global511)`;
`001gundam_004zeong0_001` has it in `global511` against
`global510 = global510 + global511`; `003zzgndm_004zak3cm_001` has it in
`global716` against `global715 = global715 + global716` — read by cross-joining
`t60006_e2fd1bfb.txt` and `t60006_95fa2b6d.txt`, which agree unit for unit.
Second, the shipped pool already carries `[V:func_467,func_469]` on the sibling
`0x7242066A`, i.e. the same cross-function flow through the same handler pair has
already been verified once for the floor. The sign is what closes the name: the
value spread is −5…0 over 2 distinct values
(`docs/param_field_analysis.md`), so the addend is non-positive and the register
falls toward a floor. A non-positive per-update addend on a movement magnitude is
a deceleration, and no competing reading fits — it is not a multiplier (it is
added, not multiplied), not a clamp bound (the floor is the separate
`0x7242066A`), not a seed (the seed is the separate `0x95FA2B6D`), and not a
counter (it is never decremented or tested against zero). `air` is consistent
rather than proven: the two registers it works with are the shipped
`free_flight_magnitude_bound` and `free_flight_magnitude_floor`, an airborne
group, and the Gedlav replica of the same handler group at `2.c:27812 func_993`
carries the field in the same slot. Basis: one dominant shape with 545 clone
sites collapsed, verified across four independently renumbered units.

## Rejections

**`0xBC0127E1` — `guard_speed_rate` → `vertical_axis_motion_retention_base`.** All
609 sites pass the field unmodified into a one-line wrapper whose body is
`sys_46(0x3, 0x4, 0x64, value, 0x64)`; the wrapper is `func_302` in
`001gundam_001gundam_001`, `049orphn2_002gsonrf_001`, `702zgundm_005barzam_001`
and at least five other units, and its index shifts with the unit's function
table (`func_299` in `043orphan_003gsonre_001`, `func_439` in
`003zzgndm_004zak3cm_001`). The body is a cross-reference from
`docs/msc-research/sys46-script-parameter-atlas.md`, which catalogues
`func_302(value) -> sys_46(0x3, 0x4, 0x64, value, 0x64)` as
`set_movement_scale_channel_4_y` — the only component carrying the passed value
is the middle axis — and rates sub-command `0x3` at high confidence; it is
corroborated with a unit and line by
`docs/param-research/2026-07-25-speedparam-grade-g89ab.md`
(`001gundam_001gundam_001 2.c:7247 func_302`). The dimensional contradiction is
twofold. First, the two flanking components are the literal `0x64` and the field's
own spread is 70–80 (`docs/param_field_analysis.md`), so the field is a per-axis
percentage on a 0–100 scale with 100 as the identity, not a scalar that scales a
speed as a whole; a name of the form `*_speed_rate` describes an isotropic
multiplier and cannot describe a value whose two sibling axes are explicitly
pinned neutral. Second, and decisively, the shipped pool already names the field
that occupies **the identical argument of the identical wrapper**
`0xA55D6C5E vertical_axis_motion_retention`, carrying the inline marker
`[V:func_302] sys_46(3,4,0x64,V,0x64) percent ramp end`; the only difference is
that `0xA55D6C5E` arrives through the ease
`(0x64 - P) * (0x64 - func_274()) / 0x64 + P` at
`001gundam_001gundam_001 2.c:9122 func_407` while this field arrives flat at
`2.c:9034 func_406`. Two different canonical names for one movement-scale
component is an internal inconsistency in the pool, and the audited name wins.
The proposed key keeps the audited family vocabulary and uses `_base` — already
used in the pool for `speed_decay_base`, `boost_consumption_base` and
`ground_walk_entry_turn_time_base` — for the un-eased value, exactly parallel to
shard A's `uniform_axis_motion_retention_ramp_end` for the `func_300` analogue.
`guard` has no support anywhere in the corpus: the field is never read next to a
guard-state test, and its call site sits immediately before the handler group
that loads `boost_ascent_vertical_speed_initial` / `_terminal`
(`001gundam_001gundam_001 2.c:9131/9132 func_407`), though that adjacency is
inference and the proposed key deliberately encodes no action. Scope note: this
REJECT inherits the atlas's reading of sub-command `0x3`; if that reading were
withdrawn the verdict would fall back to OPEN with mode `(0x3, 0x4)` as the
unknown — but withdrawing it would also unname `0xA55D6C5E` and `0xDD7720EB`,
which the pool has already shipped on it. Basis: one call shape, 562 clone sites
collapsed.

**`0xE590DFE2` — `boost_dash_count` → `free_flight_vertical_magnitude`.** A
`*_count` name requires an `==` test or a switch, and across 612 sites the field
is never compared with anything. What it does instead is occupy a movement
magnitude position, in two structurally different shapes in unrelated units.
Shape 1, 570 clone sites collapsed: `var1 = S(0xe590dfe2);` then
`sys_46(0x1, 0x1, 0, 0x2328, var1);` at
`001gundam_001gundam_001 2.c:11390/11401 func_468`. Sub-command `0x1` is the
movement channel write, rated high confidence in
`docs/msc-research/sys46-script-parameter-atlas.md`, its second argument is the
channel (`func_44` clears channels `0x1`–`0x4` with
`sys_46(0x1, channel, 0, 0, 0)`), and the last of the three payload slots is the
magnitude — the same slot receives the literal `0x12c` in the atlas's `func_940`
example, `S(0x0B9EBECE)` (`decaying_move_magnitude_initial`, spread 0–500) at
`001gundam_001gundam_001 2.c:10397 func_440`, and `S(0x11FFDDB4) * 0x32 / 0x64`
at `2.c:9139 func_407`. Shape 2, a genuinely independent observation:
`global507 += S(0xe590dfe2); if (global507 < 0) global507 = 0;
sys_46(0x1, 0x2, global166, 0, global507);` at
`005vgundm_013gedlav_001 2.c:28035-28040 func_997`, where the field is a summand
on a magnitude register that is floored at zero and written to channel `0x2`. A
boost-dash count limit cannot be the magnitude argument of a movement channel
write in one handler and an additive term inside a movement magnitude in another;
that is the dimensional contradiction. The 0–8 spread over 2 distinct values
(`docs/param_field_analysis.md`) is what made the old `[0,8] BD count limit`
reading in `docs/command_mapping.md` look plausible, but it is also in range for
this slot, whose other occupants run 0–500 and include `0x7BF44A41` at 0–30. The
proposed key takes `magnitude` from the pool's existing neutral vocabulary
(`free_flight_magnitude_bound`, `free_flight_magnitude_floor`,
`decaying_move_magnitude_initial`) and `free_flight` from the handler group:
`func_468` sits between `func_467`, which loads `free_flight_magnitude_floor` and
`0xE2FD1BFB`, and `func_469`, which runs their ramp. `vertical` is inherited, not
proven here — it follows the pool's own reading of the channel-`0x1` angle
constants, where the mirrored `0xFFFFDCD8` (−9000, i.e. −90.00°) carries
`boost_ascent_vertical_speed_initial` at `2.c:9139 func_407` — and the REJECT
does not depend on it. Related cross-observation, offered because the brief asks
shard A about it: in Gedlav's replica of this handler group,
`0x7BF44A41` reaches this same `sys_46(0x1, 0x1, 0, 0x2328, var1)` slot at
`2.c:27842/27854 func_994` and `0x0CF37AD7` reaches the mirrored
`sys_46(0x1, 0x1, 0, 0xffffdcd8, …)` at `2.c:27859 func_994` — two arms of one
elevation branch inside a single function, which is not an
initial-plus-delta relationship.

## Still open

**`0x7D79F6FA` (`step_turn_high_speed_threshold`).** The role is fully determined
and is not in doubt: the field is the top rung of a descending four-way ladder in
`func_424`, each rung selecting a heading offset `var3` that is then subtracted
from or added to the heading accumulator `global265` at
`001gundam_001gundam_001 2.c:9974/9978`. The ladder is citable from the dump
alone — `2.c:9945` for this rung and `2.c:9947` for its adjustment
`S(0x4D601E55) * 0x64`, `2.c:9949/9951` for the middle rung `S(0x086B475D)` and
`S(0xEC580BCC) * 0x64`, `2.c:9953/9955` for the interpolated rung
`0x186 + 0x118 * var0 / S(0x86b475d)`, `2.c:9959` for the `0x3e8` fallthrough.
`turn`, `high` and `threshold` are therefore supported. `speed` is not: `var2` is
never defined inside the 60-line window, and the `* 0x64` scaling is the generic
whole-unit-to-centi-unit convention used identically for angles (`var3 =
S(0xec580bcc) * 0x64` becomes a centi-degree heading delta) and for magnitudes,
so it fixes nothing. Discriminating evidence needed: the identity of the runtime
accessor producing `var2`, recorded by the earlier source-reading pass as
`sys_0(0x40003, 0x1)`
(`docs/param-research/2026-07-25-speedparam-grade-gcdef.md`) — specifically
whether table `0x40003` index `0x1` returns current movement speed or a heading
error. Two further checks, neither decisive on its own, that a resolution should
be consistent with. (a) Value bands: this rung's spread is 280–380 and the middle
rung's is 40–60 (`docs/param_field_analysis.md`), so in centi-units the two
thresholds are 28000–38000 and 4000–6000. The upper band coincides exactly with
the pool's dash-magnitude family (`0xC6157381` 200–360, `0x5481CCF4` 140–330,
`0x607C25BC` 130–310) and the lower with its walk family (`0x7E5878A3` 20–80,
`0x9EAA4E96` 20–80, `0x3BF9E21E` 100), which is what one expects if `var2` is
speed; a heading-error reading is harder to sustain because 28000–38000
centi-degrees exceeds a full revolution. (b) Monotonicity: the emitted offsets run
25.00–35.00° in the top band, 15.00–25.00° in the middle, 3.90–6.70° just below
it and a fixed 10.00° at the bottom, so the offset grows with `var2`. That is the
wrong shape for a speed-limited turn *rate* and the right shape for a step whose
launch angle widens with speed — both readings survive (a), which is precisely why
the verdict cannot close on value ranges. Whatever resolves `sys_0(0x40003, 0x1)`
resolves `0x086B475D`, `0xEC580BCC` and `0x4D601E55` at the same time; shard A
holds the middle rung at OPEN on the same unknown and this verdict is kept
consistent with it. `step` is inferred from the `func_423`/`func_424`
entry-then-update neighbourhood, not proven. Basis: one call shape, 571 clone
sites collapsed.

**`0x9A378388` (`guard_recovery_frame`).** One consumer shape in the whole corpus,
`sys_46(0xf, 0x4, S(0x9a378388) * 0x64, 0x1)`, 571 clone sites collapsed, with the
field entering no arithmetic beyond the scale conversion and never being stored,
compared or decremented. The regenerated cross-function collection added nothing,
which is itself the finding. Because argument position proves nothing on its own,
the unknown to record is **mode `(0xf, 0x4)` in its four-argument form with the
trailing literal `0x1`**; `docs/msc-research/sys46-script-parameter-atlas.md`
lists sub-command `0xf` as "advanced movement parameter", 29 corpus uses, at its
*lowest* confidence tier with the explicit note that it needs native alignment,
and this is the only speedparam field that reaches it. A `*_frame` name requires a
counter initialiser, a `--`, or a `<= 0` test, and none of the three exists at any
of the 609 sites, so the shipped name is currently unsupported even though the
brief's rule keeps the verdict at OPEN rather than REJECT. The `* 0x64` factor
must not be read as evidence for `frame`: the same conversion seeds durations
(`global162 = S(0x84043A2D) * 0x64`, later `global162 = global162 - func_274()`
and `if (global162 <= 0)` at `001gundam_001gundam_001 2.c:10516/10553/10557`) and
equally produces the speed threshold above (`var2 > S(0x7d79f6fa) * 0x64`), so it
does not discriminate. Discriminating evidence needed, in order: (a) the native
handler for `sys_46` sub-command `0xf` with second argument `0x4`, which would say
whether payload one is a duration, an angle or a magnitude; (b) failing that, any
of the 29 corpus sites of sub-command `0xf` where the same payload slot receives a
register that is visibly decremented by `func_274()` or tested `<= 0`. Context,
not evidence: the spread is 0–60 over 3 distinct values
(`docs/param_field_analysis.md`), so many units pass zero, and the call sits in
`func_448` beside `sys_46(0x4, 0x4, S(0x06D1922D))` at `2.c:10716`, i.e. inside an
action-entry handler rather than a recovery timer loop.

**`0xB20B67C9` (`air_boost_efficiency`).** One consumer shape,
`sys_46(0x4, 0x4, S(0xb20b67c9))`, 571 clone sites collapsed, field as the sole
argument with no arithmetic anywhere. The unknown to record is **mode
`(0x4, 0x4)`**, which `docs/msc-research/sys46-script-parameter-atlas.md`
catalogues as "movement scale baseline" at medium-high — candidate, not proven —
confidence, 46 corpus uses, typically paired with `sys_46(0xe, 0x4, 0x190)` during
runtime initialisation and elsewhere fed from registers the atlas working-names
`melee movement scale baseline` (`global606`) and the special-movement baseline
(`global452`). Exactly four speedparam fields reach this one slot —
`0x06D1922D` (spread 0–100), `0x3BF9E21E` (100 constant), `0x7CD3A712` (50–60) and
this field (50–100) — each from a different action-entry handler
(`func_448`, `func_403`, `func_444`, `func_401`), and the same slot elsewhere
receives the literals `0x32`, `0x50` and `0x64`. That is a percent-shaped domain
with `0x64` as the identity, which at most one of the four shipped names can
survive, and an `*_efficiency` name specifically requires the value to multiply a
gauge or a velocity — there is no multiplication at any of the 609 sites, and a
movement scale baseline would multiply movement, not the boost gauge.
Discriminating evidence needed: (a) the native handler for sub-command `0x4` with
second argument `0x4`, which would say whether the argument is a percent scale on
the movement channel or a magnitude; (b) failing that, a non-`sys_46` consumer of
this field, which the corpus does not contain; (c) specifically for the shipped
name, any site where the value multiplies or decrements the boost gauge. Shard A
holds the three sibling fields at OPEN on the same unknown and this verdict is
kept consistent with them.
