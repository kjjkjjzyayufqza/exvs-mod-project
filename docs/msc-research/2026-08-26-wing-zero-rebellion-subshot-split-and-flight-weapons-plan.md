# Wing Zero Rebellion: Ground Sub-Shot Split + Flight Sub / Special

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Hotreload:** Canonical copy. `vite.config.ts` already ignores `**/docs/**`, so `tauri dev` will not full-reload. Do not put this plan under `src/`, `.claude/plans/`, or any Vite-watched tree.

**Goal:** Split Rebellion ground sub-shot at selector time into homemade N+left/right vs a front/back assist stub, fill bird-form sub (untransform + motion stub) and bird-form special (keep form, 足止 gerobi on the bird loop clip).

**Architecture:** `0.c` `func_143` owns input-bit → action-hash. `2.c` `func_241` owns hash → ACTION. Each ACTION is a vanilla `func_593` quartet (`676` start / `677` shoot / `678` no_ammo / `679` end). Only bird-form hashes that must **keep** form go on the `func_41` allowlist (flight special). Flight sub **untransforms** and stays off that list. Hit/interrupt stays FORCED_RECOVERY.

**Tech Stack:** EXVS2 MSC (`0.c` / `2.c`), `func_593` ranged driver, existing Rebellion homemade sub-shot and bird-main 足止 recipe, TV `028gunwtv_001gunwtv_001` flight sub, Lightning `053gbftry_003ltngfb_001` 足止 flag.

**Status:** Mapping locked 2026-08-26. Ground N+left/right = homemade; ground front/back = assist stub; flight sub = untransform + shoot stub; flight special = 足止 gerobi on loop `0x9de587ce` with ALT_2 pair `CDA9F55A/B`. MSC comments use `Future work:`, never `TODO`/`FIXME`. Do not edit MSC until the user says to implement.

