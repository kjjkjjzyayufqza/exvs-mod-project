import { Copy, FolderOpen, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GuiPackPickerPopover } from "./GuiPackPickerPopover";
import { canExtractGuiPack, normalizeGuiHash, type GuiPackPickerItem } from "./guiPackIndex";
import { GuiPackPreviewThumb } from "./GuiPackPreviewThumb";

function selectedGuiPackItem(value: number, items: readonly GuiPackPickerItem[]): GuiPackPickerItem | null {
  const hash = normalizeGuiHash(value);
  return items.find((item) => item.hash === hash) ?? null;
}

export function GuiHashFieldPreview(props: {
  value: number;
  items: readonly GuiPackPickerItem[];
  className?: string;
}) {
  const selected = selectedGuiPackItem(props.value, props.items);
  if (!selected?.nutexbPath) return null;
  return (
    <GuiPackPreviewThumb
      nutexbPath={selected.nutexbPath}
      alt={selected.label}
      className={cn("h-28 w-full border", props.className)}
      maxDimension={256}
    />
  );
}

export function GuiHashFieldExtras(props: {
  fieldKey: string;
  value: number;
  items: GuiPackPickerItem[];
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect: (hash: number) => void;
  onOpenFolder?: (hash: number) => void;
  onExtract?: (hash: number, fieldKey: string) => void;
  extractingHash?: number | null;
  onClone?: (hash: number, fieldKey: string) => void;
  cloningHash?: number | null;
}) {
  const hash = normalizeGuiHash(props.value);
  const selected = selectedGuiPackItem(props.value, props.items);
  const extracted = Boolean(selected?.folderPath);
  const extractable = canExtractGuiPack({ hash, folderPath: selected?.folderPath ?? null });
  const extractTooltip =
    hash === 0 ? "No pack hash" : extracted ? "Already extracted" : "Extract pack to workspace";
  const cloneBusy = props.cloningHash === hash;
  const cloneTooltip =
    hash === 0
      ? "No pack hash"
      : cloneBusy
        ? "Cloning pack"
        : "Clone this pack to a new HashName";

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <GuiPackPickerPopover
        fieldKey={props.fieldKey}
        onSelect={props.onSelect}
        items={props.items}
        selectedValue={hash}
        isLoading={props.isLoading}
        error={props.error}
        open={props.open}
        onOpenChange={props.onOpenChange}
        onExtract={
          props.onExtract
            ? (nextHash) => props.onExtract?.(nextHash, props.fieldKey)
            : undefined
        }
        extractingHash={props.extractingHash}
      />
      {props.onExtract ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={!extractable || props.extractingHash === hash}
                  onClick={() => props.onExtract?.(hash, props.fieldKey)}
                  aria-label="Extract 009gui pack"
                >
                  <Package className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{extractTooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      {props.onClone ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={hash === 0 || cloneBusy}
                  onClick={() => props.onClone?.(hash, props.fieldKey)}
                  aria-label="Clone 009gui pack"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{cloneTooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      {props.onOpenFolder ? (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={hash === 0}
                  onClick={() => props.onOpenFolder?.(hash)}
                  aria-label="Open 009gui extract folder"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {hash === 0 ? "No pack hash" : "Open extract folder"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}
