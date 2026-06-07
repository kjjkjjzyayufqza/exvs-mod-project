// series_list.bin parsed shape, produced by the Rust backend
// (`parse_typed_param_file` with paramType "serieslist") and consumed back by
// `build_typed_param_file`. Field names mirror SERIESLIST_COMMAND_POOL
// (snake_case -> camelCase). Numeric fields are u32/i32 per kind; `name` is the
// resolved string. See docs/agent-sessions/list-command-pool-migration.

export interface SeriesListData {
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
  entries: SeriesListEntry[];
  trailingData: number[];
}

export interface SeriesListEntry {
  entryId: number;

  recordLookupId: number; // 0x00 — LookupRecordIdByFieldValue match key
  iconFileIndex: number; // 0x04 — points to image index in 0xA0253AA0.fhm2d
  unk0x08: number; // 0x08 — no IDA code reference
  name: string; // 0x0C — series display name (string)
  displayNameRef: number; // 0x14 — name lookup used by the Jukurendo popup
  characterListPosition: number; // 0x18 — order in the character list

  extraCommands?: Record<string, number>;
}

export const SERIESLIST_STRING_FIELDS: (keyof SeriesListEntry)[] = ["name"];
