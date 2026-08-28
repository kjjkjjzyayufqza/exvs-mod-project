---
name: msc-ingame-audit
description: Grade MSC evidence and run in-game verification for EXVS2 MSC work. Use whenever a claim about MSC runtime behaviour is about to be made or a X.c change is about to be built - "does it fly / can the player control it / does it auto-exit", flight, transform, cancel windows, action handoff, movement channels, repack-and-test loops, or when an in-game test came back "it did not work". Complements msc-research-index, which covers static lifecycle/state-ownership audit only.
---

# MSC In-Game Audit

`msc-research-index` routes notes and runs the **static** audit (lifecycle matrix,
state ownership, resource proof). This skill covers what that audit cannot reach:
**how strong is the evidence, and how do you actually find out in game.**

Load both for any MSC change. This one owns the decision "may I claim this yet".

## Why this exists

MSC `X.c` is decompiled bytecode: no types, no field names, no syscall
signatures, and the engine that joins `0.c` to `2.c` is in neither file. So most
semantics are *inferred*, and two careful agents reading the same file produce
two self-consistent, mutually contradictory stories. Both cite source. Both can
be wrong.

## 1. Three evidence layers

| Layer | Question shape | Only valid evidence | Answerable by reading `X.c` |
|-------|----------------|---------------------|------------------------------|
| **L1 syntax** | what does `func_452` contain; what is registered to this hash | read `.c`; `mscdec` roundtrip | **yes** |
| **L2 engine ABI** | what field is `sys_0(0x10000,0,0x11)`; which layer does this hash run on; does it have a slot resolver; what is `global3` right now | ≥2 vanilla units agreeing, IDA native, or an in-game probe | **no** |
| **L3 behaviour** | what does the player see / can they steer / does it auto-exit | **in game only** | **no** |

### Capping rule (the whole skill in one line)

> **A claim's grade equals the weakest link in its chain.**

Therefore:

1. "Source-pinned" can never establish an L2 or L3 claim, however careful the read.
2. "I traced every branch of `func_79`" is *process*, not evidence.
3. A source-only note may not publish behaviour policy. It may only say
   "the source looks like this" + "untested".
4. Cross-unit agreement raises L2 to E2. It never reaches E3.

## 2. Grades

| Grade | Meaning | How obtained | Licenses you to |
|-------|---------|--------------|-----------------|
| E0 | guess / unverified | read one unit's `.c`, or analogy | write it under "assumptions" only |
| E1 | source-pinned | `.c` read + roundtrip byte-faithful | describe structure |
| E2 | cross-source | ≥2 vanilla units agree, or IDA | assert engine ABI |
| E3 | **in-game confirmed** | built, ran, observed the pre-registered predicate | assert player behaviour |
| E3- | **in-game falsified** | built, ran, failed | highest value — must be registered |

Note format:

```markdown
**Status:** E3 in-game confirmed (2026-08-25); coast phase E3- falsified
```

Mixed-grade notes must be graded per section. Checker:
`python tools/check_msc_doc_evidence.py`

## 3. The gate (before proposing any change)

```text
1  python tools/msc_research_catalog.py --match "<keywords>"
     Never list docs/msc-research/ and pick by filename.
2  grep every hash / func_N / globalN you will touch against
     docs/msc-research/msc-falsified-negatives-registry.md
     A hit = that design already failed in game. Stop. Read the owner note.
3  grade your claim (§1-2). L2/L3 without in-game evidence is E0.
4  confirm the .c you read is the .c you will edit (§6).
```

Skipping step 1 is the single highest-cost error in this repo: routing is
measured at 5/5 on real queries, so the owner note was always one command away.

## 4. Pre-registration (before every build)

Write these three lines into the note or the change description **before editing**:

```text
H  hypothesis:  after 30f the handoff gives the player native flight control
P  prediction:  stick changes heading; no stick auto-exits to normal form <~1s
F  falsifier:   "cannot steer" OR "never auto-exits" refutes H
```

Without `F`, an in-game run returns "it did not work", which carries ~0 bits.
**"It did not work" is not data. `F` is.**

## 5. One variable per build

Each repack costs a build + a match + reproducing the input. Change exactly one
thing that affects `F`. Changing a speed formula and a handoff mechanism in the
same build makes "it does not move" undiagnosable.

After a failed E3, **shrink** the next change to the smallest discriminating
edit. Do not add fallbacks, latches or extra phases to a design that has not
been shown to reach its first branch.

## 6. Artifact identity (cheap, prevents whole wasted sessions)

Before reading and again before writing:

```bash
stat -c '%y %s %n' <target>/2.c && md5sum <target>/2.dscex
rg '^void <feature>_\w+\(\)' <target>/2.c    # do the doc's functions exist?
```

