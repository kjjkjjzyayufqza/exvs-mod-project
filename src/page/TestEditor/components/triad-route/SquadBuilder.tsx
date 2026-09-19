import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { buildSquadLineup, type SquadLineup, type SquadObjective } from "@/services/triadRoute/routeDraft";
import { MAX_ENEMY_SIDE_UNITS } from "@/services/triadRoute/types";
import { MISSION_MAPS } from "./missionMaps";
import { UnitSelect } from "./UnitSelect";
import { unitLabel, type UnitNameMap } from "./triadRouteWorkspace";

const NO_PARTNER = "none";

type SquadBuilderProps = {
  units: UnitNameMap;
  currentMapHash: number;
  currentTimeLimit: number;
  disabled?: boolean;
  onGenerate: (lineup: SquadLineup) => void;
};

/**
 * The shortest path from "I want one suit against ten" to a stage that says so.
 *
 * Generating both sides at once is what keeps the fight and the loading screen
 * in agreement; editing either afterwards is still allowed, and the checks
 * panel reports the moment they drift apart.
 */
export function SquadBuilder({
  units,
  currentMapHash,
  currentTimeLimit,
  disabled,
  onGenerate,
}: SquadBuilderProps) {
  const { t } = useTranslation("test-triad-route");
  const [playerUnitId, setPlayerUnitId] = useState(0);
  const [partnerUnitId, setPartnerUnitId] = useState<number | null>(null);
  const [enemyUnitId, setEnemyUnitId] = useState(0);
  const [enemyCount, setEnemyCount] = useState(10);
  const [mapHash, setMapHash] = useState(currentMapHash);
  const [timeLimit, setTimeLimit] = useState(currentTimeLimit);
  const [objective, setObjective] = useState<SquadObjective>("wipe-out");

  const generate = () => {
    try {
      const lineup = buildSquadLineup({
        playerUnitId,
        partnerUnitId: partnerUnitId ?? undefined,
        enemyUnitId,
        enemyCount,
        mapHash,
        timeLimitSeconds: timeLimit,
        objective,
      });
      onGenerate(lineup);
      toast.success(
        t("squad.generated", {
          player: unitLabel(units, playerUnitId),
          enemies: `${enemyCount} × ${unitLabel(units, enemyUnitId)}`,
        }),
      );
    } catch (error) {
      toast.error(t("squad.failed", { message: String(error instanceof Error ? error.message : error) }));
    }
  };

  const canGenerate = !disabled && playerUnitId > 0 && enemyUnitId > 0 && enemyCount > 0;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground" style={{ textWrap: "pretty" }}>
        {t("squad.description")}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t("squad.playerUnit")}</Label>
          <UnitSelect
            value={playerUnitId}
            units={units}
            disabled={disabled}
            placeholder={t("squad.playerUnit")}
            onChange={setPlayerUnitId}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t("squad.partnerUnit")}</Label>
          <div className="flex gap-2">
            <Select
              value={partnerUnitId === null ? NO_PARTNER : "unit"}
              onValueChange={(value) => setPartnerUnitId(value === NO_PARTNER ? null : playerUnitId)}
              disabled={disabled}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARTNER}>{t("squad.noPartner")}</SelectItem>
                <SelectItem value="unit">{t("slots.teamPlayer")}</SelectItem>
              </SelectContent>
            </Select>
            {partnerUnitId !== null ? (
              <div className="min-w-0 flex-1">
                <UnitSelect
                  value={partnerUnitId}
                  units={units}
                  disabled={disabled}
                  placeholder={t("squad.partnerUnit")}
                  onChange={setPartnerUnitId}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t("squad.enemyUnit")}</Label>
          <UnitSelect
            value={enemyUnitId}
            units={units}
            disabled={disabled}
            placeholder={t("squad.enemyUnit")}
            onChange={setEnemyUnitId}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t("squad.enemyCount")}</Label>
          <Input
            type="number"
            min={1}
            max={MAX_ENEMY_SIDE_UNITS}
            value={enemyCount}
            disabled={disabled}
            onChange={(event) => setEnemyCount(Number(event.target.value) || 0)}
          />
          <p className="text-[11px] text-muted-foreground">
            {t("squad.enemyCountHint", { max: MAX_ENEMY_SIDE_UNITS })}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t("squad.map")}</Label>
          <Select
            value={String(mapHash >>> 0)}
            onValueChange={(value) => setMapHash(Number(value) >>> 0)}
            disabled={disabled}
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
          <Label className="text-xs">{t("squad.timeLimit")}</Label>
          <Input
            type="number"
            min={1}
            value={timeLimit}
            disabled={disabled}
            onChange={(event) => setTimeLimit(Number(event.target.value) || 0)}
          />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label className="text-xs">{t("squad.objective")}</Label>
          <Select
            value={objective}
            onValueChange={(value) => setObjective(value as SquadObjective)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wipe-out">{t("squad.objectiveWipeOut")}</SelectItem>
              <SelectItem value="destroy-targets">{t("squad.objectiveTargets")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" onClick={generate} disabled={!canGenerate} className="self-start">
        {t("squad.generate")}
      </Button>
    </section>
  );
}
