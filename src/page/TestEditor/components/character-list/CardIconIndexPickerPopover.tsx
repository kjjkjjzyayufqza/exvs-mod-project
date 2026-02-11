import { useMemo } from "react";

import { PreviewPickerPopover, type PreviewPickerItem } from "./PreviewPickerPopover";

export type CardIconIndexPickerItem = {
  index: number;
  name: string | null;
  previewSrc: string;
};

export function CardIconIndexPickerPopover(props: {
  onSelect: (index: number) => void;
  items: CardIconIndexPickerItem[];
  selectedValue?: number;
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { onSelect, items, selectedValue, isLoading, error, open, onOpenChange } = props;

  const pickerItems = useMemo<PreviewPickerItem[]>(() => {
    return items.map((it) => ({
      value: it.index,
      label: it.name ?? "(empty)",
      previewSrc: it.previewSrc,
      secondaryText: `Index: ${it.index}`,
    }));
  }, [items]);

  return (
    <PreviewPickerPopover
      title="Card Icon Index Picker"
      triggerAriaLabel="Open Card Icon Index picker"
      onSelect={onSelect}
      items={pickerItems}
      selectedValue={selectedValue}
      isLoading={isLoading}
      error={error}
      open={open}
      onOpenChange={onOpenChange}
      filterPlaceholder="Filter by index or name..."
      sort={(a, b) => a.value - b.value}
    />
  );
}

