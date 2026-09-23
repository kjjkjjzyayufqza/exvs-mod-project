import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { sourceModelKey, loadMissionSourceAtPath, type MissionSourceFile } from "@/services/missionGraph/sourceFile";
import { runGraphTask } from "@/services/missionGraph/workerClient";
import {
  commitSpawnTransform,
  markersFromGraph,
  slotUsesExternalCoordinates,
  type SpawnTransform,
} from "@/services/missionGraph/spawnMarkers";
import { useMissionGraphHistory } from "@/page/MissionNodeEditor/hooks/useMissionGraphHistory";
import type { MissionNodeEditorHost } from "@/page/MissionNodeEditor/page";
import type { MissionPreviewController } from "./useMissionPreview";

export type MissionEditorSurface = "hidden" | "open" | "minimized";
type DiscardReason = "pick" | "clear" | "replace";

function samePath(left: string, right: string): boolean {
  return left.replaceAll("\\", "/").toLowerCase() === right.replaceAll("\\", "/").toLowerCase();
}

/**
 * One mission graph shared by the map markers and the fullscreen node editor.
 * Spawn drags and the unit number fields both write that slot's Spawn X/Y/Z words.
 */
export function useMissionAuthoringSession(preview: MissionPreviewController) {
  const { t } = useTranslation("scene-mission-preview");
  const history = useMissionGraphHistory();
  const task = useRef<ReturnType<typeof runGraphTask> | null>(null);
  const [file, setFile] = useState<MissionSourceFile | null>(null);
  const [surface, setSurface] = useState<MissionEditorSurface>("hidden");
  const [discardReason, setDiscardReason] = useState<DiscardReason | null>(null);
  const fileRef = useRef(file);
  const dirtyRef = useRef(false);
  fileRef.current = file;

  const modelKey = sourceModelKey(history.graph);
  const dirty = !!file && modelKey !== file.savedModel;
  dirtyRef.current = dirty;

  const setSuspendHotReload = preview.setSuspendHotReload;
  const setExternalChangeHandler = preview.setExternalChangeHandler;
  useEffect(() => {
    setSuspendHotReload(!!file && dirty);
  }, [dirty, file, setSuspendHotReload]);

  useEffect(() => {
    setExternalChangeHandler((path) => {
      if (!fileRef.current || dirtyRef.current) return;
      void loadMissionSourceAtPath(path, task).then((loaded) => {
        if (!fileRef.current || dirtyRef.current) return;
        if (!samePath(fileRef.current.path, loaded.file.path)) return;
        history.replace(loaded.graph);
        setFile(loaded.file);
      }).catch((error: unknown) => {
        toast.error(String(error));
      });
    });
    return () => setExternalChangeHandler(null);
  }, [history.replace, setExternalChangeHandler]);

  const resetSession = useCallback(() => {
    setFile(null);
    setSurface("hidden");
    task.current?.cancel();
  }, []);

  const loadPath = useCallback(async (path: string) => {
    try {
      const loaded = await loadMissionSourceAtPath(path, task);
      history.replace(loaded.graph);
      setFile(loaded.file);
      setSurface("open");
    } catch (error) {
      toast.error(String(error));
    }
  }, [history]);

  const openFromPreview = useCallback(async () => {
    const path = preview.scriptPath;
    if (!path || preview.preview?.sourceKind !== "decompiledC") return;
    if (file && samePath(file.path, path)) {
      setSurface("open");
      return;
    }
    if (file && dirty) {
      setDiscardReason("replace");
      return;
    }
    await loadPath(path);
  }, [dirty, file, loadPath, preview.preview?.sourceKind, preview.scriptPath]);

  const requestPickScript = useCallback(async () => {
    if (file && dirty) {
      setDiscardReason("pick");
      return;
    }
    resetSession();
    await preview.pickScript();
  }, [dirty, file, preview, resetSession]);

  const requestClear = useCallback(() => {
    if (file && dirty) {
      setDiscardReason("clear");
      return;
    }
    resetSession();
    preview.clear();
  }, [dirty, file, preview, resetSession]);

  const confirmDiscard = useCallback(() => {
    const reason = discardReason;
    setDiscardReason(null);
    resetSession();
    if (reason === "clear") preview.clear();
    if (reason === "pick") void preview.pickScript();
    if (reason === "replace" && preview.scriptPath) void loadPath(preview.scriptPath);
  }, [discardReason, loadPath, preview, resetSession]);

  const onSaved = useCallback(async (saved: MissionSourceFile) => {
    preview.setSuspendHotReload(true);
    try {
      await preview.watchFile(saved.path);
    } catch (error) {
      toast.error(String(error));
    }
  }, [preview]);

  const onAttached = useCallback((attached: MissionSourceFile) => {
    void preview.watchFile(attached.path).catch((error: unknown) => {
      toast.error(String(error));
    });
  }, [preview]);

  const commitSpawn = useCallback((slot: number, transform: SpawnTransform) => {
    if (!fileRef.current) return;
    if (slotUsesExternalCoordinates(history.graph, slot)) {
      toast.message(t("spawn.externalLocked"));
      return;
    }
    const next = commitSpawnTransform(history.graph, slot, transform);
    if (!next) return;
    history.change(next, true);
  }, [history, t]);

  const selectSlot = useCallback((slot: number | null) => {
    preview.setSelectedSlot(slot);
    if (slot !== null && fileRef.current && slotUsesExternalCoordinates(history.graph, slot)) {
      toast.message(t("spawn.externalLocked"));
    }
  }, [history.graph, preview, t]);

  const markers = file ? markersFromGraph(history.graph) : null;

  const host: MissionNodeEditorHost | null = useMemo(() => {
    if (!file) return null;
    return {
      file,
      setFile,
      graph: history.graph,
      change: history.change,
      travel: history.travel,
      replace: history.replace,
      saveCheckpoint: history.saveCheckpoint,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      focusSlot: preview.selectedSlot ?? undefined,
      onFocusSlot: preview.setSelectedSlot,
      onSaved,
      onAttached,
    };
  }, [file, history, onAttached, onSaved, preview.selectedSlot, preview.setSelectedSlot]);

  return {
    file,
    dirty,
    surface,
    markers,
    host,
    discardOpen: discardReason !== null,
    cancelDiscard: () => setDiscardReason(null),
    confirmDiscard,
    openFromPreview,
    requestPickScript,
    requestClear,
    minimize: () => setSurface("minimized"),
    restore: () => setSurface("open"),
    close: () => setSurface("hidden"),
    commitSpawn,
    selectSlot,
    canDragSlot: (slot: number) => !!file && !slotUsesExternalCoordinates(history.graph, slot),
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: () => history.travel("undo"),
    redo: () => history.travel("redo"),
  };
}
