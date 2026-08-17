# Armsparam native field audit

## Goal

Replace unsupported `armsparam` field names with evidence-backed semantics, starting with hash `0x4E692ACD`, and preserve backward-compatible JSON edit aliases.

## Context and evidence

- The current parser labels `0x4E692ACD` as `down_value`; real files show it tracks weapon starting ammunition instead.
- `exvs2-json` artifacts for this task live in `tmp/exvs2-json/armsparam-native-audit/`.
- RX-78 and Delta Plus samples show `0x4E692ACD` matching the displayed ammunition count, while EXVS2OB documents main-shot down value as `2.0`, disproving the current label dimensionally.
- IDA instance `ida-35264` is analyzing `vsac27_Release.exe` (SHA-256 `cae3636aa4870d356eb25837badeb83482a71e290961442decf13cf87e1baa76`).
- `sub_14066AC90` selects an armsparam entry: it stores the entry ID at object offset `+0x70`, copies the 16-byte entry handle to `+0x78`, and resets runtime weapon state. It does not itself establish individual field meanings.
- `sub_1405B2870` is the generic entry-ID hash-map lookup used by that selector.

## Current progress

- Audited the Rust command pool, legacy aliases, frontend field model/validation, tests, and stale documentation claims.
- Confirmed the `CArmsParamAccessor` RTTI string in IDA.
- Located downstream functions that carry the 16-byte entry handle, including `sub_14066CFC0` and `sub_14066D190`; the individual hash consumer remains to be isolated.

## Remaining work

- Build a full real-file corpus and locate rows where capacity and starting ammunition differ.
- Trace `0x4E692ACD` and other high-impact hashes to native consumers.
- Rename only fields supported by evidence; demote unsupported labels to stable hash-based unknown names.
- Add legacy aliases, Rust/frontend tests, and a standalone evidence note.
- Run parser/builder round trips, targeted Rust/frontend tests, and `tools/check_param_name_evidence.py`.