Docs and trees drift; a tree can be rebuilt mid-session by the user. Reasoning
carefully on a stale file is still wrong. If the owner note describes functions
the file does not contain, **the note describes a different implementation** —
fix the note before reasoning further.

## 7. Probes: give MSC a printf

MSC has no logging, but three side channels are visible to the player. Use them
to make internal state observable instead of inferring it.

| Channel | Call | Observed as | Cost |
|---------|------|-------------|------|
| SE | `sys_58(0, <se_hash>)` | a sound | lowest — prefer this |
| Effect | `sys_4A(0, <fx_hash>, global20, 0x1, <group>, 0)` | a visual | low; consumes a group slot |
| Motion | `func_74(<slot>, 0)` | a pose | changes feel; branch confirmation only |

One-shot, wrapped in an AI block, deleted after verification:

```c
// AI decision (YYYY-MM-DD): temporary in-game probe, remove after verification.
// One-shot SE on the handoff branch so the player can hear whether it ran at
// all. Latch prevents a per-tick retrigger; this is a diagnostic, not content.
// Origin: AI-assisted MSC edit; msc-ingame-audit probe protocol.
if (probe_fired == 0)
{
    probe_fired = 0x1;
    sys_58(0, <se_hash>);
}
// End, origin is AI-assisted MSC edit; temporary in-game probe.
```

Two distinct SEs in one build turn an ambiguous "it did not work" into four
distinguishable outcomes. That is cheaper than reading another 500 decompiled lines.

**Ship the probe with the build.** Do not ask the user to introspect on state
they cannot see.

## 7b. Action shape is fixed — follow it, do not invent

EXVS2 actions are **one action function plus four phase bodies**:
`start` / `shoot` / `no_ammo` / `end`. The bodies differ per unit; **the shape
does not**. A mod that invents its own structure loses native phase ownership.

```c
void ACTION_X()            // func_241 depiction entry, runs once
{
    func_586();            // reset the ranged parameter table
    global676 = X_start;
    global677 = X_shoot;
    global678 = X_no_ammo; // 0 / 0xffffffff = this move has no empty-ammo phase
    global679 = X_end;
    callFunc3(X_tick);     // exactly once; target must be this action's tick
}

void X_tick() { func_593(); }   // driver advances the quartet itself
```

You own the four phase bodies and the `global252` handoffs. You do **not** own
phase advancement: `func_593` drives it via `func_71(slot)`
(`func_73` reset + `global225` + `func_72` dispatch), and `func_72()` re-runs the
current phase each tick.

### `callFunc*` — copy the shape, never reason from guessed semantics

| Grade | Fact |
|-------|------|
| E1 | opcodes `callFunc` `0x2f`, `callFunc2`/`set_main` `0x30`, `callFunc3` `0x31` (`tools/msclang_msc.py`); args pushed before the function pointer, `N` excludes it |
| E2 | corpus scan of `040msc/**`: every `2.c` uses `callFunc3` ~50-120x; `0.c`/`1.c` exactly once; `set_main` is rare (2 in Rebellion `2.c`, both right after motor-off) |
| **E0** | **what the VM does with any of them** — which slot it writes, replace vs stack, callable from inside a tick, where `a1..aN` go, how `set_main` differs |

Until the native handlers are pinned in IDA, the only safe move is the vanilla
shape: at most one `callFunc3(<this action's tick>)` at the end of ENTER, `N = 0`.

### Measured against the corpus, not asserted

538 vanilla units / 1881 action bodies (a function assigning `global676`).
**Zero counterexamples** — treat as E2 invariants:

| Invariant | Counterexamples |
|-----------|-----------------|
| `callFunc3` at most once per action body | 0 / 1881 |
| its argument is a bare function identifier | 0 / 1087 |
| `callFunc` / `callFunc2` / `set_main` absent from action bodies | 0 / 1881 |
| `func_586()` precedes the first `global676` write | 0 / 1431 |

**Vanilla breaks these, so they are not rules:** `func_586()` present 1431/1881;
full quartet assigned 1428/1881; `callFunc3` present at all 1087/1881.

Gate: `python tools/check_msc_action_shape.py <file.c>` (errors only on the four
invariants; everything else is an informational note).

Forbidden (each previously failed in game — registry group E):

- a hand-rolled `phase == 0/1/2` machine inside a `callFunc3` tick, replacing the quartet
- `callFunc3` targeting a per-frame state machine such as `transform_start`
- more than one `callFunc3` per ENTER
- using `func_71` and `callFunc3` interchangeably
- treating `678` as cancel

**Corrected 2026-08-28:** this list previously also banned `sys_46` inside the
`677` body. A corpus scan found **229 vanilla units doing exactly that**, so the
ban was an over-generalisation from one failed build. The failed build stays in
the registry as a scoped E3-; the general prohibition is withdrawn. One
falsification licenses one negative result, not a law.

