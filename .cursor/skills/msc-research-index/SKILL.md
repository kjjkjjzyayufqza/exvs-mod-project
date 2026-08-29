---
name: msc-research-index
description: Route EXVS2 MSC research notes by cluster so agents read the right docs instead of listing docs/msc-research. Use when MSC, 0.c, 2.c, func_143, ACTION_*, sys_46, sys_4F, mscdec, msclang, Wing Zero Rebellion, Gyan, Delta Plus, Delta Kai, Hyaku Shiki, Unicorn, Aerial, msc-research, homemade motion, func_309, func_310, func_274, tks11a, or a unit script port.
---

# MSC Research Index

CodeGraph indexes `tools/msc_research_catalog.py`, not the Markdown notes.
Existing research notes stay as-is. This skill only routes.

## Load `msc-ingame-audit` alongside this skill

This skill's audit is **static**. It cannot tell you whether a claim is strong
enough to act on, and reading `X.c` establishes source structure only — never
engine ABI or player behaviour. Before asserting runtime behaviour or building a
repack, load `.cursor/skills/msc-ingame-audit/SKILL.md`: evidence grades E0-E3,
the falsified-negatives registry to grep before proposing a design,
pre-registered falsifiers, one-variable builds, and SE/effect probes.

## Fast rules are forbidden

MSC work is exempt from `caveman`, `gpt-fast-path`, `gpt-fast-verify`,
single-discovery-path limits, single-verifier limits, and stop-on-first-pass.
Correctness requires cross-stage and cross-asset evidence. This rule applies to
research, `X.c` edits, unit ports, and motion/model/Param/HUD integration.

## Protocol

1. Load this skill for any MSC research / `X.c` edit / unit script port.
2. Match a cluster (do **not** `list_dir docs/msc-research`):

```text
python tools/msc_research_catalog.py --match "<task keywords>"
```

3. Read `read_first` only. Open extra `docs` / `related` if the answer is still missing.
4. Treat `settled` and `do_not` as starting state. Do not re-derive them for confidence.
5. If two clusters print, keep both (example: Rebellion transform vs TV source).

## Mandatory MSC change audit

Complete this audit before editing any MSC source or coupled asset.

### 1. Lifecycle matrix

Trace every affected state through all rows, not only the reported trigger:

| Phase | Required evidence |
|-------|-------------------|
| ENTER | selector/action hash, registry, first callback, first resource/Param writes |
| ACTIVE | per-tick owners, timers, HUD/ammo writers, motion/model ownership |
| EXIT | natural exit, reverse mapping, state restoration, inherited values |
| INTERRUPT | hit/cancel/down/death paths, idempotent cleanup, partial-entry safety |
| RESPAWN/REINITIALIZE | default bank/table/model/form reconstruction |

An ENTER-only fix is incomplete. Every write introduced on ENTER must have an
explicit preserve, inherit, reset, or restore policy on EXIT and INTERRUPT.

### 2. State ownership matrix

Record each affected state before implementation:

| State | Owner/writer | Readers | Normal value | Alternate value | ENTER policy | EXIT policy | INTERRUPT policy |
|-------|--------------|---------|--------------|-----------------|--------------|-------------|------------------|

Include, when applicable: action hash, form global, motion slots, model root,
speed row, armsparam/HUD slots, ammo/reload timers, charge bars, effects, and
shared globals. Shared state must say whether it is **preserved**, **inherited**,
**reset**, or **restored**. “Rebind same row” is not inheritance if it resets a
native timer/state machine.

### 3. Current-target resource proof

For every new or existing reference, verify against current target assets:

- action hash vs handler registry;
- motion Runtime numeric value vs raw structure `unk1` byte order;
- Folder/Item children, fileIndex, channel ids, and non-empty files;
- Param row existence, unsigned ID ordering, and active schema;
- model/shell/bone dependencies and form-specific ownership;
- HUD slot index and the native state machine that updates it.

