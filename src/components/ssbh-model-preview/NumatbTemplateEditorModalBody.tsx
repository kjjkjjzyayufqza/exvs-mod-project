import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { open } from "@tauri-apps/plugin-dialog";
import { Boxes, Copy, FileInput, Loader2, Plus, RotateCw, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NumatbProfileKind, NumatbTemplateDefinition, NumatbTemplateLibrary } from "./daeSsbhTypes";
import { NumatbMaterialEntryEditor } from "./components/NumatbMaterialEntryEditor";
import { ssbhTemplateReadNumatb } from "./ssbhDaeIoService";
import {
  applyAddProfileAttribute,
  applyAddProfileMaterialEntry,
  applyRemoveProfileAttribute,
  applyRemoveProfileMaterialEntry,
  applySetProfileFile,
  applyTemplateToBundle,
  applyUpdateProfileAttribute,
  applyUpdateProfileMaterialLabel,
  applyUpdateProfileShaderLabel,
  type NumatbModalBundle,
} from "./numatbEditorUtils";
import { cloneProfile } from "./store/numatbTemplateStoreHelpers";
import {
  deleteNumatbTemplate,
  loadNumatbTemplateLibrary,
  upsertNumatbTemplate,
} from "./store/daeSsbhTemplateLibrary";

type NumatbTemplateEditorModalBodyProps = {
  bundle: NumatbModalBundle;
  onChange: (next: NumatbModalBundle) => void;
  disabled?: boolean;
  /** Which profile tab shows the file loaded from disk (Maya vs Nust). */
  defaultActiveProfile?: NumatbProfileKind;
  /** Copies Maya/Nust profile JSON for AI troubleshooting. */
  onCopyProfilesJson?: () => void | Promise<void>;
};

