import { useCallback, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { appendCardIconToStructureJson } from "./cardIconStructure";

type ReplaceSummary = {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
};

interface CardIconAddDialogProps {
  folderPath: string;
  convertDirPath: string;
  structurePath: string;
  nextIndex: number;
  onAdded: () => Promise<void> | void;
}

function containsInvalidFileChars(name: string): boolean {
  return /[\\/:*?"<>|]/.test(name);
}

export function CardIconAddDialog({
  folderPath,
  convertDirPath,
  structurePath,
  nextIndex,
  onAdded,
}: CardIconAddDialogProps) {
  const [openState, setOpenState] = useState(false);
  const [pngPath, setPngPath] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const trimmedName = nameInput.trim();
  const isNameValid = Boolean(trimmedName) && !containsInvalidFileChars(trimmedName);

  const previewSrc = useMemo(() => {
    if (!pngPath) return null;
    return convertFileSrc(pngPath);
  }, [pngPath]);

  const handlePngPicked = useCallback((picked: string | string[]) => {
    if (Array.isArray(picked)) {
      setPngPath(picked[0] ?? "");
      return;
    }
    setPngPath(picked);
  }, []);

  const handleApply = useCallback(async () => {
    if (!folderPath) {
      toast.error("Folder path is empty");
      return;
    }
    if (!pngPath) {
      toast.error("Please select a PNG file");
      return;
    }
    if (!isNameValid) {
      toast.error("Invalid name (empty or contains forbidden characters)");
      return;
    }

    setIsCreating(true);
    try {
      const raw = await readTextFile(structurePath);
      const json = JSON.parse(raw);

      const existing = Array.isArray(json?.SubFileData) ? json.SubFileData : [];
      const lower = trimmedName.toLowerCase();
      const hasDuplicate = existing.some((item: any) => {
        const url = typeof item?.fileUrl === "string" ? item.fileUrl : "";
        return url.toLowerCase().endsWith(`/${lower}.nutexb`) || url.toLowerCase().endsWith(`\\${lower}.nutexb`);
      });
      if (hasDuplicate) {
        toast.error("The name already exists in structure JSON");
        return;
      }

      const { nextStructJson } = appendCardIconToStructureJson(json, { name: trimmedName });

      const nutexbPath = await join(folderPath, "0x49235031", `${trimmedName}.nutexb`);
      if (!nutexbPath) {
        toast.error("Failed to resolve target nutexb path");
        return;
      }

      const result = await invoke<ReplaceSummary>("card_icon_replace_from_png", {
        nutexbPath,
        convertDir: convertDirPath,
        pngPath,
      });

      await writeTextFile(structurePath, JSON.stringify(nextStructJson, null, 2));
      toast.success(`Created card icon: ${result.nutexbName}`);
      setOpenState(false);
      setPngPath("");
      setNameInput("");
      await onAdded();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to create card icon";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [convertDirPath, folderPath, isNameValid, onAdded, pngPath, structurePath, trimmedName]);

  const canApply = Boolean(pngPath) && isNameValid && !isCreating;

  return (
    <Dialog open={openState} onOpenChange={setOpenState}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[840px]">
        <DialogHeader>
          <DialogTitle>Add Card Icon</DialogTitle>
          <DialogDescription>
            Creates a new nutexb from PNG and appends the item to <span className="font-mono">0x49235031_structure.json</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>Preview</Label>
            <Card className="overflow-hidden min-h-[360px]">
              <AspectRatio ratio={1} className="bg-black flex items-center justify-center">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt="Card icon preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full w-full bg-black">
                    <span className="text-sm text-muted-foreground">No preview available</span>
                  </div>
                )}
              </AspectRatio>
            </Card>
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              Previewing the selected PNG (will be applied).
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="card-icon-name">Name (also file name)</Label>
              <Input
                id="card-icon-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter a name..."
              />
              <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                The item will be appended at index <span className="font-mono">{nextIndex}</span>.
              </div>
              {trimmedName && (
                <div className="text-xs text-muted-foreground break-all">
                  Target nutexb: <span className="font-mono">{`${trimmedName}.nutexb`}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="card-icon-add-png">Source PNG</Label>
              <FilePathInput
                id="card-icon-add-png"
                value={pngPath}
                placeholder="Select a PNG file..."
                picker={{
                  kind: "file",
                  multiple: false,
                  title: "Select PNG file",
                  filters: [{ name: "PNG", extensions: ["png"] }],
                }}
                onPickedValue={handlePngPicked}
                disabled={isCreating}
              />
              <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                The PNG will be converted in Rust (no external executables).
              </div>
            </div>

            {!isNameValid && trimmedName && (
              <div className="text-sm text-destructive">Name contains invalid characters.</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenState(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button onClick={() => void handleApply()} disabled={!canApply}>
                {isCreating ? "Creating..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
