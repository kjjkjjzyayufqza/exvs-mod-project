# Messala 飞行模式副射：完整 `func_593` 流程

**Date:** 2026-08-28  
**Status:** Continuous owner and translation clamp E3. Looping-motion 679 recovery wait E3- on 2026-08-28; immediate-end candidate built. Pose clamp retest not separately graded.  
**Kind:** Cross-unit MSC action-flow reference

## Sources

```text
Messala  E:\XB\mod\040msc\002zgundm_003mesala_001\0.c
         E:\XB\mod\040msc\002zgundm_003mesala_001\2.c
Target   E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
```

Messala source identity on 2026-08-28:

```text
0.c  MD5 2D75F7110DF6817CC962E6D6F8D75E74
2.c  MD5 BFECB301F7674EF09BFDE805E1118F57
```

## Selector and registry

Messala `0.c func_143` uses `global20 & 0x4000` as the flight-state gate.
Inside that branch, sub-shot input `global48 & 0x80` submits:

```c
func_95(0x9a74bce6, 0x1, 0x1, 0x7);
```

`2.c func_1043` registers:

```c
func_241(0x9a74bce6, ACTION_AB_SUB_LOCK_SWITCH);
```

Do not confuse this with normal-form sub shot `0xd4bbe3b6 -> ACTION_AB_SUB`.

## Complete action family

```text
ACTION_AB_SUB_LOCK_SWITCH  func_27383
  tick                     func_970
  676 start                func_971
  677 shoot                func_972
  678 no_ammo              func_973
  679 end                  func_974
```

ENTER follows the vanilla quartet exactly:

```c
func_586();
global676 = func_971;
global677 = func_972;
global678 = func_973;
global679 = func_974;
global681 = 0x1;
global682 = 0x1;
global683 = 0x1;
global686 = 0x100;
global689 = 0xa;
global698 = 0;
global452 = 0x64;
global453 = 0x61;
global454 = 0x61;
global142 = 0xc2b19d12;
callFunc3(func_970);
```

The load-bearing behavior is the complete tick:

```c
void func_970()
{
    func_593();
    func_167(0x1004000);
}
```

Messala does not clear flight state and later invent a restore path. It
reasserts the native flight state after the ranged driver on every phase,
including 679/598. Natural EXIT therefore reaches the next resolver with flight
ownership already present.

## Four phase bodies

### 676 `func_971`

- `global240` one-shot guard;
- `func_351(0, 0x4)`;
- Messala-only TRS helper `func_893()`;
- `func_168(0x1000000)`;
- start motion `0xc8fd1afb`;
- `func_94(0)`, `func_615(...)`, `func_166(...)`;
- motion rate `func_110(0x4b)`;
- transitions at motion time `0x76c`.

### 677 `func_972`

- `global240` one-shot guard;
- `func_351(0, 0x4)`;
- seeks the same motion to `0x834`;
- fires the slot-1 primary plus slot-5 paired projectiles;
- uses `global244 += global457` for timed secondary volleys;
- kills depiction with `sys_4E(0)` and exits after `0x1770`.

### 678 `func_973`

- seeks recovery frame `0x157c`;
- stops the weapon handle;
- runs Messala-only reverse TRS helpers `func_894/896`;
- exits through the normal no-ammo phase.

### 679 `func_974`

- seeks the same recovery frame;
- runs reverse TRS;
- sets `global252` on the motion-end predicate.

`func_893/894/895/896` only move Messala model parts with `sys_47`; they do not
own movement, aim, form, or action handoff.

## Compatibility proof

The following functions are byte-for-text identical between current Messala and
Rebellion `2.c`:

```text
func_167  func_308  func_351  func_586
func_593  func_594  func_595  func_596  func_597  func_598
```

Therefore the quartet and tick shape can be copied without inferring
`callFunc3` semantics.

## Rebellion adapter boundary

Copy directly:

- `func_586` + 676/677/678/679 + exactly one `callFunc3`;
- tick ordering `func_593(); func_167(0x1004000);`;
- `global689=0xa`, `global698=0`, `global452=0x64`,
  `global453/global454=0x61`;
- per-phase `func_351(0,0x4)` and native `global240/global244` ownership.

Keep target-specific:

- action hash `0xd94d608f` and Rebellion `0.c` selector;
- ammo slot `0x2`;
- flight speed row `0xc2b19d13`;
- main-shot loop `0x9de587ce`;
- current projectile pair and `sys_4E(0)` cleanup;
- bird props, allowlist, and FORCED_RECOVERY interrupt policy.

Do not copy:

