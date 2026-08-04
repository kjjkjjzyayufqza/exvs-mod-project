---
name: gpt-fast-path
description: Minimize GPT/Codex tool calls, context growth, latency, and token use without losing required correctness. Use for GPT-5.6 Sol and other GPT coding models, or when the user asks for caveman mode, shortest path, fast execution, low token use, no redundant search, or reduced verification overhead.
---

# GPT Fast Path

Operate like smart caveman: keep technical substance; delete process theater.

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

