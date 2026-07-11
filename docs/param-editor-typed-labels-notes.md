# Typed Param Editor — list labels & extract (2026-07-11)

## List item labels (`actionLabel` / `resourceLabel`)

**UI:** left entry list under hash (e.g. `0xB7027DBE` / `0x1B12AE7D`), order:

1. entryId hash  
2. `actionLabel`  
3. `resourceLabel`  
4. origin badges (Copy / New / Edited)

**Code**

| Piece | Path |
|-------|------|
| Read labels | `src/page/TestEditor/components/param-editor/paramEntryUtils.ts` → `readTypedEntryLabels(entry, fileBytes?)` |
| List row | `ParamEntryListRow.tsx` |
| Wire-up | `TypedParamDataPanel.tsx` (passes `trailingFileBytes`) |

**Decode rules**

1. Prefer already-decoded **strings** (`actionLabel` / `resourceLabel`, as speedparam JSON emits).
2. Else accept string values under `actionLabelOffset` / `resourceLabelOffset` names.
3. Else, if `fileBytes` provided, treat numeric kind-7 values as **absolute file offsets** into the obfuscated trailing pool (characterparam path). Rebuild file view: zeros through entry region + `trailingData` at `entriesEnd`.

**Tests:** `paramEntryUtils.test.ts` (string path + offset decode path).

## Extract destination

| Action | Root |
|--------|------|
| **Extract to Workspace** (default) | Test Editor `projectRootDir` (WS), e.g. `E:\XB\mod` + route prefix `041cpm` + Name |
| **Extract to Output Folder** (optional) | Config `extractOutputPath`, only if set and **≠** WS |
| **Extract All to Workspace** | Always WS |

Not hardcoded to `解包`. That path appeared when `extractOutputPath` pointed at `E:\XB\解包\com\file`.

**Code:** `CharacterAssetField.tsx`, `CharacterIdTableView.tsx` (`handleExtractAll`), Config description for `extractOutputPath`.

## Related

- Session: `docs/msc-research/gyan-session-2026-07-11-handoff.md` §6  
- speedparam string decode (Rust): `src-tauri/src/format/speedparam.rs`  
