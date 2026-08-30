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

### Runtime refinement: held direction wins between START and SHOOT

The 2026-08-29 run shortened `global689` from `0xa` to `0x3`, but exposed the
writer order more clearly: pressing flight special initially faced the lock;
holding a direction then pulled yaw away for several START frames; the SHOOT
boundary snapped back to the lock.

The source order explains the three observations: `func_595` writes lock yaw,
then the same tick calls `func_167(0x1004000)`, which republishes flight control.
The translation/pose clamp clears movement and body-local bank but does not
write world yaw. Therefore the held flight direction can become the later yaw
writer until `func_595` performs its boundary correction.

The next E1 candidate preserves the load-bearing Messala order and adds only a
676 START tail writer after `func_167` and the target clamp, using the TV
`func_1042` shape: `func_102(func_626(),0x1f4,0x2)` then `sys_46(0,step)`.
It is forbidden during SHOOT so the gerobi cannot track, and during 679 so it
cannot compete with the analog handoff.

```text
H  START-tail lock yaw prevents held flight direction from winning the frame
P  press special while holding any direction: face remains on lock through all
   START frames; SHOOT direction, stop, effect, timing, and EXIT are unchanged
F  any START drift, SHOOT tracking, aim jitter, or EXIT regression falsifies H
```

### Runtime falsification: START-tail yaw did not change the symptom

The next 2026-08-29 run was indistinguishable from the previous build. The TV
`func_1042`-shape yaw step executed at the end of the scripted START tick but
did not stop held-direction drift or the SHOOT-boundary re-lock. This falsifies
the hypothesis that another MSC call inside the same tick merely ran later.

The direct yaw helper is removed. The next isolated candidate copies a state
present in the same target's working Bird CS tick and in TV flight shooting:
`global47 |= 0x40` after movement ownership. Common code checks
`(global47 & 0x2) && !(global47 & 0x40)` before part of its input/movement path,
so this is a candidate input/action suppression owner rather than another yaw
command. Its exact behavior remains E0 until the next run.

```text
H  global47 0x40 suppresses the held-direction owner that runs after MSC yaw
P  START stays on lock while direction is held; SHOOT remains non-tracking;
   timing, charge FX, stop, and analog EXIT remain unchanged
F  unchanged drift OR lost cancel/input after EXIT OR SHOOT tracking refutes H
```

### Runtime falsification: `global47 0x40` also had no effect

The following run again produced the same initial lock, held-direction START
drift, and SHOOT-boundary re-lock. The Bird-CS/TV `global47 |= 0x40` candidate
is therefore removed rather than stacked with another yaw command.

`global73` is not the missing discriminator: `func_586()` resets it to zero at
ACTION entry and `SPECIAL_SHOT_FLIGHT` has no later writer, so `func_626()` does
not enter its `+180 / +/-90 / dual-target-average` branches here.

Before changing movement state again, use the already shipped visual/timing
markers to establish artifact identity: this source starts the dual group-7
charge effect and uses 10f START / 40f SHOOT. If either marker is absent, the
game is not exercising this packed source and another MSC edit has no value.

### Diagnostic candidate: isolate the analog bit during START only

After D11-D13, the next build is an explicit state probe rather than another
yaw writer. On `global184==1` only, after `func_167(0x1004000)` and the target
translation/pose clamp, it clears `global24 & 0x4000` with
`func_169(0x4000)`. The first execution plays one target-native SE.

This is deliberately narrower than the historical foot-stop failure: it does
not stop the motor, change profile, clear `global714`, or run in SHOOT/679.
When `func_593` moves to SHOOT, the unchanged continuous-owner tick immediately
reasserts `0x4000` before the START-only condition is tested.

```text
H  global24 0x4000 is the post-MSC owner that lets held direction rotate START
P  probe SE fires once; START stays on lock; SHOOT, timing, FX, and EXIT are unchanged
F  SE fires but drift remains => 0x4000 is not the owner; no SE => branch/artifact mismatch
```

### Direction owner pinned in source: `global87 & 0x3c`

The clarified symptom is an ACTION-entry/START directional face, not a slow
post-tick drift. `global87` is refreshed every frame from engine field `0x7`.
The native flight script's `func_455` checks `global87 & 0x3c`, calls
`func_99(global87,0xa)`, and writes the resulting turn through `sys_46(0,...)`.

The next candidate removes the temporary `0x4000` probe and clears only these
four direction bits at `SPECIAL_SHOT_FLIGHT` ENTER and before `func_593` while
`global184` is 0/1. It does not clear the special-shot button or touch SHOOT,
motor/profile, continuous flight ownership, form, or 679.

