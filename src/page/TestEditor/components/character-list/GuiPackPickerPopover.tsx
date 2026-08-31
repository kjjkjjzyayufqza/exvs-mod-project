import { PreviewPickerPopover, type PreviewPickerItem } from "./PreviewPickerPopover";
import { formatGuiHashHex } from "./guiClonePlan";
import {
  canExtractGuiPack,
  filterGuiPackPickerItems,
  sortGuiPackPickerItems,
  type GuiPackPickerItem,
} from "./guiPackIndex";

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
  onExtract?: (hash: number) => void;
  extractingHash?: number | null;
}) {
  const pickerItems: PreviewPickerItem[] = sortGuiPackPickerItems(
    props.fieldKey,
    filterGuiPackPickerItems(props.fieldKey, props.items, props.selectedValue),
  ).map((item) => ({
    value: item.hash >>> 0,
    label: item.label,
    previewSrc: "",
    secondaryText: formatGuiHashHex(item.hash >>> 0),
    searchText: item.secondaryText,
    nutexbPath: item.nutexbPath,
    canExtract: canExtractGuiPack(item),
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
      onExtract={props.onExtract}
      extractingValue={props.extractingHash}
    />
  );
}
