# Rebellion Flight-Special UX Analysis

## Evidence grade

The three reported symptoms are E3 player observations for the reported build.
The source-to-symptom ownership trace is E1/E2. Proposed tuning remains E0 until
separately repacked and tested.

Source implementation was authorized on 2026-08-29: aim window 3f, START 10f,
SHOOT 40f, immediate 679, and the existing bird-CS charge-FX lifecycle. No
checker, compile, repack, or runtime verification was requested or run.

Runtime follow-up E3-: held direction won yaw after the initial lock during
START, followed by a SHOOT-boundary re-lock. The next source candidate adds the
TV direct lock step as the last writer after func_167/clamp during START only.
SHOOT and 679 remain excluded.

### F-004
- title: func_595 is not the final START yaw writer under held flight input
- severity: info
- category: design
- status: validated
- evidence_ids: [E-002, E-004]
- location: target 2.c special_shot_flight_tick
- impact: START visibly oscillates between lock-facing and input-facing ownership.
- confidence: high for the observed ordering symptom; candidate remains unverified
- remediation: Apply the TV lock-yaw step after func_167 and the target clamp during global184==1 only.

### F-005
- title: Additional MSC yaw at the START tick tail does not own the observed drift
- severity: info
- category: design
- status: validated
- evidence_ids: [E-004, E-005]
- location: target 2.c special_shot_flight_tick
- impact: Stronger or repeated sys_46(0) writes would add complexity without addressing the later input owner.
- confidence: high for the negative runtime result
- remediation: Remove the direct yaw helper; isolate the same-target Bird CS global47 0x40 state as the next candidate.

### F-006
- title: Bird-CS global47 0x40 does not own the observed START drift
- severity: info
- category: design
- status: validated
- evidence_ids: [E-005, E-006]
- location: target 2.c special_shot_flight_tick
- impact: A third source-side ownership hypothesis is falsified; further edits require artifact-identity confirmation.
- confidence: high for the negative runtime result
- remediation: Remove global47 0x40 and confirm the loaded build through the existing charge-FX and timing markers before another state probe.

### Diagnostic D-START-4000
- hypothesis: global24 0x4000 permits the held-direction owner after MSC yaw
- source change: clear only that bit during global184==1 after func_167/clamp; play one SE on first execution
- preserved state: motor, profile, global714, SHOOT, 679, form latch, timing, FX
- falsifier: probe SE fires but START drift remains

### Direction cancellation candidate
- source owner: func_455 reads global87 0x3c and writes sys_46(0)
- change: mask global87 with 0xffffffc3 at ACTION ENTER and 676 START before func_593
- preserved: special button and SHOOT input, continuous flight owner, motor/profile, form, timing, FX, and EXIT

### F-007
- title: Remaining direction-facing frame is captured before the 2.c handler
- severity: info
- category: design
- status: validated
- evidence_ids: [E-007]
- location: target 0.c func_6/func_143 to target 2.c ACTION commit boundary
- impact: A 2.c-only mask cannot affect the first native commit frame.
- confidence: high for source order; paired fix requires runtime confirmation
- remediation: Re-publish shared field 0x7 with neutral direction immediately before bird-special func_95, while retaining the 2.c START mask.

### F-008
- title: The observed transient is not controlled by the tested input/yaw states
- severity: info
- category: design
- status: validated
- evidence_ids: [E-004, E-005, E-006, E-007, E-008]
- location: flight-special entry visual state
- impact: Additional source-side yaw/input patches would be unsupported and risk lifecycle regressions.
- confidence: high for the five negative runtime results
- remediation: Revert the ineffective direction masks and require visual evidence distinguishing world yaw, local pose, motion, and camera before the next edit.

### Explicit START direction cancellation
- change: every ENTER/START tick rewrites shared field 0x7 and local global87 as neutral direction while preserving all non-direction bits
- boundary: stops at SHOOT; no change to projectile, timing, FX, movement owner, form, or EXIT
- evidence grade: E0 candidate until runtime

### Messala-aligned resolution candidate
- root mismatch: target global689=3 ended native aim ownership before the 10f START ended; Messala uses 0xa
- change: restore global689=0xa and delete all experimental direction/yaw/shared-field overrides
- preserved: 10f START, 40f SHOOT, charge FX, target clamp/resources, form, and immediate EXIT
- evidence grade: source-pinned candidate pending runtime

