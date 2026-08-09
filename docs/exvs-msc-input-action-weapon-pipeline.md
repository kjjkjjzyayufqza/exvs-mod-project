# EXVS MSC Input -> Action Hash -> Weapon Callback Pipeline

## Overview

This document summarizes the current reverse-engineering model for how EXVS MSC turns player input into a concrete weapon action callback.

It focuses on one practical question:

- when the player presses the main shot button, how does that become a script callback like `setupMainShotScriptCallbacks()`?

This page is intentionally narrower than the architecture overview. It does not try to fully name every action hash. Instead, it records the currently strongest evidence chain from:

- input recognition
- input-to-action selection
- action hash dispatch
- action callback execution
- likely "actual shot fired" point

---

## One-Sentence Conclusion

Current evidence supports the following model:

- the main shot button does **not** directly call `setupMainShotScriptCallbacks()`
- instead, input is first normalized into an **action hash**
- when that action hash is `0xf48d2d49`, the script system dispatches to `setupMainShotScriptCallbacks()`
- inside that chain, `mainShotOnInitScript()` looks like startup / preparation, while `mainShotOnPhaseTickScript()` is the strongest current candidate for the actual fire/spawn step because it issues `sys_4F(0, global682, ...)`

---

## Scope And Confidence

This document mixes three confidence levels:

- **Confirmed**: directly supported by the current `0.c` / `2.c` script flow or native syscall analysis
- **High confidence**: strongly implied by multiple code paths but still lacks one final runtime or native proof
- **Tentative**: plausible working hypothesis only

The most important caveat is:

- `0xf48d2d49` should currently be read as an **action hash / action key**, not as "the A button itself"

---

## Pipeline Summary

### Stage 1: Input Is Recognized In The Low-Level Script Layer

In the current model, low-level input recognition lives earlier in the pipeline, and writes structured values into shared MSC-visible slots.

At a high level:

- raw button state is recognized in the lower input layer (`0.c`-side logic)
- the result is converted into action-related values and written via `sys_1(0x10000, ...)`
- `2.c` later reads those values back through `sys_0(0x10000, ...)`

This means the `2.c` action layer is not reading raw button edges directly. It is consuming an already interpreted action state.

---

### Stage 2: `2.c` Reads The Current Action Candidate

The key readback point is:

```1875:1885:E:\XB\解包\com\file\0xF1EF3B32\2.c
void initSecondaryActionChannelHandles()
{
    global13 = 0;
    pendingActionHash = sys_0(0x10000, 0, 0x11);
    global10 = sys_0(0x10000, 0, 0x14);
    if (pendingActionHash != 0 && pendingActionHash != 0xffffffff && pendingActionHash != 0xfffffffe)
    {
        global67 = sys_0(0x10000, 0, 0x1c);
        global52 = sys_0(0x10000, 0, 0x1d);
        global50 = sys_0(0x10000, 0, 0x1a);
    }
}
```

Current interpretation:

- `pendingActionHash` is the most important action-hash-like value in this stage
- `global67`, `global52`, and `global50` look like route / subtype / state bits associated with that action

---

### Stage 3: The Action Hash Becomes The Current Dispatch Key

Later, `advanceActionInputFrame()` advances the current action:

```2740:2751:E:\XB\解包\com\file\0xF1EF3B32\2.c
    previousActionHash = activeActionHash;
    activeActionHash = pendingActionHash;
    global53 = 0;
    var0 = sys_0(0xf0000, 0x7);
    if (activeActionHash == 0xffffffff || activeActionHash == 0xfffffffe)
    {
        func_53();
        var1 = 0;
    }
    else
    {
        processValidActionHandleFrame();
```

Current interpretation:

- `pendingActionHash` is the newly chosen action id
- `activeActionHash` is the action id now entering the dispatch path
- `previousActionHash` preserves the previous action id and is sometimes used by later callbacks

So if the system wants to execute the main shot action, the important question is:

