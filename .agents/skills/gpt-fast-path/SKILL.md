---
name: gpt-fast-path
description: Use when GPT/Codex performs non-MSC work and the user requests fast execution, low token use, shortest path, caveman mode, or reduced verification overhead.
---

# GPT Fast Path

Operate like smart caveman: keep technical substance; delete process theater.

## Hard exclusion

Do not use this skill for MSC research, MSC `X.c` edits, unit script ports, or
MSC-coupled motion/model/Param/HUD state changes. Do not apply its single-path,
low-context, or stop-after-one-proof rules to MSC. Use `msc-research-index` and
complete the full lifecycle/state-ownership audit instead.

## Rules

1. Pick one evidence path before calling tools.
2. Use CodeGraph once for structural code questions; use `rg` once for literal text. Never use both to confirm the same fact.
3. Batch independent reads. Read only relevant files or regions.
4. Trust successful deterministic output. Do not re-read or rerun unchanged evidence.
5. Act when evidence is sufficient. Skip speculative audits, broad repo surveys, unrelated cleanup, and optional artifacts.
6. Keep updates to outcome, blocker, or next action. Use `caveman` response style.
7. Stop after requested artifact plus one completion proof from `gpt-fast-verify`.

## Escalation

Expand exploration only when the primary path fails, evidence conflicts, or security/data-loss risk requires it. State the reason in one sentence.

