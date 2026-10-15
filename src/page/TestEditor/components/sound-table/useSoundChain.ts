import { useEffect, useState } from "react";
import { useConfigStore } from "@/store/configStore";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { resolveBgmChain, resolveVoiceChain } from "./soundChainResolve";
import type { BgmChainSnapshot, SoundFocus, VoiceChainSnapshot } from "./soundChainModel";

export function useVoiceChain(input: {
  isActive: boolean;
  workspaceRoot: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  stem: string;
  refreshKey: number;
}): { snapshot: VoiceChainSnapshot | null; loading: boolean } {
  const dplCacheDir = useConfigStore((state) => state.obDplCachePath) ?? "";
  const [snapshot, setSnapshot] = useState<VoiceChainSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const { isActive, workspaceRoot, workspaceDocument, stem, refreshKey } = input;

  useEffect(() => {
    if (!isActive || !workspaceRoot || !stem.trim()) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    resolveVoiceChain({
      workspaceRoot,
      workspaceDocument,
      dplCacheDir,
      stem,
    })
      .then((next) => {
        if (!cancel) setSnapshot(next);
      })
      .catch(() => {
        if (!cancel) setSnapshot(null);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [dplCacheDir, isActive, refreshKey, stem, workspaceDocument, workspaceRoot]);

  return { snapshot, loading };
}

export function useBgmChain(input: {
  isActive: boolean;
  workspaceRoot: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  cueHash: number;
  refreshKey: number;
}): { snapshot: BgmChainSnapshot | null; loading: boolean } {
  const dplCacheDir = useConfigStore((state) => state.obDplCachePath) ?? "";
  const [snapshot, setSnapshot] = useState<BgmChainSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const { isActive, workspaceRoot, workspaceDocument, cueHash, refreshKey } = input;

  useEffect(() => {
    if (!isActive || !workspaceRoot || (cueHash >>> 0) === 0) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    resolveBgmChain({
      workspaceRoot,
      workspaceDocument,
      dplCacheDir,
      cueHash,
    })
      .then((next) => {
        if (!cancel) setSnapshot(next);
      })
      .catch(() => {
        if (!cancel) setSnapshot(null);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [cueHash, dplCacheDir, isActive, refreshKey, workspaceDocument, workspaceRoot]);

  return { snapshot, loading };
}

export function sameSoundFocus(left: SoundFocus | null, right: SoundFocus | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.tab === right.tab &&
    left.voiceStem === right.voiceStem &&
    left.voiceKey === right.voiceKey &&
    left.cueHash === right.cueHash
  );
}
