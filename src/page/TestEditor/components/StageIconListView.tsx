import { NutexbIconListView } from "./NutexbIconListView";

interface StageIconListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

export default function StageIconListView({ folderPath, isActive, onUnsavedChanges }: StageIconListViewProps) {
  return (
    <NutexbIconListView
      folderPath={folderPath}
      hash="0x3CC8B10B"
      title="Stage Icon List"
      isActive={isActive}
      onUnsavedChanges={onUnsavedChanges}
    />
  );
}
