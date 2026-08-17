import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Save,
  Play,
  Pause,
  RotateCcw,
  Crosshair,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { EntryListPanel } from "../shared/EntryListPanel";
import { EditorStatusBar } from "../shared/EditorStatusBar";
import { BulletTrajectoryCanvas } from "./BulletTrajectoryCanvas";
import { BulletCrossRefPanel } from "./BulletCrossRefPanel";
import { useBulletEditorStore } from "./BulletEditorStore";
import { getMoveTypeLabel } from "@/lib/gameAlgorithms/moveTypes";
import { formatHash } from "@/models/commandTable";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";
import type { EditorEntryRow } from "../shared/types";

const STORE_KEY = "paramEditors.v2.fp.bulletparam";
const ARMS_STORE_KEY = "paramEditors.v2.fp.bulletWorkbench.armsparam";
const PARAM_TYPE = "bulletparam";
const ARMS_PARAM_TYPE = "armsparam";
const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

interface BulletEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void;
  workspaceDefaultPath?: string;
}

function TimelineBar() {
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const playbackFrame = useBulletEditorStore((s) => s.playbackFrame);
  const playbackSpeed = useBulletEditorStore((s) => s.playbackSpeed);
  const isPlaying = useBulletEditorStore((s) => s.isPlaying);
  const store = useBulletEditorStore;

  const frame = Math.floor(playbackFrame);
  const elapsed = (frame / 60).toFixed(2);
  const hasHit = trajectory !== null && trajectory.hitFrame < trajectory.totalFrames;

  type VisKey = "trail" | "fullPathGhost" | "hitbox" | "maxRangeAtTarget" | "effectiveRangeAtOrigin" | "blastRadius" | "playerDummy" | "enemyDummy" | "distanceMeasure" | "axisHelpers";
  const visualization = useBulletEditorStore((s) => s.visualization);
  const toggleLayer = (key: VisKey) => {
    store.getState().setVisualization({ [key]: !visualization[key] });
  };

  return (
    <div className="border-t border-border/60 bg-background/95">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-[10px] text-muted-foreground">
        {trajectory ? (
          <>
            <span className="font-medium text-foreground">{trajectory.moveTypeLabel}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                trajectory.inductionActive
                  ? "bg-orange-500/20 text-orange-300"
                  : "bg-sky-500/20 text-sky-300"
              }`}
            >
              {trajectory.inductionActive ? "Induction ON" : "No induction"}
            </span>
            <span>
              frame <span className="font-mono text-foreground">{frame}</span>/
              {trajectory.totalFrames}
            </span>
            <span>{elapsed}s</span>
            {hasHit && (
              <span className="text-amber-400/95">intercept ~ frame {trajectory.hitFrame}</span>
            )}
          </>
        ) : (
          <span>No trajectory</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-border/40 px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          type="button"
          onClick={() => store.getState().togglePlayback()}
          disabled={!trajectory}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          type="button"
          onClick={() => store.getState().setPlaybackFrame(0)}
          disabled={!trajectory}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2 text-[10px]"
          type="button"
          disabled={!hasHit}
          onClick={() => store.getState().seekToHitFrame()}
        >
          <Crosshair className="h-3.5 w-3.5" />
          Hit
        </Button>

        {trajectory && (
          <input
            type="range"
            min={0}
            max={Math.max(trajectory.totalFrames - 1, 0)}
            value={Math.min(frame, Math.max(trajectory.totalFrames - 1, 0))}
            onChange={(e) => store.getState().setPlaybackFrame(Number(e.target.value))}
            className="mx-1 h-1.5 min-w-[140px] flex-1 cursor-pointer accent-orange-500"
          />
        )}

        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => store.getState().setPlaybackSpeed(speed)}
              className={`rounded px-2 py-1 transition-colors ${
                playbackSpeed === speed
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "hover:bg-muted/80"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <div className="mx-1 hidden h-5 w-px bg-border/45 lg:block" />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
          {(
            [
              ["trail", "Trail"],
              ["fullPathGhost", "Ghost"],
              ["hitbox", "Hitbox"],
              ["maxRangeAtTarget", "Max R"],
              ["effectiveRangeAtOrigin", "Eff R"],
              ["blastRadius", "Blast"],
              ["playerDummy", "Self"],
              ["enemyDummy", "Target"],
              ["distanceMeasure", "Span"],
              ["axisHelpers", "Axes"],
            ] as const
          ).map(([key, label]) => {
            const on = visualization[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleLayer(key)}
                className={`flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors ${
                  on ? "text-foreground" : "text-muted-foreground opacity-55"
                } hover:bg-muted/70`}
              >
                {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function BulletEditorView({ onUnsavedChanges, workspaceDefaultPath }: BulletEditorViewProps) {
  const [filePath, setFilePath] = useState("");
  const [armsFilePath, setArmsFilePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [armsLoading, setArmsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const data = useBulletEditorStore((s) => s.data);
  const armsData = useBulletEditorStore((s) => s.armsData);
  const selectedIndex = useBulletEditorStore((s) => s.selectedIndex);
  const selectedArmsIndex = useBulletEditorStore((s) => s.selectedArmsIndex);
  const dirty = useBulletEditorStore((s) => s.dirty);
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const validationMessages = useBulletEditorStore((s) => s.validationMessages);

  const store = useBulletEditorStore;

  useEffect(() => {
    onUnsavedChanges?.(dirty);
  }, [dirty, onUnsavedChanges]);

  const loadFile = useCallback(
    async (path: string) => {
      if (!path.trim()) return;
      setLoading(true);
      try {
        const data = await invoke<TypedParamFile>("parse_typed_param_file", {
          path,
          paramType: PARAM_TYPE,
        });
        store.getState().setData(data, path);
        toast.success(`Loaded ${PARAM_TYPE} (${data.entries.length} entries)`);
      } catch (e) {
        toast.error(`Failed to load: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [store],
  );

  const loadArmsFile = useCallback(
    async (path: string) => {
      if (!path.trim()) return;
      setArmsLoading(true);
      try {
        const data = await invoke<TypedParamFile>("parse_typed_param_file", {
          path,
          paramType: ARMS_PARAM_TYPE,
        });
        store.getState().setArmsData(data, path);
        toast.success(`Loaded ${ARMS_PARAM_TYPE} (${data.entries.length} entries)`);
      } catch (e) {
        toast.error(`Failed to load armsparam: ${e}`);
      } finally {
        setArmsLoading(false);
      }
    },
    [store],
  );

  const saveFile = async () => {
    const current = store.getState();
    if (!current.data || !current.filePath.trim()) return;
    setSaving(true);
    try {
      await invoke("build_typed_param_file", {
        dataJson: current.data,
        outputPath: current.filePath,
        paramType: PARAM_TYPE,
      });
      store.setState({ dirty: false });
      toast.success("Saved successfully");
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const renderEntryLabel = (row: EditorEntryRow) => {
    const mt =
      typeof row.entry.moveType === "number" ? Math.trunc(row.entry.moveType) : 255;
    const label = getMoveTypeLabel(mt);
    return (
      <div className="flex flex-col">
        <span className="font-mono text-[10px]">
          {formatHash(row.entryId)}
        </span>
        <span className="text-[9px] text-muted-foreground">{label}</span>
      </div>
    );
  };

  const renderArmsEntryLabel = (row: EditorEntryRow) => {
    const startup =
      typeof row.entry.startupFrame === "number" ? row.entry.startupFrame : 0;
    const shots =
      typeof row.entry.bulletCountPerShot === "number"
        ? row.entry.bulletCountPerShot
        : 1;
    return (
      <div className="flex flex-col">
        <span className="font-mono text-[10px]">
          {formatHash(row.entryId)}
        </span>
        <span className="text-[9px] text-muted-foreground">
          start {startup}f / shots {shots}
        </span>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <FilePathInput
          className="h-7 w-72 font-mono text-[11px]"
          storeKey={STORE_KEY}
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          picker={{
            kind: "file",
            title: "Select bulletparam file",
            filters: [{ name: "Param", extensions: ["bin"] }],
            defaultPath: workspaceDefaultPath,
          }}
          onPickedValue={(v) => {
            const p = Array.isArray(v) ? v[0] : v;
            if (typeof p === "string" && p) {
              setFilePath(p);
              void loadFile(p);
            }
          }}
        />
        <FilePathInput
          className="h-7 w-64 font-mono text-[11px]"
          storeKey={ARMS_STORE_KEY}
          value={armsFilePath}
          onChange={(e) => setArmsFilePath(e.target.value)}
          placeholder="Optional armsparam"
          picker={{
            kind: "file",
            title: "Select armsparam file for shooting loop",
            filters: [{ name: "Param", extensions: ["bin"] }],
            defaultPath: workspaceDefaultPath,
          }}
          onPickedValue={(v) => {
            const p = Array.isArray(v) ? v[0] : v;
            if (typeof p === "string" && p) {
              setArmsFilePath(p);
              void loadArmsFile(p);
            }
          }}
        />
        <Button
          size="sm"
          variant="default"
          className="h-7 gap-1 text-[11px]"
          onClick={saveFile}
          disabled={!dirty || saving}
        >
          <Save className="h-3 w-3" />
          {saving ? "Saving..." : "Save"}
        </Button>
        {(loading || armsLoading) && (
          <span className="text-[11px] text-muted-foreground">
            {loading ? "Loading bulletparam..." : "Loading armsparam..."}
          </span>
        )}
      </div>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Left entry list */}
        <div className="flex w-[200px] min-w-[200px] flex-col gap-2 border-r p-2">
          <div className="min-h-0 flex-1">
            <EntryListPanel
              entries={data?.entries ?? []}
              selectedIndex={selectedIndex}
              onSelect={(i) => store.getState().selectEntry(i)}
              renderLabel={renderEntryLabel}
            />
          </div>
          <div className="min-h-0 flex-1">
            {armsData ? (
              <EntryListPanel
                entries={armsData.entries}
                selectedIndex={selectedArmsIndex}
                onSelect={(i) => store.getState().selectArmsEntry(i)}
                renderLabel={renderArmsEntryLabel}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col justify-center rounded-md border bg-card px-3 text-xs text-muted-foreground shadow-sm">
                <div className="mb-1 font-semibold text-foreground">
                  Shooting Loop
                </div>
                <div>
                  Load armsparam above, then choose an arms entry to enable the shooting loop.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: 3D viewport takes remaining space */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {data ? (
              <BulletTrajectoryCanvas />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a bulletparam.bin file to begin
              </div>
            )}
          </div>
          <TimelineBar />
        </div>

        {/* Right: cross-reference sidebar */}
        {data && (
          <div className="w-[280px] min-w-[280px] overflow-y-auto border-l p-2">
            <BulletCrossRefPanel workspaceDefaultPath={workspaceDefaultPath} />
          </div>
        )}
      </div>

      <EditorStatusBar
        entryCount={data?.entries.length ?? 0}
        selectedIndex={selectedIndex}
        modifiedCount={dirty ? 1 : 0}
        validationMessages={validationMessages}
        extra={
          trajectory && <span>MoveType: {trajectory.moveTypeLabel}</span>
        }
      />
    </div>
  );
}
