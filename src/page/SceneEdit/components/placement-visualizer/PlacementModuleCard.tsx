import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Box,
  Cloud,
  Sparkles,
  Package,
  ChevronDown,
  GripVertical,
  MapPin,
  RotateCw,
  Maximize,
  Hash,
  Shield,
  Zap,
  Link2,
} from "lucide-react";
import type { PlacementRow } from "../../types/placement";
import type { PlacementVdkType } from "../../utils/placementFieldCatalog";
import { listPlacementFields, type PlacementFieldRef } from "../../utils/placementFieldModel";

interface PlacementModuleCardProps {
  entry: PlacementRow;
  index: number;
  placementHeader: string[];
  subModels: Array<{ folderName: string; objectIndex: number }>;
  selected: boolean;
  onSelect: (index: number) => void;
}

const TYPE_CONFIG: Record<
  PlacementVdkType,
  { icon: typeof Box; color: string; accent: string; bg: string }
> = {
  OBJECT: {
    icon: Box,
    color: "text-emerald-400",
    accent: "border-emerald-500/40",
    bg: "bg-emerald-950/20",
  },
  SKY: {
    icon: Cloud,
    color: "text-sky-400",
    accent: "border-sky-500/40",
    bg: "bg-sky-950/20",
  },
  EFFECT: {
    icon: Sparkles,
    color: "text-amber-400",
    accent: "border-amber-500/40",
    bg: "bg-amber-950/20",
  },
  PROP: {
    icon: Package,
    color: "text-violet-400",
    accent: "border-violet-500/40",
    bg: "bg-violet-950/20",
  },
};

const CATEGORY_ICONS: Record<string, typeof Box> = {
  transform: MapPin,
  identity: Hash,
  animation: RotateCw,
  attach: Link2,
  prop: Package,
  effect: Zap,
  links: Link2,
  physics: Shield,
  other: Box,
};

