import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { initCatalogContentFromDplCache } from "@/services/testEditorWorkspace/initWorkspaceContentPack";
import type { WorkspaceContentId } from "@/services/testEditorWorkspace/contentCatalog";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { renameCatalogContentPayloads } from "@/services/testEditorWorkspace/workspaceContentExtract";

export type CatalogPackToolbarLabels = {
  initPack: string;
  initializing: string;
  renameZeroBin: string;
  renaming: string;
  setObDplcacheInit: string;
  unpacked: string;
  alreadyNamed: string;
  formatRenamed: (names: string) => string;
};

type CatalogPackToolbarButtonsProps = {
  contentId: WorkspaceContentId;
  folderPath: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  dplCachePath: string;
  reload: () => void | Promise<void>;
  showRename?: boolean;
  labels: CatalogPackToolbarLabels;
};

export function CatalogPackToolbarButtons({
  contentId,
  folderPath,
  workspaceDocument,
  dplCachePath,
  reload,
  showRename = true,
  labels,
}: CatalogPackToolbarButtonsProps) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  const handleInitPack = useCallback(async () => {
    const dpl = dplCachePath.trim();
    if (!dpl) {
      toast.error(labels.setObDplcacheInit);
      return;
    }
    if (!folderPath.trim()) {
      return;
    }
    setIsInitializing(true);
    try {
      await initCatalogContentFromDplCache({
        contentId,
        dplCacheDir: dpl,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      toast.success(labels.unpacked);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInitializing(false);
    }
  }, [contentId, dplCachePath, folderPath, labels.setObDplcacheInit, labels.unpacked, reload, workspaceDocument]);

  const handleRenamePayloads = useCallback(async () => {
    if (!folderPath.trim()) {
      return;
    }
    setIsRenaming(true);
    try {
      const result = await renameCatalogContentPayloads({
        contentId,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      if (result.renamed.length > 0) {
        toast.success(labels.formatRenamed(result.renamed.join(", ")));
      } else {
        toast.success(labels.alreadyNamed);
      }
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRenaming(false);
    }
  }, [contentId, folderPath, labels, reload, workspaceDocument]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void handleInitPack()}
        disabled={isInitializing || isRenaming}
      >
        {isInitializing ? labels.initializing : labels.initPack}
      </Button>
      {showRename ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleRenamePayloads()}
          disabled={isInitializing || isRenaming}
        >
          {isRenaming ? labels.renaming : labels.renameZeroBin}
        </Button>
      ) : null}
    </>
  );
}
