# Bug Report + TODO: MSC `0.c` Action Thinker Function-Pointer Offset Breakage

**Date:** 2026-08-13  
**Unit / tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\`  
**Primary file:** `0.c`  
**Related:** form-mode (bird / `global143=0x2`) action gating vs TV `028gunwtv_001gunwtv_001\0.c`  
**Status:** Thinker offset fixed (`func_143` symbol). Bird-form main-shot leak fixed 2026-08-14 (bit layout); **canonical write-up:** `docs/msc-research/wing-zero-rebellion-bird-form-0c-input-map.md`

---

## 1. Bug report

### 1.1 Title

Repacking modified `0.c` yields **no usable actions** (no movement/attacks), because a **hardcoded script offset** for the action-thinker registration is not relocated by the default MSC Python compile path.

### 1.2 Severity

| Item | Value |
|------|--------|
| Severity | **Critical** (unit unplayable after repack) |
| Scope | Any `0.c` that registers the action thinker as a **numeric constant** instead of a function symbol |
| Blast radius | Entire input → action pipeline in `0.c` |

### 1.3 Symptoms

After editing `0.c` (form-mode gating) and repacking:

- Unit cannot perform normal operations.
- **No actions** fire (idle / attack / movement actions appear dead).
- Behavior is consistent with a **broken function pointer** at action-thinker registration, not with a simple form-gate logic error (which would more likely only affect bird form).

### 1.4 Expected vs actual

| | Expected | Actual |
|--|----------|--------|
| Normal form (`global143` / `global39` == 0) | Full normal action map | No actions |
| Bird form (`global143` == 0x2 → `global39` != 0) | Restricted flight actions (no ground melee) | No actions (same broken path) |
| After repack with body-size changes before thinker | Thinker still points at correct function | Thinker still holds **stale offset** `0x5fef` |

### 1.5 Reproduction

1. Open `wing_gundam_zero_rebellion_msc\0.c` containing:

   ```c
   sys_1(0x10001, 0, 0x1, 0x5fef);  // decompiled opaque offset
   ```

2. Enlarge any function **before** the action-thinker target (historically `func_143`), e.g.:
   - add form gates / early returns in `func_15`–`func_20`
   - expand `func_143` body
3. Repack with **default** Python MSC path (**without** `--exvsMapping`).
4. Load unit in-game.
5. Observe: **no actions**.

### 1.6 Root cause

#### A. Opaque constant is the action thinker

In `0.c` init (`func_92`):

```c
sys_1(0x10001, 0, 0x1, 0x5fef);  // BEFORE fix
```

Runtime consume site (think path):

```c
var0 = sys_0(0x10001, 0, 0x1);
// ...
(*var0)();   // must be the input→action mapper (func_143)
```

`0x5fef` is a **script-base-relative entry offset** of the original decompile target (semantically `func_143`), **not** a stable API id.

#### B. Default compiler path does not relocate opaque ints

| Source form | Default `msclang` behavior | Body growth before target |
|-------------|----------------------------|---------------------------|
| `func_143` (symbol) | Resolved via `scriptPositions[func_index]` each compile | **Safe** |
| `0x5fef` (int constant) | Emitted as raw integer | **Stale → broken** |
| `func_83(0x1, func_15)` | Symbol path | **Safe** |

Relevant compiler behavior (`tools/msclang.py`):

- `c_ast.ID` named like `func_143` → push function name → `resolveReferences()` writes **current** script position.
- Bare `Constant` int → remains integer **unless** optional EXVS native-truth mapping is loaded.

#### C. Optional relocation pipeline exists but is not default / not seeded for this unit

Documented workflow:

- `docs/exvs-native-truth-mapping-workflow.md`
- Runtime: `tools/exvs_native_truth.py`
- Flags: `mscdec.py --exvsMapping`, `msclang.py --exvsMapping`

Intended:

- decompile: constant → symbol (`function_ref`)
- compile: symbol → new offset (or `script_delta` relocation)

Reality at time of report:

- Mapping is **optional** (must pass `--exvsMapping`).
- Documented seed path `tools/mappings/exvs_0xF1EF3B32.native_truth.json` is **not present** under `tools/mappings/` in this repo state.
- Daily Rebellion repack almost certainly runs **without** mapping → `0x5fef` never becomes a relocatable symbol.

#### D. Why form-mode work triggered the bug

Form-mode work intentionally enlarged code **before / inside** the thinker:

| Change | File | Effect on layout |
|--------|------|------------------|
| Bird gate in `func_15` | `0.c` | Grows early scripts |
| Bird return-0 in `func_16`–`func_20` | `0.c` | Grows early scripts |
| Form-split body in `func_143` | `0.c` | Moves / grows thinker |

Any of these shifts later entry offsets while `0x5fef` stays fixed → thinker registration points at wrong code → **global action death**.

### 1.7 Related product context (not the crash root, but why we edited `0.c`)

**Goal:** Match TV Wing (`028gunwtv_001gunwtv_001`) flight form behavior so bird form cannot fire normal ground melee/attacks.

| Layer | Mechanism |
|-------|-----------|
| `2.c` | Publishes form: `sys_1(0x10000, 0, 0x17, global143)` (bird = `0x2` on Rebellion; TV bird = `0x1`) |
| `0.c` `func_4` | Reads form: `global39 = sys_0(0x10000, 0, 0x17)` every frame |
| TV `func_143` | `if (global39 == 0) { normal map } else if (global39 == 0x1) { flight map }` |
| Rebellion before fix | Single unsplit `func_143` → bird still used full normal map |

Form gating itself is a **feature**; the unplayable unit after repack is the **offset bug**.

### 1.8 Fix applied in source (pending user re-verify)

In `wing_gundam_zero_rebellion_msc\0.c` `func_92`:

```c
// BEFORE (broken under body growth)
sys_1(0x10001, 0, 0x1, 0x5fef);

