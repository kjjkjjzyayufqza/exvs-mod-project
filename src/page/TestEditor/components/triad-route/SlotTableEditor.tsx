import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  INTRO_ACTION,
  type PilotNameEntry,
  type ScriptSlot,
  type ValidationIssue,
} from "@/services/triadRoute/types";
import { SectionHeader } from "./SectionHeader";
import { UnitSelect } from "./UnitSelect";
import type { UnitNameMap } from "./triadRouteWorkspace";

const NO_PILOT = "0";
const INTRO_ACTIONS = Object.values(INTRO_ACTION);
const PLAYER_TEAM = 0;
/** AI level range the shipped scripts stay inside. */
const MAX_AI_LEVEL = 23;
const AXES = ["X", "Y", "Z"] as const;

type SlotTableEditorProps = {
  slots: ScriptSlot[];
  units: UnitNameMap;
  pilots: PilotNameEntry[];
  /** Findings for this stage, used to mark the slots they name. */
  issues: ValidationIssue[];
  disabled?: boolean;
  onChange: (slots: ScriptSlot[]) => void;
};

function SlotField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Per-slot editing of what actually spawns.
 *
 * Only the parameters the engine reads are shown. The eleven dead ones are
 * left out on purpose: exposing a field that changes nothing in game is how a
 * modder spends an evening tuning a number the build ignores.
 *
 * Each slot is a full-width card so Suit / Pilot / Position can actually
 * show their values. The list is not put in its own scroll box: it sits in
 * the page scroller with the rest of the stage.
 */
export function SlotTableEditor({
  slots,
  units,
  pilots,
  issues,
  disabled,
  onChange,
}: SlotTableEditorProps) {
  const { t } = useTranslation("test-triad-route");

  const update = (slotNumber: number, patch: Partial<ScriptSlot>) => {
    onChange(slots.map((slot) => (slot.slot === slotNumber ? { ...slot, ...patch } : slot)));
  };

  const remove = (slotNumber: number) => {
    onChange(slots.filter((slot) => slot.slot !== slotNumber));
  };

  const sideCounts = useMemo(
    () => ({
      player: slots.filter((slot) => slot.team === PLAYER_TEAM).length,
      enemy: slots.filter((slot) => slot.team !== PLAYER_TEAM).length,
    }),
    [slots],
  );

  if (slots.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
        {t("slots.empty")}
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card/40 p-3">
      <SectionHeader
        icon={Users}
        title={t("slots.title")}
        description={t("slots.counts", {
          player: sideCounts.player,
          enemy: sideCounts.enemy,
        })}
        issues={issues.filter((issue) => issue.code.startsWith("slot-"))}
      />

      <div className="flex flex-col gap-3">
        {slots.map((slot) => (
          <article
            key={slot.slot}
            className={cn(
              "flex flex-col gap-3 rounded-lg border p-3",
              slot.team === PLAYER_TEAM
                ? "border-sky-500/40 bg-sky-500/5"
                : "border-border bg-background/40",
            )}
          >
            <header className="flex items-end gap-2">
              <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-md bg-muted/80">
                <span className="text-[10px] tracking-wide text-muted-foreground">
                  {t("slots.slot")}
                </span>
                <span className="font-mono text-sm tabular-nums leading-none">{slot.slot}</span>
              </div>
              <SlotField label={t("slots.team")} className="min-w-0 flex-1">
                <Select
                  value={String(slot.team)}
                  disabled={disabled}
                  onValueChange={(value) => update(slot.slot, { team: Number(value) })}
                >
                  <SelectTrigger className="h-9 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("slots.teamPlayer")}</SelectItem>
                    <SelectItem value="1">{t("slots.teamEnemy")}</SelectItem>
                  </SelectContent>
                </Select>
              </SlotField>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10 shrink-0 text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-destructive active:translate-y-px"
                disabled={disabled}
                title={t("slots.remove", { slot: slot.slot })}
                aria-label={t("slots.remove", { slot: slot.slot })}
                onClick={() => remove(slot.slot)}
              >
                <Trash2 className="size-4" />
              </Button>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SlotField label={t("slots.unit")} className="sm:col-span-2">
                <UnitSelect
                  value={slot.unitId}
                  units={units}
                  disabled={disabled}
                  placeholder={t("slots.unit")}
                  onChange={(unitId) => update(slot.slot, { unitId })}
                />
              </SlotField>

              <SlotField label={t("slots.pilot")} className="sm:col-span-2 xl:col-span-2">
                <Select
                  value={String(slot.pilotNameHash >>> 0)}
                  disabled={disabled}
                  onValueChange={(value) => {
                    const pilotNameHash = Number(value) >>> 0;
                    update(slot.slot, { pilotNameHash, showPilotName: pilotNameHash !== 0 });
                  }}
                >
                  <SelectTrigger className="h-9 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PILOT}>{t("slots.pilotNone")}</SelectItem>
                    {pilots.map((pilot) => (
                      <SelectItem key={pilot.nameHash} value={String(pilot.nameHash >>> 0)}>
                        {pilot.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SlotField>

              <SlotField label={t("slots.position")} className="sm:col-span-2 xl:col-span-2">
                <div className="grid grid-cols-3 gap-2">
                  {AXES.map((axis, index) => (
                    <div key={axis} className="flex min-w-0 flex-col gap-1">
                      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                        {axis}
                      </span>
                      <Input
                        type="number"
                        value={slot.position[index]}
                        aria-label={`${t("slots.position")} ${axis}`}
                        disabled={disabled}
                        onChange={(event) => {
                          const position: [number, number, number] = [...slot.position];
                          position[index] = Number(event.target.value) || 0;
                          update(slot.slot, { position });
                        }}
                        className="h-9 min-w-0 w-full tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </SlotField>

              <SlotField label={t("slots.facing")}>
                <Input
                  type="number"
                  value={slot.facingDegrees}
                  disabled={disabled}
                  onChange={(event) =>
                    update(slot.slot, { facingDegrees: Number(event.target.value) || 0 })
                  }
                  className="h-9 min-w-0 w-full tabular-nums"
                />
              </SlotField>

              <SlotField label={t("slots.introAction")} className="sm:col-span-2 xl:col-span-1">
                <Select
                  value={String(slot.introAction)}
                  disabled={disabled}
                  onValueChange={(value) => update(slot.slot, { introAction: Number(value) })}
                >
                  <SelectTrigger className="h-9 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTRO_ACTIONS.map((action) => (
                      <SelectItem key={action} value={String(action)}>
                        {t(`slots.intro.${action}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SlotField>

              <SlotField label={t("slots.introFrames")}>
                <Input
                  type="number"
                  min={1}
                  value={slot.introActionFrames}
                  disabled={disabled}
                  onChange={(event) =>
                    update(slot.slot, { introActionFrames: Number(event.target.value) || 1 })
                  }
                  className="h-9 min-w-0 w-full tabular-nums"
                />
              </SlotField>

              <SlotField label={t("slots.aiLevel")}>
                <Input
                  type="number"
                  min={0}
                  max={MAX_AI_LEVEL}
                  value={slot.aiLevel}
                  disabled={disabled}
                  onChange={(event) =>
                    update(slot.slot, { aiLevel: Number(event.target.value) || 0 })
                  }
                  className="h-9 min-w-0 w-full tabular-nums"
                />
              </SlotField>
            </div>
          </article>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground" style={{ textWrap: "pretty" }}>
        {t("slots.deadParameterNote")}
      </p>
    </section>
  );
}
