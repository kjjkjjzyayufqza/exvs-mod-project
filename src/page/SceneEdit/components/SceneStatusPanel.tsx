import type { StageTreeNode } from "./StageHierarchyTree";
import type { PlacementRow } from "../types/placement";
import type { SceneDrawStats } from "./SceneViewportOverlay";
import { PROP_AXIS_GRID, PROP_LABEL, PROP_PANEL, PROP_ROW } from "./propertyPanelStyles";

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
    <div className={`space-y-2 ${PROP_PANEL}`}>
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
        <div className="space-y-1 border-t border-border/30 pt-1.5">
          <div className={`${PROP_LABEL} mb-0.5`}>Selected</div>
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
        <div className="space-y-1 border-t border-border/30 pt-1.5">
          <div className={`${PROP_LABEL} mb-0.5`}>Placement #{selectedPlacementIdx}</div>
          <div className={PROP_AXIS_GRID}>
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
    <div className={`space-y-1 ${PROP_PANEL}`}>
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
    <div className={PROP_ROW}>
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-[11px] ${mono ? "font-mono" : ""} ${dim ? "text-muted-foreground/60 text-[10px]" : ""} ${colorClass}`}
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
    <div className="flex min-w-0 flex-col items-center rounded bg-muted/30 px-1 py-1">
      <span className="text-[9px] text-muted-foreground/60">{label}</span>
      <span className={`truncate w-full text-center text-[11px] font-mono tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  );
}
