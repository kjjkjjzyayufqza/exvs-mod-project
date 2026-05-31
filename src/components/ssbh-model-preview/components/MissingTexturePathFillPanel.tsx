import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SceneTextureSelectPicker } from "@/page/SceneEdit/components/SceneTextureSelectPicker";
import type { MissingTexturePathSlotRef } from "../store/numatbTemplateStoreHelpers";

interface MissingTexturePathFillPanelProps {
  slots: MissingTexturePathSlotRef[];
  onFillSlot: (slot: MissingTexturePathSlotRef, basename: string) => void;
  title?: string;
  className?: string;
}

function profileLabel(profile: MissingTexturePathSlotRef["profile"]): string {
  return profile === "maya" ? "Maya" : "Nust";
}

export function MissingTexturePathFillPanel({
  slots,
  onFillSlot,
  title = "Fill every texture path parameter for profiles you export:",
  className,
}: MissingTexturePathFillPanelProps) {
  if (slots.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3", className)}>
      <p className="text-[11px] text-destructive">{title}</p>
      <div className="overflow-hidden rounded-md border border-border/60 bg-background">
        {slots.map((slot) => (
          <div
            key={`${slot.profile}:${slot.materialLabel}:${slot.paramId}:${slot.attributeIndex}`}
            className="grid min-h-[2rem] grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border/40 px-3 py-1.5 last:border-b-0 hover:bg-muted/20"
          >
            <div className="min-w-0">
              <Label className="font-mono text-[11px] font-normal text-foreground">{slot.paramId}</Label>
              <p className="truncate text-[9px] leading-tight text-muted-foreground">
                {profileLabel(slot.profile)} · {slot.materialLabel}
              </p>
            </div>
            <div className="min-w-0 justify-self-stretch">
              <SceneTextureSelectPicker
                value={slot.value}
                paramId={slot.paramId}
                onChange={(basename) => onFillSlot(slot, basename)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
