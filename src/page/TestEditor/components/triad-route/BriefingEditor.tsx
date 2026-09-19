import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MonitorPlay, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { issuesForSection } from "@/services/triadRoute/issueLocation";
import {
  SCENE_CLASS,
  type BriefingDraft,
  type ScriptSlot,
  type ValidationIssue,
} from "@/services/triadRoute/types";
import { MISSION_MAPS } from "./missionMaps";
import { SectionHeader } from "./SectionHeader";
import { FOCUS_FLASH_CLASS, useIssueFocus, type IssueFocusRequest } from "./issueFocus";
import { unitLabel, type UnitNameMap } from "./triadRouteWorkspace";

const SCENE_CLASSES = Object.values(SCENE_CLASS);
/** Slots 0 and 1 are the player's in every shipped scene. */
const LAST_PLAYER_SLOT = 1;
/** The briefing draws at most three slots as bosses. */
const MAX_BOSS_SLOTS = 3;

type BriefingEditorProps = {
  briefing: BriefingDraft;
  slots: ScriptSlot[] | null;
  units: UnitNameMap;
  issues: ValidationIssue[];
  focus: IssueFocusRequest | null;
  stageIndex: number;
  disabled?: boolean;
  onChange: (briefing: BriefingDraft) => void;
};

interface SideEntry {
  slot: number;
  unitId: number;
}

function SideColumn({
  heading,
  entries,
  units,
  bossSlots,
  align,
}: {
  heading: string;
  entries: SideEntry[];
  units: UnitNameMap;
  bossSlots: number[];
  align: "left" | "right";
}) {
  const { t } = useTranslation("test-triad-route");
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", align === "right" && "items-end text-right")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {heading}
      </p>
      {entries.map((entry) => (
        <div
          key={entry.slot}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border bg-card/60 px-2 py-1 text-xs",
            align === "right" && "flex-row-reverse text-right",
            bossSlots.includes(entry.slot) && "border-amber-500/45 bg-amber-500/5",
          )}
        >
          <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] tabular-nums">
            {entry.slot}
          </span>
          <span className="truncate">{unitLabel(units, entry.unitId)}</span>
          {bossSlots.includes(entry.slot) ? (
            <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {t("briefing.boss")}
            </span>
          ) : null}
        </div>
      ))}
      {entries.length === 0 ? (
        <span className="text-xs text-muted-foreground">{"—"}</span>
      ) : null}
    </div>
  );
}

/**
 * The loading screen: which suits are drawn on each side, the map, the class
 * and the time. It is presentation only — the script decides what spawns —
 * so the preview below the fields shows the two sides the way the briefing
 * will, with the player on the left and the enemies on the right.
 */
