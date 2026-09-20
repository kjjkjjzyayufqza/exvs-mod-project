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
import { buildBriefingCast } from "@/services/triadRoute/routeDraft";
import {
  MAX_ENEMY_SIDE_DRAWN,
  MAX_PLAYER_SIDE_DRAWN,
  NO_CAST,
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
/** Select value standing in for "this portrait is empty". */
const EMPTY_VALUE = "none";

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

/** Which battle slots draw from each cast entry, in slot order. */
function slotsByCastIndex(briefing: BriefingDraft): Map<number, number[]> {
  const usage = new Map<number, number[]>();
  briefing.slots.forEach((entry, slot) => {
    if (entry.castIndex === NO_CAST) return;
    const seen = usage.get(entry.castIndex);
    if (seen) seen.push(slot);
    else usage.set(entry.castIndex, [slot]);
  });
  return usage;
}

/**
 * Cast entries worth showing, with their real indices.
 *
 * Shipped files pad the cast out with zeroed entries — most hold 33 for a
 * handful of suits — so listing all of them buries the real ones. A zeroed
 * entry that something still points at is kept: the random-course briefings
 * use placeholder entries with no suit id.
 */
function usableCast(
  briefing: BriefingDraft,
  usage: Map<number, number[]>,
): { index: number; unitId: number; pilotId: number }[] {
  const referenced = new Set([
    ...briefing.playerCast,
    ...briefing.bossCast,
    ...briefing.enemyCast,
    ...usage.keys(),
  ]);
  return briefing.units
    .map((unit, index) => ({ index, unitId: unit.unitId, pilotId: unit.pilotId }))
    .filter((entry) => entry.unitId !== 0 || entry.pilotId !== 0 || referenced.has(entry.index));
}

/**
 * Put `value` at one position of a drawn side, keeping the list compact.
 *
 * The file pads each side with `-1`, but the draft carries only the filled
 * positions, so emptying the first of two portraits moves the second up
 * rather than leaving a hole the writer would have to guess at.
 */
function setDrawnPosition(
  drawn: number[],
  position: number,
  value: number | null,
  capacity: number,
): number[] {
  const next: (number | null)[] = Array.from({ length: capacity }, (_, index) =>
    index < drawn.length ? drawn[index] : null,
  );
  next[position] = value;
  return next.filter((entry): entry is number => entry !== null);
}

interface CastEntry {
  index: number;
  unitId: number;
  pilotId: number;
}

function CastPortrait({
  castIndex,
  cast,
  units,
  usage,
  label,
  isBoss,
  disabled,
  onChange,
}: {
  castIndex: number | null;
  cast: CastEntry[];
  units: UnitNameMap;
  usage: Map<number, number[]>;
  label: string;
  isBoss?: boolean;
  disabled?: boolean;
  onChange: (castIndex: number | null) => void;
}) {
  const { t } = useTranslation("test-triad-route");
  const drawnSlots = castIndex === null ? [] : (usage.get(castIndex) ?? []);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border bg-card/60 p-2",
        isBoss && "border-amber-500/45 bg-amber-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {isBoss ? (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {t("briefing.boss")}
          </span>
        ) : null}
      </div>
      <Select
        value={castIndex === null ? EMPTY_VALUE : String(castIndex)}
        disabled={disabled}
        onValueChange={(value) => onChange(value === EMPTY_VALUE ? null : Number(value))}
      >
        <SelectTrigger className="h-8 w-full min-w-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_VALUE}>{t("briefing.emptyPortrait")}</SelectItem>
          {cast.map((entry) => (
            <SelectItem key={entry.index} value={String(entry.index)}>
              {t("briefing.castOption", {
                index: entry.index,
                unit: unitLabel(units, entry.unitId),
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="truncate text-[10px] text-muted-foreground">
        {castIndex === null
          ? t("briefing.emptyPortraitHint")
          : drawnSlots.length > 0
            ? t("briefing.drawnFromSlots", { slots: drawnSlots.join(", ") })
            : t("briefing.drawnFromNoSlot")}
      </p>
    </div>
  );
}

/**
 * The loading screen, as the file actually describes it.
 *
 * BSFO holds a cast list and eight display positions that point into it: two
 * on the player side, three boss frames and three more enemies. The battle
 * roster below it can be far longer — every wave has a slot — so showing the
 * roster as "the enemies" is how the screen ends up disagreeing with the
 * fight. What is drawn is picked here, portrait by portrait.
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
  const usage = useMemo(() => slotsByCastIndex(briefing), [briefing]);
  const cast = useMemo(() => usableCast(briefing, usage), [briefing, usage]);
  const battleSlotCount = useMemo(
    () => briefing.slots.filter((entry) => entry.castIndex !== NO_CAST).length,
    [briefing.slots],
  );

  const syncFromSlots = () => {
    if (!slots) return;
    onChange({ ...briefing, ...buildBriefingCast(slots, briefing) });
  };

  const changePlayer = (position: number, castIndex: number | null) =>
    onChange({
      ...briefing,
      playerCast: setDrawnPosition(
        briefing.playerCast,
        position,
        castIndex,
        MAX_PLAYER_SIDE_DRAWN,
      ),
    });
  const changeBoss = (position: number, castIndex: number | null) =>
    onChange({
      ...briefing,
      bossCast: setDrawnPosition(briefing.bossCast, position, castIndex, MAX_ENEMY_SIDE_DRAWN),
    });
  const changeEnemy = (position: number, castIndex: number | null) =>
    onChange({
      ...briefing,
      enemyCast: setDrawnPosition(briefing.enemyCast, position, castIndex, MAX_ENEMY_SIDE_DRAWN),
    });

  const portrait = (drawn: number[], position: number) =>
    position < drawn.length ? drawn[position] : null;

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
        title={t("briefing.title", { index: stageIndex })}
        description={t("briefing.description")}
        issues={sectionIssues}
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !slots}
            title={slots ? t("briefing.syncFromSquadHint") : t("stages.scriptNotRead")}
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

        <label
          className={cn(
            "flex min-h-10 cursor-pointer select-none items-center gap-2 self-end rounded-md px-1 text-xs",
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

      <div className="flex flex-col gap-2 rounded-md border bg-background/60 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xs font-medium">{t("briefing.drawnTitle")}</p>
          <p className="text-[11px] text-muted-foreground" style={{ textWrap: "pretty" }}>
            {t("briefing.drawnHint", { count: battleSlotCount })}
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("briefing.playerSide")}
            </p>
            {Array.from({ length: MAX_PLAYER_SIDE_DRAWN }, (_, position) => (
              <CastPortrait
                key={position}
                castIndex={portrait(briefing.playerCast, position)}
                cast={cast}
                units={units}
                usage={usage}
                label={t("briefing.playerPortrait", { position: position + 1 })}
                disabled={disabled}
                onChange={(castIndex) => changePlayer(position, castIndex)}
              />
            ))}
          </div>

          <span className="self-center text-xs font-semibold tracking-wider text-muted-foreground">
            VS
          </span>

          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("briefing.enemySide")}
            </p>
            {Array.from({ length: MAX_ENEMY_SIDE_DRAWN }, (_, position) => (
              <CastPortrait
                key={`boss-${position}`}
                castIndex={portrait(briefing.bossCast, position)}
                cast={cast}
                units={units}
                usage={usage}
                label={t("briefing.bossPortrait", { position: position + 1 })}
                isBoss
                disabled={disabled}
                onChange={(castIndex) => changeBoss(position, castIndex)}
              />
            ))}
            {Array.from({ length: MAX_ENEMY_SIDE_DRAWN }, (_, position) => (
              <CastPortrait
                key={`enemy-${position}`}
                castIndex={portrait(briefing.enemyCast, position)}
                cast={cast}
                units={units}
                usage={usage}
                label={t("briefing.enemyPortrait", { position: position + 1 })}
                disabled={disabled}
                onChange={(castIndex) => changeEnemy(position, castIndex)}
              />
            ))}
          </div>
        </div>
      </div>

      <CastList briefing={briefing} cast={cast} units={units} usage={usage} />
    </section>
  );
}

/** Everything the briefing can draw, and which battle slots use each entry. */
function CastList({
  briefing,
  cast,
  units,
  usage,
}: {
  briefing: BriefingDraft;
  cast: CastEntry[];
  units: UnitNameMap;
  usage: Map<number, number[]>;
}) {
  const { t } = useTranslation("test-triad-route");
  const drawn = useMemo(
    () => new Set([...briefing.playerCast, ...briefing.bossCast, ...briefing.enemyCast]),
    [briefing.playerCast, briefing.bossCast, briefing.enemyCast],
  );
  const padding = briefing.units.length - cast.length;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">{t("briefing.castTitle", { count: cast.length })}</p>
      {cast.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("briefing.castEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {cast.map((entry) => {
            const slots = usage.get(entry.index) ?? [];
            return (
              <li
                key={entry.index}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-xs",
                  drawn.has(entry.index) ? "bg-card/60" : "border-dashed text-muted-foreground",
                )}
              >
                <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] tabular-nums">
                  {entry.index}
                </span>
                <span className="truncate">{unitLabel(units, entry.unitId)}</span>
                {entry.pilotId !== 0 ? (
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {t("briefing.castPilot", { id: entry.pilotId })}
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {slots.length > 0
                    ? t("briefing.castSlots", { slots: slots.join(", ") })
                    : t("briefing.castNoSlot")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {padding > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          {t("briefing.castPadding", { count: padding })}
        </p>
      ) : null}
    </div>
  );
}
