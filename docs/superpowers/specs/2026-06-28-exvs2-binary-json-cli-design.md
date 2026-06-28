# EXVS2 Binary JSON CLI Design

> **For agentic workers:** This is a design/specification note only. Do not
> implement this CLI unless the user explicitly asks for development.

**Goal:** define the CLI an AI agent needs to quickly convert known EXVS2
binary/resource files into structured JSON and correlate them with unit,
weapon, IDA, and gameplay-facing references.

**Architecture:** one local CLI accepts any known EXVS2 file path, detects or
accepts the file type, parses the binary into lossless JSON, and optionally
emits cross-reference summaries for AI reverse-engineering. The CLI should use
the same field schemas as the Tauri project parsers so UI, backend, docs, and
agent workflows share one source of truth.

**Tech Stack:** Rust/Tauri parser modules as the authoritative implementation,
JSON output for AI consumption, optional CSV/Markdown reports for quick human
inspection.

---

## Why This CLI Is Needed

The current projectile/vernier analysis showed that binary parsing itself is
only one part of the cost. The expensive work is correlating several evidence
layers:

- Tauri project unit/resource data, such as `ob_unit.json`, unit weapon CSVs,
  unit task trees, and parser schemas.
- EXVS2OB atwiki player-facing weapon names, such as `水爆ミサイル`,
  `アッザム 呼出`, and `エルメス 呼出`.
- IDA constructor callbacks and vtable identities, such as
  `10050102 -> sub_140921E30 -> sub_14092BE10 -> SuibakuMissile`.
- Runtime vtable slots, such as slot 89 manual effect setup and slot 79 config
  initialization.
- Runtime gates, especially the task parameter byte at `task_param + 5` used by
  the table-driven vernier controller path.
- Effect argument order for helpers such as `sub_14062B180`, where the proven
  order is `effect_id`, `hitgroup_ref`, then `bone_hash`.
- Binary resource files such as `.jnttbl`, `vernier_table_*.bin`,
  `armsparam.bin`, `bulletparam.bin`, and projectile depiction tables.

Without a CLI, each AI session has to rediscover which parser to use, how to
read endian-sensitive hashes, whether a file is resource-level or task-level,
and how to compare it with IDA evidence. That is why the analysis took time:
the JNTTBL and vernier bytes were readable, but the meaning only became useful
after being aligned with IDA constructors, vtables, runtime gates, and atwiki
vocabulary.

## Required Command Shape

The preferred interface is a single command family:

```powershell
exvs2-json inspect "E:\XB\解包\com\file\002chara\0x46DE9B9C\vernier_table_001gundam_005gyan00_001.bin"
exvs2-json inspect "E:\XB\解包\com\file\002chara\0x46DE9B9C\models\...\001gundam_005gyan00_001_wep_suibaku00.jnttbl"
exvs2-json correlate --unit 001GUNDAM/005GYAN00/001 --weapon SuibakuMissile --id 10050102
```

The CLI should support:

- Auto-detect by filename and binary signature when possible.
- Manual type override when names are ambiguous:
  `--type vernier-table`, `--type jnttbl`, `--type armsparam`,
  `--type bulletparam`, `--type projectile-depiction-table`.
- Stable JSON output by default.
- `--pretty` for readable JSON.
- `--summary` for compact AI pickup.
- `--xref` to emit known Tauri/IDA/atwiki correlation fields if available.
- `--raw-fields` to include unknown command hashes and original offsets.
- `--roundtrip-check` to parse and rebuild files that support lossless rebuilds.

## JSON Output Requirements

All parsed files should include a common envelope:

```json
{
  "tool": "exvs2-json",
  "schemaVersion": 1,
  "sourcePath": "E:\\...",
  "detectedType": "vernier_table",
  "byteLength": 1234,
  "endianness": {
    "hashMatching": "little-endian",
    "displayCanConvert": true
  },
  "warnings": [],
  "data": {}
}
```

Hash fields must provide both numeric and hex forms:

```json
{
  "boneHash": {
    "value": 932581107,
    "hex": "0x379612F3",
    "rawLeBytes": "F3 12 96 37"
  }
}
```

This is important because AI agents often need to search IDA by little-endian
bytes while explaining the value as a normal hex integer.

## File-Type Specific Requirements

### JNTTBL

Output must include:

- Bone entries with `bone_hash`, `bone_index`, raw bytes, and file offset.
- Duplicate hash detection.
- Quick lookup by hash.
- Optional "IDA search bytes" field.

Example:

```json
{
  "detectedType": "jnttbl",
  "data": {
    "bones": [
      {
        "boneHash": "0x379612F3",
        "boneIndex": 2,
        "offset": "0x40",
        "rawLeBytes": "F3 12 96 37 02 00 00 00",
        "idaBytePattern": "F3 12 96 37"
      }
    ]
  }
}
```

### Vernier Table

Use `src-tauri/src/format/vernier_table.rs` as the schema source. Output must
preserve:

- Header and field specs.
- Entry ids.
- All named command fields.
- Raw command hash/value pairs for unknown or future fields.
- Enabled/follow-bone summaries.

Minimum summary:

```json
{
  "detectedType": "vernier_table",
  "data": {
    "enabledFollowBoneRows": [
      {
        "entryIdHex": "0xF7070A81",
        "hitgroupRef": "0xA59612D5",
        "boneHash": "0xECEABBAA",
        "effectId": "0x12FA8EAF",
        "effectModelHash": "0x00000000",
        "isEnabled": true,
        "isFollowBone": true
      }
    ]
  }
}
```

### Arms Param

Use `src-tauri/src/format/armsparam.rs` as the schema source. Output must make
the distinction between parser-level `arms_param.is_vernier` and task runtime
gates explicit:

```json
{
  "fieldNotes": {
    "isVernier": "arms_param field 0x5B072B6C; not the same as task_param+5 runtime vernier-controller gate"
  }
}
```

### Projectile / Bullet Related Tables

For `bulletparam`, `projectile_depiction_table`, and related param files:

- Preserve all named fields and unknown raw hashes.
- Emit obvious projectile references, model/effect hashes, and resource labels.
- Do not infer gameplay move names without an explicit local or atwiki mapping.

## Correlation Requirements

The CLI should make it cheap for AI to answer: "does this resource support this
runtime behavior?"

For a unit/weapon/id correlation report, output:

```json
{
  "unit": {
    "bucket": "001GUNDAM/005GYAN00/001",
    "playerFacingName": "Gyan",
    "atwikiUrl": "https://w.atwiki.jp/exvs2ob/pages/136.html"
  },
  "weapon": {
    "taskName": "SuibakuMissile",
    "playerFacingName": "覚醒技 水爆ミサイル",
    "dispatcherId": 10050102
  },
  "idaEvidence": {
    "dispatcher": "sub_14097E740",
    "wrapper": "sub_140921E30",
    "constructor": "sub_14092BE10",
    "taskClass": "CUnitTaskAutomata_001GUNDAM_005GYAN00_001_SuibakuMissile",
    "objectSize": "0x3530"
  },
  "resourceEvidence": {
    "jnttblBones": ["0x379612F3"],
    "vernierEnabledFollowBoneRows": []
  },
  "runtimeEvidenceNeeded": [
    "Confirm task_param+5 gate",
    "Confirm sub_14062B180 caller and argument triple"
  ]
}
```

The CLI does not need to talk to IDA in its first version, but it should have
fields where an AI can paste IDA evidence. A later version can read an exported
IDA JSON/csv map.

## Reverse-Engineering Guardrails

The CLI should avoid overclaiming:

- Do not treat a direct decimal id search miss as proof that the id does not
  exist. EXVS2 dispatchers can use subtraction chains.
- Do not treat atwiki as binary evidence.
- Do not treat a JNT bone match as proof that a task activates a vernier row.
- Do not treat `arms_param.is_vernier` as the same as the task runtime
  `param+5` gate.
- Do not treat effect id alone as behavior identity; include hitgroup/model key,
  bone hash, task gate, and model availability.

## Desired AI Workflow

For future projectile/vernier work, the AI should be able to run:

```powershell
exvs2-json inspect "<path-to-jnttbl>" --pretty
exvs2-json inspect "<path-to-vernier-table>" --summary --pretty
exvs2-json correlate --unit 001GUNDAM/005GYAN00/001 --weapon SuibakuMissile --id 10050102 --pretty
```

Then the AI should read one JSON report instead of manually repeating:

- raw byte search;
- endian conversion;
- parser schema lookup;
- field hash naming;
- atwiki vocabulary lookup;
- Tauri resource lookup;
- manual table-vs-hardcoded effect comparison.

## First Implementation Boundary

When the user asks to build the CLI, start with read-only conversion:

- `inspect` for `jnttbl`;
- `inspect` for `vernier_table`;
- `inspect` for `armsparam`;
- common JSON envelope;
- summary for enabled follow-bone rows;
- roundtrip check for formats that already have builders.

Do not start with mutation/repacking or IDA integration. Those are later steps.