- does the current frame resolve `pendingActionHash`, then `activeActionHash`, to `0xf48d2d49`?

---

### Stage 4: The Engine Resolves `activeActionHash` Into A Registered Callback

The lookup step appears in `processValidActionHandleFrame()`:

```2824:2831:E:\XB\解包\com\file\0xF1EF3B32\2.c
    var4 = sys_0(0x10003, 0x2, activeActionHash);
    if (var4)
    {
        var5 = sys_0(0x10002, 0x2, activeActionHash);
    }
    sys_2(0, 0x3, var5);
```

This strongly suggests:

- `sys_0(0x10003, 0x2, activeActionHash)` checks whether the action id is registered
- `sys_0(0x10002, 0x2, activeActionHash)` fetches the callback function pointer
- `sys_2(0, 0x3, var5)` schedules or invokes that callback

This is the key bridge from:

- action hash

to:

- concrete script function

---

## Why `bindActionHashHandler(0xf48d2d49, setupMainShotScriptCallbacks)` Matters

Inside `registerAllActionHashHandlers()`, the script registers a large action table:

```29819:29819:E:\XB\解包\com\file\0xF1EF3B32\2.c
    bindActionHashHandler(0xf48d2d49, setupMainShotScriptCallbacks);
```

And `bindActionHashHandler()` itself is the registration helper:

```6228:6243:E:\XB\解包\com\file\0xF1EF3B32\2.c
void bindActionHashHandler(int arg0, int arg1)
{
    int var2;
    sys_1(0x10002, 0x2, arg0, arg1);
    var2 = sys_0(0x1000a, 0x2, arg0);
    if (arg1 != 0)
    {
        if (var2 == 0)
        {
            sys_1(0x10004, 0x2, arg0, 0x1);
        }
    }
```

So the exact meaning is:

- register action hash `0xf48d2d49`
- bind it to callback `setupMainShotScriptCallbacks`

This line does **not** say:

- "button A means `setupMainShotScriptCallbacks`"

It says:

- "if the resolved action id is `0xf48d2d49`, dispatch to `setupMainShotScriptCallbacks`"

---

## Current Best Main Shot Candidate

### Working Hypothesis

Current best hypothesis is:

- `0xf48d2d49` is a strong candidate for the **main shot action hash** in this sample

### Why It Is Only A Candidate

We can currently show:

1. it is a real registered action hash
2. it has a non-trivial callback chain
3. that chain contains what looks like startup and actual weapon-fire logic

But we **cannot** yet show, from this document alone, a final single branch that says in plain text:

- "A button always resolves to `0xf48d2d49`"

That final statement still depends on:

- the upstream input-selection rules
- current state / route flags
- weapon mode / form state
- any branching hidden behind `global67`, `global52`, `global50`, `global174`, or similar variables

So the safest wording is:

- `0xf48d2d49` is the strongest current **main-shot action-hash candidate**

---

## `setupMainShotScriptCallbacks()` Chain

### `setupMainShotScriptCallbacks()` = Action Initialization

```25873:25907:E:\XB\解包\com\file\0xF1EF3B32\2.c
void setupMainShotScriptCallbacks()
{
    resetActionScriptRuntimeState();
    actionInitCallback = mainShotOnInitScript;
    global679 = 0xffffffff;
    actionPhaseTickCallback = mainShotOnPhaseTickScript;
    global682 = 0;
    global683 = 0x1;
    global684 = 0x1;
    global686 = 0xffffffff;
    global687 = 0x100;
    global689 = 0x71;
    global690 = 0xa;
    // ...
    callFunc3(runMainShotScriptDeferredSetup);
}
```

Current interpretation:

- `resetActionScriptRuntimeState()` resets shared weapon/action state
- `actionInitCallback = mainShotOnInitScript` installs the main phase callback
- `actionPhaseTickCallback = mainShotOnPhaseTickScript` installs a later phase callback
- `callFunc3(runMainShotScriptDeferredSetup)` advances into the next phase

