import { useTranslation } from "react-i18next";

import { BORDER_MESH_COLOR } from "./BorderHitMesh";
import { PLAN_POINT_COLORS } from "./PlanParamMarkers";

const ROWS = [
  ["spawnFirst", PLAN_POINT_COLORS.spawnFirst],
  ["spawnSecond", PLAN_POINT_COLORS.spawnSecond],
  ["marker", PLAN_POINT_COLORS.marker],
  ["respawn", PLAN_POINT_COLORS.respawn],
  ["limit", "#d7dde8"],
] as const;

export function PlanViewportLegend({ showPlan, showBorder }: { showPlan: boolean; showBorder: boolean }) {
  const { t } = useTranslation("scene-page");
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-40 flex flex-col gap-1 rounded-md border border-white/15 bg-black/70 px-2 py-1.5 font-mono text-[10px] text-white/90">
      {showPlan && ROWS.map(([kind, color]) => (
        <div key={kind} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span>{t(`planParam.legend.${kind}`)}</span>
        </div>
      ))}
      {showBorder && (
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BORDER_MESH_COLOR }} />
          <span>{t("planParam.legend.border")}</span>
        </div>
      )}
    </div>
  );
}
