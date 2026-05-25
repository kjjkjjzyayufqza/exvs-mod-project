import type {
  DetailViewModelData,
  DetailViewModelTab,
} from "../components/detail-view/sceneDetailViewTypes";

/** Only mount the active tab panel to avoid eager heavy editor/tree renders. */
export function shouldMountDetailTab(
  activeTab: DetailViewModelTab,
  tab: DetailViewModelTab,
): boolean {
  return activeTab === tab;
}

/** Whether async file I/O should start for an editable tab. Readonly tabs use bundle data. */
export function shouldLoadModelTab(
  tab: DetailViewModelTab,
  data: DetailViewModelData,
): boolean {
  switch (tab) {
    case "model":
      return (
        data.numdlb.base === null &&
        !data.numdlb.loading &&
        data.numdlb.error === null
      );
    case "material":
      if (!data.bundle.matlPaths?.[0]) return false;
      return (
        data.numatb.base === null &&
        !data.numatb.loading &&
        data.numatb.error === null
      );
    case "helper": {
      if (!data.bundle.rootFolder) return false;
      return (
        data.nuhlpb.base === null &&
        !data.nuhlpb.loading &&
        data.nuhlpb.error === null
      );
    }
    default:
      return false;
  }
}

export function modelTabLoadingField(
  tab: DetailViewModelTab,
): "numdlb" | "numatb" | "nuhlpb" | null {
  switch (tab) {
    case "model":
      return "numdlb";
    case "material":
      return "numatb";
    case "helper":
      return "nuhlpb";
    default:
      return null;
  }
}
