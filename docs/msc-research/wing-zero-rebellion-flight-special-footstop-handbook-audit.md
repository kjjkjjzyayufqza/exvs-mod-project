# Rebellion 飞行特射足止 / 瞄准：MSC 手册全盘审计

**Date:** 2026-08-27  
**Kind:** Runtime audit against the MSC operating manuals  
**Target:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c` `SPECIAL_SHOT_FLIGHT`  
**Status:** Historical E3/E3- record. The custom foot-stop implementation was replaced on 2026-08-28 by the Messala continuous-owner adapter; see `messala-flight-sub-shot-flow.md`. New adapter E3 pending.

**Manuals used (do not skip on the next pass):**

- `docs/msc-research/msc-modder-operating-manual.md` — 目标 → ACTION → runtime → syscall → cleanup
- `docs/msc-research/modding-system-cards-handbook.md` — 射击卡 / 移动卡
- `docs/msc-research/sys46-script-parameter-atlas.md` — `sys_46` 子命令
- `docs/param-research/2026-08-01-speedparam-native-sys46-regrade.md` — native case 4 / F
- `docs/msc-research/func593-vanilla-ranged-slots.md` — 676/677/678/679
- `docs/msc-research/gyan-main-shot-no-auto-turn.md` — `global24 & 0x4000`
- `docs/msc-research/wing-zero-rebellion-special-n-bird-dash.md` — analog `func_452` / `func_44`

Do not treat Lightning `sys_41` / `0x700000` table VM as this unit's analog owner.

---

## Handbook protocol (what we traced)

```text
player: bird special, hover, face lock, gerobi
  -> 0.c func_143 bird 0x100 -> 0xd94d608f class (0, 0x1, 0)
  -> 2.c func_241 -> SPECIAL_SHOT_FLIGHT
  -> runtime family: func_586 + func_593 (676 start / 677 shoot / 678 no_ammo / 679 end)
  -> analog owner that must be stopped: ACTION 0x77b100ff func_452/453
  -> facing owner: func_595 sys_46(0, func_626()) where func_626 = sys_0(0x40000, 0x5)
  -> cleanup: 679 + func_41 restore analog ENTER bits; if native picked
     0xf5f21169 / 0x6d00aeaa, func_81(0x77b100ff) and keep the latch until
     analog commits. FORCED_RECOVERY / hit still uses the interrupt helper.
     Do not foot-stop after global184==4.
