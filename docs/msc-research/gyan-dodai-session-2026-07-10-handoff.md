# Gyan Dodai Session Handoff (2026-07-10)

**Kind:** Session research log + implementer handoff  
**Action hash:** `0x7B65B9B7`  
**Status at end of session:** RELEASE stuck fixed in-game (`func_309(..., func_14)` was the root cause). Aim yaw partially done earlier; pitch / inertia recipes documented below, may need re-verify after user’s local repacks.

This file is the **entry for Dodai throw / aim / RELEASE** work. Prefer it over chat memory for those topics.

**Later multi-topic session (2026-07-11):** characterparam 红锁/HP, speedparam flight rows, package `0x35B195CC`, flight camera, Hyaku mount effects, Param Editor labels, Extract→Workspace — see [gyan-session-2026-07-11-handoff.md](./gyan-session-2026-07-11-handoff.md).

**Also use primary MSC tree (user active):** `E:\XB\mod\040msc\001gundam_005gyan00_001_N2_rocket_mod\`

---

## 1. Paths (source of truth)

| Role | Absolute path |
|------|----------------|
| Hyaku reference MSC (user-moved) | `E:\XB\mod\040msc\002zgundm_002hyaksk_001\{0,2}.c` |
| Gyan working port (primary edit tree) | `E:\XB\解包\com\file\040msc\gundam_005gyan00_modified\{0,2}.c` |
| Gyan under mod tree (often same Dodai port) | `E:\XB\mod\040msc\001gundam_005gyan00_001\{0,2}.c` |
| Gyan N2 rocket mod (active 2026-07-11) | `E:\XB\mod\040msc\001gundam_005gyan00_001_N2_rocket_mod\{0,2}.c` |
| Older Hyaku unpack (secondary) | `E:\XB\解包\com\file\040msc\0x43BB8719` or sibling `002zgundm_002hyaksk_001` |

**Related docs already in repo**

| Doc | Topic |
|-----|--------|
| [gyan-dodai-special-shot-action-port.md](./gyan-dodai-special-shot-action-port.md) | Flight selector + register `0x7B65B9B7`, first cancel-stuck (`global252` before fall) |
| [gyan-dodai-throw-aim-at-enemy-analysis.md](./gyan-dodai-throw-aim-at-enemy-analysis.md) | Aim field map Hyaku→Gyan, yaw `global689` |
| [units/2002001-hyaku-shiki/README.md](./units/2002001-hyaku-shiki/README.md) | Hyaku flight / Dodai research |
| [exvs-msc-syscall-47-notes.md](../exvs-msc-syscall-47-notes.md) | `sys_47(0x10)` rotate |
| [msc-ai-edit-block-rule.md](./msc-ai-edit-block-rule.md) | AI edit markers on `X.c` |

**Committed structural test (aim claims vs real trees)**

```text
python tools/tests/test_gyan_dodai_throw_aim_analysis.py
```

---

## 2. What already works (before this session’s remaining polish)

```text
0.c  weapon selector (flying bit 0x4000 + special-shot 0x100)
  -> func_95(0x7B65B9B7, ...)
2.c  func_241(0x7b65b9b7, GYAN_DODAI_SPECIAL_SHOT_ACTION)
  -> DRIVER: func_599 only (Gyan standard)
  -> START / RELEASE / END phase callbacks
