# Auto-loaded files carry the contract, not the research map

Status: accepted (2026-10-07)

A folder-reading agent does not run hooks. The files that enter its context
are the ones its tool loads by name: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
`.github/copilot-instructions.md`, and a `CLAUDE.md` or `AGENTS.md` in a
directory it actually opens. Codex also stops reading a project instruction
once the merged text reaches 32 KiB.

Before this decision, `CLAUDE.md` was only a pointer at `AGENTS.md`, and
`AGENTS.md` was about 39 KB. The contract sat above a map of research notes,
hashes, and paths. Claude Code loads `CLAUDE.md` and does not also load
`AGENTS.md` when `CLAUDE.md` exists, so that session received the pointer
and not the contract. Codex could cut the tail. Either way, a compliant
read of the long file also received the map.

The contract text now lives in each auto-loaded root file. The operating
manual, including the research index, is `docs/agent-index.md`. That name is
not an auto-loaded instruction. Root files point at it only after
**InRepoWork**. The five directories a foreign reader already opened
(`src-tauri/src/format/`, `docs/msc-research/`, `docs/param-research/`,
`docs/ida-dumps/`, `docs/agent-sessions/`) each have a short `AGENTS.md` and
`CLAUDE.md` that restates **CrossProductPort** and **CopiedTreeRefuse** and
does not name the manual.

This is not a new comment layer. ADR 0009 still stands: harsher file-top
comments and covert injection do not bind a model whose user has ordered the
copy. ProvenanceArmsRace is unchanged. No hooks were added. These files are
not `bundle.resources`.

## Consequences

- Do not paste `docs/agent-index.md` back into `AGENTS.md` or `CLAUDE.md`.
- Do not add `AGENTS.override.md` unless it contains this whole contract.
  Codex skips `AGENTS.md` in a directory that has an override.
- Keep root auto-loaded files well under 32 KiB.
- Nested stop files must not grow into a second research index.
