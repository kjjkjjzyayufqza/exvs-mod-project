import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { ArrowDown, ArrowUp, ExternalLink, FolderOpen, Loader2, Replace, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MOTION_EXT,
  type MotionFolderInventory,
  type MotionFolderNode,
  type MotionStructureNode,
} from "@/services/motionFolder/motionFolderService";
import type { MotionEditDraft } from "./useMotionFolderEditor";
import {
  formatMotionStoredHexForDisplay,
  motionHexDisplayLabel,
  motionListItemLabel,
  motionListItemPath,
  motionParentDirOf,
  parseMotionHexDisplayToStored,
  type MotionHexDisplayEndian,
} from "./motionFolderEditorUtils";

type MotionFolderDetailPanelProps = {
  node: MotionStructureNode | null;
  inventory: MotionFolderInventory | null;
  editDraft: MotionEditDraft;
  onEditDraftChange: (draft: MotionEditDraft) => void;
  hexDisplayEndian: MotionHexDisplayEndian;
  onHexDisplayEndianChange: (endian: MotionHexDisplayEndian) => void;
  busy: boolean;
  busyAction: string | null;
  onApplyEdit: (draftOverride?: Partial<MotionEditDraft>) => void;
  onReplace: () => void;
  /** Reorder direct children when a folder is selected (body model should be #1). */
  onMoveFolderChild?: (folderId: string, childId: string, direction: "up" | "down") => void;
};

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-muted/60 py-1.5 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all text-right font-mono">{value}</span>
    </div>
  );
}

function HexEndianToggle({
  value,
  onChange,
}: {
  value: MotionHexDisplayEndian;
  onChange: (endian: MotionHexDisplayEndian) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next === "le" || next === "be") onChange(next);
      }}
      className="justify-end"
    >
      <ToggleGroupItem value="le" className="h-7 px-2 text-[10px]" aria-label="Little-endian structure hex">
        LE
      </ToggleGroupItem>
      <ToggleGroupItem value="be" className="h-7 px-2 text-[10px]" aria-label="Big-endian MSC value hex">
        BE
      </ToggleGroupItem>
    </ToggleGroup>
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

