// CANONICAL shared SSBH file-editor session manager.
//
// This hook is the single supported way to open the windowed numdlb / numatb /
// nuhlpb / jnttbl editors by file path with draft / save / reload / dirty-guard
// lifecycle. `src/page/TestEditor/page.tsx` still contains an older INLINE copy
// of this logic; that copy is LEGACY and is DEPRECATED for reuse (in particular
// for the Unit Model Editor flow). New consumers MUST use this hook and the
// matching `SsbhFileEditorHosts` component -- do not copy the TestEditor inline
// version again.

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import type { NumdlbEditorWindowSession } from "./NumdlbEditorModalWindow";
import {
  cloneNumdlbReadResult,
  assertNumdlbValidForSave,
  isNumdlbDraftDirty,
} from "./numdlbEditorUtils";
import type { NuhlpbEditorWindowSession } from "./NuhlpbEditorModalWindow";
import { cloneNuhlpbReadResult, isNuhlpbDraftDirty } from "./nuhlpbEditorUtils";
import type { JnttblEditorWindowSession } from "./JnttblEditorModalWindow";
import {
  assertJnttblValidForSave,
  cloneJnttblEditorDocument,
  computeNextJnttblDirtyState,
  readResultToEditorDocument,
  resolveJnttblBoneCountForSave,
} from "./jnttblEditorUtils";
import { jnttblReadFile, jnttblWriteFile, type JnttblEditorDocument } from "./jnttblIoService";
import {
  ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping,
  ssbhReadNuhlpb,
  ssbhWriteNuhlpb,
  ssbhTemplateReadNumatb,
  ssbhTemplateWriteNumatb,
  type NumdlbReadResult,
  type NuhlpbReadResult,
} from "./ssbhDaeIoService";
import { ensureMatlDataSerdeFields, type NumatbProfileKind } from "./daeSsbhTypes";
import type { NumatbEditorWindowSession } from "./NumatbEditorModalWindow";
import {
  buildNumatbModalBundleFromLoadedFile,
  cloneNumatbBundle,
  detectNumatbProfileFromPath,
  type NumatbModalBundle,
} from "./numatbEditorUtils";

export type SsbhEditorKind = "numdlb" | "numatb" | "nuhlpb" | "jnttbl";

/** Map a file path to its editor kind by extension, or null when unsupported. */
export function ssbhEditorKindForPath(filePath: string): SsbhEditorKind | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".numdlb")) return "numdlb";
  if (lower.endsWith(".numatb")) return "numatb";
  if (lower.endsWith(".nuhlpb")) return "nuhlpb";
  if (lower.endsWith(".jnttbl")) return "jnttbl";
  return null;
}

export type SsbhFileEditorGuard = { sessionId: string; action: "close" | "reload" } | null;

