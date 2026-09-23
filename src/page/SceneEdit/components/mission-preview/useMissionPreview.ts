import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { CharacterListData } from "@/models/characterListEntry";
import { trimmedConfigPath, useConfigStore } from "@/store/configStore";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import {
  buildMissionSpawnMarkers,
  loadMissionScriptPreview,
  missionScriptModifiedMs,
  type MissionScriptPreview,
  type MissionSpawnMarker,
} from "@/services/missionPreview/missionPreviewService";
import { resolveWorkspaceContentFilePath } from "@/services/testEditorWorkspace/resolveFromRoot";
import { missionPhaseKey } from "./missionPreviewTheme";

const MISSION_SCRIPT_DIALOG_PATH_KEY = "sceneEdit.missionScript";
/** Hot-reload poll interval; a stat call per tick, no parsing. */
const HOT_RELOAD_POLL_MS = 1500;
const DEFAULT_MARKER_SCALE = 12;
export const MIN_MARKER_SCALE = 2;
export const MAX_MARKER_SCALE = 60;

export interface MissionPreviewController {
  scriptPath: string | null;
  preview: MissionScriptPreview | null;
  markers: MissionSpawnMarker[];
  loading: boolean;
  error: string | null;
  /** Reason unit names could not be resolved; names fall back to the raw id. */
  unitNameError: string | null;
  hotReload: boolean;
  markerScale: number;
  showLabels: boolean;
  hiddenPhaseKeys: ReadonlySet<string>;
  visiblePhaseKeys: ReadonlySet<string> | null;
  selectedSlot: number | null;
  unitNameOf: (unitId: number) => string;
  markerLabelOf: (marker: MissionSpawnMarker) => string;
  pickScript: () => Promise<void>;
  reload: () => Promise<void>;
  clear: () => void;
  /** Skip disk polling while an authoring session has unsaved spawn edits. */
  setSuspendHotReload: (suspended: boolean) => void;
  /** Remember a mtime we already applied, so our own save is not a reload. */
  pinLoadedModifiedMs: (modifiedMs: number) => void;
  /** Point the preview at a file the node editor just attached or saved. */
  watchFile: (path: string) => Promise<void>;
  /** Fired after a poll reloads the file. The session reloads its graph when clean. */
  setExternalChangeHandler: (handler: ((path: string) => void) | null) => void;
  setHotReload: (enabled: boolean) => void;
  setMarkerScale: (scale: number) => void;
  setShowLabels: (show: boolean) => void;
  togglePhaseVisible: (phaseKey: string) => void;
  setSelectedSlot: (slot: number | null) => void;
}

/**
 * Owns the mission-script preview: the parsed script, the derived spawn
 * markers, and the display switches the viewport overlay reads.
 *
 * The script file stays the source of truth. Nothing here writes it back, and
 * `reload` re-reads it from disk, so a modder can keep the preview open while
 * editing the `.c` in another editor.
 */
