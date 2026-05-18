import { Box, Eye, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ViewMode = "normal" | "collision" | "both";

const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof Eye }[] = [
  { mode: "normal", label: "Normal View", icon: Eye },
  { mode: "collision", label: "Collision View", icon: Box },
  { mode: "both", label: "Both", icon: Layers },
];

interface HavokViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  disabled?: boolean;
}

export function HavokViewModeToggle({
  value,
  onChange,
  disabled,
}: HavokViewModeToggleProps) {
  return (
    <div className="flex items-center">
      {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                value === mode && "bg-accent text-accent-foreground",
              )}
              onClick={() => onChange(mode)}
              disabled={disabled}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
