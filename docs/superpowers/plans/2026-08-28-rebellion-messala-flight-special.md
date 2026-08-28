# Rebellion Messala Flight-Special Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Rebellion's experimental flight-special state adapters with Messala's complete native `func_593` quartet and continuous flight-owner tick.

**Architecture:** Keep Rebellion's selector, form, motion, ammo, projectile, props, and interrupt policy. Copy Messala's action parameters and the load-bearing tick ordering `func_593(); func_167(0x1004000);`; adapt only phase visuals and bounded recovery for Rebellion's looping motion.

**Tech Stack:** Decompiled EXVS2 MSC C, `unittest`, legacy `tools/msclang.py`, `tools/mscdec.py`.

---

### Task 1: Pin the Messala contract

**Files:**
- Create: `tools/tests/test_rebellion_flight_special_messala_flow.py`
- Read: `docs/msc-research/messala-flight-sub-shot-flow.md`

- [x] **Step 1: Write the failing source-contract tests**

Assert that `SPECIAL_SHOT_FLIGHT` uses the native quartet with Messala's portable globals, that `special_shot_flight_tick` contains only `func_593()` followed by `func_167(0x1004000)`, and that private `seg/frames/foot_stop/lock_aim/restore_analog` symbols are absent.

- [x] **Step 2: Run the test and verify RED**

Run:

```powershell
python -m unittest tools.tests.test_rebellion_flight_special_messala_flow -v
```

Expected: failures showing the current custom tick and private phase state.

### Task 2: Replace the flight-special action family

**Files:**
- Modify: `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c`
- Backup: `tmp/msc/wing-zero-flight-special-20260827-2332/`

- [x] **Step 1: Back up current `2.c` and `2.dscex`**

- [x] **Step 2: Replace the complete AI block**

Use:

```c
void special_shot_flight_tick()
{
    func_593();
    func_167(0x1004000);
}
```

Set `global689=0xa`, `global698=0`, `global452=0x64`, and
`global453=global454=0x61`. Keep target ammo slot `0x2`, speed row
`0xc2b19d13`, motion `0x9de587ce`, projectile pair, props, and
FORCED_RECOVERY. Use native `global240/global244` in the four phase bodies.

- [x] **Step 3: Run the contract test and verify GREEN**

Run the exact Task 1 command. Expected: all tests pass.

### Task 3: Run MSC gates and build

**Files:**
- Output: `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.dscex`
- Generated verification artifacts: `tmp/msc/wing-zero-flight-special-20260827-2332/`

- [x] **Step 1: Run AI-block and opaque-pointer checks**

```powershell
python tools/check_msc_ai_blocks.py "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c"
python tools/check_msc_opaque_func_ptrs.py "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c"
```

- [x] **Step 2: Build with the legacy compiler**

```powershell
python tools/msclang.py "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c" -o "E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.dscex" -i
```

- [x] **Step 3: Verify byte-identical decompile/recompile round-trip**

Decompile the new binary under `tmp/msc/...`, recompile it, and compare SHA-256.

### Task 4: In-game evidence

- [ ] **Step 1: Test flight sub-style special lifecycle**

Observe aim ownership, movement during ACTIVE, natural return to controllable
flight, and hit/cancel FORCED_RECOVERY.

- [ ] **Step 2: Grade the result**

Update `messala-flight-sub-shot-flow.md` and the falsified-negatives registry
with E3 or E3- evidence. Do not infer behavior from the static gates.
