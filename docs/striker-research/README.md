# EXVS2 Striker (援护) System Research

Research home for the EXVS2 Over Boost striker/assist system.

| File | Role |
|---|---|
| `exvs2-striker-system.md` | Main reference: format, architecture, and clone procedure |
| `research-log.md` | Step-by-step evidence log (every command + raw result) |

## Evidence policy

Every claim in this folder is tagged:

- **[PROVEN]** — derived mechanically from raw bytes, on-disk file names, or a
  100% cross-file consistency check. Reproducible with the commands in
  `research-log.md`.
- **[EVIDENCE]** — read directly out of a game file (build path strings,
  in-file text), but the *meaning* is not independently confirmed.
- **[INFERRED]** — reasoning on top of the above. May be wrong.

Derived/AI-labelled artefacts (`ob_v27_unit.json` exists-flags, generated name
maps, decompiled MSC symbol names) are **not** treated as truth. Where they were
used, they were re-verified against the real `dplcache_release` directory; two
of them were already found to be stale (see log entry L-07).