So `setupMainShotScriptCallbacks()` itself looks like:

- **main-shot action setup**

not:

- the exact frame where the projectile is created

---

### `runMainShotScriptDeferredSetup()` = Immediate Follow-Up / State Advance

```25909:25918:E:\XB\解包\com\file\0xF1EF3B32\2.c
void runMainShotScriptDeferredSetup()
{
    tickActionScriptRuntime();
    if (global201 == 0x1)
    {
        
    }
    if (global202 == 0x1)
    {
        func_32(0xa);
    }
}
```

This looks like a short transition step:

- run phase-state maintenance
- apply conditional side behavior
- prepare the state machine for the later callbacks

---

### `mainShotOnInitScript()` = Startup Motion / Preparation

```25922:25944:E:\XB\解包\com\file\0xF1EF3B32\2.c
void mainShotOnInitScript()
{
    if (global241 == 0)
    {
        global241++;
        global171 = 0;
        func_885();
        if (global700 == 0x19)
        {
            func_610(0x12fce7d8, 0xd, 0x9);
        }
        else
        {
            func_610(0x82229d23, 0xd, 0x9);
        }
        if (!(sys_0(0x90000, global682, 0) != 0))
        {
            global137 = 0;
        }
        sys_4A(0x1, 0xb, 0x6);
        sys_4A(0x1, 0xb, 0x7);
    }
```

Current interpretation:

- startup state enters only once
- `func_885()` and `sys_4A(...)` look like presentation / setup logic
- `func_610(..., 0x9)` installs a timed phase value

This makes `mainShotOnInitScript()` the strongest current candidate for:

- startup motion
- pre-fire visual preparation
- startup timing setup

---

### `mainShotOnPhaseTickScript()` = Strongest Current "Actual Fire" Candidate

```25950:25965:E:\XB\解包\com\file\0xF1EF3B32\2.c
void mainShotOnPhaseTickScript()
{
    if (sys_0(0x90000, global682, 0) != 0)
    {
        func_123(0x3a0);
        sys_58(0x9, 0x4c9a9d5b);
    }
    if (global700 == 0x19)
    {
        sys_4F(0, global682, 0x19797af8);
    }
    else
    {
        sys_4F(0, global682, 0xe376479b);
    }
    global202 = 0;
    global29 = global29 | 0x10000;
}
```

Why this is the strongest current "actual shot fired" point:

- it is the first clearly weapon-like branch in the chain
- it emits `sys_4F(0, global682, hash)`
- current `sys_4F` notes already support that `subcmd 0` is very close to "consume/use slot resource and trigger a fire-related resource definition"

Current best interpretation:

- `mainShotOnPhaseTickScript()` is the point where the script turns the prepared main-shot state into a real fire/spawn request

Confidence:

- **high confidence** for "this is the key fire/spawn stage in the script"
- **not yet fully confirmed** at the native level as "projectile object creation" without one more level of `sys_4F` native tracing

---

## Startup Delay / Timing

The clearest timing setup currently appears in `mainShotOnInitScript()` through `func_610(..., 0x9)`:

```16702:16708:E:\XB\解包\com\file\0xF1EF3B32\2.c
void func_610(int arg0, int arg1, int arg2)
{
    global705 = arg0;
    global706 = arg2 * 0x64;
    global181 = 0x1;
    func_612(0, arg1);
}
```

In the current main-shot candidate path:

- `arg2 = 0x9`
- so `global706 = 0x9 * 0x64 = 0x384 = 900`

Current interpretation:

- this is a startup timing gate or scheduled threshold in internal script time units

Important caveat:

- this should **not** yet be written as "9 frames"
- current evidence only supports "900 internal timing units in this script-side system"

---

## What `0xf48d2d49` Most Likely Represents

Current best interpretation:

