import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link2, Plus, Save, Trash2, LayoutTemplate, Check } from "lucide-react";
import { toast } from "sonner";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import { BoneIndexSearchSelect } from "./components/BoneIndexSearchSelect";
import type { SkelDataJson } from "./types";
import type {
  AttachmentEdge,
  AttachmentTemplate,
  ModelBinding,
  ModelBindingRole,
  ModelId,
} from "./attachmentTemplateTypes";
import {
  buildAttachmentTemplate,
  createAttachmentEdgeId,
  normalizeModelId,
  preferBoneIndex,
  resolveAttachmentTemplate,
} from "./attachmentTemplateService";
import {
  deleteAttachmentTemplate,
  loadAttachmentTemplateLibrary,
  upsertAttachmentTemplate,
} from "./store/attachmentTemplateLibrary";

const MODEL_ATTACHMENT_DIMENSIONS = {
  width: 860,
  height: 640,
  minWidth: 640,
  minHeight: 480,
};

const ROLE_OPTIONS: ModelBindingRole[] = ["body", "weapon", "effect", "other"];

function boneNamesFromInstance(skel: unknown | null | undefined): string[] | null {
  if (!skel || typeof skel !== "object") return null;
  const bones = (skel as SkelDataJson).bones;
  if (!Array.isArray(bones) || bones.length === 0) return null;
  return bones.map((bone) => bone.name);
}