**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c` (and sibling `0.c`)

---

## Requirements restatement

### Feature A — Ground sub-shot direction split

Current homemade `SUB_SHOT_CUSTOM` (`0x23df217e`) plays the same start/shoot/no_ammo/end for every stick direction. Vanilla `ACTION_AB_SUB` already sampled `global87` into `global200` (N / 前后 / 左右) but those branches are empty, and `0.c` no longer uses that handler.

Required (updated 2026-08-26):

- Distinguish **from ACTION entry**, not a late `global200` branch inside one shared ACTION.
- **Homemade** = N + left + right (`global2 & 0x0c` is clear). Keep current `SUB_SHOT_CUSTOM` logic, motion `0xa0cd8d56`, bullets `0x7c054fae` / `0x860a72cd`.
- **Assist stub** = front + back only (`global2 & 0x0c` = `0x4 | 0x8`). Full `func_593` quartet that immediately exits. `Future work:` 召唤援护. No homemade clip, no ammo consume in v1.
- **N is homemade**, same ACTION as 左右. 前后副射才是援护. Locked.
- `global678` is no-ammo, not cancel. Stubs still name the 678 callback `*_no_ammo`.

### Feature B — Flight / bird-form sub-shot

Bird `func_143` currently has **no** `0x80` mapping. Wiki/TV reference:

- TV 变形サブ is one command regardless of stick direction.
- TV splits that command by **TBR charge level**, not direction (`global48 == 0 / 0x2 / else` → three hashes). Rebellion has no TBR charge on sub, so **one** flight-sub ACTION.

Wiki: [EXVS2OB ウイングガンダムゼロ](https://w.atwiki.jp/exvs2ob/pages/159.html)

| TV flight sub | Ammo | Notes |
|---------------|------|-------|
| Lv.1 ツインバスターライフル【狙撃】 | 1 | 変形解除して単発ダウンビーム |
| Lv.2+ ツインバスターライフル【狙撃照射】 | 1 | 低性能な照射ビーム |

**Locked (2026-08-26):** copy TV Lv.1 **変形解除**. One hash, no stick split, no TBR charge split. Untransform at ENTER via `rebellion_interrupt_bird_form_to_ground()` (hash stays **off** the `func_41` keep-form allowlist). The post-untransform **shooting motion is a stub** (`Future work:` 取消变形后的射击动作). Do not play homemade `0xa0cd8d56` here.

### Feature C — Flight / bird-form special-shot

Bird `func_143` currently has **no** `0x100` mapping. Ground N-特射 (`0x20923fb6` / `ACTION_AC_SPECIAL_SHOT_ALT_2`) is a different weapon (tap followup gerobi) and must not be reused as the flight special.

Wiki: [EXVS2OB ライトニングガンダムフルバーニアン](https://w.atwiki.jp/exvs2ob/pages/353.html)

> 変形特殊射撃 ハイビームライフル【照射】— 足を止めて照射ビームとミサイル
> 変形状態のままハイビームライフル(HBR)、2連装ビームキャノン(BC)からの照射ビームとミサイルを発射。

**Locked (2026-08-26):** copy Lightning **足止 + gerobi** behavior, not Lightning's table-driven `sys_41` / `0x700000` weapon VM. Play bird **loop** `0x9de587ce` on the **action handle** (`func_308`), matching `ACTION_A_SHOT_BIRD`. **Never** `func_76(0x38)`. Gerobi pair is ground ALT_2 **`CDA9F55A/B`**. Missiles are optional later. Task 2 still proves those ids exist on the current-target bird muzzle; it does not pick a different pair.

---

## Current target (do not rediscover)

### Ground sub today

| Layer | Evidence |
|-------|----------|
| `0.c` `func_143` normal | `global48 & 0x80` → always `func_95(0x23df217e, 0x1, 0x401, 0x7)` |
| `2.c` `func_241` | `0x23df217e` and homemade `0x53554243` ("SUBC") both → `SUB_SHOT_CUSTOM` |
| Unused vanilla | `0x7c1d57c2` still → `ACTION_AB_SUB_ALT_2` (assist leftover; `0.c` no longer submits it) |
| Driver | `func_586` + `676..679` + `callFunc3(sub_shot_custom_tick)` → `func_593()` |
| Motion / bullets | `0xa0cd8d56` / `sys_4F(0, 0, 0x7c054fae)` + `sys_4F(0, 0, 0x860a72cd)` |
| Ammo | `global681 = 0x1` |
| Aim | start-only `rebellion_sub_shot_custom_aim`; shoot/end call `stop_aim`. Do not call `rebellion_alt2_*` |

Vanilla `ACTION_AB_SUB` (still in file, unwired) already encoded the user's split as `global200`:

```text
global87 & 0x4  → 0x1   // front
global87 & 0x30 → 0x2   // left/right
global87 & 0x8  → 0x1   // back
else            → 0     // N
```

`func_908` then has empty `if (global200 == 0x2 / 0x1 / else)` bodies. That is the pattern we **replace** with two ACTION functions.

### Bird form today (empty weapons)

`0.c` bird branch (`global39 != 0`) currently maps:

| Bit | Hash | Status |
|-----|------|--------|
| `0x1` | `0x476fac14` | bird main, keep form |
| `0x800` | `0x2194f05d` | CSA clone of bird main |
| `0x200` | TV landing hashes | special melee |
| `0x2` | `0x928ca34f` | N melee followup |
| `0x80` | **missing** | this plan, flight sub |
| `0x100` | **missing** | this plan, flight special |

`2.c` `func_41` allowlist (keep `global143 = 0x2`) is only:

```text
0x9475130e  enter
0x77b100ff  loop
0xa02d57dc  exit
0x476fac14  bird main
0x2194f05d  bird CSA
```

Any new bird-form shooting hash **not** on this list is torn to ground on the first `func_41` tick. That is why an ENTER-only 2.c ACTION would look like “detach never ran”.

### References (read, do not copy blindly)

| Need | File | What to take | What not to take |
|------|------|--------------|------------------|
| 593 quartet | `docs/msc-research/func593-vanilla-ranged-slots.md` | 676/677/678/679 names | treating 678 as cancel |
| Ground sub aim | `docs/msc-research/sub-shot-custom-start-only-aim.md` | start-only aim + `stop_aim` | `rebellion_alt2_*` |
| Selector vs ACTION | `docs/msc-research/wing-zero-rebellion-bird-form-0c-input-map.md` | only `func_143` gates arsenal | `ACTION_*` form `return` |
| Form vs action | `docs/msc-research/wing-zero-rebellion-flight-interrupt-form.md` | FORCED_RECOVERY; allowlist | requeue `0x77b100ff` |
| 足止 recipe | `ACTION_A_SHOT_BIRD` in target `2.c` | `689=-1`, `452/453/454=0`, no `func_884` | `func_586` default yaw / `func_302` rush |
| TV flight sub | `028gunwtv` `ACTION_AB_SUB_ALT_3` | one command, 593 quartet, start `func_897(0x1)` untransform, `func_168(0x1000000)` | charge-level split; TV `func_897` itself (Rebellion helper is `rebellion_interrupt_bird_form_to_ground`); TV input bits |
| Lightning 足止 | `053gbftry_003ltngfb_001` `func_958` / `func_960` / `func_877` | analog stop: `func_351(0,0x4)`, `func_296(0x3e8,0)` after `func_594`, `func_296(0x3e9,0)`, `sys_46(0x5)` **once** on start; zero `452/453/454`; air `func_593`; `689=0xa` for 593 snap-aim | `sys_41` / `0x700000` table VM; `func_873` opaque offsets; `689=-1` (skips snap-aim); per-tick `sys_46(0x5)` |

TV `2.c` global numbers are drifted by +1 versus Rebellion (`677` = our `676`). Map by role, not by number.

Lightning `func_873` returns raw script offsets (`0x3b732` …). Do not copy those integers into Rebellion.

Lightning 0.c is table-driven (`sys_41` + `sys_0(0x700000)`). Rebellion stays hardcoded `func_143`.

---

## Product mapping (locked defaults)

User lock 2026-08-26 (final mapping):

1. Ground **N + left + right** = current homemade `SUB_SHOT_CUSTOM`.
2. Ground **front + back only** = 召唤援护 **stub**. Immediate-exit 593 quartet. `Future work:` 援护. Confirmed OK as empty ACTION in v1.
3. Flight sub **untransforms** at ENTER. Post-untransform shoot motion is a **stub**. Confirmed OK as empty ACTION in v1.
4. Flight special **keeps** bird form, 足止, loop `0x9de587ce` on the action handle, gerobi **`CDA9F55A/B`**.

| Slot | Hash | ACTION | Selector `func_95` | Keep bird form? | Motion / bullets |
|------|------|--------|--------------------|-----------------|------------------|
| Ground homemade N+左右 | `0x23df217e` | `SUB_SHOT_CUSTOM` | `(0x1, 0x401, 0x7)` | no | `0xa0cd8d56` / `0x7c054fae`+`0x860a72cd` |
| Ground assist 前后 | `0x53554243` ("SUBC") | `SUB_SHOT_ASSIST` | `(0x1, 0x401, 0x7)` | no | **stub** (no clip, no `sys_4F`) |
| Flight sub | `0x7e08fcc9` | `SUB_SHOT_FLIGHT` | `(0x1, 0x1, 0x7)` | **no — untransform at ENTER** | **stub** after teardown |
| Flight special | `0xd94d608f` | `SPECIAL_SHOT_FLIGHT` | `(0x1, 0x1, 0x8)` | **yes** | loop `0x9de587ce` + gerobi `CDA9F55A/B` |

Leave `0x7c1d57c2` on vanilla `ACTION_AB_SUB_ALT_2`. Do not steal it for the stub. Vanilla assist leftovers (`sys_51` / empty-slot gate) stay unwired until the 援护 Future work is designed.

Direction source (mirror CSA, not melee):

```text
button  = global48 & 0x80
dir     = global2  & 0x3c
assist  = dir & 0x0c        // 0x4 front, 0x8 back  -> SUB_SHOT_ASSIST stub
homemade= otherwise         // N, 0x10 left, 0x20 right -> SUB_SHOT_CUSTOM
```

Do not read direction from `2.c` `global87` after the ACTION has already started.

**Stub contract (both Future-work ACTIONs):**

```c
void sub_shot_assist_start()
{
    if (global240 == 0)
    {
        global240++;
    }
    global252 = 0x1;
}
```

Same shape for shoot / no_ammo / end (or start sets `252` so 593 never needs a long shoot). `678` still exists as `*_no_ammo`. No `TODO` token. Origin comment names the Future work.

Ammo / HUD (until a current-target Param audit says otherwise):

| ACTION | `global681` | HUD |
|--------|-------------|-----|
| Ground homemade N+左右 | `0x1` | current sub slot |
| Ground assist 前后 stub | `0x1` declared, **no consume** in v1 | same HUD icon, no fire |
| Flight sub stub | `0x1` declared, **no consume** in v1 | same HUD icon |
| Flight special | `0x2` | same slot as ground special |

If HUD double-consumes or shows the wrong icon, that is a Param/row-swap issue (`sys_4F(0xB, ...)`) — use the bird-main row-swap rule (`sys_4F(0xB,0,new,old,0x4)`). Do not invent a third MSC ammo slot without evidence.

---

## Lifecycle / state ownership (mandatory before any X.c edit)

### Lifecycle matrix

| Phase | Ground homemade N+左右 | Ground assist 前后 stub | Flight sub | Flight special |
|-------|------------------------|-------------------------|------------|----------------|
| ENTER | current `SUB_SHOT_CUSTOM` | 593 quartet, start sets `global252` | teardown helper then stub quartet | 足止 + `func_308(..., 0x9de587ce, ...)` like bird main |
| ACTIVE | start-only aim, shoot homemade | no clip, no `sys_4F` | form 0, no shoot clip yet | 足止 gerobi; loop pose on action handle |
| EXIT | current end | immediate 679 | form 0, not analog | stay bird, analog may resume |
| INTERRUPT | FORCED_RECOVERY | FORCED_RECOVERY | form already 0 | allowlisted; FORCED_RECOVERY on hit |
| RESPAWN | native | native | form 0 | form 0 |

### State ownership

| State | Owner | Readers | ENTER | EXIT | INTERRUPT |
|-------|-------|---------|-------|------|-----------|
| action hash `global3` | engine + `func_95` | `func_41`, 0.c `global8` | new hash | native | native / FORCED_RECOVERY |
| form `global143` / 0.c `global39` | transform + `func_41` | `func_143` | ground: preserve 0. flight sub: **reset to 0 at ENTER**. flight special: **preserve 0x2** | flight sub: stay 0. flight special: preserve | FORCED_RECOVERY resets to 0 (idempotent if already 0) |
| ammo slot 1 | `sys_0(0x90000,1,0)` + `sys_4F(0,1,…)` | 593 `func_595` | consume on shoot | native reload | native |
| ammo slot 2 | special | flight special + ground ALT_2 | share | native | native |
| `global676..679` | each ACTION ENTER | `func_593` | set quartet | `func_586` next action | discarded |
| `global681` | ACTION ENTER | `func_595` / `sys_4F` | 1 or 2 | leftover until next `func_586` | leftover |
| `global689` / `452/453/454` | ACTION ENTER | `func_594/595`, `func_302` | homemade: keep start-aim (`689=0xa`). assist/flight-sub stubs: ignore. flight special: **zero + 689=-1** (足止) | next `func_586` | interrupt helper already `func_296(0x3e8,0)` |
| loop motion `0x9de587ce` | flight special + bird main | `func_308` on **action handle** | play on handle | native | do not leave it on slot `0x38` |
| aim helpers | homemade start only | tick | start only | `stop_aim` | next `func_586` |
| bird attachments | transform start / interrupt helper | detach helpers | flight sub: **detach at ENTER**. flight special: **do not** `func_884` | flight sub stay detached; special keep | helper detaches (idempotent) |

Shared-state policy: flight **special** **preserves** form, **resets** `452/453/454`, plays loop `0x9de587ce` on the action handle. Flight **sub** **resets** form at ENTER and does **not** inherit homemade motion (stub). Do not use `rebellion_bird_special_melee_natural_exit()` for flight sub.

---

## Files to change (implementation only, after confirm)

| File | Action | Why |
|------|--------|-----|
| `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c` | UPDATE `func_143` | Ground `0x80` split; bird `0x80` + `0x100` |
| `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c` | UPDATE | Two ground ACTIONs, two flight ACTIONs, `func_241`, `func_41` allowlist |
| `tools/tests/test_rebellion_subshot_split_and_flight_weapons.py` | CREATE | Source-text gate, same style as `test_rebellion_special_melee_dash_cancel.py` |
| `docs/msc-research/2026-08-26-wing-zero-rebellion-subshot-split-and-flight-weapons-plan.md` | CREATE on confirm | Canonical copy under `docs/` (vite-ignored) |
| `docs/msc-research/sub-shot-custom-start-only-aim.md` | UPDATE after ship | Homemade is N+左右 only |
| `docs/msc-research/wing-zero-rebellion-bird-form-0c-input-map.md` | UPDATE after ship | Fill “副射/特射仍不映射” with runtime evidence |
| `tools/msc_research_catalog.py` | UPDATE when copying the plan into `docs/msc-research/` | Required for new MSC notes |

Do **not** edit `src/` (hotreload). Do **not** unpack FHM2D. Do **not** copy Lightning `0.c` `sys_41` thinker.

---

## Resource proof (blocking gate, before writing ACTION bodies)

Locate by canonical names in the **current target** motion / effect / bullet trees. Documentation or TV hashes are not proof.

| Need | Current known | Must prove in target |
|------|---------------|----------------------|
| Ground homemade motion | `0xa0cd8d56` already used | still present, non-empty Item |
| Ground homemade bullets | `0x7c054fae`, `0x860a72cd` | still present |
| Ground assist 援护 | **stub** | no motion/bullet required in v1 |
| Flight sub shoot motion | **stub** after untransform | no clip required in v1 |
| Flight special motion | bird loop already used by bird main | `0x9de587ce` on action handle (TV slot `0x38` / `0xCF3250EB`). Must not `func_76(0x38)` |
| Flight special gerobi | ground ALT_2 `CDA9F55A/B` **locked** | prove current-target bird-form muzzle still accepts this pair; do not `func_884`; do not pick a different pair unless proof fails |
| HUD slots 1 and 2 | current homemade / ALT_2 | armsparam rows exist; unsigned ID order |

Task 2 only blocks on flight-special gerobi / bird-form muzzle proof. Homemade clip and loop clip are already in the target.

---

## Tasks

### Task 1: Source-text tests first (RED)

**Files:**

- Create: `tools/tests/test_rebellion_subshot_split_and_flight_weapons.py`

- [ ] **Step 1: Write the failing test**

Mirror `tools/tests/test_rebellion_special_melee_dash_cancel.py` (`MSC` path, `_function_body`, `_strip_c_comments`). Assert:

```python
MSC = Path(r"E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc")

