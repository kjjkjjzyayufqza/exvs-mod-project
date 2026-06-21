import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useVirtualizer } from "@tanstack/react-virtual";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Boxes, Check, FileInput, FileJson, Loader2, Plus, RotateCw, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDaeSsbhSessionStore } from "../store/daeSsbhSessionStore";
import type { NumatbProfileKind } from "../daeSsbhTypes";
import { NumatbMaterialEntryEditor } from "./NumatbMaterialEntryEditor";
import { ssbhTemplateReadNumatb } from "../ssbhDaeIoService";
import { parseNumatbProfilesJsonText } from "../copyNumatbProfilesJson";
import { SsbhEditorThemeScope, type SsbhEditorThemeVariant } from "./ssbhEditorTheme";

/** Estimated pixel height of a single material list row (label + shader). */
const MATERIAL_ROW_SIZE = 52;

interface NumatbTemplateEditorProps {
  themeVariant?: SsbhEditorThemeVariant;
}

export function NumatbTemplateEditor({ themeVariant = "default" }: NumatbTemplateEditorProps) {
  const {
    mayaFile,
    nustFile,
    selectedTemplateId,
    templateLibrary,
    templatesLoading,
    templateLibraryError,
    loadTemplateLibrary,
    applyTemplateById,
    saveCurrentAsTemplate,
    deleteTemplateById,
    setProfileFile,
    updateProfileMaterialLabel,
    updateProfileShaderLabel,
    updateProfileAttribute,
    addProfileAttribute,
    removeProfileAttribute,
    addProfileMaterialEntry,
    removeProfileMaterialEntry,
    mirrorTexturePathsAcrossProfiles,
    setMirrorTexturePathsAcrossProfiles,
  } = useDaeSsbhSessionStore(
    useShallow((state) => ({
      mayaFile: state.mayaFile,
      nustFile: state.nustFile,
      selectedTemplateId: state.selectedTemplateId,
      templateLibrary: state.templateLibrary,
      templatesLoading: state.templatesLoading,
      templateLibraryError: state.templateLibraryError,
      loadTemplateLibrary: state.loadTemplateLibrary,
      applyTemplateById: state.applyTemplateById,
      saveCurrentAsTemplate: state.saveCurrentAsTemplate,
      deleteTemplateById: state.deleteTemplateById,
      setProfileFile: state.setProfileFile,
      updateProfileMaterialLabel: state.updateProfileMaterialLabel,
      updateProfileShaderLabel: state.updateProfileShaderLabel,
      updateProfileAttribute: state.updateProfileAttribute,
      addProfileAttribute: state.addProfileAttribute,
      removeProfileAttribute: state.removeProfileAttribute,
      addProfileMaterialEntry: state.addProfileMaterialEntry,
      removeProfileMaterialEntry: state.removeProfileMaterialEntry,
      mirrorTexturePathsAcrossProfiles: state.mirrorTexturePathsAcrossProfiles,
      setMirrorTexturePathsAcrossProfiles: state.setMirrorTexturePathsAcrossProfiles,
    })),
  );

  const [activeProfile, setActiveProfile] = useState<NumatbProfileKind>("maya");
  const [selectedMaterialByProfile, setSelectedMaterialByProfile] = useState<Record<NumatbProfileKind, number>>({
    maya: 0,
    nust: 0,
  });
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateDeleting, setTemplateDeleting] = useState(false);
  const [newMaterialLabel, setNewMaterialLabel] = useState("");
  const [materialQuery, setMaterialQuery] = useState("");
  const materialListScrollRef = useRef<HTMLDivElement>(null);
  const templateActionBusy = templatesLoading || templateSaving || templateDeleting;

  useEffect(() => {
    void loadTemplateLibrary();
  }, [loadTemplateLibrary]);

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
    estimateSize: () => MATERIAL_ROW_SIZE,
    overscan: 8,
  });

  const handleAddMaterial = () => {
    const label = newMaterialLabel.trim();
    if (!label) return;
    addProfileMaterialEntry(activeProfile, label);
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
      setProfileFile(profile, file);
      toast.success(`Imported ${profile} profile`);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleImportProfilesJson = async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
      title: "Import Maya + Nust profiles from JSON",
    });
    if (typeof selected !== "string" || !selected.trim()) {
      return;
    }
    try {
      const raw = await readTextFile(selected.trim());
      const payload = parseNumatbProfilesJsonText(raw);
      setProfileFile("maya", payload.mayaProfile);
      setProfileFile("nust", payload.nustProfile);
      if (payload.mirrorTexturePathsAcrossProfiles !== undefined) {
        setMirrorTexturePathsAcrossProfiles(payload.mirrorTexturePathsAcrossProfiles);
      }
      setSelectedMaterialByProfile({ maya: 0, nust: 0 });
      setMaterialQuery("");
      toast.success(
        payload.modelName
          ? `Imported NUMATB profiles for "${payload.modelName}"`
          : "Imported NUMATB profiles from JSON",
      );
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = templateLibrary.templates.find((item) => item.id === templateId);
    if (!template) {
      toast.error("Template not found");
      return;
    }
    try {
      applyTemplateById(templateId);
      setSelectedMaterialByProfile({ maya: 0, nust: 0 });
      setMaterialQuery("");
      toast.success(`Applied template "${template.name}"`);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name || templateSaving) return;
    setTemplateSaving(true);
    try {
      await saveCurrentAsTemplate({
        name,
        description: templateDescription,
      });
      toast.success(`Saved template "${name}"`);
      setTemplateName("");
      setTemplateDescription("");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate || templateDeleting) return;
    setTemplateDeleting(true);
    try {
      await deleteTemplateById(selectedTemplate.id);
      toast.success(`Deleted template "${selectedTemplate.name}"`);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setTemplateDeleting(false);
    }
  };

  return (
    <SsbhEditorThemeScope variant={themeVariant}>
      <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Template</Label>
          <div className="relative">
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 pr-8 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
              value={selectedTemplateId ?? ""}
              disabled={templateActionBusy}
              onChange={(event) => {
                const nextId = event.target.value;
                if (!nextId) return;
                handleApplyTemplate(nextId);
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
          {templateLibraryError ? (
            <p className="text-[11px] leading-snug text-destructive">{templateLibraryError}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px] uppercase tracking-wide"
          disabled={templateActionBusy}
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
          disabled={templateActionBusy || !selectedTemplate}
          onClick={() => {
            if (!selectedTemplate) return;
            handleApplyTemplate(selectedTemplate.id);
          }}
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px] uppercase tracking-wide"
          onClick={() => void handleImportProfile(activeProfile)}
        >
          <FileInput className="mr-1 h-3.5 w-3.5" />
          Import {activeProfile}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px] uppercase tracking-wide"
          onClick={() => void handleImportProfilesJson()}
        >
          <FileJson className="mr-1 h-3.5 w-3.5" />
          Import JSON
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px] uppercase tracking-wide text-destructive"
          disabled={templateActionBusy || !selectedTemplate}
          onClick={() => void handleDeleteTemplate()}
        >
          {templateDeleting ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="mr-1 h-3.5 w-3.5" />
          )}
          {templateDeleting ? "Deleting" : "Delete"}
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Template name</Label>
          <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="h-8 text-[11px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Description</Label>
          <Input value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} className="h-8 text-[11px]" />
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 self-end text-[10px] uppercase tracking-wide"
          disabled={!templateName.trim() || templateSaving}
          onClick={() => void handleSaveTemplate()}
        >
          {templateSaving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1 h-3.5 w-3.5" />
          )}
          {templateSaving ? "Saving" : "Save Template"}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeProfile} onValueChange={(value) => setActiveProfile(value as NumatbProfileKind)}>
          <TabsList className="h-8">
            <TabsTrigger value="maya" className="text-[11px]">
              Maya Profile
            </TabsTrigger>
            <TabsTrigger value="nust" className="text-[11px]">
              Nust Profile
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:max-w-md">
          <Checkbox
            checked={mirrorTexturePathsAcrossProfiles}
            onCheckedChange={(checked) => setMirrorTexturePathsAcrossProfiles(checked === true)}
            className="mt-0.5"
          />
          <span className="space-y-0.5">
            <span className="block text-[11px] font-medium leading-tight">Mirror texture paths (Maya ↔ Nust)</span>
            <span className="block text-[10px] leading-snug text-muted-foreground">
              When enabled, editing a map path on one profile updates the same material label + param on the other (EXVS-relative paths usually match).
            </span>
          </span>
        </label>
      </div>

      <div className="grid min-h-[460px] items-start gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-md border bg-card/95 p-3 shadow-sm xl:sticky xl:top-3 xl:self-start xl:max-h-[calc(100dvh-7rem)]">
          <div className="shrink-0 space-y-2">
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
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-[10px] uppercase tracking-wide"
                disabled={!newMaterialLabel.trim()}
                onClick={handleAddMaterial}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>

          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={materialQuery}
              onChange={(event) => setMaterialQuery(event.target.value)}
              className="h-8 pl-8 text-[11px]"
              placeholder="Filter materials"
            />
          </div>

          <div
            ref={materialListScrollRef}
            className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-md border bg-background/40"
          >
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

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full shrink-0 text-[10px] uppercase tracking-wide text-destructive"
            disabled={!selectedEntry}
            onClick={() => {
              if (!selectedEntry) return;
              removeProfileMaterialEntry(activeProfile, selectedMaterialIndex);
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
            onChangeMaterialLabel={(nextLabel) => updateProfileMaterialLabel(activeProfile, selectedMaterialIndex, nextLabel)}
            onChangeShaderLabel={(nextShaderLabel) => updateProfileShaderLabel(activeProfile, selectedMaterialIndex, nextShaderLabel)}
            onUpdateAttribute={(attributeIndex, data) =>
              updateProfileAttribute(activeProfile, selectedMaterialIndex, attributeIndex, data)
            }
            onAddAttribute={(paramId, kind) => addProfileAttribute(activeProfile, selectedMaterialIndex, paramId, kind)}
            onRemoveAttribute={(attributeIndex) => removeProfileAttribute(activeProfile, selectedMaterialIndex, attributeIndex)}
          />
        </div>
      </div>
      </div>
    </SsbhEditorThemeScope>
  );
}