```

---

## Lifecycle / state ownership

| State | Owner | Bird analog value | Special ENTER | Special ACTIVE | EXIT / analog re-enter | INTERRUPT |
|-------|-------|-------------------|---------------|----------------|------------------------|-----------|
| hash `global3` | `func_95` / `func_44` | `0x77b100ff` | `0xd94d608f` | preserve | native next hash | FORCED_RECOVERY |
| form `global143` | transform + `func_41` | `0x2` | **preserve** (allowlist + latch) | preserve | preserve if analog | helper resets 0 |
| `global24 & 0x4000` | analog `func_167(0x1004000)` | set | **`func_169(0x4000)`** | re-clear after `func_593` while `global184 != 4` | **restore `func_167(0x1004000)` in 679 / `func_41`** | helper |
| `global24 & 0x1000000` | `func_168` / analog | set via `0x1004000` | keep (so `func_594` does not `func_302`) | keep | restore via `func_167` | helper |
| `sys_1(0x30001)` | `func_296(0x3e8)` | 1 | 0 | 0 after `func_594` re-enable until 679 | **restore 1 in 679** | helper 0 |
| analog profile | `func_351` / `sys_4A(0x3)` | `func_351(0x2, 0x4)` | `func_351(0, 0x4)` | same | **restore `func_351(0x2, 0x4)`** (loop first-frame `global226` will not) | helper |
| `sys_46` ch 1/2 mag | `func_453` | `sys_46(0x1, 0x1/2, …, global507)` | zero | zero | analog writes | `func_44` |
| channel 4 vector | `func_594` `sys_46(0x4)` + native | analog leftover | `sys_46(0x4,0x4,0)` + one `0xF` brake | `func_300(0)` | analog | helper |
| `global689` | ACTION ENTER | n/a | `0xa` (593 snap window) | 593 consumes | next `func_586` | discarded |
| `global452/453/454` | ACTION ENTER | n/a | 0 (no rush baseline) | `func_594` reads 452 | next `func_586` | discarded |
| loadout | `func_882` skip + `ensure_mounted` | bird | preserve; never `func_884` | preserve | analog loop remounts | helper detaches |
| motion | action handle `func_308` | slot `0x38` via `func_74` | loop `0x9de587ce` on handle | preserve | analog slot `0x38` | native |

---

## Why previous ports had no 足止 and no 瞄准

Handbook names, not Lightning table fields:

| What we copied | Manual meaning | Effect on this unit |
|----------------|----------------|---------------------|
| `sys_46(0x5, 0, 0x64, 0x64)` | atlas: **direct dash / rush seed**; same shape as `func_937` 突进 `sys_46(0x5, 0, 0x46, 0x64)` | **starts a rush**, opposite of hover |
| `func_296(0x3e9, 0)` only | `sys_46(0x6, 0)` flag; does **not** clear analog mag | analog leftover on ch 1/2 remains |
| skip `func_169(0x4000)` | Gyan: `global24 & 0x4000` **is** the flight bit; analog ENTER `func_167(0x1004000)` sets it | native flight analog stays on after ACTION switch |
| `func_168(0x1000000)` then `func_594` | `func_296(0x3e8, 1)` → `sys_1(0x30001, 1)` **re-enables** the flight motor | 足止 undone on the first 593 frame |
| Lightning `global811==1` `689=-1` | `func_595`: `689==-1` sets `global722=1` immediately, **skips** snap-aim | 4f start looks like no 瞄准 |
| bird-main `689=-1` / `693=0` | TV 变形主射: fly while shooting, **no** auto-turn | copies the wrong weapon |

Lightning `func_452` **also** `func_167(0x1004000)`. Their 足止 is a table VM (`global854` + their `0x5` args). Rebellion analog owner is `func_453` `sys_46(0x1, …, global507)`. Copying Lightning `0x5` onto that owner is the wrong adapter.

---

## EXIT bug (2026-08-27 runtime): fake-normal while airborne

Foot-stop was still applied after `func_596` set `global184 = 4` (679/598). Analog `0x4000` / `0x30001` stayed off into `func_93`. Native then picked air idle `0xf5f21169` (`func_412` also `func_296(0x3e8, 0)` + `func_169(0x14000)`). `func_41` cleared the keep-form latch and tore form because that hash is off the allowlist.

Result: bird form gone (fake normal), still in the air, landing motor off.

Bird main never clears analog, so it never takes this path. Natural special EXIT restores `0x4000` + `0x30001` once on 679 `global252`, not five frames earlier. Do not `sys_46(0x4,0x4,0x64)` (native case 4 writes 100% of the engine base vector → teleport). Do not `sys_46(0xF)` on this ACTION (interpolator outlives 598 and fights analog mag → hitch). `func_41` must **not** replay analog ENTER or `func_81(0x77b100ff)`. Latch only skips teardown until analog commits. Interrupt hashes still tear.

### 2026-08-27 E3- retest: translation stopped, yaw and reverse profile did not

Observed on the build that cleared `0x4000`, motor, channel 1/2 magnitude and
case-4 translation after `func_593`:

- translation foot-stop worked;
- the body did not face the lock and player flight input still changed heading;
- after 679 it entered air idle, retained bird visuals, could not fly, and
  automatically landed.

The failed build relied on `func_595` as the last yaw writer and restored only
`func_168(0x4000)` + `func_296(0x3e8,1)`. TV Wing Zero `func_1042` instead writes
lock yaw directly after movement with `func_102(lockYaw,0x1f4,0x2)` →
`sys_46(0,step)`. Rebellion `rebellion_transform_loop` also installs
`func_351(0x2,0x4)` on native flight ENTER; its `global226` one-shot is not
guaranteed to run again after the ranged action.

Current E1/E2 candidate therefore adds two halves of the same ownership adapter:

1. ACTIVE writes TV direct lock yaw after foot-stop, so player heading cannot
   win the frame.
2. Natural EXIT restores flight bit, motor, and profile 2 together immediately
   before `func_598` resolves the next action. INTERRUPT still uses
   FORCED_RECOVERY and never re-arms flight.

This candidate is not E3 until the next in-game run.

---

## Native / script 足止 that actually matches this analog

From the atlas + OB `sys_46` handler:

| Call | Layer | Role |
|------|-------|------|
| `func_169(0x4000)` | `global24` | drop native flight analog bit; keep form |
| `func_296(0x3e8, 0)` | `sys_1(0x30001, 0)` | flight motor off |
| `func_351(0, 0x4)` | `sys_4A(0x3, 0, 0x4)` | analog profile 0 (homemade sub / ALT_2) |
| `sys_46(0x1, 0x1/0x2, 0, 0, 0)` | analog mag channels | same clear `func_44` uses on ACTION switch |
| `sys_46(0x4, 0x4, 0)` | native case 4 | write channel-4 current vector = 0 |
| `sys_46(0xF, 0x4, speedparam[0x9A378388]*100, 1)` | native case F | interpolate leftover vector to **zero** (once on start) |
| `func_300(0)` | `sys_46(0x3, 0x4, 0, 0, 0)` | 0% scale so `func_595` mix is not 100% of leftover |

Do **not** call `sys_46(0x5)` on this ACTION.

---

## 瞄准 owner (593, not 587)

`func_593` / `func_595` (not Gyan `func_592`):

- `func_626()` = `sys_0(0x40000, 0x5)` lock yaw
- `sys_46(0, func_102(yaw, remaining, 0))` while `global689 != -1` and `global722 == 0`
- `global689 = 0xa` is Lightning `func_958` **before** the foot-stop flag; that is the snap window
- homemade `rebellion_sub_shot_custom_aim()` on start adds pitch (`func_105` / `0x40001/5`); stop on shoot so the gerobi does not sweep

If analog 0x4000 / ch-1 mag still run, `sys_46(0)` is overwritten by flight heading. 足止 is a prerequisite for 瞄准.

---

## Reference comparison (complete, not ENTER-only)

| Piece | Lightning air special | Rebellion analog | Adapter |
|-------|----------------------|------------------|---------|
| Driver | air `func_593` | same | keep 593 |
| Snap-aim | `689=0xa` unless table 足止 sets `-1` | 593 same globals | keep `0xa`, never `-1` |
| Analog ENTER | `func_167(0x1004000)` + `func_296(0x3e8,1)` | **identical** `func_452` | must clear `0x4000` + `0x30001` |
| Analog ACTIVE | `func_453` `sys_46(0x1,…)` | **identical** | ACTION switch stops the tick; leftover mag/bits remain |
| Table 足止 | `global854` → `0x3e9` + `sys_46(0x5, 876,877,878)` | no `0x700000` row | **do not copy `0x5`**; use 4/F + channel clear |
| Reverse | next analog ENTER `func_167(0x1004000)` | same | do not restore `0x4000` yourself |

---

## Resource proof (unchanged)

| Id | Current-target proof |
|----|----------------------|
| hash `0xd94d608f` | `0.c` bird `0x100`; `func_241`; `func_41` allowlist |
| loop `0x9de587ce` | already played by `ACTION_A_SHOT_BIRD` on the action handle |
| gerobi `CDA9F55A/B` | ground ALT_2; bird muzzle still the same pair |
| speedparam `0x9A378388` | native case F duration; consumed as `* 0x64` |

---

## Verification

- `check_msc_ai_blocks.py` / `check_msc_opaque_func_ptrs.py` on `2.c`
- compile/repack only when authorized (not run in this pass)
- in-game: bird special must hover, yaw to lock during start, then fire; analog after end must fly again; hit must FORCED_RECOVERY to ground