```

- Flight mode entry/exit infrastructure existed from prior port.
- Dodai projectile: `sys_4F(0, 0x5, 0xff4828ea)` (slot 5).
- Ammo consume: `sys_4F(0x7, 0x3, 0x1)` (slot 3).
- Phase completion flag on Gyan: **`global252`** (Hyaku: `global254`).
- Shared ranged phase machine: **`func_599` → `func_600/601/602/603`**.

**Design rule (user-confirmed this session)**

- `GYAN_DODAI_SPECIAL_SHOT_DRIVER` must stay **`func_599();` only**.
- Do **not** put aim damp / pitch re-arm / business logic in DRIVER.
- Action-local behavior goes in **ACTION init** and **START/RELEASE/END**.

---

## 3. Hyaku reference action (aim + throw)

### Registry

```c
func_241(0x7b65b9b7, ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH); // ~hyaku 2.c:30542
```

### Action init (Hyaku field numbers)

```c
void ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH()
{
    func_586();
    global678 = func_1020;   // start
    global679 = func_1021;   // release
    global681 = 0;
    global683 = 0x5;         // weapon slot for ammo checks
    global684 = 0x1;
    global685 = 0x1;
    global688 = 0x100;       // input mask bit
    global691 = 0xa;         // turn-window frames (NOT 0xffffffff)
    global700 = 0x14;        // cancel-window related
    callFunc3(func_1019);
}
```

### Driver (Hyaku only — do not copy topology onto Gyan DRIVER)

```c
void func_1019()
{
    int var0;
    func_599();
    var0 = 0x3 * (0x64 - func_274()) / 0x64 + 0x61;
    func_106(var0, 0, 0);   // optional damp -> sys_47(0x10)
    func_109(var0, 0, 0);
}
```

### Start velocity decay (inertia)

```c
// func_1020 first frame
func_615(0x1, 0x1, 0x9, 0);  // queue velocity job + set duration param
```

---

## 4. Hyaku → Gyan field map (use-site, not equal `func_N`)

| Role | Hyaku | Gyan |
|------|-------|------|
| Lock-face enable | `global176 = global67` | `global174 = global67` |
| Turn-window frames | `global691` | `global689` |
| Turn budget residual | `global177 = global691 * 0x64` | `global175 = global689 * 0x64` |
| Soft-turn enable | `global721` | `global719` |
| **Pitch enable** | `global722` (in `func_601`) | **`global720`** |
| Turn complete | `global724` | `global722` |
| Phase complete | `global254` | `global252` |
| Cancel window | `global700` → `global215` | `global698` → `global213` |
| Aim rate triad | `global454/455/456` | `global452/453/454` |
| Input mask | `global688` | `global686` |
| Weapon slot (ammo query) | `global683` | `global681` |
| Fire min/max counts | `global684` / `global685` | `global682` / `global683` |
| Start callback | `global678` | `global676` |
| Release callback | `global679` | `global677` |
| End callback | (topology differs) | `global679` |
| Target yaw | `sys_0(0x40000, 0x5)` + `sys_46(0, …)` | same |
| Target pitch | `func_609(0x1)` + `func_105` / `func_104` | same shape |
| Rotate damp helpers | `func_106` / `func_109` → `sys_47(0x10)` | same local names |

**Evidence rule:** map by syscall + use-site shape. Never key on bare `func_1018` / `func_1020` names across decompile trees.

---

## 5. Issues found this session

### 5.1 Yaw aim missing (left/right face enemy)

**Cause:** `GYAN_DODAI_SPECIAL_SHOT_ACTION` set:

```c
global689 = 0xffffffff;  // disables turn budget
```

`func_600`:

```c
global175 = global689 * 0x64;
if (global175 > 0) global719 = 1; else global719 = 0;
```

`func_601` only soft/snaps yaw when `global719 != 0` and locked (`global174 == 1`).

**Fix:**

```c
global689 = 0xa;       // required
global698 = 0x14;      // optional cancel window (Hyaku global700)
```

Or delete the `global689 = 0xffffffff` overwrite so `func_586` default `0xa` remains.

### 5.2 Pitch aim missing (up/down)

**Cause:** Yaw and pitch are separate in `func_601`.

```c
// yaw
sys_46(0, var0);

