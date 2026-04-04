import { FileVideo, ListTree } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MayaSection } from "./MayaInspectorSection";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";

export function SsbhModelPreviewMotionPanel() {
  const p = useSsbhModelPreview();
  const manifestGroups = p.motionManifest?.groupSummaries?.length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <MayaSection title="Motion source" icon={<FileVideo className="h-3.5 w-3.5 opacity-80" />} defaultOpen>
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-muted-foreground leading-snug">
            NUANMB applies to the <span className="text-foreground font-medium">active</span> model only. Requires a
            skeleton on disk (same as the viewport).
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-[10px]"
              disabled={p.previewBusy}
              onClick={() => void p.pickMotionNuanmbFile()}
            >
              Open .nuanmb
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-[10px]"
              disabled={p.previewBusy}
              onClick={() =>
                void p.pickMotionFolder().catch((e) => {
                  toast.error(String(e));
                })
              }
            >
              Open motion folder
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              disabled={!p.motionSelectedNuanmbPath}
              onClick={p.reloadMotionClip}
            >
              Reload motion
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              disabled={!p.motionSelectedNuanmbPath}
              onClick={() => p.clearMotion()}
            >
              Clear motion
            </Button>
          </div>
          {p.motionNuanmbPaths.length > 1 ? (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Clip</Label>
              <Select
                value={p.motionSelectedNuanmbPath ?? ""}
                onValueChange={(v) => {
                  if (v) {
                    p.setMotionSelectedNuanmbPath(v);
                    p.setMotionFrame(0);
                    p.setMotionPlaying(false);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-[10px]">
                  <SelectValue placeholder="Select .nuanmb" />
                </SelectTrigger>
                <SelectContent>
                  {p.motionNuanmbPaths.map((path) => (
                    <SelectItem key={path} value={path} className="text-[10px] font-mono">
                      {path.replace(/\\/g, "/").split("/").pop() ?? path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {p.motionSampleError ? (
            <p className="text-[10px] text-destructive wrap-anywhere">{p.motionSampleError}</p>
          ) : null}
        </div>
      </MayaSection>

      <MayaSection title="Clip metadata" icon={<ListTree className="h-3.5 w-3.5 opacity-80" />} defaultOpen={false}>
        <div className="flex flex-col gap-2 text-[10px]">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Final frame index</span>
            <span className="font-mono">{p.motionManifest?.finalFrameIndex?.toFixed(3) ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Groups</span>
            <span className="font-mono">{manifestGroups}</span>
          </div>
          {p.motionManifest?.groupSummaries?.map((g) => (
            <div key={g.groupType + g.nodeCount} className="rounded border border-border/40 px-2 py-1">
              <div className="font-medium">{g.groupType}</div>
              <div className="text-muted-foreground">Nodes: {g.nodeCount}</div>
            </div>
          ))}
        </div>
      </MayaSection>
    </div>
  );
}
