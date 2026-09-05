import type { StageTreeNode } from "./StageHierarchyTree";
import type { SceneDrawStats } from "./SceneViewportOverlay";
import { PROP_LABEL, PROP_PANEL, PROP_ROW } from "./propertyPanelStyles";
import { useTranslation } from "react-i18next";

interface SceneInfoContentProps {
  stageName: string | null;
  stageRoot: string | null;
  selectedNode: StageTreeNode | null;
  subModelCount: number;
  textureCount: number;
}

export function SceneInfoContent({
  stageName,
  stageRoot,
  selectedNode,
  subModelCount,
  textureCount,
}: SceneInfoContentProps) {
  const { t } = useTranslation("scene-root-b");
  if (!stageName) {
    return (
      <div className="py-2 text-center text-[10px] text-muted-foreground">
        {t("status.noStage")}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${PROP_PANEL}`}>
      <div className="space-y-1">
        <Row label={t("status.name")} value={stageName} mono />
        <Row
          label={t("status.path")}
          value={stageRoot ? stageRoot.split(/[/\\]/).slice(-3).join("/") : "-"}
          dim
        />
        <Row label={t("status.objects")} value={String(subModelCount)} accent="blue" />
        <Row label={t("status.textures")} value={String(textureCount)} accent="purple" />
      </div>

      {selectedNode && (
        <div className="space-y-1 border-t border-border/30 pt-1.5">
          <div className={`${PROP_LABEL} mb-0.5`}>{t("status.selected")}</div>
          <Row label={t("status.name")} value={selectedNode.label} accent="primary" />
          <Row label={t("status.type")} value={selectedNode.role} />
          {selectedNode.objectIndex !== undefined && (
            <Row
              label={t("status.objectNumber")}
              value={String(selectedNode.objectIndex)}
            />
          )}
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
  const { t } = useTranslation("scene-root-b");
  if (!drawStats) {
    return (
      <div className="py-2 text-center text-[10px] text-muted-foreground">
        {t("status.loadStageStats")}
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
      <Row label={t("status.drawCalls")} value={String(drawStats.drawCount)} accent="blue" />
      <Row
        label={t("status.triangles")}
        value={fmt(drawStats.triangleCount)}
        accent="green"
      />
      <Row
        label={t("status.vertices")}
        value={fmt(drawStats.vertexCount)}
        accent="amber"
      />
      <Row
        label={t("status.subModels")}
        value={String(drawStats.subModelCount)}
        accent="purple"
      />
      <div className="border-t border-border/30 pt-1 mt-1 space-y-1">
        <Row label={t("status.totalObjects")} value={String(subModelCount)} />
        <Row label={t("status.textures")} value={String(textureCount)} />
        {stageName && <Row label={t("status.stage")} value={stageName} />}
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