// pitch — gated
if (global720) {
    func_105(...);                    // soft
    func_104(func_609(0x1), 0, 0);    // snap
}
```

`func_600` **always zeros pitch** for ranged actions:

```c
if (global175 > 0) {
    global719 = 0x1;
    global720 = 0;    // pitch OFF (yaw-only default for ranged)
}
```

Contrast melee-style `func_503`, which sets pitch enable `global636 = 0x1` when budget > 0 and airborne.

**Do not put pitch re-arm in DRIVER.** Put in **START every frame** (runs via `func_72` before pitch apply same frame):

```c
void GYAN_DODAI_SPECIAL_SHOT_START()
{
    if (global174 == 0x1)
    {
        global720 = 0x1;   // every frame, not only global240==0
    }
    // ... existing first-frame motion/ammo ...
}
```

Setting only in ACTION init is wiped by `func_600`.

### 5.3 Inertia inheritance (not the 681–686 block)

User-listed fields mostly **are not inertia**:

| Field (Gyan) | Real role |
|--------------|-----------|
| `global681` | Ammo slot id (`sys_0(0x90000, slot, 0)`) — Gyan Dodai uses **3** |
| `global682` / `global683` | Fire count min/max for cancel/fire loops |
| `global686` | Input hold mask (`0x100` = special shot) |
| `global698` | Cancel window |
| `global689` | Turn window (aim) |
| `global452/453/454` | Lock-on aim follow rates |

**Inertia path:**

1. Every ranged entry `func_600` always:

   ```c
   func_523(0, 0, 0);   // sys_48(0xa, ...)
   func_166(0, 0, 0);   // sys_48(0x9, ...)
   func_616(global716);
   ```

2. Hyaku Dodai **START** adds:

   ```c
   func_615(0x1, 0x1, 0x9, 0);
   // func_142(1,1,0) + global716/718 = 0x9 (decay duration)
   ```

Gyan START was missing `func_615` → more carry-over momentum from flight.

**Recipe (START first frame):**

```c
func_615(0x1, 0x1, 0x9, 0);  // match Hyaku Dodai; try 0x3c if need longer decay
```

### 5.4 Action stuck after motion (SOLVED in-session)

**Not** primarily `func_308` / START `func_309` threshold.

**Real bug — RELEASE completion gate:**

```c
// BROKEN
if (func_309(global20, func_14))
{
    global252 = 0x1;
}
```

- `func_14` is `void func_14(int)` (cleanup/exit helper), **not** a frame constant.
- Passing it as threshold ≈ huge script address → clock never reaches it → `global252` never re-set after phase switch.
- `func_71` clears `global252` when entering RELEASE; RELEASE must set it again for `func_602` → END.

**Symptom:** motion “finished”, maybe projectile already fired, unit stuck in action / no clean exit.

**Same bad pattern also appears at ~`func_993`** in the same file (nuke path) — do not copy.

**Working peers:** many RELEASE bodies use `if (func_91()) global252 = 0x1;` or set `global252 = 0x1` immediately after fire.

**Fixed recipe:**

```c
void GYAN_DODAI_SPECIAL_SHOT_RELEASE()
{
    if (global240 == 0)
    {
        global240++;
        func_351(0, 0x4);
        sys_4F(0, 0x5, 0xff4828ea);
        func_123(0x380);
        global29 = global29 | 0x10000;
        sys_58(0x9, 0x4c9a9d5b);
        // optional: global252 = 0x1;  // fire-and-forget advance
    }
    if (func_91())   // NOT func_309(global20, func_14)
    {
        global252 = 0x1;
    }
}

void GYAN_DODAI_SPECIAL_SHOT_END()
{
    if (global240 == 0)
    {
        global240++;
    }
    if (func_91() || sys_47(0x7, sys_4B(0x1)))
    {
        global252 = 0x1;
        global212 = 0x14;
        func_884();
    }
}
```

**User confirmed this resolved the stuck.**

### 5.5 Phase machine cheat-sheet (`func_599`)

| `global184` | Function | Advance when |
|-------------|----------|--------------|
| 0 | `func_600` init once | → 1 immediately |
| 1 | `func_601` + START via `func_72` | `global252 && global722` (if `global676 != 0`) |
| 2 | `func_602` + RELEASE | `global252` only |
| 3 | `func_603` + END | `global252` then exit action |

`func_71(callback)` → `func_73()` clears `global240` and `global252` then runs new phase once.

### 5.6 Motion notes (secondary)

| Hash | Where used | Notes |
|------|------------|-------|
| `0xb19aa07` | Dodai START (current tree); also melee `func_975` | Melee-family clip; OK if unit has it |
| `0x92aac54` | Ground special `func_929`; port doc “temporary motion” | Safer known Gyan ranged clip |
| START wait `0xa0` | Dodai | Short; if START truly never advances, compare to `0x3e8` / `0x64` peers |

Prefer fixing RELEASE gate before retuning motion.

---

## 6. Recommended Gyan action skeleton (post-session)

```c
void GYAN_DODAI_SPECIAL_SHOT_ACTION()
{
    func_586();
    global676 = GYAN_DODAI_SPECIAL_SHOT_START;
    global677 = GYAN_DODAI_SPECIAL_SHOT_RELEASE;
    global678 = 0;
    global679 = GYAN_DODAI_SPECIAL_SHOT_END;

    global681 = 0x3;      // Gyan ammo slot 3 (not Hyaku 5)
    global682 = 0x1;
    global683 = 0x1;
    global686 = 0x100;
    global689 = 0xa;      // yaw aim window
    global698 = 0x14;     // cancel window

    // optional lock follow rates
    // global452 = 0x64; global453 = 0x60; global454 = 0x60;

    callFunc3(GYAN_DODAI_SPECIAL_SHOT_DRIVER);
}