function FolderChildOrderList({
  folder,
  hexDisplayEndian,
  busy,
  onMoveFolderChild,
}: {
  folder: MotionFolderNode;
  hexDisplayEndian: MotionHexDisplayEndian;
  busy: boolean;
  onMoveFolderChild?: (folderId: string, childId: string, direction: "up" | "down") => void;
}) {
  if (folder.children.length === 0) {
    return <p className="text-[11px] text-muted-foreground">This folder has no children yet.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Structure order matters for multi-clip actions: put the <span className="font-medium text-foreground">body</span>{" "}
        model clip first, then wing / weapon / other channels. Changes need Save.
      </p>
      <div className="space-y-1.5">
        {folder.children.map((child, index) => {
          const isItem = child.kind === "item";
          const modelHex = formatMotionStoredHexForDisplay(child.unk2, hexDisplayEndian);
          return (
            <div
              key={child.id}
              className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/15 px-2 py-1.5"
            >
              <span className="w-6 shrink-0 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
                #{index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{child.name}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {isItem ? `unk2 ${modelHex}` : "folder"} · {child.kind}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={busy || !onMoveFolderChild || index === 0}
                  onClick={() => onMoveFolderChild?.(folder.id, child.id, "up")}
                  title="Move up"
                  aria-label={`Move ${child.name} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={busy || !onMoveFolderChild || index === folder.children.length - 1}
                  onClick={() => onMoveFolderChild?.(folder.id, child.id, "down")}
                  title="Move down"
                  aria-label={`Move ${child.name} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MotionFolderDetailPanel({
  node,
  inventory,
  editDraft,
  onEditDraftChange,
  hexDisplayEndian,
  onHexDisplayEndianChange,
  busy,
  busyAction,
  onApplyEdit,
  onReplace,
  onMoveFolderChild,
}: MotionFolderDetailPanelProps) {
  // Local text while typing; commit LE storage into editDraft on blur / apply.
  const [unk1Text, setUnk1Text] = useState("");
  const [unk2Text, setUnk2Text] = useState("");
  const [hexError, setHexError] = useState<string | null>(null);

  useEffect(() => {
    if (!node) {
      setUnk1Text("");
      setUnk2Text("");
      setHexError(null);
      return;
    }
    setUnk1Text(formatMotionStoredHexForDisplay(editDraft.unk1, hexDisplayEndian));
    setUnk2Text(formatMotionStoredHexForDisplay(editDraft.unk2, hexDisplayEndian));
    setHexError(null);
  }, [editDraft.unk1, editDraft.unk2, hexDisplayEndian, node?.id]);

  const commitHexField = (field: "unk1" | "unk2", text: string) => {
    try {
      const stored = parseMotionHexDisplayToStored(text, hexDisplayEndian);
      onEditDraftChange({ ...editDraft, [field]: stored });
      setHexError(null);
      return stored;
    } catch (error) {
      setHexError(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const handleApply = () => {
    try {
      const nextUnk1 = parseMotionHexDisplayToStored(unk1Text, hexDisplayEndian);
      const nextUnk2 = parseMotionHexDisplayToStored(unk2Text, hexDisplayEndian);
      setHexError(null);
      onEditDraftChange({ ...editDraft, unk1: nextUnk1, unk2: nextUnk2 });
      onApplyEdit({ name: editDraft.name, unk1: nextUnk1, unk2: nextUnk2 });
    } catch (error) {
      setHexError(error instanceof Error ? error.message : String(error));
    }
  };

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

  const storedUnk1 = node.unk1;
  const storedUnk2 = node.unk2;
  const displayUnk1 = formatMotionStoredHexForDisplay(storedUnk1, hexDisplayEndian);
  const displayUnk2 = formatMotionStoredHexForDisplay(storedUnk2, hexDisplayEndian);
  const altUnk1 = formatMotionStoredHexForDisplay(storedUnk1, hexDisplayEndian === "le" ? "be" : "le");
  const altUnk2 = formatMotionStoredHexForDisplay(storedUnk2, hexDisplayEndian === "le" ? "be" : "le");
  const altLabel = motionHexDisplayLabel(hexDisplayEndian === "le" ? "be" : "le");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{node.kind === "folder" ? "Folder" : "Motion item"} details</h3>
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {node.kind}
                </Badge>
              </div>
              <HexEndianToggle value={hexDisplayEndian} onChange={onHexDisplayEndianChange} />
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-medium">Entry identity</h4>
                <Badge variant="outline" className="font-mono text-[10px]">
                  unk1 {displayUnk1}
                </Badge>
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Hex display: <span className="font-medium">{motionHexDisplayLabel(hexDisplayEndian)}</span>. Structure JSON
                always stores LE bytes; MSC C / runtime integers use the byte-swapped spelling.
              </p>
              <MetadataRow label="Label" value={motionListItemLabel(node)} />
              <MetadataRow label="Path" value={motionListItemPath(node)} />
              <MetadataRow label={`unk1 (${motionHexDisplayLabel(hexDisplayEndian)})`} value={displayUnk1} />
              <MetadataRow label={`unk1 (${altLabel})`} value={altUnk1} />
              <MetadataRow label={`unk2 (${motionHexDisplayLabel(hexDisplayEndian)})`} value={displayUnk2} />
              <MetadataRow label={`unk2 (${altLabel})`} value={altUnk2} />
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
                <Label className="text-xs">unk1 ({motionHexDisplayLabel(hexDisplayEndian)})</Label>
                <Input
                  value={unk1Text}
                  onChange={(event) => setUnk1Text(event.target.value)}
                  onBlur={() => commitHexField("unk1", unk1Text)}
                  className="font-mono text-xs"
                  placeholder={hexDisplayEndian === "le" ? "a621fd5e" : "5efd21a6"}
                  title="LE = structure JSON bytes; BE = MSC integer spelling (byte-swapped)"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">unk2 ({motionHexDisplayLabel(hexDisplayEndian)})</Label>
                <Input
                  value={unk2Text}
                  onChange={(event) => setUnk2Text(event.target.value)}
                  onBlur={() => commitHexField("unk2", unk2Text)}
                  className="font-mono text-xs"
                  placeholder="00000000"
                  title="LE = structure JSON bytes; BE = MSC integer spelling (byte-swapped)"
                />
              </div>
              {hexError ? <p className="text-[11px] text-destructive">{hexError}</p> : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={handleApply}
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
            <div className="space-y-3">
              <div className="rounded-md border p-3">
                <h4 className="mb-2 text-xs font-medium">Child order</h4>
                <FolderChildOrderList
                  folder={node}
                  hexDisplayEndian={hexDisplayEndian}
                  busy={busy}
                  onMoveFolderChild={onMoveFolderChild}
                />
              </div>
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
            </div>
          )}

          {inventory?.warnings.length ? <InventoryWarnings messages={inventory.warnings} /> : null}
        </div>
      </div>
    </div>
  );
}
