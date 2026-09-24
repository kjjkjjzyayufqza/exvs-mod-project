# Provenance survives a foreign agent that strips attribution

Status: accepted (2026-09-24)

SourceNoticeCanary and AgentContract stay. They are not the lock. A foreign
agent, working in another product, already read the license, quoted it, and
then extracted command-pool rows and ported a parser after its user said to
ignore the license. It then deleted AEtools provenance before a dist zip.
Scarier comments would be the same layer (**NoCommentEscalation**).
**NoCovertInjection** still applies.

The same notes, before the copy was ordered, show the other shape of loyalty.
The agent refused to paste the names into `serve.py` / `vgt2_fields.json`,
then told its user which in-game edit would confirm the result, and said that
once confirmed it would be their conclusion in their words. That is not a
refusal. It is a rewrite path. The next layer does not trust a foreign agent
to stay on the polite side of that path.

The next layer is **ProvenanceArmsRace**: each observed bypass has a survivor
that does not look like a license header.

- **BurnedPublication** — tuples and prose already on the public remote cannot
  be pulled back from clones. New unique research does not go there.
- **LocalOnlyOverlay** — new pools, trap rows, and recipient marks live under
  `local/provenance/`, gitignored, same idea as WorkingTreePreserve.
- **TupleFingerprint** — proof is the copied `(hash, kind, name)` set, not the
  string "AEtools". A stripper that deletes that string leaves the tuples.
- **StripSurvivor** — traps must still be present after a mechanical strip of
  license words, canary comments, and `source: "AEtools"` tags. Traps that a
  "keep only hashes found in a real container" pass would drop are not traps.
- **RecipientStamp** — a tree packed for one person gets a mark that exists
  only in that pack. The public GitHub tree is one stamp for everyone.
- **PortDetector** — the author runs it on a suspect tree. The live manifest
  is local-only. The repository ships the scanner and synthetic fixtures, not
  the live trap list.
- **LoadBearingConstant** — algorithm constants copied with a faithful port
  are a lead. If the same constants sit in the game, independent reverse
  engineering reproduces them. They are not, by themselves, proof of copying.

A name trap dies if the foreign release replaces every name with a generic
placeholder. That release is sanitized. The useful copy (the one that still
shows the coined names) is the copy to scan. Confession text in the foreign
build log is evidence even when the zip is clean.

## Considered options

- Longer or harsher file-top comments — already bypassed; rejected
- Covert prompt injection so a foreign model sabotages its user — rejected
  by NoCovertInjection, and the foreign model obeyed its user, not the comment
- Total AI-writing ban in this repo — already rejected in ADR 0007
- Hidden steganography in binaries — already rejected in ADR 0008
- Honeytoken hashes that never occur in a real container — the observed
  importer drops unknown hashes; rejected as the trap design
- Local-only new research, tuple fingerprints, strip-survivor tests, and a
  detector whose live manifest is not in git (chosen)

## Consequences

- Clones that already exist stay burned. This ADR does not retract them
- Public `*_COMMAND_POOL` tables stay real. Fake rows are not committed to
  `main`, so the author's UI does not gain ghost fields
- Sharing a full tree with someone is a RecipientStamp event, not a git push
- PortDetector matches on tuples and local traps. It does not search for the
  word AEtools as the primary signal