void GYAN_DODAI_SPECIAL_SHOT_DRIVER()
{
    func_599();   // ONLY
}

void GYAN_DODAI_SPECIAL_SHOT_START()
{
    // pitch re-arm every frame while locked
    if (global174 == 0x1)
        global720 = 0x1;

    if (global240 == 0)
    {
        global240++;
        func_615(0x1, 0x1, 0x9, 0);   // inertia / velocity decay
        func_168(0x1000000);
        func_308(global20, /* motion hash */, global276, /* blend */, 0);
        func_94(0x5);
        func_351(0, 0x4);
        sys_4F(0x7, 0x3, 0x1);
    }
    if (func_309(global20, /* proven wait */))
    {
        global252 = 0x1;
        sys_58(0, 0x216a12ff);
    }
}
```

Wrap all AI edits with `// AI decision (YYYY-MM-DD): ...` / `// End, origin is ...` and run `tools/check_msc_ai_blocks.py`.

---

## 7. What NOT to do

- Do not put pitch / damp / business logic in DRIVER.
- Do not copy Hyaku Dodai model/bone hashes (`func_1076` / `0x6dcacd82`, etc.) into Gyan.
- Do not replace Gyan three-phase `global676/677/679` with full Hyaku two-phase graph unless redesigning.
- Do not change shared `func_600` globally to always enable pitch (affects all ranged).
- Do not use `func_309(global20, func_14)` as a completion gate.
- Do not treat equal `func_N` numbers across units as identity.

---

## 8. Open / next steps (for later sessions)

1. **Confirm on disk** that RELEASE no longer uses `func_14` in both unpack and mod trees; repack both if both ship.
2. **Pitch:** verify START every-frame `global720 = 0x1` after yaw fix; tune if needed.
3. **Inertia:** verify `func_615(0x1, 0x1, 0x9, 0)` feel; adjust 3rd arg.
4. **Flight exit:** port doc mentioned `func_464` after throw; current RELEASE may not call it — check if fall/transform exit still required.
5. **Motion:** settle final `func_308` hash + `func_309` wait against in-game feel.
6. **Optional:** fix sibling `func_993` same `func_14` bug if that path is used.
7. **Tests:** extend `tools/tests/test_gyan_dodai_throw_aim_analysis.py` (or new test) to assert RELEASE does **not** contain `func_309(global20, func_14)` and asserts `global689` / START pitch / `func_615` once implemented on disk.
8. Round-trip: `msclang.py` + `mscdec.py` + `check_msc_ai_blocks.py` on modified `0.c`/`2.c`.

---

## 9. Session decision log (short)

| Decision | Outcome |
|----------|---------|
| Aim primary | Soft/snap yaw via `global689` + shared `func_601` |
| Pitch | `global720` in START, not DRIVER |
| DRIVER purity | Always only `func_599()` for Gyan Dodai |
| Inertia | `func_615` in START, not 681–686 |
| Stuck after anim | RELEASE `func_14` gate — fixed with `func_91` / immediate `global252` |
| Evidence style | Hash `0x7B65B9B7` + use-sites; docs secondary |

---

## 10. Quick continue prompt (paste for next agent)

```text
Continue Gyan flying Dodai (hash 0x7B65B9B7) using:
docs/msc-research/gyan-dodai-session-2026-07-10-handoff.md
Primary MSC: E:\XB\解包\com\file\040msc\gundam_005gyan00_modified\
Hyaku ref: E:\XB\mod\040msc\002zgundm_002hyaksk_001\
DRIVER must stay func_599-only.
Next: verify pitch (global720 in START), inertia (func_615), flight exit (func_464?), and harden tests.
```