HOMEMADE = 0x23DF217E
ASSIST = 0x53554243
FLIGHT_SUB = 0x7E08FCC9
FLIGHT_SP = 0xD94D608F
LOOP = 0x9DE587CE

# 0.c func_143 normal: 0x80 + global2 0x0c -> ASSIST stub, else HOMEMADE
# 0.c func_143 bird: 0x80 -> FLIGHT_SUB (no direction split)
# 0.c func_143 bird: 0x100 -> FLIGHT_SP
# 2.c func_241 wires all four hashes to named ACTIONs
# 2.c each ACTION sets global676..679 to *_start/_shoot/_no_ammo/_end
# 2.c func_41 allowlist contains FLIGHT_SP only
# 2.c func_41 allowlist still excludes FLIGHT_SUB and 0x928ca34f
# SUB_SHOT_FLIGHT ENTER calls rebellion_interrupt_bird_form_to_ground
# homemade still uses 0xa0cd8d56 / 0x7c054fae / 0x860a72cd
# assist and flight-sub bodies are immediate-exit stubs (Future work comments)
# SPECIAL_SHOT_FLIGHT plays LOOP 0x9de587ce and must not call func_76(0x38)
# 678 callbacks are named no_ammo, not cancel
# no TODO/FIXME tokens in MSC
```

- [ ] **Step 2: Run to verify RED**

```text
python -m unittest tools.tests.test_rebellion_subshot_split_and_flight_weapons -v
```

Expected: FAIL (hashes / allowlist / quartet names not present yet).

### Task 2: Resource inventory (no MSC edit)

- [ ] Confirm homemade motion `0xa0cd8d56` and bullets `0x7c054fae` / `0x860a72cd` still exist (N+左右 only).
- [ ] Confirm bird loop `0x9de587ce` is the clip `ACTION_A_SHOT_BIRD` already plays on the action handle.
- [ ] Prove flight-special gerobi `CDA9F55A/B` exists for the current-target bird-form muzzle / bone. Record Runtime ID, LE `unk1`, fileIndex, Param row. Do not swap the pair unless this proof fails.
- [ ] Assist stub and flight-sub shoot stub need no new assets in v1.
- [ ] If the flight-special gerobi ids are missing, stop and report. Do not invent hashes.

### Task 3: `0.c` selector split

**Files:**

- Modify: `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c` `func_143`

Wrap every AI edit in `// AI decision (2026-08-26): ...` / `// End, origin is ...`.

