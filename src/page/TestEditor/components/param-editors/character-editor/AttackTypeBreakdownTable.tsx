import { useMemo, useState } from "react";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  buildAttackTypeRows,
  formatGameNumber,
} from "./characterVisualizerHelpers";

interface AttackTypeBreakdownTableProps {
  entry: TypedParamEntry;
}

const CORRECTION_RATE_MIN = 0;
const CORRECTION_RATE_MAX = 2;
const CORRECTION_RATE_STEP = 0.05;

function UnavailableValue() {
  return (
    <span className="text-amber-700 dark:text-amber-400">unavailable</span>
  );
}

/**
 * Phase 3.1: per-attack-type damage and cost computed with the game
 * dispatchers (sub_1405F9010 / sub_1405F9180). The correction rate feeds
 * cases 4/5/9/12; the character_list factor feeds cost case 18.
 */
export function AttackTypeBreakdownTable({
  entry,
}: AttackTypeBreakdownTableProps) {
  const [correctionRate, setCorrectionRate] = useState(1.0);
  const [baseUnitCostFactor, setBaseUnitCostFactor] = useState(1.0);

  const rows = useMemo(
    () => buildAttackTypeRows(entry, correctionRate, baseUnitCostFactor),
    [entry, correctionRate, baseUnitCostFactor],
  );

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
        Attack Type Damage / Cost
      </h4>

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">
            Correction rate (cases 4/5/9/12)
          </span>
          <input
            type="range"
            min={CORRECTION_RATE_MIN}
            max={CORRECTION_RATE_MAX}
            step={CORRECTION_RATE_STEP}
            value={correctionRate}
            onChange={(e) => setCorrectionRate(Number(e.target.value))}
            className="h-1.5 w-24"
            style={{ accentColor: "hsl(var(--primary))" }}
            aria-label="Correction rate"
          />
          <span className="w-8 font-mono tabular-nums">
            {correctionRate.toFixed(2)}
          </span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">
            character_list factor (case 18)
          </span>
          <input
            type="number"
            min={0}
            step={0.05}
            value={baseUnitCostFactor}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next >= 0) {
                setBaseUnitCostFactor(next);
              }
            }}
            className="h-5 w-14 rounded-sm border bg-background px-1 font-mono text-[10px] tabular-nums"
            aria-label="character_list factor"
          />
        </label>
      </div>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Type</th>
            <th className="py-1 pr-2 font-medium">Damage</th>
            <th className="py-1 pr-2 font-medium">Cost</th>
            <th className="py-1 font-medium">Source fields</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.attackType} className="border-b border-border/40">
              <td className="py-0.5 pr-2 whitespace-nowrap">
                <span className="font-mono text-muted-foreground">
                  {row.attackType}
                </span>{" "}
                <span>{row.label}</span>
              </td>
              <td className="py-0.5 pr-2 font-mono tabular-nums">
                {row.damage !== null ? (
                  <>
                    <span>{formatGameNumber(row.damage)}</span>
                    {row.damageUsesCorrection && (
                      <span className="ml-1 text-muted-foreground">
                        x corr
                      </span>
                    )}
                  </>
                ) : row.damageKey !== null ? (
                  <UnavailableValue />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="py-0.5 pr-2 font-mono tabular-nums">
                {row.cost !== null ? (
                  <>
                    <span>{formatGameNumber(row.cost)}</span>
                    {row.costUsesFactor && (
                      <span className="ml-1 text-muted-foreground">
                        x factor
                      </span>
                    )}
                  </>
                ) : row.costKey !== null ? (
                  <UnavailableValue />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="py-0.5 font-mono text-[9px] text-muted-foreground">
                {[row.damageKey, row.costKey]
                  .filter((key): key is string => key !== null)
                  .join(" / ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