export function NumatbTemplateEditorModalBody({
  bundle,
  onChange,
  disabled,
  defaultActiveProfile,
  onCopyProfilesJson,
}: NumatbTemplateEditorModalBodyProps) {
  const materialListScrollRef = useRef<HTMLDivElement>(null);
  const [activeProfile, setActiveProfile] = useState<NumatbProfileKind>(() => defaultActiveProfile ?? "maya");
  const [selectedMaterialByProfile, setSelectedMaterialByProfile] = useState<Record<NumatbProfileKind, number>>({
    maya: 0,
    nust: 0,
  });
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [newMaterialLabel, setNewMaterialLabel] = useState("");
  const [materialQuery, setMaterialQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateLibrary, setTemplateLibrary] = useState<NumatbTemplateLibrary>({ version: 1, templates: [] });
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const loadTemplateLibrary = async () => {
    setTemplatesLoading(true);
    try {
      const lib = await loadNumatbTemplateLibrary();
      setTemplateLibrary(lib);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setTemplatesLoading(true);
    void loadNumatbTemplateLibrary()
      .then((lib) => {
        if (!cancelled) setTemplateLibrary(lib);
      })
      .catch((error) => {
        if (!cancelled) toast.error(String(error));
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (defaultActiveProfile !== undefined) {
      setActiveProfile(defaultActiveProfile);
    }
  }, [defaultActiveProfile]);

  const mayaFile = bundle.mayaFile;
  const nustFile = bundle.nustFile;
  const mirrorTexturePathsAcrossProfiles = bundle.mirrorTexturePathsAcrossProfiles;

  const activeFile = activeProfile === "maya" ? mayaFile : nustFile;
  const entries = activeFile.entries;
  const selectedMaterialIndex = Math.min(selectedMaterialByProfile[activeProfile] ?? 0, Math.max(entries.length - 1, 0));
  const selectedEntry = entries[selectedMaterialIndex] ?? null;

  // Keep the original index alongside each entry so selection/removal stay correct while filtering.
  const filteredMaterials = useMemo(() => {
    const indexed = entries.map((entry, index) => ({ entry, index }));
    const query = materialQuery.trim().toLowerCase();
    if (!query) return indexed;
    return indexed.filter(
      ({ entry }) =>
        (entry.material_label || "").toLowerCase().includes(query) ||
        (entry.shader_label || "").toLowerCase().includes(query),
    );
  }, [entries, materialQuery]);

  const materialRowVirtualizer = useVirtualizer({
    count: filteredMaterials.length,
    getScrollElement: () => materialListScrollRef.current,
    estimateSize: () => 52,
    overscan: 8,
  });

  const handleAddMaterial = () => {
    const label = newMaterialLabel.trim();
    if (disabled || !label) return;
    onChange(applyAddProfileMaterialEntry(bundle, activeProfile, label));
    setSelectedMaterialByProfile((current) => ({
      ...current,
      [activeProfile]: entries.length,
    }));
    setNewMaterialLabel("");
    setMaterialQuery("");
  };

  const selectedTemplate = useMemo(
    () => templateLibrary.templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templateLibrary.templates],
  );

  const handleImportProfile = async (profile: NumatbProfileKind) => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "numatb", extensions: ["numatb"] }],
      title: `Import ${profile} profile from .numatb`,
    });
    if (typeof selected !== "string" || !selected.trim()) {
      return;
    }
    try {
      const file = await ssbhTemplateReadNumatb(selected.trim());
      onChange(applySetProfileFile(bundle, profile, file));
      toast.success(`Imported ${profile} profile`);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const setMirror = (value: boolean) => {
    onChange({ ...bundle, mirrorTexturePathsAcrossProfiles: value });
  };

  const createTemplateFromBundle = (
    payload: { name: string; description: string; sourceFileName?: string | null },
  ): NumatbTemplateDefinition => {
    return {
      id: crypto.randomUUID(),
      name: payload.name.trim(),
      description: payload.description.trim(),
      sourceFileName: payload.sourceFileName?.trim() || null,
      updatedAt: new Date().toISOString(),
      mayaFile: cloneProfile(bundle.mayaFile),
      nustFile: cloneProfile(bundle.nustFile),
    };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Template</Label>
          <div className="relative">
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 pr-8 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled || templatesLoading}
              value={selectedTemplateId ?? ""}
              onChange={(event) => {
                const nextId = event.target.value;
                if (!nextId) return;
                const template = templateLibrary.templates.find((item) => item.id === nextId);
                if (!template) return;
                onChange(applyTemplateToBundle(bundle, template.mayaFile, template.nustFile));
                setSelectedTemplateId(nextId);
              }}
            >
              <option value="">{templatesLoading ? "Loading templates…" : "Select template"}</option>
              {templateLibrary.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {templatesLoading ? (
              <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px] uppercase tracking-wide"
          disabled={disabled || templatesLoading}
          onClick={() => void loadTemplateLibrary()}
        >
          {templatesLoading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="mr-1 h-3.5 w-3.5" />
          )}
          {templatesLoading ? "Loading" : "Reload"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px] uppercase tracking-wide"
          disabled={disabled}
          onClick={() => void handleImportProfile(activeProfile)}
        >
          <FileInput className="mr-1 h-3.5 w-3.5" />
          Import {activeProfile}
        </Button>
        {onCopyProfilesJson ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-[10px] uppercase tracking-wide"
            disabled={disabled}
            title="Copy full NUMATB profile data as JSON (for AI analysis)"
            aria-label="Copy NUMATB profiles as JSON"
            onClick={() => void onCopyProfilesJson()}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            Copy JSON
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px] uppercase tracking-wide text-destructive"
          disabled={disabled || !selectedTemplate}
          onClick={() => {
            if (!selectedTemplate) return;
            void deleteNumatbTemplate(selectedTemplate.id)
              .then((lib) => {
                setTemplateLibrary(lib);
                setSelectedTemplateId(null);
                toast.success(`Deleted template "${selectedTemplate.name}"`);
              })
              .catch((error) => {
                toast.error(String(error));
              });
          }}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Template name</Label>
          <Input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="h-8 text-[11px]"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Description</Label>
          <Input
            value={templateDescription}
            onChange={(event) => setTemplateDescription(event.target.value)}
            className="h-8 text-[11px]"
            disabled={disabled}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 self-end text-[10px] uppercase tracking-wide"
          disabled={disabled || !templateName.trim()}
          onClick={() => {
            const created = createTemplateFromBundle({ name: templateName, description: templateDescription });
            void upsertNumatbTemplate(created)
              .then((lib) => {
                setTemplateLibrary(lib);
                setSelectedTemplateId(created.id);
                setTemplateName("");
                setTemplateDescription("");
                toast.success("Saved template");
              })
              .catch((error) => {
                toast.error(String(error));
              });
          }}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          Save Template
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeProfile} onValueChange={(value) => setActiveProfile(value as NumatbProfileKind)}>
          <TabsList className="h-8">
            <TabsTrigger value="maya" className="text-[11px]" disabled={disabled}>
              Maya Profile
            </TabsTrigger>
            <TabsTrigger value="nust" className="text-[11px]" disabled={disabled}>
              Nust Profile
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:max-w-md">
          <Checkbox
            checked={mirrorTexturePathsAcrossProfiles}
            onCheckedChange={(checked) => setMirror(checked === true)}
            className="mt-0.5"
            disabled={disabled}
          />
          <span className="space-y-0.5">
            <span className="block text-[11px] font-medium leading-tight">Mirror texture paths (Maya ↔ Nust)</span>
            <span className="block text-[10px] leading-snug text-muted-foreground">
              When enabled, editing a map path on one profile updates the same material label + param on the other (EXVS-relative paths usually match).
            </span>
          </span>
        </label>
      </div>

      <div className="grid min-h-[360px] items-start gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border bg-card/95 p-3 shadow-sm xl:sticky xl:top-0 xl:self-start xl:max-h-[calc(100dvh-7rem)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Boxes className="h-3.5 w-3.5" />
                Add material entry
              </Label>
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {entries.length}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                value={newMaterialLabel}
                onChange={(event) => setNewMaterialLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddMaterial();
                  }
                }}
                className="h-8 text-[11px]"
                placeholder="Material label"
                disabled={disabled}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-[10px] uppercase tracking-wide"
                disabled={disabled || !newMaterialLabel.trim()}
                onClick={handleAddMaterial}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={materialQuery}
              onChange={(event) => setMaterialQuery(event.target.value)}
              className="h-8 pl-8 text-[11px]"
              placeholder="Filter materials"
              disabled={disabled}
            />
          </div>

          <div className="min-h-[200px] flex-1 overflow-hidden rounded-md border bg-background/40">
            <div ref={materialListScrollRef} className="h-full overflow-auto">
              {filteredMaterials.length === 0 ? (
                <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
                  {entries.length === 0
                    ? "No material entries in this profile."
                    : `No materials match "${materialQuery.trim()}".`}
                </div>
              ) : (
                <div style={{ height: `${materialRowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                  {materialRowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const item = filteredMaterials[virtualRow.index];
                    if (!item) return null;
                    const { entry, index } = item;
                    const isActive = selectedMaterialIndex === index;
                    return (
                      <button
                        key={`${activeProfile}:${index}`}
                        type="button"
                        className={cn(
                          "absolute left-0 top-0 flex w-full flex-col items-start justify-center gap-0.5 border-b px-3 text-left transition-colors",
                          isActive
                            ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/30"
                            : "hover:bg-muted/50",
                        )}
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        disabled={disabled}
                        onClick={() =>
                          setSelectedMaterialByProfile((current) => ({
                            ...current,
                            [activeProfile]: index,
                          }))
                        }
                      >
                        <span className="w-full truncate font-mono text-[11px]">
                          {entry.material_label || `Material ${index + 1}`}
                        </span>
                        <span className="w-full truncate text-[10px] text-muted-foreground">
                          {entry.shader_label || "(empty shader)"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full text-[10px] uppercase tracking-wide text-destructive"
            disabled={disabled || !selectedEntry}
            onClick={() => {
              if (!selectedEntry) return;
              onChange(applyRemoveProfileMaterialEntry(bundle, activeProfile, selectedMaterialIndex));
              setSelectedMaterialByProfile((current) => ({
                ...current,
                [activeProfile]: Math.max(0, selectedMaterialIndex - 1),
              }));
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Remove Selected Material
          </Button>
        </div>

        <div className="min-w-0 rounded-md border p-3">
          <NumatbMaterialEntryEditor
            entry={selectedEntry}
            onChangeMaterialLabel={(nextLabel) =>
              onChange(applyUpdateProfileMaterialLabel(bundle, activeProfile, selectedMaterialIndex, nextLabel))
            }
            onChangeShaderLabel={(nextShaderLabel) =>
              onChange(applyUpdateProfileShaderLabel(bundle, activeProfile, selectedMaterialIndex, nextShaderLabel))
            }
            onUpdateAttribute={(attributeIndex, data) =>
              onChange(applyUpdateProfileAttribute(bundle, activeProfile, selectedMaterialIndex, attributeIndex, data))
            }
            onAddAttribute={(paramId, kind) =>
              onChange(applyAddProfileAttribute(bundle, activeProfile, selectedMaterialIndex, paramId, kind))
            }
            onRemoveAttribute={(attributeIndex) =>
              onChange(applyRemoveProfileAttribute(bundle, activeProfile, selectedMaterialIndex, attributeIndex))
            }
          />
        </div>
      </div>
    </div>
  );
}
