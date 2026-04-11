import { memo } from "react";
import type { TestTreeNode } from "../types";
import type { FileTreeViewOptions } from "../utils/fileTreeViewSort";
import MainView from "./MainView";
import InfoPanel from "./InfoPanel";
import { SsbhModelPreviewProvider } from "./ssbh-model-preview/SsbhModelPreviewPanel";
import { FileTreePane } from "./FileTreePane";
import { TestEditorWorkspacePanels } from "./TestEditorWorkspacePanels";

type Props = {
  folderStoreKey: string;
  currentDir: string;
  isPageActive: boolean;
  fileTreeData: TestTreeNode[];
  onFileSelect: (node: TestTreeNode | null) => void;
  selectedId: string | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onPickFolder: (folderPath: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  selectedJsonPath: string | null;
  hasUnsavedChanges: boolean;
  dirtyFolderList: string[];
  workspaceTopLevelFolderNames: string[];
  workspaceRootStructureJsonNames: string[];
  fileTreeStructureScanKey: string;
  obModPath: string;
  onFolderRepacked: (folderName: string) => void;
  starredPathSet: Set<string>;
  onToggleStar: (path: string) => void;
  viewOptions: FileTreeViewOptions;
  onViewOptionsChange: (patch: Partial<FileTreeViewOptions>) => void;
  mscWorkspaceFolderPath: string | null;
  onMscWorkspaceFolderChange: (path: string | null) => void;
  onUnsavedChanges: (hasChanges: boolean) => void;
  onRevealTreeFolder: (path: string) => void;
  selectedNode: TestTreeNode | null;
};

export const TestEditorWorkspaceArea = memo(function TestEditorWorkspaceArea({
  folderStoreKey,
  currentDir,
  isPageActive,
  fileTreeData,
  onFileSelect,
  selectedId,
  searchTerm,
  onSearchChange,
  onPickFolder,
  onRefresh,
  isLoading,
  selectedJsonPath,
  hasUnsavedChanges,
  dirtyFolderList,
  workspaceTopLevelFolderNames,
  workspaceRootStructureJsonNames,
  fileTreeStructureScanKey,
  obModPath,
  onFolderRepacked,
  starredPathSet,
  onToggleStar,
  viewOptions,
  onViewOptionsChange,
  mscWorkspaceFolderPath,
  onMscWorkspaceFolderChange,
  onUnsavedChanges,
  onRevealTreeFolder,
  selectedNode,
}: Props) {
  return (
    <SsbhModelPreviewProvider workspaceRoot={currentDir} previewSuspended={!isPageActive}>
      <TestEditorWorkspacePanels
        left={
          <FileTreePane
            data={fileTreeData}
            onSelect={onFileSelect}
            selectedId={selectedId}
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            onPickFolder={onPickFolder}
            onRefresh={onRefresh}
            folderStoreKey={folderStoreKey}
            isLoading={isLoading}
            currentDir={currentDir}
            currentJsonPath={selectedJsonPath}
            hasUnsavedChanges={hasUnsavedChanges}
            dirtyTopLevelFolderNames={dirtyFolderList}
            workspaceTopLevelFolderNames={workspaceTopLevelFolderNames}
            workspaceRootStructureJsonNames={workspaceRootStructureJsonNames}
            fileTreeStructureScanKey={fileTreeStructureScanKey}
            modFolderPath={obModPath || undefined}
            onFolderRepacked={onFolderRepacked}
            starredPathSet={starredPathSet}
            onToggleStar={onToggleStar}
            viewOptions={viewOptions}
            onViewOptionsChange={onViewOptionsChange}
          />
        }
        center={
          <MainView
            jsonFilePath={selectedJsonPath}
            folderPath={currentDir}
            mscWorkspaceFolderPath={mscWorkspaceFolderPath}
            onMscWorkspaceFolderChange={onMscWorkspaceFolderChange}
            onUnsavedChanges={onUnsavedChanges}
            onRevealTreeFolder={onRevealTreeFolder}
          />
        }
        right={<InfoPanel selected={selectedNode} />}
      />
    </SsbhModelPreviewProvider>
  );
});
