import { NutexbIconListView } from "./NutexbIconListView";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

interface StageIconListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
}

export default function StageIconListView({
  folderPath,
  isActive,
  onUnsavedChanges,
  workspaceDocument,
}: StageIconListViewProps) {
  return (
    <NutexbIconListView
      folderPath={folderPath}
      workspaceDocument={workspaceDocument}
      contentId="stage-icons-primary"
      hash="0x3CC8B10B"
      title="Stage Icon List"
      isActive={isActive}
      onUnsavedChanges={onUnsavedChanges}
      layout="dual"
      secondaryContentId="stage-icons-secondary"
      secondaryHash="0x0CEE3991"
    />
  );
}