### Literal Messala control-tick candidate
- change: special_shot_flight_tick is exactly func_593 followed by func_167(0x1004000)
- removed: target translation/pose clamp and all prior direction/yaw adapters
- retained: target-only resources, ammo, speed row, timing, FX, form, interrupt, and immediate EXIT
- expected discriminator: entry transient versus returning target translation/local bank

### Rollback of literal Messala tick
- result: reproduced registered I1; unit moved while locking and firing
- correction: restore target translation/pose clamp after func_167, excluding global184==4
- scope: rollback only; no aim/timing/FX/form/EXIT changes

### Same-hash TV Zero aim candidate
- lifecycle owner: Messala func_593 -> func_167
- stop owner: Rebellion target clamp, excluded from 679
- aim owner: TV Zero 0xd94d608f func_1042 target-indexed yaw writer during START only
- key correction: use sys_0(0x40000,0x3,global39), not the previously failed func_626 helper
- evidence grade: E1/E2 source candidate pending runtime

## Lifecycle

| Phase | Current owner | Result |
|---|---|---|
| ENTER | SPECIAL_SHOT_FLIGHT + func_586 | 10f native aim window; 19f START; no charge-FX call |
| ACTIVE | func_593 -> func_167 -> target clamp | continuous flight/form ownership is preserved |
| EXIT | SHOOT timer -> immediate 679 | approximately 60/61f SHOOT is the visible delay; 679 itself is immediate |
| INTERRUPT | rebellion_interrupt_bird_form_to_ground | FORCED_RECOVERY; already clears bird-CS charge FX |
| RESPAWN | native initialization | form and effect groups rebuilt/cleared outside this action |

## Findings

### F-001
- title: Initial lock turn is intentionally spread over about ten frames
- severity: info
- category: design
- status: validated
- evidence_ids: [E-001, E-002]
- location: target 2.c:27026 and 2.c:16292-16374
- impact: Correct aim ownership can still feel too slow for combat rhythm.
- confidence: high for source structure; proposed shorter window requires E3
- remediation: First candidate should tune global689 only (for example 0x3 for a short three-frame turn), preserving the Messala continuous-owner tick.

### F-002
- title: Post-fire drag is the inherited Messala SHOOT timer, not 679
- severity: info
- category: design
- status: validated
- evidence_ids: [E-001, E-002, E-003]
- location: target 2.c:27089-27095 and 2.c:27116-27127
- impact: The target holds a single CS2-like emission for the duration intended for Messala's multi-volley sequence.
- confidence: high
- remediation: Keep immediate 679; test the target CS2 40f SHOOT threshold separately. Do not add a synthetic recovery wait.

### F-003
- title: Flight-special START omits the existing target-proven CS charge effect
- severity: info
- category: design
- status: validated
- evidence_ids: [E-001, E-003]
- location: target 2.c:27045-27072 and 2.c:32421-32435
- impact: Startup lacks the visual anticipation used by the same target's bird CS2.
- confidence: high
- remediation: Reuse rebellion_bird_cs_charge_fx_start after bird props/body are mounted; clear in SHOOT, NO_AMMO, and END. INTERRUPT already clears it.

## Recommended single-variable builds

1. Aim build: only global689 0xa -> candidate 0x3.
   H: shorter native aim window fixes combat rhythm without changing flight ownership.
   P: body faces lock within about three frames; stop/fire/exit remain identical.
   F: still visibly slow, overshoots/jitters, or player heading wins the frame.
2. Timing build: only START/SHOOT thresholds, preferably 10f/40f; keep immediate 679.
   H: target CS2 timing removes the Messala multi-volley tail.
   P: firing and return to analog are materially faster; projectile visual is not cut.
   F: beam is visibly truncated, cleanup occurs early, or analog handoff regresses.
3. FX build: only reuse the existing CS start/clear helper lifecycle.
   H: group-7 dual muzzle FX appears during START and never leaks.
   P: effect starts after props mount, clears on fire/no-ammo/end/hit.
   F: missing on START or visible after any exit/interrupt.

## Callflow path

### P-001
- title: Bird special input to analog handoff
- path_type: callflow
- start: 0.c bird input 0x100
- goal: return to 0x77b100ff flight ownership
- steps:
  1. action: submit 0xd94d608f; evidence: E-002; finding: F-001
  2. action: run 593 quartet with continuous func_167 owner and target clamp; evidence: E-002; finding: F-001
  3. action: finish target SHOOT timer and immediate 679 cleanup; evidence: E-002; finding: F-002
  4. action: native resolver commits analog while keep-form latch prevents teardown; evidence: E-002; finding: F-002
