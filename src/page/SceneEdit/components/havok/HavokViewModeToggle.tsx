import { Box, Eye, Layers, Grid3X3, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export type ViewMode = "normal" | "collision" | "both";

const VIEW_MODE_CONFIG: {
  mode: ViewMode;
  icon: typeof Eye;
}[] = [
  { mode: "normal", icon: Eye },
  { mode: "collision", icon: Box },
  { mode: "both", icon: Layers },
];

interface HavokViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  disabled?: boolean;
  showWireframe?: boolean;
  onToggleWireframe?: () => void;
  showAabb?: boolean;
  onToggleAabb?: (v: boolean) => void;
  showMesh?: boolean;
  onToggleMesh?: (v: boolean) => void;
}

export function HavokViewModeToggle({
  value,
  onChange,
  disabled,
  showWireframe,
  onToggleWireframe,
  showAabb = true,
  onToggleAabb,
  showMesh = true,
  onToggleMesh,
}: HavokViewModeToggleProps) {
  const { t } = useTranslation("scene-dae-hkt");
  const current = VIEW_MODE_CONFIG.find((v) => v.mode === value) ?? VIEW_MODE_CONFIG[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1 px-2 text-[11px] font-medium",
                value !== "normal" && "text-green-400",
              )}
              disabled={disabled}
            >
              <CurrentIcon className="h-3.5 w-3.5" />
              <span>{t(`viewMode.modes.${current.mode}.short`)}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px]">
          {disabled ? t("viewMode.noCollisionData") : t("viewMode.title")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("viewMode.title")}
        </DropdownMenuLabel>
        {VIEW_MODE_CONFIG.map(({ mode, icon: Icon }) => (
          <DropdownMenuItem
            key={mode}
            onClick={() => onChange(mode)}
            className={cn(
              "gap-2 text-xs",
              value === mode && "bg-accent font-semibold",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(`viewMode.modes.${mode}.label`)}
          </DropdownMenuItem>
        ))}

        {(onToggleWireframe || onToggleAabb || onToggleMesh) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("viewMode.show")}
            </DropdownMenuLabel>
          </>
        )}

        {onToggleWireframe && (
          <DropdownMenuCheckboxItem
            checked={showWireframe}
            onCheckedChange={onToggleWireframe}
            className="gap-2 text-xs"
          >
            <Grid3X3 className="h-3.5 w-3.5" />
            {t("viewMode.wireframe")}
          </DropdownMenuCheckboxItem>
        )}

        {onToggleAabb && (
          <DropdownMenuCheckboxItem
            checked={showAabb}
            onCheckedChange={() => onToggleAabb(!showAabb)}
            className="gap-2 text-xs"
          >
            <Box className="h-3.5 w-3.5" />
            {t("viewMode.aabbBounds")}
          </DropdownMenuCheckboxItem>
        )}

        {onToggleMesh && (
          <DropdownMenuCheckboxItem
            checked={showMesh}
            onCheckedChange={() => onToggleMesh(!showMesh)}
            className="gap-2 text-xs"
          >
            <Shapes className="h-3.5 w-3.5" />
            {t("viewMode.collisionMesh")}
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
