import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { BorderHitSummary, PlanParam, PlanPointKind } from "../../types/planParam";
import { listPlanPoints, parsePlanPointKey } from "../../utils/planParamEdit";

const GROUPS: PlanPointKind[] = ["spawnFirst", "spawnSecond", "marker", "respawn"];

interface PlanParamPanelProps {
  plan: PlanParam | null;
  border: BorderHitSummary | null;
  borderInViewport?: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onMove: (key: string, position: [number, number, number]) => void;
  onLimitChange: (limit: number) => void;
  borderModels?: ReadonlyArray<{ id: string; label: string }>;
  onGenerateBorder?: (modelId: string) => void;
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input
        className="h-7 font-mono text-[11px]"
        type="number"
        step="any"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onCommit(next);
        }}
      />
    </label>
  );
}

export function PlanParamPanel({
  plan,
  border,
  borderInViewport = false,
  selectedKey,
  onSelect,
  onMove,
  onLimitChange,
  borderModels = [],
  onGenerateBorder,
}: PlanParamPanelProps) {
  const { t } = useTranslation("scene-page");
  const points = plan ? listPlanPoints(plan) : [];
  const [borderModelId, setBorderModelId] = useState("");
  const selectedBorderModel = borderModels.some((model) => model.id === borderModelId)
    ? borderModelId
    : (borderModels[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-[11px]">
        <div className="font-medium">{t("planParam.borderTitle")}</div>
        {border ? (
          <p className="mt-1 text-muted-foreground">
            {t("planParam.borderSummary", {
              sdk: border.sdkVersion,
              bytes: border.byteLen,
              items: border.itemCount,
            })}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">{t("planParam.borderMissing")}</p>
        )}
        <p className="mt-1 text-muted-foreground">
          {borderInViewport
            ? t("planParam.borderInViewport")
            : border
              ? t("planParam.borderWhenCollision")
              : t("planParam.borderViewOnly")}
        </p>
        {onGenerateBorder && (
          <div className="mt-2 flex items-center gap-1">
            <select
              className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[11px]"
              value={selectedBorderModel}
              disabled={borderModels.length === 0}
              onChange={(event) => setBorderModelId(event.target.value)}
            >
              {borderModels.length === 0 ? (
                <option value="">{t("planParam.noBorderModels")}</option>
              ) : (
                borderModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))
              )}
            </select>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px]"
              disabled={!selectedBorderModel}
              onClick={() => onGenerateBorder(selectedBorderModel)}
            >
              {t("planParam.generateBorder")}
            </Button>
          </div>
        )}
      </div>

      {!plan ? (
        <p className="px-1 text-[11px] text-muted-foreground">{t("planParam.missing")}</p>
      ) : (
        <>
          <NumberField label={t("planParam.limit")} value={plan.limit} onCommit={onLimitChange} />
          <p className="text-[11px] text-muted-foreground">{t("planParam.markerAngleHint")}</p>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {GROUPS.map((kind) => {
              const rows = points.filter((point) => point.id.kind === kind);
              if (rows.length === 0) return null;
              return (
                <div key={kind} className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(`planParam.groups.${kind}`, { count: rows.length })}
                  </div>
                  {rows.map((point) => {
                    const selected = selectedKey === point.key;
                    return (
                      <div
                        key={point.key}
                        className={cn(
                          "w-full rounded-md border px-2 py-1.5 text-left",
                          selected ? "border-primary bg-primary/10" : "border-border/60 hover:bg-accent/40",
                        )}
                      >
                        <button
                          type="button"
                          className="mb-1 flex w-full items-center justify-between gap-2 text-left text-[10px]"
                          onClick={() => onSelect(point.key)}
                        >
                          <span className="font-mono">{point.key}</span>
                          <span className="text-muted-foreground">
                            {t("planParam.trailing", { value: point.trailing })}
                          </span>
                        </button>
                        <div className="grid grid-cols-3 gap-1">
                          {(["x", "y", "z"] as const).map((axis, axisIndex) => (
                            <NumberField
                              key={axis}
                              label={axis}
                              value={point.position[axisIndex] ?? 0}
                              onCommit={(next) => {
                                const id = parsePlanPointKey(point.key);
                                if (!id) return;
                                const position: [number, number, number] = [...point.position];
                                position[axisIndex] = next;
                                onSelect(point.key);
                                onMove(point.key, position);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
