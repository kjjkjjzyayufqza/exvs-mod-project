# Mission graph control flow: go / no-go (phase 2)

**Date:** 2026-09-21
**Status:** E1/E2 research record. **No capability is Go.** No in-game run this session (do not read `Status: E3` here). Behaviour remains untested.
**Scope:** Over Boost (`vsac27_Release.exe`, `OBHK0.3_v27`) only. Cluster `mission-script`.
**Evidence protocol:** [msc-evidence-grade-and-ingame-audit-protocol](../msc-research/msc-evidence-grade-and-ingame-audit-protocol.md)
**Owners:** [exvs2-ob-triad-mission-architecture](./exvs2-ob-triad-mission-architecture.md), [triad-course-category-rules](./triad-course-category-rules.md), catalog `CLUSTER_MISSION_SCRIPT`
**Editor contract:** [mission-node-editor](../mission-node-editor.md) (Phase 2 is research-only; TODO-labeled UI is not Go)
**Compiler contract:** [mission-node-editor](../mission-node-editor.md)

Catalog match used: `python tools/msc_research_catalog.py --match "mission script branch variable coroutine 0x601 0x802"`.

This note does **not** ship a compiling control-flow feature. Phase 1 of Mission
Node Editor remains a linear Opening → Phase → End projection over
`exvs-mission-graph-v1`. Product amendment 2026-09-22: Research-only / No-Go
rows may appear in the editor as **Planned (TODO)** fragments or locked No-Go
cards. They are source-unverified, they block Generate, and they are not fed
into `graphToModel` / `generateC`. **Nothing here is Go** (E2 ownership plus
a user-run E3 H/P/F matrix; compiler Identical; ENTER/EXIT/INTERRUPT restore written down).

IDA was not attached this session. New ABI questions (fiber cap, native event
types, array reset on retry) stay at the grades below; they are not silently
promoted.

## Falsified-negatives grep (2026-09-21)

Grep of `docs/msc-research/msc-falsified-negatives-registry.md` before any claim:

| Symbol | Hit | Relevance to this note |
|---|---|---|
| `sys_0(0x349)` | dispatcher has no case, always 0 (architecture E2; catalog `do_not`) | Win bit `0x8` is not a target-count. Do not use as a branch input. |
| Dead `0x400` P9/P10/P12/P15/P18/P19/P22/P23/P24/P40/P41 | catalog `do_not` | Not control-flow. |
| G4 | write-back without `Identical`; `000triad_battle_f013_001` refused | Any future probe pack still needs Identical. Do not change guards. |
| `func_35` / `func_14` / `global24` elsewhere | unit-script rows (Rebellion dash, flight `0x4000`) | **Different scripts.** Mission `global24` is the delay countdown, not the unit flight flag. |
| `0x601` / `0x802` / `0x803` / `0x32d` as authoring features | **no row** | No E3- yet. Do not invent one. |

No registry row was added this session (no new E3 / E3-).

## Name map: architecture §9.3 roles vs A-30-1 table slots

Architecture §9.3 is a **role sketch**. The editor/compiler template is
`000triad_battle_a030_001` in `src/services/missionTranspiler/template.ts`.
Decompiler names are **table slots**, not stable role ids. Lab compile checks
`func_20 = 0x97d` and `func_15 = 0x9de`.

| Role | Architecture §9.3 name | A-30-1 slot (this template) | Grade |
|---|---|---|---|
| Cost init (once from `main`) | `func_16` | `func_14` | E1 |
| Per-frame main line | `func_14` | `func_16` via `callFunc3` | E1 |
| Win/lose evaluator | sketched as tick `func_19` then `func_25` | `func_17` (calls `func_21`..`func_25`; `0x31c` on success) | E1 |
| Retreat / despawn pass | sketched as tick `func_25` | `func_19` (`0x604`/`0x601`/`0x603` row `0x3c`) | E1 |
| Timeout result helper | `func_25` | `func_25` (called **from** `func_17`, not beside `(*global0)()`) | E1 |
| Event coroutine | `func_18` | `func_15` at bytecode `0x9de` | E1 + lab pin |
| Respawn coroutine | `func_17` | `func_20` at bytecode `0x97d`, ends `0x803` | E1 + lab pin |
| Post-win wait | — | `func_18` (`0x34f` then `func_19`) | E1 |
| Setup / opening / chain | `func_33` / `func_34` / `func_35` | same slots | E1 |

