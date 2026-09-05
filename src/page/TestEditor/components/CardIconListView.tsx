import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("test-lists");
  return (
    <NutexbIconListView
      folderPath={folderPath}
      workspaceDocument={workspaceDocument}
      contentId="card-icons"
      hash="0x49235031"
      title={t("cardIcon.title")}
      isActive={isActive}
      onUnsavedChanges={onUnsavedChanges}
    />
  );
}
