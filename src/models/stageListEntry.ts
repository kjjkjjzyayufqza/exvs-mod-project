// stage_list.bin parsed shape (non-GVS), produced by the Rust backend
// (`parse_typed_param_file` with paramType "stagelist") and consumed back by
// `build_typed_param_file`. Field names mirror STAGELIST_COMMAND_POOL
// (snake_case -> camelCase). The GVS stage list is a different format and keeps
// using models/stageList.ts. See docs/agent-sessions/list-command-pool-migration.

export interface StageListData {
  header: {
    magic: number;
    unk04: number;
    fileSize: number;
    unk0c: number;
    entryCount: number;
    commandsCount: number;
    entrySize: number;
    unk1c: number;
  };
  fieldSpecs: Array<{ hash: number; entryOffset: number; flags: number; kind: number }>;
  entryIds: number[];
  entries: StageListEntry[];
  trailingData: number[];
}

export interface StageListEntry {
  entryId: number;

  recordLookupId: number; // 0x00 — LookupRecordIdByFieldValue match key
  randomSelectWeightDefault: number; // 0x04 — weighted random stage pick (default mode)
  randomSelectWeightAlt: number; // 0x08 — weighted random stage pick (alt mode)
  unk0x0c: number; // 0x0C — no IDA code reference
  seriesAltGroupId: number; // 0x10 — alt-mode group/enable (shared w/ character_list)
  unk0x14: number; // 0x14 — no IDA code reference
  vsSD: number; // 0x18 — stage scene resource hash (legacy vs_s_d)
  fileName: number; // 0x1C — stage file/scene resource hash (legacy fileName)
  selectOrderAlt: number; // 0x20 — alt-mode select order
  vsSL: number; // 0x24 — stage scene resource hash (legacy vs_s_l)
  seriesDefaultGroupId: number; // 0x28 — default-mode group/enable (shared)
  name: string; // 0x2C — stage display name (string)
  unk0x34: number; // 0x34 — no IDA code reference
  unk0x38: number; // 0x38 — no IDA code reference
  selectOrderDefault: number; // 0x3C — default-mode select order (legacy uniqueIndex)
  vsSn: number; // 0x40 — stage scene resource hash (legacy vs_sn)
  iconIndex: number; // 0x44 — stage select icon index

  extraCommands?: Record<string, number>;
}

export const STAGELIST_STRING_FIELDS: (keyof StageListEntry)[] = ["name"];