- residual_risks: exact preferred turn window and minimum safe beam lifetime are player-feel/runtime questions and cannot be settled from source alone.

## Next-run decision tree (2026-08-29 EXIT build)

This build deliberately stops at four changes so one run is attributable. The
remaining structural difference from the working reference is recorded here as
the pre-registered next lever, NOT applied.

Build contents:

1. motor lifetime split from clamp lifetime; motor restored at the START of the
   679 hold instead of at its end
2. `global698` 0 -> 0x14 and `global452/453/454` -> 0/0/0, matching
   `ACTION_A_SHOT_BIRD`
3. `func_41` re-arms flight bit + motor if native lands on `0xf5f21169` /
   `0x6d00aeaa` while the keep-form latch is set
4. 25f windup / 40f beam / 25f follow-through

Verified as NOT gaps: `func_413` never touches `global24` or the motor, so the
re-arm is not fought per frame; `global693` is read only by the `func_587`
family, so `ACTION_A_SHOT_BIRD`'s `global693 = 0` is irrelevant here; `global213`
has no consumer besides `global65` and `func_93`; `global142 = 0xc2b19d13` is
already the bird row so setting it is a no-op.

| Observation | Reading | Next single variable |
|---|---|---|
| Still airborne and flying after the shot | Goal met | none; tune `global698` only if the post-shot lock feels long |
| Still falls, and control returns immediately | The commit window is not the owner | NOT the tick's `func_167` and NOT `global689`/`func_595` - both excluded below. The only remaining difference from `ACTION_A_SHOT_BIRD` is that the motor was down at all for the 65 windup+beam frames, so the next lever is to stop dropping it and find heading ownership elsewhere |
| Still falls, but control is now locked for a beat first | `global698` worked, the flight state is still wrong at handoff | restore the motor one phase earlier, at the 677 -> 679 transition rather than in the 679 one-shot |
| Flies, but the stop or the lock regressed | `global452/453/454` = 0 changed the clamp's baseline | put `global452` back to `0x64` alone and re-run |
| Falls only when no direction is held | The resolver needs an input to pick flight | this is the 0.c selector, not the action; look at `func_143`'s bird branch gating |

### Ruled out by source: the tick's `func_167(0x1004000)` is not the EXIT owner

`rebellion_bird_main_shot_tick()` is only `func_593();` and keeps flying, so the
extra `func_167(0x1004000)` in `special_shot_flight_tick` was the last structural
difference and was registered as a candidate. It is now excluded.

On the resolving tick the chain is
`tick -> func_593 -> func_598 -> func_143(global212); func_93(...)`, and `func_93`
does not enter the next action:

```c
void func_66()          { global13 = 0x1; }
void func_97(int arg0)  { sys_47(0x4, global20, arg0); }   // motion blend-out
```

`global13` is only cleared at the top of the next frame's read phase
(`func_25`), so it is a "pick the next action next frame" request. The next
action's ENTER therefore runs on a later frame, and the `func_167(0x1004000)`
that follows `func_593()` cannot stomp it. What it does do is leave `global24`
holding the flight bits at exactly the moment the engine is about to select -
which is the desired state, not a hazard. `ACTION_A_SHOT_BIRD` does not need the
call because it never disturbs the flight state to begin with.

### Ruled out by source: `global689` / `func_595` is not an EXIT owner either

`ACTION_A_SHOT_BIRD` uses `global689 = 0xffffffff`, which sets `global722 = 1` at
once and skips the `global624` branch, so `func_145(0x2)` is unreachable there but
reachable here. `func_145` only walks the shell slots and calls
`func_318(global20, slot, arg0)`; it touches no movement, flight or motor state.
Everything else `func_595` does is `sys_46(0, ...)` yaw and the `func_300` ramp,
and the clamp overrides the ramp. Both units run `func_595` either way.

### Verified: the handoff frame already carries a healthy flight state

Traced precisely, the resolving tick is:

```text
func_593()  -> func_598()
                 func_72() -> END body -> end_hold = 0; global252 = 1
                 if (global252) -> func_143(global212); func_93(...)   // request
func_167(0x1004000)                                                    // flight bit set
gate: global184 == 4 && end_hold == 0  -> clamp and motor write both skipped
```

So at the moment the next action is requested: flight bit just set, motor on
(written on the previous hold frame, nothing turned it off this tick), analog
profile 2, and the clamp already stopped. That is the state
`ACTION_A_SHOT_BIRD` hands off with, and it is reached without the clamp being
active on the handoff frame. This is a positive check, not just an absence of
faults - the remaining uncertainty is whether the engine also needs the motor to
have been continuously on, which only a run can answer.

