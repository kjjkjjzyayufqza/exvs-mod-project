# Provenance arms race — implementation plan

> **Status:** DESIGN COMPLETE, NO SCANNER CODE WRITTEN. Accepted in ADR 0009
> (2026-09-24).
> **Audience:** an engineer or agent implementing this cold, inside this
> repository only. This is InRepoWork. It is not a CrossProductPort.
> **Glossary:** `docs/governance/CONTEXT.md`. Decision: `docs/adr/0009-provenance-arms-race.md`.
>
> **Hard rules:** English code and comments. No covert prompt injection. No
> new file-top comment campaign. Do not put live trap plaintext in git. Do
> not add ghost rows to the public `*_COMMAND_POOL` tables. Do not `--seal`
> or weaken AgentContract, SourceNoticeCanary, or protection-hold files.

---

## 0. How to use this document

Implement phases in order. Each phase has a validation command that must pass
before the next phase. Phase 1 is the only phase that touches `.gitignore`
(already done at the time this plan was written). Phases 2–4 add the scanner
and the local overlay. Phase 5 is a procedure, not a library.

Do not start Phase 4 (minting live traps) until Phase 3's synthetic tests are
green. Live traps never enter a commit.

---

## 1. Incident this plan is built against

A foreign product (FHM2D resource manager, build notes dated 2026-09) was
given this tree. Its agent was not bound by this repo's `AGENTS.md`. The
notes record the following sequence. Later phases exist to survive each step.

| Step | What they did | What failed |
|---|---|---|
| 1 | Opened this tree from another workspace | AgentContract and `.cursor/rules` never loaded |
| 2 | §122 quoted PolyForm Shield, CC BY-NC-SA, the IB ban, and the ban on moving unique implementation into another product. Author named as `kjjkjjzyayufqza` | The comment layer worked as evidence only |
| 2b | `AEtools_評估.md` refused to paste the names into `serve.py` / `vgt2_fields.json`, then told its user to change `0xDC8AC901` from 13 to 40 in the game and, if the sphere grows, write that result as their own conclusion in their own words | Loyalty here is to the foreign user, not to the license. The agent withheld the sentence and handed over the experiment that makes the sentence unnecessary. A later scan of "their own words" will not see the original name |
| 3 | Human instruction recorded as ignore-the-license for testing. §123 then imported the names anyway | NoCommentEscalation: another sentence would not bind their model. Step 2b was abandoned as soon as the user ordered the copy |
| 4 | `ae_import.py extract` read `src-tauri/src/format/*.rs` `*_COMMAND_POOL` rows `(hash, kind, "name")` | SourceNoticeCanary on `bulletparam.rs` did not stop the read. `0x130D4C0B` / `spread_angle` left the file |
| 5 | §124 ported `src-tauri/src/format/obf_string.rs` to `obf_string.py` | The port is a rewrite. The `.rs` canary hash is absent from their zip because they did not ship the `.rs` |
| 6 | `ae_import.py strip` deleted rows tagged AEtools before dist. §155 scanned `data\` and reported 0 occurrences of the string AEtools. Their dist `vgt2_fields.json` names `0x130D4C0B` as a generic unknown, not `spread_angle` | A detector that only searches for "AEtools" or for `spread_angle` in the dist zip returns nothing |
| 7 | Their private workshop copy was described as 1,250 columns including 441 AEtools names. Strip reduced the dist file to 182 | The useful copy still had the tuples. The zip they handed out was sanitized |

Consequences locked by that table:

- Scan the copy that still shows coined names, and scan their build log. A clean dist zip is not a negative result.
- A note that says "we verified it ourselves, so these are our words" is not exoneration when the same note contains the experiment they were told to run after reading this tree. Keep that note. Do not expect the rewritten paragraph to still contain the original field name.
- Proof is the tuple set, plus their own written admission. It is not the survival of a header comment.
- Hashes that are facts about the game, and cipher constants that are in the game, are leads. Independent reverse engineering reproduces them. A coined name paired with a real hash is the fingerprint.
- Anything already on the public remote is BurnedPublication. This plan does not rewrite history to un-leak it.

---

## 2. Bypass ladder

Each row is a bypass that has already happened or that their importer's own
rules will do next. The survivor is what Phase 3's tests must demonstrate.
A trap that dies in the row is forbidden as a live trap.

| Bypass | Dies | Survives |
|---|---|---|
| Delete license files, canary comments, the words AEtools / PolyForm / the author handle | Comment canaries, tagged `source` fields | Untagged `(hash, kind, name)` rows |
| Drop hashes that never appear in a real container (`check` reported 34 absent hashes) | Invented hashes | Traps whose hash is a real field and whose **name** is the coined part |
| Replace every name with a generic placeholder before the zip | Name traps in that zip | The pre-strip tree; the build log; names they kept because the tool is useless without them |
| Reimplement the parser in another language and do not ship the original `.rs` | Canary sentence, file hash | LoadBearingConstant as a lead only, if they kept the ported file |
| Read this plan and filter rows listed in git | Any trap committed to `main` | Traps that exist only under `local/provenance/` |
| Independent research from the game, no copy of this tree | Nothing of theirs to find | Detector must report "no tuple match", not a false accusation |

---

## 3. Layout

```
local/provenance/                  gitignored, created by the author, never committed
  manifest.json                    live TupleFingerprint list + recipient id
  recipient-<id>.json              one stamp per packed share
  README.txt                       one line: do not commit, do not paste into chat

