# msclang Phase 2 Roundtrip Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `2.dscex` decompile->compile drift by fixing confirmed `msclang.py` lowering bugs in boolean/branch lowering and nested function-call lowering.

**Architecture:** Keep `mscdec` and `msc_core` unchanged for this slice. Add targeted regression tests against real `2.dscex` sample scripts, then repair `msclang.py` in two narrow paths: `if`/negation lowering and nested-call `try`/`callFunc` lowering. Re-run corpus-level roundtrip tests after each fix so byte-diff reduction is measurable.

**Tech Stack:** Python 3, existing `tools/msc_core.py`, `tools/msclang.py`, real corpus under `E:\XB\解包\com\file\0xBDBE6FEA_test`

---

## File Map

- Create: `tools/tests/test_msclang_phase2_regressions.py`
- Modify: `tools/msclang.py`
- Modify: `docs/superpowers/specs/2026-06-23-msc-script-identity-layout-design.md`
- Verify: `tools/tests/test_full_roundtrip.py`
- Verify: `tools/tests/test_script_identity_layout.py`

---

### Task 1: Lock Repro With Focused Regression Tests

**Files:**
- Create: `tools/tests/test_msclang_phase2_regressions.py`
- Test: `tools/tests/test_full_roundtrip.py`

- [ ] **Step 1: Write failing targeted regression test script**

```python
import os
import sys
import tempfile
import subprocess

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from msc_core import MscFile, EXVS2_FORMAT, Command

TEST_DIR = r'E:\XB\解包\com\file\0xBDBE6FEA_test'
TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_FILE = '2.dscex'
TARGET_SCRIPT_INDICES = [283, 648, 1036]


def read_msc(path):
    msc = MscFile()
    with open(path, 'rb') as f:
        msc.readFromFile(f, EXVS2_FORMAT)
    return msc


def compile_c_to_temp(c_path):
    with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as tmp:
        out_path = tmp.name
    result = subprocess.run(
        [sys.executable, os.path.join(TOOLS_DIR, 'msclang.py'), c_path, '-o', out_path, '-i'],
        capture_output=True, text=True, cwd=TOOLS_DIR
    )
    return result, out_path


def command_bytes(script):
    return [cmd.write('>') for cmd in script.cmds if isinstance(cmd, Command)]


def test_target_script_bytes():
    original_path = os.path.join(TEST_DIR, TARGET_FILE)
    c_path = os.path.join(TEST_DIR, '2.c')
    result, compiled_path = compile_c_to_temp(c_path)
    if result.returncode != 0:
        print(result.stderr[-500:])
        return 1

    try:
        original = read_msc(original_path)
        compiled = read_msc(compiled_path)
        fails = 0
        for index in TARGET_SCRIPT_INDICES:
            original_bytes = command_bytes(original.scripts[index])
            compiled_bytes = command_bytes(compiled.scripts[index])
            if original_bytes != compiled_bytes:
                print(f'[FAIL] script {index}: command stream mismatch')
                fails += 1
            else:
                print(f'[OK] script {index}: command stream identical')
        return fails
    finally:
        if os.path.exists(compiled_path):
            os.unlink(compiled_path)


if __name__ == '__main__':
    failures = test_target_script_bytes()
    sys.exit(1 if failures else 0)
```

- [ ] **Step 2: Run targeted regression to verify it fails**

Run: `python tools/tests/test_msclang_phase2_regressions.py`

Expected:
- script `283` fails
- script `648` fails
- script `1036` fails

- [ ] **Step 3: Run corpus baseline to capture current byte drift**

Run: `python tools/tests/test_full_roundtrip.py`

Expected:
- `1.cscex` stays identical
- `2.dscex` still fails with very large byte diff

- [ ] **Step 4: Commit failing-test baseline**

```bash
git add tools/tests/test_msclang_phase2_regressions.py
git commit -m "test(msclang): add phase2 roundtrip regression coverage"
```

---

### Task 2: Fix `if` / `!` / boolean branch lowering

**Files:**
- Modify: `tools/msclang.py`
- Test: `tools/tests/test_msclang_phase2_regressions.py`

- [ ] **Step 1: Write a narrower failing assertion for script 283/648 branch lowering**

Extend the regression script with a helper that prints the first mismatching command index and byte pair for scripts `283` and `648`, so the branch fix is measurable.

```python
def first_mismatch(original_script, compiled_script):
    original_bytes = command_bytes(original_script)
    compiled_bytes = command_bytes(compiled_script)
    for i, (left, right) in enumerate(zip(original_bytes, compiled_bytes)):
        if left != right:
            return i, left.hex(), right.hex()
    if len(original_bytes) != len(compiled_bytes):
        return min(len(original_bytes), len(compiled_bytes)), 'len-mismatch', 'len-mismatch'
    return None
```

- [ ] **Step 2: Run test to confirm scripts 283 and 648 still fail before code change**

Run: `python tools/tests/test_msclang_phase2_regressions.py`

Expected: mismatch positions reported inside scripts `283` and `648`

- [ ] **Step 3: Repair `compileNode()` branch lowering**

Target block: `tools/msclang.py` in `elif t == c_ast.If:`

Current problem:
- `isIfNot` is computed
- emitted branch opcode ignores it and always uses `0x34`

Implementation shape:

