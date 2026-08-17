# speedparam MSC consumer evidence (full corpus)

> **Corpus identity caveat (2026-08-01):** the stored crosscheck snapshot lacks
> a version/path/SHA manifest, counts parent-directory basenames rather than
> physical files, and predates the current corpus contents. Its MSC call-site
> arithmetic remains useful; its file counts and constant/varying claims must
> be regenerated before reuse.

Date: 2026-07-25
Method: mechanical extraction of every `sys_0(0x60006, entry, fieldHash)` call
site in the decompiled MSC corpus, plus real-file value spread. No AI reading,
no proximity inference.
Tool: `tools/param_msc_usage_scan.py`

## Why the existing names are suspect

`docs/msc-research/system-control-surface-matrix.md` states plainly where the
speedparam field names came from:

> 字段名来自 `docs/command_mapping.md` 的 `speed_param (041cpm, cmd=74,
> entry_size=304)`

That is a label list. `docs/speedparam-semantic-ledger.md` then recorded 49
fields as grade **A** citing MSC function numbers such as `func_424`. A function
number is a *location*, not a proof of meaning. The 2026-07-22 re-verification
already demoted 47 of those 49 to **open** because the arithmetic was never
re-opened. This document supplies the arithmetic.

## Corpus

| Measure | Value |
|---|---:|
| MSC `.c` files scanned | 1827 |
| Unit directories | ~400 |
| `sys_0(0x60006, …)` call sites | 5149 in a 40-unit slice; full-corpus scan covers all 1827 files |
| Distinct field hashes read | **64** |
| Fields present in `speedparam.bin` | **74** |
| Unique real `speedparam.bin` files parsed | 21 |

Table binding `0x60006 ↔ speedparam.bin` is proven at 64/64 overlap; see
`docs/param-table-id-file-binding-proof.md`.

## Closed: the 8-field "U set" is real, and 6 of them are inert

`docs/agent-sessions/2026-07-22-param-deep-reverify-results.md` listed 8 grade-U
hashes with "no Gyan consumer" and noted the multi-unit sweep was never
completed. The sweep is now complete over ~400 units.

Exactly 10 of the 74 speedparam fields are read by **no MSC script anywhere in
the corpus**. Eight are numeric, two are the kind-7 label fields:

| Hash | kind | distinct values across 21 real files | Pre-audit name (unsupported) |
|---|---:|---:|---|
| `0x0B6480D5` | 2 | **1** | `walk_speed_backward` |
| `0x0D5BB2EF` | 2 | 2 | `boost_recovery_speed` |
| `0x29AA8A04` | 2 | **1** | `gravity_modifier` |
| `0x2C76D0A7` | 2 | **1** | `movement_class` |
| `0x2EAE942B` | 2 | 2 | `boost_dash_sustained_speed` |
| `0x56C51E87` | 2 | **1** | `air_dash_end_speed` |
| `0x8173DA19` | 2 | **1** | `jump_type` |
| `0xA7CBBC07` | 2 | **1** | `fixed_step_distance` |
| `0xE6213731` | 7 | 15 | `action_label` (structural, legitimate) |
| `0xF3C4CAE9` | 7 | 20 | `resource_label` (structural, legitimate) |

Six of the eight numeric fields are **constant across every real file sampled**.
A field with no reader and no data variation cannot be named from evidence at
all. Their current names are invention and should be replaced with neutral keys.

Grade: **U confirmed, upgraded evidence base** — the negative result is now
corpus-wide rather than Gyan-only.

## Rejected: `0x97BE8DFC` is not `step_cancel_frame`, and `0x7C2572A1` is not `rotation_speed`

Ledger claims: `0x97BE8DFC` = `step_cancel_frame` (grade A, cite `func_392..393`),
`0x7C2572A1` = `rotation_speed` (grade A, same cite).

Observed reality across the corpus:

| Measure | Value |
|---|---:|
| call sites | 609 |
| distinct units | ~370 |
| distinct call-text shapes | 45 |
| distinct arithmetic shapes | **1** |
| duplicate clone sites collapsed | 564 |

Every site is the same expression, differing only in which global index the unit
happens to use:

```c
global162 = (global266 * sys_0(0x60006, global142, 0x97be8dfc) / 0x4650
             + sys_0(0x60006, global142, 0x7c2572a1)) * 0x64;
```

