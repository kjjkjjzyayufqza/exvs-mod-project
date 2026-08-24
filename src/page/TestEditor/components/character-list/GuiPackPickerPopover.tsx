import { PreviewPickerPopover, type PreviewPickerItem } from "./PreviewPickerPopover";
import { sortGuiPackPickerItems, type GuiPackPickerItem } from "./guiPackIndex";

export function GuiPackPickerPopover(props: {
  fieldKey: string;
  title?: string;
  onSelect: (hash: number) => void;
  items: GuiPackPickerItem[];
  selectedValue?: number;
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const pickerItems: PreviewPickerItem[] = sortGuiPackPickerItems(props.fieldKey, props.items).map((item) => ({
    value: item.hash >>> 0,
    label: item.label,
    previewSrc: "",
    secondaryText: item.secondaryText,
  }));

  return (
    <PreviewPickerPopover
      title={props.title ?? "009gui pack"}
      triggerAriaLabel="Open 009gui pack picker"
      onSelect={props.onSelect}
      items={pickerItems}
      selectedValue={props.selectedValue}
      isLoading={props.isLoading}
      error={props.error}
      open={props.open}
      onOpenChange={props.onOpenChange}
      filterPlaceholder="Filter by name or hash..."
    />
  );
}
