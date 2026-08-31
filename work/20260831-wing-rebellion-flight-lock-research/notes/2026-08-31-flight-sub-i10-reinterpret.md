# Flight sub I10 reinterpret — analog heading, not missing SHOOT yaw

**Status:** E1/E2 static reread after E3- I9/I10. Stage-4 SE probe remains
the only licensed runtime discriminator. No new source edit.

## Artifact identity

- Current `2.c` MD5: `4EE55F49624B70267BD9806D4ACA11D9` (matches stage-4 note)
- Current `2.dscex` MD5: `21D619458912FA4A5208B2295237C9AE` (matches stage-4 note)

## What I9/I10 actually falsified

| Stage | Change | Runtime | What it does **not** license |
|---|---|---|---|
| I9 | `func_351(0x1,0x4)` on START/SHOOT ENTER | no observable delta | that the full TV moving-shot recipe failed |
| I10 | post-`func_593` `sys_46(0, func_102(func_626(),0x1f4,2))` while `global184==2` | no observable delta | more or faster yaw |

The previous write-up treated missing `func_167` as proof this tick is not
D12. That only excludes an MSC republish **after** the yaw write. I7 already
showed native analog writes heading whenever bird `global24 0x4000` stays on.
D9 / the foot-stop handbook say the same: live analog overwrites `sys_46(0)`.
This roll tick keeps `0x4000` on purpose (bird-main keep-form shape).

## Reference actions do not live-lock in SHOOT

- Hambrabi `func_1083`/`func_1086`: START hook sets `global689=0x6`; SHOOT
  writes lateral `sys_46(0x1,0x2)` at clip time `0x320`. No current-target
  yaw during SHOOT.
- Messala flight sub: START `func_595` only; tick then `func_167(0x1004000)`.
- TV `ACTION_AB_SUB_ALT_2/3`: profile 1 plus a dedicated clip, `func_168(0x1000000)`,
  `func_166` pose, and START-tick `global47 |= 0x40`. Copying only profile 1
  was I9.

## Probe matrix (already installed, WI-007)

```text
H  the first global184==2 tick runs
P  SE 0x46A7A8A6 plays once when SHOOT begins
F  silent SE
```

- Audible: MSC SHOOT ran; I10 yaw was overwritten. Next one-variable candidate
  is analog heading ownership during SHOOT, not another `sys_46(0)`.
  Still forbidden: `func_167` on this tick, flight-special clamp, stacking TV
  extras in one build, zeroing mix while analog leftover is the I8 class.
- Silent: `global184` is not 2, or this `2.dscex` is not the running artifact.
  Fix identity / phase before touching analog.

Owner note: `docs/msc-research/hambrabi-flight-sub-side-roll-shot.md` §4.10.