- [ ] **Normal form `0x80`**

Replace:

```c
else if (global48 & 0x80)
{
    func_95(0x23df217e, 0x1, 0x401, 0x7);
}
```

with:

```c
else if (global48 & 0x80)
{
    // AI decision (2026-08-26): split ground sub at selector time.
    // Origin: AI-assisted MSC edit; global48 0x80 is the button; direction
    // is global2 like CSA 0x800. 0x4/0x8 = assist stub. N+0x10+0x20 =
    // current homemade SUB_SHOT_CUSTOM. Do not wait for 2.c global87.
    if (global2 & 0xc)
    {
        func_95(0x53554243, 0x1, 0x401, 0x7);
    }
    else
    {
        func_95(0x23df217e, 0x1, 0x401, 0x7);
    }
    // End, origin is AI-assisted MSC edit; ground sub homemade vs assist selector.
}
```

- [ ] **Bird form: add `0x80` then `0x100` before melee `0x2`**

Priority must stay: burst / CSB / main / CSA / special-melee / **sub / special-shot** / melee. Sub and special are currently missing, so analog eats the buttons.

```c
else if (global48 & 0x80)
{
    // AI decision (2026-08-26): bird sub is one hash, no stick split.
    // Origin: AI-assisted MSC edit; TV 028gunwtv bird 0x80 is charge-split
    // not direction-split. Rebellion has no TBR charge on sub.
    // Untransform is 2.c ENTER (interrupt helper), not this selector.
    func_95(0x7e08fcc9, 0x1, 0x1, 0x7);
    // End, origin is AI-assisted MSC edit; bird sub selector.
}
else if (global48 & 0x100)
{
    // AI decision (2026-08-26): bird special is flight 足止 gerobi.
    // Origin: AI-assisted MSC edit; do not reuse ground 0x20923fb6 ALT_2.
    if (!(sys_0(0x90000, 0x2) == 0))
    {
        func_95(0xd94d608f, 0x1, 0x1, 0x8);
    }
    else
    {
        func_98(0x2);
    }
    // End, origin is AI-assisted MSC edit; bird special selector.
}
```