// AFTER (compiler relocates)
sys_1(0x10001, 0, 0x1, func_143);
```

Form-mode gates remain in `func_143` / `func_15`–`func_20` as product work.

### 1.9 Impact / risk matrix

| Risk | Detail |
|------|--------|
| Silent unplayable unit | Opaque offsets look “valid” in C but are layout-sensitive |
| False blame on form logic | Symptoms look like “gating blocked everything” |
| Other opaque tables | `sys_1(0x10002, …)` 4th args may be table payloads **or** layout-sensitive; treat as suspect until classified |
| Multi-unit debt | Any `0.c` still carrying `sys_1(0x10001, 0, 0x1, 0xNNNN)` has same landmine |

### 1.10 Environment / toolchain notes

| Component | Role |
|-----------|------|
| `tools/mscdec.py` | Decompile; optional `--exvsMapping` symbolization |
| `tools/msclang.py` | Compile; symbol refs relocate; opaque ints need mapping |
| `tools/exvs_native_truth.py` | Mapping model (`function_ref`, `script_delta`) |
| `tools/msc_cfg.py` | Syscall arg shapes for CFG (includes `(0x10001, 0x02)` etc.) |
| Default agent/user repack | Typically **no** `--exvsMapping` |

### 1.11 Verification criteria (post-fix)

1. **Repack** current `0.c` only (with `func_143` symbol, not `0x5fef`). Do **not** put form gates in `2.c` `ACTION_*` — TV Zero only form-splits `0.c` `func_143`.
2. **Normal form** (`global143 == 0`): walk, melee, shot, boost work.
3. **Bird form** (`global143 == 0x2`):  
   - main / sub / special / melee **not** started from thinker map  
   - transform loop / partner path only (no Rebellion bird weapon hashes yet)  
4. Optional stress: add a no-op / comment-only size change before `func_143`, repack again → still playable.

### 1.13 2026-08-14: main-shot still fired — bit-layout mistake (0.c only)

**Wrong approach (reverted):** hard-return inside `2.c` `ACTION_A_SHOT` / sub / special / melee. TV Zero does **not** do that; form control is only `0.c` `func_143` (`global39` branch).

**Real leak:** Rebellion thinker bits ≠ TV bits.

| Input bit | Rebellion (`func_143` / `2.c` register) | TV Zero |
|-----------|------------------------------------------|---------|
| `0x1` | **main shot** `0x7cd11119` → `ACTION_A_SHOT` | idle |
| `0x100` | special shot | **main shot** |
| `0x80` | sub shot | boost-style flight map |

Earlier bird branch “blocked `0x100`” (TV main-shot bit) but **kept** `global48 & 0x1` → `func_95(0x7cd11119)` — so main shot still fired in bird form.

**Fix (0.c only):** bird branch of `func_143` no longer maps `0x1` / `0x2` / `0x80` / `0x100` / `0x200` / `0x800` / dir-melee. Partner `0x400` path kept. All `2.c` `ACTION_*` form returns reverted.

### 1.12 Non-goals (this report)

- Full TV bird action-hash parity (every TV `func_95` hash).
- Changing Rebellion bird form id `0x2` → TV `0x1` (table index alignment) — open TODO.
- Implementing complete native-truth mapping pack for Rebellion `0.c`.

---

## 2. TODO

### 2.1 Immediate (user / agent)

| ID | Task | Owner | Status |
|----|------|-------|--------|
| T1 | Re-repack `0.c` with `sys_1(0x10001, 0, 0x1, func_143)` | User | **Done** (playable after symbol fix) |
| T2 | In-game: normal form full control | User | **Done** |
| T3 | In-game: bird form no main shot (0.c bit map; not 2.c ACTION_*) | User | **Done** 2026-08-14 — see `docs/msc-research/wing-zero-rebellion-bird-form-0c-input-map.md` |
| T4 | If still dead: capture repack command line (mapping on/off) + compiler log | User/Agent | N/A after T1 |

### 2.2 Toolchain hardening

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T5 | Inventory all `0.c` / `2.c` under `040msc` for `sys_1(0x10001, 0, 0x1, 0x…)` opaque thinker regs | High | **Done (code)** — `python tools/check_msc_opaque_func_ptrs.py --scan-dir <dir> --inventory` |
| T6 | Add static check: fail if action-thinker 4th arg is integer constant instead of function symbol | High | **Done (code)** — `tools/check_msc_opaque_func_ptrs.py` (+ unit tests) |
| T7 | Document agent rule: never leave opaque script offsets for function pointers when editing MSC C | High | **Done** — `AGENTS.md` Development Conduct |
| T8 | Restore or generate `tools/mappings/*.native_truth.json` for EXVS `0.c` families | Medium | Open |
| T9 | Make `mscdec` default (or strongly recommend) symbolizing known `function_ref` sites when mapping available | Medium | Open |
| T10 | Classify `sys_1(0x10002, …)` 4th operands: pure table ids vs layout-sensitive deltas | Medium | Open |
| T11 | Unit tests for opaque-offset gate + rewrite | Medium | **Done (code)** — `tools/check_msc_opaque_func_ptrs_test.py` |

### 2.3 Product / form-mode follow-ups (Rebellion)

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T12 | Confirm bird form should stay `global143 = 0x2` vs align to TV `0x1` for `func_100` form tables | Medium | Open |
| T13 | Tune bird `func_143` allowed actions (which shot/boost/step hashes) after playtest | Low | Open |
| T14 | Gate additional handlers if playtest still leaks ground-only moves | Low | Open |
| T15 | Session: bird transform still only needs `2.c` form publish (already present); no change required unless T12 | Info | Done (publish path exists) |

### 2.4 Documentation / handoff

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T16 | This file as canonical handoff for the offset bug | — | **Done** |
| T17 | Cross-link from `docs/exvs-native-truth-mapping-workflow.md` “failure mode: repack without mapping + opaque 0xNNNN” | Low | Open |
| T18 | Optional: short note in `docs/msc-system-problems-analysis.md` pointing here | Low | Open |

---

## 3. Quick reference

### 3.1 Critical line

```c
// wing_gundam_zero_rebellion_msc/0.c  — func_92
sys_1(0x10001, 0, 0x1, func_143);  // MUST be symbol, never bare 0x5fef after body edits
```

### 3.1b Gate / fix commands (implemented 2026-08-14)

```powershell
# Fail closed on opaque thinker offsets
python .\tools\check_msc_opaque_func_ptrs.py "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c"

# Inventory a whole MSC tree
python .\tools\check_msc_opaque_func_ptrs.py --scan-dir "E:\XB\mod\040msc" --glob "**/0.c" --inventory