export function ModelAttachmentModal() {
  const p = useSsbhModelPreview();
  const [open, setOpen] = useState(false);
  const [bindings, setBindings] = useState<ModelBinding[]>([]);
  const [edges, setEdges] = useState<AttachmentEdge[]>([]);
  const [primaryModelId, setPrimaryModelId] = useState<string>("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [library, setLibrary] = useState<AttachmentTemplate[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [draftHostModelId, setDraftHostModelId] = useState("");
  const [draftGuestModelId, setDraftGuestModelId] = useState("");
  const [draftHostBoneIndex, setDraftHostBoneIndex] = useState(0);
  const [draftGuestBoneIndex, setDraftGuestBoneIndex] = useState(0);
  const [draftBindInstanceId, setDraftBindInstanceId] = useState("");
  const [draftBindModelId, setDraftBindModelId] = useState("");
  const [draftBindRole, setDraftBindRole] = useState<ModelBindingRole>("body");
  const idPrefix = useId().replace(/:/g, "");

  const refreshLibrary = useCallback(async () => {
    setLibraryBusy(true);
    try {
      const loaded = await loadAttachmentTemplateLibrary();
      setLibrary(loaded.templates);
    } catch (error) {
      toast.error("Failed to load attachment templates", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLibraryBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshLibrary();
    const first = p.previewInstances[0];
    const second = p.previewInstances[1] ?? first;
    setDraftBindInstanceId((prev) => prev || first?.id || "");
    setDraftHostModelId((prev) => prev || bindings[0]?.modelId || "");
    setDraftGuestModelId((prev) => prev || bindings[1]?.modelId || bindings[0]?.modelId || "");
    if (!draftBindModelId && first) {
      // leave empty until user types model id
    }
    void second;
  }, [open, p.previewInstances, bindings, draftBindModelId]);

  const instanceByModelId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [instanceId, modelId] of p.modelIdByInstanceId.entries()) {
      map.set(modelId, instanceId);
    }
    return map;
  }, [p.modelIdByInstanceId]);

  const boneNamesByInstanceId = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    for (const inst of p.previewInstances) {
      const names = boneNamesFromInstance(inst.bundle.skel);
      if (names) map.set(inst.id, names);
    }
    return map;
  }, [p.previewInstances]);

  const hostInstanceId = draftHostModelId ? instanceByModelId.get(normalizeSafe(draftHostModelId)) : undefined;
  const guestInstanceId = draftGuestModelId
    ? instanceByModelId.get(normalizeSafe(draftGuestModelId))
    : undefined;
  const hostBones = hostInstanceId ? (boneNamesByInstanceId.get(hostInstanceId) ?? null) : null;
  const guestBones = guestInstanceId ? (boneNamesByInstanceId.get(guestInstanceId) ?? null) : null;

  useEffect(() => {
    if (!hostBones?.length) return;
    setDraftHostBoneIndex((prev) => {
      if (prev >= 0 && prev < hostBones.length) return prev;
      return preferBoneIndex(hostBones);
    });
  }, [hostBones]);

  useEffect(() => {
    if (!guestBones?.length) return;
    setDraftGuestBoneIndex((prev) => {
      if (prev >= 0 && prev < guestBones.length) return prev;
      return preferBoneIndex(guestBones, "GBL_RT");
    });
  }, [guestBones]);

  const canAddBinding =
    Boolean(draftBindInstanceId) &&
    draftBindModelId.trim().length > 0 &&
    p.previewInstances.some((inst) => inst.id === draftBindInstanceId);

  const canAddEdge =
    Boolean(draftHostModelId) &&
    Boolean(draftGuestModelId) &&
    draftHostModelId !== draftGuestModelId &&
    Boolean(hostBones?.length) &&
    Boolean(guestBones?.length);

  const applyRuntimeAttachments = useCallback(() => {
    try {
      const template = buildAttachmentTemplate({
        name: templateName.trim() || "runtime",
        description: templateDescription,
        bindings,
        edges,
        primaryModelId: primaryModelId.trim() || null,
      });
      const resolved = resolveAttachmentTemplate({
        template,
        instanceByModelId,
        boneNamesByInstanceId,
      });
      if (resolved.errors.length > 0) {
        throw new Error(resolved.errors.join("; "));
      }
      p.setModelAttachments(
        resolved.attachments.map((attachment) => ({
          id: attachment.id,
          parentInstanceId: attachment.parentInstanceId,
          parentBoneName: attachment.parentBoneName,
          childInstanceId: attachment.childInstanceId,
          childBoneName: attachment.childBoneName,
        })),
      );
      if (resolved.primaryInstanceId) {
        p.setActivePreviewInstanceId(resolved.primaryInstanceId);
      }
      for (const warning of resolved.warnings) {
        toast.message("Attachment warning", { description: warning });
      }
      toast.success("Attachments applied", {
        description: `${resolved.attachments.length} edge(s) active`,
      });
    } catch (error) {
      toast.error("Apply attachments failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    bindings,
    edges,
    instanceByModelId,
    boneNamesByInstanceId,
    p,
    primaryModelId,
    templateDescription,
    templateName,
  ]);

  const handleSaveTemplate = useCallback(async () => {
    try {
      const template = buildAttachmentTemplate({
        name: templateName,
        description: templateDescription,
        bindings,
        edges,
        primaryModelId: primaryModelId.trim() || null,
      });
      const next = await upsertAttachmentTemplate(template);
      setLibrary(next.templates);
      toast.success("Attachment template saved", { description: template.name });
    } catch (error) {
      toast.error("Save template failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [bindings, edges, primaryModelId, templateDescription, templateName]);

  const handleApplyTemplate = useCallback(
    async (template: AttachmentTemplate) => {
      setBindings(template.bindings.map((b) => ({ ...b })));
      setEdges(template.edges.map((e) => ({ ...e })));
      setPrimaryModelId(template.primaryModelId ?? "");
      setTemplateName(template.name);
      setTemplateDescription(template.description);

      // Ensure runtime modelId tags match bindings for already-loaded path refs.
      for (const binding of template.bindings) {
        const ref = binding.ref;
        if (ref.kind === "numdlbPath") {
          const pathKey = ref.path.replace(/\//g, "\\").toLowerCase();
          const inst = p.previewInstances.find(
            (item) => item.modlPath.replace(/\//g, "\\").toLowerCase() === pathKey,
          );
          if (inst) {
            p.setInstanceModelId(inst.id, binding.modelId);
          }
        } else if (ref.kind === "unitModelLabel") {
          const labelKey = ref.label.trim().toLowerCase();
          const inst = p.previewInstances.find(
            (item) => item.displayLabel.trim().toLowerCase() === labelKey,
          );
          if (inst) {
            p.setInstanceModelId(inst.id, binding.modelId);
          }
        } else {
          const inst = p.previewInstances[ref.slot];
          if (inst) {
            p.setInstanceModelId(inst.id, binding.modelId);
          }
        }
      }

      // Rebuild instance map after tagging (read from next state via binding refs).
      const nextMap = new Map<string, string>();
      for (const binding of template.bindings) {
        const ref = binding.ref;
        let instanceId: string | undefined;
        if (ref.kind === "numdlbPath") {
          const pathKey = ref.path.replace(/\//g, "\\").toLowerCase();
          instanceId = p.previewInstances.find(
            (item) => item.modlPath.replace(/\//g, "\\").toLowerCase() === pathKey,
          )?.id;
        } else if (ref.kind === "unitModelLabel") {
          const labelKey = ref.label.trim().toLowerCase();
          instanceId = p.previewInstances.find(
            (item) => item.displayLabel.trim().toLowerCase() === labelKey,
          )?.id;
        } else {
          instanceId = p.previewInstances[ref.slot]?.id;
        }
        if (instanceId) nextMap.set(binding.modelId, instanceId);
      }

      const resolved = resolveAttachmentTemplate({
        template,
        instanceByModelId: nextMap,
        boneNamesByInstanceId,
      });
      if (resolved.errors.length > 0) {
        toast.error("Template applied with unresolved models", {
          description: resolved.errors.join("; "),
        });
        return;
      }
      p.setModelAttachments(
        resolved.attachments.map((attachment) => ({
          id: attachment.id,
          parentInstanceId: attachment.parentInstanceId,
          parentBoneName: attachment.parentBoneName,
          childInstanceId: attachment.childInstanceId,
          childBoneName: attachment.childBoneName,
        })),
      );
      if (resolved.primaryInstanceId) {
        p.setActivePreviewInstanceId(resolved.primaryInstanceId);
      }
      toast.success("Attachment template applied", {
        description: `${template.name} · ${resolved.attachments.length} edge(s)`,
      });
    },
    [boneNamesByInstanceId, p],
  );

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    try {
      const next = await deleteAttachmentTemplate(templateId);
      setLibrary(next.templates);
      toast.success("Template deleted");
    } catch (error) {
      toast.error("Delete failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Link2 className="mr-1 h-3.5 w-3.5" />
        Attachments
      </Button>

      {open ? (
        <AppRndModalShell
          titleId="model-attachment-title"
          title="Attachments & model IDs"
          subtitle="Bind modelId → model, attach guest bones to host bones, save/apply templates"
          headerIcon={<Link2 className="h-5 w-5 text-primary" />}
          dimensions={MODEL_ATTACHMENT_DIMENSIONS}
          storageKey="app.rnd-size.model-attachment"
          onClose={() => setOpen(false)}
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2 p-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={applyRuntimeAttachments}>
                <Check className="mr-1 h-3.5 w-3.5" />
                Apply to viewport
              </Button>
            </div>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground">
                Active viewport edges: {p.modelAttachments.length}. Motion keeps evaluating each
                skeleton; attachments snap guest roots after bone updates.
              </p>
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

            {/* Model bindings */}
            <section className="space-y-2 rounded-md border border-border/70 p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Model ID bindings
              </h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[10px]">Preview model</Label>
                  <Select value={draftBindInstanceId} onValueChange={setDraftBindInstanceId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {p.previewInstances.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.displayLabel}
                          {p.modelIdByInstanceId.get(inst.id)
                            ? ` · ${p.modelIdByInstanceId.get(inst.id)}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">modelId (8 hex)</Label>
                  <Input
                    className="h-8 font-mono text-[11px]"
                    value={draftBindModelId}
                    placeholder="43309cab"
                    onChange={(e) => setDraftBindModelId(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Role</Label>
                  <Select
                    value={draftBindRole}
                    onValueChange={(v) => setDraftBindRole(v as ModelBindingRole)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-full"
                    disabled={!canAddBinding}
                    onClick={() => {
                      try {
                        const modelId = normalizeModelId(draftBindModelId);
                        const inst = p.previewInstances.find((item) => item.id === draftBindInstanceId);
                        if (!inst) throw new Error("Preview model not found");
                        p.setInstanceModelId(inst.id, modelId);
                        setBindings((prev) => {
                          const without = prev.filter((b) => b.modelId !== modelId);
                          return [
                            ...without,
                            {
                              modelId,
                              ref: { kind: "numdlbPath", path: inst.modlPath },
                              role: draftBindRole,
                              displayName: inst.displayLabel,
                            },
                          ];
                        });
                        if (!primaryModelId) setPrimaryModelId(modelId);
                        if (!draftHostModelId) setDraftHostModelId(modelId);
                        else if (!draftGuestModelId) setDraftGuestModelId(modelId);
                        toast.success(`Bound ${inst.displayLabel} → ${modelId}`);
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : String(error));
                      }
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Bind
                  </Button>
                </div>
              </div>
              {bindings.length === 0 ? (
                <p className="text-muted-foreground">No bindings yet.</p>
              ) : (
                <ul className="space-y-1">
                  {bindings.map((binding) => (
                    <li
                      key={binding.modelId}
                      className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1 font-mono text-[11px]"
                    >
                      <span className="min-w-0 truncate">
                        {binding.modelId}
                        {binding.displayName ? ` · ${binding.displayName}` : ""}
                        {binding.role ? ` · ${binding.role}` : ""}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        aria-label={`Remove binding ${binding.modelId}`}
                        onClick={() => {
                          setBindings((prev) => prev.filter((b) => b.modelId !== binding.modelId));
                          const instanceId = instanceByModelId.get(binding.modelId);
                          if (instanceId) p.setInstanceModelId(instanceId, null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground">Motion primary modelId</Label>
                <Select value={primaryModelId || "__none__"} onValueChange={(v) => setPrimaryModelId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-7 w-[200px] text-[11px]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {bindings.map((b) => (
                      <SelectItem key={b.modelId} value={b.modelId}>
                        {b.modelId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* Edges */}
            <section className="space-y-2 rounded-md border border-border/70 p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Attachment edges (host bone → guest bone)
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px]">Host modelId</Label>
                  <Select value={draftHostModelId} onValueChange={setDraftHostModelId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Host" />
                    </SelectTrigger>
                    <SelectContent>
                      {bindings.map((b) => (
                        <SelectItem key={b.modelId} value={b.modelId}>
                          {b.modelId}
                          {b.displayName ? ` · ${b.displayName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <BoneIndexSearchSelect
                    value={draftHostBoneIndex}
                    onChange={setDraftHostBoneIndex}
                    boneNames={hostBones ? [...hostBones] : null}
                    disabled={!hostBones?.length}
                    instanceId={`${idPrefix}-host`}
                    ariaLabel="Select host bone"
                  />
                  {!hostBones?.length && draftHostModelId ? (
                    <p className="text-[10px] text-destructive">
                      Host model not loaded or missing NUSKTB.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px]">Guest modelId</Label>
                  <Select value={draftGuestModelId} onValueChange={setDraftGuestModelId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Guest" />
                    </SelectTrigger>
                    <SelectContent>
                      {bindings.map((b) => (
                        <SelectItem key={b.modelId} value={b.modelId}>
                          {b.modelId}
                          {b.displayName ? ` · ${b.displayName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <BoneIndexSearchSelect
                    value={draftGuestBoneIndex}
                    onChange={setDraftGuestBoneIndex}
                    boneNames={guestBones ? [...guestBones] : null}
                    disabled={!guestBones?.length}
                    instanceId={`${idPrefix}-guest`}
                    ariaLabel="Select guest bone"
                  />
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-7"
                disabled={!canAddEdge}
                onClick={() => {
                  if (!hostBones?.length || !guestBones?.length) return;
                  const hostBoneName = hostBones[draftHostBoneIndex];
                  const guestBoneName = guestBones[draftGuestBoneIndex];
                  if (!hostBoneName || !guestBoneName) return;
                  try {
                    const hostModelId = normalizeModelId(draftHostModelId);
                    const guestModelId = normalizeModelId(draftGuestModelId);
                    if (hostModelId === guestModelId) {
                      throw new Error("Host and guest must differ");
                    }
                    setEdges((prev) => [
                      ...prev,
                      {
                        id: createAttachmentEdgeId(),
                        hostModelId,
                        hostBoneName,
                        guestModelId,
                        guestBoneName,
                        enabled: true,
                      },
                    ]);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : String(error));
                  }
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add edge
              </Button>
              {edges.length === 0 ? (
                <p className="text-muted-foreground">No edges yet.</p>
              ) : (
                <ul className="space-y-1">
                  {edges.map((edge) => (
                    <li
                      key={edge.id}
                      className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1 text-[11px]"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Checkbox
                          checked={edge.enabled}
                          onCheckedChange={(checked) => {
                            setEdges((prev) =>
                              prev.map((item) =>
                                item.id === edge.id ? { ...item, enabled: checked === true } : item,
                              ),
                            );
                          }}
                          aria-label="Enable edge"
                        />
                        <span className="min-w-0 truncate font-mono">
                          {edge.hostModelId}.{edge.hostBoneName} → {edge.guestModelId}.
                          {edge.guestBoneName}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        aria-label="Remove edge"
                        onClick={() => setEdges((prev) => prev.filter((item) => item.id !== edge.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Template library */}
            <section className="space-y-2 rounded-md border border-border/70 p-3">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <LayoutTemplate className="h-3.5 w-3.5" />
                Template library
              </h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="space-y-1 md:col-span-1">
                  <Label className="text-[10px]">Name</Label>
                  <Input
                    className="h-8 text-xs"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Gyan body+shield"
                  />
                </div>
                <div className="space-y-1 md:col-span-1">
                  <Label className="text-[10px]">Description</Label>
                  <Input
                    className="h-8 text-xs"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-full"
                    disabled={!templateName.trim() || libraryBusy}
                    onClick={() => void handleSaveTemplate()}
                  >
                    <Save className="mr-1 h-3.5 w-3.5" />
                    Save template
                  </Button>
                </div>
              </div>
              {library.length === 0 ? (
                <p className="text-muted-foreground">
                  {libraryBusy ? "Loading templates…" : "No saved templates."}
                </p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {library.map((template) => (
                    <li
                      key={template.id}
                      className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{template.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {template.bindings.length} model(s) · {template.edges.length} edge(s)
                          {template.description ? ` · ${template.description}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[10px]"
                          onClick={() => void handleApplyTemplate(template)}
                        >
                          Apply
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`Delete ${template.name}`}
                          onClick={() => void handleDeleteTemplate(template.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}

function normalizeSafe(raw: string): ModelId {
  try {
    return normalizeModelId(raw);
  } catch {
    return raw.trim().toLowerCase();
  }
}
