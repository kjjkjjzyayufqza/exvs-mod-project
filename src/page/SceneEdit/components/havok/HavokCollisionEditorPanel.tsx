import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { parseHavokXML } from "@/utils/havokXmlParser";
import type { HktSimplifyConfig } from "../dae-import/daeImportTypes";
import { DaeImportHktSimplifyFields } from "../dae-import/DaeImportHktSimplifyFields";
import { DaeImportStatusAlert } from "../dae-import/daeImportUi";
import {
  countHavokCollisionTriangles,
  DEFAULT_HKT_SIMPLIFY,
  formatTriangleCount,
} from "../../utils/hktSimplifyUtils";
import {
  sceneConfigureImport,
  sceneGenerateHkt,
  sceneGetHavokMeta,
  sceneGetImportConfig,
  type ImportConfig,
} from "../../utils/sceneSessionService";

interface HavokCollisionEditorPanelProps {
  sessionId: string | null;
  sessionImportId?: string;
  sourcePath?: string;
  sourceName?: string;
  hktSimplify?: HktSimplifyConfig;
  onHktSimplifyChange?: (next: HktSimplifyConfig) => void;
  onHavokDataUpdated?: (sourceId: string, meshData: HavokMeshData) => void;
  activeMeshData?: HavokMeshData | null;
  disabled?: boolean;
}

export function HavokCollisionEditorPanel({
  sessionId,
  sessionImportId,
  sourcePath,
  sourceName,
  hktSimplify,
  onHktSimplifyChange,
  onHavokDataUpdated,
  activeMeshData,
  disabled = false,
}: HavokCollisionEditorPanelProps) {
  const [localSimplify, setLocalSimplify] = useState<HktSimplifyConfig>(
    hktSimplify ?? { ...DEFAULT_HKT_SIMPLIFY },
  );
  const [importConfig, setImportConfig] = useState<ImportConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  useEffect(() => {
    if (hktSimplify) {
      setLocalSimplify(hktSimplify);
    }
  }, [hktSimplify]);

  useEffect(() => {
    if (!sessionId || !sessionImportId) {
      setImportConfig(null);
      return;
    }
    let cancelled = false;
    setIsLoadingConfig(true);
    sceneGetImportConfig(sessionId, sessionImportId)
      .then((cfg) => {
        if (!cancelled) {
          setImportConfig(cfg);
          if (hktSimplify == null) {
            setLocalSimplify(cfg.hktSimplify);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImportConfig(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingConfig(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionImportId, hktSimplify]);

  const handleSimplifyChange = useCallback(
    (next: HktSimplifyConfig) => {
      setLocalSimplify(next);
      onHktSimplifyChange?.(next);
    },
    [onHktSimplifyChange],
  );

  const previewImportConfig: ImportConfig = {
    loadToScene: importConfig?.loadToScene ?? false,
    convertToSsbh: importConfig?.convertToSsbh ?? false,
    generateHkt: true,
    ssbhConfig: importConfig?.ssbhConfig ?? null,
    hktSimplify: localSimplify,
  };

  const handleRegenerate = useCallback(async () => {
    if (!sessionId || !sessionImportId) {
      setRegenError("No session import linked");
      return;
    }
    setRegenerating(true);
    setRegenError(null);
    try {
      const baseConfig =
        importConfig ?? (await sceneGetImportConfig(sessionId, sessionImportId));
      const nextConfig: ImportConfig = {
        ...baseConfig,
        generateHkt: true,
        hktSimplify: localSimplify,
      };
      await sceneConfigureImport(sessionId, sessionImportId, nextConfig);
      await sceneGenerateHkt(sessionId, sessionImportId, "auto");
      const havok = await sceneGetHavokMeta(sessionId, sessionImportId);
      if (havok && onHavokDataUpdated) {
        onHavokDataUpdated(havok.sourceId, parseHavokXML(havok.hktXml));
      }
      setImportConfig(nextConfig);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegenerating(false);
    }
  }, [sessionId, sessionImportId, importConfig, localSimplify, onHavokDataUpdated]);

  if (!sessionImportId) {
    return (
      <DaeImportStatusAlert tone="info">
        Select an imported model with a session link to edit collision simplification.
      </DaeImportStatusAlert>
    );
  }

  const activeTris = activeMeshData ? countHavokCollisionTriangles(activeMeshData) : null;

  return (
    <div className="flex flex-col gap-2">
      {isLoadingConfig ? (
        <div className="flex items-center gap-2 px-1 py-1 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          Loading collision settings...
        </div>
      ) : null}

      {activeTris != null ? (
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Loaded collision</span>
            <span className="font-mono text-green-400">{formatTriangleCount(activeTris)} tris</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Use Collision / Both view mode in the toolbar to visualize the wireframe overlay.
          </p>
        </div>
      ) : (
        <DaeImportStatusAlert tone="info">
          No collision mesh loaded. Adjust simplification below and regenerate HKT.
        </DaeImportStatusAlert>
      )}

      <DaeImportHktSimplifyFields
        value={localSimplify}
        onChange={handleSimplifyChange}
        importConfig={previewImportConfig}
        sourcePath={sourcePath}
        sourceName={sourceName}
        sessionId={sessionId}
        sessionImportId={sessionImportId}
        compact
      />

      <div className="px-1">
        <Button
          type="button"
          size="sm"
          className="h-7 w-full text-[11px]"
          disabled={disabled || regenerating || isLoadingConfig || !sessionId}
          onClick={() => void handleRegenerate()}
        >
          {regenerating ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3 w-3" />
          )}
          {regenerating ? "Regenerating HKT..." : "Regenerate HKT"}
        </Button>
        {regenerating ? (
          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            Building collision mesh from source geometry...
          </p>
        ) : null}
        {regenError ? (
          <p className="mt-1 text-[10px] text-destructive">{regenError}</p>
        ) : null}
      </div>
    </div>
  );
}