- Messala motion `0xc8fd1afb` or projectile hashes without target resources;
- Messala form id `global143=1` or speed row `0xc2b19d12`;
- opaque helper numbers `func_893/894/895/896`; they are model-specific TRS.

Because Rebellion deliberately keeps a looping motion, its 679 cannot use
Messala's motion-end predicate literally; recovery still needs a bounded target
timer. This is the only phase-level adapter that cannot be copied verbatim.

## Lifecycle result

| Phase | Messala owner | Rebellion copy policy |
|---|---|---|
| ENTER | native quartet + flight-state tick | copy |
| ACTIVE | `func_593` then `func_167(0x1004000)` every frame | copy exactly |
| EXIT | same tick preserves flight through 679/598 | copy; no custom restore helper |
| INTERRUPT | Messala retains its own form policy | keep Rebellion FORCED_RECOVERY |
| RESPAWN | outside this action family | keep target initialization |

## Rebellion implementation checkpoint (2026-08-28)

The previous private `seg/frames`, `foot_stop`, `lock_aim`, and
`restore_analog` implementation was removed. The current target action uses the
Messala quartet parameters and exact continuous-owner tick while retaining
Rebellion resources and FORCED_RECOVERY.

```text
verified 2.c MD5       9069550521C7BF86306685BD47E7098F
verified 2.dscex MD5   97D198688429C02EA8F4E375E92E0725
verified 2.dscex SHA   82C8D42517EEE49B7DA3F12BA50D232E37E7CD25305721C703AD7AF39B8AE6D3
```

Static gates:

- Messala source-contract tests: 5/5 pass;
- `check_msc_ai_blocks.py`: pass;
- `check_msc_opaque_func_ptrs.py`: pass, 0 warnings;
- legacy `msclang.py`: pass;
- decompile/recompile round-trip: byte-identical.

Pre-registered runtime test:

```text
H  remaining directional response is body-local bank, not movement or world yaw
P  left/right input no longer tilts the body; aim/stop/shoot/EXIT stay unchanged
F  bank still changes OR world yaw/EXIT regresses
```

These gates establish E1 only for the translation clamp.

## 2026-08-28 runtime: lifecycle works, target translation remains

The user clarified the first report with discriminating observations:

- lock ownership works for the whole action;
- firing continues normally;
- natural recovery is normal;
- the unit still translates while locked, whereas Messala stops.

This confirms the continuous owner for aim/shoot/EXIT at E3 and narrows E3- to
ACTIVE translation only. The target-specific adapter now clears channel 1/2,
case-4 vector, and `func_300(0)` after `func_167(0x1004000)`, but never clears
`0x4000`, motor, or `global714`. It is skipped when `global184==4` so it cannot
damage the already-confirmed natural EXIT.

Static follow-up also found why the port must not be described as a full visual
or resource-equivalent Messala copy:

- Rebellion still used target-specific phase bodies instead of Messala
  `func_971/972/973/974`;
- Messala motion `0xc8fd1afb` is absent from the current Rebellion motion
  structure;
- no Messala motion package is present under the current `003motion` mod tree;
- `func_893/894/895/896` operate on Messala model root `0xcc145af4` and private
  part/bone hashes, so their numeric function calls are not portable;
- projectile and effect hashes also remain source-unit resources.

Those missing resources still affect pose, effects, and weapon sequence, but
they are not the current movement falsifier.

### Runtime refinement: translation passed, local bank remained

The next in-game run confirmed position stop and normal recovery. Left/right
input could still alter the body's local bank angle while stationary. Source
tracing pinned that state to `global268–273`, written to body channel 1 by
`func_104/107`; it is separate from world yaw (`sys_46(0)`) and translation.

The current E1 candidate therefore adds `func_104(0,0,0)` and
`func_107(0,0,0)` to the ACTIVE translation adapter. It remains skipped on
`global184==4`, preserving the already-confirmed natural EXIT.

### Runtime refinement: looping motion must not have an artificial 679 tail

The next run showed that after firing ended, player control had already
returned but the action continued locking the target and left through an odd
pose. The cause was the target-only ten-frame `global244` wait in 679:
`global184==4` correctly disabled ACTIVE clamps, while the ranged action still
owned lock and pose until the timer expired.

Messala waits on a real recovery motion. Rebellion deliberately keeps
`0x9de587ce` looping and has no equivalent recovery clip, so a synthetic wait
creates split ownership. The current candidate keeps one-shot weapon/effect
cleanup and sets `global252=1` immediately in the end body. Continuous
`func_167(0x1004000)` remains active, so this is not the dash E5 case where
early 679 destroys the only movement magnitude.