Do not re-litigate the **tick shape**. Settled structure (architecture E2 + template E1):

- `CMissionScript` installs only `sys_0` (`sub_140DBEE10`).
- `main` runs setup, cost init, `sys_0(0x802, event_offset)`, then `callFunc3(tick)`.
- Tick: if win/lose already committed → replace the line with post-win wait; else retreat pass then `(*global0)()`.
- `global0` is the current phase **function pointer**. Opening is `func_34`; authored chain is `func_35` as `if (global20 == n) / else if`.
- `global20` is the sequential phase index. `global24` is the delay countdown (`func_2` seconds×60). Empty last arm does **not** end the battle.
- Write-back still requires `mission_round_trip_status == Identical`. `000triad_battle_f013_001` stays refused.

Correction to the 2026-09-21 draft: `func_25` is **not** a sibling of `(*global0)()` on the A-30-1 tick. Retreat (`func_19`) runs **every live tick**, including during authored phases. That owns row `0x3c` of the private array.

## Official syscall census (E2, architecture Appendix C, 343 OBHK scripts)

| Call | Sites / scripts | Implication |
|---|---|---|
| `0x802` | 686 / 343 = **exactly 2** | `main` starts the event line; the event line starts respawn. A third start is unprecedented. |
| `0x803` | 343 / 343 = **exactly 1** | Only the respawn line ends itself. |
| `0x32d` / `0x32e` / `0x330` | 343 / 343 each | One event-loop consumer per script. |
| `0x601` | 343 / 343 = **exactly 1** | One write (retreat scratch). |
| `0x604` | 343 / 343 = **exactly 1** | One clear of that list. |
| `0x603` | 1372 / 343 = **exactly 4** | Four reads in the same retreat helper. |
| `0x602` / `0x605` / `0x606` / `0x607` / `0x608` / `0x609` | **absent** | Engine handlers exist (E2 IDA in architecture §9.6); official scripts never call them. |
| `0x40f` | 912 / 271 | Common wave gate. |
| `0x459` | 35 / 12 | Elapsed-frame gate (F-class / timed). |
| `0x45a` | 66 / 12 | Slot HP% gate. |

Architecture §9.7 listing “custom state `0x601..0x609`” as a script feature is an
**E0 product inference**. Corpus says official author chains do not use those
arrays as blackboard. Do not treat §9.7 as a Go.

Wave rewrite covers **163/343** simple `global20` chains. The other 180 still
look sequential but add mid-wave `0x33f`, `0x324`, `func_31`, or `0x459` and are
refused by `mission_script_config` (E2). That is extra **linear** shape, not a fork.

## Go / No-Go rule (unchanged)

- **Go:** E2 ownership plus a user-run E3 H/P/F matrix; compiler Identical; ENTER/EXIT/INTERRUPT restore policy written down.
- **Research only:** expressible in C, runtime ownership unknown. No UI.
- **No-Go:** breaks the fixed tick, cannot exit, dead syscall, or cannot round-trip.

UI is not a fourth verdict. Research-only rows may appear as Planned (TODO)
sketches; No-Go rows may appear as disabled warning cards. Neither compiles.
Neither is Go until a later pack produces Go.

## Shared runtime lifecycle (author sequence)

A-30-1 names. Grade E1 structure unless marked.

| Phase | Evidence |
|---|---|
| ENTER | `func_33` sets `global20 = 0`, `global0 = func_34`, runs `func_32`, `0x40d`, zeros `global21..24`. `main` then `0x802(func_15)` and `callFunc3(func_16)`. |
| ACTIVE | `func_16`: `func_17()` false → `func_19()` then `(*global0)()`. `func_34` yields on `0x454` / `0x800`, deploys opening via `func_12`, `0x453(1)`, `global0 = func_35`. `func_35` evaluates **one** `global20` arm per tick: trigger (`0x40f` / `0x459` / `0x45a`) **gates** `func_2`; false trigger **waits** (does not take an else successor). On fire: `global24 = 0`, `global20 += 1`, actions. |
| EXIT (author chain) | Last arm is empty. `global0` stays `func_35`. Tick still runs `func_17` / `func_19`. |
| EXIT (battle) | `func_17` returns 1 after `0x31c`. Tick does `callFunc3(func_18)`. Author phases **stop**. `func_18` waits `0x34f` then `func_19`. |
| INTERRUPT | Unit hit/down/death is native. Respawn is the `0x802` event fiber (`func_15` type `1` → `func_20`). Author phases do not pause that path and do not own it. |
| REINITIALIZE | `func_33` resets `global20/21/22/23/24` and `global0`. No documented restore of `0x601` rows. Whether a stage retry re-runs `main()` is E0 (not probed). Next course stage loads a **new** script. |