### State machine closure (checked before handing the build over)

Every read and write of the two flags, so the test run cannot be wasted on a
stuck action:

```text
end_hold         ENTER -> 0 | 679 one-shot -> 1 | hold expiry -> 0 | func_41 -> 0 (unconditional)
profile_swapped  ENTER -> 0 | 676 one-shot -> 1 | release_flight_owner -> 0 | func_41 -> 0
```

- The hold cannot stall: `global244 += global457` with a threshold is the same
  idiom 676/677/678 and every other action in the file use. `global457` is never
  written as 0 (`func_283` yields `0x64`, `sys_0(0x60010)`, `0x14` or `0x2`).
- `end_hold` cannot be set outside 679: `func_593` never returns to phases 1-3
  after `global184 = 4`, and `func_41` clears it unconditionally for any hash
  other than this action's, so an interrupt during the recovery hold cannot
  strand it.
- The motor cannot be left down because it is never taken down - the action only
  ever asserts `func_167(0x1004000)` and leaves `sys_1(0x30001)` alone.
- The analog profile cannot be left at 0: `release_flight_owner` restores
  profile 2 in the 679 one-shot, and `func_41` restores it on any exit that
  never reached 679. Teardown paths intentionally end flight-off via
  `rebellion_interrupt_bird_form_to_ground`, which runs after the `func_41`
  restore, so hit and forced recovery still demount correctly.

### Structural confirmation: state re-arm is the only lever that exists

`0.c:604-606` registers the native class table entries that matter:

```text
0x17  0x9475130e   transform enter (2.c func_450)
0x18  0x77b100ff   flight loop     (2.c func_452)
0x0a  0xf5f21169   air idle        (2.c func_412)
```

Neither `0x9475130e` nor `0x77b100ff` is ever submitted through `func_95` - the
only mention in `0.c` is a comment forbidding it. Both are chosen by the native
resolver from engine state alone. Therefore re-arming `global24`'s flight bits
plus the motor is not one option among several; it is the **only** lever the
script has for getting back into flight, which is what makes the `func_41`
re-arm the right mechanism and `global698` the thing that gives the resolver a
frame in which to use it. `func_452`, the handler behind index `0x18`, asserts
`func_167(0x1004000)` and `func_296(0x3e8, 0x1)` itself, so that pair is the
state the resolver is expected to see.

Source-side analysis is now exhausted: every EXIT candidate is either
implemented or excluded with a source citation, the flag state machine is closed,
and the only remaining unknown - whether the engine also requires the motor to
have been continuously on rather than merely on at handoff - is not decidable
from the scripts.

### Round-trip verification of the shipped bytecode

`msclang.py` output was decompiled back with `mscdec.py` and every piece of the
action was checked against intent. Renamed symbols: `func_946` = ACTION,
`func_947` = tick, `func_943` = clamp, `func_944` = release, `func_945` = lock
writer, `func_951` = 679; `global797/798/799` = keep_form / end_hold /
profile_swapped.

```c
void func_947()                       // tick: no motor call anywhere
{
    func_593();
    func_167(0x1004000);
    if (global184 != 0x4 || global798 != 0) { func_943(); func_945(); }
}

void func_943()                       // clamp: no func_296, no func_169
{
    sys_46(0x8, 0, 0, 0); func_113();
    sys_46(0x1, 0x1, 0, 0, 0); sys_46(0x1, 0x2, 0, 0, 0);
    sys_46(0x1, 0x3, 0, 0, 0); sys_46(0x1, 0x4, 0, 0, 0);
    sys_46(0x4, 0x4, 0); func_300(0); func_104(0, 0, 0); func_107(0, 0, 0);
}

void func_951()                       // 679: owner handed back on frame one
{
    if (global240 == 0) { ... global798 = 0x1; func_944(); }
    global244 += global457;
    if (global244 >= 0x19 * 0x64) { global798 = 0; global252 = 0x1; }
}
```

ENTER carries `global698 = 0x14` and `global452/453/454 = 0`; `func_41` carries
both the unconditional `end_hold` clear with the `profile_swapped`-gated restore
and the idle re-arm `func_167(0x1004000); func_296(0x3e8, 0x1);` in its else
branch. This confirms the compiler emitted the intended semantics, not merely
that the source text reads correctly. It is the strongest evidence obtainable
without running the game; there is no MSC interpreter in the toolchain, only
`msclang.py`, `mscdec.py`, `msc_cfg.py` and the static checkers.
