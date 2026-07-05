import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePathInput } from "@/components/ui/filePathInput";
import { sourcePathToMotionName, type MotionFolderNode } from "@/services/motionFolder/motionFolderService";

type MotionFolderAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  folders: MotionFolderNode[];
  defaultParentFolderId: string;
  onAdd: (params: { sourcePath: string; name: string; unk1: string; unk2: string; parentFolderId: string }) => Promise<void>;
};

export function MotionFolderAddDialog({
  open: dialogOpen,
  onOpenChange,
  busy = false,
  folders,
  defaultParentFolderId,
  onAdd,
}: MotionFolderAddDialogProps) {
  const [sourcePath, setSourcePath] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [unk1, setUnk1] = useState("00000000");
  const [unk2, setUnk2] = useState("00000000");
  const [parentFolderId, setParentFolderId] = useState(defaultParentFolderId);
  const [advancedOpen, setAdvancedOpen] = useState(true);

  useEffect(() => {
    if (!dialogOpen) return;
    setSourcePath("");
    setName("");
    setNameTouched(false);
    setUnk1("00000000");
    setUnk2("00000000");
    setParentFolderId(defaultParentFolderId);
    setAdvancedOpen(true);
  }, [defaultParentFolderId, dialogOpen]);

  const setSourceAndMaybeName = useCallback(
    (nextPath: string) => {
      setSourcePath(nextPath);
      if (nameTouched) return;
      if (!nextPath.trim()) {
        setName("");
        return;
      }
      try {
        setName(sourcePathToMotionName(nextPath));
      } catch {
        setName("");
      }
    },
    [nameTouched],
  );

  const pickSource = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "Motion", extensions: ["nuanmb"] }],
    });
    if (typeof selected !== "string") return;
    setSourceAndMaybeName(selected);
  }, [setSourceAndMaybeName]);

  const handleAdd = useCallback(async () => {
    await onAdd({ sourcePath, name, unk1, unk2, parentFolderId });
    onOpenChange(false);
  }, [name, onAdd, onOpenChange, parentFolderId, sourcePath, unk1, unk2]);

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add motion</DialogTitle>
          <DialogDescription>Import one .nuanmb file into the selected folder.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Source .nuanmb</Label>
            <div className="flex gap-2">
              <FilePathInput
                value={sourcePath}
                onChange={(event) => setSourceAndMaybeName(event.target.value)}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={() => void pickSource()}>
                <FolderOpen className="h-4 w-4" />
                Browse
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(event) => {
                setNameTouched(true);
                setName(event.target.value);
              }}
              className="font-mono text-xs"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Parent folder</Label>
            <select
              value={parentFolderId}
              onChange={(event) => setParentFolderId(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-xs"
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.pathSegments.join("\\") || folder.name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-md border bg-muted/20">
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/40"
            >
              <span>Advanced metadata</span>
              <ChevronDown className={advancedOpen ? "h-4 w-4 rotate-180 transition-transform" : "h-4 w-4 transition-transform"} />
            </button>
            {advancedOpen ? (
              <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">unk1</Label>
                  <Input
                    value={unk1}
                    onChange={(event) => setUnk1(event.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">unk2</Label>
                  <Input
                    value={unk2}
                    onChange={(event) => setUnk2(event.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !sourcePath.trim() || !name.trim() || !parentFolderId}
            onClick={() => void handleAdd()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add motion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
