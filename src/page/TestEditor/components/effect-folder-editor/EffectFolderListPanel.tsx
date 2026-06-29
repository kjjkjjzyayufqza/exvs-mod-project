import { AlertTriangle, Box, FileCode2, FileWarning, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EffectNutexbThumbnail } from "./EffectNutexbPreview";
import {
  effectListItemKey,
  effectListItemLabel,
  effectListItemMissing,
  effectListItemSubtitle,
  formatEffectFolderHash,
  type EffectInventoryCategory,
  type EffectListItem,
} from "./effectFolderEditorUtils";

const CATEGORY_LABELS: Record<EffectInventoryCategory | "all", string> = {
  all: "All",
  efxbn: "EFXBN",
  models: "Models",
  textures: "Textures",
  other: "Other",
};

type EffectFolderListPanelProps = {
  items: EffectListItem[];
  category: EffectInventoryCategory | "all";
  onCategoryChange: (category: EffectInventoryCategory | "all") => void;
  categoryCounts: Record<EffectInventoryCategory | "all", number>;
  selectedKeys: Set<string>;
  focusedKey: string | null;
  onToggleSelection: (key: string, multi: boolean) => void;
  onFocus: (key: string) => void;
};

export function EffectFolderListPanel({
  items,
  category,
  onCategoryChange,
  categoryCounts,
  selectedKeys,
  focusedKey,
  onToggleSelection,
  onFocus,
}: EffectFolderListPanelProps) {
  const renderThumb = (item: EffectListItem, selected: boolean) => {
    if (item.category === "textures") {
      return (
        <EffectNutexbThumbnail
          path={item.item.path}
          label={effectListItemLabel(item)}
          selected={selected}
        />
      );
    }

    const Icon = item.category === "efxbn" ? FileCode2 : item.category === "models" ? Box : ImageIcon;
    return (
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] border bg-muted/45",
          selected && "border-primary/60 bg-primary/10",
        )}
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  };

  const showMissingBanner = items.some((item) => effectListItemMissing(item));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r bg-background">
      <div className="custom-scrollbar-thin flex shrink-0 gap-0.5 overflow-x-auto border-b px-2 py-1.5">
        {(Object.keys(CATEGORY_LABELS) as Array<EffectInventoryCategory | "all">).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onCategoryChange(key)}
            className={cn(
              "shrink-0 rounded-[3px] px-2 py-1 text-[11px] transition-colors duration-150",
              category === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 hover:bg-muted",
            )}
          >
            {CATEGORY_LABELS[key]} ({categoryCounts[key]})
          </button>
        ))}
      </div>

      <div className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No entries in this category.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => {
              const key = effectListItemKey(item);
              const selected = selectedKeys.has(key);
              const focused = focusedKey === key;
              const missing = effectListItemMissing(item);
              return (
                <li key={key}>
                  <div
                    className={cn(
                      "flex items-start gap-2 px-2 py-2.5 text-left transition-colors hover:bg-muted/40",
                      selected && "bg-primary/5",
                      focused && "bg-muted/70 ring-1 ring-inset ring-primary/30",
                    )}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => onToggleSelection(key, true)}
                      aria-label={`Select ${effectListItemLabel(item)}`}
                      className="mt-0.5"
                    />
                    {renderThumb(item, selected)}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        onFocus(key);
                        onToggleSelection(key, false);
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-xs font-medium">{effectListItemLabel(item)}</span>
                        <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px] uppercase">
                          {item.category}
                        </Badge>
                        {missing ? (
                          <FileWarning className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Missing file" />
                        ) : null}
                      </div>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {effectListItemSubtitle(item)}
                      </p>
                      {(() => {
                        const hash =
                          item.category === "models" ? item.model.hash : item.item.hash;
                        if (!hash) return null;
                        return (
                          <p className="truncate font-mono text-[10px] tabular-nums text-muted-foreground/80">
                            {formatEffectFolderHash(hash)}
                            {item.category !== "models" ? ` / fileIndex ${item.item.fileIndex}` : null}
                          </p>
                        );
                      })()}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showMissingBanner ? (
        <div className="flex shrink-0 items-center gap-2 border-t bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Some entries reference missing files on disk.
        </div>
      ) : null}
    </div>
  );
}
