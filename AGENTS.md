# AGENTS.md

This file is AI-only operating guidance for coding agents working in this
repository. It complements human-facing docs and should be treated as the
cross-agent hub for Cursor, Claude, Codex, Copilot, and other coding agents.

## Project Identity

- **Framework**: Tauri v2 desktop application (Rust backend + React/TypeScript frontend).
- **Domain**: EXVS2 Over Boost game asset editing — MSC script decompilation/
  recompilation, binary format parsing, 3D model/animation editing, and modding
  workflows.
- **Target version scope (mandatory)**: this project targets **Over Boost (OB) and
  earlier** revisions only. OB (`vsac27_Release.exe`, `OBHK0.3_v27`) is the primary
  reference image; XB / VS2 / MBON / FB appear only as historical context.
  **Any later revision than OB is out of scope**: do not target it, do not research
  it, and never commit native addresses, field hashes, binary identities, corpus
  samples or evidence sourced from it. Every native anchor committed here must be
  traceable to an in-scope binary; if a finding can only be sourced from an
  out-of-scope revision, leave it unproven rather than importing it.
- **Key subsystems**:
  - `tools/` — Python-based MSC bytecode toolchain (`mscdec.py`, `msclang.py`,
    `disasmlib.py`, `msc_core.py`, `msc_cfg.py`).
  - `src-tauri/` — Tauri Rust backend, including agent-facing CLIs `exvs2-json`
    (`exvs2_json`) and `fhm2d-extract` (`fhm2d_extract`); see
    [CLI Tools](#cli-tools-agent-facing).
  - `src/page/` — React page components. `TestEditor/` is the EXVS2 Workspace page
    (route `/`, MSC workspace and all pack editors); also `Extract/` (Single FHM2D),
    `SceneEdit/`, `UnitModelEdit/`, `ResourceRegistry/`, `MiscTools/`, `Config/`.
  - `docs/` — Format specifications and research notes.

## Mandatory Task Startup Protocol

Before doing any task, every AI agent must:

1. Read this file first.
2. Read the Cursor project rule: `.cursor/rules/custom-rules.mdc`.
3. Use one scoped filename search for relevant `docs/` Markdown, then read only
   the most relevant specification before touching code or assets. Skip broad
   docs scans when the user names the exact file or the task is rules-only.
   **MSC exception:** for MSC research, MSC `X.c` edits, or named unit script
   ports, do not list `docs/msc-research/`. Load
   `.cursor/skills/msc-research-index/SKILL.md` and match a cluster with
   `python tools/msc_research_catalog.py --match "<keywords>"`, then read
   `read_first`. Canonical catalog: `tools/msc_research_catalog.py`. Markdown
   projection: `docs/msc-research/INDEX.md`.

   **MSC evidence gate (mandatory, non-negotiable).** Before proposing *any*
   MSC change:
   1. Run `--match`. Listing the folder and picking notes by filename is how the
      owner note gets missed — see `docs/msc-research/2026-08-27-msc-architecture-audit.md` F3/F7.
   2. Grep every hash / `func_N` / `globalN` you intend to touch against
      `docs/msc-research/msc-falsified-negatives-registry.md`. A hit means that
      design already failed in-game; stop and read the owner note instead of
      re-deriving it.
   3. Grade your claim. Reading `X.c` establishes **E1 only**. Engine-ABI and
      player-behaviour claims need E2/E3. Never publish behaviour policy from a
      source-only reading, and never write `Status: E3` without a real in-game run.
   4. Before each repack write down H (hypothesis) / P (prediction) /
      F (falsifier), and change **one** judgement-affecting variable per build.
      When two internal states look identical in game, add an SE/effect probe
      (protocol §3.4) instead of more source reading.

   Protocol: `docs/msc-research/msc-evidence-grade-and-ingame-audit-protocol.md`.
   Checker: `python tools/check_msc_doc_evidence.py`.

## GPT/Codex Fast Path (Mandatory For Non-MSC Work)

For GPT-5.6 Sol and other GPT coding models, minimize elapsed time, tool calls,
and tokens as an explicit correctness constraint:

### Hard MSC exclusion

The fast path does **not** apply to MSC research, MSC `X.c` edits, unit script
ports, or changes that couple MSC to motion/model/Param/HUD state. For those
tasks:

- Do not activate `caveman`, `gpt-fast-path`, or `gpt-fast-verify`.
- Do not enforce one discovery path, one tool, one verifier command, or
  stop-on-first-pass behavior.
- Use `.cursor/skills/msc-research-index/SKILL.md` and complete its mandatory
  lifecycle/state-ownership audit before editing.
- Also load `.cursor/skills/msc-ingame-audit/SKILL.md` before asserting any
  runtime behaviour or building a repack. Reading `X.c` grades a claim E1 only;
  behaviour claims need E3 (in-game). Grep the falsified-negatives registry
  first, pre-register H/P/F, change one variable per build, and ship an SE probe
  rather than asking the user to introspect.
- Trace ENTER, ACTIVE, EXIT, INTERRUPT, and RESPAWN/REINITIALIZE paths, including
  reverse transitions and shared state inheritance.
- Verify every referenced action hash, motion Runtime ID/raw `unk1`, Param row,
  model/shell dependency, HUD slot, and state-machine owner against current
  target assets.

This exclusion overrides model/speed defaults and every generic fast-rule
instruction below. MSC work may use multiple focused reads and multiple staged
verification gates when the domain audit requires them.

- Use `caveman`, `gpt-fast-path`, and `gpt-fast-verify` for routine work.
- Use one discovery path: CodeGraph for structure or `rg` for literal text.
  Never re-check the same fact with a second tool after deterministic success.
- Batch independent reads and commands. Do not re-read unchanged files or rerun
  unchanged successful commands.
- Default completion gate is exactly one shortest high-signal semantic command.
  Prefer the exact affected test; otherwise use one narrow build/type/syntax
  check. Stop after it passes.
- Do not automatically chain build, typecheck, lint, tests, coverage, audit,
  E2E, or full-workspace checks. Do not run app tests for docs/rules/skill-only
  changes.
- Expand verification only when the user explicitly requests it, release work
  requires it, the first verifier fails, or material security/data-loss risk
  cannot be covered by the narrow gate.
- `gpt-fast-verify` overrides broad default behavior from generic
  `verification-loop` / `verification-before-completion` skills. Fresh evidence
  remains mandatory; evidence breadth does not.

## Lightweight Agent Sessions

Use a lightweight session note only for multi-step research, work that spans
multiple turns, or work that may need a handoff. Simple questions and small,
self-contained changes do not require a session file.

- Store new session notes as `docs/agent-sessions/YYYY-MM-DD-<topic>.md`.
- Use the date-first `YYYY-MM-DD` naming convention and a short lowercase
  kebab-case topic.
- Keep one file per task. Do not create separate `todo.md` / `process.md` pairs.
- Keep the note concise: goal, relevant context, current progress, verification
  evidence, and remaining work are sufficient.
- Update the note only when material findings or task state change. Platform
  plans and checklists are optional, not mandatory phase gates.
- For short tasks, the final response is the session record.

### Legacy auxiliary notes

The repo may contain older per-topic note folders under `docs/` (historically
`todo.md` / `process.md` pairs). That layout is a **legacy, separate workflow**
from an earlier AI task manager. It is **auxiliary only**:

- **Do not** adopt it as your primary task tracker, handoff system, or startup
  obligation.
- **Do not** create or update those folders unless the user explicitly asks.
- **May** read existing notes when they contain useful historical context,
  research evidence, or prior decisions for the current task.
- For current truth, prefer `docs/` specifications and current verification
  evidence over stale session notes.

## Active Research Bootstrap (Read Before Rediscovery)

Long-running research cases may register a compact bootstrap here. When a task
matches a registered trigger, read the linked bootstrap **before** CodeGraph,
`rg`, broad docs searches, binary inspection, or asset inventory. Treat its
settled findings as the starting state; do not reproduce them merely to gain
confidence.

All other MSC clusters (global `2.c`, `0.c` input, Gyan, Delta Plus, syscalls,
toolchain, per-unit pages) live in `tools/msc_research_catalog.py`. Match first;
do not rediscover `docs/msc-research/`. Do not rewrite existing MSC notes to
improve indexing — add aliases/clusters to the catalog instead. The Wing Zero
Rebellion bootstrap below stays inlined because it is an active port; still
`--match` so alt2 gerobi / `SUB_SHOT_CUSTOM` are not mixed into the transform
port.

### Wing Zero Rebellion transformation port

**Triggers:** `Wing Gundam Zero Rebellion`, `wing_gundam_zero_rebellion`,
`900000004`, `28001001`, `028gunwtv_001gunwtv_001`, `kamaesht2neo`, or work on
porting the TV Wing Zero / Neo Bird transformation.

Read order:

1. `docs/agent-sessions/2026-08-09-wing-zero-rebellion-transform-handoff.md`
   — compact current truth, invalidated assumptions, source paths, and restart
   conditions.
2. `docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md`
   — read only the sections needed for implementation or a disputed detail.
3. `docs/msc-research/wing-zero-rebellion-bird-form-0c-input-map.md`
   — bird-form input map: **0.c `func_143` only** (not `2.c` `ACTION_*`);
   Rebellion main-shot bit = **`0x1`** (not TV `0x100`); bird form id = **`0x2`**.
   Bird melee `0x2` → `0x928ca34f` `func_937` (N followup, no model switch):
   `docs/msc-research/wing-zero-rebellion-bird-melee-n-followup.md`.
4. `docs/msc-research/wing-zero-rebellion-flight-interrupt-form.md`
   — hit/interrupt is **FORCED_RECOVERY**, not TV requeue of `0x77b100ff`.
   Action hash ≠ form (`global143`). Do not tear form only on standing idle.
5. `work/20260809-wing-zero-rebellion-transform-plan/evidence/E-007.md` and
   `E-008.md` — read only when auditing the canonical-name inventory, direct
   motion Items, SHL mapping, or skeleton comparison.

Reuse rules:

- Locate source resources by canonical names, never by package hash. Resource
  table hashes are validation values after name resolution.
- Do not re-derive Rebellion vs TV input-bit semantics or re-litigate “gate
  bird arsenal in 2.c ACTION_*” — settled in the bird-form input-map note.
- Do not re-derive bird melee: `0x2` is `0x928ca34f` only (not `0x8b97920e`,
  not Delta `func_888(0x8)`). Do not mix with TV bird special-melee landing.
- Ground special-N dash (`cut_in_loop` / 676 / 677 on hash `0x928ca34f`) must
  **not** write `global143 = 0x2`. That value belongs only to transform
  `0x9475130e`. Publishing form on the dash switches `0.c` to the bird table:
  detach looks like it never ran, and 30-frame stick cannot pick native
  `0x77b100ff`. See `docs/msc-research/wing-zero-rebellion-special-n-bird-dash.md`.
- No-stick after the 30f dash: keep writing `sys_46(0x1, 0x1)` with
  `func_296(0x3e8, 1)` and `func_167(0x1004000)`. Do not inherit via
  `func_296(0)` + channel `0x2` (air idle/jump), `sys_46(0xf)` then `252`,
  `func_169(0x4000)` on 679 start, or `func_287(0x3ed)` as ground. Visual
  untransform must follow `natural_exit` (no `0x4000` clear). Runtime
  2026-08-27. Full process/audit: same dash note.
- Homemade clip duration (`SUB_SHOT_CUSTOM` / `tks11a` / `0xa0cd8d56`) is
  **not** this transform bootstrap. `--match "homemade motion clock"`.
  Do not copy stock `func_309` / `sys_47(0x7)` waits onto homemade folders;
  do not use `func_310` as homemade rate. See
  `docs/msc-research/homemade-motion-clock-vs-game-frame.md`.
- Independent striker spawn (`516001001` / `sys_51(0x20000)` / front-back
  `0x53554243`) is **not** this transform bootstrap. `--match "striker-sys51"`.
  Keep the EW `0.c` `0x90000` / `d0001` gate on front/back only; do not put
  it on N/left/right homemade sub-shot. Do not mix with unit-task automata.
- Do not repeat source file counting, six-resource inventory, three transform
  motion lookup, SHL model-folder mapping, or body/wing skeleton comparison
  unless a restart condition in the bootstrap is met.
- Do not unpack FHM2D for this case. The complete named source resources and
  modern structure JSON files are already present.
- Do not reopen the legacy hash manifests to determine availability; their old
  “85 model assets missing” conclusion is explicitly superseded.
- If implementation is requested, begin at the bootstrap's implementation
  checkpoint and capture target before-manifests. Do not restart research from
  package discovery.

## Required Documentation Sources

Use `docs/` as the first source of project truth:

- `tools/msc_research_catalog.py` — MSC research cluster catalog (agent/CodeGraph
  index). Markdown projection: `docs/msc-research/INDEX.md`. Skill:
  `.cursor/skills/msc-research-index/SKILL.md`. Rule:
  `.cursor/rules/msc-research-index.mdc`.
- `docs/msc-binary-format-spec.md` — MSC bytecode format specification (header,
  opcodes, pushBit, script offset table, string table, EXVS2 vs Smash differences).
- `docs/msc-research/func593-vanilla-ranged-slots.md` — vanilla / old-style
  `func_593` ranged quartet: `676` start, `677` shoot, `678` **no-ammo
  (not cancel)**, `679` end. Do not confuse with `func_587` (`677`+`680` fire).
- `docs/msc-research/homemade-motion-clock-vs-game-frame.md` — homemade
  NUANMB folder clock ≠ game-frame clock. Phase length is
  `global244 -= func_274()` (1 frame = `0x64`). Do **not** wait homemade
  folders on `func_309` / `sys_47(0x7)`; do **not** use `func_310` as a
  homemade rate knob. Rule: `.cursor/rules/msc-homemade-motion-clock.mdc`.
  Registry: `docs/msc-research/msc-falsified-negatives-registry.md` §H.
- `docs/msc-research/sys51-independent-striker-vs-automata.md` — independent
  `5xxxxxxxx` strikers spawn **only** via MSC `sys_51(0x20000, 0, 0x2,
  slot_index, type)` + `strikertable[host][slot]`. EW `0.c` must keep
  `sys_0(0x90000, 1)` and `d0001 && !d000b` before `ACTION_AB_SUB` (skip =
  motion yes, unit no). Not automata / host `bulletparam` summon. Cluster
  `striker-sys51`. Registry J.
- `docs/exvs-stage-numatb-simple-color.md` — stage map props with only a color
  texture: use `FeRendererMovableVertexColor` → `vstgStandard_VertexColor`, strip
  unused PBR slots (avoids in-game overexposure).
- `docs/gvs-numatb-step2-migration-changes.md` — GVS→EXVS2 numatb migration rules.
- `docs/exvs2-json-cli.md` — `exvs2-json` CLI for EXVS2 binary resource
  inspection, scoped JSON-driven editing, and correlation JSON (implementation
  in `src-tauri/`).
- `docs/nuanmb-ath-helper-bone-policy.md` — homemade NUANMB must **not**
  author/edit/convert `ATH_*` helper bones; writer omits whole Transform
  nodes (NUHLPB + rest only). Code: `ssbh_motion_interchange/nuanmb.rs`.
- `docs/nuanmb-exvs2-import-in-game-layout.md` — homemade body/shot NUANMB
  for **in-game** use. Retest ranking: **indexed multi-frame `0x4300` is the
  critical shot fix**; also CompScale/Visibility shell + hygiene (no ATH /
  residual / wrong source); **full Translate on every bone** (omit-limb-T not
  required). Import FBX write path. Code: `ssbh_motion_interchange/nuanmb.rs`.
- `docs/fhm2d-extract-cli.md` — `fhm2d-extract` CLI for unpacking OB `.fhm2d`
  with required `--type` / `--layout`; agent outputs must stay under `tmp/`
  (see `.cursor/rules/fhm2d-extract-artifacts.mdc`).
- characterparam empirical field identity: `lockOnDistanceMax` +
  `alertRangeDistance` = 红锁, `boostGaugeInitial` = HP; prefer these over stale
  pool names when they conflict. **Superseded on the lock question**: the
  red-lock boundary is `min(Family1, Family2*scale + offset - 1)`, so no single
  field owns it. (Detail write-ups are local-only and not tracked here.)
- `docs/param-evidence-registry.tsv` — machine-readable evidence state for every
  `speedparam` / `characterparam` field hash: grade, consumption mechanism, value
  spread, citation. Generated; validated by `tools/check_param_name_evidence.py`.
- Lock-on chain (band resolver, inner/outer radius formulas, slot-selection
  gate) and the characterparam consumer classification (197 fields: 128 code /
  32 `.rdata` hash array / 37 absent, plus the `find immediate` false-negative
  trap) are recorded in local-only param research notes, not tracked here. Use
  `docs/param-evidence-registry.tsv` as the tracked source of evidence state.
- `docs/speedparam-msc-consumer-evidence.md` — per-hash MSC call-site arithmetic
  for all 74 speedparam fields.
- `docs/param-table-id-file-binding-proof.md` — proven `sys_0` table id → param
  file bindings (`0x60006`=speedparam, `0x60002`=grapparam, `0x60007`=interactionid).
- `docs/msc-research/gyan-main-shot-no-auto-turn.md` — disable main-shot
  auto-turn (`global693` / `func_592`); flight uses `global24 & 0x4000`.
- `docs/msc-research/gyan-melee-direction-actions.md` — Gyan directional melee:
  后格 = `ACTION_B_MELEE_DIR_4` (`0x58CC87CE`); 左右 = `DIR_2` / motion
  `0xECE28FD9` (not 后格).
- `docs/msc-research/gyan-back-melee-movement.md` — 后格位移: `func_495` +
  `func_528`/`func_516` 追踪 + `func_964`/`func_965` → `sys_46(0x1,0x4,…)`.
- `docs/msc-research/gyan-session-2026-07-11-handoff.md` — Gyan/tooling session
  (Param `0x35B195CC`, speed C2 vs B7, flight camera, Dodai spawn VFX vs N2,
  Param Editor labels, Extract→Workspace).
- `docs/param-editor-typed-labels-notes.md` — typed Param Editor list labels
  (kind-7 string/offset) and Extract-to-Workspace behavior.

When adding new research findings, write them under `docs/` as standalone
specifications or research notes.

## Technology Constraints

1. Use **Tauri v2 APIs/plugins** for all native file system access, dialogs, and
   OS interactions. Do not use Node.js `fs`, `path`, or browser-only APIs for
   native operations.
2. All multi-byte integers in MSC **headers** are **little-endian (LE)**. All
   opcode parameters in the **script body** are **big-endian (BE)**.
3. For `bone_index`, hash, jnttbl, nusktb calculations, always use **LE values**
   for matching. BE/LE switching is UI-only.
4. Performance-sensitive operations (large file reads, heavy re-renders, deep
   recursion) must be flagged to the user before implementation.
5. Python MSC tools use `msc_core.py` as the unified MSC definition module.
   The old `mscdec_msc.py` and `msclang_msc.py` are deprecated.

## MSC Toolchain Architecture

The MSC decompile/compile pipeline:

```
MSC binary (.bscex/.cscex/.dscex)
  → disasmlib.py (CFG-based script reference resolution via msc_cfg.py)
  → mscdec.py (bytecode → C decompilation + switch-case beautification)
  → .c file

.c file
  → msclang.py (legacy repack; use msclang_modern.py for semantic research only)
  → MSC binary (.mscsb)
```

Key design decisions:
- Function pointer resolution happens at disassembly time (msc_cfg.py), not via
  post-processing text patches on .c output.
- The compiler's `addArg()` correctly tracks nested `try`/`callFunc` depth to set
  pushBit, eliminating the need for binary patching (0x2E→0xAE).
- `msc_cfg.py` builds control flow graphs per script and performs per-basic-block
  stack simulation to resolve script references.

## CLI Tools (Agent-Facing)

### `exvs2-json` (Cargo binary: `exvs2_json`)

Read-only CLI for converting known EXVS2 binary/resource files into structured
JSON. There is **no** tool named `exvs2-cli`; use `exvs2-json` / `exvs2_json`.

| Item | Path |
|------|------|
| Full spec | `docs/exvs2-json-cli.md` |
| CLI core | `src-tauri/src/exvs2_json_cli/` |
| Binary entry | `src-tauri/src/bin/exvs2_json.rs` |
| Integration tests | `src-tauri/tests/exvs2_json_cli_test.rs` |
| Debug executable (agent default) | `src-tauri/target/debug/exvs2_json.exe` |
| Release executable | `src-tauri/target/release/exvs2_json.exe` (**only if user asks**) |

**Agent build policy (mandatory):** Do **not** use `cargo … --release` for normal
work. Prefer debug for speed. See `.cursor/rules/no-release-builds.mdc` and
`.cursor/rules/custom-rules.mdc` §7a.

**Artifact location policy (mandatory):** Every persisted artifact created while
preparing, running, or validating `exvs2-json` must be placed under the
repository-root `tmp/` directory. Prefer a task-scoped directory such as
`tmp/exvs2-json/<task>/`. This includes redirected `inspect` / `correlate` JSON,
edit request JSON, files written by `edit --output`, reports, logs, diffs, and
manually created round-trip fixtures. Do not write these artifacts beside source
assets, into `docs/` or `src-tauri/`, or directly into the repository root.
Paths are relative to the current working directory: use `tmp/...` from the
repository root and `../tmp/...` from `src-tauri/`. Console-only output does not
create an artifact; redirect it into `tmp/` whenever it needs to be retained.
See `.cursor/rules/exvs2-json-artifacts.mdc`.

**Commands**

- `inspect` — parse `.jnttbl`, `character_id_table.bin`, `vernier_table`,
  `armsparam`, `bulletparam`, `projectile_depiction_table`, `navi_list`,
  `pilot_list`, and SSBH model files (`.nusktb`, `.numshb`, `.numdlb`;
  auto-detect or `--type`). Prefer `--summary --pretty` for large files; for
  `.numshb` use `--raw-fields` only when full vertex buffers are required.
- `edit` — apply AI-facing JSON edit requests to lossless builder-backed file
  types (`jnttbl`, `character_id_table`, `vernier_table`, `armsparam`,
  `bulletparam`, `speedparam`, `projectile_depiction_table`, `navi_list`,
  `pilot_list`). Use `--dry-run` for preview-only output; SSBH files remain
  inspect-only because their rewrite is not byte-identical.
- `correlate` — emit a JSON skeleton joining unit/weapon/dispatcher/IDA evidence
  (paste IDA symbols via optional flags; does not call IDA automatically).

**Run** (from `src-tauri/`; **debug only** unless user requests release):

```powershell
cargo run --bin exvs2_json -- --help
New-Item -ItemType Directory -Force "..\tmp\exvs2-json\<task>" | Out-Null
cargo run --bin exvs2_json -- inspect "<path>" --summary --pretty |
  Out-File -Encoding utf8 "..\tmp\exvs2-json\<task>\inspect.json"
cargo run --bin exvs2_json -- edit "<path>" --request "..\tmp\exvs2-json\<task>\edit-request.json" --output "..\tmp\exvs2-json\<task>\edited.bin" --pretty |
  Out-File -Encoding utf8 "..\tmp\exvs2-json\<task>\edit-report.json"
cargo run --bin exvs2_json -- correlate --unit 001GUNDAM/005GYAN00/001 --weapon SuibakuMissile --id 10050102 --pretty |
  Out-File -Encoding utf8 "..\tmp\exvs2-json\<task>\correlation.json"
# Prefer after code change:
cargo build --bin exvs2_json
# then: .\target\debug\exvs2_json.exe inspect ...
```

JSON output envelope always sets `"tool": "exvs2-json"`. Reuses the same Rust
parsers as the desktop editor backend. Cross-repo pickup for  hook
research: `docs\EXVS2JsonCli.md`.

### `fhm2d-extract` (Cargo binary: `fhm2d_extract`)

Standalone OB `.fhm2d` unpacker with **required** `--type` naming and explicit
`--layout folder|flat`. Same thin-bin + library CLI core pattern as `exvs2-json`.
Prefer this CLI for agent-side FHM2D unpack; do not use legacy
`fhm2d_extract_folder` unless the user asks.

| Item | Path |
|------|------|
| Full spec | `docs/fhm2d-extract-cli.md` |
| CLI core | `src-tauri/src/fhm2d_extract_cli/` |
| Binary entry | `src-tauri/src/bin/fhm2d_extract.rs` |
| Extract engine | `src-tauri/src/format/fhm2d.rs` |
| Integration tests | `src-tauri/tests/fhm2d_extract_cli_test.rs` |
| Debug executable (agent default) | `src-tauri/target/debug/fhm2d_extract.exe` |
| Artifact isolation rule | `.cursor/rules/fhm2d-extract-artifacts.mdc` |

**Agent build policy (mandatory):** Debug only. See
`.cursor/rules/no-release-builds.mdc` and `.cursor/rules/custom-rules.mdc` §7a.

**Artifact location policy (mandatory):** Every persisted artifact created while
preparing, running, or validating `fhm2d-extract` must be placed under the
repository-root `tmp/` directory. Prefer a task-scoped directory such as
`tmp/fhm2d-extract/<task>/`. This includes `--output` extract folders, sibling
`*_structure.json`, `meta.bin`, redirected logs, reports, and temporary
fixtures. Do **not** extract beside source `.fhm2d` assets, into game/workspace
trees, `docs/`, `src-tauri/`, or the repository root unless the user explicitly
requests that path. Paths are relative to the current working directory: use
`tmp/...` from the repository root and `../tmp/...` from `src-tauri/`. See
`.cursor/rules/fhm2d-extract-artifacts.mdc` and custom-rules §7c.

**Run** (from `src-tauri/`; **debug only**):

```powershell
cargo build --bin fhm2d_extract
$task = "..\tmp\fhm2d-extract\<task>"
New-Item -ItemType Directory -Force $task | Out-Null
.\target\debug\fhm2d_extract.exe "<source.fhm2d>" `
  --output "$task\pack" `
  --type motion `
  --layout folder `
  2>&1 | Tee-Object -FilePath "$task\extract.log"
# flat example:
.\target\debug\fhm2d_extract.exe "<source.fhm2d>" -o "$task\pack_flat" -t character -l flat
```

**Required flags (no silent defaults):** `--type` / `-t` and `--layout` / `-l`
(`folder` | `flat`). Types: `character`, `effect`, `motion`, `msc`, `sound`,
`character_param`, `character_cost`, `striker_table`, `all_nutexb`, `stage_list` (also `fhm2d_*`).

Writes files under `--output` and `<out_dir>_structure.json` beside that folder
name (still under `tmp/` when `--output` is under `tmp/...`). Layout is
independent of type. Naming warnings go to stderr; extraction still succeeds
when files were written.

## Rule And Skill Link Map

`AGENTS.md` is the hub. Every project rule or skill should link back here.

Current project rule entry points:

- Cursor project rule: `.cursor/rules/custom-rules.mdc`
- GPT fast verification: `.cursor/rules/gpt-fast-verification.mdc`
- `exvs2-json` artifact isolation: `.cursor/rules/exvs2-json-artifacts.mdc`
- `fhm2d-extract` artifact isolation: `.cursor/rules/fhm2d-extract-artifacts.mdc`
- No release builds: `.cursor/rules/no-release-builds.mdc`
- MSC research cluster routing: `.cursor/rules/msc-research-index.mdc`
- Homemade NUANMB motion clock: `.cursor/rules/msc-homemade-motion-clock.mdc`
- Cross-agent hub: `AGENTS.md`

Project skills (domain):

- GPT shortest execution path: `.agents/skills/gpt-fast-path/SKILL.md`
- GPT one-command semantic gate: `.agents/skills/gpt-fast-verify/SKILL.md`
- MSC research cluster index: `.cursor/skills/msc-research-index/SKILL.md`
- MSC evidence grading + in-game audit: `.cursor/skills/msc-ingame-audit/SKILL.md`
- FHM2D stage pack/extract: `.cursor/skills/fhm2d-format/SKILL.md`
- Stage numatb color-only materials: `.cursor/skills/exvs-stage-numatb/SKILL.md`
- Tauri large binary IPC: `.cursor/skills/tauri-ipc-large-binary/SKILL.md`
- Body/wing motion FBX split export: `.cursor/skills/exvs2-body-wing-fbx-export/SKILL.md`

## Development Conduct

- Communicate with the user in Chinese; write code and comments in English.
- Do not leave `TODO` / `FIXME` markers in code.
- When modifying MSC decompiled `X.c` files, wrap every AI-added or AI-modified
  code block with the required `// AI decision (YYYY-MM-DD): ...` and
  `// End, origin is ...` comments. Inside the block, comment original
  `global` / `func_*` / `sys_*` behavior and traps; do not restate AI
  semantic names. See `docs/msc-research/msc-ai-edit-block-rule.md`. Verify
  with `python .\tools\check_msc_ai_blocks.py "<modified X.c>"`.
- **MSC function pointers must be symbols, not decompiled script offsets.**
  Default `msclang` relocates `func_143` but keeps bare ints like `0x5fef`
  forever; growing any earlier function then breaks the action thinker and the
  unit has no actions. After editing any `0.c` / `2.c`, run:
  `python .\tools\check_msc_opaque_func_ptrs.py "<modified X.c>"`
  Critical bad pattern: `sys_1(0x10001, 0, 0x1, 0x5fef)` — must be
  `sys_1(0x10001, 0, 0x1, func_143)`. Optional rewrite:
  `python .\tools\check_msc_opaque_func_ptrs.py "<file>" --fix --write`.
  Full bug report: `docs/agent-sessions/2026-08-13-msc-0c-function-pointer-offset-bug.md`.
- **MSC action shape is corpus-measured, not opinion.** After editing any `2.c`,
  run `python .	ools\check_msc_action_shape.py "<modified 2.c>"`. It errors only
  on invariants with zero counterexamples across 538 vanilla units / 1881 action
  bodies: `callFunc3` at most once per action body, its argument a bare function
  identifier defined in the same file, no `callFunc` / `callFunc2` / `set_main`
  in an action body, and `func_586()` before the first `global676` write.
  Everything else is an informational note, because vanilla violates it.
  Before writing down any new MSC prohibition, look for counterexamples with
  `python .	ools\check_msc_action_shape.py --corpus-report --scan-dir E:\XB\mod msc`.
- **Every decompiled `X.c` carries a reading contract banner.** `mscdec.py` emits
  it; it is comment-only, so the compiled bytecode is byte-identical (verified by
  recompiling a stamped and an unstamped copy of the same file). Do not delete it
  — skills and rules stay in this harness, but the banner travels with the file to
  any external model. Stamp older files with
  `python .	ools\msc_ai_header.py --stamp "<X.c>"`; verify with `--check`.
  The full paste-able version is `docs/msc-research/MSC_AI_PRIMER.md`.
- When adding symbols to MSC decompiled `X.c` files, work as a reverse engineer:
  preserve existing decompiler names when reading old code, but never invent new
  opaque names like `global777` / `var42` for AI-added state. Use semantic names
  grounded in proven evidence, and record uncertain meanings in the AI block
  origin or semantic overlay.
- **Param field names are evidence-gated.** The canonical key for a param field
  hash is the one in `src-tauri/src/format/*param.rs`; the evidence state lives in
  `docs/param-evidence-registry.tsv`. `docs/command_mapping.md` and
  `docs/speedparam-semantic-ledger.md` are **historical claim records, not sources
  of truth** — both carry a superseded banner and both have been the direct cause
  of an agent re-reporting an already-corrected field as wrong. After touching any
  param pool, ledger, or field-note document, run:
  `python .\tools\check_param_name_evidence.py`
  It fails when a field the engine cannot reach claims a gameplay name, when the
  registry and a pool disagree, or when a document asserts a name no pool
  recognises. Regenerate the registry with
  `python .\tools\param_evidence_registry.py --out docs\param-evidence-registry.tsv`.
  Never rename a param key without adding the old name to that file's legacy alias
  table in the same change.
- Do not start dev servers unless the user explicitly asks.
- Prefer reusing existing utility functions, components, and data models.
- Each `page` component should have a corresponding `components/` directory.
- Use `useTransition` for heavy UI updates that should not block input; use
  explicit loading state for I/O operations.

## Verification And Handoff

- For non-MSC changes, run exactly one narrowest reliable semantic verifier for
  each change, then stop on pass. Do not add generic build/lint/type/full-suite
  checks afterward.
- **MSC runtime-first verification budget (mandatory):** automated checks only
  protect source/bytecode integrity; they cannot validate gameplay. After the
  minimum relevant source guard and a successful legacy compile/repack, stop
  running additional MSC checkers and hand the build to the user for the
  pre-registered in-game H/P/F matrix. Do not automatically add
  decompile/recompile roundtrips, full-doc evidence scans, corpus scans,
  unrelated checkers, or repeated hash/readback confirmation. Run
  `check_msc_ai_blocks.py` and `check_msc_opaque_func_ptrs.py` when their
  corresponding source risks exist; run `check_msc_action_shape.py` only when
  action wiring/phase shape changed. Expand static verification only after a
  relevant failure, an artifact-identity dispute, a compiler/toolchain change,
  or an explicit user request.
- For MSC `X.c` or MSC-coupled asset changes, complete the lifecycle/state audit
  and current-target resource proof, then use the runtime-first budget above.
  Runtime behaviour remains unverified until the user tests the scoped in-game
  transition matrix. Report every unauthorized or unrun runtime gate explicitly.
- For MSC tool changes, prefer one targeted real-file round-trip command or
  test that covers function pointer resolution, `try.` pushBit counts, and
  header flags together. Do not verify those as three separate workflows.
- Summarize what was done, what remains, and verification evidence in your
  final response or active plan artifact.
