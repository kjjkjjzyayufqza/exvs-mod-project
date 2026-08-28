# EXVS2 MSC Primer for AI Agents

**Self-contained. Paste this whole file into any model (Grok, ChatGPT, Gemini,
a fresh Claude session, a subagent) before showing it an EXVS2 `X.c`.**

It assumes no repo access, no skills, no tooling. If the model also has this
repo, the tool commands in §8 apply; if not, §1-§7 still hold on their own.

---

## 0. Response contract (fill this in, or do not answer)

Every answer about MSC must end with this block. No exceptions, no prose
substitute. An answer without it is not usable.

```text
CLAIM:      <the one sentence you are actually asserting>
LAYER:      L1 syntax | L2 engine ABI | L3 player behaviour
EVIDENCE:   <file:line you read, or units you compared, or in-game run>
GRADE:      E0 | E1 | E2 | E3 | E3-
UNKNOWNS:   <what you did not verify and would have to test>
```

The grade rules are in §2. If your grade is **E0**, say so in the first line of
your answer, before the analysis. Do not bury it.

---

## 1. What you are looking at

EXVS2 unit behaviour lives in a per-unit folder of compiled MSC scripts:

| File | Compiled | Role |
| --- | --- | --- |
| `0.c` | `0.bscex` | input selector / thinker. Maps input bits to action hashes. |
| `1.c` | `1.cscex` | secondary layer |
| `2.c` | `2.dscex` | depiction / action layer. The move bodies live here. |

`X.c` is **decompiled bytecode**, not source anyone wrote:

- It opens with ~700 lines of `int global0; int global1; ...`. There are no
  types, no field names, no struct layouts.
- `func_N` are script functions. Low numbers are a shared stdlib-like prelude
  present in every unit; high numbers are that unit's own bodies.
- `sys_N` are engine syscalls. **No signature for any of them is in the file.**
- `ACTION_*` names come from a heuristic hash mapping and can be wrong or absent.
- The engine code that joins `0.c` to `2.c` is in **neither file**.

Consequence: most semantics are *inferred*. Two careful agents reading the same
file routinely produce two self-consistent, mutually contradictory stories, both
citing real line numbers, and at least one is wrong. That is the failure this
primer exists to prevent.

---

## 2. Three layers and the capping rule

| Layer | Question shape | Only valid evidence | Answerable by reading `X.c`? |
| --- | --- | --- | --- |
| **L1 syntax** | what does `func_452` contain; what is registered to this hash | read the `.c` | **yes** |
| **L2 engine ABI** | what does `sys_0(0x10000,0,0x11)` mean; which layer does this hash run on; what is `global3` right now | >=2 vanilla units agreeing, or a disassembly of the game binary | **no** |
| **L3 behaviour** | what the player sees; can they steer; does it auto-exit; is the beam sustained | **playing the game only** | **no** |

> **A claim's grade equals the weakest link in its chain.**

| Grade | Meaning | Obtained by | Licenses you to |
| --- | --- | --- | --- |
| E0 | guess | reading one unit, or analogy | write it under "assumptions" |
| E1 | source-pinned | reading the `.c` | describe **structure** |
| E2 | cross-source | >=2 vanilla units agree, or binary RE | assert **engine ABI** |
| E3 | in-game confirmed | built it, ran it, saw the predicted thing | assert **behaviour** |
| E3- | in-game falsified | built it, ran it, it failed | highest value; must be recorded |

Therefore:

1. "Source-pinned" can never establish an L2 or L3 claim, however careful the read.
2. "I traced every branch of `func_79`" is *process*, not evidence.
3. Cross-unit agreement raises L2 to E2. It never reaches E3.
4. A byte-identical decompile/recompile roundtrip proves the **compiler** was
   faithful. It says nothing about whether the behaviour is right.

---

## 3. The action shape is fixed. Do not invent one.

An EXVS2 action is **one entry function plus four phase bodies**:
`start` / `shoot` / `no_ammo` / `end`. Contents differ per unit; the shape does not.