```python
elif t == c_ast.If:
    nodeOut += compileNode(node.cond, loopParent, parentLoopCondition)
    isIfNot = False
    lastCommand = getLastCommand()
    if lastCommand is not None and lastCommand.command == 0x2b:
        if outputAB34 is True:
            nodeOut.remove(getLastCommand())
            outputAB34 = False
        isIfNot = True

    addArg()
    ifFalseLabel = Label()
    if node.iffalse is not None:
        endLabel = Label()

    branch_opcode = 0x35 if isIfNot else 0x34
    nodeOut.append(Command(branch_opcode, [ifFalseLabel]))
```

Do not widen this fix beyond the `If` lowering block in this task.

- [ ] **Step 4: Re-run targeted regression**

Run: `python tools/tests/test_msclang_phase2_regressions.py`

Expected:
- script `283` either passes or shows reduced mismatch count
- script `648` either passes or shows reduced mismatch count
- script `1036` may still fail

- [ ] **Step 5: Re-run corpus roundtrip**

Run: `python tools/tests/test_full_roundtrip.py`

Expected:
- `2.dscex` still fails overall
- reported byte diff should decrease from the baseline

- [ ] **Step 6: Commit branch fix**

```bash
git add tools/msclang.py tools/tests/test_msclang_phase2_regressions.py
git commit -m "fix(msclang): respect negated branch lowering"
```

---

### Task 3: Fix nested-call lowering and `try` pushBit propagation

**Files:**
- Modify: `tools/msclang.py`
- Test: `tools/tests/test_msclang_phase2_regressions.py`

- [ ] **Step 1: Write failing assertion focused on script 1036**

Add a script-specific failure summary for script `1036`, including:
- first mismatching command index
- original opcode stream head
- compiled opcode stream head

```python
def dump_head(script, limit=12):
    return [cmd.write('>').hex() for cmd in script.cmds if isinstance(cmd, Command)][:limit]
```

- [ ] **Step 2: Run targeted regression to confirm script 1036 still fails before code change**

Run: `python tools/tests/test_msclang_phase2_regressions.py`

Expected: script `1036` mismatch remains after Task 2

- [ ] **Step 3: Repair nested-call lowering in `compileNode()` and `addArg()`**

Target blocks:
- `tools/msclang.py` `addArg()`
- general function call path in `compileNode()` (`Command(0x2e, [endLabel])` + args + func ptr + `Command(0x2f, [...])`)

Implementation goal:
- preserve correct `try` pushBit when nested function-call result becomes an argument
- keep `callFunc` argument count consistent with emitted pushes
- avoid reordering nested call evaluation ahead of outer control flow

Minimum safe coding pattern:

```python
# keep outer try/frame creation tied to the call expression being compiled
nodeOut.append(Command(0x2e, [endLabel]))
...
for arg in node.args.exprs:
    nodeOut += compile_call_argument(...)
    addArg()
...
nodeOut += funcPtr
addArg()
functionCallCommand = Command(0x2f, [len(node.args.exprs) if node.args is not None else 0])
```

When editing `addArg()`, preserve current behavior for non-call commands and only adjust the inner `0x2f` / `0x2e` walk so nested calls mark the correct `try` frame.

- [ ] **Step 4: Re-run targeted regression**

Run: `python tools/tests/test_msclang_phase2_regressions.py`

Expected:
- scripts `283`, `648`, and `1036` all pass

- [ ] **Step 5: Re-run corpus roundtrip**

Run: `python tools/tests/test_full_roundtrip.py`

Expected:
- `1.cscex` remains identical
- `2.dscex` byte diff drops materially from baseline
- if `2.dscex` still fails, mismatch set should move away from scripts `283`, `648`, `1036`

- [ ] **Step 6: Commit nested-call fix**

```bash
git add tools/msclang.py tools/tests/test_msclang_phase2_regressions.py
git commit -m "fix(msclang): preserve nested call try semantics"
```

---

### Task 4: Final Verification And Documentation Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-06-23-msc-script-identity-layout-design.md`
- Test: `tools/tests/test_script_identity_layout.py`
- Test: `tools/tests/test_full_roundtrip.py`
- Test: `tools/tests/test_msclang_phase2_regressions.py`

- [ ] **Step 1: Run naming regression suite**

Run: `python tools/tests/test_script_identity_layout.py`

Expected: PASS

- [ ] **Step 2: Run phase 2 regression suite**

Run: `python tools/tests/test_msclang_phase2_regressions.py`

Expected: PASS

- [ ] **Step 3: Run corpus roundtrip suite**

Run: `python tools/tests/test_full_roundtrip.py`

Expected:
- `1.cscex` identical
- `2.dscex` improved over baseline

- [ ] **Step 4: Update design/spec notes with actual findings**

Add a short “Phase 2 findings” section to:
`docs/superpowers/specs/2026-06-23-msc-script-identity-layout-design.md`

Include:
- script indices fixed
- root cause categories confirmed
- residual gaps, if any

- [ ] **Step 5: Commit verification pass**

```bash
git add docs/superpowers/specs/2026-06-23-msc-script-identity-layout-design.md tools/msclang.py tools/tests/test_msclang_phase2_regressions.py
git commit -m "test(msclang): verify phase2 roundtrip repairs"
```
