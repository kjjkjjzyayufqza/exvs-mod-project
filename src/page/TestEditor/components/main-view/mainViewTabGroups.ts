export type MainViewTabGroupId = "pack" | "character" | "stage" | "msc" | "param";

export const MAIN_VIEW_TAB_GROUP_ORDER: MainViewTabGroupId[] = [
  "pack",
  "character",
  "stage",
  "msc",
  "param",
];

export const MAIN_VIEW_TAB_GROUP_LABELS: Record<MainViewTabGroupId, string> = {
  pack: "Pack",
  character: "Character",
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
  { value: "character-list", name: "Character list", shortName: "List", group: "character" },
  { value: "series-list", name: "Series List", shortName: "Series", group: "character" },
  { value: "card-icon-list", name: "Card Icon List", shortName: "Card icons", group: "stage" },
  { value: "stage-icon-list", name: "Stage Icon List", shortName: "Stage icons", group: "stage" },
  { value: "stage-list", name: "Stage List", shortName: "Stages", group: "stage" },
  { value: "msc-workspace", name: "MSC Workspace", shortName: "MSC", group: "msc" },
  { value: "param-editor", name: "Param Editor", shortName: "Param", group: "param" },
  { value: "bullet-editor", name: "Bullet Editor", shortName: "Bullet", group: "param" },
  { value: "arms-editor", name: "Arms Editor", shortName: "Arms", group: "param" },
  { value: "speed-editor", name: "Speed Editor", shortName: "Speed", group: "param" },
  { value: "character-editor", name: "Character Editor", shortName: "Char param", group: "param" },
  { value: "chrsys-editor", name: "ChrSys Editor", shortName: "ChrSys", group: "param" },
  { value: "grap-editor", name: "Grap Editor", shortName: "Grap", group: "param" },
  { value: "depiction-editor", name: "Depiction Editor", shortName: "Depiction", group: "param" },
  { value: "hitgroup-editor", name: "HitGroup Editor", shortName: "HitGroup", group: "param" },
  { value: "interaction-editor", name: "Interaction Editor", shortName: "Interaction", group: "param" },
];

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
