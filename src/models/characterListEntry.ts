export interface CharacterListData {
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
  entries: CharacterListEntry[];
  trailingData: number[];
}

export interface CharacterListEntry {
  entryId: number;

  indexInSeries: number;
  legacyRemovedU320004: number;
  chargeLabelWeaponFight: number;
  vsPLC03: number;
  msIghR: number;
  msVsR: number;
  unkHash0x18: number;
  characterName: string;
  threshold300ScoreCode: number;
  threshold200RuleCode: number;
  threshold100RuleCode: number;
  unkHash0x30: number;
  msVsL: number;
  threshold400RuleCode: number;
  profileSetAPrimaryDefault: number;
  profileSetBPrimarySlot2: number;
  vsPRC03: number;
  profileSetASharedSpecial: number;
  profileSetBPrimaryDefault: number;
  profileSetBPrimarySlot1: number;
  seriesAltGroupId: number;
  profileSetBSecondarySlot3: number;
  sticker1: number;
  unk0x060: number;
  profileSetAPrimarySlot2: number;
  variantDisplayNameDefault: string;
  unk0x070: number;
  pilotPresentationHash: number;
  lmbPilotClothing: number;
  variantDisplayNameSlot4: string;
  weaponTextSfight: string;
  optionalSidecarHashSlot2: number;
  weaponTextMain: string;
  variantDisplayNameSlot3: string;
  optionalPilotPresentationHashSlot2: number;
  pilotNameShort: string;
  secondarySelectorState: number;
  exPilotClothingLmbHash: number;
  seriesId: number;
  weaponTextSp: string;
  pilotNameFull: string;
  legacySparseWeaponInfoFlag: number;
  profileSetAPrimarySlot0: number;
  vsPRC02: number;
  msCardIconIndex: number;
  profileSetASecondaryDefault: number;
  unk0x0dc: number;
  stickerT01: number;
  profileSetBSecondaryDefault: number;
  profileSetBPrimarySlot0: number;
  selectorState: number;
  seriesDefaultGroupId: number;
  vsPLC02: number;
  profileSetBSharedSpecial: number;
  unk0x0fc: number;
  legacyRemovedU320100: number;
  suppressOptionalLmbSidecar: number;
  variantFlag: number;
  threshold1RuleCode: number;
  unk0x110: number;
  msTracker: number;
  profileSetASecondarySlot1: number;
  vsPLC04: number;
  profileSetBSecondarySlot2: number;
  unk0x124: number;
  profileSetAPrimarySlot3: number;
  optionalSidecarHashSlot3: number;
  profileSetBSecondarySlot1: number;
  weaponTextFight: string;
  pairedBgmMusicIdPrimary: number;
  characterUniqueId: number;
  variantDisplayNameSlot1: string;
  profileSetASecondarySlot2: number;
  chargeLabelWeaponMain: number;
  profileSetBPrimarySlot3: number;
  variantDisplayNameSlot5: string;
  lmbCutIn: number;
  stickerT05: number;
  seriesAltOrderIndex: number;
  trackerStickerHashSlot4: number;
  pairedBgmMusicIdSecondary: number;
  unk0x174: number;
  vsPRC04: number;
  trackerStickerHashSlot3: number;
  msMsL: number;
  unk0x184: number;
  vsPR: number;
  weaponTextSub: string;
  lmbBoost: number;
  profileSetASecondarySlot0: number;
  variantDisplayNameSlot6: string;
  rnkML: number;
  optionalPresentationVariantFlag: number;
  msCrs: number;
  variantDisplayNameSlot2: string;
  optionalPilotPresentationHashSlot3: number;
  profileSetBSecondarySlot0: number;
  msMsS: number;
  vsPL: number;
  unk0x1c8: number;
  msMn: number;
  scP: number;
  partnerCommEntryEnabledCode: number;

  extraCommands?: Record<string, number>;
}

export const CHARACTERLIST_STRING_FIELDS: (keyof CharacterListEntry)[] = [
  "characterName",
  "variantDisplayNameDefault",
  "variantDisplayNameSlot4",
  "weaponTextSfight",
  "weaponTextMain",
  "variantDisplayNameSlot3",
  "pilotNameShort",
  "weaponTextSp",
  "pilotNameFull",
  "weaponTextFight",
  "variantDisplayNameSlot1",
  "variantDisplayNameSlot5",
  "weaponTextSub",
  "variantDisplayNameSlot6",
  "variantDisplayNameSlot2",
];

export const CHARACTERLIST_NUMERIC_FIELDS: (keyof CharacterListEntry)[] = [
  "entryId",
  "indexInSeries",
  "seriesId",
  "seriesAltOrderIndex",
  "msCardIconIndex",
  "characterUniqueId",
  "variantFlag",
  "selectorState",
  "secondarySelectorState",
  "seriesAltGroupId",
  "seriesDefaultGroupId",
  "optionalPresentationVariantFlag",
  "msIghR",
  "msVsR",
  "msVsL",
  "msMsL",
  "msMsS",
  "msMn",
  "msCrs",
  "msTracker",
  "vsPL",
  "vsPLC02",
  "vsPLC03",
  "vsPLC04",
  "vsPR",
  "vsPRC02",
  "vsPRC03",
  "vsPRC04",
  "lmbPilotClothing",
  "exPilotClothingLmbHash",
  "lmbCutIn",
  "lmbBoost",
  "sticker1",
  "stickerT01",
  "stickerT05",
  "rnkML",
  "scP",
  "pilotPresentationHash",
  "profileSetAPrimaryDefault",
  "profileSetAPrimarySlot0",
  "profileSetAPrimarySlot2",
  "profileSetAPrimarySlot3",
  "profileSetASharedSpecial",
  "profileSetASecondaryDefault",
  "profileSetASecondarySlot0",
  "profileSetASecondarySlot1",
  "profileSetASecondarySlot2",
  "profileSetBPrimaryDefault",
  "profileSetBPrimarySlot0",
  "profileSetBPrimarySlot1",
  "profileSetBPrimarySlot2",
  "profileSetBPrimarySlot3",
  "profileSetBSharedSpecial",
  "profileSetBSecondaryDefault",
  "profileSetBSecondarySlot0",
  "profileSetBSecondarySlot1",
  "profileSetBSecondarySlot2",
  "profileSetBSecondarySlot3",
  "optionalSidecarHashSlot2",
  "optionalSidecarHashSlot3",
  "optionalPilotPresentationHashSlot2",
  "optionalPilotPresentationHashSlot3",
  "trackerStickerHashSlot3",
  "trackerStickerHashSlot4",
  "pairedBgmMusicIdPrimary",
  "pairedBgmMusicIdSecondary",
  "threshold300ScoreCode",
  "threshold200RuleCode",
  "threshold100RuleCode",
  "threshold400RuleCode",
  "threshold1RuleCode",
  "chargeLabelWeaponFight",
  "chargeLabelWeaponMain",
  "legacySparseWeaponInfoFlag",
  "suppressOptionalLmbSidecar",
  "partnerCommEntryEnabledCode",
  "legacyRemovedU320004",
  "legacyRemovedU320100",
  "unkHash0x18",
  "unkHash0x30",
  "unk0x060",
  "unk0x070",
  "unk0x0dc",
  "unk0x0fc",
  "unk0x110",
  "unk0x124",
  "unk0x174",
  "unk0x184",
  "unk0x1c8",
];
