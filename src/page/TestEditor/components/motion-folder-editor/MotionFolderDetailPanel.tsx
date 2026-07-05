import { openPath } from "@tauri-apps/plugin-opener";
import { ExternalLink, FolderOpen, Loader2, Replace, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MOTION_EXT, type MotionFolderInventory, type MotionStructureNode } from "@/services/motionFolder/motionFolderService";
import type { MotionEditDraft } from "./useMotionFolderEditor";
import { motionListItemLabel, motionListItemPath, motionParentDirOf } from "./motionFolderEditorUtils";

type MotionFolderDetailPanelProps = {
  node: MotionStructureNode | null;
  inventory: MotionFolderInventory | null;
  editDraft: MotionEditDraft;
  onEditDraftChange: (draft: MotionEditDraft) => void;
  busy: boolean;
  busyAction: string | null;
  onApplyEdit: () => void;
  onReplace: () => void;
};

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-muted/60 py-1.5 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all text-right font-mono">{value}</span>
    </div>
  );
}

function InventorySummary({ inventory }: { inventory: MotionFolderInventory }) {
  return (
    <div className="rounded-md border p-3">
      <h4 className="mb-2 text-xs font-medium">Pack summary</h4>
      <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">Motions</div>
          <div className="font-mono text-sm">{inventory.summary.totalFiles}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">Folders</div>
          <div className="font-mono text-sm">{inventory.summary.folderCount}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">Nonzero unk1</div>
          <div className="font-mono text-sm">{inventory.summary.nonZeroUnk1Count}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">Nonzero unk2</div>
          <div className="font-mono text-sm">{inventory.summary.nonZeroUnk2Count}</div>
        </div>
      </div>
      <div className="mt-3 space-y-0">
        <MetadataRow label="Root name" value={inventory.rootName} />
        <MetadataRow label="Structure JSON" value={inventory.structureJsonPath} />
      </div>
    </div>
  );
}

function InventoryWarnings({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
      <h4 className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">Inventory warnings</h4>
      <ul className="list-disc space-y-1 pl-4 text-[11px] text-amber-900 dark:text-amber-100">
        {messages.slice(0, 6).map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export function MotionFolderDetailPanel({
  node,
  inventory,
  editDraft,
  onEditDraftChange,
  busy,
  busyAction,
  onApplyEdit,
  onReplace,
}: MotionFolderDetailPanelProps) {
  if (!node) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <div className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <p className="text-xs text-muted-foreground">Select a folder or motion item to inspect details.</p>
          {inventory ? (
            <div className="mt-4 space-y-4">
              <InventorySummary inventory={inventory} />
              <InventoryWarnings messages={inventory.warnings} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">{node.kind === "folder" ? "Folder" : "Motion item"} details</h3>
              <Badge variant="secondary" className="text-[10px] uppercase">
                {node.kind}
              </Badge>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium">Entry identity</h4>
                <Badge variant="outline" className="font-mono text-[10px]">
                  unk1 {node.unk1}
                </Badge>
              </div>
              <MetadataRow label="Label" value={motionListItemLabel(node)} />
              <MetadataRow label="Path" value={motionListItemPath(node)} />
              <MetadataRow label="unk1" value={node.unk1} />
              <MetadataRow label="unk2" value={node.unk2} />
              <MetadataRow label="link" value={String(node.link)} />
              <MetadataRow label="unk2_1" value={String(node.unk2_1)} />
              <MetadataRow label="unk3" value={String(node.unk3)} />
              <MetadataRow label="unk4" value={String(node.unk4)} />
              {node.kind === "folder" ? (
                <MetadataRow label="Children" value={String(node.children.length)} />
              ) : null}
            </div>
          </div>

          <div className="rounded-md border p-3">
            <h4 className="mb-3 text-xs font-medium">Edit entry</h4>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={editDraft.name}
                  onChange={(event) => onEditDraftChange({ ...editDraft, name: event.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">unk1</Label>
                <Input
                  value={editDraft.unk1}
                  onChange={(event) => onEditDraftChange({ ...editDraft, unk1: event.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">unk2</Label>
                <Input
                  value={editDraft.unk2}
                  onChange={(event) => onEditDraftChange({ ...editDraft, unk2: event.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={onApplyEdit}
                  className="inline-flex items-center gap-2"
                >
                  {busyAction === "edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Apply
                </Button>
              </div>
            </div>
          </div>

          {node.kind === "item" ? (
            <div className="space-y-3">
              <div className="rounded-md border p-3">
                <h4 className="mb-2 text-xs font-medium">File binding</h4>
                <MetadataRow label="fileIndex" value={String(node.fileIndex)} />
                <MetadataRow label="originalFileIndex" value={String(node.originalFileIndex)} />
                <MetadataRow label="fileType" value={node.fileType} />
                <MetadataRow label="fileUrl" value={node.fileUrl} />
                <MetadataRow label="fileBaseName" value={node.fileBaseName} />
                <MetadataRow label="file" value={node.filePath} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void openPath(node.filePath)}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open file
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={onReplace}
                  className="inline-flex items-center gap-2"
                >
                  {busyAction === "replace" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Replace className="h-3.5 w-3.5" />
                  )}
                  Replace {MOTION_EXT}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const parent = motionParentDirOf(node.filePath);
                    if (parent) void openPath(parent);
                  }}
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  Open parent folder
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const folderPath = inventory
                    ? `${inventory.motionRoot}\\${node.pathSegments.join("\\")}`
                    : node.pathSegments.join("\\");
                  void openPath(folderPath);
                }}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Open folder
              </Button>
            </div>
          )}

          {inventory?.warnings.length ? <InventoryWarnings messages={inventory.warnings} /> : null}
        </div>
      </div>
    </div>
  );
}
