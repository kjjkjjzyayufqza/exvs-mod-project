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