- `0xf48d2d49` is an **action hash / action key**
- it is probably not a random integer
- it likely comes from some authoring-time identifier such as:
  - an action name
  - a weapon script node name
  - a resource key
  - a hashed symbolic id

What it does **not** mean:

- it does not mean the A button itself
- it does not directly reveal the original human-readable string

If the original identifier was hashed from a string:

- it may be impossible to invert directly
- but it can still be named behaviorally through script and runtime evidence

For reverse-engineering purposes, this is already enough to work with:

- `0xf48d2d49 = current strongest main-shot action-hash candidate`

---

## Current Pseudocode Model

```cpp
// low-level input layer
if (player_pressed_main_shot_button) {
  write_action_slots(...);
}

// action selection layer in 2.c
currentHash = read_slot_0x11();
if (currentHash is valid) {
  activeActionHash = currentHash;
  callback = lookup_registered_callback(activeActionHash);
  schedule(callback);
}

// if activeActionHash == 0xf48d2d49
setupMainShotScriptCallbacks() {
  reset_action_context();
  nextMainPhase = mainShotOnInitScript;
  nextFirePhase = mainShotOnPhaseTickScript;
  schedule(runMainShotScriptDeferredSetup);
}

mainShotOnInitScript() {
  setup_startup_state();
  setup_timing_gate(900_internal_units);
  play_startup_presentation();
}

mainShotOnPhaseTickScript() {
  issue_fire_request_via_sys_4F();
}
```

---

## Open Questions

The following are still unresolved:

1. Which exact upstream branch turns "A button pressed" into action hash `0xf48d2d49` in all states?
2. Is `0xf48d2d49` always main shot, or only main shot in one route / form / weapon state?
3. Does `sys_4F(0, global682, ...)` create the projectile directly, or does it enqueue a downstream depiction/weapon event first?
4. What is the original human-readable source name, if any, behind `0xf48d2d49`?

---

## CRC32 Reverse Tool

To support action-hash origin research, the repository now includes:

- `tools/crc32_reverse_search.py`

This tool is designed for the exact situation discussed in this document:

- we have a target hash such as `0xf48d2d49`
- we do not know the original string format
- a full brute-force inversion is unrealistic
- we still want the highest practical hit rate on a desktop CPU

### Search Strategy

The tool does **not** pretend CRC32 is directly reversible.

Instead it searches in layers:

1. built-in EXVS-style domain words
2. user-provided extra words
3. template combinations such as:
   - `main_shot`
   - `shot_main`
   - `weapon_main_shot`
   - `mainshot`
4. optional controlled brute force over a chosen charset and max length

It also supports:

- multiple target hashes
- multi-process execution
- JSON checkpoint save/resume

### Example Commands

Search one target with the built-in EXVS-oriented dictionary:

```bash
python tools/crc32_reverse_search.py 0xf48d2d49
```

Add your own words and use all CPU workers:

```bash
python tools/crc32_reverse_search.py 0xf48d2d49 ^
  --word main ^
  --word shot ^
  --word rifle ^
  --word normal ^
  --workers 20
```

Add a short controlled brute-force tail sweep:

```bash
python tools/crc32_reverse_search.py 0xf48d2d49 ^
  --word main ^
  --word shot ^
  --workers 20 ^
  --bruteforce-max-length 4 ^
  --checkpoint tmp/crc32-mainshot.json
```

Search with a fixed prefix and suffix, and brute-force only the middle:

```bash
python tools/crc32_reverse_search.py 0xf48d2d49 ^
  --prefix main_ ^
  --suffix shot ^
  --workers 20 ^
  --bruteforce-max-length 12 ^
  --checkpoint tmp/crc32-mainshot-affix.json
```

Search with a structural mask where `?` means any character from the brute-force charset:

```bash
python tools/crc32_reverse_search.py 0xf48d2d49 ^
  --mask "m??n_????" ^
  --bruteforce-charset "abcdefghijklmnopqrstuvwxyz_" ^
  --workers 20
```