# Rewrite known bad offsets → func_143
python .\tools\check_msc_opaque_func_ptrs.py "path\to\0.c" --fix --write

# Unit tests
python .\tools\check_msc_opaque_func_ptrs_test.py
```

### 3.2 Form mirror

```text
2.c:  sys_1(0x10000, 0, 0x17, global143)   // bird = 0x2 on Rebellion
0.c:  global39 = sys_0(0x10000, 0, 0x17)   // each frame in func_4
0.c:  func_143 / func_15..20 gate on global39 != 0
```

### 3.3 Safe vs unsafe edit patterns

```c
// SAFE under recompile
sys_1(0x10001, 0, 0x1, func_143);
func_83(0x2, func_16);

// UNSAFE if any earlier function body size changes (default msclang)
sys_1(0x10001, 0, 0x1, 0x5fef);
```

### 3.4 Related docs

| Doc | Use |
|-----|-----|
| `docs/exvs-native-truth-mapping-workflow.md` | Optional mapping pipeline |
| `docs/msc-binary-format-spec.md` | Script offset table semantics |
| `docs/msc-system-problems-analysis.md` | Historical hardcoded-pointer issues |
| `docs/exvs-msc-input-action-weapon-pipeline.md` | Input / action registry background |

---

## 4. Decision log

| When | Decision |
|------|----------|
| 2026-08-13 | Form gating implemented in `0.c` (TV-like), not only analysis |
| 2026-08-13 | Identified unplayable-after-repack as **opaque thinker offset**, not form logic alone |
| 2026-08-13 | Source fix: register thinker as `func_143` symbol |
| 2026-08-13 | Mapping path acknowledged as real but **not default / not seeded** for this unit |
| 2026-08-13 | This report + TODO recorded for handoff |

---

## 5. Remaining work (one glance)

1. **User:** repack + in-game verify (T1–T3).  
2. **Agent/tooling:** ban opaque thinker constants (T5–T7, T11).  
3. **Optional product:** form id `0x1` vs `0x2` alignment and flight action tuning (T12–T14).

---

## 6. Follow-up (2026-08-13 later): bird form still firing normal main/sub/melee

### Why first form gate failed product-wise

TV Zero has **two real routes**:

| Layer | TV bird enter (`func_1078`) | Rebellion bird (current) |
|-------|----------------------------|---------------------------|
| Form id | `global143 = 0x1` | `global143 = 0x2` |
| Action/motion tables | **Rewrites** `sys_1(0x10001, 0x3/0x4, …)` to bird resources | **Does not** swap tables |
| `0.c` `func_143` | Separate button→hash map for form 1 | Added form branch, but still mapped shot/sub to **normal** hashes |

**Primary action path is not only `func_143`:**

```text
func_8 → func_9 → func_42 → func_77/63/59/67
  → sys_0(0x10000, 0x1, SLOT) → NORMAL form action hashes from 0.c registry