Empty-ammo for bird special uses `func_98(0x2)` (slot 2), same idea as bird main `func_98(0)`.

- [ ] Run `python .\tools\check_msc_opaque_func_ptrs.py` on `0.c`. `func_95` hashes are action hashes, not script offsets; thinker `sys_1(..., func_143)` must stay a symbol.

### Task 4: Keep homemade `SUB_SHOT_CUSTOM` for N+左右

**Files:**

- Modify: target `2.c` `func_241` only if needed (`SUB_SHOT_CUSTOM` body stays)

- [ ] Keep `0x23df217e` → `SUB_SHOT_CUSTOM`. Do not rename unless tests need it.
- [ ] Keep start-only aim + `stop_aim`. Do not call `rebellion_alt2_*`.
- [ ] Drop `func_241(0x53554243, SUB_SHOT_CUSTOM)` — Task 5 retargets that hash to the assist stub.

### Task 5: Ground assist stub (`SUB_SHOT_ASSIST`)

- [ ] Add a complete `func_593` quartet. Immediate `global252 = 0x1` in start. No motion, no `sys_4F`, no ammo consume.
- [ ] AI-block with `Future work: summon assist (援护).` Never write `TODO`/`FIXME`.
- [ ] `func_241(0x53554243, SUB_SHOT_ASSIST)`.
- [ ] Do not run vanilla `ACTION_AB_SUB_ALT_2` / `0x7c1d57c2`.