Resume an interrupted search:

```bash
python tools/crc32_reverse_search.py 0xf48d2d49 ^
  --resume tmp/crc32-mainshot.json ^
  --workers 20
```

### Important Limitation

Even if the real source name was hashed with CRC32:

- the hash is not directly invertible
- the best practical approach is still behavior-guided search plus constrained candidate generation

So this tool should be treated as:

- a high-throughput candidate searcher

not:

- a guaranteed inverse decoder

---

## Recommended Reading Order

1. `docs/exvs-msc-analysis.md`
2. `docs/exvs-msc-syscall-4f-notes.md`
3. `docs/exvs-msc-syscall-4f-native-handler.md`
4. `docs/exvs-msc-input-action-weapon-pipeline.md`

---

## See Also

- `docs/exvs-msc-analysis.md`
- `docs/exvs-msc-syscall-47-notes.md`
- `docs/exvs-msc-syscall-4e-notes.md`
- `docs/exvs-msc-syscall-4f-notes.md`
- `docs/exvs-msc-syscall-4f-native-handler.md`
- `tools/crc32_reverse_search.py`



这次重命名的重点
0.c
我把输入主链相关的名字改得更接近职责了，核心包括：

func_1 -> snapshotPreviousInputEdgeStates
func_2 -> buildKeyboardStateAndPressReleaseEdges
func_4 -> pollAllInputSlotsIntoGlobals
func_6 -> flushInputAndComboMaskToEngineSlots
func_9 -> resolveActionCandidatesIntoGlobals
func_10 -> writeResolvedActionFieldsToSharedInputSlots
func_81 -> combineActionMaskWithChordSimultaneousBits
func_103 -> runComboBufferUpdatePipeline
func_104 -> applyPerBitHoldTimersFromLatchMask
func_105 -> normalizeMutuallyExclusiveDirectionBits
func_106 -> updateDirectionalHistoryAndDecayTimers
func_107 -> accumulateNewEdgesIntoComboBuffer
func_113 -> evaluateMacroRowsAndSetComboBits
func_120 -> consumeAndClearComboBufferBits
同时把最核心的输入边缘 globals 也改了：

global1 -> prevKeyboardStateBits
global2 -> currentKeyboardStateBits
global3 -> prevPressedInputEdges
global4 -> pressedInputEdges
global5 -> prevReleasedInputEdges
global6 -> releasedInputEdges
2.c
我把动作 hash 分发和主射链的核心主干改了：

func_24 -> initPrimaryActionChannelHandles
func_25 -> initSecondaryActionChannelHandles
func_51 -> advanceActionInputFrame
func_52 -> processValidActionHandleFrame
func_241 -> bindActionHashHandler
func_242 -> queryActionHashBinding
func_586 -> resetActionScriptRuntimeState
func_587 -> tickActionScriptRuntime
func_895 -> setupMainShotScriptCallbacks
func_896 -> runMainShotScriptDeferredSetup
func_897 -> mainShotOnInitScript
func_898 -> mainShotOnPhaseTickScript
func_1051 -> initializeActionScriptRegistration
func_1052 -> registerAllActionHashHandlers
对应的关键 globals 也一起改了：

global4 -> activeActionHash
global6 -> pendingActionHash
global8 -> previousActionHash
global678 -> actionInitCallback
global681 -> actionPhaseTickCallback

---

## Action Mask Notes (No Hash Version)

This section records the current action-mask understanding for the `0xBDBE6FEA` script pair using `0.c` + `2.c`.

Important scope rules:

- Do not use this section as a global rule for all units/scripts.
- This section intentionally omits action hash values.
- This section uses control naming from `config.ini`:
  - A = Shoot (`射撃`)
  - B = Melee (`格闘`)
  - C = Boost/Jump (`ジャンプ`)
  - D = Target switch (special utility input)

### Input-Level Button Mapping

