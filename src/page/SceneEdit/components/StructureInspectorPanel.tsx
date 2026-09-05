import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Layers, RefreshCw, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExvsStructureViewer, type ExvsStructureData } from "./ExvsStructureViewer";
import { resolveStagePackStructureTarget } from "../utils/sceneStageStructure";

async function readFirstExistingStructureJson(
  candidates: readonly string[],
): Promise<string> {
  let lastError: unknown;
  for (const structurePath of candidates) {
    try {
      return await readTextFile(structurePath);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Stage pack structure JSON not found. Tried: ${candidates.join(", ")}`,
    { cause: lastError },
  );
}

interface StructureInspectorPanelProps {
  stageRoot: string | null;
}

export function StructureInspectorPanel({ stageRoot }: StructureInspectorPanelProps) {
  const { t } = useTranslation("scene-stage-dialogs");
  const [data, setData] = useState<ExvsStructureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStructure = useCallback(async () => {
    if (!stageRoot) return;
    setLoading(true);
    setError(null);
    try {
      const target = resolveStagePackStructureTarget(stageRoot);
      const json = await readFirstExistingStructureJson(target.structurePathCandidates);
      setData(JSON.parse(json) as ExvsStructureData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [stageRoot]);

  useEffect(() => {
    if (stageRoot) loadStructure();
  }, [stageRoot, loadStructure]);

  if (!stageRoot) {
    return (
      <div className="flex min-w-0 w-full max-w-full flex-col items-center justify-center h-full text-muted-foreground p-4 gap-3">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
          <FolderOpen className="h-5 w-5 opacity-40" />
        </div>
        <div className="text-center space-y-1 min-w-0 w-full px-1">
          <p className="text-xs font-medium break-words">{t("inspector.noStage")}</p>
          <p className="text-[10px] opacity-60 leading-relaxed break-words">
            {t("inspector.openFolder")}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <Layers className="h-5 w-5 text-muted-foreground opacity-40" />
        <p className="text-[10px] text-muted-foreground text-center max-w-[200px]">{error}</p>
        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={loadStructure}>
          <RefreshCw className="h-3 w-3 mr-1" />
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return <ExvsStructureViewer data={data} />;
}