export function BriefingEditor({
  briefing,
  slots,
  units,
  issues,
  focus,
  stageIndex,
  disabled,
  onChange,
}: BriefingEditorProps) {
  const { t } = useTranslation("test-triad-route");
  const { ref, isFlashing } = useIssueFocus("briefing", focus, stageIndex);
  const sectionIssues = useMemo(
    () => issuesForSection(issues, "briefing", stageIndex),
    [issues, stageIndex],
  );

  const playerSlotNumbers = useMemo(
    () => new Set((slots ?? []).filter((slot) => slot.team === 0).map((slot) => slot.slot)),
    [slots],
  );

  const sides = useMemo(() => {
    // Without a script the side split is unknown; slot 0 and 1 are the
    // player's in every shipped scene, so fall back to that convention.
    if (slots === null) {
      const toEntry = (entry: { slot: number; unitId: number }): SideEntry => ({
        slot: entry.slot,
        unitId: entry.unitId,
      });
      return {
        player: briefing.slots.filter((e) => e.slot <= LAST_PLAYER_SLOT).map(toEntry),
        enemy: briefing.slots.filter((e) => e.slot > LAST_PLAYER_SLOT).map(toEntry),
      };
    }
    const player: SideEntry[] = [];
    const enemy: SideEntry[] = [];
    for (const entry of briefing.slots) {
      const target = playerSlotNumbers.has(entry.slot) ? player : enemy;
      target.push({ slot: entry.slot, unitId: entry.unitId });
    }
    return { player, enemy };
  }, [briefing.slots, playerSlotNumbers, slots]);

  const syncFromSlots = () => {
    if (!slots) return;
    onChange({
      ...briefing,
      units: slots.map((slot) => ({ word0: 0, unitId: slot.unitId, pilotId: 0, word3: 0 })),
      slots: slots.map((slot) => ({
        unitId: slot.unitId,
        flags: 1,
        slot: slot.slot,
        order: slot.displayOrder,
      })),
      bossSlots: briefing.bossSlots.filter((boss) => slots.some((slot) => slot.slot === boss)),
    });
  };

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className={cn(
        "flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card/40 p-3",
        "transition-[box-shadow] duration-300 ease-out",
        isFlashing && FOCUS_FLASH_CLASS,
      )}
    >
      <SectionHeader
        icon={MonitorPlay}
        title={t("briefing.title")}
        description={t("briefing.description")}
        issues={sectionIssues}
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !slots}
            title={slots ? undefined : t("stages.scriptNotRead")}
            onClick={syncFromSlots}
          >
            <Wand2 className="mr-1.5 size-3.5" />
            {t("briefing.syncFromSquad")}
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">{t("briefing.map")}</Label>
          <Select
            value={String(briefing.mapHash >>> 0)}
            disabled={disabled}
            onValueChange={(value) => onChange({ ...briefing, mapHash: Number(value) >>> 0 })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MISSION_MAPS.map((map) => (
                <SelectItem key={map.hash} value={String(map.hash >>> 0)}>
                  {map.label} / {map.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">{t("briefing.sceneClass")}</Label>
          <Select
            value={String(briefing.sceneClass)}
            disabled={disabled}
            onValueChange={(value) => onChange({ ...briefing, sceneClass: Number(value) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENE_CLASSES.map((sceneClass) => (
                <SelectItem key={sceneClass} value={String(sceneClass)}>
                  {t(`briefing.class.${sceneClass}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">{t("briefing.timeLimit")}</Label>
          <Input
            type="number"
            min={1}
            value={briefing.timeLimitSeconds}
            disabled={disabled}
            className="tabular-nums"
            onChange={(event) =>
              onChange({ ...briefing, timeLimitSeconds: Number(event.target.value) || 0 })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">{t("briefing.bossSlots")}</Label>
          <Input
            value={briefing.bossSlots.join(", ")}
            disabled={disabled}
            placeholder="2, 3"
            inputMode="numeric"
            className="tabular-nums"
            onChange={(event) =>
              onChange({
                ...briefing,
                bossSlots: event.target.value
                  .split(",")
                  .map((part) => Number(part.trim()))
                  .filter((value) => Number.isInteger(value) && value >= 0)
                  .slice(0, MAX_BOSS_SLOTS),
              })
            }
          />
          <p className="text-[11px] text-muted-foreground" style={{ textWrap: "pretty" }}>
            {t("briefing.bossSlotsHint")}
          </p>
        </div>

        <label
          className={cn(
            "flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-md px-1 text-xs md:col-span-2",
            "transition-[background-color] duration-150 ease-out hover:bg-accent/50",
            disabled && "cursor-default opacity-60",
          )}
        >
          <Checkbox
            checked={briefing.hasTarget}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...briefing, hasTarget: checked === true })}
          />
          {t("briefing.hasTarget")}
        </label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 rounded-md border bg-background/60 p-3">
        <SideColumn
          heading={`${t("briefing.playerSide")} · ${t("briefing.unitCount", { count: sides.player.length })}`}
          entries={sides.player}
          units={units}
          bossSlots={briefing.bossSlots}
          align="left"
        />
        <span className="self-center text-xs font-semibold tracking-wider text-muted-foreground">
          VS
        </span>
        <SideColumn
          heading={`${t("briefing.enemySide")} · ${t("briefing.unitCount", { count: sides.enemy.length })}`}
          entries={sides.enemy}
          units={units}
          bossSlots={briefing.bossSlots}
          align="right"
        />
      </div>
    </section>
  );
}
