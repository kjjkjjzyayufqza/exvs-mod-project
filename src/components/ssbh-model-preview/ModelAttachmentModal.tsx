import { useEffect, useId, useMemo, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import { BoneIndexSearchSelect } from "./components/BoneIndexSearchSelect";
import type { SkelDataJson } from "./types";

function createAttachmentId(): string {
  return `attach_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export function ModelAttachmentModal() {
  const p = useSsbhModelPreview();
  const [open, setOpen] = useState(false);
  const [parentInstanceId, setParentInstanceId] = useState<string>("");
  const [childInstanceId, setChildInstanceId] = useState<string>("");
  const [parentBoneIndex, setParentBoneIndex] = useState(0);
  const [childBoneIndex, setChildBoneIndex] = useState(0);
  const idPrefix = useId().replace(/:/g, "");

  useEffect(() => {
    if (!open) {
      return;
    }
    const fallbackParent = p.previewInstances[0]?.id ?? "";
    const fallbackChild = p.previewInstances[1]?.id ?? p.previewInstances[0]?.id ?? "";
    setParentInstanceId((prev) => prev || fallbackParent);
    setChildInstanceId((prev) => prev || fallbackChild);
  }, [open, p.previewInstances]);

  const parentInstance = useMemo(
    () => p.previewInstances.find((inst) => inst.id === parentInstanceId) ?? null,
    [p.previewInstances, parentInstanceId],
  );
  const childInstance = useMemo(
    () => p.previewInstances.find((inst) => inst.id === childInstanceId) ?? null,
    [p.previewInstances, childInstanceId],
  );
  const parentBones = useMemo(() => {
    if (!parentInstance?.bundle.skel) {
      return null;
    }
    return (parentInstance.bundle.skel as SkelDataJson).bones.map((bone) => bone.name);
  }, [parentInstance]);
  const childBones = useMemo(() => {
    if (!childInstance?.bundle.skel) {
      return null;
    }
    return (childInstance.bundle.skel as SkelDataJson).bones.map((bone) => bone.name);
  }, [childInstance]);
  const canCreate =
    parentInstance !== null &&
    childInstance !== null &&
    parentInstance.id !== childInstance.id &&
    Boolean(parentBones?.length) &&
    Boolean(childBones?.length);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Link2 className="mr-1 h-3.5 w-3.5" />
          Attachment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Model attachment</DialogTitle>
          <DialogDescription>
            Attach one model to another by selecting parent and child skeleton bones.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={p.previewBusy}
            onClick={() => void p.pickAddNumdlb()}
          >
            Add .numdlb
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Parent model</Label>
            <Select value={parentInstanceId} onValueChange={setParentInstanceId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select parent model" />
              </SelectTrigger>
              <SelectContent>
                {p.previewInstances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.displayLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <BoneIndexSearchSelect
              value={parentBoneIndex}
              onChange={setParentBoneIndex}
              boneNames={parentBones}
              disabled={!parentBones?.length}
              instanceId={`${idPrefix}-parent`}
              ariaLabel="Select parent bone"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Child model</Label>
            <Select value={childInstanceId} onValueChange={setChildInstanceId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select child model" />
              </SelectTrigger>
              <SelectContent>
                {p.previewInstances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.displayLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <BoneIndexSearchSelect
              value={childBoneIndex}
              onChange={setChildBoneIndex}
              boneNames={childBones}
              disabled={!childBones?.length}
              instanceId={`${idPrefix}-child`}
              ariaLabel="Select child bone"
            />
          </div>
        </div>

        <div className="rounded-md border border-border/70 p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Active attachments</span>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[11px]"
              disabled={!canCreate}
              onClick={() => {
                if (!parentInstance || !childInstance || !parentBones?.length || !childBones?.length) {
                  throw new Error("Attachment setup is incomplete.");
                }
                const parentBoneName = parentBones[parentBoneIndex];
                const childBoneName = childBones[childBoneIndex];
                if (!parentBoneName || !childBoneName) {
                  throw new Error("Bone selection is out of range.");
                }
                p.setModelAttachments([
                  ...p.modelAttachments,
                  {
                    id: createAttachmentId(),
                    parentInstanceId: parentInstance.id,
                    parentBoneName,
                    childInstanceId: childInstance.id,
                    childBoneName,
                  },
                ]);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {p.modelAttachments.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No attachments configured.</p>
            ) : (
              p.modelAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1.5 text-[11px]"
                >
                  <span className="min-w-0 truncate">
                    {attachment.parentBoneName} ({attachment.parentInstanceId}) -{">"} {attachment.childBoneName} (
                    {attachment.childInstanceId})
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => {
                      p.setModelAttachments(p.modelAttachments.filter((x) => x.id !== attachment.id));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
