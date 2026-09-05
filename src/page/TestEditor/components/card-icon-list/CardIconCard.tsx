import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildCardIconPreviewPath } from "./cardIconUtils";
import type { CardIconItem } from "./cardIconStructure";
import { CardIconReplaceDialog } from "./CardIconReplaceDialog";
import { CardIconRemoveDialog } from "./CardIconRemoveDialog";
import { useTranslation } from "react-i18next";

interface CardIconCardProps {
  item: CardIconItem;
  convertDirPath?: string;
  folderPath: string;
  editable?: boolean;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onReplaced: () => Promise<void> | void;
  onRemove: () => void;
  totalCount: number;
  isUpdating?: boolean;
  onMove: (toIndex: number) => void;
  /** When true, shows linked-hover outline (used in dual-column layout) */
  isHovered?: boolean;
  onHoverChange?: (hovered: boolean) => void;
}

export function CardIconCard({
  item,
  convertDirPath,
  folderPath,
  editable = true,
  isSelected,
  onClick,
  onEdit,
  onReplaced,
  onRemove,
  totalCount,
  isUpdating = false,
  onMove,
  isHovered = false,
  onHoverChange,
}: CardIconCardProps) {
  const { t } = useTranslation("test-lists");
  const nameLabel = item.name ?? t("cardIcon.emptyParen");
  const previewPath =
    item.name && convertDirPath ? buildCardIconPreviewPath(convertDirPath, item.name) : null;
  const previewSrc = previewPath ? convertFileSrc(previewPath) : "/tauri.svg";

  const [moveToValue, setMoveToValue] = useState<string>("");

  useEffect(() => {
    setMoveToValue(String(item.itemIndex));
  }, [item.itemIndex]);

  const clampIndex = useCallback(
    (v: number) => {
      if (!Number.isFinite(v)) return 0;
      const max = Math.max(0, totalCount - 1);
      return Math.min(max, Math.max(0, Math.trunc(v)));
    },
    [totalCount]
  );

  const parseAndClamp = useCallback((): number | null => {
    const raw = moveToValue.trim();
    if (!raw) {
      return null;
    }
    if (!/^-?\d+$/.test(raw)) {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return clampIndex(parsed);
  }, [clampIndex, moveToValue]);

  const normalizeInputValue = useCallback(() => {
    const next = parseAndClamp();
    setMoveToValue(String(next ?? item.itemIndex));
  }, [item.itemIndex, parseAndClamp]);

  const handleSave = useCallback(() => {
    if (!editable) return;
    const next = parseAndClamp();
    if (next === null) {
      setMoveToValue(String(item.itemIndex));
      return;
    }
    setMoveToValue(String(next));
    if (next === item.itemIndex) return;
    onMove(next);
  }, [editable, item.itemIndex, onMove, parseAndClamp]);

  return (
    <div
      className={cn(
        "border rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors h-full flex items-center gap-3",
        isSelected && "ring-2 ring-inset ring-primary bg-accent",
        isHovered && "border-2 border-primary"
      )}
      onClick={onClick}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
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
          <div>{t("cardIcon.indexValue", { index: item.itemIndex })}</div>
          <div data-i18n-ignore="">{t("cardIcon.fileIndexValue", { value: item.fileIndex ?? "-" })}</div>
          <div className="flex items-center gap-2">
            <span className="shrink-0">{t("cardIcon.moveTo")}</span>
            <Input
              value={moveToValue}
              onChange={(e) => setMoveToValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSave();
                }
              }}
              onBlur={() => normalizeInputValue()}
              disabled={isUpdating || !editable}
              inputMode="numeric"
              className="h-6 w-16 text-xs"
              aria-label={t("cardIcon.moveAria")}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={isUpdating || !editable || (parseAndClamp() ?? item.itemIndex) === item.itemIndex}
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
            >
              {t("common.save")}
            </Button>
            <span className="text-[10px] text-muted-foreground">
              0..{Math.max(0, totalCount - 1)}
            </span>
          </div>
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
            triggerLabel={t("cardIcon.editImage")}
            disabled={!editable}
          />
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <CardIconRemoveDialog item={item} onConfirm={onRemove} disabled={!editable} />
        </div>
      </div>
    </div>
  );
}