The destination is then consumed **in the next function**, which is why the
original evidence pass missed it:

```c
8591 [func_393]: if (global162 > 0)
8615 [func_393]: global162 -= func_274();
8616 [func_393]: var1 = func_102(global265, global162, 0);
8628 [func_393]: if (global162 <= 0)
```

`global162` is a countdown timer: seeded once, decremented by the frame step
`func_274()`, passed to `func_102` as remaining time, and tested for expiry.
Therefore the whole expression is a **duration in frames**, fixed-point ×100.

With `0x4650` = 18000 = 180.00° expressed in centi-degrees, the shape reads:

```
durationFrames = angleError/18000 * framesPer180Deg + baseFrames
```

| Hash | Ledger name | Verdict | Evidence-grounded reading |
|---|---|---|---|
| `0x97BE8DFC` | `step_cancel_frame` | **REJECT (R)** | frames required per 180° of heading error |
| `0x7C2572A1` | `rotation_speed` | **REJECT (R)** | base duration in frames, added to the angle-proportional term |

Neither is a frame count in the sense the ledger meant, and neither is a speed.
A rotation *rate* and a rotation *time* are reciprocals; the ledger named the
base term of a duration as a speed.

### Three corroborating loads into the same timer

The same `global162` register is seeded elsewhere in the same file by other
speedparam fields, which independently fixes their dimension as time:

```c
9264: global162 = global266 * sys_0(0x60006, global142, 0xc6bbc347) / 0xb4;
9819: global162 = sys_0(0x60006, global142, 0x4f705bad) * 0x64;
9824: global162 = sys_0(0x60006, global142, 0x7c3cf4dd) * 0x64;
```

| Hash | Ledger name | Verdict | Reading |
|---|---|---|---|
| `0xC6BBC347` | `fall_speed_rate` | **REJECT** | angle→time conversion, `0xb4` = 180 |
| `0x4F705BAD` | `step_recovery_frame` | consistent | loaded directly as a duration; the `_frame` dimension holds |
| `0x7C3CF4DD` | `gauge_recovery_rate` | **REJECT** | a duration in frames, not a gauge rate; no gauge appears anywhere |

Evidence files: `tmp/param-evidence/full/fields/t60006_{97be8dfc,7c2572a1,c6bbc347,4f705bad,7c3cf4dd}.txt`.

## Aggregate grading result — 64 MSC-read fields

Every one of the 64 read hashes was graded against its own evidence file. Prior
names were treated as hypotheses throughout.

| Verdict | Count | Share |
|---|---:|---:|
| CONFIRM | **8** | 12.5% |
| REJECT | **49** | 76.5% |
| OPEN | **7** | 11% |

> **Read this correctly: the 46 REJECT verdicts are against
> `docs/speedparam-semantic-ledger.md`, not against shipped code.** That ledger is
> pre-audit. `src-tauri/src/format/speedparam.rs` had already been corrected for
> most of these fields, and its keys agree with the verdicts here. Mechanical
> reconciliation (`tools/param_name_reconcile.py`) gives the honest split:
>
> | | Count |
> |---|---:|
> | Rust key differs from ledger key | 49 of 74 |
> | of those, Rust already correct and ledger stale | 40 |
> | Rust key still ungrounded, now fixed | 14 |
>
> The authoritative evidence state is `docs/param-evidence-registry.tsv`, enforced
> by `tools/check_param_name_evidence.py`.

Combined with the 10 unread fields, the picture for all 74 speedparam fields is:

| Class | Count | Meaning |
|---|---:|---|
| CONFIRM | 8 | name not contradicted, role matches, ≥2 unrelated units |
| REJECT | 49 | arithmetic contradicts the name |
| OPEN | 7 | consumer exists, arithmetic does not discriminate |
| U | 8 | no reader anywhere in ~400 units; 6 also constant in all 21 real files |
| S | 2 | kind-7 label offsets, structurally legitimate |

**At most 10 of 74 speedparam field roles are defensible (8 numeric + 2
structural labels).** The dominant failure
mode is dimensional: fields named `*_frame` that are multipliers, fields named
`*_speed` or `*_distance` that are magnitude accumulator seeds or floors, fields
named `*_type` that are never equality-tested, and fields named `*_rate` that are
durations. That pattern is what a name list transplanted onto a hash table
produces, and it is why none of these names should have carried grade A.