Owner note: `docs/msc-research/func593-vanilla-ranged-slots.md`.

## 8. Discriminators for states that look identical

| Symptom | State A | State B | Input that separates them |
|---------|---------|---------|---------------------------|
| flight pose, no forward motion | stuck in script-drawn loop | already in native flight action | **can you steer?** yes = B |
| flying but standing animation | action changed, form global not cleared | form cleared, movement channel still written | press melee: bird melee = form alive |
| dash ends dead-stopped | magnitude written to 0 | flight motor turned off | still sinking slowly? slow = mag 0, straight drop = motor off |
| move never comes out | cancel window never opened | hash submitted but never committed | did the vanilla move finish normally? yes = window |
| homemade clip ~3s, DCC/header ~1.8s | waiting `func_309` / `sys_47(0x7)` | game-frame countdown missing | change `func_309` gate: wall clock unchanged = stock motion clock. Registry H1 |
| `func_310(1000)` does nothing | homemade folder ignores `sys_47(0x5)` as duration | `func_73` rewrote `global276` | delete the rate experiment; use `global244 -= func_274()`. Registry H2 |
| still the old duration after edit | not packed / stale `2.dscex` | clock still stock-complete | `func_241(hash, 0)` skips the move? yes = pack. no = H1, not packing. Registry H3 |

## 9. In-game report template

Ask the user for exactly this:

```text
input:      special melee -> melee
saw:        transform played, then stationary
stick:      cannot steer          <- discriminator §8
release:    never auto-exits
probe SE-1: fired                 <- release branch reached
probe SE-2: silent                <- func_452 never ran => handoff not committed
```

Five lines make the conclusion **determined**. Anything less restarts guessing.

## 10. After the run

- E3 confirmed → grade the note, add to catalog `settled`.
- E3- falsified → **add a row to
  `docs/msc-research/msc-falsified-negatives-registry.md`** and to catalog
  `do_not`. This is the most expensive knowledge in the repo; a failure that is
  not registered will be re-proposed with a fresh, convincing derivation.
- Remove probes. Re-run `check_msc_ai_blocks.py`.

## Red flags (each one observed in a real failed session)

- Listed `docs/msc-research/` and picked notes by filename → owner note missed.
- Concluded a symbol "does not exist" from **truncated** tool output.
- Used `mscdec` roundtrip byte-identity as evidence the behaviour is right
  (it is E1 — it only proves the compiler was faithful).
- Derived an L2 fact, hit a contradiction, and resolved it by choosing the
  branch that fit the intended design instead of probing.
- Used "the feature works in game" as a premise without having verified it in
  the version currently on disk.
- Shipped a build with two changed variables and no falsifier.
- Responded to a failed run by adding complexity rather than shrinking scope.
- Announced a correction on a harmless detail while the load-bearing error went
  unnamed.
- Asked the user to be the instrument instead of shipping a probe.
- Invented an action structure instead of following the start/shoot/no_ammo/end
  quartet, or reasoned about `callFunc*` from assumed VM semantics (§7b).
- Promoted a single failed build into a general prohibition without scanning the
  vanilla corpus for counterexamples (`--corpus-report`). This produced a wrong
  rule in this very file; see the §7b correction.
- Concluded "only `callFunc3` is ever used" from one file; a corpus grep found
  `set_main` too. Scope every "always/never" claim to what was actually scanned.
- Copied stock `func_309` / `sys_47(0x7)` waits onto a homemade NUANMB folder
  (`tks11a` / `0xa0cd8d56` / DCC `*_out`). Homemade phase length is
  `global244 -= func_274()`. Registry H1.
- Used `func_310` / `sys_47(0x5)` as a homemade duration or playback-speed knob.
  Registry H2.
- Diagnosed "not packed" after `func_241(hash, 0)` vs the real handler already
  proved ACTION entry. Registry H3.

Any red flag → stop, return to §3, re-grade.

## Related

- `docs/msc-research/MSC_AI_PRIMER.md` — self-contained paste-able primer for
  agents outside this harness (Grok, ChatGPT, a fresh subagent). Skills do not
  travel with the file; that primer and the `mscdec` banner do.
- `docs/msc-research/msc-evidence-grade-and-ingame-audit-protocol.md` — full protocol
- `docs/msc-research/msc-falsified-negatives-registry.md` — E3- registry
- `docs/msc-research/2026-08-27-msc-architecture-audit.md` — how these rules were derived
- `.cursor/skills/msc-research-index/SKILL.md` — routing + static audit
- `docs/msc-research/msc-repack-runnable-guide.md` — legacy `msclang.py` only
- `docs/msc-research/homemade-motion-clock-vs-game-frame.md` — homemade NUANMB clock
