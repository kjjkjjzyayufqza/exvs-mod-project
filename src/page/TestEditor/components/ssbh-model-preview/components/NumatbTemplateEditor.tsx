import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { open } from "@tauri-apps/plugin-dialog";
import { FileInput, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDaeSsbhSessionStore } from "../store/daeSsbhSessionStore";
import type { NumatbProfileKind } from "../daeSsbhTypes";
import { NumatbMaterialEntryEditor } from "./NumatbMaterialEntryEditor";
import { ssbhTemplateReadNumatb } from "../ssbhDaeIoService";

export function NumatbTemplateEditor() {
  const {
    mayaFile,
    nustFile,
    selectedTemplateId,
    templateLibrary,
    templatesLoading,
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
  const [newMaterialLabel, setNewMaterialLabel] = useState("");

  const activeFile = activeProfile === "maya" ? mayaFile : nustFile;
  const entries = activeFile.Matl.V16.entries;
  const selectedMaterialIndex = Math.min(selectedMaterialByProfile[activeProfile] ?? 0, Math.max(entries.length - 1, 0));
  const selectedEntry = entries[selectedMaterialIndex] ?? null;

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Template</Label>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]"
            value={selectedTemplateId ?? ""}
            onChange={(event) => {
              const nextId = event.target.value;
              if (!nextId) return;
              applyTemplateById(nextId);
            }}
          >
            <option value="">Select template</option>
            {templateLibrary.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] uppercase tracking-wide" onClick={() => void loadTemplateLibrary()}>
          {templatesLoading ? "Loading..." : "Reload"}
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
          className="h-8 text-[10px] uppercase tracking-wide text-destructive"
          disabled={!selectedTemplate}
          onClick={() => {
            if (!selectedTemplate) return;
            void deleteTemplateById(selectedTemplate.id).then(() => {
              toast.success(`Deleted template "${selectedTemplate.name}"`);
            }).catch((error) => {
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
          disabled={!templateName.trim()}
          onClick={() => {
            void saveCurrentAsTemplate({
              name: templateName,
              description: templateDescription,
            })
              .then(() => {
                toast.success(`Saved template "${templateName.trim()}"`);
                setTemplateName("");
                setTemplateDescription("");
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

      <div className="grid min-h-[460px] gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">Add material entry</Label>
            <div className="flex gap-2">
              <Input
                value={newMaterialLabel}
                onChange={(event) => setNewMaterialLabel(event.target.value)}
                className="h-8 text-[11px]"
                placeholder="Material label"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-[10px] uppercase tracking-wide"
                disabled={!newMaterialLabel.trim()}
                onClick={() => {
                  addProfileMaterialEntry(activeProfile, newMaterialLabel.trim());
                  setSelectedMaterialByProfile((current) => ({
                    ...current,
                    [activeProfile]: entries.length,
                  }));
                  setNewMaterialLabel("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <ScrollArea className="h-[360px]">
              <div className="divide-y">
                {entries.map((entry, index) => (
                  <button
                    key={`${activeProfile}:${entry.material_label}:${index}`}
                    type="button"
                    className={`flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition-colors ${
                      selectedMaterialIndex === index ? "bg-muted" : "hover:bg-muted/40"
                    }`}
                    onClick={() =>
                      setSelectedMaterialByProfile((current) => ({
                        ...current,
                        [activeProfile]: index,
                      }))
                    }
                  >
                    <span className="font-mono text-[11px]">{entry.material_label || `Material ${index + 1}`}</span>
                    <span className="text-[10px] text-muted-foreground">{entry.shader_label || "(empty shader)"}</span>
                  </button>
                ))}
                {entries.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">No material entries in this profile.</div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full text-[10px] uppercase tracking-wide text-destructive"
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

        <div className="rounded-md border p-3">
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
  );
}