```text
H  the transient face follows the global87 0x3c direction snapshot
P  holding any direction while pressing special never produces a direction-facing frame;
   lock aim, charge FX, SHOOT, timing, and EXIT remain unchanged
F  any direction-facing START frame remains OR special/cancel/EXIT changes
```

### Runtime refinement: the remaining frame is upstream of `2.c`

After masking `global87 & 0x3c` in `SPECIAL_SHOT_FLIGHT` ENTER and 676 START,
the user still observed one direction-facing frame at action entry. The
cross-script order explains it: `0.c func_6` publishes `global2` to shared
field `0x7` before `func_143` chooses and submits `0xd94d608f`. By the time the
`2.c` handler masks its local `global87`, native action commit has already seen
the held-direction snapshot.

The paired fix remains scoped to bird special. Immediately before
`func_95(0xd94d608f,...)`, `0.c` republishes field `0x7` as
`(global2 & 0xffffffc3) | 0x2`: all button bits remain, direction `0x3c` is
removed, and neutral `0x2` is supplied. `2.c` keeps its START mask because
`0.c` publishes fresh held input again on following frames.

```text
H  the last transient frame is the upstream field-0x7 commit snapshot
P  no held direction produces any direction-facing frame on special entry;
   button recognition, lock aim, SHOOT, timing, FX, and EXIT remain unchanged
F  any entry-frame direction face remains OR the special fails to submit
```

### Runtime falsification: paired `0.c`/`2.c` direction masks had no effect

The combined upstream neutral field-`0x7` republish and downstream
`global87 & 0x3c` START mask produced no observable change. Both edits are
removed. The transient is therefore not proven to be world-yaw ownership from
the held-direction snapshot.

Further source edits are blocked on visual discrimination. A short capture
must separate at least four candidates: world yaw, body-local pose, the looping
body/wing motion, and camera/lock framing. Repeating yaw or input masks after
D11-D15 would only stack already-falsified mechanisms.

### Explicit cancellation candidate: neutralize shared field `0x7` throughout START

The user explicitly requested removal of the direction-facing frame without a
video gate. The prior upstream change only republished neutral direction on the
submit frame; `0.c` restored raw held input on the next frame. The prior `2.c`
mask changed local `global87` but not native readers of shared field `0x7`.

The new isolated candidate updates both views at ACTION ENTER and every
`global184==0/1` START tick:

```text
held = sys_0(0x10000,0,0x7)
held = (held & ~0x3c) | 0x2
sys_1(0x10000,0,0x7,held)
global87 = held
```

It stops as soon as SHOOT begins, so directional input is not globally removed
and 679/analog handoff remain untouched.

```text
H  native post-submit readers of shared field 0x7 cause the START direction face
P  no START frame follows held direction; SHOOT and later input immediately resume
F  any START direction-facing frame remains OR input stays suppressed after SHOOT
```

### Messala timer alignment: aim ownership must cover the complete START

The reference action keeps `global689=0xa`. Rebellion shortened START to ten
logical frames but also shortened `global689` to `0x3`. That left approximately
seven START frames after the native `func_595` initial aim window had completed.
Held flight direction could own those frames, while the SHOOT transition wrote
lock-facing again.

The source now returns to the Messala value `global689=0xa`, matching the full
ten-frame START. All experimental direction, shared-field, `global47`, direct
yaw, and analog-bit overrides are removed. The target-specific 10f/40f timing,
charge FX, translation/pose clamp, resources, form latch, and immediate 679
remain unchanged.

```text
H  matching Messala's 10f aim window to the 10f START removes the ownership gap
P  held direction never wins during START; SHOOT does not visibly re-snap;
   timing, FX, stop, projectile, and EXIT remain unchanged
F  any START direction-facing frame or SHOOT re-snap remains
```

### Literal `func_970` comparison

Restoring Messala `global689=0xa` while retaining the target
translation/pose clamp did not remove the reported entry-facing transient. The
next comparison therefore stops mixing control owners: the target tick is now
the literal Messala body, `func_593(); func_167(0x1004000);`, with no target
clamp, input mask, direct yaw, analog-bit, or shared-field adapter.

Only non-portable content remains target-specific: motion/projectile/effect
resources, ammo slot, speed row, form allowlist, and FORCED_RECOVERY. Messala's
`0xc8fd1afb` motion and `func_893-896` TRS resources are absent, so this is a
control-flow comparison, not full visual equivalence. Target translation and
local bank may return; that is the intentional discriminator.

```text
H  the target-specific tick clamp caused the entry-facing transient
P  Messala tick removes the transient; translation/local bank may return
F  transient remains => it is outside the portable Messala control tick
```

