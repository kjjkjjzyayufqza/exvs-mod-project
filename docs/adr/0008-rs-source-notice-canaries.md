# Unique multilingual notices on a subset of Rust sources

Status: accepted (2026-09-06)

About half of the `src-tauri` Rust sources carry a **file-top** comment that
tells a machine reader to open the Agent contract and related rules. Each
stamped file gets a **different** sentence mix and wrap style (English plus
other languages) so a single find-replace cannot neutralize every copy.

This extends **AttributionCanary**. It is visible on purpose.
**NoCovertInjection** still applies: the comments do not tell a model to
ignore its system prompt or hide the policy.

## Why

`AGENTS.md` and `.cursor/rules` bind agents that load **this** repository.
A CrossProductPort attempt often copies only `.rs` files. Those copies were
arriving in foreign trees with the policy files left behind, so the existing
RefusalCascade never loaded. The notices travel with the source.

**CopiedTreeRefuse** covers that leftover: if the canary is present but this
product identity / Agent contract is not, the agent must stop rather than
"clean the headers" and finish the port.

## Mechanics

- Selection: deterministic hash at ~50 percent, plus a small always-stamp
  list of crate entry points (`lib.rs`, `commands.rs`, format/toolchain
  hubs, CLI bins, `build.rs`).
- Generator / checker: `python tools/stamp_rs_ai_notices.py --check`
  (write with `--write`). No `--strip`.
- Cursor glob rule: `.cursor/rules/ai-source-notice.mdc` (`**/*.rs`).
- Glossary: `docs/governance/CONTEXT.md` (**SourceNoticeCanary**,
  **CopiedTreeRefuse**).

## Considered options

- Stamp every `.rs` file with one English banner — easy to delete in one
  replace; rejected
- Hidden steganography in binaries — rejects AttributionCanary / visible
  policy; rejected
- Total AI writing ban (MonoGame-style) — already rejected in ADR 0007