func_10 publishes global49 as pending action for 2.c
```

`func_143` only affects the secondary thinker path (`sys_0(0x10001,0,0x1)`).  
So blocking melee only in `func_143` left **main shot / sub / special** fully alive via `func_42`.

### Fix applied (same day)

| Site | Bird form (`global39 != 0`) behavior |
|------|--------------------------------------|
| `func_42` | **return 0** — skip entire normal arsenal resolver chain |
| `func_41` | **return 0** |
| `func_15` | **return 0** (no slot 0x18 fallback that could still be an attack) |
| `func_16`–`func_20` | already return 0 |
| `func_143` flight branch | **removed** mappings for `0x100` main / `0x200` sub / `0x1000` special; keep partner / boost / step / idle / guard only |

### Still open (true TV parity)

| ID | Task |
|----|------|
| T19 | Port TV-style **resource table swap** on bird enter/exit (`sys_1(0x10001, 0x3/0x4, …)`) if bird should have its own shot set later |
| T20 | Optionally align bird form id `0x2` → TV `0x1` for form capability tables |
| T21 | Playtest: boost/step still OK in bird; main/sub/special/melee dead |

### Repack note

Any further `0.c` body growth: keep `sys_1(0x10001, 0, 0x1, func_143)` as **symbol**, never reintroduce `0x5fef`.