Do not treat documentation, a CRC calculation, roundtrip byte identity, or a
source-unit asset as proof that the current target contains a valid reference.

### 4. Reference comparison

Compare the complete working reference transition, including its reverse path
and state adapter. If the target lacks the reference's dual table/state adapter,
design a target-specific equivalent; do not copy only ENTER calls or add guards
that freeze native maintenance.

### 5. Pre-edit self-audit

Before writing, state:

1. intended transition and unchanged behavior;
2. lifecycle rows inspected;
3. state owners and inheritance policy;
4. verified resource IDs and missing dependencies;
5. rollback boundary;
6. remaining unknowns requiring user choice or runtime evidence.

If any affected phase or shared-state owner is unknown, continue investigation
or ask the user. Do not patch around the unknown.

### 6. Post-edit gates

Run every applicable gate; MSC is not limited to one command:

- repeat the lifecycle and state-ownership audit on the resulting code;
- `check_msc_ai_blocks.py`, `check_msc_opaque_func_ptrs.py` and
  `check_msc_action_shape.py` for each changed `X.c`;
- verify resource/Param references again after edits;
- compile/repack only when authorized, then report whether it was run;
- test normal→alternate→normal, ready/loading inheritance, interrupt at each
  phase, and respawn/reinitialize in the scoped in-game matrix;
- update the routed research note with actual runtime evidence.

Do not declare a bug fixed from a static pass when the failure is runtime-only.

## Self-audit red flags

- Only the failing direction was inspected; reverse/exit was assumed.
- A stateful slot was rebound instead of inherited.
- A guard stops a native timer/HUD writer without replacing its ownership.
- A referenced ID exists in docs but not in the current target asset.
- Param rows parse or roundtrip but violate native ordering/invariants.
- One successful checker is used to stop before resource or runtime gates.

Any red flag means return to the lifecycle/state ownership matrices before
editing further.

Exact id:

```text
python tools/msc_research_catalog.py --print wing-zero-rebellion
python tools/msc_research_catalog.py --list
```

## Cluster cheat sheet

| Need | Cluster id |
|------|------------|
| Bird form / Rebellion transform / `900000004` | `wing-zero-rebellion` |
| TV Wing Zero source (`28001001`) | `wing-zero-tv` |
| Gyan / 强人 / 后格 / Dodai特射 | `gyan` |
| How `2.c` works globally | `runtime-2c` |
| Input bits / `0.c func_143` | `input-0c` |
| BD / `sys_46` / `func_11` / `func_158` recoil | `movement` |
| `func_593` 676-679 | `ranged` |
| Homemade clip duration / `func_309` / `func_310` | `homemade-motion-clock` |
| `func_1044` / `func_887` shell | `registry` |
| Format / repack / AI blocks / opaque ptrs | `toolchain` |
| `sys_4F` / other syscalls | `syscall` |
| speedparam / characterparam / red-lock | `param-msc` |
| Native unit-task automata | `native-unit-task` |
| Independent striker / `sys_51(0x20000)` / `516001001` / arg5 action index / `d0003` | `striker-sys51` |
| Per-unit OB v27 page | `unit-<slug>` (`--match` the id) |

## Hard rules

- Do not rewrite, merge, or delete existing MSC research Markdown to "clean up".
- Do not use generated analysis JSON / overlays as evidence.
- New MSC note: write the note, **then add it to** `tools/msc_research_catalog.py`, then `--check` and `--write-index`.
- Wing Zero Rebellion transform still has an AGENTS.md bootstrap; also `--match` so alt2 gerobi / `SUB_SHOT_CUSTOM` do not get mixed into the transform port.
- Homemade NUANMB phase length is `global244 -= func_274()`, not `func_309` / `sys_47(0x7)`, not `func_310` rate. Owner: `docs/msc-research/homemade-motion-clock-vs-game-frame.md`.

## Verify catalog edits

```text
python tools/msc_research_catalog.py --check
```
