import { useEffect, useMemo, useState, useTransition } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Database,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConfigStore } from "@/store/configStore";
import type { TypedParamFile } from "../param-editor/typedParamTypes";
import {
  BULLET_PREVIEW_PHYSICS_KEYS,
  readNumericField,
  type BulletPreviewPhysicsKey,
} from "./bulletPreviewTypes";
import { decodeHitEffectHash } from "./hitEffectLabels";
import { MOVE_TYPE_LABELS } from "./TrajectorySimulator";
import { useBulletPreviewStore } from "./bulletPreviewStore";

const BULLETPARAM_PATH_KEY = "bulletPreview.v1.fp.bulletparam";

const TUNING_FIELDS: Array<{
  key: BulletPreviewPhysicsKey;
  label: string;
  step: number;
}> = [
  { key: "initialSpeed", label: "Initial speed", step: 0.1 },
  { key: "speedAcceleration", label: "Acceleration", step: 0.01 },
  { key: "gravityRate", label: "Gravity", step: 0.001 },
  { key: "homingStrength", label: "Homing strength", step: 0.01 },
  { key: "turnRate", label: "Turn rate", step: 0.1 },
  { key: "homingDuration", label: "Homing duration", step: 1 },
  { key: "lifetime", label: "Lifetime", step: 1 },
  { key: "maxRange", label: "Max range", step: 0.5 },
  { key: "effectiveRange", label: "Effective range", step: 0.5 },
  { key: "blastRadius", label: "Blast radius", step: 0.1 },
  { key: "launchAngleHorizontal", label: "Launch yaw", step: 0.1 },
  { key: "elevationAngle", label: "Launch pitch", step: 0.1 },
];

function numberInputValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