export const PlacementModuleCard = memo(function PlacementModuleCard({
  entry,
  index,
  placementHeader,
  subModels,
  selected,
  onSelect,
}: PlacementModuleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const vdkType = (entry.vdkType?.toUpperCase() ?? "OBJECT") as PlacementVdkType;
  const config = TYPE_CONFIG[vdkType] ?? TYPE_CONFIG.OBJECT;
  const Icon = config.icon;

  const fields = listPlacementFields(entry, placementHeader);
  const modelName =
    entry.objectNumber !== null
      ? subModels.find((s) => s.objectIndex === entry.objectNumber)?.folderName ?? null
      : null;

  const placementName = fields.find(
    (f) => f.key.toUpperCase() === "VDK_PLACEMENT_NAME" && f.value.trim(),
  )?.value;

  const displayName = placementName || modelName || `${vdkType} #${index}`;

  // Group fields by category for modular visualization
  const grouped = groupFieldsByCategory(fields);

  return (
    <div
      className={cn(
        "group relative rounded-md border-l-[3px] transition-all duration-150",
        config.accent,
        config.bg,
        selected
          ? "border border-l-[3px] border-primary/60 shadow-[0_0_12px_-3px] shadow-primary/20"
          : "border border-l-[3px] border-border/30 hover:border-border/60",
      )}
      onClick={() => onSelect(index)}
    >
      {/* Header Strip */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <Icon className={cn("h-4 w-4 shrink-0", config.color)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[11px] font-semibold text-foreground/90">
            {displayName}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/70">
            idx:{index} · obj:{entry.objectNumber ?? "—"} · {vdkType}
          </span>
        </div>

        {/* Quick data badges */}
        <div className="flex items-center gap-1">
          <DataBadge
            icon={MapPin}
            value={`${entry.posX.toFixed(0)},${entry.posY.toFixed(0)},${entry.posZ.toFixed(0)}`}
            tooltip="Position XYZ"
          />
          {(entry.rotX !== 0 || entry.rotY !== 0 || entry.rotZ !== 0) && (
            <DataBadge
              icon={RotateCw}
              value={`${entry.rotX.toFixed(0)}°`}
              tooltip="Rotation"
            />
          )}
          {(entry.scaleX !== 1 || entry.scaleY !== 1 || entry.scaleZ !== 1) && (
            <DataBadge
              icon={Maximize}
              value={`${entry.scaleX.toFixed(1)}x`}
              tooltip="Scale"
            />
          )}
        </div>

        <button
          type="button"
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded transition-transform",
            expanded && "rotate-180",
          )}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Expanded: Full data visualization */}
      {expanded && (
        <div className="border-t border-border/20 px-2.5 pb-2.5 pt-2 space-y-1.5">
          {grouped.map((group) => (
            <FieldCategoryModule
              key={group.category}
              category={group.category}
              label={group.label}
              fields={group.fields}
              subModels={subModels}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function DataBadge({
  icon: BadgeIcon,
  value,
  tooltip,
}: {
  icon: typeof Box;
  value: string;
  tooltip: string;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-sm bg-muted/30 px-1.5 py-0.5"
      title={tooltip}
    >
      <BadgeIcon className="h-2.5 w-2.5 text-muted-foreground/60" />
      <span className="text-[8px] font-mono text-muted-foreground/80 tabular-nums">
        {value}
      </span>
    </div>
  );
}

function FieldCategoryModule({
  category,
  label,
  fields,
  subModels,
}: {
  category: string;
  label: string;
  fields: PlacementFieldRef[];
  subModels: Array<{ folderName: string; objectIndex: number }>;
}) {
  const CatIcon = CATEGORY_ICONS[category] ?? Box;

  return (
    <div className="rounded-sm border border-border/20 bg-background/30">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border/10">
        <CatIcon className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
        <span className="ml-auto text-[8px] font-mono text-muted-foreground/50">
          {fields.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-2 py-1.5">
        {fields.map((field) => (
          <FieldValueDisplay
            key={`${field.keyIndex}-${field.key}`}
            field={field}
            subModels={subModels}
          />
        ))}
      </div>
    </div>
  );
}

function FieldValueDisplay({
  field,
  subModels,
}: {
  field: PlacementFieldRef;
  subModels: Array<{ folderName: string; objectIndex: number }>;
}) {
  const shortKey = field.key.replace(/^VDK_/, "").toLowerCase();
  let displayValue = field.value;

  // Resolve object number to folder name
  if (field.key.toUpperCase() === "VDK_OBJECTNUMBER") {
    const num = Number.parseInt(field.value);
    const model = subModels.find((s) => s.objectIndex === num);
    if (model) displayValue = `${field.value} → ${model.folderName}`;
  }

  // Color code booleans
  const isBool = field.kind === "bool";
  const isTrue = isBool && field.value.toUpperCase() === "TRUE";

  return (
    <div className="flex items-baseline gap-1.5 min-w-0 py-0.5">
      <span
        className={cn(
          "shrink-0 text-[8px] font-mono uppercase tracking-tight",
          field.known ? "text-muted-foreground/60" : "text-amber-500/60",
        )}
        title={field.key}
      >
        {shortKey}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-[9px] font-mono tabular-nums",
          isBool && isTrue && "text-emerald-400",
          isBool && !isTrue && "text-rose-400/70",
          !isBool && "text-foreground/80",
        )}
        title={displayValue}
      >
        {displayValue}
      </span>
    </div>
  );
}

function groupFieldsByCategory(
  fields: PlacementFieldRef[],
): Array<{ category: string; label: string; fields: PlacementFieldRef[] }> {
  const CATEGORY_LABELS: Record<string, string> = {
    transform: "Transform",
    identity: "Identity",
    animation: "Animation",
    attach: "Attach",
    prop: "Prop",
    effect: "Effects",
    links: "Links",
    physics: "Physics",
    other: "Other",
  };
  const ORDER = [
    "identity",
    "transform",
    "animation",
    "attach",
    "prop",
    "effect",
    "links",
    "physics",
    "other",
  ];
  const buckets = new Map<string, PlacementFieldRef[]>();
  for (const f of fields) {
    const cat = f.category;
    const arr = buckets.get(cat) ?? [];
    arr.push(f);
    buckets.set(cat, arr);
  }
  return ORDER.filter((c) => buckets.has(c)).map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c] ?? c,
    fields: buckets.get(c)!,
  }));
}
