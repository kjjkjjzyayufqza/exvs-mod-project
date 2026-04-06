import type { PointerEvent as ReactPointerEvent } from "react";
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
        <Label className="text-xs text-muted-foreground">Sort by</Label>
        <select
          className={selectClass}
          value={value.sortBy}
          onChange={(e) =>
            onChange({ sortBy: e.target.value as FileTreeViewOptions["sortBy"] })
          }
        >
          <option value="name">Name</option>
          <option value="dateModified">Date modified</option>
          <option value="type">Type</option>
          <option value="size">Size</option>
        </select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Order</Label>
        <select
          className={selectClass}
          value={value.direction}
          onChange={(e) =>
            onChange({ direction: e.target.value as FileTreeViewOptions["direction"] })
          }
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Group by</Label>
        <select
          className={selectClass}
          value={value.groupBy}
          onChange={(e) =>
            onChange({ groupBy: e.target.value as FileTreeViewOptions["groupBy"] })
          }
        >
          <option value="none">None</option>
          <option value="type">Type</option>
          <option value="dateModified">Date modified</option>
        </select>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          Grouping picks the primary column (same as Explorer). Sort by is used when Group by is None.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-foreground">
        <Checkbox
          checked={value.foldersOnTop}
          onCheckedChange={(checked) => onChange({ foldersOnTop: Boolean(checked) })}
        />
        <span>Folders on top</span>
      </label>
    </div>
  );
}
