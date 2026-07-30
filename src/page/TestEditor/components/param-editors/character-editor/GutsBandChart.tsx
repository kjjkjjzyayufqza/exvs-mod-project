import { useMemo, useState } from "react";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  buildGutsBandViews,
  findActiveGutsBandIndex,
} from "./characterVisualizerHelpers";

interface GutsBandChartProps {
  entry: TypedParamEntry;
}

const CHART_HEIGHT_PX = 88;

/**
 * Phase 3.2: HP-band incoming-damage multiplier ("guts") visualization.
 * Mirrors sub_1405F8E70: HP > 50% is a hardcoded 1.0; below that, ten
 * 5%-wide bands each supply value * 0.01 as the incoming-damage multiplier.
 */
export function GutsBandChart({ entry }: GutsBandChartProps) {
  const [hpPct, setHpPct] = useState(100);

  const bands = useMemo(() => buildGutsBandViews(entry), [entry]);
  const activeIndex = findActiveGutsBandIndex(bands, hpPct);
  const activeBand = activeIndex >= 0 ? bands[activeIndex] : undefined;

  const bandFieldsPresent = bands.some(
    (band) => !band.isEngineConstant && band.multiplier !== null,
  );

  const maxMultiplier = Math.max(
    1,
    ...bands
      .filter((band) => band.multiplier !== null)
      .map((band) => band.multiplier as number),
  );

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
        Guts Bands (incoming-damage multiplier by HP)
      </h4>

      {!bandFieldsPresent ? (
        <div className="text-[10px] text-amber-700 dark:text-amber-400">
          field unavailable: no lowDurabilityIncomingDamageMultiplierBand
          fields are present in this entry.
        </div>
      ) : (
        <>
          <div
            className="flex w-full items-end gap-px"
            style={{ height: CHART_HEIGHT_PX }}
          >
            {bands.map((band, index) => {
              const widthPct = band.maxHpPct - band.minHpPct;
              const isActive = index === activeIndex;
              const title =
                band.multiplier !== null
                  ? `${band.minHpPct}-${band.maxHpPct}% HP: x${band.multiplier.toFixed(2)} (${band.key})`
                  : `${band.minHpPct}-${band.maxHpPct}% HP: field unavailable (${band.key})`;
              if (band.multiplier === null) {
                return (
                  <div
                    key={band.key}
                    title={title}
                    className="h-full rounded-sm border border-dashed border-amber-700/60 dark:border-amber-400/60"
                    style={{ width: `${widthPct}%` }}
                  />
                );
              }
              const heightPct = (band.multiplier / maxMultiplier) * 100;
              return (
                <div
                  key={band.key}
                  title={title}
                  className="flex h-full items-end"
                  style={{ width: `${widthPct}%` }}
                >
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: "hsl(var(--primary))",
                      opacity: isActive ? 1 : 0.3,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground">HP</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={hpPct}
              onChange={(e) => setHpPct(Number(e.target.value))}
              className="h-1.5 flex-1"
              style={{ accentColor: "hsl(var(--primary))" }}
              aria-label="HP percentage"
            />
            <span className="w-9 font-mono tabular-nums">{hpPct}%</span>
          </div>

          {activeBand && (
            <div className="mt-1.5 flex items-center gap-2 rounded-sm border border-border/60 bg-muted/30 px-2 py-1 text-[10px]">
              <span className="text-muted-foreground">
                Band {activeBand.minHpPct}-{activeBand.maxHpPct}%
              </span>
              {activeBand.multiplier !== null ? (
                <span className="font-mono font-medium tabular-nums">
                  x{activeBand.multiplier.toFixed(2)}
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">
                  field unavailable ({activeBand.key})
                </span>
              )}
              {activeBand.isEngineConstant && (
                <span className="text-[9px] text-muted-foreground">
                  engine constant above 50%
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
