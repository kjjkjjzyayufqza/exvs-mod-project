import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GuiPackPickerPopover } from "./GuiPackPickerPopover";
import { normalizeGuiHash, type GuiPackPickerItem } from "./guiPackIndex";

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
}) {
  const hash = normalizeGuiHash(props.value);
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
      />
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