### Rollback: literal `func_970` repeated registered failure I1

The runtime immediately reproduced the already-registered target delta:
Rebellion moved while locking and firing. This was not a new unknown; I1 had
already established that the target requires its translation/pose clamp after
the Messala continuous owner. The literal tick experiment is reverted.

Current source again uses `func_593(); func_167(0x1004000);` followed by the
target clamp only while `global184 != 4`. No aim, timing, FX, form, or EXIT
state changed in the rollback.

### Same-hash TV Zero supplies the missing aim owner

Deep research confirms Messala transform sub is a moving transform beam with
continued lever-held flight, so it is not a foot-stop/facing reference. It
remains valid only for the continuous `func_593 -> func_167` lifecycle.

The direct source reference is TV Zero's own `0xd94d608f`. Its `func_1042`
validates the current target index `global39`, reads target yaw through
`sys_0(0x40000,0x3,global39)`, limits the step with
`func_102(...,0x1f4,0x2)`, and writes `sys_46(0,step)` after its movement logic.
The earlier failed D12 helper used `func_626()` instead and therefore was not
the same-hash TV chain.

The new candidate keeps Messala continuous ownership and the proven Rebellion
clamp, then applies the exact TV target-indexed writer during START only. It is
not run during SHOOT or 679, so the gerobi cannot track and EXIT remains native.

```text
H  TV same-hash target-indexed yaw is the missing START facing owner
P  held direction never produces a START-facing frame; SHOOT remains fixed;
   stop, timing, charge FX, projectile, form, and EXIT stay unchanged
F  any START direction face remains OR SHOOT tracks/jitters OR EXIT regresses
```

## 2026-08-29 resolution: the missing prerequisite was the foot-stop, not a yaw writer

The TV writer ran and changed nothing, exactly like the four candidates before
it. The reason is already registered: `msc-falsified-negatives-registry.md` D9
records "飞行特射只清平移通道，依赖 `func_595` 自己接管朝向 -> 足止成功，但不对锁；
玩家仍能用飞行输入改变朝向", and
`wing-zero-rebellion-flight-special-footstop-handbook-audit.md` states the rule
directly: *if analog `0x4000` / ch-1 mag still run, `sys_46(0)` is overwritten by
flight heading; foot-stop is a prerequisite for aiming.*

The Messala-port build reproduced D9 literally:

| Owner | Where it is re-armed | What the old clamp did |
|---|---|---|
| `global24 & 0x4000` | `func_167(0x1004000)` in the tick, **every frame** | nothing |
| `sys_1(0x30001, 1)` flight motor | `func_594`: `global24 & 0x1000000` is set and `global122 (0x200) & 0x40000` is clear, so it takes the `func_296(0x3e8, 0x1)` branch | nothing |
| translation / body bank | - | cleared (ch 1/2, `sys_46(0x4,0x4,0)`, `func_300(0)`, `func_104/107`) |

So the script owned position but never owned heading, and every script-side yaw
writer was a later no-op. The `global184 == 4` skip additionally left the whole
679 phase with no clamp, which is the second reported symptom (heading swings on
cancel/exit).

### Implemented adapter

- `rebellion_flight_special_stop_translation` now also calls
  `func_296(0x3e8, 0)` after `func_167(0x1004000)`. `0x1000000` is left set so
  `func_594` does not take its `func_302(0)` / `global183 = 0` branch.
- The tick gates on a new `rebellion_flight_special_owner_released` latch instead
  of `global184 != 0x4`, so the foot-stop also covers 679.
- `rebellion_flight_special_release_flight_owner()` restores
  `func_167(0x1004000)`, `func_296(0x3e8, 0x1)` and `func_351(0x2, 0x4)` (the
  bird analog profile that the START body replaced with profile 0).
- `special_shot_flight_end` is the Rebellion translation of Messala `func_974`:
  Messala waits on the `0x157c` recovery motion, Rebellion bounds the same hold
  with `global244 >= 0x5 * 0x64` and then releases ownership in the same tick it
  sets `global252`. `func_598` resolves in that tick, so the analog handoff sees
  the restored state and the 2026-08-27 air-idle EXIT bug cannot return.
- `func_41` restores ownership when an abnormal exit (cancel, hit, forced
  recovery) replaces the hash before 679, but only while bird form is being
  kept; teardown paths still end through
  `rebellion_interrupt_bird_form_to_ground`, which deliberately leaves the flight
  bit and the motor off.

```text
H  the foot-stop, not another yaw writer, is what lets the action own heading
P  held direction never turns the body at START or during the cancel/exit
   window; lock aim, SHOOT, timing, charge FX, projectile, form and the analog
   handoff are unchanged
F  any START or exit direction face remains, OR EXIT returns to air idle /
   fake normal, OR the unit cannot fly after the action
```

