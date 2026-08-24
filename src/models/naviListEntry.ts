// navi_list.bin parsed shape (`parse_typed_param_file` paramType "navilist").
// Field names mirror NAVILIST_COMMAND_POOL (snake_case -> camelCase).

export interface NaviListData {
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
  entries: NaviListEntry[];
  trailingData: number[];
}

export interface NaviListEntry {
  entryId: number;
  sharedResourceHashA: number;
  costumeIndex: number;
  sharedResourceHashB: number;
  costumeResourceHashA: number;
  sharedResourceHashC: number;
  characterUniqueId: number;
  displayName: string;
  costumeResourceHashB: number;
  sharedResourceHashD: number;
  sharedResourceHashE: number;
  seriesListEntryId: number;
  enabledCode: number;
  extraCommands?: Record<string, number>;
}

export const NAVILIST_STRING_FIELDS: (keyof NaviListEntry)[] = ["displayName"];

export const NAVI_GUI_HASH_FIELDS = [
  "sharedResourceHashA",
  "sharedResourceHashB",
  "costumeResourceHashA",
  "sharedResourceHashC",
  "costumeResourceHashB",
  "sharedResourceHashD",
  "sharedResourceHashE",
] as const;

export type NaviGuiHashField = (typeof NAVI_GUI_HASH_FIELDS)[number];
