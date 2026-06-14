import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import { BoneIndexSearchSelect } from "./components/BoneIndexSearchSelect";
import type { SkelDataJson } from "./types";

const MODEL_ATTACHMENT_DIMENSIONS = {
  width: 720,
  height: 560,
  minWidth: 560,
  minHeight: 440,
};

function createAttachmentId(): string {
  return `attach_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export function ModelAttachmentModal() {
  const p = useSsbhModelPreview();
  const [open, setOpen] = useState(false);
  const [parentInstanceId, setParentInstanceId] = useState("");
  const [childInstanceId, setChildInstanceId] = useState("");
  const [parentBoneIndex, setParentBoneIndex] = useState(0);
  const [childBoneIndex, setChildBoneIndex] = useState(0);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId().replace(/:/g, "");

  useEffect(() => {
    if (!open) return;
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
    if (!parentInstance?.bundle.skel) return null;
    return (parentInstance.bundle.skel as SkelDataJson).bones.map((bone) => bone.name);
  }, [parentInstance]);
  const childBones = useMemo(() => {
    if (!childInstance?.bundle.skel) return null;
    return (childInstance.bundle.skel as SkelDataJson).bones.map((bone) => bone.name);
  }, [childInstance]);
  const canCreate =
    parentInstance !== null &&
    childInstance !== null &&
    parentInstance.id !== childInstance.id &&
    Boolean(parentBones?.length) &&
    Boolean(childBones?.length);

  const attachmentVirtualizer = useVirtualizer({
    count: p.modelAttachments.length,
    getScrollElement: () => attachmentsRef.current,
    estimateSize: () => 38,
    overscan: 4,
  });

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Link2 className="mr-1 h-3.5 w-3.5" />
        Attachment
      </Button>

      {open ? (
        <AppRndModalShell
          titleId="model-attachment-title"
          title="Model attachment"
          subtitle="Attach one model to another using skeleton bones"
          headerIcon={<Link2 className="h-5 w-5 text-primary" />}
          dimensions={MODEL_ATTACHMENT_DIMENSIONS}
          storageKey="app.rnd-size.model-attachment"
          onClose={() => setOpen(false)}
          footer={
            <div className="flex justify-end p-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
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

            <div className="flex min-h-[180px] flex-1 flex-col rounded-md border border-border/70 p-2">
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Active attachments ({p.modelAttachments.length})
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={!canCreate}
                  onClick={() => {
                    if (!parentInstance || !childInstance || !parentBones?.length || !childBones?.length) {
                      return;
                    }
                    const parentBoneName = parentBones[parentBoneIndex];
                    const childBoneName = childBones[childBoneIndex];
                    if (!parentBoneName || !childBoneName) return;
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

              {p.modelAttachments.length === 0 ? (
                <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  No attachments configured.
                </p>
              ) : (
                <div ref={attachmentsRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div
                    className="relative w-full"
                    style={{ height: `${attachmentVirtualizer.getTotalSize()}px` }}
                  >
                    {attachmentVirtualizer.getVirtualItems().map((virtualRow) => {
                      const attachment = p.modelAttachments[virtualRow.index];
                      return (
                        <div
                          key={attachment.id}
                          ref={attachmentVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="absolute left-0 top-0 w-full pb-1"
                          style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                          <div className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1.5 text-[11px]">
                            <span className="min-w-0 truncate">
                              {attachment.parentBoneName} ({attachment.parentInstanceId}) -{">"}{" "}
                              {attachment.childBoneName} ({attachment.childInstanceId})
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              aria-label="Remove attachment"
                              onClick={() => {
                                p.setModelAttachments(
                                  p.modelAttachments.filter((item) => item.id !== attachment.id),
                                );
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
