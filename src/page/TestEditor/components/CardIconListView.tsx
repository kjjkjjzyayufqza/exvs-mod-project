import { NutexbIconListView } from "./NutexbIconListView";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

interface CardIconListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
}

export default function CardIconListView({
  folderPath,
  isActive,
  onUnsavedChanges,
  workspaceDocument,
}: CardIconListViewProps) {
  return (
    <NutexbIconListView
      folderPath={folderPath}
      workspaceDocument={workspaceDocument}
      contentId="card-icons"
      hash="0x49235031"
      title="Card Icon List"
      isActive={isActive}
      onUnsavedChanges={onUnsavedChanges}
    />
  );
}