Current working mapping at input-mask level (`global2`):

- `0x100` => A (`射撃`)
- `0x40` => B (`格闘`)
- `0x80` => C (`ジャンプ`)
- `0x400` => D (`switch target`, special and excluded from most combat-combo semantics)

### Action Mask Semantics

Current working mapping at action-mask level (`global83` / `global48`):

- `0x1` => A (`射撃`)
- `0x2` => B (`格闘`)
- `0x80` => A+B (`サブ`, Shoot+Melee)
- `0x100` => A+C (`特射`, Shoot+Jump)
- `0x200` => B+C (`特格`, Melee+Jump)
- `0x400` => A+B+C (`覚醒技`)
- `0x800` => Charging-shot subsystem trigger (hold Shoot or Melee long enough; not a plain one-frame tap combo)

### Directional Variants

Some masks can branch into neutral vs directional variants:

- A+B family has neutral and directional branches.
- B+C family has neutral and directional branches.

For reverse-engineering workflow, treat these as one logical action family first, then split into:

- neutral version
- directional version

after runtime confirmation.

### D-Key Handling Rule

D (`switch target`) should be treated as a special utility input:

- It should not be grouped into normal combat combo naming.
- It can influence guards/branches, but it is not part of the core A/B/C combat triad.

### Practical Naming Standard

Use the following naming in notes, tooling, and tests:

- A = Shoot (`射撃`)
- B = Melee (`格闘`)
- C = Boost/Jump (`ジャンプ`)
- A+B = Sub (`サブ`)
- A+C = Special Shoot (`特射`)
- B+C = Special Melee (`特格`)
- A+B+C = Awakening Skill (`覚醒技`)

This keeps script-side action-mask research aligned with gameplay-side terminology.

---

## Result poses (victory / defeat) action hashes

**Settled** for typical unit `2.c` registration tables (including
`wing_gundam_zero_rebellion_msc`):

| Action hash | Registration | Entry callback | State slot | Meaning |
|---|---|---|---|---|
| `0xf32aa1ba` | `func_241(0xf32aa1ba, func_480)` | `func_480` | `0x34` via `func_69(0x34)` | **Victory pose 1** |
| `0x900ab393` | `func_241(0x900ab393, func_482)` | `func_482` | `0x35` via `func_69(0x35)` | **Defeat pose 1** (失败 pose 1) |

Also mirrored at boot by `func_2(hash, entry, slot)` so the same hashes stay
linked to slots `0x34` / `0x35` if the primary `0x10002` row is missing.

### Dispatch shape (do not confuse with main shot)

```text
func_241(0xf32aa1ba, func_480)     // victory pose 1
  -> engine resolves action hash 0xf32aa1ba
  -> func_480
  -> func_69(0x34)                 // load slot tick (often func_871 / func_870)
  -> callFunc3(func_481)           // keep ticking via func_72

func_241(0x900ab393, func_482)     // defeat pose 1
  -> func_482
  -> func_69(0x35)
  -> callFunc3(func_483)
```

Main shot remains a **different** hash → `ACTION_A_SHOT` path
(`func_586` / phase callbacks / ammo). Replacing
`func_241(mainShotHash, ACTION_A_SHOT)` with `func_871` (or only calling
`func_871()` once) will not correctly play victory pose 1: `func_871` is a
**slot `0x34` tick**, not an action-hash entry handler.

### Practical rules

1. To rebind or force **victory pose 1**, keep hash `0xf32aa1ba` → `func_480`
   (or an entry that still does `func_69(0x34)` + continuous `func_72` ticks).
2. To rebind or force **defeat pose 1**, keep hash `0x900ab393` → `func_482`
   (or equivalent `func_69(0x35)` entry).
3. Slot tick functions registered with `sys_1(0x10001, 0x2, 0x34, ...)` may
   branch on unit mode (`func_186()` etc.); that changes *which* tick body runs
   on the slot, not the pose action-hash identity above.