### Runtime split 2026-08-29: the two clears do opposite things

First build dropped both `global24 & 0x4000` and the motor. Result: aim
ownership became correct (the beam holds the lock while the stick is held), but
the unit fired while moving - registered failure I1.

That separates the two halves cleanly:

| Clear | Owns | Verdict |
|---|---|---|
| `func_296(0x3e8, 0)` (`sys_1(0x30001, 0)`) | the native motor that lets input drive movement and heading | **keep** - this is what returns heading to the script |
| `func_169(0x4000)` | membership in the flight movement model | **remove** - the translation clears (`sys_46(0x4,0x4,0)`, `func_300(0)`, ch 1/2) are calibrated against that model's base movement vector, so dropping the bit turns the whole clamp into a no-op |

The rule to carry forward: the flight bit selects *which* base vector
`sys_46(0x4, ...)` and `func_300` scale; the motor selects *whether input drives
it*. A flight-form foot-stop must drop the motor and keep the bit. This also
explains the 2026-08-27 E3- retest, where a build that cleared both stopped
translation only because it additionally ran the `sys_46(0xF, 0x4, ...)` brake
that the INDEX now forbids.

### Runtime 2026-08-29, third pass: a single ownership latch was the bug

Second build removed `func_169(0x4000)` and kept the motor drop. The unit could
still move and re-aim through the *entire* beam - a wider symptom than the
original report, which was confined to the entry and cancel windows. That
widening is the diagnosis: the clamp was no longer running at all, not running
and failing.

Cause: the tick had been re-gated from `global184 != 0x4` onto a single
`owner_released` latch. Any path that set that latch early switched the clamp
off for the whole action, and unlike the phase gate there was no floor. The
gate is now the phase index again, with a separate `end_hold` flag whose only
job is to extend the same clamp across 679, plus a second flag guarding the
abnormal-exit restore so it can never fire before the action has actually taken
something away. (That second flag started as `motor_stopped`; once the motor
drop was removed it became `profile_swapped`, guarding the analog profile.)

Two other corrections from the same report:

- The clamp cleared only movement channels 1 and 2. It now runs the engine's own
  stop set - `sys_46(0x8, 0, 0, 0)` and `func_113()` from `func_56`/`func_73`,
  plus channels 1/2/3/4 exactly as `func_44` clears them on every action switch.
- The lock-facing writer ran during START only. The stick can only own heading
  on a frame the action leaves unwritten, so SHOOT and the 679 hold were open.
  It now runs on every clamped frame.

Neither reference unit is a foot-stop reference for *behavior*: Messala's
transform sub and TV Zero's `0xd94d608f` are both moving shots in OB. Messala
remains valid only for the `func_593 -> func_167` lifecycle shape; TV Zero
remains valid only as proof that the yaw writer has to run every frame rather
than in one phase. The stop itself is target-specific and has no donor.

### Runtime 2026-08-29, fourth pass: the motor has a shorter lifetime than the clamp

Windup and beam were finally correct - stopped, locked, stick inert. The failure
moved to EXIT and reproduced the 2026-08-27 fake-bird bug exactly: the moment the
shot finished the unit fell under gravity, kept bird visuals, and could not fly
again.

Single-variable attribution: the 2026-08-28 build (clamp only, motor never
touched) exited correctly. `func_296(0x3e8, 0)` is what I added, and it was held
until the frame 679 resolved. `func_598` resolves in the same tick it sets
`global252`, so the native resolver read the flight state with the motor still
down and picked air idle `0xf5f21169` over the flight loop `0x77b100ff` (native
class index `0x18`, registered in `0.c:606` - the engine owns that choice, `0.c
func_143` never submits it). The keep-form latch then held bird visuals over a
non-flight action: bird outside, normal inside, gravity on.

The first correction restored the motor at the start of the 679 hold instead of
at its end. That was superseded the same day by a stronger reading of the four
runs together - see below - and the motor manipulation was removed outright.

#### Superseding conclusion: the motor drop was never load-bearing

Laid side by side, the runs say the motor was never doing the work:

| Build | motor dropped | clamp running | per-frame lock writer | runtime result |
|---|---|---|---|---|
| 2026-08-28 | no | yes | no | **stops correctly and exits correctly**; brief heading transients at entry/cancel only |
| second | yes | no (latch bug) | no | free movement through the beam |
| third | yes | yes | yes | stop and heading correct; **falls after the shot** |

