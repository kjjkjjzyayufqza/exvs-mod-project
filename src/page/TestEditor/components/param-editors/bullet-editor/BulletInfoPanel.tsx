import { Crosshair, Info, Repeat, SlidersHorizontal, Swords } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MayaSection } from "@/components/ssbh-model-preview/MayaInspectorSection";
import { formatHash } from "@/models/commandTable";
import { PropertyField } from "../shared/PropertyField";
import { BulletDpsPanel } from "./BulletDpsPanel";
import { useBulletEditorStore } from "./BulletEditorStore";
import { buildBulletComputedSections, buildBulletGroups } from "./BulletPropertyPanel";
import { ScenarioPanel } from "./ScenarioPanel";
import { ShootingLoopPanel } from "./ShootingLoopPanel";

/** Computed values, editable groups, target scenario, shooting loop and DPS of the selected bullet. */
export function BulletInfoPanel() {
  const { t } = useTranslation("test-workspace");
  const data = useBulletEditorStore((s) => s.data);
  const selectedIndex = useBulletEditorStore((s) => s.selectedIndex);
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const shootingLoopResult = useBulletEditorStore((s) => s.shootingLoopResult);
  const entry = data?.entries[selectedIndex] ?? null;

  if (!entry) {
    return <p className="px-1 text-xs text-muted-foreground">{t("info.noBullet")}</p>;
  }

  const entryId = typeof entry.entryId === "number" ? entry.entryId : 0;
  const computedSections = buildBulletComputedSections(entry);
  const visibleGroups = buildBulletGroups(entry).filter((g) => !g.visible || g.visible(entry));
  const onFieldChange = (key: string, value: number) => useBulletEditorStore.getState().updateField(key, value);

  return (
    <div className="flex min-w-0 flex-col rounded-md border bg-background/50">
      <div className="flex items-center justify-between border-b border-muted bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground" data-i18n-ignore="">
          {t("info.entryId")}
        </span>
        <span className="font-mono text-[11px]">{formatHash(entryId)}</span>
      </div>

      {computedSections.map((section) => (
        <MayaSection key={section.label} title={section.label} icon={<Info className="h-3.5 w-3.5" />}>
          <div className="flex flex-col gap-1.5" data-i18n-ignore="">
            {section.values.map((cv) => (
              <div key={cv.label} className="flex items-center justify-between gap-2" title={cv.tooltip}>
                <span className="min-w-0 shrink-0 text-[11px] text-muted-foreground">
                  {cv.label}
                  {cv.unit && <span className="ml-1 text-[9px] text-muted-foreground/60">({cv.unit})</span>}
                </span>
                <span
                  className="font-mono text-[11px] font-medium"
                  style={cv.color ? { color: cv.color } : undefined}
                >
                  {typeof cv.value === "number"
                    ? Number.isInteger(cv.value)
                      ? cv.value
                      : cv.value.toFixed(4)
                    : cv.value}
                </span>
              </div>
            ))}
          </div>
        </MayaSection>
      ))}

      {visibleGroups.map((group) => (
        <MayaSection key={group.id} title={group.label} icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
          <div className="flex flex-col gap-1.5" data-i18n-ignore="">
            {group.fields.map((def) => (
              <PropertyField
                key={def.key}
                def={def}
                value={entry[def.key] ?? 0}
                onChange={(key, value) => {
                  if (typeof value === "number") {
                    onFieldChange(key, value);
                  }
                }}
              />
            ))}
          </div>
        </MayaSection>
      ))}

      <MayaSection title={t("info.targetScenario")} icon={<Crosshair className="h-3.5 w-3.5" />}>
        <div className="-mx-1">
          <ScenarioPanel />
        </div>
      </MayaSection>
      <MayaSection title={t("info.shootingLoop")} icon={<Repeat className="h-3.5 w-3.5" />}>
        <div className="[&>div]:border-0 [&>div]:p-0 [&>div]:shadow-none">
          <ShootingLoopPanel result={shootingLoopResult} />
        </div>
      </MayaSection>
      <MayaSection title={t("info.combatStats")} icon={<Swords className="h-3.5 w-3.5" />}>
        <div className="[&>div]:border-0 [&>div]:p-0 [&>div]:shadow-none">
          <BulletDpsPanel entry={entry} trajectory={trajectory} />
        </div>
      </MayaSection>
    </div>
  );
}