Per-group detail, with literal arithmetic and citations per hash:

| Group | Hashes | Report |
|---|---:|---|
| leading 0–1 | 8 | `docs/param-research/2026-07-25-speedparam-grade-g01.md` |
| leading 2–4 | 11 | `docs/param-research/2026-07-25-speedparam-grade-g234.md` |
| leading 5–7 | 16 | `docs/param-research/2026-07-25-speedparam-grade-g567.md` |
| leading 8–b | 13 | `docs/param-research/2026-07-25-speedparam-grade-g89ab.md` |
| leading c–f | 16 | `docs/param-research/2026-07-25-speedparam-grade-gcdef.md` |

### `0x7BF44A41` / `0x0CF37AD7` no longer sustain grade A

These were the only two speedparam fields left at grade A after 2026-07-22, on
the claim `initial + delta = terminal` with real rows `30 + 320 = 350`. Grading
against the evidence file demoted both:

- The relation is not visible in the consumer lines; the composition is a floor
  clamp with a per-update re-seed, not a converging `min`.
- `30 + 320 = 350` satisfies a floor reading and a cap reading identically, so it
  does not discriminate.
- The handler's only consumers are Gedlav, Bertigo, GP01FB and G-Arcane; the rows
  previously cited as corroboration belong to units that do not run it.

The later open-14 regrade supersedes that intermediate result. `0x7BF44A41` is
CONFIRM for the accumulator seed/re-seed role, while `0x0CF37AD7` remains a
REJECT of its historical timer name and is fixed to the per-update delta role.
Neither report proves the former `alternate_free_flight` qualifier, so the
canonical keys are now `floored_move_magnitude_seed` and
`floored_move_magnitude_delta`. The pre-audit name `air_steer_limit` is
positively unsupported: the limit/floor slot in this expression is
`0x95FA2B6D`.

## Status of the remaining fields

### 2026-08-01 native closure of five former OPEN fields

The native `sys_46` handler now closes both previously unknown modes. Case 4
scales the selected movement channel's engine-owned base vector by the third
argument as a percentage. Case F initializes a current-vector-to-zero-vector
transition whose third argument is the duration and whose fourth argument is a
curve selector. This resolves `0x06D1922D`, `0x3BF9E21E`, `0x7CD3A712`,
`0xB20B67C9`, and `0x9A378388` at the mechanism level. The former two-field
heading-ladder OPEN set is also closed: native `sys_0(0x40003, 1)` returns the
current target's horizontal X/Z distance multiplied by 100. The two fields are
therefore middle/high distance thresholds, and their paired outputs are heading
step sizes. See the two `2026-08-01-speedparam-native-*` reports under
`docs/param-research/`. No MSC-read speedparam field remains grade C.

Each of the 64 MSC-read hashes has a self-contained evidence file at
`tmp/param-evidence/full/fields/t60006_<hash>.txt` containing every distinct call
shape and the raw lines that consume the loaded value, with unit, `file:line` and
enclosing-function citations. Consumer collection deliberately crosses function
boundaries, because MSC loads a value in one `func_*` and consumes it in a later
one through a file-scope global.

Grading rule applied:

| Verdict | Requirement |
|---|---|
| **CONFIRM** | arithmetic role is consistent with the name, reproduced across ≥2 unrelated units, and no competing reading fits |
| **REJECT (R)** | arithmetic role contradicts the name |
| **OPEN** | consumer exists but the arithmetic does not discriminate between candidate meanings |
| **U** | no consumer anywhere in the corpus |

MSC arithmetic alone caps a field at grade **B** even when it CONFIRMs: the
verdict means "not contradicted and role matches", never "proven canonical".
Promotion past B requires real-file values satisfying the implied relation across
≥2 units, or a native consumer confirming the same formula.

## Reproduction

```powershell
python tools\param_msc_usage_scan.py --root E:\XB\mod\040msc ^
  --table 0x60006 --out tmp\param-evidence\full --window 40 ^
  --split-by-field --split-max-sites 30 --no-json
python tmp\param-evidence\run_crosscheck.py
python tmp\param-evidence\q.py speed-unread
```