export function BulletPreviewControls() {
  const getSetting = useConfigStore((s) => s.getSetting);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [isFilterPending, startFilterTransition] = useTransition();

  const dataset = useBulletPreviewStore((s) => s.dataset);
  const externalEntry = useBulletPreviewStore((s) => s.externalEntry);
  const rows = useBulletPreviewStore((s) => s.rows);
  const filteredRows = useBulletPreviewStore((s) => s.filteredRows);
  const selectedSourceIndex = useBulletPreviewStore((s) => s.selectedSourceIndex);
  const selectedRow = useBulletPreviewStore((s) => s.selectedRow);
  const activeEntry = useBulletPreviewStore((s) => s.activeEntry);
  const filter = useBulletPreviewStore((s) => s.filter);
  const scenario = useBulletPreviewStore((s) => s.scenario);
  const trajectory = useBulletPreviewStore((s) => s.trajectory);
  const physicsOverrides = useBulletPreviewStore((s) => s.physicsOverrides);

  const setDataset = useBulletPreviewStore((s) => s.setDataset);
  const setFilter = useBulletPreviewStore((s) => s.setFilter);
  const selectFilteredRow = useBulletPreviewStore((s) => s.selectFilteredRow);
  const setPhysicsOverride = useBulletPreviewStore((s) => s.setPhysicsOverride);
  const resetPhysicsOverrides = useBulletPreviewStore((s) => s.resetPhysicsOverrides);
  const setScenario = useBulletPreviewStore((s) => s.setScenario);
  const resetWorkbench = useBulletPreviewStore((s) => s.resetWorkbench);

  useEffect(() => {
    void (async () => {
      const stored = await getSetting<string>(BULLETPARAM_PATH_KEY);
      if (typeof stored === "string" && stored) setCurrentPath(stored);
    })();
  }, [getSetting]);

  useEffect(() => {
    setSearchDraft(filter.search);
  }, [filter.search]);

  const baseEntry = dataset ? selectedRow?.entry ?? null : externalEntry;
  const overrideCount = Object.keys(physicsOverrides).length;

  const moveTypeOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((row) => row.moveType)));
    values.sort((a, b) => a - b);
    return values;
  }, [rows]);

  const seriesOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      if (row.hitEffectParts?.series) values.add(row.hitEffectParts.series);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const unitOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      if (filter.series !== "all" && row.hitEffectParts?.series !== filter.series) continue;
      if (row.hitEffectParts?.unit) values.add(row.hitEffectParts.unit);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows, filter.series]);

  const variantOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      if (filter.series !== "all" && row.hitEffectParts?.series !== filter.series) continue;
      if (filter.unit !== "all" && row.hitEffectParts?.unit !== filter.unit) continue;
      if (row.hitEffectParts?.variant) values.add(row.hitEffectParts.variant);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows, filter.series, filter.unit]);

  const loadBulletparam = async (path: string) => {
    if (!path.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<TypedParamFile>("parse_typed_param_file", {
        path,
        paramType: "bulletparam",
      });
      setDataset({
        path,
        fileType: "bulletparam",
        entries: data.entries,
        entryIds: data.entryIds,
      });
      toast.success(`Loaded ${data.entries.length} bullet rows.`);
    } catch (e) {
      const message = String(e);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const sourceSummary = dataset
    ? `Loaded from ${dataset.path}`
    : externalEntry
      ? "Using linked entry from Param Editor"
      : "No active bullet source";

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/60 bg-background">
      <div className="space-y-3 border-b border-border/60 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Bullet Workbench</h2>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[10px]"
            onClick={resetWorkbench}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset All
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Single-page flow: load bulletparam, choose weapon/shot row, tune values, inspect trajectory immediately.
        </p>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Bulletparam file</Label>
          <div className="flex items-center gap-1">
            <FilePathInput
              className="h-8 font-mono text-[11px]"
              storeKey={BULLETPARAM_PATH_KEY}
              value={currentPath}
              onChange={(event) => setCurrentPath(event.target.value)}
              picker={{
                kind: "file",
                title: "Select bulletparam file",
                filters: [{ name: "Param", extensions: ["bin"] }],
              }}
              onPickedValue={(value) => {
                const path = Array.isArray(value) ? value[0] : value;
                if (typeof path === "string" && path) {
                  setCurrentPath(path);
                  void loadBulletparam(path);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 px-2 text-[10px]"
              disabled={loading || !currentPath.trim()}
              onClick={() => void loadBulletparam(currentPath)}
            >
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Load"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2 text-[10px]"
              disabled={!dataset}
              onClick={() => setDataset(null)}
            >
              Clear
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">{sourceSummary}</p>
          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-border/60 px-3 py-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Search entry</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(event) => {
                const next = event.target.value;
                setSearchDraft(next);
                startFilterTransition(() => setFilter({ search: next }));
              }}
              className="h-8 pl-7 text-[11px]"
              placeholder="id / hash / field..."
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Move type</Label>
            <Select
              value={filter.moveType === "all" ? "all" : String(filter.moveType)}
              onValueChange={(value) =>
                setFilter({
                  moveType: value === "all" ? "all" : Number(value),
                })
              }
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {moveTypeOptions.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {MOVE_TYPE_LABELS[value] ?? `Type ${value}`} ({value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Series</Label>
            <Select
              value={filter.series}
              onValueChange={(value) =>
                setFilter({
                  series: value,
                  unit: "all",
                  variant: "all",
                })
              }
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {seriesOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Unit</Label>
            <Select
              value={filter.unit}
              onValueChange={(value) =>
                setFilter({
                  unit: value,
                  variant: "all",
                })
              }
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {unitOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Variant</Label>
            <Select value={filter.variant} onValueChange={(value) => setFilter({ variant: value })}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {variantOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {isFilterPending ? "Filtering..." : `${filteredRows.length} / ${rows.length} rows`}
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <div className="overflow-hidden rounded-md border border-border/70">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-2 py-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                Weapon / Shot rows
              </div>
              <span className="text-[10px] text-muted-foreground">click to preview</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredRows.length === 0 ? (
                <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                  No rows match current filters.
                </div>
              ) : (
                filteredRows.map((row, index) => {
                  const selected = row.sourceIndex === selectedSourceIndex;
                  const moveLabel = MOVE_TYPE_LABELS[row.moveType] ?? `Type ${row.moveType}`;
                  return (
                    <button
                      key={`${row.sourceIndex}-${row.entryId}`}
                      type="button"
                      className={`w-full border-b border-border/40 px-2 py-2 text-left transition-colors last:border-b-0 ${
                        selected ? "bg-primary/10" : "hover:bg-muted/30"
                      }`}
                      onClick={() => selectFilteredRow(index)}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-foreground">{row.entryId}</span>
                        <span className="text-muted-foreground">#{row.sourceIndex}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                        <span>{moveLabel}</span>
                        <span className="font-mono">{row.hitEffectHash}</span>
                        <span>{decodeHitEffectHash(row.hitEffectHash)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border/70 p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                Live tuning
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                disabled={overrideCount === 0}
                onClick={resetPhysicsOverrides}
              >
                Reset ({overrideCount})
              </Button>
            </div>
            {!baseEntry ? (
              <p className="text-[10px] text-muted-foreground">
                Load bulletparam and select one row to tune.
              </p>
            ) : (
              <div className="space-y-1.5">
                {TUNING_FIELDS.map((field) => {
                  const baseValue = readNumericField(baseEntry, field.key);
                  const override = physicsOverrides[field.key];
                  const nextValue = override ?? baseValue;
                  return (
                    <div key={field.key} className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-medium">{field.label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          base {baseValue}
                          {override !== undefined ? ` -> override ${override}` : ""}
                        </p>
                      </div>
                      <Input
                        type="number"
                        step={field.step}
                        value={numberInputValue(nextValue)}
                        className="h-7 font-mono text-[11px]"
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (!raw.trim()) {
                            setPhysicsOverride(field.key, Number.NaN);
                            return;
                          }
                          const parsed = Number(raw);
                          if (Number.isFinite(parsed)) setPhysicsOverride(field.key, parsed);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border/70 p-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              Target scenario
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Distance Z</Label>
                <Input
                  type="number"
                  step={5}
                  value={numberInputValue(scenario.targetDistance)}
                  className="h-7 font-mono text-[11px]"
                  onChange={(event) =>
                    setScenario({
                      targetDistance: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Height Y</Label>
                <Input
                  type="number"
                  step={0.5}
                  value={numberInputValue(scenario.targetHeight)}
                  className="h-7 font-mono text-[11px]"
                  onChange={(event) =>
                    setScenario({
                      targetHeight: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Offset X</Label>
                <Input
                  type="number"
                  step={0.5}
                  value={numberInputValue(scenario.targetOffsetX)}
                  className="h-7 font-mono text-[11px]"
                  onChange={(event) =>
                    setScenario({
                      targetOffsetX: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-1 rounded-md border border-border/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] text-muted-foreground">Enemy lateral motion</Label>
                <Button
                  type="button"
                  size="sm"
                  variant={scenario.enemyLateralMotionEnabled ? "secondary" : "outline"}
                  className="h-6 px-2 text-[10px]"
                  onClick={() =>
                    setScenario({
                      enemyLateralMotionEnabled: !scenario.enemyLateralMotionEnabled,
                    })
                  }
                >
                  {scenario.enemyLateralMotionEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Amplitude X</Label>
                  <Input
                    type="number"
                    step={0.5}
                    value={numberInputValue(scenario.enemyLateralAmplitude)}
                    disabled={!scenario.enemyLateralMotionEnabled}
                    className="h-7 font-mono text-[11px]"
                    onChange={(event) =>
                      setScenario({
                        enemyLateralAmplitude: Number(event.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Period (frames)</Label>
                  <Input
                    type="number"
                    step={1}
                    min={2}
                    value={numberInputValue(scenario.enemyLateralPeriodFrames)}
                    disabled={!scenario.enemyLateralMotionEnabled}
                    className="h-7 font-mono text-[11px]"
                    onChange={(event) =>
                      setScenario({
                        enemyLateralPeriodFrames: Math.max(
                          2,
                          Math.round(Number(event.target.value) || 2),
                        ),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Phase (deg)</Label>
                  <Input
                    type="number"
                    step={1}
                    value={numberInputValue(scenario.enemyLateralPhaseDeg)}
                    disabled={!scenario.enemyLateralMotionEnabled}
                    className="h-7 font-mono text-[11px]"
                    onChange={(event) =>
                      setScenario({
                        enemyLateralPhaseDeg: Number(event.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
            </div>
            {trajectory?.warnings?.length ? (
              <div className="space-y-0.5 text-[10px] leading-relaxed text-amber-400/95">
                {trajectory.warnings.slice(0, 3).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-border/70 p-2">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Covered physics keys: {BULLET_PREVIEW_PHYSICS_KEYS.join(", ")}
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
