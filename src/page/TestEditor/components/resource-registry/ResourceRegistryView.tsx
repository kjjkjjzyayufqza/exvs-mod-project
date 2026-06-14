import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Database,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useResourceRegistry, type RegistryViewSource } from "@/hooks/useResourceRegistry";
import {
  buildRegistryEntryFromSeed,
  type MergedRegistryEntry,
  type ResourceRegistryCategory,
  type ResourceRegistryEntry,
} from "@/services/resourceRegistry/types";
import { importCustomUnitRows, mergeImportedEntries } from "@/services/resourceRegistry/importCustomUnit";
import { crc32Ieee } from "@/utils/crc32Ieee";
import { ResourceRegistryDataTable } from "@/page/ResourceRegistry/components/ResourceRegistryDataTable";

interface ResourceRegistryViewProps {
  folderPath: string;
  showTitle?: boolean;
}

const CATEGORIES: ResourceRegistryCategory[] = ["stage", "unit", "prop", "custom"];
const REGISTRY_EDITOR_MODAL_DIMENSIONS = {
  width: 560,
  height: 620,
  minWidth: 480,
  minHeight: 480,
};

export function ResourceRegistryView({ folderPath, showTitle = true }: ResourceRegistryViewProps) {
  const registry = useResourceRegistry(folderPath || null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [slotFilter, setSlotFilter] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRegistryEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formCategory, setFormCategory] = useState<ResourceRegistryCategory>("stage");
  const [formSlot, setFormSlot] = useState("fileName");
  const [formSeed, setFormSeed] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTarget, setFormTarget] = useState<"workspace" | "global">("workspace");

  const formPreview = useMemo(() => {
    const trimmed = formSeed.trim();
    if (!trimmed) return null;
    return crc32Ieee(trimmed);
  }, [formSeed]);

  const visibleEntries = useMemo(() => {
    let rows = registry.mergedEntries;
    if (registry.viewSource === "global") {
      rows = rows.filter((row) => row.sourceLayer === "global");
    } else if (registry.viewSource === "workspace") {
      rows = rows.filter((row) => row.sourceLayer === "workspace");
    }
    if (categoryFilter !== "all") {
      rows = rows.filter((row) => row.category === categoryFilter);
    }
    if (slotFilter.trim()) {
      const q = slotFilter.trim().toLowerCase();
      rows = rows.filter((row) => row.slot.toLowerCase().includes(q));
    }
    if (deferredSearch) {
      rows = rows.filter((row) => {
        const hay = [
          row.seed,
          row.hashHex,
          String(row.hashInt32),
          row.displayName ?? "",
          row.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(deferredSearch);
      });
    }
    return rows;
  }, [registry.mergedEntries, registry.viewSource, categoryFilter, slotFilter, deferredSearch]);

  const conflictCount = registry.validationIssues.filter((i) => i.code === "duplicate_hash").length;

  const openCreate = () => {
    setEditing(null);
    setFormCategory("stage");
    setFormSlot("fileName");
    setFormSeed("");
    setFormDisplayName("");
    setFormNotes("");
    setFormTarget(folderPath ? "workspace" : "global");
    setEditorOpen(true);
  };

  const openEdit = (entry: MergedRegistryEntry) => {
    setEditing(entry);
    setFormCategory(entry.category);
    setFormSlot(entry.slot);
    setFormSeed(entry.seed);
    setFormDisplayName(entry.displayName ?? "");
    setFormNotes(entry.notes ?? "");
    setFormTarget(entry.sourceLayer === "global" ? "global" : "workspace");
    setEditorOpen(true);
  };

  const copyText = async (value: string, label: string) => {
    await writeText(value);
    toast.success(`${label} copied`);
  };

  const handleSaveEntry = async () => {
    const trimmed = formSeed.trim();
    if (!trimmed) {
      toast.error("Seed is required");
      return;
    }
    const entry = buildRegistryEntryFromSeed({
      id: editing?.id,
      category: formCategory,
      slot: formSlot.trim(),
      seed: trimmed,
      displayName: formDisplayName,
      notes: formNotes,
      createdAt: editing?.createdAt,
    });

    if (formTarget === "workspace") {
      if (!folderPath) {
        toast.error("Select a workspace folder first");
        return;
      }
      await registry.updateWorkspaceEntry(entry);
    } else {
      const result = await registry.registerGlobal({
        category: entry.category,
        slot: entry.slot,
        seed: entry.seed,
        displayName: entry.displayName,
        notes: entry.notes,
      });
      if (!result.ok) {
        toast.error(result.reason === "duplicate_hash" ? "Duplicate hash in global registry" : "Failed to save");
        return;
      }
    }
    setEditorOpen(false);
    toast.success(editing ? "Entry updated" : "Entry created");
  };

  const handleExport = useCallback(async () => {
    const path = await open({
      title: "Export resource registry",
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: "resource_registry.json",
    });
    if (!path || typeof path !== "string") return;
    const payload =
      registry.viewSource === "workspace"
        ? registry.workspaceDoc
        : registry.viewSource === "global"
          ? registry.globalDoc
          : { version: 1 as const, entries: registry.mergedEntries.map(({ sourceLayer: _s, ...e }) => e) };
    await writeTextFile(path, JSON.stringify(payload, null, 2));
    toast.success("Registry exported");
  }, [registry]);

  const handleImportJson = useCallback(async () => {
    const path = await open({
      title: "Import resource registry JSON",
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!path || typeof path !== "string") return;
    if (!folderPath) {
      toast.error("Select a workspace folder first");
      return;
    }
    try {
      const raw = await readTextFile(path);
      const parsed = JSON.parse(raw) as { entries?: ResourceRegistryEntry[] };
      if (!Array.isArray(parsed.entries)) {
        throw new Error("Invalid registry JSON");
      }
      await registry.importWorkspaceEntries(parsed.entries);
      toast.success(`Imported ${parsed.entries.length} entries into workspace registry`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  }, [folderPath, registry]);

  const handleImportCustomUnit = useCallback(async () => {
    const path = await open({
      title: "Import custom_unit.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!path || typeof path !== "string") return;
    if (!folderPath) {
      toast.error("Select a workspace folder first");
      return;
    }
    try {
      const raw = await readTextFile(path);
      const rows = JSON.parse(raw) as unknown[];
      if (!Array.isArray(rows)) throw new Error("custom_unit.json must be an array");
      const { entries, warnings } = importCustomUnitRows(rows as never[]);
      const next = mergeImportedEntries(registry.workspaceDoc, entries);
      await registry.replaceWorkspaceDoc(next);
      if (warnings.length > 0) {
        toast.warning(`Imported ${entries.length} entries with ${warnings.length} hash warnings`);
      } else {
        toast.success(`Imported ${entries.length} unit entries from custom_unit.json`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  }, [folderPath, registry]);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0 p-1">
      <Card className="shrink-0">
        <CardHeader className="py-3 px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {showTitle ? (
                <CardTitle className="text-base">Resource Registry</CardTitle>
              ) : null}
              <p className={cn("text-xs text-muted-foreground max-w-3xl", showTitle && "mt-1")}>
                Name to CRC32 mappings for stage and unit assets. Workspace entries override global
                defaults. Resource path CRC32 only, not param field-key hashes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void registry.reload()} disabled={registry.loading}>
                {registry.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleImportJson()}>
                <Upload className="h-4 w-4 mr-1" />
                Import JSON
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleImportCustomUnit()}>
                <Upload className="h-4 w-4 mr-1" />
                Import custom_unit
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleExport()}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px] space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="seed, hash, display name..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Select
                value={registry.viewSource}
                onValueChange={(v) => registry.setViewSource(v as RegistryViewSource)}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merged">Merged</SelectItem>
                  <SelectItem value="workspace">Workspace</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Slot filter</Label>
              <Input
                value={slotFilter}
                onChange={(e) => setSlotFilter(e.target.value)}
                placeholder="fileName, model..."
                className="h-8 w-[140px] text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{visibleEntries.length} shown</span>
            <span>{registry.mergedEntries.length} merged total</span>
            <span>{registry.workspaceDoc.entries.length} workspace</span>
            <span>{registry.globalDoc.entries.length} global</span>
            {conflictCount > 0 ? (
              <span className="text-destructive">{conflictCount} hash conflicts</span>
            ) : null}
            {!folderPath ? <span className="text-amber-600">No workspace folder selected</span> : null}
          </div>

          {registry.error ? (
            <p className="text-xs text-destructive">{registry.error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
          {visibleEntries.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground space-y-3">
              <p>No registry entries match your filters.</p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Create first entry
              </Button>
            </div>
          ) : (
            <ResourceRegistryDataTable
              rows={visibleEntries}
              actions={{
                onCopySeed: (seed) => void copyText(seed, "Seed"),
                onCopyHash: (hashHex) => void copyText(hashHex, "Hash"),
                onEdit: openEdit,
                onDelete: setDeleteId,
                onPromote: (id) => void registry.promoteToGlobal(id),
              }}
            />
          )}
        </CardContent>
      </Card>

      {editorOpen ? (
        <AppRndModalShell
          titleId="resource-registry-entry-editor-title"
          title={editing ? "Edit registry entry" : "New registry entry"}
          subtitle="Seed string is hashed with IEEE CRC32 to produce the int32 resource value."
          headerIcon={<Database className="h-5 w-5 text-primary" />}
          dimensions={REGISTRY_EDITOR_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.resource-registry-entry-editor"
          onClose={() => setEditorOpen(false)}
          footer={
            <div className="flex justify-end gap-2 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSaveEntry()}>Save</Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={formCategory} onValueChange={(v) => setFormCategory(v as ResourceRegistryCategory)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Slot</Label>
                  <Input
                    value={formSlot}
                    onChange={(e) => setFormSlot(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Seed</Label>
                <Input
                  value={formSeed}
                  onChange={(e) => setFormSeed(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
                {formPreview ? (
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {formPreview.hashHex} · int32 {formPreview.hashInt32}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Display name (optional)</Label>
                <Input
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="text-xs min-h-[72px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Save target</Label>
                <Select value={formTarget} onValueChange={(v) => setFormTarget(v as "workspace" | "global")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">Workspace registry</SelectItem>
                    <SelectItem value="global">Global registry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
          </div>
        </AppRndModalShell>
      ) : null}

      <AlertDialog open={deleteId != null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the mapping from the workspace registry file only. Global entries are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => {
                if (deleteId) void registry.deleteWorkspaceEntry(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
