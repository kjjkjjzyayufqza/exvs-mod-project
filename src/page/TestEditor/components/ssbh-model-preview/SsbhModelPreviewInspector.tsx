import { ChevronDown, ChevronRight, Info, Layout, List, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import type { SkelDataJson } from "./types";

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function MayaSection({ title, icon, children, defaultOpen = true }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col border-b border-muted last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 bg-muted/20 px-2 py-1.5 transition-colors hover:bg-muted/40"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
        </div>
      </button>
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
}

export function SsbhModelPreviewInspector() {
  const p = useSsbhModelPreview();

  return (
    <div className="-mx-4 flex flex-col border-t bg-background/50">
      <MayaSection title="Display Settings" icon={<Settings2 className="h-3.5 w-3.5" />}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Wireframe</Label>
            <Switch checked={p.wireframe} onCheckedChange={p.setWireframe} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Skeleton</Label>
            <Switch checked={p.showSkeleton} onCheckedChange={p.setShowSkeleton} disabled={!p.bundle?.skel} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Grid</Label>
            <Switch checked={p.showGrid} onCheckedChange={p.setShowGrid} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Axes</Label>
            <Switch checked={p.showAxesGizmo} onCheckedChange={p.setShowAxesGizmo} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Stats</Label>
            <Switch checked={p.showStats} onCheckedChange={p.setShowStats} />
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Lighting & Environment" icon={<Layout className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">Ambient</Label>
              <span className="text-[10px] font-mono">{p.ambientIntensity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={p.ambientIntensity}
              onChange={(e) => p.setAmbientIntensity(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">Directional</Label>
              <span className="text-[10px] font-mono">{p.directionalIntensity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.05}
              value={p.directionalIntensity}
              onChange={(e) => p.setDirectionalIntensity(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Background Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={p.background}
                onChange={(e) => p.setBackground(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <span className="text-[10px] font-mono uppercase">{p.background}</span>
            </div>
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Mesh Explorer" icon={<List className="h-3.5 w-3.5" />}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-[10px] text-muted-foreground">{p.draws.length} total meshes</span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[9px] uppercase tracking-tighter"
                onClick={p.showAllMeshes}
              >
                All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[9px] uppercase tracking-tighter"
                onClick={p.hideAllMeshes}
              >
                None
              </Button>
            </div>
          </div>
          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted">
            {p.draws.map((d) => (
              <label
                key={d.key}
                className="flex cursor-pointer items-start gap-2 rounded-sm p-1 transition-colors hover:bg-muted/30"
              >
                <Checkbox
                  checked={p.visibleKeys.has(d.key)}
                  onCheckedChange={(c) => p.toggleVisible(d.key, c === true)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <div className="flex flex-col leading-tight">
                  <span className="wrap-break-word text-[11px] font-medium">{d.label}</span>
                  <span className="text-[9px] text-muted-foreground">{d.materialLabel}</span>
                </div>
              </label>
            ))}
            {!p.draws.length && (
              <span className="py-4 text-center text-[10px] italic text-muted-foreground">No meshes loaded</span>
            )}
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Scene Statistics" icon={<Info className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">Vertices</span>
            <span className="text-[11px] font-mono">{p.vertexTriangleStats.verts.toLocaleString()}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">Triangles</span>
            <span className="text-[11px] font-mono">{p.vertexTriangleStats.tris.toLocaleString()}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">Draw Calls</span>
            <span className="text-[11px] font-mono">{p.draws.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">Textures</span>
            <span className="text-[11px] font-mono">{p.textureDataUrlByDrawKey.size}</span>
          </div>
          <div className="flex flex-col col-span-2">
            <span className="text-[9px] uppercase text-muted-foreground">Bones</span>
            <span className="text-[11px] font-mono">
              {p.bundle?.skel ? (p.bundle.skel as SkelDataJson).bones?.length ?? 0 : "—"}
            </span>
          </div>
        </div>
      </MayaSection>

      {p.bundle?.warnings?.length ? (
        <MayaSection title="Warnings" icon={<Info className="h-3.5 w-3.5 text-amber-500" />}>
          <ul className="list-disc space-y-1 pl-4 text-[10px] text-muted-foreground">
            {p.bundle.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </MayaSection>
      ) : null}
    </div>
  );
}
