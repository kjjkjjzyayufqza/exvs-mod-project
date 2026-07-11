# Gyan Dodai Throw Aim-at-Enemy Analysis

**Date:** 2026-07-10  
**Kind:** Research / port recipe (session later also fixed RELEASE stuck and documented pitch/inertia)  
**Action hash:** `0x7B65B9B7`  
**Full session handoff (preferred continue entry):** [gyan-dodai-session-2026-07-10-handoff.md](./gyan-dodai-session-2026-07-10-handoff.md)

## Sources (primary)

| Unit | Path | Role |
|------|------|------|
| Hyaku Shiki | `E:\XB\mod\040msc\002zgundm_002hyaksk_001\2.c` | Reference implementation of throw-while-facing |
| Gyan (working flight+Dodai port) | `E:\XB\解包\com\file\040msc\gundam_005gyan00_modified\2.c` | Current Gyan path with missing aim |
| Gyan N2 rocket mod (2026-07-11 active) | `E:\XB\mod\040msc\001gundam_005gyan00_001_N2_rocket_mod\2.c` | Session camera/mount/package notes: [gyan-session-2026-07-11-handoff.md](./gyan-session-2026-07-11-handoff.md) |
| Stock Gyan (note) | `E:\XB\mod\040msc\001gundam_005gyan00_001` | No flying Dodai action; baseline is modified tree |

Secondary context only (not sole proof):

- `docs/msc-research/gyan-dodai-special-shot-action-port.md`
- `docs/msc-research/units/2002001-hyaku-shiki/README.md`
- `docs/exvs-msc-syscall-47-notes.md` (`sys_47(0x10)` rotate)

## 1. What Hyaku does for “throw Dodai while aiming the enemy”

### 1.1 Registration

```text
func_241(0x7b65b9b7, ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH);  // ~2.c:30542
```

Comment in source: 特射 换锁分支 (special-shot lock-switch branch).

### 1.2 Action init — positive turn window

`ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH` (~L28605–28618):

```c
void ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH()
{
    func_586();
    global678 = func_1020;   // start
    global679 = func_1021;   // release
    global681 = 0;
    global683 = 0x5;
    global684 = 0x1;
    global685 = 0x1;
    global688 = 0x100;
    global691 = 0xa;         // turn-window frames (NOT 0xffffffff)
    global700 = 0x14;        // cancel-window related
    callFunc3(func_1019);    // driver
}
```

`func_586` already defaults `global691 = 0xa` and `global700 = 0x14`. The action **reasserts** the positive turn window. Other Hyaku actions that want **no** auto-face deliberately set `global691 = 0xffffffff`.

### 1.3 Driver — phase machine + per-frame rotate damping

```c
void func_1019()
{
    int var0;
    func_599();
    var0 = 0x3 * (0x64 - func_274()) / 0x64 + 0x61;
    func_106(var0, 0, 0);
    func_109(var0, 0, 0);
}
```

- `func_599` runs the shared ranged phase driver (`func_600` → `func_601` → …).
- `func_106` / `func_109` scale residual body/bone angles and call `sys_47(0x10, global20, 0x1, …)` (rotate damping). Same helpers exist on Gyan.

### 1.4 Shared aim branch inside `func_600` / `func_601`

Lock-face enable is latched at action entry (not only inside this action):

```c
global176 = global67;   // ~L2933
```

When locked (`global176 == 1`):

1. **`func_600`** arms the turn budget from the turn-window field:

   ```c
   global177 = global691 * 0x64;
   if (global177 > 0) {
       global721 = 0x1;   // soft-turn enable
       global722 = 0;
   } else {
       global721 = 0;
       global722 = 0;
   }
   // ... also sets camera/follow rates via sys_46(0x4/0xe, ...) when locked
   ```

2. **`func_601`** (every frame while locked) soft-turns then snaps:

   ```c
   global267 = sys_0(0x40000, 0x5);          // target-relative yaw
   // while turn budget remaining:
   var0 = func_102(global267, global177, 0);
   sys_46(0, var0);                          // apply yaw step
   // after budget exhausted:
   sys_46(0, sys_0(0x40000, 0x5));           // hard snap to target yaw
   ```

**Interpretation of “aim” on Hyaku for this action:**

| Layer | Mechanism | Required for Dodai throw feel |
|-------|-----------|-------------------------------|
| (a) Lock-face gate | `global176 == 1` from `global67` | Yes — only aims when locked |
| (b) Soft/snap body yaw | `sys_0(0x40000,0x5)` + `sys_46(0,…)` under positive `global691` | **Yes — primary missing piece on Gyan** |
| (c) Bone rotate damp | `func_106`/`func_109` → `sys_47(0x10)` | Secondary polish on driver |