The 2026-08-28 row is direct evidence that the clamp stops the unit without
touching `sys_1(0x30001)` and that the flight handoff works when the motor is
left alone. The second row shows the motor drop alone does nothing. What changed
between rows two and three is the clamp being restored plus the per-frame lock
writer - so those two own stop and heading, and the motor drop was an unproven
addition that was also the only remaining difference from `ACTION_A_SHOT_BIRD`.

It is therefore removed rather than patched. The action now only ever *adds* to
the flight state: `func_167(0x1004000)` every tick, motor untouched, position
owned by the clamp, heading owned by the per-frame lock writer. `func_351(0, 0x4)`
in 676 is the one thing still taken away, tracked by
`rebellion_flight_special_profile_swapped` so `func_41` can put profile 2 back on
an exit that never reaches 679.

Rule to carry forward: **a foot-stop in flight form should be built out of the
movement-channel clears alone.** Touching `sys_1(0x30001)` buys nothing and puts
the flight handoff at risk.

#### `global698 = 0` gave the handoff a zero-length window

The right reference for EXIT is not Messala at all. `ACTION_A_SHOT_BIRD` is the
same unit's own bird-form ranged action, and it is the one that provably keeps
flying afterwards. Its tick is also just `func_593();` with **no**
`func_167(0x1004000)`, which by itself disproves the idea that continuous
per-tick flight ownership is what makes flight resume.

The load-bearing difference is the quartet:

| | `ACTION_A_SHOT_BIRD` (keeps flying) | flight special before this fix |
|---|---|---|
| `global698` | `0x14` | `0` (Messala) |
| `global452` / `453` / `454` | `0` / `0` / `0` | `0x64` / `0x61` / `0x61` (Messala) |

`global698` -> `global213` -> `func_93` `arg1` -> `global65`, published to engine
field `0x16` (`2.c:2842`) and read straight back by `0.c:279` as its `global33`.
The selector gate is:

```c
else if (!(global33 < 0x64))
{
    if (global22 != 0x2 && global26 != 0xb && global26 != 0xc && global26 != 0xd)
    {
        return;                 // no new action is committed
    }
}
```

With `global698 = 0` the window is zero, so `0.c` may commit on the resolving
frame itself and the native flight loop never gets a turn - control comes back
instantly and the unit is left in air idle with gravity on. That is both halves
of the report in one parameter.

Corroboration: `global698 = 0x14` appears 15+ times across Rebellion `2.c` and is
the value every other action uses, and the initialiser sets `global213 = 0x14`
(`2.c:3410`, `2.c:8379`). The flight special was the only `0` in the file - an
artefact of the Messala copy, not a choice. `global213` has no consumer other
than `global65 = global213 * 0x64` and `func_93`, so the change is contained.

`global452/453/454` are the momentum settings: `global452` goes to
`sys_46(0x4, 0x4, ...)` at phase 0 and `global453/454` become `global714`, the
per-frame `func_300` ramp. Messala's values mean "keep about 97% of movement",
which is correct for a moving shot and wrong for a foot-stop; the zeros also stop
the native ramp fighting the clamp.

#### The idle landing was an unrecoverable trap, not a wait

The keep-form latch's old comment - "idle hashes keep the latch until analog
commits" - assumed the unit could recover on its own from
`0xf5f21169` / `0x6d00aeaa`. It cannot:

```text
func_412 (0xf5f21169)  func_296(0x3e8, 0); func_169(0x14000); sys_46(0x4,0x4,0x64)
func_390 (0x6d00aeaa)  func_170(0x30000003)
```

Both wipe `global24 & 0x4000` and `0x1000000` and drop the motor, and **both**
`0.c func_143`'s bird input branch (gated on `global20 & 0x4000`, which is the
published `global24`) **and** the native flight loop (class index `0x18`,
`0.c:606`) are selected from that same state. Once there, nothing can select
flight again, so "until analog commits" is a wait that never ends - bird visuals
over a non-flight action with gravity on.

`func_41` now re-arms the flight bit and motor while the latch is set and the
current hash is one of those two. This is state only: it is not
`func_81(0x77b100ff)` and not an analog ENTER replay, so `func_452` still owns
`func_69(0x24)`, the remount and `func_74(0x38)`. The `0x77b100ff` branch above
clears the latch, so the re-arm stops the moment flight commits.

Static gates on the implemented build: `msclang.py` compile pass,
`check_msc_ai_blocks.py` pass, `check_msc_opaque_func_ptrs.py` pass with 0
warnings, `check_msc_action_shape.py` 0 errors,
`tools/tests/test_rebellion_flight_special_messala_flow.py` 9/9 pass. This is E1
until the next in-game run.
