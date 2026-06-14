import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SsbhModelPreviewInspector } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import { SsbhModelPreviewMotionPanel } from "@/components/ssbh-model-preview/SsbhModelPreviewMotionPanel";
import { MayaSection } from "@/page/SceneEdit/components/MayaSection";
import type { UnitModelRepackResult, UnitModelValidationResult } from "../utils/unitModelRepackService";
export type UnitModelPropertiesTab = "inspect" | "motion";

const TAB_TRIGGER = "h-5 px-2 text-[10px] data-[state=active]:bg-background";

type UnitModelPropertiesPanelProps = {
  unitRoot: string | null;
  structurePath: string | null;
  obModPath: string;
  validation: UnitModelValidationResult | null;
  lastRepack: UnitModelRepackResult | null;
  onValidate: () => void;
  onOpenOutput: () => void;
  isValidating: boolean;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function ValidationIssueList({ errors }: { errors: UnitModelValidationResult["errors"] }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const getScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: errors.length,
    getScrollElement,
    estimateSize: () => 92,
    getItemKey: (index) => {
      const error = errors[index];
      return error ? `${error.phase}:${error.model ?? ""}:${error.path ?? ""}:${index}` : index;
    },
    overscan: 8,
  });

  return (
    <div ref={listRef} className="h-[min(36vh,320px)] overflow-auto overscroll-contain">
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const error = errors[virtualRow.index];
          if (!error) return null;

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full pb-2"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-destructive">{error.phase}</span>
                  {error.model ? (
                    <span className="truncate font-mono text-muted-foreground">{error.model}</span>
                  ) : null}
                </div>
                <p className="mt-1">{error.message}</p>
                {error.path ? (
                  <p className="mt-1 break-all font-mono text-[10px] leading-snug text-muted-foreground">
                    {error.path}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UnitModelPropertiesPanel({
  unitRoot,
  structurePath,
  obModPath,
  validation,
  lastRepack,
  onValidate,
  onOpenOutput,
  isValidating,
}: UnitModelPropertiesPanelProps) {
  const [tab, setTab] = useState<UnitModelPropertiesTab>("inspect");

  return (
    <div className="flex h-full min-w-0 max-w-full flex-col overflow-hidden border-l">
      <div className="flex shrink-0 items-center overflow-hidden border-b bg-muted/20 px-3 py-1 select-none">
        <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Details
        </span>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as UnitModelPropertiesTab)}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList className="shrink-0 h-7 w-full min-w-0 justify-start overflow-hidden rounded-none border-b bg-muted/20 px-1">
          <TabsTrigger value="inspect" className={TAB_TRIGGER}>
            Inspect
          </TabsTrigger>
          <TabsTrigger value="motion" className={TAB_TRIGGER}>
            Motion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inspect" className="mt-0 min-h-0 min-w-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full min-w-0">
            <div className="min-w-0 max-w-full pb-4">
              <MayaSection title="Unit Model" defaultOpen>
                <div className="space-y-1.5 text-[11px]">
                  <div className="min-w-0">
                    <div className="text-muted-foreground">Model root</div>
                    <div className="break-all font-mono text-[10px] leading-snug">{unitRoot ?? "None"}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground">Structure JSON</div>
                    <div className="break-all font-mono text-[10px] leading-snug">{structurePath ?? "None"}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground">OB Mod folder</div>
                    <div
                      className={cn(
                        "break-all font-mono text-[10px] leading-snug",
                        !obModPath.trim() && "text-destructive",
                      )}
                    >
                      {obModPath.trim() || "Not configured"}
                    </div>
                  </div>
                </div>
              </MayaSection>

              <MayaSection
                title="Validation"
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={onValidate}
                    disabled={!unitRoot || isValidating}
                    aria-label="Run validation"
                  >
                    {isValidating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <span className="text-[10px]">Run</span>
                    )}
                  </Button>
                }
              >
                {validation ? (
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <Metric label="Models" value={validation.summary.modelCount} />
                    <Metric label="NUMATB" value={validation.summary.numatbCount} />
                    <Metric label="NUHLPB" value={validation.summary.nuhlpbCount} />
                    <Metric label="SHL files" value={validation.summary.shlCount} />
                    <Metric label="SHL models" value={validation.summary.shlDeclaredModelCount ?? "-"} />
                    <Metric label="Texture refs" value={validation.summary.textureReferenceCount} />
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Run validation from the toolbar to inspect required files and texture references.
                  </p>
                )}
              </MayaSection>

              {lastRepack ? (
                <MayaSection title="Last Repack">
                  <div className="space-y-2 text-[11px]">
                    <div className="break-all font-mono text-[10px] leading-snug">{lastRepack.outputPath}</div>
                    <div className="text-muted-foreground">
                      {lastRepack.totalFiles} files, {formatBytes(lastRepack.outputSize)}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-7 w-full text-[10px]" onClick={onOpenOutput}>
                      Reveal output
                    </Button>
                  </div>
                </MayaSection>
              ) : null}

              {validation?.errors.length ? (
                <MayaSection title="Issues" defaultOpen>
                  <ValidationIssueList errors={validation.errors} />
                </MayaSection>
              ) : validation ? (
                <MayaSection title="Issues">
                  <p className="text-[11px] text-emerald-600">No blocking validation issues.</p>
                </MayaSection>
              ) : null}

              <MayaSection title="Preview" defaultOpen>
                <div className="min-w-0 max-w-full overflow-x-hidden">
                  <SsbhModelPreviewInspector layout="flush" />
                </div>
              </MayaSection>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="motion" className="mt-0 min-h-0 min-w-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full min-w-0">
            <div className="min-w-0 max-w-full p-3 pb-4">
              <SsbhModelPreviewMotionPanel />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