```c
void SUB_SHOT_ASSIST()
{
    func_586();
    global676 = sub_shot_assist_start;
    global677 = sub_shot_assist_shoot;
    global678 = sub_shot_assist_no_ammo;
    global679 = sub_shot_assist_end;
    global681 = 0x1;
    global682 = 0x1;
    global683 = 0x1;
    global686 = 0x100;
    global689 = 0xffffffff;
    global698 = 0x14;
    callFunc3(sub_shot_assist_tick);
}

void sub_shot_assist_tick()
{
    func_593();
}

void sub_shot_assist_start()
{
    if (global240 == 0)
    {
        global240++;
    }
    global252 = 0x1;
}
```

Shoot / no_ammo / end use the same immediate-exit shape so 593 can leave.

### Task 6: `func_41` allowlist **before** flight special body

Flight **special** must be on the keep-form list or the first tick tears form. Flight **sub** must stay **off** that list so `func_41` tears form (TV Lv.1 変形解除).

Current gate:

```c
else if (global143 == 0x2 && global3 != 0x9475130e && global3 != 0x77b100ff
    && global3 != 0xa02d57dc && global3 != 0x476fac14 && global3 != 0x2194f05d)
```

- [ ] Add `&& global3 != 0xd94d608f` only.
- [ ] Keep `0x7e08fcc9` and `0x928ca34f` **off** the list.
- [ ] Do not skip FORCED_RECOVERY for hit hashes.

### Task 7: Flight sub ACTION (`SUB_SHOT_FLIGHT`)

Take TV `ACTION_AB_SUB_ALT_3` (`func_1022..1025`) **roles**, Rebellion global numbers:

| Rebellion slot | Role | TV ALT_3 (drifted) |
|----------------|------|--------------------|
| 676 start | lock facing, play motion, `func_351` air stop | `func_1022` / `global677` |
| 677 shoot | `sys_4F` sniper bullet | `func_1023` / `global678` |
| 678 no_ammo | `sys_4F(0x12, slot)` | `func_1024` / `global679` |
| 679 end | recovery, `func_91` | `func_1025` / `global680` |

Required Rebellion adaptations (untransform + **shoot-motion stub**):