### Shared state ownership

| State | Owner / writer | Readers | Normal | Alternate | ENTER | EXIT (chain) | EXIT (battle) | INTERRUPT |
|---|---|---|---|---|---|---|---|---|
| `global0` | `func_33` / `func_34` | `func_16` | `func_34` then `func_35` | post-win: tick replaced, pointer unused | set `func_34` | preserved `func_35` | not read | preserved |
| `global20` | phase arms | `func_35` | 0 .. N | last index = empty arm | 0 | last index | frozen | preserved (not a unit form flag) |
| `global24` | phase arms / `func_2` | same arm | 0, or countdown while trigger holds | 0 after fire | 0 | 0 after last fire | frozen | preserved; **not reset** if trigger drops mid-count (E1) |
| `global21/22/23` | `func_33` zeros | unused in A-30-1 author chain | 0 | — | reset | preserved | preserved | preserved |
| `global16/17` win/lose | `func_32` | `func_17` / `func_21`..`func_25` | `0x1`/`0x5` or `0x2`/`0x5` | bit `0x8` uses dead `0x349` | from battle fields | native continues | `0x31c` | n/a |
| `global10/11/12/13` | config / `func_17` | win/lose | losses / targets | — | config | native | native | n/a |
| `global18` | `func_19` | respawn stock cache | `0x351` remainder | — | 0 | helper-owned | helper-owned | helper-owned |
| `global19` BGM | `func_32` / `0x33f` | opening / actions | hash | mid-wave change (180/343, not rewritten) | config | preserved | preserved | preserved |
| private array row `0x3c` | `func_19` (`0x604` clear, `0x601` write, `0x603` read) | `func_19` | retreat handles this tick | — | unknown (first `func_19` clears) | rewritten every live tick | `func_18` may run `func_19` again | **do not author** |
| event fiber | `main` `0x802(0x9de)` | `func_15` | one sub-line | — | started once | template-private | unknown join | respawn-only |
| respawn fiber | `func_15` `0x802(0x97d, payload)` | `func_20` | 0 or 1 | — | none | `0x803` on that line | unknown | nested under event line |

---

## Capability 1 — Condition true/false branch inside the author sequence

**Decision: Research only (runtime). No-Go for UI. Not Go.**

| Layer | Grade | Claim |
|---|---|---|
| Official gate | E1 | `if (trigger) { func_2; fire; }`. False trigger waits. One successor: `global20 + 1`. |
| Official dispatcher | E2 | 163/343 waves are this `if (global20 == n) / else if` chain; 180/343 add extra **linear** statements, still one index. |
| Sibling else successor | E1 expressible | A second arm (`if (trigger) global20=A; else global20=B`) can be written in C. **Zero** official scripts do it (census of phase rewrite + A-30-1). |
| Tick coupling | E1 | A fork inside `func_35` does not replace `func_16`. Win/lose still ticks. Not a “cannot exit” No-Go by itself. |
| Round-trip of a new fork shape | E0 | Not compiled this session. G4 still applies; `f013_001` already diverges on an extra `else`. |
| Player behaviour | no E3 | |

Draft overclaim corrected: runtime is **Research only**, not hard No-Go. Product still has no template slot for a false path (`graphToModel` rejects branch/merge; `generateC` emits one predicate and `global20 = i+1`).

### Lifecycle (fork, hypothetical)

| Phase | Policy |
|---|---|
| ENTER | Same as shared: `global20 = 0`, opening then `func_35`. |
| ACTIVE | One tick, one `global20` arm. True path: existing delay+actions+increment. False path: would need its own successor index, actions, and `global24` policy. |
| EXIT | Both paths must still reach the empty terminal arm, or win/lose must be allowed to replace the tick. |
| INTERRUPT | Death does not rewind `global20`. A skip that assumed units still alive can re-fire `func_12` after respawn (ownership hole). |
| REINITIALIZE | `func_33` resets index; it does not restore “which fork was taken”. |

### State ownership (fork)