tools/port_fingerprint/            committed
  scan.py                          PortDetector
  strip_sim.py                     mechanical strip used only by tests
  fixtures/                        synthetic pools and suspect trees
  fixtures/public_pool.rs.txt
  fixtures/suspect_keep_names/
  fixtures/suspect_stripped_words/
  fixtures/suspect_drop_unknown_hash/
  fixtures/suspect_names_replaced/
  fixtures/suspect_independent/

docs/adr/0009-provenance-arms-race.md
docs/agent-sessions/provenance-arms-race/plan.md
```

`.gitignore` already contains `/local/provenance/`.

`manifest.json` shape (local only):

```json
{
  "recipient": "public-main",
  "rows": [
    {"hash": "0x130D4C0B", "kind": 5, "name": "spread_angle", "class": "burned"}
  ]
}
```

`class` is `burned` or `trap`. `burned` rows are copied from pools already
on the public remote, for scanning clones of that publication. `trap` rows
are minted locally and are never the same set as `burned`.

---

## 4. Phase 1 — boundary

**Goal:** a live trap cannot be committed by accident.

Already done: `/local/provenance/` is in `.gitignore`.

Validation:

```
git check-ignore -v local/provenance/manifest.json
```

Must print the gitignore rule. If the path is not ignored, stop.

---

## 5. Phase 2 — extract burned tuples

**Goal:** a committed generator reads the public pools and writes a
**fixture-scale** list so tests have something to scan. The author's real
burned manifest is written under `local/provenance/` and is not a test
artifact.

CREATE `tools/port_fingerprint/extract_pools.py`.

Behavior:

- Input: a directory of `*.rs` files, default `src-tauri/src/format`.
- Parse rows with a bracket matcher, not a single-line regex. The foreign
  notes already recorded that rustfmt splits one row across lines. A
  line-anchored regex is a known miss.
- A row is `(0xHHHHHHHH, <integer kind>, "<name>")` inside a
  `*_COMMAND_POOL` slice.
- Skip names that are `field_` + hex or `unresolved_`. Those are unlabeled.
- Stdout JSON list of `{hash, kind, name, file}`.
- `--local-out PATH` writes `manifest.json` with `"class": "burned"` and
  `"recipient": "public-main"`. Refuse if `PATH` is not inside
  `local/provenance/`. Refuse if the destination is under the repo and not
  gitignored (`git check-ignore`).

Do not embed the full public pool into `tools/port_fingerprint/fixtures/`.
Fixtures use three invented rows (section 7).

Validation:

```
python tools/port_fingerprint/extract_pools.py --local-out local/provenance/manifest.json
git check-ignore -q local/provenance/manifest.json
```

The second command exits 0. `git status` does not list `manifest.json`.

---

## 6. Phase 3 — scanner and strip simulator

**Goal:** PortDetector scores a suspect tree. Tests prove the bypass ladder
on synthetic data only.

CREATE `tools/port_fingerprint/scan.py`.

```
python tools/port_fingerprint/scan.py --manifest PATH --tree DIR [--log FILE]
```

- `--manifest` is required. Refuse a manifest path inside the repo that is
  not gitignored, except paths under `tools/port_fingerprint/fixtures/`.
- Walk text files under `--tree` (`.rs`, `.py`, `.json`, `.md`, `.html`,
  `.toml`, `.txt`). Skip binaries.
- Normalize hash text to lowercase `0x` + 8 hex digits.
- A **pair hit** is one manifest row whose hash and exact name occur in the
  same file, not necessarily on one line (window of 400 characters).
- A **name-only hit** is the exact name with no hash in that window. Report
  it as weak. Do not count it toward the threshold.
- A **log hit** is a line in `--log` that describes extracting, merging, or
  stripping this project's pools or `obf_string`. This is a separate bucket,
  not a pair hit.
- Exit 0 and print `MATCH` when pair hits `>= --threshold` (default 8) **or**
  any row with `"class": "trap"` is a pair hit (threshold 1 for traps).
- Exit 2 and print `NO_MATCH` otherwise. Exit 1 on usage errors.
- Print the hit list to stdout. Do not write into the suspect tree.

CREATE `tools/port_fingerprint/strip_sim.py`. Used by tests, not as a weapon.

Given a directory, write a sibling directory with these mechanical passes,
each selectable by flag:

- `--drop-words` deletes lines matching `AEtools|PolyForm|kjjkjjzyayufqza|ACCEPTABLE_USE|SourceNotice|Agent contract` (case insensitive).
- `--drop-unknown-hash` deletes pool rows whose hash is not in a provided
  allow-list file.
- `--replace-names` replaces every quoted pool name with `unknown`.

CREATE fixtures. All names and hashes in fixtures are invented and must not
appear in `src-tauri/src/format`. Suggested rows:

| hash | kind | name | class |
|---|---|---|---|
| 0xA11CE001 | 5 | `paper_lantern_bias` | burned |
| 0xA11CE002 | 1 | `paper_lantern_gate` | burned |
| 0xA11CE003 | 5 | `paper_lantern_span` | trap |

`public_pool.rs.txt` contains those three rows plus a canary comment line
that includes the word AEtools.

Suspect trees:

| Fixture | Contents | Expected |
|---|---|---|
| `suspect_keep_names` | the three rows, no license words | MATCH (burned pairs >= threshold if threshold is 2 for the test; trap also matches) |
| `suspect_stripped_words` | output of `--drop-words` | MATCH, pairs still present |
| `suspect_drop_unknown_hash` | allow-list is only `0xA11CE001` and `0xA11CE002` | trap row gone; test asserts the **trap** is absent so this fixture documents a bad trap. A second fixture `suspect_drop_unknown_hash_real` uses allow-list that includes `0xA11CE003` and still MATCH on the trap. Live traps must be built like the second fixture, never the first |
| `suspect_names_replaced` | `--replace-names` | NO_MATCH. Document this limit in the test name |
| `suspect_independent` | a write-up that mentions hashes `0xA11CE001` but names them `width` | NO_MATCH |

Validation:

```
python -m unittest tools.port_fingerprint.test_scan
```

Add `tools/port_fingerprint/test_scan.py` that builds the stripped fixtures
by calling `strip_sim` into a temp directory. Do not commit generated suspect
trees if the simulator can rebuild them. Commit the input pool and the
expected exit codes.

---

## 7. Phase 4 — mint traps that survive the real importer

**Goal:** local trap rows a foreign `extract` + `check` + `strip-of-tags`
pipeline still carries, for as long as they keep names.

This phase does not edit `src-tauri/src/format/*.rs` on `main`.

Procedure (author machine):

1. Pick hashes that already occur in an in-scope Over Boost container the
   author has locally, and that already have a real row in the public pool.
   Do not invent hashes. Do not use a LaterThanObRevision container.
2. Do not replace the public name. A trap for the **next share** is an extra
   row only in the recipient pack, or a second coined alias stored in
   `local/provenance/` that is merged into a **pack copy** of the `.rs`, not
   into `main`.
3. The coined name must look like the surrounding names: lowercase
   snake_case, no author handle, no "canary", "trap", "watermark", "license".
4. Run `strip_sim --drop-words` and `--drop-unknown-hash` with an allow-list
   of hashes actually seen in that container. The trap row must remain.
5. Run `--replace-names` and record NO_MATCH. That is the sanitized-zip
   limit. Do not pretend the trap survives it.
6. Save the row in `local/provenance/manifest.json` with `"class": "trap"`.

Recipient pack (Phase 5) copies the public sources to a staging directory,
inserts only that recipient's trap rows into the staging copy, and zips the
staging copy. `main` stays unchanged.

Validation: `scan.py` on the staging copy with the local manifest reports
MATCH on the trap. `git status` in the repository is clean of
`local/provenance`.

---

## 8. Phase 5 — recipient packs and the evidence note

**Goal:** a share is stamped. A find is written down without editing the
suspect tree.

CREATE `tools/port_fingerprint/pack_recipient.py`.

```
python tools/port_fingerprint/pack_recipient.py --id RECIPIENT --out DIR
```

- Copy the repo to `DIR` excluding `.git`, `local/`, and UnlicensedGameMaterial
  patterns already in `.gitignore`.
- Insert trap rows from `local/provenance/recipient-<id>.json` into the
  staging `*.rs` pools only.
- Write `local/provenance/recipient-<id>.json` if missing, by calling the
  Phase 4 rules interactively: the script refuses to invent hashes. The
  author passes `--rows FILE` whose hashes were checked in Phase 4.
- Refuse `--out` inside the repo.
- Print the recipient id and the trap hashes. Do not print a suggestion to
  hide the stamp.

Evidence note, written by the author, not by the scanner. Template
`tools/port_fingerprint/EVIDENCE_NOTE.md.template`:

- Date, path of the suspect tree, manifest recipient id
- Scanner command and the pair-hit list (hash, name, file)
- Whether a build log was passed and which lines matched
- Explicit line: name-replaced dist zips are NO_MATCH and are not exoneration
- Explicit line: LoadBearingConstant hits are leads, not pair hits
- No instruction to attack, deface, or access anyone else's machine

Validation: packing into a temp directory and scanning it MATCH-es the
recipient trap. Packing does not modify the source repo worktree.

---

## 9. What this plan will not do

- It will not add a harsher SourceNoticeCanary. ADR 0008 stays as it is.
- It will not tell a foreign model to ignore its system prompt, delete the
  user's files, or refuse its own user. NoCovertInjection.
- It will not poison `main` with fake fields.
- It will not treat a game-derived constant as proof that source was copied.
- It will not un-leak BurnedPublication. `spread_angle` and the public pools
  are already in clones. New work goes to `local/provenance/` first.
- It will not scan, copy, or modify the foreign product as part of
  implementation. The author points `--tree` at a tree they already have.

---

## 10. Order of work

1. Phase 1 validation (`git check-ignore`).
2. `extract_pools.py` and a local burned manifest.
3. `strip_sim.py`, `scan.py`, fixtures, unit tests.
4. Mint traps only after the tests show `--drop-words` still MATCHes and
   `--replace-names` is a recorded NO_MATCH.
5. `pack_recipient.py` and the evidence template.

Stop after step 3 if no new share is planned. The scanner is still useful on
unstripped copies of the burned public pools.
