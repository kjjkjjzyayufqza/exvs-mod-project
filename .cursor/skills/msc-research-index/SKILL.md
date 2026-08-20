---
name: msc-research-index
description: Route EXVS2 MSC research notes by cluster so agents read the right docs instead of listing docs/msc-research. Use when MSC, 0.c, 2.c, func_143, ACTION_*, sys_46, sys_4F, mscdec, msclang, Wing Zero Rebellion, Gyan, Delta Plus, Delta Kai, Hyaku Shiki, Unicorn, Aerial, msc-research, or a unit script port.
---

# MSC Research Index

CodeGraph indexes `tools/msc_research_catalog.py`, not the Markdown notes.
Existing research notes stay as-is. This skill only routes.

## Protocol

1. Load this skill for any MSC research / `X.c` edit / unit script port.
2. Match a cluster (do **not** `list_dir docs/msc-research`):

```text
python tools/msc_research_catalog.py --match "<task keywords>"
```

3. Read `read_first` only. Open extra `docs` / `related` if the answer is still missing.
4. Treat `settled` and `do_not` as starting state. Do not re-derive them for confidence.
5. If two clusters print, keep both (example: Rebellion transform vs TV source).

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
| BD / `sys_46` / `func_11` | `movement` |
| `func_593` 676-679 | `ranged` |
| `func_1044` / `func_887` shell | `registry` |
| Format / repack / AI blocks / opaque ptrs | `toolchain` |
| `sys_4F` / other syscalls | `syscall` |
| speedparam / characterparam / red-lock | `param-msc` |
| Native unit-task automata | `native-unit-task` |
| Per-unit OB v27 page | `unit-<slug>` (`--match` the id) |

## Hard rules

- Do not rewrite, merge, or delete existing MSC research Markdown to "clean up".
- Do not use generated analysis JSON / overlays as evidence.
- New MSC note: write the note, **then add it to** `tools/msc_research_catalog.py`, then `--check` and `--write-index`.
- Wing Zero Rebellion transform still has an AGENTS.md bootstrap; also `--match` so alt2 gerobi / `SUB_SHOT_CUSTOM` do not get mixed into the transform port.

## Verify catalog edits

```text
python tools/msc_research_catalog.py --check
```
