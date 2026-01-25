import { useMemo } from "react";
import { PreviewPickerPopover, type PreviewPickerItem } from "./PreviewPickerPopover";

export type SeriesIdPickerItem = {
  id: number;
  iconFileIndex: number;
  label: string;
  previewSrc: string;
};

export function SeriesIdPickerPopover(props: {
  onSelect: (id: number) => void;
  items: SeriesIdPickerItem[];
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { onSelect, items, isLoading, error, open, onOpenChange } = props;

  const iconIndexById = useMemo(() => {
    const map = new Map<number, number>();
    for (const it of items) {
      map.set(it.id, it.iconFileIndex);
    }
    return map;
  }, [items]);

  const pickerItems = useMemo<PreviewPickerItem[]>(() => {
    return items.map((it) => ({
      value: it.id,
      label: it.label,
      previewSrc: it.previewSrc,
      secondaryText: `ID: ${it.id}`,
    }));
  }, [items]);

  return (
    <PreviewPickerPopover
      title="Series ID Picker"
      triggerAriaLabel="Open Series ID picker"
      onSelect={onSelect}
      items={pickerItems}
      isLoading={isLoading}
      error={error}
      open={open}
      onOpenChange={onOpenChange}
      filterPlaceholder="Filter by ID or name..."
      sort={(a, b) => {
        const ai = iconIndexById.get(a.value);
        const bi = iconIndexById.get(b.value);
        if (typeof ai === "number" && typeof bi === "number" && ai !== bi) return ai - bi;
        return a.value - b.value;
      }}
    />
  );
}


