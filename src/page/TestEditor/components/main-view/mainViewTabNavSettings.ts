import { useConfigStore } from "@/store/configStore";

export const MAIN_VIEW_TAB_NAV_STORE_KEY = "testEditor.mainViewTabNav.v1";

export type MainViewTabNavStoreDocument = {
  collapsed: boolean;
};

export async function getMainViewTabNavCollapsed(): Promise<boolean> {
  const document = await useConfigStore
    .getState()
    .getSetting<MainViewTabNavStoreDocument>(MAIN_VIEW_TAB_NAV_STORE_KEY);
  return document?.collapsed === true;
}

export async function rememberMainViewTabNavCollapsed(collapsed: boolean): Promise<void> {
  await useConfigStore.getState().setSetting(MAIN_VIEW_TAB_NAV_STORE_KEY, { collapsed });
}

export function findMainViewTabLabel(
  tabValue: string,
  tabs: Array<{ value: string; name: string; shortName: string }>,
): string | null {
  const tab = tabs.find((entry) => entry.value === tabValue);
  return tab?.shortName ?? tab?.name ?? null;
}
