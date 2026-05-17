import type { StageTreeNode } from "./StageHierarchyTree";
import type { PlacementRow } from "../types/placement";
import type { SceneDrawStats } from "./SceneViewportOverlay";

interface SceneInfoContentProps {
  stageName: string | null;
  stageRoot: string | null;
  selectedNode: StageTreeNode | null;
  selectedPlacementIdx: number | null;
  placementEntry: PlacementRow | null;
  subModelCount: number;
  textureCount: number;
}

export function SceneInfoContent({
  stageName,
  stageRoot,
  selectedNode,
  selectedPlacementIdx,
  placementEntry,
  subModelCount,
  textureCount,
}: SceneInfoContentProps) {
  if (!stageName) {
    return (
      <div className="py-2 text-center text-[10px] text-muted-foreground">
        No stage loaded
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Row label="Name" value={stageName} mono />
        <Row
          label="Path"
          value={stageRoot ? stageRoot.split(/[/\\]/).slice(-3).join("/") : "-"}
          dim
        />
        <Row label="Objects" value={String(subModelCount)} accent="blue" />
        <Row label="Textures" value={String(textureCount)} accent="purple" />
      </div>

      {selectedNode && (
        <div className="border-t border-border/30 pt-1.5 space-y-1">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-0.5">
            Selected
          </div>
          <Row label="Name" value={selectedNode.label} accent="primary" />
          <Row label="Type" value={selectedNode.role} />
          {selectedNode.objectIndex !== undefined && (
            <Row
              label="Object #"
              value={String(selectedNode.objectIndex)}
            />
          )}
        </div>
      )}

      {placementEntry && (
        <div className="border-t border-border/30 pt-1.5 space-y-1">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-0.5">
            Placement #{selectedPlacementIdx}
          </div>
          <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
            <ValueCell
              label="X"
              value={placementEntry.posX.toFixed(1)}
              color="text-red-400"
            />
            <ValueCell
              label="Y"
              value={placementEntry.posY.toFixed(1)}
              color="text-green-400"
            />
            <ValueCell
              label="Z"
              value={placementEntry.posZ.toFixed(1)}
              color="text-blue-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface SceneStatsContentProps {
  drawStats: SceneDrawStats | null;
  subModelCount: number;
  textureCount: number;
  stageName: string | null;
}

export function SceneStatsContent({
  drawStats,
  subModelCount,
  textureCount,
  stageName,
}: SceneStatsContentProps) {
  if (!drawStats) {
    return (
      <div className="py-2 text-center text-[10px] text-muted-foreground">
        Load a stage to view stats
      </div>
    );
  }

  const fmt = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="space-y-1">
      <Row label="Draw Calls" value={String(drawStats.drawCount)} accent="blue" />
      <Row
        label="Triangles"
        value={fmt(drawStats.triangleCount)}
        accent="green"
      />
      <Row
        label="Vertices"
        value={fmt(drawStats.vertexCount)}
        accent="amber"
      />
      <Row
        label="Sub-models"
        value={String(drawStats.subModelCount)}
        accent="purple"
      />
      <div className="border-t border-border/30 pt-1 mt-1 space-y-1">
        <Row label="Total Objects" value={String(subModelCount)} />
        <Row label="Textures" value={String(textureCount)} />
        {stageName && <Row label="Stage" value={stageName} />}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  dim,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  dim?: boolean;
  accent?: "blue" | "green" | "amber" | "purple" | "primary";
}) {
  const colorClass = accent
    ? ({
        blue: "text-blue-400",
        green: "text-emerald-400",
        amber: "text-amber-400",
        purple: "text-purple-400",
        primary: "text-primary",
      })[accent]
    : "";

  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`truncate max-w-[60%] text-right ${mono ? "font-mono" : ""} ${dim ? "text-muted-foreground/60 text-[9px]" : ""} ${colorClass}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function ValueCell({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center bg-muted/30 rounded px-1 py-0.5">
      <span className="text-[8px] text-muted-foreground/50">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}
