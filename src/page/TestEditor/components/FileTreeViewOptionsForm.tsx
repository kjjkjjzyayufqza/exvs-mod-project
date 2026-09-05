import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FileTreeViewOptions } from "../utils/fileTreeViewSort";

type Props = {
  value: FileTreeViewOptions;
  onChange: (patch: Partial<FileTreeViewOptions>) => void;
  /** Use inside ContextMenu so clicks do not dismiss the menu. */
  isolatePointerEvents?: boolean;
  className?: string;
};

const selectClass =
  "mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function FileTreeViewOptionsForm({ value, onChange, isolatePointerEvents, className }: Props) {
  const { t } = useTranslation("test-workspace");
  const onPointerDown = isolatePointerEvents
    ? (e: ReactPointerEvent) => {
        e.stopPropagation();
      }
    : undefined;

  return (
    <div
      className={cn("space-y-3 text-xs", className)}
      onPointerDown={onPointerDown}
    >
      <div>
        <Label className="text-xs text-muted-foreground">{t("fileTree.sortBy")}</Label>
        <select
          className={selectClass}
          value={value.sortBy}
          onChange={(e) =>
            onChange({ sortBy: e.target.value as FileTreeViewOptions["sortBy"] })
          }
        >
          <option value="name">{t("fileTree.name")}</option>
          <option value="dateModified">{t("fileTree.dateModified")}</option>
          <option value="type">{t("fileTree.type")}</option>
          <option value="size">{t("fileTree.size")}</option>
        </select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">{t("fileTree.order")}</Label>
        <select
          className={selectClass}
          value={value.direction}
          onChange={(e) =>
            onChange({ direction: e.target.value as FileTreeViewOptions["direction"] })
          }
        >
          <option value="asc">{t("fileTree.ascending")}</option>
          <option value="desc">{t("fileTree.descending")}</option>
        </select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">{t("fileTree.groupBy")}</Label>
        <select
          className={selectClass}
          value={value.groupBy}
          onChange={(e) =>
            onChange({ groupBy: e.target.value as FileTreeViewOptions["groupBy"] })
          }
        >
          <option value="none">{t("fileTree.none")}</option>
          <option value="type">{t("fileTree.type")}</option>
          <option value="dateModified">{t("fileTree.dateModified")}</option>
        </select>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          {t("fileTree.groupHint")}
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-foreground">
        <Checkbox
          checked={value.foldersOnTop}
          onCheckedChange={(checked) => onChange({ foldersOnTop: Boolean(checked) })}
        />
        <span>{t("fileTree.foldersOnTop")}</span>
      </label>
    </div>
  );
}