| State | Writer | Readers | ENTER | EXIT | INTERRUPT |
|---|---|---|---|---|---|
| `global20` | both arms | `func_35` | 0 | must reach terminal or freeze | preserve; no restore |
| `global24` | true path via `func_2` | true path | 0 | reset on fire; **must reset on skip** or delay leaks | preserve |
| slots / `func_12` | whichever arm deploys | native field | opening deploys | no undeploy | respawn is the other fiber |

---

## Capability 2 — Persistent variables `0x601..0x609` as author trigger inputs

**Decision: No-Go for row `0x3c` and for `0x602`/`0x607..0x609` as “official blackboard”. Research only for a private row ≠ `0x3c`. No UI.**

| Layer | Grade | Claim |
|---|---|---|
| Private 64×128 write/add/read `0x601/0x602/0x603` | E2 IDA | architecture §9.6 |
| Shared 16×32 `0x607/0x608/0x609` | E2 IDA | architecture §9.6; **0 official calls** |
| `0x604` clear / `0x605` popcount / `0x606` lowest-bit | E1/E2 | `0x604` used 343/343; `0x605`/`0x606` unused |
| Official consumer | E2 census | Only `func_19` row `0x3c` (1 write, 1 clear, 4 reads per script) |
| Author `func_35` reads | E1 | A-30-1 author chain never calls `0x601..0x609` |
| Collision on row `0x3c` | E1 | `func_19` clears and rewrites that row **every live tick** before `(*global0)()`. An author trigger on `0x603(0x3c, …)` would see retreat handles, not a sticky variable. |
| Other rows / shared array reset on retry | E0 | IDA not attached; `func_33` does not touch them |
| Player behaviour | no E3 | |

Missed by the draft: row `0x3c` is not “unknown helper”, it is a **named owner**. Shared `0x607..0x609` are engine-real and corpus-unused, not a hidden official feature.

### Lifecycle (blackboard, hypothetical row ≠ `0x3c`)

| Phase | Policy |
|---|---|
| ENTER | Unknown whether the private array is zero. Do not assume `func_33` clears it. |
| ACTIVE | Author write (`0x601`) in phase N, read (`0x603`) in a later trigger. `func_19` must not be given the same row. |
| EXIT | No official restore. Values may leak into post-win `func_19` if the row was `0x3c` (forbidden). |
| INTERRUPT | Array is not a unit; death does not reset it (E0). |
| REINITIALIZE | Unspecified. |

### State ownership (arrays)

| State | Writer | Readers | ENTER | EXIT | INTERRUPT |
|---|---|---|---|---|---|
| Row `0x3c` | `func_19` only | `func_19` | clear on first retreat pass | helper-owned | helper-owned — **No-Go to author** |
| Other private rows | none official | none official | unknown | unknown | unknown — Research only |
| Shared `0x607..0x609` | none official | possibly native (E0) | unknown | unknown | unknown — do not publish as blackboard |

---

## Capability 3 — Loops / back-edges that reuse `global20` or `global0`

**Decision: Research only (runtime). No-Go for UI. Not a tick “cannot-exit” No-Go.**

| Layer | Grade | Claim |
|---|---|---|
| Opcode `0x05` continue | E2 | Mission profile continue targets the inner `func_2`-style countdown, 2390/2390. That is **not** a graph back-edge. |
| `0x800` yield loops | E2 | Opening / `func_12` wait. Same fiber, forward wait, not `global20--`. |
| `global20 = earlier` | E1 expressible | Integer write. Official arms only increment. |
| `global0 = func_34` again | E1 expressible | Would re-run opening deploys / `0x453` / BGM. No official reverse path. |
| Battle exit | E1 | Win/lose lives in `func_17` **outside** `func_35`. A tight `global20` loop does not by itself freeze `0x31c`. |
| Duplicate `func_12` | E0 | Re-entering an arm while the slot is live is untested (budget 12, slot already deployed). |
| Round-trip of a back-edge | E0 | Not compiled this session. |
| Player behaviour | no E3 | |

Draft overclaim corrected: loops are not hard No-Go for “cannot exit”. They are No-Go for UI because re-entry / delay / deploy ownership is unwritten, and the compiler/graph reject cycles.

### Lifecycle (back-edge, hypothetical)