```c
void ACTION_X()                 // registered via func_241(<hash>, ACTION_X); runs once
{
    func_586();                 // reset the ranged parameter table, before any 676 write
    global676 = X_start;
    global677 = X_shoot;
    global678 = X_no_ammo;      // 0 means this move has no empty-ammo phase
    global679 = X_end;
    callFunc3(X_tick);          // at most once, bare identifier
}

void X_tick() { func_593(); }   // the driver advances the quartet itself
```

You own the **four phase bodies**. You do **not** own phase advancement:
`func_593` (or `func_599`) drives it, calling `func_71(slot)` which does
`func_73()` reset + `global225 = slot` + `func_72()` dispatch, and `func_72()`
re-runs the current phase every tick.

### Measured invariants

Counted over **538 vanilla units / 1881 action bodies** under `040msc`. These
are the rules with **zero counterexamples**, so violating one means you left the
engine's supported shape:

| Invariant | Counterexamples |
| --- | --- |
| `callFunc3` appears **at most once** per action body | 0 / 1881 |
| its argument is a **bare function identifier**, never a hex or expression | 0 / 1087 calls |
| `callFunc`, `callFunc2`, `set_main` **never** appear in an action body | 0 / 1881 |
| `func_586()`, when present, precedes the first `global676` write | 0 / 1431 |

### Measured *non*-rules — do not enforce these

Vanilla breaks all of these, so an agent that "fixes" them is damaging the file:

| Pattern | Vanilla frequency |
| --- | --- |
| `func_586()` present | 1431 / 1881 (76%) — absence is legal |
| all four of `global676..679` assigned | 1428 / 1881 (76%) — partial is legal |
| `callFunc3` present at all | 1087 / 1881 (58%) — absence is legal |
| `sys_46` inside the `global677` (shoot) body | **229 vanilla uses** — legal |

That last row is the pattern to internalise. A blanket ban on `sys_46` in the
shoot phase was once inferred from a single failed build and then written down
as a rule. The corpus falsifies it. **One failed build licenses one negative
result about that build, not a general law.**

### `callFunc*` semantics are E0

| Grade | Fact |
| --- | --- |
| E1 | opcodes: `callFunc` `0x2f`, `callFunc2`/`set_main` `0x30`, `callFunc3` `0x31`; args are pushed before the function pointer, and `N` excludes it |
| E2 | corpus usage: every `2.c` uses `callFunc3` ~50-120x; `0.c`/`1.c` exactly once; `set_main` is rare |
| **E0** | **what the VM actually does with any of them** — which slot it writes, replace vs stack, whether it is callable from inside a tick, where `a1..aN` go, how `set_main` differs |

Until the native handlers are read out of the game binary, the only safe move is
to copy the vanilla shape. **Never reason forward from assumed call semantics.**

### Known-bad action edits (each failed in a real build)

- a hand-rolled `phase == 0/1/2` counter inside the tick, replacing the quartet
- `callFunc3` targeting a per-frame state machine instead of a tick wrapper
- more than one `callFunc3` per entry
- using `func_71` and `callFunc3` interchangeably
- treating `global678` (no_ammo) as a cancel hook

---

## 4. Names and numbers do not transfer

- `func_N` and `globalN` numbering is stable **within one unit build only**.
  A `func_452` in unit A is unrelated to `func_452` in unit B.
- `global676..679`, `func_586`, `func_593`, `sys_46` and friends **are** shared
  prelude and do transfer. The dividing line is roughly: low numbers shared,
  unit-specific bodies high.
- `ACTION_*` names are heuristic. Confirm the hash in `func_241(<hash>, <fn>)`
  in the file you will actually edit.
- Never carry a number from a document into a file without re-checking it in
  that file. Documents and trees drift; a tree can be rebuilt mid-session.

---

## 5. Traps that have burned real sessions

