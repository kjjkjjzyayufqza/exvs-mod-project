import { memo } from "react";
import type { TestTreeNode } from "../types";
import type { FileTreeViewOptions } from "../utils/fileTreeViewSort";
import MainView from "./MainView";
import InfoPanel from "./InfoPanel";
import { FileTreePane } from "./FileTreePane";
import { TestEditorWorkspacePanels } from "./TestEditorWorkspacePanels";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";

type Props = {
  folderStoreKey: string;
  currentDir: string;
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
  workspaceTreeData: TestTreeNode[];
  dirtyPacks: WorkspacePackIdentity[];
  obModPath: string;
  onPackRepacked: (packKey: string) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  starredPathSet: Set<string>;
  onToggleStar: (path: string) => void;
  viewOptions: FileTreeViewOptions;
  onViewOptionsChange: (patch: Partial<FileTreeViewOptions>) => void;
  mscWorkspaceFolderPath: string | null;
  onMscWorkspaceFolderChange: (path: string | null) => void;
  onUnsavedChanges: (hasChanges: boolean) => void;
  onRevealTreeFolder: (path: string) => void;
  selectedNode: TestTreeNode | null;
  onOpenAsEffectProject?: (filePath: string) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
  workspaceRouteRoots: Record<string, string>;
};

export const TestEditorWorkspaceArea = memo(function TestEditorWorkspaceArea({
  folderStoreKey,
  currentDir,
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
  workspaceTreeData,
  dirtyPacks,
  obModPath,
  onPackRepacked,
  onPackMutated,
  starredPathSet,
  onToggleStar,
  viewOptions,
  onViewOptionsChange,
  mscWorkspaceFolderPath,
  onMscWorkspaceFolderChange,
  onUnsavedChanges,
  onRevealTreeFolder,
  selectedNode,
  onOpenAsEffectProject,
  workspaceDocument,
  workspaceRouteRoots,
}: Props) {
  return (
    <TestEditorWorkspacePanels
      left={
        <FileTreePane
          data={fileTreeData}
          workspaceTreeData={workspaceTreeData}
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
          workspaceDocument={workspaceDocument}
          dirtyPacks={dirtyPacks}
          modFolderPath={obModPath || undefined}
          onPackRepacked={onPackRepacked}
          starredPathSet={starredPathSet}
          onToggleStar={onToggleStar}
          viewOptions={viewOptions}
          onViewOptionsChange={onViewOptionsChange}
          onOpenAsEffectProject={onOpenAsEffectProject}
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
          workspaceDocument={workspaceDocument}
          workspaceRouteRoots={workspaceRouteRoots}
          modFolderPath={obModPath}
          onPackMutated={onPackMutated}
          onPackRepacked={onPackRepacked}
          onOpenAsEffectProject={onOpenAsEffectProject}
        />
      }
      right={<InfoPanel selected={selectedNode} />}
    />
  );
});