```c
void SUB_SHOT_FLIGHT()
{
    // AI decision (YYYY-MM-DD): TV Lv.1 flight sub untransforms.
    // Origin: AI-assisted MSC edit; source is 028gunwtv ACTION_AB_SUB_ALT_3
    // plus Rebellion helper rebellion_interrupt_bird_form_to_ground.
    // Future work: post-untransform shooting motion is not chosen yet.
    // Do not add 0x7e08fcc9 to the func_41 keep-form allowlist.
    // Do not play homemade 0xa0cd8d56 here.
    rebellion_interrupt_bird_form_to_ground();
    func_586();
    global676 = sub_shot_flight_start;
    global677 = sub_shot_flight_shoot;
    global678 = sub_shot_flight_no_ammo;
    global679 = sub_shot_flight_end;
    global681 = 0x1;
    global682 = 0x1;
    global683 = 0x1;
    global686 = 0x100;
    global689 = 0xffffffff;
    global698 = 0x14;
    callFunc3(sub_shot_flight_tick);
}
```

- [ ] ENTER teardown **before** `func_586`.
- [ ] Start/shoot/no_ammo/end are immediate-exit stubs (same shape as `SUB_SHOT_ASSIST`).
- [ ] Do not copy TV `func_897`. Do not `func_81(0x23df217e)`. Do not `func_76(0x38)`.
- [ ] `func_241(0x7e08fcc9, SUB_SHOT_FLIGHT)`.

### Task 8: Flight special ACTION (`SPECIAL_SHOT_FLIGHT`)

Copy **足止 analog** from Lightning `func_958`/`func_960`/`func_877` and from this unit's homemade sub / ALT_2 (`func_351(0, 0x4)`). Copy **gerobi fire** from ground ALT_2 `func_923` (`sys_4F` pair) **without** the tap-followup latch (`rebellion_alt2_big_followup`).

Runtime trap (2026-08-27): skipping `func_351(0, 0x4)` leaves `rebellion_transform_loop`'s `func_351(0x2, 0x4)` + `func_296(0x3e8, 1)` running, so the body keeps flying and flight heading eats 593 yaw. `func_594` also re-enables `func_296(0x3e8, 1)` after start when `func_168(0x1000000)` is set. Lightning `global811==1` `689=-1` skips `func_595` snap-aim; keep `689=0xa`. Do not `sys_46(0x5)` every tick.

- [ ] `global681 = 0x2`.
- [ ] 676 start: lock facing, analog 足止 (`func_351(0, 0x4)`, `0x3e8/0x3e9` off, `sys_46(0x5)` once), `689=0xa`, `452/453/454=0`, `func_308(global20, 0x9de587ce, ...)`. Never `func_76(0x38)`.
- [ ] 677 shoot: spawn gerobi `CDA9F55A/B`; `func_123` cancel window (do not pack `0x9a5` bit `0x4`).
- [ ] 678 no_ammo: `sys_4F(0x12, 0x2)` plus `sys_4E(0)` if a wall-stuck beam can remain.
- [ ] 679 end: recovery; stay in bird form.
- [ ] Do not call `func_302`. That is TV 変形特射 rush, the opposite of 足止.
- [ ] Do not import Lightning missiles in v1.
- [ ] `func_241(0xd94d608f, SPECIAL_SHOT_FLIGHT)`.

### Task 9: Static gates

```text
python .\tools\check_msc_ai_blocks.py "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c"
python .\tools\check_msc_ai_blocks.py "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c"
python .\tools\check_msc_opaque_func_ptrs.py "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c"
python .\tools\check_msc_opaque_func_ptrs.py "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c"
python -m unittest tools.tests.test_rebellion_subshot_split_and_flight_weapons -v
```

- [ ] All four pass.
- [ ] Re-run Task 1 tests GREEN.
- [ ] Compile/repack **only if the user authorizes**.

### Task 10: In-game matrix (after authorized repack)

| # | Setup | Input | Expected |
|---|-------|-------|----------|
| G1 | Ground, ammo | N sub | homemade `0x23df217e`, current clip |
| G2 | Ground, ammo | 前 or 后 + sub | assist stub `0x53554243`, **no** homemade clip, no 援护 spawn yet |
| G3 | Ground, ammo | 左 or 右 + sub | **same** homemade hash/clip as G1 |
| G4 | Ground, empty slot 1 | N/左右 sub | homemade 678 no_ammo |
| F1 | Bird analog `0x77b100ff` | sub, any stick | `0x7e08fcc9`, **untransform**, **no** shoot clip yet, analog does **not** resume |
| F2 | Bird | special, any stick | `0xd94d608f`, stay bird, loop `0x9de587ce`, 足止 gerobi |
| F3 | Bird, empty slot 2 | special | `func_98(0x2)`, no ACTION |
| I1 | During F1 or F2 | get hit | FORCED_RECOVERY to ground; **not** stuck analog |
| I2 | After F2 natural end, stick held | — | analog `0x77b100ff` resumes, form still 0x2 |
| I3 | After F1 natural end, stick held | — | form 0, ground/air idle, **not** analog |
| R1 | Die / respawn | — | form 0, HUD slots native |
| X1 | Ground homemade or assist stub | do not enter bird table | `global143` stays 0 |