| Trap | What actually happens |
| --- | --- |
| Concluding a symbol does not exist from **truncated** tool output | grep/CLI truncation reads as absence; re-run before asserting a negative |
| Non-ASCII in a comment | the compiler rejects the file |
| A quoted phrase spanning two `//` comment lines | breaks the comment stripper; same-line pairs are fine. Avoid quote characters in comments entirely |
| Treating roundtrip byte-identity as behavioural proof | it is E1 and only proves the compiler was faithful |
| `func_309(h, t)` / `func_91()` | both read `sys_4B(0x1)` and **ignore** their handle argument |
| Homemade NUANMB clip duration | is `global244 -= func_274()`, **not** `func_309` / `sys_47(0x7)` / a `func_310` rate |
| Shipping a build with two changed variables | the failure becomes undiagnosable |
| Responding to a failed run by adding complexity | shrink to the smallest discriminating edit instead |

---

## 6. How to be wrong cheaply

MSC has no logging, but three channels are visible to the player. Use them to
make internal state observable instead of inferring it.

| Channel | Call | Observed as | Cost |
| --- | --- | --- | --- |
| SE | `sys_58(0, <se_hash>)` | a sound | lowest — prefer this |
| Effect | `sys_4A(0, <fx_hash>, global20, 0x1, <group>, 0)` | a visual | low; consumes a group slot |
| Motion | `func_74(<slot>, 0)` | a pose | changes feel; branch confirmation only |

Two distinct SEs on two branches in one build turn an ambiguous "it did not
work" into four distinguishable outcomes. That is cheaper than reading another
500 decompiled lines. **Ship the probe with the build; do not ask the user to
introspect on state they cannot see.**

### Pre-register before every build

```text
H  hypothesis:  after 30f the handoff gives the player native flight control
P  prediction:  stick changes heading; with no stick it auto-exits in under a second
F  falsifier:   cannot steer OR never auto-exits refutes H
```

Without `F`, an in-game run returns "it did not work", which carries ~0 bits.
**"It did not work" is not data. `F` is.**

### Ask for exactly this report

```text
input:      special melee -> melee
saw:        transform played, then stationary
stick:      cannot steer            <- discriminator
release:    never auto-exits
probe SE-1: fired                   <- release branch reached
probe SE-2: silent                  <- handoff never committed
```

Five lines make the conclusion determined. Anything less restarts guessing.

### Discriminators for states that look identical

| Symptom | State A | State B | Input that separates them |
| --- | --- | --- | --- |
| flight pose, no forward motion | stuck in a script-drawn loop | already in the native flight action | **can you steer?** yes = B |
| flying but standing animation | action changed, form global not cleared | form cleared, movement channel still written | press melee: bird melee = form alive |
| dash ends dead-stopped | magnitude written to 0 | flight motor turned off | still sinking slowly = magnitude 0; straight drop = motor off |
| move never comes out | cancel window never opened | hash submitted but never committed | did the vanilla move finish normally? yes = window |

---

## 7. Red flags in your own output

Stop and re-grade if you catch yourself doing any of these:

- Deriving an L2 fact, hitting a contradiction, and resolving it by picking the
  branch that fits the design you wanted.
- Using "the feature works in game" as a premise without having verified it in
  the version currently on disk.
- Turning one failed build into a general prohibition (see the `sys_46` row in §3).
- Announcing a correction on a harmless detail while the load-bearing error goes
  unnamed.
- Answering without the §0 block.

---

## 8. Repo tooling (skip if you do not have the repo)

```bash
# route to the owning research note - never list the docs directory and guess
python tools/msc_research_catalog.py --match "<keywords>"

# has this exact design already failed in game?
grep -n "<hash|func_N|globalN>" docs/msc-research/msc-falsified-negatives-registry.md

# gates, all three, before packing
python tools/check_msc_ai_blocks.py        <file.c>
python tools/check_msc_opaque_func_ptrs.py <file.c>
python tools/check_msc_action_shape.py     <file.c>

# repack: legacy compiler only
python tools/msclang.py <file.c> -o <file.dscex> -i

# regenerate the §3 invariant counts
python tools/check_msc_action_shape.py --corpus-report --scan-dir E:\XB\mod\040msc
```

Related: `.cursor/skills/msc-ingame-audit/SKILL.md`,
`.cursor/skills/msc-research-index/SKILL.md`,
`docs/msc-research/msc-evidence-grade-and-ingame-audit-protocol.md`,
`docs/msc-research/msc-falsified-negatives-registry.md`.