| Phase | Policy |
|---|---|
| ENTER | Same opening. A loop must not skip `0x454` / `func_9`. |
| ACTIVE | Decrement or wrap `global20`. Must reset `global24` or `func_2` resumes a stale countdown. |
| EXIT | Need an independent stop (win/lose, or a cap) or the empty arm is never stable. |
| INTERRUPT | Respawn while looping can `func_12` a live slot. |
| REINITIALIZE | `func_33` would look like a loop to 0 **plus** config/`0x40d` — not equivalent to `global20 = 0`. |

### State ownership (loop)

| State | Writer | Readers | ENTER | EXIT | INTERRUPT |
|---|---|---|---|---|---|
| `global20` | loop arm | `func_35` | 0 | needs a stop policy | preserve |
| `global24` | `func_2` | same | 0 | must reset on wrap | preserve |
| `global0` | do not bounce to `func_34` | tick | `func_35` after opening | keep `func_35` | preserve |
| deployed slots | `func_12` / `0x336` | field | opening + fires | no official undeploy on wrap | respawn fiber separate |

---

## Capability 4 — Parallel author actions via `sys_0(0x802)` / `0x803`

**Decision: No-Go for author-controlled parallel waves and for stealing the event/respawn lines. Research only for a third, self-`0x803`’d sub-line that never uses offsets `0x9de`/`0x97d`. No UI.**

| Layer | Grade | Claim |
|---|---|---|
| Spawn / end handlers | E2 | `sub_140DE7F00` / `sub_140DE7BB0`; fiber classes `CFiberExecMainLine` / `SubLineByteCode` |
| Official payload | E2 census | Exactly two starts, one end, every script: event + respawn |
| Author deploy/message/BGM on a second line | E0 | Not in corpus. Cleanup, battle-end join, and max sub-lines unknown (IDA closed). |
| `0x803` from the wrong line | E0 | Could end the event fiber (cannot-exit / missed respawn) — treat as No-Go until proven otherwise |
| Replacing `callFunc3(func_16)` | No-Go | Breaks the fixed tick |
| Player behaviour | no E3 | |

### Lifecycle (extra sub-line, hypothetical)

| Phase | Policy |
|---|---|
| ENTER | `main` already started `func_15`. A third `0x802` would run beside it. |
| ACTIVE | Extra line must yield (`0x800`) itself. Main tick still owns `func_35`. |
| EXIT | Extra line **must** `0x803` itself. Battle `callFunc3(func_18)` does not document joining other sub-lines. |
| INTERRUPT | Respawn already uses the only official nested `0x802`. Two nested starts = unknown. |
| REINITIALIZE | Unknown whether fibers survive `func_33` (usually whole script reload). |

### State ownership (fibers)

| State | Writer | Readers | ENTER | EXIT | INTERRUPT |
|---|---|---|---|---|---|
| Main line | `callFunc3(func_16)` then maybe `func_18` | VM | tick | replaced on win | preserved until win |
| Event line `0x9de` | `main` | `func_15` | once | template-private | must keep |
| Respawn line `0x97d` | `func_15` type 1 | `func_20` | on event | `0x803` | nested |
| Author extra line | none official | — | forbidden in UI | must self-end | unknown |

---

## Capability 5 — Extra event kinds beyond documented respawn (`0x32d/0x32e/0x330`)

**Decision: Research only for native types ≠ 1 (observability). No-Go for author event nodes and for calling `0x32d`/`0x330` from `func_35`. No UI.**

| Layer | Grade | Claim |
|---|---|---|
| Queue syscalls | E1 usage / E2 that they exist | Peek type `0x32d`, payload `0x32e`, dequeue `0x330` |
| Type `1` | E1 | Respawn request → `0x802(func_20, payload)` |
| Types ≠ 1 | E1 | Template still dequeues them and **does nothing** |
| Native writers of the queue | E0 | IDA not attached this session |
| Author enqueue | E0 | No documented `sys_0` to post a new kind from the author chain |
| Stealing the queue from `func_35` | No-Go | Would starve `func_15` / respawn |
| Changing `func_15` | No-Go for authoring | Transpiler refuses altered fixed runtime functions |
| Player behaviour | no E3 | |

### Lifecycle (event queue)

| Phase | Policy |
|---|---|
| ENTER | Event fiber started from `main` before the tick. |
| ACTIVE | `while (1)`: peek; if type 1 spawn respawn fiber; always dequeue if type ≠ 0; else `0x800`. |
| EXIT | Fiber is not `0x803`’d by official `main`. Post-win tick replacement does not document stopping it. |
| INTERRUPT | This **is** the interrupt path for deaths that request respawn. |
| REINITIALIZE | New script / unknown in-stage retry. |

