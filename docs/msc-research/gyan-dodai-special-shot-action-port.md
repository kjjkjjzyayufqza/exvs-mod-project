# Gyan Dodai Special Shot Port

## Scope

This change ports Hyaku Shiki's flying Dodai special-shot route to Gyan while preserving Gyan's existing ground special shot.

Modified MSC sources:

- `E:\XB\解包\com\file\040msc\gundam_005gyan00_modified\0.c`
- `E:\XB\解包\com\file\040msc\gundam_005gyan00_modified\2.c`

## Root cause

Gyan's weapon-action selector `func_143` did not contain a flying special-shot branch that submits action hash `0x7B65B9B7`. Registering that hash only in `2.c` was therefore insufficient: `0.c` never requested the new action.

`func_92` originally registered callback slot `sys_1(0x10001, 0, 0x1, ...)` with raw value `0x5FEF`. This value is not an invalid callback. The original `func_143` file offset is `0x601F`, and `0x601F - 0x30 = 0x5FEF`; the callback stores a script-relative address excluding the MSC header. The plain decompiler does not normalize this particular argument, which made the valid callback look unresolved.

The source now uses `func_143` instead of the raw constant so `msclang.py` relocates the callback when recompilation changes script sizes. A round trip may still print a raw value: in the verified build, `func_143` is at file offset `0x5429` and the callback is `0x53F9`, preserving the same `-0x30` relationship.

Hyaku Shiki establishes both sides of the route:

1. Its initialization registers the weapon selector as the callback for `sys_1(0x10001, 0, 0x1, selector)` using the same script-relative convention.
2. The selector checks flying state bit `0x4000` and special-shot input bit `0x100`, then submits action `0x7B65B9B7`.
3. Its action registry maps `0x7B65B9B7` to the Dodai action implementation.

## Implemented route

The resulting Gyan route is:

```text
func_92
  -> register func_143 as weapon selector
func_143
  -> flying (global20 & 0x4000)
  -> special shot (global48 & 0x100)
  -> func_95(0x7B65B9B7, 1, 1, 8)
func_1011 in 2.c
  -> 0x7B65B9B7 maps to GYAN_DODAI_SPECIAL_SHOT_ACTION
start phase
  -> temporary existing motion 0x092AAC54
  -> consume one unit from ammo slot 3
release phase
  -> fire projectile 0xFF4828EA from projectile slot 5
  -> call func_464 to leave flying state and enter the existing transform-release/fall route
```

The flying selector intentionally does not check ammo availability. Ammo slot 3 is still consumed once during the action start phase, as required by the action behavior.

The temporary `GYAN_DODAI_SPECIAL_SHOT_DISPATCH` bridge was removed. Hash `0xC33AB4DE` again maps directly to `ACTION_ABC_FINAL_ATTACK`, preserving the original ground special-shot route.

## Design boundary

The dedicated action keeps the previously compiled Gyan ranged-action callback layout instead of replacing it with Hyaku Shiki's exact internal callback topology. This isolates the confirmed routing defect and avoids changing two independent runtime mechanisms in the same fix. The action still follows Hyaku Shiki's externally visible sequence: start, fire Dodai, then release flying state and fall.

## Cancel-stuck fix

Runtime testing found that after projectile `0xFF4828EA` was spawned, `GYAN_DODAI_SPECIAL_SHOT_ACTION` could remain stuck in the release/cancel transition.

The root cause is Gyan's local `func_599` phase driver. In this file, the driver advances the release phase only when `global252` is set:

```c
if (global252)
{
    global184 = 0x3;
    func_530(0x1);
    if (global679 != 0)
    {
        func_71(global679);
    }
    ...
}
```

Hyaku Shiki's decompiled script uses the same action pattern, but its local variables are numbered differently (`global254` for the completion flag and `global678/global679` for start/release callbacks). Gyan's equivalent fields are `global252` and `global676/global677/global679`. The first port correctly used Gyan's callback fields, but the custom release phase fired `0xFF4828EA` and entered `func_464()` without setting `global252`, so `func_599` could stay in phase 2.

The release phase now sets `global252 = 0x1` before calling `func_464()`. The flag is placed before `func_464()` because `func_464()` enters its own `callFunc3(func_465)` fall/release loop; the completion signal must be established before handing control to that route.

## Verification

Required static verification:

- AI edit-block validation for both modified MSC files.
- Compile both files with `tools/msclang.py` into temporary MSC outputs.
- Decompile the temporary outputs with `tools/mscdec.py`.
- Confirm the round trip preserves the relocated `func_143 - 0x30` callback relationship, flying selector hash `0x7B65B9B7`, action registration, slot-3 consumption, projectile `0xFF4828EA`, and original `0xC33AB4DE` mapping.
- Confirm no unfinished-work marker was introduced.

Runtime validation is still required in game: enter Gyan's flying mode, press special shot, verify the projectile appears, one unit is consumed from slot 3, and Gyan exits flying mode into the fall/release route.

## Verification results (2026-07-07)

All static checks passed:

- `check_msc_ai_blocks.py` accepted both modified MSC sources.
- `msclang.py` compiled both sources without errors.
- `mscdec.py` decompiled both temporary outputs without errors.
- The `0.c` round trip contains the flying `0x7B65B9B7` selection. Its callback value is `0x53F9`, and the generated `func_143` file offset is `0x5429`; `0x53F9 + 0x30 = 0x5429` confirms correct script-relative relocation.
- The `2.c` round trip maps `0x7B65B9B7` to its dedicated action, preserves slot-3 consumption and projectile `0xFF4828EA`, and maps `0xC33AB4DE` to the same function as the existing final-attack registration.
- No unfinished-work marker is present in the changed files.

Source SHA-256 values at the start and end of this correction:

| File | Before | After |
|---|---|---|
| `0.c` | `47db3eb68a3a6dc4a3492042018fcff43e25388e6a5c35125a6a755f56ec003a` | `34d35557d0e764179724d57571ff116f40d5813014941638b58b469e0e1c6395` |
| `2.c` | `e0b24a0ff6720b0f75174a64f64a731785e6f7e2b6070265b7c51018efbfc321` | `1de3cbcdc16c2e77effd1a3b6e5af84ea4c29dd9ffdc46a13c4981062c620bca` |

## Verification results (2026-07-07 cancel-stuck fix)

Static red/green assertion:

- Red: `GYAN_DODAI_SPECIAL_SHOT_RELEASE` fired projectile `0xFF4828EA` and called `func_464()`, but did not set `global252`.
- Green: the release phase now sets `global252 = 0x1` before `func_464()`.

Additional validation:

- `check_msc_ai_blocks.py` accepted the modified `2.c`.
- `msclang.py` compiled the modified `2.c` into `%TEMP%\gyan_dodai_cancel_fix_2.mscsb`.
- `mscdec.py` decompiled that temporary MSC into `%TEMP%\gyan_dodai_cancel_fix_2_roundtrip.c`.
- Round-trip static assertions confirmed action registration `0x7B65B9B7`, projectile `0xFF4828EA`, `global252 = 0x1` before the fall/release route call, and the original final-attack alias mapping. The decompiler renumbered the fall/release function name in the temporary round trip, but preserved the call structure.