export function useMissionPreview(): MissionPreviewController {
  const workspaceRoot = useConfigStore((state) => trimmedConfigPath(state.testEditorFolder));

  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<MissionScriptPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hotReload, setHotReload] = useState(true);
  const [markerScale, setMarkerScale] = useState(DEFAULT_MARKER_SCALE);
  const [showLabels, setShowLabels] = useState(true);
  const [hiddenPhaseKeys, setHiddenPhaseKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [unitNames, setUnitNames] = useState<ReadonlyMap<number, string>>(() => new Map());
  const [unitNameError, setUnitNameError] = useState<string | null>(null);

  const loadedModifiedMsRef = useRef<number | null>(null);
  const suspendHotReloadRef = useRef(false);
  const externalChangeRef = useRef<((path: string) => void) | null>(null);
  const setSuspendHotReload = useCallback((suspended: boolean) => {
    suspendHotReloadRef.current = suspended;
  }, []);
  const pinLoadedModifiedMs = useCallback((modifiedMs: number) => {
    loadedModifiedMsRef.current = modifiedMs;
  }, []);
  const setExternalChangeHandler = useCallback((handler: ((path: string) => void) | null) => {
    externalChangeRef.current = handler;
  }, []);

  const loadFromPath = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const next = await loadMissionScriptPreview(path);
      loadedModifiedMsRef.current = next.modifiedMs;
      setPreview(next);
      setError(null);
    } catch (err) {
      setPreview(null);
      loadedModifiedMsRef.current = null;
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const pickScript = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Mission Script", extensions: ["c", "mismsexc"] }],
      defaultPath: await getStoredDialogDefaultPath(MISSION_SCRIPT_DIALOG_PATH_KEY),
    });
    if (!selected || typeof selected !== "string") return;
    await rememberStoredDialogSelection(MISSION_SCRIPT_DIALOG_PATH_KEY, selected, "file");
    setScriptPath(selected);
    setSelectedSlot(null);
    setHiddenPhaseKeys(new Set<string>());
    await loadFromPath(selected);
  }, [loadFromPath]);

  const reload = useCallback(async () => {
    if (!scriptPath) return;
    await loadFromPath(scriptPath);
  }, [loadFromPath, scriptPath]);

  const watchFile = useCallback(async (path: string) => {
    setScriptPath(path);
    const modifiedMs = await missionScriptModifiedMs(path);
    loadedModifiedMsRef.current = modifiedMs;
    await loadFromPath(path);
  }, [loadFromPath]);

  const clear = useCallback(() => {
    setScriptPath(null);
    setPreview(null);
    setError(null);
    setSelectedSlot(null);
    loadedModifiedMsRef.current = null;
  }, []);

  // Hot reload: poll the file's modification time and re-parse only when it
  // actually moved. A dirty authoring session suspends this so unsaved spawn
  // points are not replaced by the copy on disk.
  useEffect(() => {
    if (!hotReload || !scriptPath) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          if (suspendHotReloadRef.current) return;
          const modifiedMs = await missionScriptModifiedMs(scriptPath);
          if (cancelled || suspendHotReloadRef.current) return;
          if (loadedModifiedMsRef.current === modifiedMs) return;
          loadedModifiedMsRef.current = modifiedMs;
          await loadFromPath(scriptPath);
          if (!cancelled) externalChangeRef.current?.(scriptPath);
        } catch (err) {
          if (!cancelled) setError(String(err));
        }
      })();
    }, HOT_RELOAD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hotReload, loadFromPath, scriptPath]);

  // Unit names come from the EXVS2 Workspace character list, resolved through
  // the workspace's own routes the way the Character List view resolves it.
  // The preview stays usable without them, so the failure is surfaced instead
  // of thrown.
  useEffect(() => {
    if (!preview || unitNames.size > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const path = await resolveWorkspaceContentFilePath(workspaceRoot, "character-list");
        const list = await invoke<CharacterListData>("parse_typed_param_file", {
          path,
          paramType: "characterlist",
        });
        if (cancelled) return;
        const map = new Map<number, string>();
        for (const entry of list.entries) {
          const name = typeof entry.characterName === "string" ? entry.characterName.trim() : "";
          if (name) map.set(entry.entryId >>> 0, name);
        }
        setUnitNames(map);
        setUnitNameError(null);
      } catch (err) {
        if (!cancelled) setUnitNameError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, unitNames.size, workspaceRoot]);

  const markers = useMemo(
    () => (preview ? buildMissionSpawnMarkers(preview.config) : []),
    [preview],
  );

  const visiblePhaseKeys = useMemo<ReadonlySet<string> | null>(() => {
    if (hiddenPhaseKeys.size === 0) return null;
    const keys = new Set<string>();
    for (const marker of markers) {
      const key = missionPhaseKey(marker.phase);
      if (!hiddenPhaseKeys.has(key)) keys.add(key);
    }
    return keys;
  }, [hiddenPhaseKeys, markers]);

  const unitNameOf = useCallback(
    (unitId: number) => unitNames.get(unitId >>> 0) ?? `ID ${unitId >>> 0}`,
    [unitNames],
  );

  const markerLabelOf = useCallback(
    (marker: MissionSpawnMarker) => `#${marker.slot} ${unitNameOf(marker.unitId)}`,
    [unitNameOf],
  );

  const togglePhaseVisible = useCallback((phaseKey: string) => {
    setHiddenPhaseKeys((prev) => {
      const next = new Set(prev);
      if (next.has(phaseKey)) next.delete(phaseKey);
      else next.add(phaseKey);
      return next;
    });
  }, []);

  return {
    scriptPath,
    preview,
    markers,
    loading,
    error,
    unitNameError,
    hotReload,
    markerScale,
    showLabels,
    hiddenPhaseKeys,
    visiblePhaseKeys,
    selectedSlot,
    unitNameOf,
    markerLabelOf,
    pickScript,
    reload,
    clear,
    setSuspendHotReload,
    pinLoadedModifiedMs,
    watchFile,
    setExternalChangeHandler,
    setHotReload,
    setMarkerScale,
    setShowLabels,
    togglePhaseVisible,
    setSelectedSlot,
  };
}