### State ownership (events)

| State | Writer | Readers | ENTER | EXIT | INTERRUPT |
|---|---|---|---|---|---|
| Queue | native (E0 who) | `func_15` only official | empty? E0 | template-private | respawn type 1 |
| Type 1 payload | `0x32e` | `func_20` | — | consumed | nested fiber |
| Types 2+ | unknown | dropped | — | dropped | dropped |

---

## Capability matrix (summary)

| Capability | Grade (weakest link) | Decision | Why |
|---|---|---|---|
| 1. True/false branch in the author graph | E1 structure; E2 that official is a single `global20` chain; no E3 | **Research only**; **No UI** | Expressible; does not by itself break the tick. No false-path slot, no restore policy, round-trip of a new `else` unproven (`f013_001` already diverges on extra `else`). |
| 2. Persistent vars `0x601..0x609` as triggers | E2 arrays exist; E2 official use is only row `0x3c`; no E3 | **No-Go** row `0x3c` and shared-as-official-blackboard; **Research only** other private rows; **No UI** | `func_19` owns `0x3c` every tick. `0x607..0x609` have zero official callers. |
| 3. Loops / back-edges | E1 expressible; E2 continue/`0x800` are not graph loops; no E3 | **Research only**; **No UI** | Win/lose still ticks. Re-fire/`global24`/deploy ownership unwritten. Graph rejects cycles. |
| 4. Parallel author `0x802`/`0x803` | E2 spawn/end + census of exactly 2/1; no E3 | **No-Go** for author parallel and for stealing template lines; **Research only** a third self-ended line; **No UI** | Official payload is event/respawn only. Fiber cap and `0x803` targeting unknown. |
| 5. Extra event kinds | E1 dequeue-and-drop; E0 native types; no E3 | **Research only** (observe); **No-Go** author event nodes; **No UI** | Only type 1 is dispatched. Authoring compiler cannot patch `func_15`. |

**Nothing in this table is Go.** Do not add `exvs-mission-graph-v2`, branching UI, blackboard, loop nodes, or parallel author nodes.

## Pre-registered falsifiers (user-run E3; one variable per pack)

Do not edit `func_15`/`func_16`/`func_19`/`func_20`/`main` in an authoring-compiler pack. Keep `Identical`. Prefer an SE probe (`sys_58`) over asking the user to introspect. IDA-closed questions are not solved by reading more C.

| Id | One variable | Hypothesis | Prediction | Falsifier |
|---|---|---|---|---|
| H-branch | One extra `else` on **one** `func_35` arm: on false trigger set `global20` to skip **one** deploy, and `global24 = 0` | False path never `func_12`s that slot; win/lose still ticks | Skipped units appear, battle never ends, or `Identical` fails |
| H-var | `0x601(row=0x1, …)` write in phase 0; phase 1 trigger is `0x603(0x1, …) == N`. **Do not use row `0x3c`.** | Phase 1 waits until that cell is N | Trigger ignores the cell, sees retreat handles, or crashes |
| H-loop | After the last real fire, `global20 = 0` and `global24 = 0` **once** (latch) | Wave 0 actions run one extra time; conservative budget still ≤ 12 | Duplicate deploys, stuck delay, hang, or `Identical` fails |
| H-802 | Third `0x802` to a **new** function that SE-probes then `0x803`. Do not pass `0x9de`/`0x97d`. | Probe SE fires once; respawn still works; battle still ends | SE silent, double event line, missed respawn, or hang |
| H-event | Vanilla (or Identical) play with **no** author enqueue; optional research-only SE in a **non-authoring** probe of `func_15` when `0x32d != 0 && != 1` | If extra kinds exist, the probe SE fires | Silence does not prove absence (queue may never post ≠1). Do not promote silence to E3. |

Ship at most one of these per pack. Do not start from graph v2.

## Out of scope / still refused

- Implementing `exvs-mission-graph-v2`, editor branch/merge/cycle/blackboard/parallel nodes.
- Changing compiler guards or writing `f013_001`.
- Dead `0x349` as a condition input.
- Mixing mission `global24` with unit-script `global24`.
- Treating architecture §9.3 names as A-30-1 slots.
- Later-than-OB images.
)