---

## Do not

- Do not gate bird weapons inside `2.c` `ACTION_*` with `if (global143) return`.
- Do not copy TV input-bit semantics (`0x100` is Rebellion special, not main).
- Do not copy TV interrupt requeue of `0x77b100ff`.
- Do not add `0x928ca34f` or flight-sub `0x7e08fcc9` to the flight allowlist.
- Do not add flight-special `0xd94d608f` without the `func_41` keep-form allowlist.
- Do not skip `rebellion_interrupt_bird_form_to_ground()` on flight-sub ENTER, and do not substitute `rebellion_bird_special_melee_natural_exit()` (that keeps flight movement).
- Do not copy TV `func_897` onto Rebellion; the target helper already detaches bird props and restores hand weapons.
- Do not write `global143 = 0x2` from a ground ACTION.
- Do not treat `678` as cancel / followup. ALT_2 tap followup stays on ground `0x20923fb6` only.
- Do not call `rebellion_alt2_followup_aim` from any sub-shot.
- Do not `func_884` / `func_76(0x38)` on **keep-form** bird shots (flight special, bird main). Flight sub teardown uses the interrupt helper, which already restores normal hands.
- Do not copy Lightning `sys_41` + `0x700000` + `func_873` opaque offsets.
- Do not copy TV 変形特射 `func_302` rush into the new flight special.
- Do not unpack FHM2D.
- Do not put this plan or implementation notes under `src/`.
- Do not write `TODO` / `FIXME` in MSC; stubs use `Future work:` inside the AI block.
- Do not `func_76(0x38)` for flight special; play `0x9de587ce` on the action handle.
- Do not play homemade `0xa0cd8d56` on flight sub v1 (shoot motion is a stub).

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Flight special missing from `func_41` allowlist | High | Task 6 adds **only** `0xd94d608f`; in-game F2/I2 |
| Flight sub accidentally allowlisted | High | tests assert `0x7e08fcc9` is excluded; in-game F1/I3 |
| Untransform after first motion frame (bird clip on ground skeleton) | High | teardown before `func_586` / first `func_308` |
| Assist stub looks like “sub did nothing” | High (expected v1) | selector still claims 前后; Future work 援护 |
| Flight-sub stub looks like untransform with no shot | High (expected v1) | ENTER teardown is the v1 product; shoot clip is Future work |
| `func_76(0x38)` on flight special | High if copied from old bird-main | play `0x9de587ce` on the action handle only |
| `global48` vs `global2` direction | Medium | CSA pattern; if 前后 still hits homemade, dump `global2/global48` on the press frame |
| Flight special sharing slot 2 fights ground ALT_2 HUD | Medium | bird-main `sys_4F(0xB,0,new,old,0x4)` rule |
| Lightning missiles expected | Low | v1 gerobi only |
| Opaque `func_95` / thinker offsets | High if body grows | `check_msc_opaque_func_ptrs.py` on both files |
| `func_123(0x9a5)` bit `0x4` steals 前格 into dash | Medium | do not pack that bit on new windows |

**Complexity:** High (four ACTIONs, form allowlist, two reference units, resource proof).

---

## Spec coverage

| Requirement | Task |
|-------------|------|
| N+左右 homemade, 前后 assist stub | 3, 4, 5 |
| start / shoot / no_ammo / end (stubs included) | 4, 5, 7, 8 |
| Do not edit MSC until plan confirmed | this document |
| Plan md does not trip `tauri dev` | persist under `docs/` |
| Flight sub untransform + shoot-motion stub | 3 bird `0x80`, 6 (exclude), 7 |
| Flight special 足止 + loop `0x9de587ce` | 3 bird `0x100`, 6 (include), 8 |
| Empty bird `0x80`/`0x100` filled | 3 |
| Form keep (special) + untransform (sub) + FORCED_RECOVERY | 6, 10 |

No placeholder “implement later” steps. Resource gaps fail Task 2 instead of shipping dummy IDs.

---

## Execution after confirm

1. Copy this plan into `docs/msc-research/2026-08-26-wing-zero-rebellion-subshot-split-and-flight-weapons-plan.md` and register it in `tools/msc_research_catalog.py` (vite ignores `docs/`).
2. Then either:
   - **Subagent-driven** — one subagent per task, review between tasks.
   - **Inline** — same session, checkpoint after Task 3, Task 6, Task 9.

Do not start MSC edits until the user confirms this plan (and any override of the locked defaults in Product mapping).