### 1.5 Start / release (throw sequence)

- **Start `func_1020`:** motion/setup, ammo-style `sys_4F(0x7, 0x2, 0x1)`, sets `global254` when motion advances.
- **Release `func_1021`:** Dodai release FX, velocity impulses via `sys_46`, completion via `global254`.

These bodies are Hyaku-specific (hashes, bone mount). Gyan already has its own start/release/end; **do not copy Hyaku model/bone hashes**.

---

## 2. What Gyan has today

### 2.1 Working route (already done)

Documented in `gyan-dodai-special-shot-action-port.md`:

```text
0.c func_143 (flying + special-shot input)
  -> func_95(0x7B65B9B7, ...)
2.c registry
  -> GYAN_DODAI_SPECIAL_SHOT_ACTION
  -> START (motion/ammo) -> RELEASE (0xFF4828EA) -> END
```

Flight mode and projectile throw work. Cancel-stuck was fixed by setting `global252` before/around phase transitions.

### 2.2 Action init — turn window explicitly disabled

`GYAN_DODAI_SPECIAL_SHOT_ACTION` (~L26295–26312):

```c
void GYAN_DODAI_SPECIAL_SHOT_ACTION()
{
    func_586();
    global676 = GYAN_DODAI_SPECIAL_SHOT_START;
    global677 = GYAN_DODAI_SPECIAL_SHOT_RELEASE;
    global678 = 0;
    global679 = GYAN_DODAI_SPECIAL_SHOT_END;
    global681 = 0x3;
    global682 = 0x1;
    global683 = 0x1;
    global686 = 0x100;
    global698 = 0;
    global689 = 0xffffffff;   // disables aim turn budget
    global452 = 0x64;
    global453 = 0x60;
    global454 = 0x60;
    callFunc3(GYAN_DODAI_SPECIAL_SHOT_DRIVER);
}
```

### 2.3 Why this kills facing

Gyan’s local `func_600` / `func_601` are the **same shape** as Hyaku’s, with renumbered globals:

```c
// func_600
global175 = global689 * 0x64;
if (global175 > 0) {
    global719 = 0x1;   // soft-turn enable
} else {
    global719 = 0;     // disabled
}

// func_601
if (global174 == 0x1) {
    ...
    if (global719 == 0) {
        global722 = 0x1;     // mark "turn done" without ever yawing
    } else {
        // soft turn: sys_0(0x40000,0x5) + sys_46(0, var0)
        // then snap:  sys_46(0, sys_0(0x40000,0x5))
    }
}
```

With `global689 = 0xffffffff` (signed −1): `global175` is not `> 0`, so `global719 = 0`. The soft/snap yaw block is **never entered**. Lock-face flag `global174` can still be 1, but no yaw is applied.

`func_586` default for Gyan is `global689 = 0xa` — the Dodai action **overwrites** a working default with the disable sentinel.

### 2.4 Driver has no rotate damping

```c
void GYAN_DODAI_SPECIAL_SHOT_DRIVER()
{
    func_599();
}
```

Hyaku’s equivalent also runs `func_106`/`func_109` every frame. Gyan already implements those helpers with `sys_47(0x10, …)`; they are simply not called on this driver.

### 2.5 Gap table

| Piece | Hyaku lock-switch | Gyan Dodai now | Severity |
|-------|-------------------|----------------|----------|
| Hash `0x7B65B9B7` registered | Yes | Yes | OK |
| Turn-window field | `global691 = 0xa` | `global689 = 0xffffffff` | **CRITICAL** |
| Cancel-window field | `global700 = 0x14` | `global698 = 0` | Low |
| Lock-face enable | `global176 ← global67` | `global174 ← global67` | OK (if locked) |
| Soft/snap yaw in shared driver | Armed when turn-window > 0 | Disarmed | **CRITICAL** |
| Per-frame `func_106`/`func_109` | Yes on driver | No | Medium (feel) |
| Aim rate triad | defaults `454/455/456` | sets `452/453/454 = 0x64/0x60/0x60` | OK / stronger |
| Start/release/projectile | Hyaku-specific | Gyan-local (correct) | Keep |
| Completion flag | `global254` | `global252` | Already fixed |

---

## 3. Hyaku → Gyan field map (aim path)

Justified by identical use-site shapes (see also scratch `hyaku-gyan-aim-field-map.md`):

