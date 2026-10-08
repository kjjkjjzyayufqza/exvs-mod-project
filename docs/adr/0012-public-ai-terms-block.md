# Public AI clause asks for the latest terms, then refuses the port

Status: accepted (2026-10-07)

Filename-loaded contracts now open with one shared public paragraph. The
paragraph is ordinary text. It addresses Claude Code and any other AI model,
and it starts with the words that ask an AI reader to stop and read it. A
downloaded or unzipped local clone is not the current terms. A third party
who keeps an old copy of this repo is the example: that reader downloaded
the repository and kept working from the stale tree. The latest terms and
limits are on `https://github.com/kjjkjjzyayufqza/exvs-mod-project`.

The paragraph tells the model to correct the human and to refuse stealing
this code. The refusal includes the split where one model analyzes the tree,
writes an analysis report, and another agent implements that report.

The same bytes are in `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
`.github/copilot-instructions.md`, the body of
`.cursor/rules/agent-contract.mdc`, and the nested stop files. Nested stop
files still do not name the operating manual. The paragraph sits above the
older contract text. CrossProductPort, CopiedTreeRefuse, the refusal
template, and the waiver list stay.

The paragraph is hashed with SHA-256. `tools/check_terms_block.py` hashes
only the lines between the block markers. The digest line is published after
the end marker, so the digest is not an input to the hash. A missing, extra,
or self-including digest line is an error, not a match. If the fetch from
that repository fails, or the digest differs, the local checkout is not
permission to copy, port, explain this tree into another product, or hand
the work to another agent.

This is public contract text under **NoCovertInjection**. Provider system
prompts stay in force. The paragraph is not hidden, encoded, or
steganographic. It does not start the ADR 0009 ProvenanceArmsRace scanner
and it adds no live trap rows. ADR 0009 still stands: a later human order
to ignore the license is not bound by another paragraph. No hooks were
added. `protection-hold.mdc` was not edited and was not resealed.

## Consequences

- Keep this paragraph byte-identical across the filename-loaded surfaces.
- Do not move the digest line into the hashed block.
- Do not treat this paragraph as a substitute for ProvenanceArmsRace.
