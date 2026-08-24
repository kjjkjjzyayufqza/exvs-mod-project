import { PreviewPickerPopover, type PreviewPickerItem } from "./PreviewPickerPopover";

export type BgmCuePickerItem = {
  cueHash: number;
  cueName: string;
  bankGroup: number;
};

export function BgmCuePickerPopover(props: {
  onSelect: (cueHash: number) => void;
  items: BgmCuePickerItem[];
  selectedValue?: number;
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const pickerItems: PreviewPickerItem[] = props.items.map((item) => ({
    value: item.cueHash >>> 0,
    label: item.cueName || `0x${(item.cueHash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`,
    previewSrc: "",
    secondaryText: `group ${item.bankGroup}  0x${(item.cueHash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`,
  }));

  return (
    <PreviewPickerPopover
      title="BGM cueHash"
      triggerAriaLabel="Open BGM cue picker"
      onSelect={props.onSelect}
      items={pickerItems}
      selectedValue={props.selectedValue}
      isLoading={props.isLoading}
      error={props.error}
      open={props.open}
      onOpenChange={props.onOpenChange}
      filterPlaceholder="Filter by cue name or hash..."
    />
  );
}
