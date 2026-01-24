import { convertFileSrc } from "@tauri-apps/api/core";

import { cn } from "@/lib/utils";
import { buildCardIconPreviewPath } from "./cardIconUtils";
import type { CardIconItem } from "./cardIconStructure";
import { CardIconReplaceDialog } from "./CardIconReplaceDialog";
import { CardIconRemoveDialog } from "./CardIconRemoveDialog";

interface CardIconCardProps {
  item: CardIconItem;
  convertDirPath?: string;
  folderPath: string;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onReplaced: () => Promise<void> | void;
  onRemove: () => void;
}

export function CardIconCard({
  item,
  convertDirPath,
  folderPath,
  isSelected,
  onClick,
  onEdit,
  onReplaced,
  onRemove,
}: CardIconCardProps) {
  const nameLabel = item.name ?? "(empty)";
  const previewPath =
    item.name && convertDirPath ? buildCardIconPreviewPath(convertDirPath, item.name) : null;
  const previewSrc = previewPath ? convertFileSrc(previewPath) : "/tauri.svg";

  return (
    <div
      className={cn(
        "border rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors h-full flex items-center gap-3",
        isSelected && "ring-2 ring-inset ring-primary bg-accent"
      )}
      onClick={onClick}
    >
      <div className="h-12 w-24 shrink-0 overflow-hidden rounded border bg-black">
        <img
          src={previewSrc}
          alt={item.name ?? ""}
          className="h-full w-full object-contain"
          onError={(e) => {
            e.currentTarget.src = "/tauri.svg";
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium line-clamp-2 wrap-break-word">{nameLabel}</div>
        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
          <div>Index: {item.itemIndex}</div>
          <div>fileIndex: {item.fileIndex ?? "-"}</div>
        </div>
      </div>

      <div className="shrink-0 flex flex-col gap-2">
        <div
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <CardIconReplaceDialog
            folderPath={folderPath}
            convertDirPath={convertDirPath ?? ""}
            selectedItem={item}
            onApplied={onReplaced}
            triggerLabel="Edit Image"
          />
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <CardIconRemoveDialog item={item} onConfirm={onRemove} />
        </div>
      </div>
    </div>
  );
}
