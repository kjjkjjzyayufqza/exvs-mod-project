export type MainViewTabGroupId = "pack" | "character" | "sound" | "stage" | "msc" | "param";

export const MAIN_VIEW_TAB_GROUP_ORDER: MainViewTabGroupId[] = [
  "pack",
  "character",
  "sound",
  "stage",
  "msc",
  "param",
];

export const MAIN_VIEW_TAB_GROUP_LABELS: Record<MainViewTabGroupId, string> = {
  pack: "Pack",
  character: "Character",
  sound: "Sound",
  stage: "Stage",
  msc: "MSC",
  param: "Param",
};

export type MainViewTabMeta = {
  value: string;
  name: string;
  shortName: string;
  group: MainViewTabGroupId;
};

export const MAIN_VIEW_TAB_META: MainViewTabMeta[] = [
  { value: "folder-structure", name: "Folder structure", shortName: "Structure", group: "pack" },
  { value: "effect-folder", name: "Effect Folder", shortName: "Effect", group: "pack" },
  { value: "motion-folder", name: "Motion Folder", shortName: "Motion", group: "pack" },
  { value: "character-id-table", name: "Character ID Table", shortName: "ID table", group: "character" },
  { value: "character-cost", name: "Character Cost", shortName: "Cost", group: "character" },
  { value: "striker-table", name: "Striker Table", shortName: "Striker", group: "character" },
  { value: "character-list", name: "Character list", shortName: "List", group: "character" },
  { value: "series-list", name: "Series List", shortName: "Series", group: "character" },
  { value: "navi-list", name: "Navi List", shortName: "Navi", group: "character" },
  { value: "raw-path-id", name: "Voice file path", shortName: "Path", group: "sound" },
  { value: "pilot-voice-resource", name: "Voice slot", shortName: "Slot", group: "sound" },
  { value: "bgm-table", name: "BGM table", shortName: "BGM", group: "sound" },
  { value: "bgm-list", name: "BGM list", shortName: "HUD", group: "sound" },
  { value: "bgm-bank", name: "BGM bank", shortName: "Bank", group: "sound" },
  { value: "card-icon-list", name: "Card Icon List", shortName: "Card icons", group: "stage" },
  { value: "stage-icon-list", name: "Stage Icon List", shortName: "Stage icons", group: "stage" },
  { value: "stage-list", name: "Stage List", shortName: "Stages", group: "stage" },
  { value: "msc-workspace", name: "MSC Workspace", shortName: "MSC", group: "msc" },
  { value: "param-editor", name: "Param Editor", shortName: "Param", group: "param" },
  // Legacy per-type editors — prefer Param Editor; labels mark them as outdated.
  { value: "bullet-editor", name: "Bullet Editor (outdated)", shortName: "Bullet (outdated)", group: "param" },
  { value: "arms-editor", name: "Arms Editor (outdated)", shortName: "Arms (outdated)", group: "param" },
  { value: "speed-editor", name: "Speed Editor (outdated)", shortName: "Speed (outdated)", group: "param" },
  { value: "character-editor", name: "Character Editor (outdated)", shortName: "Char param (outdated)", group: "param" },
  { value: "chrsys-editor", name: "ChrSys Editor (outdated)", shortName: "ChrSys (outdated)", group: "param" },
  { value: "grap-editor", name: "Grap Editor (outdated)", shortName: "Grap (outdated)", group: "param" },
  { value: "depiction-editor", name: "Depiction Editor (outdated)", shortName: "Depiction (outdated)", group: "param" },
  { value: "hitgroup-editor", name: "HitGroup Editor (outdated)", shortName: "HitGroup (outdated)", group: "param" },
  { value: "interaction-editor", name: "Interaction Editor (outdated)", shortName: "Interaction (outdated)", group: "param" },
];

/** Tabs that stay mounted after the first visit so returning does not remount/rerender. */
export const KEEP_MOUNTED_MAIN_VIEW_TABS = new Set(
  MAIN_VIEW_TAB_META.filter((tab) => tab.group === "param").map((tab) => tab.value),
);

export function shouldKeepMainViewTabMounted(
  tabValue: string,
  isActive: boolean,
  hasUnsaved: boolean,
): boolean {
  return isActive || KEEP_MOUNTED_MAIN_VIEW_TABS.has(tabValue) || hasUnsaved;
}

export function groupMainViewTabs(tabs: MainViewTabMeta[]): Array<{ id: MainViewTabGroupId; label: string; tabs: MainViewTabMeta[] }> {
  const byGroup = new Map<MainViewTabGroupId, MainViewTabMeta[]>();
  for (const tab of tabs) {
    const list = byGroup.get(tab.group) ?? [];
    list.push(tab);
    byGroup.set(tab.group, list);
  }
  return MAIN_VIEW_TAB_GROUP_ORDER.filter((id) => (byGroup.get(id)?.length ?? 0) > 0).map((id) => ({
    id,
    label: MAIN_VIEW_TAB_GROUP_LABELS[id],
    tabs: byGroup.get(id) ?? [],
  }));
}
