import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  TEXTURE_PREVIEW_SLOT_META,
  type TexturePreviewSlotKey,
} from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import {
  buildMatlLookup,
  buildTextureRefToPathMap,
  resolveMaterialBinding,
  buildDrawListFromBundle,
} from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";

interface ModelTextureInfo {
  slot: TexturePreviewSlotKey;
  label: string;
  path: string | null;
  loaded: boolean;
  resolution: string | null;
}

function collectModelTextures(
  bundle: SsbhModelPreviewBundle,
  textureDataMap: NutexbTextureDataMap,
): ModelTextureInfo[] {
  const results: ModelTextureInfo[] = [];
  const seen = new Set<string>();

  try {
    const modl = bundle.modl as any;
    const mesh = bundle.mesh as any;
    const skel = bundle.skel as any;
    if (!modl || !mesh) return results;

    const draws = buildDrawListFromBundle(modl, mesh, skel ?? undefined);
    const matlLookup = buildMatlLookup(bundle.matl as any);
    const refMap = buildTextureRefToPathMap(bundle);

    for (const draw of draws) {
      const binding = resolveMaterialBinding(draw.materialLabel, matlLookup, refMap);
      const paths = binding.texturePaths;

      const slotPaths: Array<[TexturePreviewSlotKey, string | null]> = [
        ["map", paths.mapPath],
        ["normalMap", paths.normalPath],
        ["roughnessMap", paths.roughnessPath],
        ["metalnessMap", paths.metalnessPath],
        ["emissiveMap", paths.emissivePath],
        ["aoMap", paths.aoPath],
        ["cubeMap", paths.cubePath],
      ];

      for (const [slot, path] of slotPaths) {
        if (!path) continue;
        const key = `${slot}:${path.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const texData = textureDataMap.get(path) ?? textureDataMap.get(path.toLowerCase());
        const meta = TEXTURE_PREVIEW_SLOT_META.find((m) => m.key === slot);

        results.push({
          slot,
          label: meta?.label ?? slot,
          path,
          loaded: !!texData,
          resolution: texData ? `${texData.width}×${texData.height}` : null,
        });
      }
    }
  } catch {
    // skip
  }

  return results;
}

interface ModelTextureSlotPanelProps {
  bundle: SsbhModelPreviewBundle;
  textureDataMap: NutexbTextureDataMap;
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  onSlotToggle: (key: TexturePreviewSlotKey, enabled: boolean) => void;
  modelLabel?: string;
}

export function ModelTextureSlotPanel({
  bundle,
  textureDataMap,
  textureSlotLoadEnabled,
  onSlotToggle,
  modelLabel,
}: ModelTextureSlotPanelProps) {
  const textures = useMemo(
    () => collectModelTextures(bundle, textureDataMap),
    [bundle, textureDataMap],
  );

  if (textures.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground italic py-1">
        No textures resolved for this model
      </div>
    );
  }

  const slotGroups = useMemo(() => {
    const groups = new Map<TexturePreviewSlotKey, ModelTextureInfo[]>();
    for (const tex of textures) {
      const list = groups.get(tex.slot) ?? [];
      list.push(tex);
      groups.set(tex.slot, list);
    }
    return groups;
  }, [textures]);

  return (
    <div className="space-y-1.5">
      {modelLabel && (
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {modelLabel}
        </div>
      )}
      {[...slotGroups.entries()].map(([slot, items]) => {
        const enabled = textureSlotLoadEnabled[slot];
        const meta = TEXTURE_PREVIEW_SLOT_META.find((m) => m.key === slot);
        return (
          <div key={slot} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`model-slot-${slot}`}
                checked={enabled}
                onCheckedChange={(checked) => onSlotToggle(slot, !!checked)}
                className="h-3.5 w-3.5"
              />
              <label
                htmlFor={`model-slot-${slot}`}
                className={cn(
                  "text-[11px] font-medium cursor-pointer flex-1",
                  !enabled && "text-muted-foreground line-through",
                )}
              >
                {meta?.label ?? slot}
              </label>
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                {items.length}
              </Badge>
            </div>
            {enabled && (
              <div className="ml-5 space-y-0.5">
                {items.map((tex) => (
                  <div
                    key={tex.path}
                    className="flex items-center gap-1.5 text-[9px] text-muted-foreground"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        tex.loaded ? "bg-green-500" : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="truncate flex-1 font-mono">
                      {tex.path?.split(/[/\\]/).pop() ?? "—"}
                    </span>
                    {tex.resolution && (
                      <span className="tabular-nums shrink-0">{tex.resolution}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