export interface UseSsbhFileEditorSessionsOptions {
  /** Called after ANY editor saves successfully, with the saved file's path. */
  onSaved?: (savedPath: string) => void;
}

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function useSsbhFileEditorSessions(options: UseSsbhFileEditorSessionsOptions = {}) {
  const onSavedRef = useRef(options.onSaved);
  onSavedRef.current = options.onSaved;

  // ---------------------------------------------------------------- numdlb ----
  const [numdlbSessions, setNumdlbSessions] = useState<NumdlbEditorWindowSession[]>([]);
  const numdlbZIndexRef = useRef(1000);
  const numdlbSessionsRef = useRef(numdlbSessions);
  numdlbSessionsRef.current = numdlbSessions;
  const [numdlbGuard, setNumdlbGuard] = useState<SsbhFileEditorGuard>(null);

  const openNumdlbSession = useCallback((filePath: string) => {
    const normalized = normalizePathKey(filePath);
    setNumdlbSessions((prev) => {
      const existing = prev.find((s) => normalizePathKey(s.filePath) === normalized);
      if (existing) {
        const nextZ = ++numdlbZIndexRef.current;
        return prev.map((s) => (s.id === existing.id ? { ...s, zIndex: nextZ } : s));
      }
      const id = crypto.randomUUID();
      const nextZ = ++numdlbZIndexRef.current;
      const newSession: NumdlbEditorWindowSession = {
        id,
        filePath,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        zIndex: nextZ,
      };
      void ssbhReadNumdlbMapping(filePath)
        .then((data) => {
          const base = cloneNumdlbReadResult(data);
          const draft = cloneNumdlbReadResult(data);
          setNumdlbSessions((p) =>
            p.map((s) =>
              s.id === id
                ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft }
                : s,
            ),
          );
        })
        .catch((err) => {
          setNumdlbSessions((p) =>
            p.map((s) => (s.id === id ? { ...s, loading: false, loadError: String(err) } : s)),
          );
        });
      return [...prev, newSession];
    });
  }, []);

  const activateNumdlbSession = useCallback((sessionId: string) => {
    setNumdlbSessions((prev) => {
      const nextZ = ++numdlbZIndexRef.current;
      return prev.map((s) => (s.id === sessionId ? { ...s, zIndex: nextZ } : s));
    });
  }, []);

  const updateNumdlbDraft = useCallback((sessionId: string, next: NumdlbReadResult) => {
    setNumdlbSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, draftData: next } : s)),
    );
  }, []);

  const saveNumdlbSession = useCallback(async (sessionId: string) => {
    const snapshot = numdlbSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot?.draftData) return;
    try {
      assertNumdlbValidForSave(snapshot.draftData);
    } catch (e) {
      toast.error(String(e));
      return;
    }
    const draft = snapshot.draftData;
    const path = snapshot.filePath;
    setNumdlbSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)));
    try {
      await ssbhWriteNumdlbMapping({
        filePath: path,
        modelName: draft.modelName,
        skeletonFileName: draft.skeletonFileName,
        materialFileNames: draft.materialFileNames,
        meshFileName: draft.meshFileName,
        animationFileName: draft.animationFileName,
        entries: draft.entries,
      });
      const saved = cloneNumdlbReadResult(draft);
      setNumdlbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, saving: false, baseData: saved, draftData: saved } : s,
        ),
      );
      toast.success("Saved NUMDLB");
      onSavedRef.current?.(path);
    } catch (e) {
      toast.error(String(e));
      setNumdlbSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetNumdlbSession = useCallback((sessionId: string) => {
    setNumdlbSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return { ...s, draftData: cloneNumdlbReadResult(s.baseData) };
      }),
    );
  }, []);

  const reloadNumdlbSession = useCallback(async (sessionId: string) => {
    let fp = "";
    setNumdlbSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      return prev.map((x) => (x.id === sessionId ? { ...x, loading: true, loadError: null } : x));
    });
    if (!fp) return;
    try {
      const data = await ssbhReadNumdlbMapping(fp);
      const base = cloneNumdlbReadResult(data);
      const draft = cloneNumdlbReadResult(data);
      setNumdlbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft }
            : s,
        ),
      );
      toast.success("Reloaded NUMDLB from disk");
    } catch (e) {
      const msg = String(e);
      setNumdlbSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, []);

  const requestCloseNumdlbSession = useCallback((sessionId: string) => {
    const s = numdlbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (isNumdlbDraftDirty(s.baseData, s.draftData)) {
      setNumdlbGuard({ sessionId, action: "close" });
      return;
    }
    setNumdlbSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const requestReloadNumdlbSession = useCallback(
    (sessionId: string) => {
      const s = numdlbSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (isNumdlbDraftDirty(s.baseData, s.draftData)) {
        setNumdlbGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadNumdlbSession(sessionId);
    },
    [reloadNumdlbSession],
  );

  const dismissNumdlbGuard = useCallback(() => setNumdlbGuard(null), []);

  const discardNumdlbGuard = useCallback(() => {
    setNumdlbGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        setNumdlbSessions((prev) => prev.filter((x) => x.id !== sessionId));
      } else {
        void reloadNumdlbSession(sessionId);
      }
      return null;
    });
  }, [reloadNumdlbSession]);

  const saveAndFinishNumdlbGuard = useCallback(async () => {
    if (!numdlbGuard) return;
    const { sessionId, action } = numdlbGuard;
    await saveNumdlbSession(sessionId);
    const s = numdlbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (isNumdlbDraftDirty(s.baseData, s.draftData)) return;
    setNumdlbGuard(null);
    if (action === "close") {
      setNumdlbSessions((prev) => prev.filter((x) => x.id !== sessionId));
    } else {
      void reloadNumdlbSession(sessionId);
    }
  }, [numdlbGuard, saveNumdlbSession, reloadNumdlbSession]);

  // ---------------------------------------------------------------- nuhlpb ----
  const [nuhlpbSessions, setNuhlpbSessions] = useState<NuhlpbEditorWindowSession[]>([]);
  const nuhlpbZIndexRef = useRef(2000);
  const nuhlpbSessionsRef = useRef(nuhlpbSessions);
  nuhlpbSessionsRef.current = nuhlpbSessions;
  const [nuhlpbGuard, setNuhlpbGuard] = useState<SsbhFileEditorGuard>(null);

  const openNuhlpbSession = useCallback((filePath: string) => {
    const normalized = normalizePathKey(filePath);
    setNuhlpbSessions((prev) => {
      const existing = prev.find((s) => normalizePathKey(s.filePath) === normalized);
      if (existing) {
        const nextZ = ++nuhlpbZIndexRef.current;
        return prev.map((s) => (s.id === existing.id ? { ...s, zIndex: nextZ } : s));
      }
      const id = crypto.randomUUID();
      const nextZ = ++nuhlpbZIndexRef.current;
      const newSession: NuhlpbEditorWindowSession = {
        id,
        filePath,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        zIndex: nextZ,
      };
      void ssbhReadNuhlpb(filePath)
        .then((data) => {
          const base = cloneNuhlpbReadResult(data);
          const draft = cloneNuhlpbReadResult(data);
          setNuhlpbSessions((p) =>
            p.map((s) =>
              s.id === id
                ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft }
                : s,
            ),
          );
        })
        .catch((err) => {
          setNuhlpbSessions((p) =>
            p.map((s) => (s.id === id ? { ...s, loading: false, loadError: String(err) } : s)),
          );
        });
      return [...prev, newSession];
    });
  }, []);

  const activateNuhlpbSession = useCallback((sessionId: string) => {
    setNuhlpbSessions((prev) => {
      const nextZ = ++nuhlpbZIndexRef.current;
      return prev.map((s) => (s.id === sessionId ? { ...s, zIndex: nextZ } : s));
    });
  }, []);

  const updateNuhlpbDraft = useCallback((sessionId: string, next: NuhlpbReadResult) => {
    setNuhlpbSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, draftData: next } : s)),
    );
  }, []);

  const saveNuhlpbSession = useCallback(async (sessionId: string) => {
    const snapshot = nuhlpbSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot?.draftData) return;
    const draft = snapshot.draftData;
    const path = snapshot.filePath;
    setNuhlpbSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)));
    try {
      await ssbhWriteNuhlpb({
        filePath: path,
        majorVersion: draft.majorVersion,
        minorVersion: draft.minorVersion,
        aimConstraints: draft.aimConstraints,
        orientConstraints: draft.orientConstraints,
      });
      const saved = cloneNuhlpbReadResult(draft);
      setNuhlpbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, saving: false, baseData: saved, draftData: saved } : s,
        ),
      );
      toast.success("Saved NUHLPB");
      onSavedRef.current?.(path);
    } catch (e) {
      toast.error(String(e));
      setNuhlpbSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetNuhlpbSession = useCallback((sessionId: string) => {
    setNuhlpbSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return { ...s, draftData: cloneNuhlpbReadResult(s.baseData) };
      }),
    );
  }, []);

  const reloadNuhlpbSession = useCallback(async (sessionId: string) => {
    let fp = "";
    setNuhlpbSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      return prev.map((x) => (x.id === sessionId ? { ...x, loading: true, loadError: null } : x));
    });
    if (!fp) return;
    try {
      const data = await ssbhReadNuhlpb(fp);
      const base = cloneNuhlpbReadResult(data);
      const draft = cloneNuhlpbReadResult(data);
      setNuhlpbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft }
            : s,
        ),
      );
      toast.success("Reloaded NUHLPB from disk");
    } catch (e) {
      const msg = String(e);
      setNuhlpbSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, []);

  const requestCloseNuhlpbSession = useCallback((sessionId: string) => {
    const s = nuhlpbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (isNuhlpbDraftDirty(s.baseData, s.draftData)) {
      setNuhlpbGuard({ sessionId, action: "close" });
      return;
    }
    setNuhlpbSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const requestReloadNuhlpbSession = useCallback(
    (sessionId: string) => {
      const s = nuhlpbSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (isNuhlpbDraftDirty(s.baseData, s.draftData)) {
        setNuhlpbGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadNuhlpbSession(sessionId);
    },
    [reloadNuhlpbSession],
  );

  const dismissNuhlpbGuard = useCallback(() => setNuhlpbGuard(null), []);

  const discardNuhlpbGuard = useCallback(() => {
    setNuhlpbGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        setNuhlpbSessions((prev) => prev.filter((x) => x.id !== sessionId));
      } else {
        void reloadNuhlpbSession(sessionId);
      }
      return null;
    });
  }, [reloadNuhlpbSession]);

  const saveAndFinishNuhlpbGuard = useCallback(async () => {
    if (!nuhlpbGuard) return;
    const { sessionId, action } = nuhlpbGuard;
    await saveNuhlpbSession(sessionId);
    const s = nuhlpbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (isNuhlpbDraftDirty(s.baseData, s.draftData)) return;
    setNuhlpbGuard(null);
    if (action === "close") {
      setNuhlpbSessions((prev) => prev.filter((x) => x.id !== sessionId));
    } else {
      void reloadNuhlpbSession(sessionId);
    }
  }, [nuhlpbGuard, saveNuhlpbSession, reloadNuhlpbSession]);

  // ---------------------------------------------------------------- jnttbl ----
  const [jnttblSessions, setJnttblSessions] = useState<JnttblEditorWindowSession[]>([]);
  const jnttblZIndexRef = useRef(3000);
  const jnttblZLayerSettersRef = useRef(new Map<string, (z: number) => void>());
  const jnttblSessionsRef = useRef(jnttblSessions);
  jnttblSessionsRef.current = jnttblSessions;
  const [jnttblGuard, setJnttblGuard] = useState<SsbhFileEditorGuard>(null);

  const registerJnttblZLayer = useCallback((sessionId: string, setZ: (z: number) => void) => {
    jnttblZLayerSettersRef.current.set(sessionId, setZ);
    return () => {
      jnttblZLayerSettersRef.current.delete(sessionId);
    };
  }, []);

  const openJnttblSession = useCallback((filePath: string) => {
    const normalized = normalizePathKey(filePath);
    setJnttblSessions((prev) => {
      const existing = prev.find((s) => normalizePathKey(s.filePath) === normalized);
      if (existing) {
        const nextZ = ++jnttblZIndexRef.current;
        queueMicrotask(() => {
          const setter = jnttblZLayerSettersRef.current.get(existing.id);
          if (setter) setter(nextZ);
        });
        return prev;
      }
      const id = crypto.randomUUID();
      const nextZ = ++jnttblZIndexRef.current;
      const newSession: JnttblEditorWindowSession = {
        id,
        filePath,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        isDirty: false,
        zIndex: nextZ,
      };
      void jnttblReadFile(filePath)
        .then((data) => {
          const doc = readResultToEditorDocument(data);
          const base = cloneJnttblEditorDocument(doc);
          const draft = cloneJnttblEditorDocument(doc);
          setJnttblSessions((p) =>
            p.map((s) =>
              s.id === id
                ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft, isDirty: false }
                : s,
            ),
          );
        })
        .catch((err) => {
          setJnttblSessions((p) =>
            p.map((s) => (s.id === id ? { ...s, loading: false, loadError: String(err) } : s)),
          );
        });
      return [...prev, newSession];
    });
  }, []);

  const activateJnttblSession = useCallback((sessionId: string) => {
    const nextZ = ++jnttblZIndexRef.current;
    const setter = jnttblZLayerSettersRef.current.get(sessionId);
    if (setter) setter(nextZ);
  }, []);

  const updateJnttblDraft = useCallback((sessionId: string, next: JnttblEditorDocument) => {
    setJnttblSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              draftData: next,
              isDirty: computeNextJnttblDirtyState({ wasDirty: s.isDirty, base: s.baseData, draft: next }),
            }
          : s,
      ),
    );
  }, []);

  const saveJnttblSession = useCallback(async (sessionId: string) => {
    const snapshot = jnttblSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot?.draftData) return;
    try {
      assertJnttblValidForSave(snapshot.draftData);
    } catch (e) {
      toast.error(String(e));
      return;
    }
    const draft = snapshot.draftData;
    const path = snapshot.filePath;
    const override = draft.nusktbPathOverride;
    setJnttblSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)));
    try {
      await jnttblWriteFile({
        filePath: path,
        version: draft.version,
        boneCount: resolveJnttblBoneCountForSave(draft),
        flag: draft.flag,
        entries: draft.entries,
      });
      const fresh = await jnttblReadFile(path);
      const doc = readResultToEditorDocument(fresh);
      const saved = cloneJnttblEditorDocument({ ...doc, nusktbPathOverride: override });
      setJnttblSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, saving: false, baseData: saved, draftData: saved, isDirty: false }
            : s,
        ),
      );
      toast.success("Saved JNTT");
      onSavedRef.current?.(path);
    } catch (e) {
      toast.error(String(e));
      setJnttblSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetJnttblSession = useCallback((sessionId: string) => {
    setJnttblSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return { ...s, draftData: cloneJnttblEditorDocument(s.baseData), isDirty: false };
      }),
    );
  }, []);

  const reloadJnttblSession = useCallback(async (sessionId: string) => {
    let fp = "";
    setJnttblSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      return prev.map((x) => (x.id === sessionId ? { ...x, loading: true, loadError: null } : x));
    });
    if (!fp) return;
    try {
      const data = await jnttblReadFile(fp);
      const doc = readResultToEditorDocument(data);
      const base = cloneJnttblEditorDocument(doc);
      const draft = cloneJnttblEditorDocument(doc);
      setJnttblSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft, isDirty: false }
            : s,
        ),
      );
      toast.success("Reloaded JNTT from disk");
    } catch (e) {
      const msg = String(e);
      setJnttblSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, []);

  const requestCloseJnttblSession = useCallback((sessionId: string) => {
    const s = jnttblSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) {
      setJnttblGuard({ sessionId, action: "close" });
      return;
    }
    setJnttblSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const requestReloadJnttblSession = useCallback(
    (sessionId: string) => {
      const s = jnttblSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (s.isDirty) {
        setJnttblGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadJnttblSession(sessionId);
    },
    [reloadJnttblSession],
  );

  const dismissJnttblGuard = useCallback(() => setJnttblGuard(null), []);

  const discardJnttblGuard = useCallback(() => {
    setJnttblGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        setJnttblSessions((prev) => prev.filter((x) => x.id !== sessionId));
      } else {
        void reloadJnttblSession(sessionId);
      }
      return null;
    });
  }, [reloadJnttblSession]);

  const saveAndFinishJnttblGuard = useCallback(async () => {
    if (!jnttblGuard) return;
    const { sessionId, action } = jnttblGuard;
    await saveJnttblSession(sessionId);
    const s = jnttblSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) return;
    setJnttblGuard(null);
    if (action === "close") {
      setJnttblSessions((prev) => prev.filter((x) => x.id !== sessionId));
    } else {
      void reloadJnttblSession(sessionId);
    }
  }, [jnttblGuard, saveJnttblSession, reloadJnttblSession]);

  // ---------------------------------------------------------------- numatb ----
  const [numatbSessions, setNumatbSessions] = useState<NumatbEditorWindowSession[]>([]);
  const [, startNumatbTransition] = useTransition();
  const numatbZIndexRef = useRef(4000);
  const numatbSessionsRef = useRef(numatbSessions);
  numatbSessionsRef.current = numatbSessions;
  const [numatbGuard, setNumatbGuard] = useState<SsbhFileEditorGuard>(null);

  const openNumatbSession = useCallback((filePath: string) => {
    const normalized = normalizePathKey(filePath);
    setNumatbSessions((prev) => {
      const existing = prev.find((s) => normalizePathKey(s.filePath) === normalized);
      if (existing) {
        const nextZ = ++numatbZIndexRef.current;
        return prev.map((s) => (s.id === existing.id ? { ...s, zIndex: nextZ } : s));
      }
      const id = crypto.randomUUID();
      const nextZ = ++numatbZIndexRef.current;
      const primaryProfile = detectNumatbProfileFromPath(filePath);
      const newSession: NumatbEditorWindowSession = {
        id,
        filePath,
        primaryProfile,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        isDirty: false,
        zIndex: nextZ,
      };
      void ssbhTemplateReadNumatb(filePath)
        .then((data) => {
          const bundle = buildNumatbModalBundleFromLoadedFile(data, primaryProfile);
          const base = cloneNumatbBundle(bundle);
          const draft = cloneNumatbBundle(bundle);
          setNumatbSessions((p) =>
            p.map((s) =>
              s.id === id
                ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft, isDirty: false }
                : s,
            ),
          );
        })
        .catch((err) => {
          setNumatbSessions((p) =>
            p.map((s) => (s.id === id ? { ...s, loading: false, loadError: String(err) } : s)),
          );
        });
      return [...prev, newSession];
    });
  }, []);

  const activateNumatbSession = useCallback((sessionId: string) => {
    setNumatbSessions((prev) => {
      const nextZ = ++numatbZIndexRef.current;
      return prev.map((s) => (s.id === sessionId ? { ...s, zIndex: nextZ } : s));
    });
  }, []);

  const updateNumatbDraft = useCallback((sessionId: string, next: NumatbModalBundle) => {
    startNumatbTransition(() => {
      setNumatbSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, draftData: next, isDirty: true } : s)),
      );
    });
  }, [startNumatbTransition]);

  const saveNumatbSession = useCallback(async (sessionId: string) => {
    const snapshot = numatbSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot?.draftData) return;
    const draft = snapshot.draftData;
    const path = snapshot.filePath;
    const matl =
      snapshot.primaryProfile === "maya"
        ? ensureMatlDataSerdeFields(draft.mayaFile)
        : ensureMatlDataSerdeFields(draft.nustFile);
    setNumatbSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)));
    try {
      await ssbhTemplateWriteNumatb(path, matl);
      const savedBundle = cloneNumatbBundle(draft);
      setNumatbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, saving: false, baseData: savedBundle, draftData: savedBundle, isDirty: false }
            : s,
        ),
      );
      toast.success("Saved NUMATB");
      onSavedRef.current?.(path);
    } catch (e) {
      toast.error(String(e));
      setNumatbSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetNumatbSession = useCallback((sessionId: string) => {
    setNumatbSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return { ...s, draftData: cloneNumatbBundle(s.baseData), isDirty: false };
      }),
    );
  }, []);

  const reloadNumatbSession = useCallback(async (sessionId: string) => {
    let fp = "";
    let profile: NumatbProfileKind = "nust";
    setNumatbSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      profile = s.primaryProfile;
      return prev.map((x) => (x.id === sessionId ? { ...x, loading: true, loadError: null } : x));
    });
    if (!fp) return;
    try {
      const data = await ssbhTemplateReadNumatb(fp);
      const bundle = buildNumatbModalBundleFromLoadedFile(data, profile);
      const base = cloneNumatbBundle(bundle);
      const draft = cloneNumatbBundle(bundle);
      setNumatbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft, isDirty: false }
            : s,
        ),
      );
      toast.success("Reloaded NUMATB from disk");
    } catch (e) {
      const msg = String(e);
      setNumatbSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, []);

  const requestCloseNumatbSession = useCallback((sessionId: string) => {
    const s = numatbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) {
      setNumatbGuard({ sessionId, action: "close" });
      return;
    }
    setNumatbSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const requestReloadNumatbSession = useCallback(
    (sessionId: string) => {
      const s = numatbSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (s.isDirty) {
        setNumatbGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadNumatbSession(sessionId);
    },
    [reloadNumatbSession],
  );

  const dismissNumatbGuard = useCallback(() => setNumatbGuard(null), []);

  const discardNumatbGuard = useCallback(() => {
    setNumatbGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        setNumatbSessions((prev) => prev.filter((x) => x.id !== sessionId));
      } else {
        void reloadNumatbSession(sessionId);
      }
      return null;
    });
  }, [reloadNumatbSession]);

  const saveAndFinishNumatbGuard = useCallback(async () => {
    if (!numatbGuard) return;
    const { sessionId, action } = numatbGuard;
    await saveNumatbSession(sessionId);
    const s = numatbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) return;
    setNumatbGuard(null);
    if (action === "close") {
      setNumatbSessions((prev) => prev.filter((x) => x.id !== sessionId));
    } else {
      void reloadNumatbSession(sessionId);
    }
  }, [numatbGuard, saveNumatbSession, reloadNumatbSession]);

  // -------------------------------------------------------------- dispatch ----
  const openEditorForPath = useCallback(
    (filePath: string): boolean => {
      const kind = ssbhEditorKindForPath(filePath);
      if (kind === "numdlb") {
        openNumdlbSession(filePath);
        return true;
      }
      if (kind === "numatb") {
        openNumatbSession(filePath);
        return true;
      }
      if (kind === "nuhlpb") {
        openNuhlpbSession(filePath);
        return true;
      }
      if (kind === "jnttbl") {
        openJnttblSession(filePath);
        return true;
      }
      return false;
    },
    [openNumdlbSession, openNumatbSession, openNuhlpbSession, openJnttblSession],
  );

  const editingPaths = useMemo(() => {
    const set = new Set<string>();
    for (const s of numdlbSessions) {
      if (s.draftData && isNumdlbDraftDirty(s.baseData, s.draftData)) set.add(normalizePathKey(s.filePath));
    }
    for (const s of nuhlpbSessions) {
      if (s.draftData && isNuhlpbDraftDirty(s.baseData, s.draftData)) set.add(normalizePathKey(s.filePath));
    }
    for (const s of jnttblSessions) {
      if (s.isDirty) set.add(normalizePathKey(s.filePath));
    }
    for (const s of numatbSessions) {
      if (s.isDirty) set.add(normalizePathKey(s.filePath));
    }
    return set;
  }, [numdlbSessions, nuhlpbSessions, jnttblSessions, numatbSessions]);

  const hostProps = {
    numdlb: {
      sessions: numdlbSessions,
      onActivateSession: activateNumdlbSession,
      onCloseRequest: requestCloseNumdlbSession,
      onReloadRequest: requestReloadNumdlbSession,
      onDraftChange: updateNumdlbDraft,
      onSave: saveNumdlbSession,
      onReset: resetNumdlbSession,
      guard: numdlbGuard,
      onGuardOpenChange: (open: boolean) => {
        if (!open) setNumdlbGuard(null);
      },
      onGuardCancel: dismissNumdlbGuard,
      onGuardDiscard: discardNumdlbGuard,
      onGuardSave: saveAndFinishNumdlbGuard,
    },
    nuhlpb: {
      sessions: nuhlpbSessions,
      onActivateSession: activateNuhlpbSession,
      onCloseRequest: requestCloseNuhlpbSession,
      onReloadRequest: requestReloadNuhlpbSession,
      onDraftChange: updateNuhlpbDraft,
      onSave: saveNuhlpbSession,
      onReset: resetNuhlpbSession,
      guard: nuhlpbGuard,
      onGuardOpenChange: (open: boolean) => {
        if (!open) setNuhlpbGuard(null);
      },
      onGuardCancel: dismissNuhlpbGuard,
      onGuardDiscard: discardNuhlpbGuard,
      onGuardSave: saveAndFinishNuhlpbGuard,
    },
    numatb: {
      sessions: numatbSessions,
      onActivateSession: activateNumatbSession,
      onCloseRequest: requestCloseNumatbSession,
      onReloadRequest: requestReloadNumatbSession,
      onDraftChange: updateNumatbDraft,
      onSave: saveNumatbSession,
      onReset: resetNumatbSession,
      guard: numatbGuard,
      onGuardOpenChange: (open: boolean) => {
        if (!open) setNumatbGuard(null);
      },
      onGuardCancel: dismissNumatbGuard,
      onGuardDiscard: discardNumatbGuard,
      onGuardSave: saveAndFinishNumatbGuard,
    },
    jnttbl: {
      sessions: jnttblSessions,
      onRegisterZLayer: registerJnttblZLayer,
      onActivateSession: activateJnttblSession,
      onCloseRequest: requestCloseJnttblSession,
      onReloadRequest: requestReloadJnttblSession,
      onDraftChange: updateJnttblDraft,
      onSave: saveJnttblSession,
      onReset: resetJnttblSession,
      guard: jnttblGuard,
      onGuardOpenChange: (open: boolean) => {
        if (!open) setJnttblGuard(null);
      },
      onGuardCancel: dismissJnttblGuard,
      onGuardDiscard: discardJnttblGuard,
      onGuardSave: saveAndFinishJnttblGuard,
    },
  };

  return {
    /** Open the correct editor for a path by extension. Returns false if unsupported. */
    openEditorForPath,
    openNumdlb: openNumdlbSession,
    openNumatb: openNumatbSession,
    openNuhlpb: openNuhlpbSession,
    openJnttbl: openJnttblSession,
    /** Normalized-lowercase paths of editors with unsaved edits. */
    editingPaths,
    /** Props bundle consumed by <SsbhFileEditorHosts/>. */
    hostProps,
  };
}

export type SsbhFileEditorHostProps = ReturnType<typeof useSsbhFileEditorSessions>["hostProps"];