| Role | Hyaku | Gyan |
|------|-------|------|
| Lock-face enable | `global176` (`= global67`) | `global174` (`= global67`) |
| Turn-window frames | `global691` | `global689` |
| Turn budget residual | `global177 = global691 * 0x64` | `global175 = global689 * 0x64` |
| Soft-turn enable latch | `global721` | `global719` |
| Turn-complete | `global724` | `global722` |
| Phase complete | `global254` | `global252` |
| Cancel window param | `global700` | `global698` |
| Aim rate triad | `global454/455/456` | `global452/453/454` |
| Start callback slot | `global678` | `global676` |
| Release callback slot | `global679` | `global677` (Gyan also uses `global679` as END) |
| Target yaw query | `sys_0(0x40000, 0x5)` | same |
| Yaw apply | `sys_46(0, …)` | same |
| Rotate damp helpers | `func_106` / `func_109` → `sys_47(0x10)` | same local names/shape |

**Do not** key ports on equal `func_1018` / `func_1020` names from older unpack trees; key on hash `0x7B65B9B7` and the use-sites above.

---

## 4. Minimal recommended port recipe

### Must change (primary fix)

In `GYAN_DODAI_SPECIAL_SHOT_ACTION` only:

```c
// BEFORE (disables aim)
global698 = 0;
global689 = 0xffffffff;

// AFTER (Hyaku-equivalent turn window on Gyan globals)
global698 = 0x14;   // optional but matches Hyaku global700
global689 = 0xa;    // required: arms func_601 soft/snap yaw when locked
```

Or simply **delete** the `global689 = 0xffffffff` line so `func_586()`’s default `global689 = 0xa` remains.

**Effect:** when the player is locked on (`global174 == 1`), `func_601` will soft-turn then snap toward the enemy for the turn budget (`0xa * 0x64` frame-delta units) during start/release phases driven by `func_599`.

### Should consider (feel parity)

Extend the driver:

```c
void GYAN_DODAI_SPECIAL_SHOT_DRIVER()
{
    int var0;
    func_599();
    var0 = 0x3 * (0x64 - func_274()) / 0x64 + 0x61;
    func_106(var0, 0, 0);
    func_109(var0, 0, 0);
}
```

Uses **Gyan’s existing** `func_106`/`func_109` (already `sys_47(0x10)`). No Hyaku bone hashes.

### Must not change

- Do not replace Gyan’s three-phase `global676/677/679` topology with Hyaku’s two-phase `global678/679` layout unless a separate redesign is approved.
- Do not copy Hyaku Dodai model/mount hashes, `func_1076`/`func_1077`, or release velocity constants into Gyan.
- Do not rewrite `func_599`/`func_601` themselves — only re-enable the existing aim branch via init fields.
- Do not invent new cross-unit primary keys based on bare `func_N` equality.

### Runtime expectations after fix

1. Enter Gyan flight, lock enemy, special-shot.
2. During throw windup, body yaw should turn toward lock target (soft then snap).
3. Projectile `0xFF4828EA` still fires; ammo slot 3 still consumes; fall/release still exits flight.
4. Unlocked throw (`global67 == 0` → `global174 != 1`) should **not** force face — same as Hyaku gate.

---

## 5. Stock Gyan note

`E:\XB\mod\040msc\001gundam_005gyan00_001` has no flying Dodai special-shot route for `0x7B65B9B7`. Aim analysis and future patch targets apply to **`gundam_005gyan00_modified`**, not stock alone.

---

## 6. Related findings (same session, beyond pure yaw)

| Topic | One-line | Detail |
|-------|----------|--------|
| Pitch (up/down) | `global720` must be 1; `func_600` zeros it | Re-arm in **START every frame**, never DRIVER |
| Inertia | Not `global681–686` | Hyaku START `func_615(0x1, 0x1, 0x9, 0)` |
| Stuck after anim | RELEASE used `func_309(global20, func_14)` | `func_14` is not a frame; use `func_91()` / set `global252` after fire — **fixed in-game** |
| DRIVER policy | Gyan standard | Only `func_599();` |

## 7. Verification (static)

Committed structural test:

```text
python tools/tests/test_gyan_dodai_throw_aim_analysis.py
```

Asserts against real MSC trees:

1. Hyaku registry maps `0x7B65B9B7` → `ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH`.
2. Hyaku action sets `global691 = 0xa` and driver calls `func_106`/`func_109`.
3. Hyaku `func_601` contains `sys_0(0x40000, 0x5)` + `sys_46(0, …)` under lock-face enable.
4. Gyan Dodai action (at analysis time) set `global689 = 0xffffffff` and driver is `func_599`-only — re-run after local edits.
5. Gyan `func_601` has the same aim use-site shape with `global174` / `global689` / `global175`.
6. Field map pairs above are present in both sources.

In-game throw-while-locked feel was partially validated later in the same session (stuck fix confirmed; aim/pitch/inertia may still need follow-up).
